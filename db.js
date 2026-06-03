// ═══════════════ FIRESTORE DATA LAYER ═══════════════
// Replaces the old RTDB `fbStorage`. All persistent data (games, users,
// usernames, friends, leaderboards, entitlements) lives in Cloud Firestore.
//
// Depends on globals: firebase (compat SDK), generateId(), getDateKey(),
// getDateSeed() — all defined in app.js / loaded before this file's use.

const fs = firebase.firestore();

// Firestore field-value helpers (compat namespace)
const FieldValue = firebase.firestore.FieldValue;
const serverTimestamp = () => FieldValue.serverTimestamp();

// ─── Date helpers used for leaderboard bucketing ───
function getMonthKey(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

// ─── Stable, order-independent id for a duo ───
function pairIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// ─── Scoring (single source of truth; mirrors old inline math) ───
// p1Score = how well p1 GUESSED p2's answers; p2Score = vice-versa.
function computeScores(game) {
  const p1 = game.p1 || {};
  const p2 = game.p2 || {};
  const p1Guesses = p1.guesses || [];
  const p1Answers = p1.answers || [];
  const p2Guesses = p2.guesses || [];
  const p2Answers = p2.answers || [];
  const p1Score = p1Guesses.reduce((s, g, i) => s + (g === p2Answers[i] ? 1 : 0), 0);
  const p2Score = p2Guesses.reduce((s, g, i) => s + (g === p1Answers[i] ? 1 : 0), 0);
  return { p1Score, p2Score, totalScore: p1Score + p2Score };
}

// ─── Game repository ───
const gameRepo = {
  // Create a new game (P1 has finished answering + guessing).
  // `player` = { uid|null, guestId|null, name, answers, guesses }
  async create(gameId, player, questions) {
    const now = new Date();
    const payload = {
      gameId,
      dateKey: getDateKey(),
      monthKey: getMonthKey(now),
      dateSeed: getDateSeed(),
      status: "awaiting_p2",
      questions,
      p1: {
        uid: player.uid || null,
        guestId: player.guestId || null,
        name: player.name || "",
        answers: player.answers || [],
        guesses: player.guesses || [],
      },
      p2: null,
      participantUids: player.uid ? [player.uid] : [],
      pairId: null,
      p1Score: null,
      p2Score: null,
      totalScore: null,
      createdAt: serverTimestamp(),
      completedAt: null,
    };
    try {
      await fs.collection("games").doc(gameId).set(payload);
      return true;
    } catch (e) {
      console.error("gameRepo.create error:", e);
      return false;
    }
  },

  // One-shot read of a game by id.
  async get(gameId) {
    try {
      const snap = await fs.collection("games").doc(gameId).get();
      return snap.exists ? snap.data() : null;
    } catch (e) {
      console.error("gameRepo.get error:", e);
      return null;
    }
  },

  // Live subscription. cb(gameData|null) fires on every change.
  // Returns an unsubscribe function (store on state._unsub).
  subscribe(gameId, cb) {
    try {
      return fs.collection("games").doc(gameId).onSnapshot(
        (snap) => cb(snap.exists ? snap.data() : null),
        (err) => { console.error("gameRepo.subscribe error:", err); cb(null); }
      );
    } catch (e) {
      console.error("gameRepo.subscribe error:", e);
      return () => {};
    }
  },

  // P2 finishes: fill p2, compute scores, mark complete, set pairId if both signed in.
  // Returns the merged game object (with scores) or null on failure.
  async completeP2(gameId, player) {
    try {
      const ref = fs.collection("games").doc(gameId);
      const merged = await fs.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const game = snap.data();

        const p2 = {
          uid: player.uid || null,
          guestId: player.guestId || null,
          name: player.name || "",
          answers: player.answers || [],
          guesses: player.guesses || [],
        };
        const full = { ...game, p2 };
        const { p1Score, p2Score, totalScore } = computeScores(full);

        const p1uid = game.p1 && game.p1.uid;
        const participantUids = [];
        if (p1uid) participantUids.push(p1uid);
        if (p2.uid && p2.uid !== p1uid) participantUids.push(p2.uid);

        // A real duo = two DIFFERENT signed-in users. Playing against
        // yourself does not create a pair/leaderboard entry.
        const bothSignedIn = !!(p1uid && p2.uid && p2.uid !== p1uid);
        const pairId = bothSignedIn ? pairIdFor(p1uid, p2.uid) : null;

        const update = {
          p2,
          p1Score,
          p2Score,
          totalScore,
          status: "complete",
          participantUids,
          pairId,
          completedAt: serverTimestamp(),
        };
        tx.update(ref, update);
        return { ...full, ...update };
      });

      // Leaderboard write happens after the game transaction commits
      // (kept separate so a leaderboard failure never blocks results).
      if (merged && merged.pairId) {
        await updateLeaderboard(merged).catch((e) =>
          console.error("updateLeaderboard error:", e)
        );
      }
      return merged;
    } catch (e) {
      console.error("gameRepo.completeP2 error:", e);
      return null;
    }
  },

  // Claim a guest side for a now-signed-in user. side = "p1" | "p2".
  // Only succeeds if that side's uid is null and guestId matches.
  async claimSide(gameId, side, uid, guestId) {
    try {
      const ref = fs.collection("games").doc(gameId);
      return await fs.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const game = snap.data();
        const p = game[side];
        if (!p || p.uid || p.guestId !== guestId) return false;

        const participantUids = Array.isArray(game.participantUids)
          ? game.participantUids.slice()
          : [];
        if (!participantUids.includes(uid)) participantUids.push(uid);

        const update = {
          [`${side}.uid`]: uid,
          participantUids,
        };

        // If both sides now have a uid, set pairId so leaderboards work.
        const otherSide = side === "p1" ? "p2" : "p1";
        const other = game[otherSide];
        if (other && other.uid && game.status === "complete") {
          update.pairId = pairIdFor(uid, other.uid);
        }
        tx.update(ref, update);
        return true;
      });
    } catch (e) {
      console.error("gameRepo.claimSide error:", e);
      return false;
    }
  },
};

// ─── Leaderboard write (per-pair best, all-time + monthly) ───
// Bumps allTime / months[monthKey] only when the new total beats the stored best.
async function updateLeaderboard(game) {
  if (!game.pairId) return;
  const ref = fs.collection("leaderboard").doc(game.pairId);
  const dateAchieved = game.dateKey;
  const monthKey = game.monthKey;
  const total = game.totalScore;

  await fs.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;

    const entry = { bestScore: total, dateAchieved, gameId: game.gameId };

    if (!existing) {
      tx.set(ref, {
        pairId: game.pairId,
        members: game.participantUids.slice().sort(),
        allTime: entry,
        months: { [monthKey]: entry },
      });
      return;
    }

    const update = {};
    if (!existing.allTime || total > existing.allTime.bestScore) {
      update.allTime = entry;
    }
    const monthBest = existing.months && existing.months[monthKey];
    if (!monthBest || total > monthBest.bestScore) {
      update[`months.${monthKey}`] = entry;
    }
    if (Object.keys(update).length) tx.update(ref, update);
  });
}
