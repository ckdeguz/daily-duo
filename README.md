# Daily Duo ⚡

A daily two-player quiz game where you and a friend answer the same 10 questions, then guess each other's answers to see how well you know each other.

## How It Works

1. **Player 1** enters their name and answers 10 multiple-choice questions, then guesses what their friend will pick.
2. A unique game link is generated — Player 1 shares it with their friend.
3. **Player 2** opens the link, answers the same questions, and guesses what Player 1 chose.
4. Both players see a results screen showing scores, matched answers, and a shareable image. (Player 1's screen updates to the results automatically once Player 2 finishes.)

Questions rotate daily — everyone who plays on the same day gets the same set of 10.

## Features

- **Guest play** — play and share a link with no account, just like the original.
- **Google accounts** — sign in to keep a profile (with a unique username) and unlock the social features below.
- **Friends** — add people by username or via a personal invite link, accept/decline requests, and remove friends.
- **Leaderboards** — per-duo best scores, with All-Time and Monthly views (pick a month from the dropdown or type `MM/YYYY`).
- **Dashboard** — your game history (tap a game to revisit its results), summary stats, and a per-friend breakdown.

## Tech Stack

- **Vanilla HTML/CSS/JS** — no build step, no framework
- **Firebase Authentication** — Google sign-in (guest play still works without an account)
- **Cloud Firestore** — games, users, friends, and leaderboards
- **Firebase Hosting** — static site deployment
- **Canvas API** — generates a shareable results image client-side

> Daily Duo is free to play and currently shows **no ads**. Ad slot markup still exists in `index.html` but is disabled via `ADS_ENABLED = false` in `app.js`.

## Project Structure

```
index.html       — app shell, dormant ad slots, ordered <script> tags
config.js        — Firebase config (gitignored)
questions.js     — pool of daily questions
adblock.js       — adblock detection banner (currently unused)
db.js            — Firestore data layer (games, scoring, leaderboard writes)
auth.js          — Google sign-in, user/username docs, account header
router.js        — hash router (#/, #g/<id>, #/dashboard, #/friends, #/leaderboard)
friends.js       — friend search, requests, invites
leaderboard.js   — leaderboard queries + month parsing
dashboard.js     — game history + stats
app.js           — state, render(), and all page/screen renderers
styles.css       — styling (dark/light theme)
firestore.rules        — Firestore security rules
firestore.indexes.json — Firestore composite indexes
firebase.json    — Hosting + Firestore config
```

## Local Development

`config.js` is gitignored. Create it at the repo root with your Firebase project credentials:

```js
// config.js
firebase.initializeApp({
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
});
```

Then serve the folder (e.g. `firebase serve` or `python -m http.server`) and open it in a browser.
For Google sign-in to work locally, make sure your serving origin (use `localhost`, not `127.0.0.1`) is listed under **Firebase Console → Authentication → Authorized domains**.

## Deployment

```bash
firebase deploy --only hosting     # site files
firebase deploy --only firestore   # security rules + indexes
firebase deploy                    # everything
```

> **Cache busting:** before deploying a change to any versioned file, bump its `?v=` number in `index.html` (e.g. `app.js?v=10` → `app.js?v=11`). Bump on every content change, or browsers may serve stale code.
