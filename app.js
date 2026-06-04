function showAd(id) {
  document.querySelectorAll('[id^="ad-"]').forEach(el => { el.style.display = "none"; });
  const slot = document.getElementById(id);
  if (!slot) return;
  slot.style.display = "block";
  const ins = slot.querySelector("ins.adsbygoogle");
  if (ins && !slot.dataset.adPushed) {
    try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch(e) {}
    slot.dataset.adPushed = "1";
  }
}
function showResultsAd() { showAd("ad-results-slot"); }

function getDateKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ─── Guest identity (persistent across sessions for guest-claim) ───
function getGuestId() {
  let id = localStorage.getItem("dd_guest");
  if (!id) { id = generateId(); localStorage.setItem("dd_guest", id); }
  return id;
}

// Pending games a guest finished, to claim on sign-in: [{gameId, side}]
function getPendingGames() {
  try { return JSON.parse(localStorage.getItem("dd_pending_games") || "[]"); }
  catch (e) { return []; }
}
function addPendingGame(gameId, side) {
  const list = getPendingGames().filter((p) => p.gameId !== gameId);
  list.push({ gameId, side });
  localStorage.setItem("dd_pending_games", JSON.stringify(list));
}
function clearPendingGames() { localStorage.removeItem("dd_pending_games"); }

// Lightweight on-screen toast for auth errors (called by auth.js).
window.showAuthError = function (msg) {
  let t = document.getElementById("auth-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "auth-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._authToastTimer);
  window._authToastTimer = setTimeout(() => t.classList.remove("show"), 7000);
};

// ═══════════════ UTILITIES ═══════════════
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function getDateSeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function getDailyQuestions() {
  const totalQ = ALL_QUESTIONS.length;
  const questionsPerDay = 10;
  const totalCycles = Math.floor(totalQ / questionsPerDay);
  const baseDate = new Date(2025, 0, 1);
  const today = new Date();
  today.setHours(0,0,0,0);
  const dayIndex = Math.floor((today - baseDate) / 86400000);
  const cycleDay = dayIndex % totalCycles;
  const cycleNum = Math.floor(dayIndex / totalCycles);

  const rng = seededRandom(cycleNum * 99991 + 7);
  const indices = Array.from({ length: totalQ }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const start = cycleDay * questionsPerDay;
  return indices.slice(start, start + questionsPerDay).map(i => ALL_QUESTIONS[i]);
}

function getDateString() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function generateId() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ═══════════════ APP STATE ═══════════════
const state = {
  screen: "loading",
  sessionId: null,
  p1Answers: [],
  p1Guesses: [],
  p2Answers: [],
  p2Guesses: [],
  currentQ: 0,
  phase: "own",
  results: null,
  p1Name: "",
  p2Name: "",
  animating: false,
  errorMsg: "",
  questions: getDailyQuestions(),
  resultsTab: "p1",
  user: null,          // {uid, username, displayName, photoURL, ...} or null (guest)
  guestId: getGuestId(),
  pendingRoute: null,  // route to replay after sign-in gate
  _unsub: null,        // active onSnapshot unsubscribe
};

const $ = (sel) => document.querySelector(sel);
const app = () => document.getElementById("app");

// ═══════════════ RENDER ═══════════════
function render() {
  switch (state.screen) {
    case "loading": return renderLoading();
    case "home": return renderHome();
    case "play": return renderPlay();
    case "share": return renderShare();
    case "p2-intro": return renderP2Intro();
    case "p2-play": return renderP2Play();
    case "results": return renderResults();
    case "username": return renderUsernamePrompt();
    case "signin-gate": return renderSignInGate(state.pendingRoute);
    case "error": return renderError();
    default: app().innerHTML = "";
  }
}

function renderLoading() {
  app().innerHTML = '<div class="card"><div class="spinner"></div><p class="subtitle" style="margin-top:12px">Loading...</p></div>';
}

function renderHome() {
  const shareUrl = location.origin + location.pathname;
  const shareText = "Try Daily Duo! 10 daily questions to see how well you know your friends";
  const hasNativeShare = !!navigator.share;

  app().innerHTML = `
    <div class="card">
      <img class="logo-icon" src="logo.png" alt="Daily Duo logo">
      <h1 class="title">Daily Duo</h1>
      <p class="subtitle">10 daily questions. See how well you know each other.</p>
      <div class="date-chip">${getDateString()}</div>
      <div class="how-it-works">
        <div class="step"><span class="step-num">1</span><span class="step-text">Answer 10 questions & guess your friend's picks</span></div>
        <div class="step"><span class="step-num">2</span><span class="step-text">Share the link with your friend</span></div>
        <div class="step"><span class="step-num">3</span><span class="step-text">They answer & guess yours — then compare!</span></div>
      </div>
      <input class="name-input" type="text" placeholder="Your name" maxlength="20" id="p1NameInput" value="${esc(state.p1Name)}">
      <button class="primary-btn" id="startBtn" ${state.p1Name.trim() ? '' : 'disabled'}>Start Today's Quiz →</button>
      <div class="share-section">
        <p class="share-label">Invite a friend to play</p>
        ${hasNativeShare ? `<button class="share-btn native-share" id="nativeShareBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share Daily Duo
        </button>` : ''}
        <div class="share-row">
          <a class="share-btn" id="shareTwitter" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            X
          </a>
          <a class="share-btn" id="shareFacebook" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Facebook
          </a>
          <a class="share-btn" id="shareWhatsApp" href="https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>
          <button class="share-btn" id="copyLinkBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Copy Link
          </button>
        </div>
      </div>
    </div>`;

  const inp = $("#p1NameInput");
  const btn = $("#startBtn");
  inp.addEventListener("input", () => { state.p1Name = inp.value; btn.disabled = !inp.value.trim(); });
  btn.addEventListener("click", () => { state.screen = "play"; state.currentQ = 0; state.phase = "own"; render(); });
  setTimeout(() => showAd("ad-home-slot"), 400);

  if (hasNativeShare) {
    $("#nativeShareBtn").addEventListener("click", () => {
      navigator.share({ title: "Daily Duo", text: shareText, url: shareUrl }).catch(() => {});
    });
  }
  $("#copyLinkBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    const copyBtn = $("#copyLinkBtn");
    copyBtn.classList.add("copied");
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    setTimeout(() => {
      if ($("#copyLinkBtn")) {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Copy Link`;
      }
    }, 2000);
  });
}

// ─── P1 Play ───
function renderPlay() {
  const q = state.questions[state.currentQ];
  const isGuess = state.phase === "guess";
  const phaseTransition = isGuess && state.currentQ === 0
    ? '<div class="phase-transition">Now guess what your friend will choose!</div>' : '';
  const canGoBack = state.currentQ > 0;

  app().innerHTML = `
    <div class="card">
      <div class="top-bar">
        <span class="phase-label">${isGuess ? '🔮 Guess their answers' : '📝 Your answers'}</span>
        <span class="counter">${state.currentQ + 1}/10</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${(state.currentQ / 10) * 100}%"></div></div>
      ${phaseTransition}
      <h2 class="question">${esc(q.q)}</h2>
      <div class="options">
        ${q.opts.map((opt, i) => `
          <button class="option-btn" style="animation-delay:${i * 60}ms" data-idx="${i}">
            <span class="opt-letter">${["A","B","C","D"][i]}</span>
            <span>${esc(opt)}</span>
          </button>
        `).join('')}
      </div>
      ${canGoBack ? '<button class="back-btn" id="backBtn">← Go Back</button>' : ''}
    </div>`;
  bindP1Options();
  setTimeout(() => showAd("ad-play-slot"), 400);
  if (canGoBack) {
    $("#backBtn").addEventListener("click", () => {
      if (state.animating) return;
      if (state.phase === "own") { state.p1Answers.pop(); } else { state.p1Guesses.pop(); }
      state.currentQ--;
      render();
    });
  }
}

function bindP1Options() {
  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.animating) return;
      state.animating = true;
      const idx = parseInt(btn.dataset.idx);
      btn.classList.add("selected");

      if (state.phase === "own") {
        state.p1Answers.push(idx);
        if (state.p1Answers.length === 10) {
          setTimeout(() => { state.phase = "guess"; state.currentQ = 0; state.animating = false; render(); }, 500);
        } else {
          setTimeout(() => { state.currentQ++; state.animating = false; render(); }, 400);
        }
      } else {
        state.p1Guesses.push(idx);
        if (state.p1Guesses.length === 10) {
          setTimeout(() => { saveP1(); }, 400);
        } else {
          setTimeout(() => { state.currentQ++; state.animating = false; render(); }, 400);
        }
      }
    });
  });
}

// ─── P2 Play ───
function renderP2Play() {
  const q = state.questions[state.currentQ];
  const isGuess = state.phase === "guess";
  const phaseTransition = isGuess && state.currentQ === 0
    ? `<div class="phase-transition">Now guess what ${esc(state.p1Name)} chose!</div>` : '';
  const canGoBack = state.currentQ > 0;

  app().innerHTML = `
    <div class="card">
      <div class="top-bar">
        <span class="phase-label">${isGuess ? '🔮 Guess ' + esc(state.p1Name) + "'s answers" : '📝 Your answers'}</span>
        <span class="counter">${state.currentQ + 1}/10</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${(state.currentQ / 10) * 100}%"></div></div>
      ${phaseTransition}
      <h2 class="question">${esc(q.q)}</h2>
      <div class="options">
        ${q.opts.map((opt, i) => `
          <button class="option-btn" style="animation-delay:${i * 60}ms" data-idx="${i}">
            <span class="opt-letter">${["A","B","C","D"][i]}</span>
            <span>${esc(opt)}</span>
          </button>
        `).join('')}
      </div>
      ${canGoBack ? '<button class="back-btn" id="backBtn">← Go Back</button>' : ''}
    </div>`;
  bindP2Options();
  if (canGoBack) {
    $("#backBtn").addEventListener("click", () => {
      if (state.animating) return;
      if (state.phase === "own") { state.p2Answers.pop(); } else { state.p2Guesses.pop(); }
      state.currentQ--;
      render();
    });
  }
}

function bindP2Options() {
  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.animating) return;
      state.animating = true;
      const idx = parseInt(btn.dataset.idx);
      btn.classList.add("selected");

      if (state.phase === "own") {
        state.p2Answers.push(idx);
        if (state.p2Answers.length === 10) {
          setTimeout(() => { state.phase = "guess"; state.currentQ = 0; state.animating = false; render(); }, 500);
        } else {
          setTimeout(() => { state.currentQ++; state.animating = false; render(); }, 400);
        }
      } else {
        state.p2Guesses.push(idx);
        if (state.p2Guesses.length === 10) {
          setTimeout(() => { saveP2(); }, 400);
        } else {
          setTimeout(() => { state.currentQ++; state.animating = false; render(); }, 400);
        }
      }
    });
  });
}

function renderShare() {
  const url = `${location.origin}${location.pathname}#g/${state.sessionId}`;
  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">🔗</span>
      <h1 class="title">You're all set!</h1>
      <p class="subtitle">Send this link to your friend. They'll answer the same questions and guess yours too. We'll show your results here automatically once they finish!</p>
      <div class="link-box"><span class="link-text">${esc(url)}</span></div>
      <button class="primary-btn" id="copyBtn">Copy Link</button>
      <p class="hint" id="shareWaiting">Waiting for your friend to play… you can leave this open.</p>
    </div>`;
  $("#copyBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(url).catch(() => {});
    $("#copyBtn").textContent = "✓ Copied!";
    setTimeout(() => { if ($("#copyBtn")) $("#copyBtn").textContent = "Copy Link"; }, 2000);
  });

  // Live: auto-advance to results the moment P2 completes.
  subscribeForResults(state.sessionId);
}

function renderP2Intro() {
  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">👋</span>
      <h1 class="title">${esc(state.p1Name)} sent you a Daily Duo!</h1>
      <p class="subtitle">Answer 10 questions, then guess what ${esc(state.p1Name)} picked. See how well you know each other!</p>
      <div class="date-chip">${getDateString()}</div>
      <input class="name-input" type="text" placeholder="Your name" maxlength="20" id="p2NameInput" value="${esc(state.p2Name)}">
      <button class="primary-btn" id="p2StartBtn" ${state.p2Name.trim() ? '' : 'disabled'}>Let's Go →</button>
    </div>`;
  const inp = $("#p2NameInput");
  const btn = $("#p2StartBtn");
  inp.addEventListener("input", () => { state.p2Name = inp.value; btn.disabled = !inp.value.trim(); });
  btn.addEventListener("click", () => { state.screen = "p2-play"; state.currentQ = 0; state.phase = "own"; render(); });
}

// ─── RESULTS ───
async function generateShareImage(r, p1Score, p2Score, totalScore, emoji, msg) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f0f13");
  bg.addColorStop(0.5, "#1a1a2e");
  bg.addColorStop(1, "#0f0f13");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  const glow = ctx.createRadialGradient(W / 2, 400, 0, W / 2, 400, 400);
  glow.addColorStop(0, "rgba(167,139,250,0.15)");
  glow.addColorStop(1, "rgba(167,139,250,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  await new Promise((resolve, reject) => {
    const logoImg = new Image();
    logoImg.onload = () => {
      const size = 80;
      ctx.drawImage(logoImg, W / 2 - size / 2, 80, size, size);
      resolve();
    };
    logoImg.onerror = reject;
    logoImg.src = "logo.png";
  });

  ctx.textAlign = "center";

  ctx.font = "bold 56px 'DM Sans', sans-serif";
  ctx.fillStyle = "#e8e6e3";
  ctx.fillText("Daily Duo", W / 2, 240);

  ctx.font = "28px 'DM Sans', sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(getDateString(), W / 2, 290);

  ctx.font = "100px sans-serif";
  ctx.fillText(emoji, W / 2, 430);

  ctx.font = "bold 42px 'DM Sans', sans-serif";
  ctx.fillStyle = "#e8e6e3";
  ctx.fillText(msg, W / 2, 500);

  ctx.font = "bold 120px 'DM Sans', sans-serif";
  const scoreGrad = ctx.createLinearGradient(W / 2 - 100, 560, W / 2 + 100, 680);
  scoreGrad.addColorStop(0, "#a78bfa");
  scoreGrad.addColorStop(1, "#60a5fa");
  ctx.fillStyle = scoreGrad;
  ctx.fillText(`${totalScore}/20`, W / 2, 660);

  const cardW = 440, cardH = 220, cardY = 740, gap = 40;
  const card1X = W / 2 - cardW - gap / 2;
  const card2X = W / 2 + gap / 2;

  function drawScoreCard(x, y, name, score, otherName) {
    const color = score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444";
    roundRect(x, y, cardW, cardH, 24);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "bold 30px 'DM Sans', sans-serif";
    ctx.fillStyle = "#e8e6e3";
    ctx.fillText(name, x + cardW / 2, y + 55);

    ctx.font = "bold 72px 'DM Sans', sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(`${score}/10`, x + cardW / 2, y + 145);

    ctx.font = "24px 'DM Sans', sans-serif";
    ctx.fillStyle = "#9ca3af";
    ctx.fillText(`guessing ${otherName}`, x + cardW / 2, y + 190);
  }

  drawScoreCard(card1X, cardY, r.p1Name, p1Score, r.p2Name);
  drawScoreCard(card2X, cardY, r.p2Name, p2Score, r.p1Name);

  ctx.font = "bold 28px 'DM Sans', sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText("vs", W / 2, cardY + cardH / 2 + 10);

  const barY = 1020, barH = 40, barPad = 100;
  roundRect(barPad, barY, W - barPad * 2, barH, barH / 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();

  const fillW = Math.max(barH, ((W - barPad * 2) * totalScore) / 20);
  roundRect(barPad, barY, fillW, barH, barH / 2);
  const barGrad = ctx.createLinearGradient(barPad, 0, barPad + fillW, 0);
  barGrad.addColorStop(0, "#a78bfa");
  barGrad.addColorStop(1, "#60a5fa");
  ctx.fillStyle = barGrad;
  ctx.fill();

  ctx.font = "bold 32px 'DM Sans', sans-serif";
  ctx.fillStyle = "#a78bfa";
  ctx.fillText("Think you know your friends?", W / 2, 1180);

  ctx.font = "26px 'DM Sans', sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(location.origin + location.pathname, W / 2, 1230);

  return canvas;
}

async function shareResultsImage() {
  const r = state.results;
  const p1Score = r.p1Guesses.reduce((s, g, i) => s + (g === r.p2Answers[i] ? 1 : 0), 0);
  const p2Score = r.p2Guesses.reduce((s, g, i) => s + (g === r.p1Answers[i] ? 1 : 0), 0);
  const totalScore = p1Score + p2Score;
  const emoji = totalScore === 20 ? "🔥" : totalScore >= 16 ? "🔥" : totalScore >= 10 ? "🤝" : "😅";
  const msg = totalScore === 20 ? "Perfect sync!" : totalScore >= 16 ? "Almost telepathic!" : totalScore >= 10 ? "Not bad at all!" : totalScore >= 6 ? "Room to grow!" : "Opposites attract?";

  const canvas = await generateShareImage(r, p1Score, p2Score, totalScore, emoji, msg);

  canvas.toBlob(async (blob) => {
    const file = new File([blob], "daily-duo-results.png", { type: "image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: "Daily Duo Results", text: "Check out our Daily Duo score!", files: [file] });
        return;
      } catch (e) { /* fall through to download */ }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "daily-duo-results.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

function renderResults() {
  const r = state.results;
  if (!r) return;
  const qs = r.questions || getDailyQuestions();
  const p1Score = r.p1Guesses.reduce((s, g, i) => s + (g === r.p2Answers[i] ? 1 : 0), 0);
  const p2Score = r.p2Guesses.reduce((s, g, i) => s + (g === r.p1Answers[i] ? 1 : 0), 0);
  const totalScore = p1Score + p2Score;
  const emoji = totalScore >= 16 ? "🔥" : totalScore >= 10 ? "🤝" : "😅";
  const msg = totalScore === 20 ? "Perfect sync!" : totalScore >= 16 ? "Almost telepathic!" : totalScore >= 10 ? "Not bad at all!" : totalScore >= 6 ? "Room to grow!" : "Opposites attract?";

  const p1Color = p1Score >= 8 ? "var(--success)" : p1Score >= 5 ? "var(--warn)" : "var(--danger)";
  const p2Color = p2Score >= 8 ? "var(--success)" : p2Score >= 5 ? "var(--warn)" : "var(--danger)";

  const tab = state.resultsTab;

  let questionRows = "";
  qs.forEach((q, i) => {
    if (tab === "p1") {
      const match = r.p1Guesses[i] === r.p2Answers[i];
      questionRows += `
        <div class="result-row ${match ? 'both-match' : 'no-match'}">
          <div class="result-q">
            <span class="match-icon ${match ? 'yes' : 'no'}">${match ? '✓' : '✗'}</span>
            <span class="result-q-text">${esc(q.q)}</span>
          </div>
          <div class="result-grid" style="grid-template-columns:1fr;">
            <div class="result-cell">
              <div class="result-cell-row">
                <span class="result-label">${esc(r.p1Name)} guessed</span>
                <span class="result-value ${match ? 'match-highlight' : 'miss-highlight'}">${esc(q.opts[r.p1Guesses[i]])}</span>
              </div>
              <div class="result-cell-row">
                <span class="result-label">${esc(r.p2Name)} answered</span>
                <span class="result-value bold">${esc(q.opts[r.p2Answers[i]])}</span>
              </div>
            </div>
          </div>
        </div>`;
    } else {
      const match = r.p2Guesses[i] === r.p1Answers[i];
      questionRows += `
        <div class="result-row ${match ? 'both-match' : 'no-match'}">
          <div class="result-q">
            <span class="match-icon ${match ? 'yes' : 'no'}">${match ? '✓' : '✗'}</span>
            <span class="result-q-text">${esc(q.q)}</span>
          </div>
          <div class="result-grid" style="grid-template-columns:1fr;">
            <div class="result-cell">
              <div class="result-cell-row">
                <span class="result-label">${esc(r.p2Name)} guessed</span>
                <span class="result-value ${match ? 'match-highlight' : 'miss-highlight'}">${esc(q.opts[r.p2Guesses[i]])}</span>
              </div>
              <div class="result-cell-row">
                <span class="result-label">${esc(r.p1Name)} answered</span>
                <span class="result-value bold">${esc(q.opts[r.p1Answers[i]])}</span>
              </div>
            </div>
          </div>
        </div>`;
    }
  });

  app().innerHTML = `
    <div class="card wide">
      <div class="result-header">
        <span class="score-emoji">${emoji}</span>
        <p class="subtitle" style="margin-bottom:8px">${msg}</p>
        <div class="name-badges">
          <span class="badge">${esc(r.p1Name || "Player 1")}</span>
          <span class="vs">vs</span>
          <span class="badge">${esc(r.p2Name || "Player 2")}</span>
        </div>
        <div class="scores-row">
          <div class="score-card">
            <div class="score-card-name">${esc(r.p1Name)}</div>
            <div class="score-card-value" style="color:${p1Color};-webkit-text-fill-color:${p1Color}">${p1Score}/10</div>
            <div class="score-card-label">guessing ${esc(r.p2Name)}</div>
          </div>
          <div class="score-card">
            <div class="score-card-name">${esc(r.p2Name)}</div>
            <div class="score-card-value" style="color:${p2Color};-webkit-text-fill-color:${p2Color}">${p2Score}/10</div>
            <div class="score-card-label">guessing ${esc(r.p1Name)}</div>
          </div>
        </div>
      </div>

      <div class="tab-row">
        <button class="tab-btn ${tab === 'p1' ? 'active' : ''}" data-tab="p1">${esc(r.p1Name)}'s guesses</button>
        <button class="tab-btn ${tab === 'p2' ? 'active' : ''}" data-tab="p2">${esc(r.p2Name)}'s guesses</button>
      </div>

      <div class="results-list">
        ${questionRows}
      </div>
      <div class="share-results-row">
        <button class="share-results-btn" id="shareResultsBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share Results
        </button>
        <button class="primary-btn" id="replayBtn">Play Again Tomorrow</button>
      </div>
    </div>`;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => { state.resultsTab = btn.dataset.tab; render(); });
  });
  $("#replayBtn").addEventListener("click", () => { location.hash = "#/"; location.reload(); });
  $("#shareResultsBtn").addEventListener("click", shareResultsImage);

  setTimeout(showResultsAd, 400);
  setTimeout(injectAdBlockBanner, 400);
}

function renderError() {
  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">😕</span>
      <h1 class="title">Oops</h1>
      <p class="subtitle">${esc(state.errorMsg)}</p>
      <button class="primary-btn" id="homeBtn">Go Home</button>
    </div>`;
  $("#homeBtn").addEventListener("click", () => { location.hash = "#/"; location.reload(); });
}

// ═══════════════ GAME ↔ RESULTS ADAPTER ═══════════════
// The renderers (renderResults/shareResultsImage) read a flat shape
// (r.p1Name, r.p1Answers, r.p1Guesses, r.p2*). Firestore stores a nested
// shape ({p1:{...}, p2:{...}}). This adapts nested → flat.
function flattenGame(game) {
  const p1 = game.p1 || {};
  const p2 = game.p2 || {};
  return {
    p1Name: p1.name || "Player 1",
    p1Answers: p1.answers || [],
    p1Guesses: p1.guesses || [],
    p2Name: p2.name || "Player 2",
    p2Answers: p2.answers || [],
    p2Guesses: p2.guesses || [],
    questions: game.questions,
  };
}

// ═══════════════ SAVE FUNCTIONS ═══════════════
async function saveP1() {
  renderLoading();
  const id = generateId();
  const player = {
    uid: state.user ? state.user.uid : null,
    guestId: state.user ? null : state.guestId,
    name: state.p1Name,
    answers: state.p1Answers,
    guesses: state.p1Guesses,
  };
  const ok = await gameRepo.create(id, player, state.questions);
  state.animating = false;
  if (ok) {
    state.sessionId = id;
    if (!state.user) addPendingGame(id, "p1");
    state.screen = "share";
  } else {
    state.errorMsg = "Couldn't save your answers. Please check your connection and try again.";
    state.screen = "error";
  }
  render();
}

async function saveP2() {
  renderLoading();
  const player = {
    uid: state.user ? state.user.uid : null,
    guestId: state.user ? null : state.guestId,
    name: state.p2Name,
    answers: state.p2Answers,
    guesses: state.p2Guesses,
  };
  const merged = await gameRepo.completeP2(state.sessionId, player);
  state.animating = false;
  if (!merged) {
    state.errorMsg = "Session not found.";
    state.screen = "error";
    render();
    return;
  }
  if (!state.user) addPendingGame(state.sessionId, "p2");
  state.results = flattenGame(merged);
  state.p1Name = state.results.p1Name;
  state.p2Name = state.results.p2Name;
  state.screen = "results";
  render();
}

// ═══════════════ GAME ROUTE LOADER ═══════════════
// Called by the router for #g/<id> (and legacy bare hashes).
async function openGame(gameId) {
  renderLoading();
  const game = await gameRepo.get(gameId);
  if (!game) {
    state.errorMsg = "This link doesn't seem to be valid or may have expired.";
    state.screen = "error";
    render();
    return;
  }
  state.sessionId = gameId;
  if (game.questions) state.questions = game.questions;
  state.p1Name = (game.p1 && game.p1.name) || "Player 1";

  if (game.status === "complete") {
    state.results = flattenGame(game);
    state.p2Name = state.results.p2Name;
    state.screen = "results";
    render();
    return;
  }

  // Still awaiting P2. Is the viewer P1 (the creator) revisiting, or a
  // genuine P2 here to play? P1 should see a live "waiting" screen that
  // auto-advances to results — not the answer-the-questions intro.
  const p1 = game.p1 || {};
  const viewerIsP1 = state.user
    ? (p1.uid && p1.uid === state.user.uid)
    : (p1.guestId && p1.guestId === state.guestId);

  if (viewerIsP1) {
    renderWaiting(gameId);
  } else {
    state.p2Name = "";
    state.screen = "p2-intro";
    render();
  }
}

// P1 revisiting their own not-yet-finished game: show a waiting state and
// subscribe so it flips to results the moment P2 completes.
function renderWaiting(gameId) {
  cleanupListeners();
  const url = `${location.origin}${location.pathname}#g/${gameId}`;
  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">⏳</span>
      <h1 class="title">Waiting for your friend</h1>
      <p class="subtitle">${esc(state.p1Name)} is all set! As soon as your friend finishes, results will appear here automatically.</p>
      <div class="link-box"><span class="link-text">${esc(url)}</span></div>
      <button class="primary-btn" id="copyBtn">Copy Link</button>
      <p class="hint">You can leave this page open — no need to refresh.</p>
    </div>`;
  $("#copyBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(url).catch(() => {});
    $("#copyBtn").textContent = "✓ Copied!";
    setTimeout(() => { if ($("#copyBtn")) $("#copyBtn").textContent = "Copy Link"; }, 2000);
  });
  subscribeForResults(gameId);
}

// Shared live subscription: when the game completes, render results.
function subscribeForResults(gameId) {
  if (state._unsub) { try { state._unsub(); } catch (e) {} }
  state._unsub = gameRepo.subscribe(gameId, (game) => {
    if (game && game.status === "complete") {
      if (state._unsub) { try { state._unsub(); } catch (e) {} state._unsub = null; }
      state.results = flattenGame(game);
      if (game.questions) state.questions = game.questions;
      state.p1Name = state.results.p1Name;
      state.p2Name = state.results.p2Name;
      state.screen = "results";
      render();
    }
  });
}

// ═══════════════ SIGN-IN GATE & USERNAME PROMPT ═══════════════
function renderSignInGate(targetPath) {
  cleanupListeners();
  const label = targetPath === "/dashboard" ? "your dashboard"
    : targetPath === "/friends" ? "your friends"
    : targetPath === "/leaderboard" ? "leaderboards" : "this page";
  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">🔒</span>
      <h1 class="title">Sign in to continue</h1>
      <p class="subtitle">Sign in with Google to access ${esc(label)}.</p>
      <button class="primary-btn" id="gateSignIn">Sign in with Google</button>
      <button class="back-btn" id="gateHome">← Back home</button>
    </div>`;
  $("#gateSignIn").addEventListener("click", () => Auth.signInWithGoogle());
  $("#gateHome").addEventListener("click", () => navigate("/"));
}

function renderUsernamePrompt() {
  cleanupListeners();
  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">✨</span>
      <h1 class="title">Pick a username</h1>
      <p class="subtitle">This is how friends find you. 3–20 characters: letters, numbers, underscore.</p>
      <input class="name-input" type="text" placeholder="username" maxlength="20" id="usernameInput" autocomplete="off">
      <p class="hint" id="usernameError" style="color:var(--danger);display:none;"></p>
      <button class="primary-btn" id="usernameSave">Save username</button>
    </div>`;
  const inp = $("#usernameInput");
  const btn = $("#usernameSave");
  const err = $("#usernameError");
  const showErr = (m) => { err.textContent = m; err.style.display = m ? "block" : "none"; };
  inp.focus();
  btn.addEventListener("click", async () => {
    if (!state.user) return;
    const v = Auth.validateUsername(inp.value);
    if (!v.ok) { showErr(v.error); return; }
    btn.disabled = true; showErr("");
    const res = await Auth.claimUsername(state.user.uid, inp.value);
    btn.disabled = false;
    if (!res.ok) { showErr(res.error); return; }
    state.user.username = res.value;
    state.user.usernameDisplay = res.display;
    Auth.renderChrome(state.user);
    // Continue to wherever they were headed, else home.
    const dest = state.pendingRoute ? "/" + state.pendingRoute.replace(/^\//, "") : "/";
    state.pendingRoute = null;
    navigate(dest.startsWith("/") ? dest : "/" + dest);
  });
}

// ═══════════════ FRIENDS PAGE ═══════════════
function friendRowHtml(f, actionHtml) {
  const label = esc(f.usernameDisplay || f.username || "(unknown)");
  const avatar = f.photoURL
    ? `<img class="friend-avatar" src="${esc(f.photoURL)}" alt="">`
    : `<span class="friend-avatar friend-avatar-fallback">${esc((label[0] || "?").toUpperCase())}</span>`;
  return `
    <div class="friend-row">
      <div class="friend-id">${avatar}<span class="friend-name">${label}</span></div>
      <div class="friend-action">${actionHtml || ""}</div>
    </div>`;
}

async function renderFriends(params) {
  cleanupListeners();
  const me = state.user;
  if (!me) { state.pendingRoute = "friends"; renderSignInGate("/friends"); return; }

  // Skeleton first.
  app().innerHTML = `
    <div class="card wide">
      <div class="page-head">
        <button class="back-btn" id="friendsHome">← Home</button>
        <h1 class="title">Friends</h1>
      </div>

      <div class="friends-section">
        <p class="share-label">Your invite link</p>
        <div class="link-box"><span class="link-text" id="inviteLink">Generating…</span></div>
        <button class="share-btn" id="copyInviteBtn" style="margin-top:10px;">Copy invite link</button>
      </div>

      <div class="friends-section">
        <p class="share-label">Add by username</p>
        <div class="search-row">
          <input class="name-input" id="friendSearch" placeholder="username" maxlength="20" autocomplete="off" style="margin-bottom:0;text-align:left;">
          <button class="primary-btn" id="friendSearchBtn" style="width:auto;padding:14px 18px;">Search</button>
        </div>
        <div id="searchResult"></div>
      </div>

      <div class="friends-section" id="requestsSection" style="display:none;">
        <p class="share-label">Friend requests</p>
        <div id="requestsList"></div>
      </div>

      <div class="friends-section">
        <p class="share-label">Your friends</p>
        <div id="friendsList"><p class="hint">Loading…</p></div>
      </div>
    </div>`;

  $("#friendsHome").addEventListener("click", () => navigate("/"));

  // Invite link
  friendRepo.getOrCreateInviteCode(me).then((code) => {
    const el = $("#inviteLink");
    if (!el) return;
    if (!code) { el.textContent = "Couldn't generate a link."; return; }
    const url = `${location.origin}${location.pathname}#/friends?invite=${code}`;
    el.textContent = url;
    const copyBtn = $("#copyInviteBtn");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(url).catch(() => {});
      copyBtn.textContent = "✓ Copied!";
      setTimeout(() => { if ($("#copyInviteBtn")) copyBtn.textContent = "Copy invite link"; }, 2000);
    });
  });

  // Username search
  const doSearch = async () => {
    const q = $("#friendSearch").value;
    const out = $("#searchResult");
    out.innerHTML = `<p class="hint">Searching…</p>`;
    const found = await friendRepo.findByUsername(q);
    if (!found) { out.innerHTML = `<p class="hint">No user found with that username.</p>`; return; }
    if (found.uid === me.uid) { out.innerHTML = `<p class="hint">That's you!</p>`; return; }
    out.innerHTML = friendRowHtml(found, `<button class="share-btn" id="addFriendBtn">Add</button>`);
    $("#addFriendBtn").addEventListener("click", async () => {
      const b = $("#addFriendBtn");
      b.disabled = true; b.textContent = "Sending…";
      const res = await friendRepo.sendRequest(me, found, "search");
      b.textContent = res.ok ? "Request sent ✓" : (res.error || "Failed");
      if (!res.ok) b.disabled = false;
    });
  };
  $("#friendSearchBtn").addEventListener("click", doSearch);
  $("#friendSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

  // If arriving via an invite link, handle it.
  if (params && params.invite) {
    await handleInvite(params.invite, me);
  }

  // Pending requests + friends list. Load friends first so we can hide any
  // requests from people we're already friends with (simultaneous-request case).
  await refreshFriendsList(me);
  await refreshRequests(me);
}

// Cache the current friends' uids so requests can filter against them.
let _friendUids = new Set();

async function refreshRequests(me) {
  const reqs = await friendRepo.incomingRequests(me.uid);
  const section = $("#requestsSection");
  const list = $("#requestsList");
  if (!section || !list) return;
  // Drop requests from people we're already friends with.
  const visible = reqs.filter((r) => !_friendUids.has(r.fromUid));
  if (!visible.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  list.innerHTML = visible.map((r) => friendRowHtml(
    { usernameDisplay: r.fromUsername, photoURL: r.fromPhotoURL },
    `<button class="share-btn req-accept" data-id="${esc(r.id)}">Accept</button>
     <button class="back-btn req-decline" data-id="${esc(r.id)}" style="margin-top:0;">Decline</button>`
  )).join("");
  list.querySelectorAll(".req-accept").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    await friendRepo.acceptRequest(b.dataset.id, me.uid);
    await refreshFriendsList(me);
    await refreshRequests(me);
  }));
  list.querySelectorAll(".req-decline").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    await friendRepo.declineRequest(b.dataset.id, me.uid);
    await refreshRequests(me);
  }));
}

async function refreshFriendsList(me) {
  const list = $("#friendsList");
  if (!list) return;
  const friends = await friendRepo.listFriends(me.uid);
  _friendUids = new Set(friends.map((f) => f.uid));
  if (!friends.length) {
    list.innerHTML = `<p class="hint">No friends yet — add someone by username or share your invite link.</p>`;
    return;
  }
  list.innerHTML = friends.map((f) => friendRowHtml(
    f,
    `<button class="back-btn friend-remove" data-uid="${esc(f.uid)}" data-name="${esc(f.usernameDisplay || "")}" style="margin-top:0;">Remove</button>`
  )).join("");
  list.querySelectorAll(".friend-remove").forEach((b) => b.addEventListener("click", async () => {
    const name = b.dataset.name || "this friend";
    if (b.dataset.confirm !== "1") {
      b.dataset.confirm = "1";
      b.textContent = "Confirm?";
      b.classList.add("confirm-danger");
      // Reset if not confirmed within a few seconds.
      setTimeout(() => {
        if (b && b.dataset.confirm === "1") {
          b.dataset.confirm = "0"; b.textContent = "Remove"; b.classList.remove("confirm-danger");
        }
      }, 3500);
      return;
    }
    b.disabled = true; b.textContent = "Removing…";
    await friendRepo.removeFriend(me.uid, b.dataset.uid);
    await refreshFriendsList(me);
    await refreshRequests(me);
  }));
}

async function handleInvite(code, me) {
  const owner = await friendRepo.resolveInviteCode(code);
  const out = $("#searchResult");
  if (!owner) return;
  if (owner.uid === me.uid) return; // your own link
  if (await friendRepo.friendshipExists(me.uid, owner.uid)) {
    if (out) out.innerHTML = `<p class="hint">You're already friends with ${esc(owner.usernameDisplay)}.</p>`;
    return;
  }
  const res = await friendRepo.sendRequest(me, owner, "invite");
  if (out) {
    out.innerHTML = res.ok
      ? `<p class="hint">Friend request sent to ${esc(owner.usernameDisplay)} ✓</p>`
      : `<p class="hint">${esc(res.error || "Couldn't send request.")}</p>`;
  }
}

// ═══════════════ AUTH WIRING ═══════════════
// Claim games this browser's guest finished, attaching them to the now
// signed-in user. Only drops a game from the pending list once it's been
// successfully claimed — failed/transient claims stay for a later retry.
async function claimPendingGames(uid) {
  const pending = getPendingGames();
  if (!pending.length) return;
  const remaining = [];
  for (const p of pending) {
    const ok = await gameRepo.claimSide(p.gameId, p.side, uid, state.guestId);
    if (!ok) remaining.push(p);
  }
  localStorage.setItem("dd_pending_games", JSON.stringify(remaining));
}

Auth.onUserChange = async (userObj) => {
  const wasSignedOut = !state.user;
  state.user = userObj;

  if (userObj) {
    if (wasSignedOut) await claimPendingGames(userObj.uid);
    // First-time user with no username → prompt (unless mid-game).
    const midGame = ["play", "p2-play"].includes(state.screen);
    if (!userObj.username && !midGame) {
      state.screen = "username";
      render();
      return;
    }
    // Replay a route they were gated from.
    if (state.pendingRoute) {
      const dest = "/" + state.pendingRoute.replace(/^\//, "");
      state.pendingRoute = null;
      navigate(dest);
      return;
    }
  }
  // Re-render current page so signed-in/guest UI updates.
  routeAndRender();
};

// ═══════════════ BOOT ═══════════════
// Router drives the first render; Auth.onAuthStateChanged fires async and
// will re-render once the user is known.
routeAndRender();

(function() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  btn.textContent = saved === 'light' ? '☀️' : '🌙';
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    btn.textContent = next === 'light' ? '☀️' : '🌙';
  });
})();
