// ═══════════════ FRIENDS (search, requests, friendships, invites) ═══════════════
// Exposes window.friendRepo. Depends on db.js globals: fs, FieldValue,
// serverTimestamp, pairIdFor; and app.js: generateId(), state.

const friendRepo = {
  // ─── Username search ───
  // Resolve a username (case-insensitive) to a public profile, or null.
  async findByUsername(rawUsername) {
    const uname = (rawUsername || "").trim().toLowerCase();
    if (!uname) return null;
    try {
      const nameSnap = await fs.collection("usernames").doc(uname).get();
      if (!nameSnap.exists) return null;
      const uid = nameSnap.data().uid;
      const userSnap = await fs.collection("users").doc(uid).get();
      if (!userSnap.exists) return null;
      const u = userSnap.data();
      return {
        uid,
        username: u.username || uname,
        usernameDisplay: u.usernameDisplay || u.username || uname,
        displayName: u.displayName || "",
        photoURL: u.photoURL || "",
      };
    } catch (e) {
      console.error("friendRepo.findByUsername error:", e);
      return null;
    }
  },

  // ─── Friendship state between me and another uid ───
  async friendshipExists(myUid, otherUid) {
    try {
      const snap = await fs.collection("friendships").doc(pairIdFor(myUid, otherUid)).get();
      return snap.exists;
    } catch (e) { return false; }
  },

  // ─── Send a friend request ───
  // Returns { ok } or { ok:false, error }.
  async sendRequest(me, target, source) {
    if (!me || !target) return { ok: false, error: "Not signed in." };
    if (me.uid === target.uid) return { ok: false, error: "You can't add yourself." };
    if (await this.friendshipExists(me.uid, target.uid)) {
      return { ok: false, error: "You're already friends." };
    }
    // Avoid a duplicate pending request that I already sent to this person.
    // (Only query requests I sent — those are always readable under the rules.
    // If THEY already sent ME one, accepting it is the right path anyway.)
    try {
      const dup = await fs.collection("friendRequests")
        .where("fromUid", "==", me.uid)
        .where("toUid", "==", target.uid)
        .where("status", "==", "pending")
        .get();
      if (!dup.empty) return { ok: false, error: "You already sent them a request." };
    } catch (e) { /* non-fatal; proceed */ }

    const id = generateId();
    try {
      await fs.collection("friendRequests").doc(id).set({
        id,
        fromUid: me.uid,
        fromUsername: me.usernameDisplay || me.username || "",
        fromPhotoURL: me.photoURL || "",
        toUid: target.uid,
        toUsername: target.usernameDisplay || target.username || "",
        status: "pending",
        source: source || "search",
        createdAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (e) {
      console.error("friendRepo.sendRequest error:", e);
      return { ok: false, error: "Couldn't send request. Try again." };
    }
  },

  // ─── Incoming pending requests for me ───
  async incomingRequests(myUid) {
    try {
      const snap = await fs.collection("friendRequests")
        .where("toUid", "==", myUid)
        .where("status", "==", "pending")
        .get();
      return snap.docs.map((d) => d.data());
    } catch (e) {
      console.error("friendRepo.incomingRequests error:", e);
      return [];
    }
  },

  // ─── Accept a request: create friendship + mark accepted (transaction) ───
  // Idempotent: if the friendship already exists (e.g. the other person sent a
  // simultaneous request that was accepted first), we still mark this request
  // accepted and succeed rather than erroring.
  async acceptRequest(requestId, myUid) {
    try {
      const reqRef = fs.collection("friendRequests").doc(requestId);
      const ok = await fs.runTransaction(async (tx) => {
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists) return false;
        const req = reqSnap.data();
        if (req.toUid !== myUid || req.status !== "pending") return false;

        const members = [req.fromUid, req.toUid].sort();
        const pairId = pairIdFor(req.fromUid, req.toUid);
        const friendRef = fs.collection("friendships").doc(pairId);

        // set (not create) is idempotent — safe if a simultaneous accept
        // already created the same order-independent pairId.
        tx.set(friendRef, { pairId, members, createdAt: serverTimestamp() }, { merge: true });
        // Hybrid policy: an ACCEPTED request is redundant once the friendship
        // exists, so delete it rather than keep a status record.
        tx.delete(reqRef);
        return { fromUid: req.fromUid, toUid: req.toUid };
      });
      if (!ok) return false;
      // Clean up any reverse-direction pending request (they had also asked me).
      await this._resolveReversePending(ok.toUid, ok.fromUid).catch(() => {});
      return true;
    } catch (e) {
      console.error("friendRepo.acceptRequest error:", e);
      return false;
    }
  },

  // Delete any still-pending request I sent to someone I'm now friends with
  // (so it doesn't linger as a phantom "wants to be friends"). The recipient
  // (= the other person) is the one allowed to delete it, but since we're now
  // friends either side's pending request to the other is moot — best-effort.
  async _resolveReversePending(meUid, otherUid) {
    const snap = await fs.collection("friendRequests")
      .where("fromUid", "==", meUid)
      .where("toUid", "==", otherUid)
      .where("status", "==", "pending")
      .get();
    await Promise.all(snap.docs.map((d) =>
      fs.collection("friendRequests").doc(d.id).delete().catch(() => {})
    ));
  },

  // ─── Remove a friend (delete the friendship link only; keep games + leaderboard) ───
  async removeFriend(myUid, otherUid) {
    try {
      await fs.collection("friendships").doc(pairIdFor(myUid, otherUid)).delete();
      return true;
    } catch (e) {
      console.error("friendRepo.removeFriend error:", e);
      return false;
    }
  },

  async declineRequest(requestId, myUid) {
    try {
      const reqRef = fs.collection("friendRequests").doc(requestId);
      await fs.runTransaction(async (tx) => {
        const snap = await tx.get(reqRef);
        if (!snap.exists) return;
        const req = snap.data();
        if (req.toUid !== myUid || req.status !== "pending") return;
        tx.update(reqRef, { status: "declined" });
      });
      return true;
    } catch (e) {
      console.error("friendRepo.declineRequest error:", e);
      return false;
    }
  },

  // ─── List my friends (resolved to profiles) ───
  async listFriends(myUid) {
    try {
      const snap = await fs.collection("friendships")
        .where("members", "array-contains", myUid)
        .get();
      const otherUids = snap.docs
        .map((d) => (d.data().members || []).find((u) => u !== myUid))
        .filter(Boolean);
      // Batch-fetch profiles.
      const profiles = await Promise.all(otherUids.map(async (uid) => {
        try {
          const us = await fs.collection("users").doc(uid).get();
          if (!us.exists) return { uid, usernameDisplay: "(unknown)", photoURL: "" };
          const u = us.data();
          return {
            uid,
            username: u.username || "",
            usernameDisplay: u.usernameDisplay || u.username || "(unknown)",
            displayName: u.displayName || "",
            photoURL: u.photoURL || "",
          };
        } catch (e) { return { uid, usernameDisplay: "(unknown)", photoURL: "" }; }
      }));
      return profiles;
    } catch (e) {
      console.error("friendRepo.listFriends error:", e);
      return [];
    }
  },

  // ─── Invite codes ───
  // Get-or-create a stable personal invite code for this user.
  async getOrCreateInviteCode(me) {
    if (!me) return null;
    try {
      // Reuse an existing active code if present.
      const existing = await fs.collection("inviteCodes")
        .where("ownerUid", "==", me.uid)
        .where("active", "==", true)
        .limit(1)
        .get();
      if (!existing.empty) return existing.docs[0].id;

      const code = generateId();
      await fs.collection("inviteCodes").doc(code).set({
        code,
        ownerUid: me.uid,
        ownerUsername: me.usernameDisplay || me.username || "",
        active: true,
        createdAt: serverTimestamp(),
      });
      return code;
    } catch (e) {
      console.error("friendRepo.getOrCreateInviteCode error:", e);
      return null;
    }
  },

  // Resolve an invite code to its owner's profile.
  async resolveInviteCode(code) {
    try {
      const snap = await fs.collection("inviteCodes").doc(code).get();
      if (!snap.exists || snap.data().active === false) return null;
      const ownerUid = snap.data().ownerUid;
      const us = await fs.collection("users").doc(ownerUid).get();
      if (!us.exists) return null;
      const u = us.data();
      return {
        uid: ownerUid,
        username: u.username || "",
        usernameDisplay: u.usernameDisplay || u.username || "",
        displayName: u.displayName || "",
        photoURL: u.photoURL || "",
      };
    } catch (e) {
      console.error("friendRepo.resolveInviteCode error:", e);
      return null;
    }
  },
};

window.friendRepo = friendRepo;
