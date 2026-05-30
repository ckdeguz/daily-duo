const db = firebase.database();

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

const fbStorage = {
  async get(key) {
    try {
      const snap = await db.ref("sessions/" + key).once("value");
      return snap.exists() ? snap.val() : null;
    } catch (e) { console.error("Firebase get error:", e); return null; }
  },
  async set(key, val) {
    try {
      await db.ref("sessions/" + key).set(val);
      return true;
    } catch (e) { console.error("Firebase set error:", e); return false; }
  }
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
    case "error": return renderError();
    default: app().innerHTML = "";
  }
}

function renderLoading() {
  app().innerHTML = '<div class="card"><div class="spinner"></div><p class="subtitle" style="margin-top:12px">Loading...</p></div>';
}

function renderHome() {
  const shareUrl = location.origin + location.pathname;
  const shareText = "Try Daily Duo! 10 daily questions to see how well you know your friends ⚡";
  const hasNativeShare = !!navigator.share;

  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">⚡</span>
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
  const url = `${location.origin}${location.pathname}#${state.sessionId}`;
  app().innerHTML = `
    <div class="card">
      <span class="logo-icon">🔗</span>
      <h1 class="title">You're all set!</h1>
      <p class="subtitle">Send this link to your friend. They'll answer the same questions and guess yours too. Come back to this link to see results!</p>
      <div class="link-box"><span class="link-text">${esc(url)}</span></div>
      <button class="primary-btn" id="copyBtn">Copy Link</button>
      <p class="hint">Bookmark or save this link - you'll need it to see results!</p>
    </div>`;
  $("#copyBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(url).catch(() => {});
    $("#copyBtn").textContent = "✓ Copied!";
    setTimeout(() => { if ($("#copyBtn")) $("#copyBtn").textContent = "Copy Link"; }, 2000);
  });
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
function generateShareImage(r, p1Score, p2Score, totalScore, emoji, msg) {
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

  ctx.textAlign = "center";
  ctx.font = "80px sans-serif";
  ctx.fillStyle = "#e8e6e3";
  ctx.fillText("⚡", W / 2, 160);

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

function shareResultsImage() {
  const r = state.results;
  const p1Score = r.p1Guesses.reduce((s, g, i) => s + (g === r.p2Answers[i] ? 1 : 0), 0);
  const p2Score = r.p2Guesses.reduce((s, g, i) => s + (g === r.p1Answers[i] ? 1 : 0), 0);
  const totalScore = p1Score + p2Score;
  const emoji = totalScore === 20 ? "🔥" : totalScore >= 16 ? "🔥" : totalScore >= 10 ? "🤝" : "😅";
  const msg = totalScore === 20 ? "Perfect sync!" : totalScore >= 16 ? "Almost telepathic!" : totalScore >= 10 ? "Not bad at all!" : totalScore >= 6 ? "Room to grow!" : "Opposites attract?";

  const canvas = generateShareImage(r, p1Score, p2Score, totalScore, emoji, msg);

  canvas.toBlob(async (blob) => {
    const file = new File([blob], "daily-duo-results.png", { type: "image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: "Daily Duo Results", text: "Check out our Daily Duo score! ⚡", files: [file] });
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
  $("#replayBtn").addEventListener("click", () => { location.hash = ""; location.reload(); });
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
  $("#homeBtn").addEventListener("click", () => { location.hash = ""; location.reload(); });
}

// ═══════════════ SAVE FUNCTIONS ═══════════════
async function saveP1() {
  renderLoading();
  const id = generateId();
  const payload = {
    p1Name: state.p1Name,
    p1Answers: state.p1Answers,
    p1Guesses: state.p1Guesses,
    questions: state.questions,
    dateSeed: getDateSeed(),
    createdAt: Date.now(),
  };
  const ok = await fbStorage.set(id, payload);
  state.animating = false;
  if (ok) {
    state.sessionId = id;
    state.screen = "share";
  } else {
    state.errorMsg = "Couldn't save your answers. Please check your connection and try again.";
    state.screen = "error";
  }
  render();
}

async function saveP2() {
  renderLoading();
  const data = await fbStorage.get(state.sessionId);
  state.animating = false;
  if (!data) {
    state.errorMsg = "Session not found.";
    state.screen = "error";
    render();
    return;
  }
  data.p2Name = state.p2Name;
  data.p2Answers = state.p2Answers;
  data.p2Guesses = state.p2Guesses;
  await fbStorage.set(state.sessionId, data);
  state.results = data;
  state.screen = "results";
  render();
}

// ═══════════════ INIT ═══════════════
async function init() {
  const hash = location.hash.replace("#", "");
  if (hash) {
    const data = await fbStorage.get(hash);
    if (data) {
      state.sessionId = hash;
      if (data.p2Answers && data.p2Guesses) {
        state.results = data;
        state.screen = "results";
      } else {
        state.p1Name = data.p1Name || "Player 1";
        if (data.questions) state.questions = data.questions;
        state.screen = "p2-intro";
      }
    } else {
      state.errorMsg = "This link doesn't seem to be valid or may have expired.";
      state.screen = "error";
    }
  } else {
    state.screen = "home";
  }
  render();
}

init();

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
