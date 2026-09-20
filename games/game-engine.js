/**
 * Boshra Girls' Primary School - Educational Portal
 * games/game-engine.js
 *
 * Shared engine for all 26 lesson games. Each game*.html only needs to
 * call GameEngine.start(gameId) inside a #gameRoot container — no game
 * logic should be duplicated per-file.
 *
 * Depends on google-sync.js (must be loaded first) for:
 *   getCurrentStudent, syncCheckAttempts, syncGetQuestions,
 *   syncGetGameSettings, syncSaveResult
 *
 * Flow:
 *   1. Verify student session + remaining attempts (server-side check)
 *   2. Countdown timer starts
 *   3. Stage 1 — bubble-pop multiple choice
 *   4. Stage 2 — 3D flip memory-match (question <-> correct answer)
 *   5. Results screen — correct/wrong counts only, no numeric score
 */

const GameEngine = (() => {

  let state = {
    gameId: null,
    student: null,
    questions: [],
    settings: null,
    correctCount: 0,
    wrongCount: 0,
    timerInterval: null,
    timeLeft: 0,
    root: null
  };

  // ---------- Public entry point ----------

  async function start(gameId) {
    state.gameId = gameId;
    state.root = document.getElementById('gameRoot');
    injectStyles();

    state.student = getCurrentStudent();
    if (!state.student) {
      renderMessage('برای شرکت در بازی ابتدا باید وارد پرتال شوید.', 'بازگشت به صفحه ورود', '../index.html');
      return;
    }

    renderLoading('در حال بررسی امکان شرکت در آزمون...');

    const attemptCheck = await syncCheckAttempts(state.student.studentCode, gameId);
    if (!attemptCheck.success) {
      renderMessage(attemptCheck.error || 'امکان شرکت در این آزمون وجود ندارد.', 'بازگشت به هاب بازی‌ها', '../index.html');
      return;
    }
    state.attemptInfo = attemptCheck;

    renderLoading('در حال آماده‌سازی سوالات...');

    const [questionsResult, settingsResult] = await Promise.all([
      syncGetQuestions(gameId),
      syncGetGameSettings(gameId)
    ]);

    if (!questionsResult.success || !questionsResult.questions.length) {
      renderMessage('سوالی برای این بازی یافت نشد.', 'بازگشت به هاب بازی‌ها', '../index.html');
      return;
    }

    state.questions = questionsResult.questions;
    state.settings = settingsResult.success ? settingsResult : { timerSeconds: 300 };
    state.correctCount = 0;
    state.wrongCount = 0;

    startTimer(state.settings.timerSeconds || 300);
    runStage1();
  }

  // ---------- Timer ----------

  function startTimer(seconds) {
    state.timeLeft = seconds;
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
      state.timeLeft--;
      updateTimerDisplay();
      if (state.timeLeft <= 0) {
        clearInterval(state.timerInterval);
        finishGame();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    let bar = document.getElementById('gameTimerBar');
    if (!bar) return;
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    bar.textContent = `⏱ ${toFa(m)}:${toFa(s < 10 ? '0' + s : s)}`;
  }

  function stopTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
  }

  // ---------- Stage 1: Bubble pop ----------

  function runStage1() {
    const half = Math.ceil(state.questions.length / 2);
    state.stage1Questions = state.questions.slice(0, half);
    state.stage2Questions = state.questions.slice(half);
    state.stage1Index = 0;
    renderStage1Question();
  }

  function renderStage1Question() {
    const q = state.stage1Questions[state.stage1Index];
    if (!q) {
      runStage2();
      return;
    }

    const options = shuffle(q.options.map((text, i) => ({ text, isCorrect: text === q.correctAnswer })));

    state.root.innerHTML = `
      ${topBar('مرحله ۱ از ۲ — حباب‌های دانش')}
      <div class="stage-progress">${toFa(state.stage1Index + 1)} از ${toFa(state.stage1Questions.length)}</div>
      <h2 class="question-text">${q.questionText}</h2>
      <div class="bubble-field">
        ${options.map((opt, i) => `
          <button class="bubble" data-correct="${opt.isCorrect}" data-idx="${i}">
            <span>${opt.text}</span>
          </button>
        `).join('')}
      </div>
      <div class="feedback-msg" id="feedbackMsg"></div>
    `;

    state.root.querySelectorAll('.bubble').forEach((btn) => {
      btn.addEventListener('click', () => handleStage1Answer(btn));
    });
  }

  function handleStage1Answer(btn) {
    const isCorrect = btn.dataset.correct === 'true';
    const feedback = document.getElementById('feedbackMsg');
    state.root.querySelectorAll('.bubble').forEach((b) => b.disabled = true);

    if (isCorrect) {
      state.correctCount++;
      btn.classList.add('bubble-burst');
      feedback.textContent = '✅ آفرین!';
      feedback.className = 'feedback-msg feedback-correct';
    } else {
      state.wrongCount++;
      btn.classList.add('bubble-wrong');
      feedback.textContent = '❌ اشتباه بود گلم!';
      feedback.className = 'feedback-msg feedback-wrong';
    }

    setTimeout(() => {
      state.stage1Index++;
      renderStage1Question();
    }, isCorrect ? 900 : 1300);
  }

  // ---------- Stage 2: Memory flip-match ----------

  function runStage2() {
    // Build pairs from up to 4 leftover questions (8 cards max) to keep the board manageable.
    const pairSource = state.stage2Questions.slice(0, 4);

    if (pairSource.length === 0) {
      finishGame();
      return;
    }

    const cards = [];
    pairSource.forEach((q, i) => {
      cards.push({ pairId: i, type: 'question', label: q.questionText });
      cards.push({ pairId: i, type: 'answer', label: q.correctAnswer });
    });
    state.stage2Cards = shuffle(cards);
    state.stage2Flipped = [];
    state.stage2Matched = new Set();
    state.stage2Locked = false;

    renderStage2(true); // memorize phase — all face up

    setTimeout(() => {
      renderStage2(false);
    }, 4000);
  }

  function renderStage2(faceUp) {
    state.root.innerHTML = `
      ${topBar('مرحله ۲ از ۲ — کارت‌های حافظه')}
      <div class="stage-progress">${faceUp ? 'کارت‌ها را به خاطر بسپار...' : 'کارت‌های جفت را پیدا کن'}</div>
      <div class="memory-grid">
        ${state.stage2Cards.map((card, i) => `
          <button class="memory-card ${faceUp || state.stage2Matched.has(card.pairId) ? 'face-up' : ''}"
                  data-idx="${i}" ${state.stage2Matched.has(card.pairId) ? 'disabled' : ''}>
            <span class="memory-card-inner">${card.label}</span>
          </button>
        `).join('')}
      </div>
      <div class="feedback-msg" id="feedbackMsg"></div>
    `;

    if (!faceUp) {
      state.root.querySelectorAll('.memory-card').forEach((btn) => {
        btn.addEventListener('click', () => handleStage2Flip(Number(btn.dataset.idx)));
      });
    }
  }

  function handleStage2Flip(idx) {
    if (state.stage2Locked) return;
    const card = state.stage2Cards[idx];
    if (state.stage2Matched.has(card.pairId)) return;
    if (state.stage2Flipped.includes(idx)) return;

    const btn = state.root.querySelector(`.memory-card[data-idx="${idx}"]`);
    btn.classList.add('face-up');
    state.stage2Flipped.push(idx);

    if (state.stage2Flipped.length < 2) return;

    state.stage2Locked = true;
    const [i1, i2] = state.stage2Flipped;
    const c1 = state.stage2Cards[i1];
    const c2 = state.stage2Cards[i2];
    const feedback = document.getElementById('feedbackMsg');
    const isMatch = c1.pairId === c2.pairId && c1.type !== c2.type;

    setTimeout(() => {
      if (isMatch) {
        state.correctCount++;
        state.stage2Matched.add(c1.pairId);
        feedback.textContent = '✅ آفرین!';
        feedback.className = 'feedback-msg feedback-correct';
      } else {
        state.wrongCount++;
        feedback.textContent = '❌ اشتباه بود گلم!';
        feedback.className = 'feedback-msg feedback-wrong';
        [i1, i2].forEach((idx2) => {
          const b = state.root.querySelector(`.memory-card[data-idx="${idx2}"]`);
          if (b) b.classList.remove('face-up');
        });
      }

      state.stage2Flipped = [];
      state.stage2Locked = false;

      if (state.stage2Matched.size === state.stage2Cards.length / 2) {
        setTimeout(finishGame, 700);
      }
    }, 700);
  }

  // ---------- Finish & results ----------

  async function finishGame() {
    stopTimer();
    renderLoading('در حال ثبت نتیجه...');

    const result = await syncSaveResult(
      state.student.studentCode,
      state.gameId,
      state.correctCount,
      state.wrongCount
    );

    renderResults(result);
  }

  function renderResults(saveResult) {
    const perfect = state.wrongCount === 0;
    const official = saveResult && saveResult.isOfficial;
    const attempts = state.correctCount + state.wrongCount;
    const finalScore = attempts === 0 ? 0 : Math.round((state.correctCount / attempts) * 100);

    state.root.innerHTML = `
      <div class="results-card">
        ${perfect ? '<div class="perfect-badge">🌟 عالی بود! بدون هیچ غلطی! 🌟</div>' : ''}
        <h2>کارنامه بازی</h2>
        <div class="result-score">امتیاز: <strong>${toFa(finalScore)} از ۱۰۰</strong></div>
        <div class="results-row">
          <div class="result-box result-correct">
            <span class="result-num">${toFa(state.correctCount)}</span>
            <span>پاسخ درست</span>
          </div>
          <div class="result-box result-wrong">
            <span class="result-num">${toFa(state.wrongCount)}</span>
            <span>پاسخ اشتباه</span>
          </div>
        </div>
        <p class="attempt-note">
          ${official
            ? 'این نوبت به‌عنوان نمره‌ی رسمی شما ثبت شد.'
            : 'این نوبت فقط برای تمرین ثبت شد و در نمره‌ی رسمی شما محاسبه نمی‌شود.'}
        </p>
        <a href="../index.html" class="btn btn-primary" style="max-width:280px; margin:0 auto; display:flex;">بازگشت به هاب بازی‌ها</a>
      </div>
    `;
  }

  // ---------- Rendering helpers ----------

  function topBar(title) {
    return `
      <div class="game-topbar">
        <span>${title}</span>
        <span id="gameTimerBar" class="timer-pill"></span>
      </div>
    `;
  }

  function renderLoading(text) {
    state.root.innerHTML = `
      <div class="center-message">
        <div class="loader"></div>
        <p>${text}</p>
      </div>
    `;
  }

  function renderMessage(text, btnLabel, href) {
    state.root.innerHTML = `
      <div class="center-message">
        <p>${text}</p>
        <a href="${href}" class="btn btn-primary" style="max-width:260px;">${btnLabel}</a>
      </div>
    `;
  }

  // ---------- Utilities ----------

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function toFa(num) {
    const d = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(num).replace(/[0-9]/g, (x) => d[x]);
  }

  // ---------- Game-specific styles (kept separate from the portal's own style.css) ----------

  function injectStyles() {
    if (document.getElementById('gameEngineStyles')) return;
    const style = document.createElement('style');
    style.id = 'gameEngineStyles';
    style.textContent = `
      .game-topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        max-width: 720px;
        margin-bottom: 18px;
        font-size: 0.95rem;
        color: var(--text-muted, #D8CCEB);
      }
      .timer-pill {
        background: rgba(255,255,255,0.14);
        border: 1px solid rgba(255,255,255,0.3);
        padding: 6px 14px;
        border-radius: 999px;
        font-weight: 700;
        color: var(--text-light, #fff);
      }
      .stage-progress {
        color: var(--text-muted, #D8CCEB);
        margin-bottom: 8px;
        font-size: 0.9rem;
      }
      .question-text {
        text-align: center;
        max-width: 640px;
        margin: 0 0 28px;
        font-size: clamp(1.1rem, 3vw, 1.5rem);
      }
      .bubble-field {
        display: grid;
        grid-template-columns: repeat(2, minmax(140px, 1fr));
        gap: 20px;
        width: 100%;
        max-width: 640px;
      }
      .bubble {
        position: relative;
        aspect-ratio: 1;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 60%),
                    linear-gradient(135deg, var(--accent-coral, #FF7F8E), var(--accent-mint, #6FCF97));
        color: #fff;
        font-family: inherit;
        font-weight: 700;
        font-size: 0.95rem;
        padding: 12px;
        box-shadow: 0 10px 26px rgba(0,0,0,0.25), inset 0 0 20px rgba(255,255,255,0.25);
        transition: transform 0.15s ease;
      }
      .bubble:hover:not(:disabled) { transform: scale(1.05); }
      .bubble:disabled { cursor: default; }
      .bubble-burst {
        animation: burst 0.5s ease forwards;
      }
      .bubble-wrong {
        animation: shake 0.4s ease;
        filter: grayscale(0.4) brightness(0.85);
      }
      @keyframes burst {
        0% { transform: scale(1); opacity: 1; }
        60% { transform: scale(1.3); opacity: 0.6; }
        100% { transform: scale(1.8); opacity: 0; }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-6px); }
        75% { transform: translateX(6px); }
      }
      .feedback-msg {
        margin-top: 22px;
        font-size: 1.1rem;
        font-weight: 700;
        min-height: 1.6em;
      }
      .feedback-correct { color: var(--accent-mint, #6FCF97); }
      .feedback-wrong { color: #FFB3BA; }

      .memory-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(90px, 1fr));
        gap: 14px;
        width: 100%;
        max-width: 640px;
        perspective: 800px;
      }
      .memory-card {
        aspect-ratio: 3/4;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.3);
        background: linear-gradient(135deg, #563A7A, #2E1F47);
        cursor: pointer;
        color: transparent;
        font-family: inherit;
        transition: transform 0.5s;
        transform-style: preserve-3d;
        position: relative;
      }
      .memory-card.face-up {
        background: rgba(255,255,255,0.9);
        color: var(--text-deep, #2E1F47);
        transform: rotateY(180deg);
      }
      .memory-card-inner {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px;
        font-size: 0.75rem;
        font-weight: 600;
        transform: rotateY(180deg);
        text-align: center;
      }
      .memory-card:not(.face-up) .memory-card-inner { opacity: 0; }

      .center-message {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .results-card {
        background: rgba(255,255,255,0.14);
        border: 1px solid rgba(255,255,255,0.32);
        backdrop-filter: blur(18px);
        border-radius: 28px;
        padding: 36px 28px;
        text-align: center;
        max-width: 420px;
        width: 100%;
      }
      .perfect-badge {
        font-size: 1.1rem;
        font-weight: 900;
        color: var(--accent-gold, #FFC857);
        margin-bottom: 14px;
        animation: pulse 1.4s ease infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.06); }
      }
      .results-row {
        display: flex;
        gap: 16px;
        justify-content: center;
        margin: 20px 0;
      }
      .result-box {
        flex: 1;
        border-radius: 18px;
        padding: 18px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .result-correct { background: rgba(111, 207, 151, 0.22); }
      .result-wrong { background: rgba(255, 127, 142, 0.22); }
      .result-num { font-size: 1.8rem; font-weight: 900; }
      .attempt-note {
        font-size: 0.85rem;
        color: var(--text-muted, #D8CCEB);
        margin-bottom: 20px;
      }
    `;
    document.head.appendChild(style);
  }

  return { start };
})();
