// ═══════════════ LEADERBOARDS (per-pair best scores) ═══════════════
// Exposes window.leaderRepo. Reads leaderboard docs written on game completion
// (see updateLeaderboard in db.js). Each doc:
//   { pairId, members:[uidA,uidB], allTime:{bestScore,dateAchieved,gameId},
//     months:{ "YYYY-MM":{bestScore,dateAchieved,gameId} } }
//
// Depends on db.js globals: fs. And app.js: esc (for callers).

const leaderRepo = {
  // Parse a typed "MM/YYYY" (or "M/YYYY") into a "YYYY-MM" key, or null.
  parseMonthInput(raw) {
    const s = (raw || "").trim();
    const m = s.match(/^(\d{1,2})\s*[\/\-]\s*(\d{4})$/);
    if (!m) return null;
    const mm = parseInt(m[1], 10);
    const yyyy = m[2];
    if (mm < 1 || mm > 12) return null;
    return `${yyyy}-${String(mm).padStart(2, "0")}`;
  },

  // "YYYY-MM" -> "MM/YYYY" for display.
  monthKeyToLabel(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key || "");
    if (!m) return key || "";
    return `${m[2]}/${m[1]}`;
  },

  // Current month as a "YYYY-MM" key.
  currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  },

  // All leaderboard docs I'm a member of, with the opponent profile resolved.
  // Returns [{ pairId, opponent:{uid,usernameDisplay,photoURL}, allTime, months }]
  async myBoards(myUid) {
    try {
      const snap = await fs.collection("leaderboard")
        .where("members", "array-contains", myUid)
        .get();
      const boards = snap.docs.map((d) => d.data());

      // Resolve each opponent's profile.
      const withProfiles = await Promise.all(boards.map(async (b) => {
        const otherUid = (b.members || []).find((u) => u !== myUid) || null;
        let opponent = { uid: otherUid, usernameDisplay: "(unknown)", photoURL: "" };
        if (otherUid) {
          try {
            const us = await fs.collection("users").doc(otherUid).get();
            if (us.exists) {
              const u = us.data();
              opponent = {
                uid: otherUid,
                usernameDisplay: u.usernameDisplay || u.username || "(unknown)",
                photoURL: u.photoURL || "",
              };
            }
          } catch (e) { /* keep fallback */ }
        }
        return {
          pairId: b.pairId,
          opponent,
          allTime: b.allTime || null,
          months: b.months || {},
        };
      }));
      return withProfiles;
    } catch (e) {
      console.error("leaderRepo.myBoards error:", e);
      return [];
    }
  },

  // Collect every month key present across boards (for the dropdown), newest first.
  monthsAcross(boards) {
    const set = new Set();
    boards.forEach((b) => Object.keys(b.months || {}).forEach((k) => set.add(k)));
    return Array.from(set).sort().reverse();
  },
};

window.leaderRepo = leaderRepo;
