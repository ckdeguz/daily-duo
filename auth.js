// ═══════════════ AUTH (Google sign-in + user/username docs) ═══════════════
// Exposes window.Auth. Guests need none of this — sign-in is additive.
//
// Depends on: firebase (compat auth + firestore via db.js's `fs`), esc(),
// and app.js globals: state, render. Loaded before app.js, but the callbacks
// it registers run later (after app.js defines state/render).

(function () {
  const auth = firebase.auth();
  const googleProvider = new firebase.auth.GoogleAuthProvider();

  // Hooks app.js can override once it's loaded.
  const hooks = {
    onUserChange: null,   // (userObj|null) => void
  };

  // ─── Sign in / out ───
  async function signInWithGoogle() {
    try {
      await auth.signInWithPopup(googleProvider);
    } catch (e) {
      const code = e && e.code;
      // User just dismissed the popup — not an error worth surfacing.
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      // Popup blocked / unsupported env (some mobile webviews): try redirect.
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        try { await auth.signInWithRedirect(googleProvider); return; }
        catch (e2) { console.error("signInWithRedirect error:", e2); e = e2; }
      }
      console.error("signInWithGoogle error:", e);
      notifySignInError(e);
    }
  }

  // Show a readable reason on screen (the gate / chrome) when sign-in fails.
  function notifySignInError(e) {
    const code = (e && e.code) || "";
    let msg;
    switch (code) {
      case "auth/unauthorized-domain":
        msg = "This domain isn't authorized for sign-in. Add it under Firebase → Authentication → Settings → Authorized domains."; break;
      case "auth/operation-not-allowed":
        msg = "Google sign-in isn't enabled for this project (Firebase → Authentication → Sign-in method)."; break;
      case "auth/popup-blocked":
        msg = "Your browser blocked the sign-in popup. Allow popups for this site and try again."; break;
      default:
        msg = "Sign-in failed" + (code ? ` (${code})` : "") + ". Check the console for details.";
    }
    if (typeof window.showAuthError === "function") window.showAuthError(msg);
    else alert(msg);
  }

  function signOut() {
    return auth.signOut().catch((e) => console.error("signOut error:", e));
  }

  // ─── User doc: ensure users/{uid} exists; returns the merged profile ───
  // Does NOT create a username — that's a separate, explicit step so we can
  // prompt the user. Returns { uid, displayName, photoURL, email, username|null }.
  async function loadProfile(fbUser) {
    const ref = fs.collection("users").doc(fbUser.uid);
    let snap;
    try { snap = await ref.get(); } catch (e) { console.error("loadProfile get error:", e); snap = null; }

    if (snap && snap.exists) {
      const d = snap.data();
      return {
        uid: fbUser.uid,
        displayName: d.displayName || fbUser.displayName || "",
        photoURL: d.photoURL || fbUser.photoURL || "",
        email: d.email || fbUser.email || "",
        username: d.username || null,
        usernameDisplay: d.usernameDisplay || null,
        entitlements: d.entitlements || { extraQuestions: false, removeAds: false },
      };
    }

    // First sign-in: create the base user doc (no username yet).
    const base = {
      displayName: fbUser.displayName || "",
      photoURL: fbUser.photoURL || "",
      email: fbUser.email || "",
      username: null,
      usernameDisplay: null,
      entitlements: { extraQuestions: false, removeAds: false },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    try { await ref.set(base, { merge: true }); } catch (e) { console.error("loadProfile create error:", e); }
    return { uid: fbUser.uid, ...base, createdAt: undefined };
  }

  // ─── Username validation + claim (atomic via transaction) ───
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

  function normalizeUsername(raw) {
    return (raw || "").trim().toLowerCase();
  }

  function validateUsername(raw) {
    const u = normalizeUsername(raw);
    if (!USERNAME_RE.test(u)) {
      return { ok: false, error: "3–20 chars: letters, numbers, underscore." };
    }
    return { ok: true, value: u };
  }

  // Claims `username` for `uid`. Returns { ok } or { ok:false, error }.
  async function claimUsername(uid, rawUsername) {
    const v = validateUsername(rawUsername);
    if (!v.ok) return v;
    const username = v.value;
    const display = rawUsername.trim();

    const nameRef = fs.collection("usernames").doc(username);
    const userRef = fs.collection("users").doc(uid);
    try {
      await fs.runTransaction(async (tx) => {
        const nameSnap = await tx.get(nameRef);
        if (nameSnap.exists && nameSnap.data().uid !== uid) {
          throw { taken: true };
        }
        tx.set(nameRef, { uid });
        tx.set(userRef, { username, usernameDisplay: display }, { merge: true });
      });
      return { ok: true, value: username, display };
    } catch (e) {
      if (e && e.taken) return { ok: false, error: "That username is taken." };
      console.error("claimUsername error:", e);
      return { ok: false, error: "Couldn't save username. Try again." };
    }
  }

  // ─── Auth chrome (header with avatar / sign-in button) ───
  // Lives outside #app so it survives render()'s innerHTML swaps.
  function chromeEl() {
    let el = document.getElementById("auth-chrome");
    if (!el) {
      el = document.createElement("div");
      el.id = "auth-chrome";
      document.body.appendChild(el);
    }
    return el;
  }

  function renderChrome(user) {
    const el = chromeEl();
    if (!user) {
      el.innerHTML = `
        <button class="auth-signin-btn" id="authSignInBtn">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          <span>Sign in</span>
        </button>`;
      const btn = document.getElementById("authSignInBtn");
      if (btn) btn.addEventListener("click", signInWithGoogle);
      return;
    }
    const label = esc(user.usernameDisplay || user.username || user.displayName || "Account");
    const avatar = user.photoURL
      ? `<img class="auth-avatar" src="${esc(user.photoURL)}" alt="">`
      : `<span class="auth-avatar auth-avatar-fallback">${esc((label[0] || "?").toUpperCase())}</span>`;
    el.innerHTML = `
      <button class="auth-account-btn" id="authAccountBtn" aria-haspopup="true" aria-expanded="false">
        ${avatar}<span class="auth-account-name">${label}</span>
      </button>
      <div class="auth-menu" id="authMenu" hidden>
        <a class="auth-menu-item" href="#/friends">Friends</a>
        <!-- Re-enable each as its phase ships:
        <a class="auth-menu-item" href="#/dashboard">Dashboard</a>
        <a class="auth-menu-item" href="#/leaderboard">Leaderboards</a>
        -->
        <button class="auth-menu-item auth-menu-signout" id="authSignOutBtn">Sign out</button>
      </div>`;
    const accBtn = document.getElementById("authAccountBtn");
    const menu = document.getElementById("authMenu");
    accBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !menu.hidden;
      menu.hidden = open;
      accBtn.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", () => { if (menu && !menu.hidden) menu.hidden = true; }, { once: true });
    const out = document.getElementById("authSignOutBtn");
    if (out) out.addEventListener("click", () => { signOut(); });
  }

  // ─── Auth state wiring ───
  // app.js registers Auth.onUserChange; we also keep the chrome in sync here.
  auth.onAuthStateChanged(async (fbUser) => {
    let userObj = null;
    if (fbUser) {
      userObj = await loadProfile(fbUser);
    }
    renderChrome(userObj);
    if (typeof hooks.onUserChange === "function") {
      hooks.onUserChange(userObj);
    }
  });

  window.Auth = {
    signInWithGoogle,
    signOut,
    claimUsername,
    validateUsername,
    normalizeUsername,
    renderChrome,
    set onUserChange(fn) { hooks.onUserChange = fn; },
    get currentUid() { return auth.currentUser ? auth.currentUser.uid : null; },
  };
})();
