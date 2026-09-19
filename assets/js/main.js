/**
 * Boshra Girls' Primary School - Educational Portal
 * assets/js/main.js
 *
 * Wires up index.html: student login, session restore, and the
 * dynamic 26-game hub grid. Depends on google-sync.js being loaded
 * first (defines syncRegisterStudent / getCurrentStudent).
 */

// Lesson titles for the 26 games — replace with real lesson names.
const LESSON_NAMES = [
  'درس ۱', 'درس ۲', 'درس ۳', 'درس ۴', 'درس ۵', 'درس ۶', 'درس ۷', 'درس ۸',
  'درس ۹', 'درس ۱۰', 'درس ۱۱', 'درس ۱۲', 'درس ۱۳', 'درس ۱۴', 'درس ۱۵', 'درس ۱۶',
  'درس ۱۷', 'درس ۱۸', 'درس ۱۹', 'درس ۲۰', 'درس ۲۱', 'درس ۲۲', 'درس ۲۳', 'درس ۲۴',
  'درس ۲۵', 'درس ۲۶'
];

const TOTAL_GAMES = 26;

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
document.addEventListener('DOMContentLoaded', () => {
  const existing = getCurrentStudent();
  if (existing) {
    showHub(existing);
  } else {
    showLogin();
  }
});

// ---------- Screen switching ----------
function showLogin() {
  loginScreen.classList.remove('hidden');
  hubScreen.classList.add('hidden');
}

function showHub(student) {
  loginScreen.classList.add('hidden');
  hubScreen.classList.remove('hidden');
  studentNameDisplay.textContent = student.fullName;
  renderGamesGrid();
}

// ---------- Login ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const studentCode = document.getElementById('studentCode').value.trim();
  const fullName = document.getElementById('fullName').value.trim();

  if (!studentCode || !fullName) {
    loginError.textContent = 'لطفاً هر دو فیلد را پر کنید';
    return;
  }

  setLoginLoading(true);
  const result = await syncRegisterStudent(studentCode, fullName, '');
  setLoginLoading(false);

  if (result.success) {
    showHub({ studentCode, fullName });
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
function renderGamesGrid() {
  gamesGrid.innerHTML = '';

  for (let i = 1; i <= TOTAL_GAMES; i++) {
    const tile = document.createElement('a');
    tile.href = `games/game${String(i).padStart(2, '0')}.html`;
    tile.className = 'game-tile';
    tile.innerHTML = `
      <span class="tile-number">${toPersianDigits(i)}</span>
      <span class="tile-name">${LESSON_NAMES[i - 1] || 'درس ' + i}</span>
    `;
    gamesGrid.appendChild(tile);
  }
}

// ---------- Helpers ----------
function toPersianDigits(num) {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(num).replace(/[0-9]/g, (d) => persianDigits[d]);
}
