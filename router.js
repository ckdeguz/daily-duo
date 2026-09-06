// ═══════════════ HASH ROUTER ═══════════════
// Coexists with the state.screen machine: the router decides WHICH PAGE shows;
// state.screen still drives the gameplay flow inside the home/game route.
//
// Routes:
//   #/              → game shell (home/play/share/results via state.screen)
//   #g/<gameId>     → load a specific game (P2 handoff or results)
//   #/dashboard     → user dashboard      (guarded)
//   #/friends       → friends + invites   (guarded; ?invite=CODE)
//   #/leaderboard   → leaderboards        (guarded)
//
// Legacy: a bare "#abc123" (old share links) is treated as a game id.
//
// Depends on app.js globals (defined before routeAndRender runs):
//   state, render, renderLoading, renderError, openGame(),
//   renderDashboard?, renderFriends?, renderLeaderboard? (later phases),
//   renderSignInGate().

const GUARDED = ["/dashboard", "/friends", "/leaderboard"];

// Every route used to share the single static <title>, making history entries
// and bookmarks indistinguishable. Titles are a plain-text sink — do NOT run
// them through esc(), or entities show up literally in the tab.
const BASE_TITLE = "Daily Duo — 10 daily questions with a friend";

function setTitle(suffix) {
  document.title = suffix ? `${suffix} — Daily Duo` : BASE_TITLE;
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, "");
  if (!raw) return { kind: "home", path: "/", params: {} };

  // Game route: #g/<id>
  if (raw.startsWith("g/")) {
    return { kind: "game", gameId: raw.slice(2), params: {} };
  }

  // Page route: #/something[?a=b]
  if (raw.startsWith("/")) {
    const [pathPart, queryPart] = raw.split("?");
    const params = {};
    if (queryPart) {
      queryPart.split("&").forEach((kv) => {
        const [k, v] = kv.split("=");
        if (!k) return;
        // A malformed %-escape throws URIError; a bad share link must not
        // blank the whole app, so drop the unparseable param and continue.
        try { params[decodeURIComponent(k)] = decodeURIComponent(v || ""); }
        catch (e) { /* ignore this param */ }
      });
    }
    return { kind: "page", path: pathPart || "/", params };
  }

  // Legacy bare hash → game id (back-compat with old shared links).
  return { kind: "game", gameId: raw, legacy: true, params: {} };
}

function navigate(path) {
  cleanupListeners();
  if (location.hash === "#" + path) {
    routeAndRender(); // same hash: re-render manually
  } else {
    location.hash = path; // triggers hashchange → routeAndRender
  }
}

function cleanupListeners() {
  if (state._unsub) {
    try { state._unsub(); } catch (e) {}
    state._unsub = null;
  }
}

async function routeAndRender() {
  cleanupListeners();
  const route = parseRoute();

  if (route.kind === "game") {
    // Provisional: openGame refines this once it knows the game's state.
    setTitle("Loading game");
    await openGame(route.gameId);
    return;
  }

  if (route.kind === "page") {
    // Auth guard for protected pages.
    if (GUARDED.includes(route.path) && !state.user) {
      state.pendingRoute = location.hash.replace(/^#/, "");
      setTitle("Sign in");
      renderSignInGate(route.path);
      return;
    }
    switch (route.path) {
      case "/dashboard":
        if (typeof renderDashboard === "function") { setTitle("Dashboard"); return renderDashboard(); }
        break;
      case "/friends":
        if (typeof renderFriends === "function") { setTitle("Friends"); return renderFriends(route.params); }
        break;
      case "/leaderboard":
        if (typeof renderLeaderboard === "function") { setTitle("Leaderboards"); return renderLeaderboard(route.params); }
        break;
      case "/":
      default:
        setTitle(null);
        state.screen = "home";
        return render();
    }
    // Page not yet implemented (future phase) — fall back home.
    setTitle(null);
    state.screen = "home";
    return render();
  }

  // Home
  setTitle(null);
  state.screen = "home";
  render();
}

window.addEventListener("hashchange", routeAndRender);
