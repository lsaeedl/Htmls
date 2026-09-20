/**
 * Boshra Girls' Primary School - Educational Portal
 * assets/js/main.js
 *
 * Wires up index.html: student login, session restore, and the
 * dynamic 26-game hub grid. Depends on google-sync.js being loaded
 * first (defines syncRegisterStudent / getCurrentStudent).
 */

// ---------- Elements ----------
const loginScreen = document.getElementById('loginScreen');
const hubScreen = document.getElementById('hubScreen');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const loginError = document.getElementById('loginError');
const studentNameDisplay = document.getElementById('studentNameDisplay');
const gamesGrid = document.getElementById('gamesGrid');
const logoutBtn = document.getElementById('logoutBtn');

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  const existing = getCurrentStudent();
  if (existing) {
    showHub(existing);
  } else {
    showLogin();
    loadClassOptions();
  }
});

async function loadClassOptions() {
  const select = document.getElementById('classSelect');
  const result = await syncListClasses();

  if (!result.success || !result.classes.length) {
    select.innerHTML = '<option value="">کلاسی تعریف نشده — با آموزگار خود صحبت کنید</option>';
    return;
  }

  select.innerHTML = '<option value="">کلاس خود را انتخاب کنید</option>' +
    result.classes.map(c => `<option value="${c}">${c}</option>`).join('');
}

// ---------- Screen switching ----------
function showLogin() {
  loginScreen.classList.remove('hidden');
  hubScreen.classList.add('hidden');
}

function showHub(student) {
  loginScreen.classList.add('hidden');
  hubScreen.classList.remove('hidden');
  studentNameDisplay.textContent = student.fullName;
  loadAndRenderGames();
}

// ---------- Login ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const studentCode = normalizeDigits(document.getElementById('studentCode').value.trim());
  const fullName = document.getElementById('fullName').value.trim();
  const className = document.getElementById('classSelect').value;

  if (!studentCode || !fullName || !className) {
    loginError.textContent = 'لطفاً همه‌ی فیلدها را پر کنید';
    return;
  }

  setLoginLoading(true);
  const result = await syncRegisterStudent(studentCode, fullName, className);
  setLoginLoading(false);

  if (result.success) {
    showHub({ studentCode, fullName, className });
  } else {
    loginError.textContent = result.error || 'خطایی رخ داد، دوباره تلاش کنید';
  }
});

function setLoginLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtnText.textContent = isLoading ? 'در حال ورود...' : 'ورود به پرتال';
}

// ---------- Logout ----------
logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('student');
  loginForm.reset();
  showLogin();
});

// ---------- Games grid ----------

/**
 * Games are defined entirely in the "Games" sheet tab now — no hardcoded
 * list here. type "template" games are played via games/play.html?gameId=N
 * (game-engine.js); type "custom" games link straight to their own file.
 */
async function loadAndRenderGames() {
  gamesGrid.innerHTML = `<div class="center-message" style="grid-column:1/-1;"><div class="loader"></div></div>`;

  const result = await syncListGames();

  if (!result.success || !result.games.length) {
    gamesGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">بازی‌ای هنوز اضافه نشده است.</p>`;
    return;
  }

  gamesGrid.innerHTML = '';
  result.games.forEach((game) => {
    const tile = document.createElement('a');
    tile.href = game.type === 'custom' && game.customFile
      ? game.customFile
      : `games/play.html?gameId=${encodeURIComponent(game.gameId)}`;
    tile.className = 'game-tile';

    const thumb = game.imageUrl
      ? `<img src="${game.imageUrl}" alt="" style="width:100%; height:72px; object-fit:cover; border-radius:12px; margin-bottom:6px;">`
      : '';

    tile.innerHTML = `
      ${thumb}
      <span class="tile-number" style="color:${game.accentColor || 'var(--accent-gold)'}">${game.icon || '🎮'}</span>
      <span class="tile-name">${game.title || ('درس ' + game.gameId)}</span>
    `;
    gamesGrid.appendChild(tile);
  });
}

// ---------- Helpers ----------

/**
 * Converts Persian/Arabic-Indic digits to Western digits, so a student
 * typing their code on a Persian keyboard doesn't end up with a
 * different-looking code than the same code typed in Latin numerals
 * (which would otherwise create a duplicate account server-side).
 */
function normalizeDigits(value) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(value).replace(/[۰-۹٠-٩]/g, (ch) => {
    let idx = persian.indexOf(ch);
    if (idx === -1) idx = arabic.indexOf(ch);
    return idx;
  });
}

function toPersianDigits(num) {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(num).replace(/[0-9]/g, (d) => persianDigits[d]);
}
