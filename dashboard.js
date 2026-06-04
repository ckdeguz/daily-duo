// ═══════════════ DASHBOARD (game history + stats) ═══════════════
// Exposes window.dashRepo. Reads completed games the signed-in user played
// (participantUids array-contains uid), resolves opponents, and derives stats.
//
// Depends on db.js globals: fs.

const dashRepo = {
  // Completed games for this user, newest first. Returns normalized rows:
  //   { gameId, dateKey, monthKey, myScore, theirScore, totalScore,
  //     opponentUid, mySide }
  // (opponent profiles are resolved separately so we can batch them.)
  async myGames(myUid, max = 100) {
    try {
      const snap = await fs.collection("games")
        .where("participantUids", "array-contains", myUid)
        .orderBy("completedAt", "desc")
        .limit(max)
        .get();
      const rows = [];
      snap.docs.forEach((d) => {
        const g = d.data();
        if (g.status !== "complete") return;
        const p1 = g.p1 || {}, p2 = g.p2 || {};
        let mySide, myScore, theirScore, opponentUid;
        if (p1.uid === myUid) {
          mySide = "p1"; myScore = g.p1Score; theirScore = g.p2Score; opponentUid = p2.uid || null;
        } else if (p2.uid === myUid) {
          mySide = "p2"; myScore = g.p2Score; theirScore = g.p1Score; opponentUid = p1.uid || null;
        } else {
          return; // shouldn't happen given the query, but be safe
        }
        rows.push({
          gameId: g.gameId,
          dateKey: g.dateKey || "",
          monthKey: g.monthKey || "",
          myScore: myScore != null ? myScore : 0,
          theirScore: theirScore != null ? theirScore : 0,
          totalScore: g.totalScore != null ? g.totalScore : 0,
          opponentUid,
          mySide,
        });
      });
      return rows;
    } catch (e) {
      console.error("dashRepo.myGames error:", e);
      return [];
    }
  },

  // Batch-resolve a set of opponent uids to profiles. Returns a Map(uid -> profile).
  async resolveProfiles(uids) {
    const unique = Array.from(new Set(uids.filter(Boolean)));
    const map = new Map();
    await Promise.all(unique.map(async (uid) => {
      try {
        const us = await fs.collection("users").doc(uid).get();
        if (us.exists) {
          const u = us.data();
          map.set(uid, {
            uid,
            usernameDisplay: u.usernameDisplay || u.username || "(unknown)",
            photoURL: u.photoURL || "",
          });
        } else {
          map.set(uid, { uid, usernameDisplay: "(unknown)", photoURL: "" });
        }
      } catch (e) {
        map.set(uid, { uid, usernameDisplay: "(unknown)", photoURL: "" });
      }
    }));
    return map;
  },

  // Summary stats over the game rows.
  stats(rows) {
    const games = rows.length;
    if (!games) return { games: 0, avgTotal: 0, bestTotal: 0, friends: 0 };
    let sum = 0, best = 0;
    const opp = new Set();
    rows.forEach((r) => {
      sum += r.totalScore;
      if (r.totalScore > best) best = r.totalScore;
      if (r.opponentUid) opp.add(r.opponentUid);
    });
    return {
      games,
      avgTotal: Math.round((sum / games) * 10) / 10,
      bestTotal: best,
      friends: opp.size,
    };
  },

  // Group rows by opponent: { opponentUid, count, bestTotal, lastDate }.
  byFriend(rows) {
    const m = new Map();
    rows.forEach((r) => {
      if (!r.opponentUid) return;
      const cur = m.get(r.opponentUid) || { opponentUid: r.opponentUid, count: 0, bestTotal: 0, lastDate: "" };
      cur.count += 1;
      if (r.totalScore > cur.bestTotal) cur.bestTotal = r.totalScore;
      if (String(r.dateKey) > String(cur.lastDate)) cur.lastDate = r.dateKey;
      m.set(r.opponentUid, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  },
};

window.dashRepo = dashRepo;
