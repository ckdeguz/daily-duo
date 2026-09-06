// Applies the saved theme BEFORE first paint, so the page doesn't flash the
// wrong colours while the rest of the scripts load (app.js does the same thing
// at init, but only after ~800KB of questions.js has parsed).
//
// This lives in a file rather than an inline <script> on purpose: it's the last
// inline script on the site, and keeping it external is what lets the CSP in
// firebase.json omit 'unsafe-inline' from script-src.
//
// localStorage can throw in a private window or with site data blocked, so the
// read is guarded — a failure just means the default theme.
try {
  document.documentElement.setAttribute(
    "data-theme",
    localStorage.getItem("theme") || "dark"
  );
} catch (e) {
  document.documentElement.setAttribute("data-theme", "dark");
}
