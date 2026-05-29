# Daily Duo ⚡

A daily two-player quiz game where you and a friend answer the same 10 questions, then guess each other's answers to see how well you know each other.

## How It Works

1. **Player 1** enters their name and answers 10 multiple-choice questions, then guesses what their friend will pick.
2. A unique session link is generated — Player 1 shares it with their friend.
3. **Player 2** opens the link, answers the same questions, and guesses what Player 1 chose.
4. Both players see a results screen showing scores, matched answers, and a shareable image.

Questions rotate daily. Everyone who plays on the same day gets the same set of 10 questions.

## Tech Stack

- Vanilla HTML/CSS/JS — no build step, no framework
- **Firebase Realtime Database** — stores session data (answers + guesses) keyed by a short random ID passed in the URL hash
- **Firebase Hosting** — static site deployment
- **Google AdSense** — ad slots on the home, play, and results screens
- **Canvas API** — generates a shareable results image client-side

## Project Structure

```
index.html      — app shell, ad slots, script tags
app.js          — all app logic: state, rendering, Firebase read/write
questions.js    — pool of all daily questions
styles.css      — styling (dark/light theme support)
adblock.js      — adblock detection banner
config.js       — Firebase config (gitignored)
firebase.json   — Firebase Hosting config
.firebaserc     — Firebase project alias
```

## Local Development

`config.js` is gitignored. Create it with your Firebase project credentials:

```js
// config.js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
firebase.initializeApp(firebaseConfig);
```

Then open `index.html` directly in a browser or serve it with any static file server.

## Deployment

```bash
firebase deploy
```
