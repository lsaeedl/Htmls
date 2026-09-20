/**
 * Boshra Girls' Primary School - Educational Portal
 * assets/js/google-sync.js
 *
 * All communication with the Google Apps Script backend goes through
 * this file. Includes a hybrid cache (sessionStorage for session data,
 * localStorage for question banks) as a fallback when the connection
 * to the backend is unavailable.
 */

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwpztBuap_tKQ1JbGo4GWYhBgzLTKl4WZ6bs8pVkJmxadLAVsm2_HvUFg4zdRlcGXBEjg/exec';

// Apps Script Web Apps don't send permissive CORS headers for
// non-simple requests, so POST bodies are sent as text/plain to stay
// a "simple request" and avoid a CORS preflight.
const POST_CONTENT_TYPE = 'text/plain;charset=utf-8';

// ---------- Low-level request helpers ----------

async function gsGet(action, params = {}) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const url = `${SCRIPT_URL}?${query}`;

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } catch (err) {
    console.error('gsGet failed:', action, err);
    return { success: false, error: 'خطا در ارتباط با سرور', offline: true };
  }
}

async function gsPost(action, payload = {}) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': POST_CONTENT_TYPE },
      body: JSON.stringify({ action, ...payload })
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } catch (err) {
    console.error('gsPost failed:', action, err);
    return { success: false, error: 'خطا در ارتباط با سرور', offline: true };
  }
}

// ---------- Students ----------

/**
 * Registers/validates a student and stores the session in sessionStorage.
 * Session data is intentionally NOT the source of truth for "already
 * took this quiz" — that check always goes back to the server.
 */
async function syncRegisterStudent(studentCode, fullName, className) {
  const result = await gsPost('registerStudent', { studentCode, fullName, className });

  if (result.success) {
    sessionStorage.setItem('student', JSON.stringify({
      studentCode: studentCode,
      fullName: fullName,
      className: className || ''
    }));
  }
  return result;
}

function getCurrentStudent() {
  const raw = sessionStorage.getItem('student');
  return raw ? JSON.parse(raw) : null;
}

// ---------- Teacher ----------

/**
 * Verifies a Google Identity Services ID token (from the Sign in with
 * Google button in login.html) against the backend, which checks the
 * token's signature/audience with Google before trusting the email.
 */
async function syncVerifyTeacherToken(idToken) {
  const result = await gsPost('verifyTeacherToken', { idToken });
  if (result.success) {
    sessionStorage.setItem('teacher', JSON.stringify(result.teacher));
  }
  return result;
}

function getCurrentTeacher() {
  const raw = sessionStorage.getItem('teacher');
  return raw ? JSON.parse(raw) : null;
}

function teacherAuthHeader() {
  const teacher = getCurrentTeacher();
  return teacher ? { actorEmail: teacher.email } : {};
}

async function syncListTeachers() {
  return await gsGet('listTeachers');
}

async function syncUpsertTeacher(teacherData) {
  return await gsPost('upsertTeacher', { ...teacherData, ...teacherAuthHeader() });
}

async function syncDeleteTeacher(email) {
  return await gsPost('deleteTeacher', { email, ...teacherAuthHeader() });
}

// ---------- Question management (teacher panel) ----------

async function syncGetQuestionsByGame(gameId) {
  return await gsGet('getQuestionsByGame', { gameId });
}

async function syncAddQuestion(questionData) {
  return await gsPost('addQuestion', { ...questionData, ...teacherAuthHeader() });
}

async function syncUpdateQuestion(questionData) {
  return await gsPost('updateQuestion', { ...questionData, ...teacherAuthHeader() });
}

async function syncDeleteQuestion(questionId) {
  return await gsPost('deleteQuestion', { questionId, ...teacherAuthHeader() });
}

async function syncSaveGameSettings(settingsData) {
  return await gsPost('saveGameSettings', { ...settingsData, ...teacherAuthHeader() });
}

// ---------- Games (hub metadata) ----------

function gamesCacheKey() {
  return 'games_list';
}

/**
 * List of all games for the hub grid, with localStorage fallback
 * (same offline-safety pattern as syncGetQuestions).
 */
async function syncListGames() {
  const result = await gsGet('listGames');

  if (result.success && result.games) {
    localStorage.setItem(gamesCacheKey(), JSON.stringify(result.games));
    return { success: true, games: result.games, fromCache: false };
  }

  const cached = localStorage.getItem(gamesCacheKey());
  if (cached) {
    return { success: true, games: JSON.parse(cached), fromCache: true };
  }
  return { success: false, error: 'لیست بازی‌ها در دسترس نیست' };
}

async function syncAddGame(gameData) {
  return await gsPost('addGame', { ...gameData, ...teacherAuthHeader() });
}

async function syncUpdateGame(gameData) {
  return await gsPost('updateGame', { ...gameData, ...teacherAuthHeader() });
}

async function syncDeleteGame(gameId) {
  return await gsPost('deleteGame', { gameId, ...teacherAuthHeader() });
}

// ---------- Attempts ----------

async function syncCheckAttempts(studentCode, gameId) {
  return await gsGet('checkAttempts', { studentCode, gameId });
}

// ---------- Questions (with localStorage fallback) ----------

function questionsCacheKey(gameId) {
  return `questions_game_${gameId}`;
}

/**
 * Tries the network first. If the backend is unreachable, falls back
 * to the last successfully cached question bank for that game so a
 * flaky connection doesn't block the whole quiz.
 */
async function syncGetQuestions(gameId) {
  const result = await gsGet('getQuestions', { gameId });

  if (result.success && result.questions && result.questions.length > 0) {
    localStorage.setItem(questionsCacheKey(gameId), JSON.stringify({
      questions: result.questions,
      cachedAt: new Date().toISOString()
    }));
    return { success: true, questions: result.questions, fromCache: false };
  }

  // Fallback to cache
  const cached = localStorage.getItem(questionsCacheKey(gameId));
  if (cached) {
    const parsed = JSON.parse(cached);
    return { success: true, questions: parsed.questions, fromCache: true, cachedAt: parsed.cachedAt };
  }

  return { success: false, error: 'سوالات در دسترس نیست و نسخه ذخیره‌شده‌ای هم یافت نشد' };
}

async function syncGetGameSettings(gameId) {
  const result = await gsGet('getGameSettings', { gameId });
  if (result.success) {
    localStorage.setItem(`settings_game_${gameId}`, JSON.stringify(result));
    return result;
  }
  const cached = localStorage.getItem(`settings_game_${gameId}`);
  return cached ? JSON.parse(cached) : { success: false, error: 'تنظیمات در دسترس نیست' };
}

// ---------- Results ----------

async function syncSaveResult(studentCode, gameId, correctCount, wrongCount) {
  const result = await gsPost('saveResult', { studentCode, gameId, correctCount, wrongCount });

  // Always keep a local trace too, so the student/teacher has something
  // to show even if the network call ultimately failed.
  const localLog = JSON.parse(localStorage.getItem('resultLog') || '[]');
  localLog.push({
    studentCode, gameId, correctCount, wrongCount,
    submittedAt: new Date().toISOString(),
    syncedToServer: !!result.success
  });
  localStorage.setItem('resultLog', JSON.stringify(localLog));

  return result;
}
