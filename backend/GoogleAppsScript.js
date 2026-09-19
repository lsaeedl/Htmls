/**
 * Boshra Girls' Primary School - Educational Portal
 * Backend: Google Apps Script (Web App API)
 *
 * Sheet tabs expected in the bound Spreadsheet:
 *   Students     : StudentCode | FullName | Class | RegisteredAt
 *   Teachers     : Email | Role | Name
 *   Questions    : QuestionID | GameID | QuestionText | Option1 | Option2 | Option3 | Option4 | CorrectAnswer | Active
 *   Results      : StudentCode | GameID | CorrectCount | WrongCount | SubmittedAt | AttemptNumber | IsOfficial
 *   GameSettings : GameID | TimerSeconds | QuestionCount | IsOpen | MaxAttempts
 */

// ---------- Config ----------
const SHEET_NAMES = {
  STUDENTS: 'Students',
  TEACHERS: 'Teachers',
  QUESTIONS: 'Questions',
  RESULTS: 'Results',
  GAME_SETTINGS: 'GameSettings'
};

// ---------- Entry points ----------

function doGet(e) {
  try {
    const action = e.parameter.action;

    switch (action) {
      case 'getQuestions':
        return jsonResponse(getQuestions(e.parameter.gameId));
      case 'checkAttempts':
        return jsonResponse(checkAttempts(e.parameter.studentCode, e.parameter.gameId));
      case 'getGameSettings':
        return jsonResponse(getGameSettings(e.parameter.gameId));
      case 'verifyTeacher':
        return jsonResponse(verifyTeacher(e.parameter.email));
      default:
        return jsonResponse({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    switch (action) {
      case 'registerStudent':
        return jsonResponse(registerOrCheckStudent(body.studentCode, body.fullName, body.className));
      case 'saveResult':
        return jsonResponse(saveResult(body.studentCode, body.gameId, body.correctCount, body.wrongCount));
      default:
        return jsonResponse({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ---------- Students ----------

/**
 * Registers a new student if not present, or returns existing record.
 * No password — identity is StudentCode + FullName.
 */
function registerOrCheckStudent(studentCode, fullName, className) {
  if (!studentCode || !fullName) {
    return { success: false, error: 'کد دانش‌آموزی و نام الزامی است' };
  }

  const sheet = getSheet(SHEET_NAMES.STUDENTS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(studentCode)) {
      // Already registered — verify name matches to prevent code-guessing.
      if (String(data[i][1]).trim() !== String(fullName).trim()) {
        return { success: false, error: 'نام با کد دانش‌آموزی مطابقت ندارد' };
      }
      return { success: true, existing: true, studentCode: studentCode };
    }
  }

  sheet.appendRow([studentCode, fullName, className || '', new Date()]);
  return { success: true, existing: false, studentCode: studentCode };
}

// ---------- Teachers ----------

function verifyTeacher(email) {
  if (!email) return { success: false, error: 'ایمیل ارسال نشده' };

  const sheet = getSheet(SHEET_NAMES.TEACHERS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(email).toLowerCase()) {
      return { success: true, role: data[i][1], name: data[i][2] };
    }
  }
  return { success: false, error: 'دسترسی مجاز نیست' };
}

// ---------- Questions ----------

function getQuestions(gameId) {
  if (!gameId) return { success: false, error: 'شناسه بازی ارسال نشده' };

  const sheet = getSheet(SHEET_NAMES.QUESTIONS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const questions = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowGameId = String(row[1]);
    const active = row[8];
    if (rowGameId === String(gameId) && (active === true || active === 'TRUE')) {
      questions.push({
        questionId: row[0],
        questionText: row[2],
        options: [row[3], row[4], row[5], row[6]],
        correctAnswer: row[7]
      });
    }
  }

  // Shuffle then cap to configured question count (default 15).
  const settings = getGameSettings(gameId);
  const count = (settings.success && settings.questionCount) ? settings.questionCount : 15;
  const shuffled = shuffleArray(questions);

  return { success: true, questions: shuffled.slice(0, count) };
}

// ---------- Game settings ----------

function getGameSettings(gameId) {
  const sheet = getSheet(SHEET_NAMES.GAME_SETTINGS);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(gameId)) {
      return {
        success: true,
        gameId: gameId,
        timerSeconds: data[i][1],
        questionCount: data[i][2],
        isOpen: data[i][3] === true || data[i][3] === 'TRUE',
        maxAttempts: data[i][4]
      };
    }
  }
  // Sensible defaults if a game has no explicit settings row yet.
  return { success: true, gameId: gameId, timerSeconds: 300, questionCount: 15, isOpen: true, maxAttempts: 3 };
}

// ---------- Attempts ----------

/**
 * Server-side check — never trust sessionStorage alone.
 * Returns how many attempts remain and whether a new attempt would be official.
 */
function checkAttempts(studentCode, gameId) {
  if (!studentCode || !gameId) {
    return { success: false, error: 'اطلاعات ناقص است' };
  }

  const settings = getGameSettings(gameId);
  if (!settings.isOpen) {
    return { success: false, error: 'این آزمون در حال حاضر باز نیست' };
  }

  const previousAttempts = countPreviousAttempts(studentCode, gameId);
  const maxAttempts = settings.maxAttempts || 3;

  if (previousAttempts >= maxAttempts) {
    return {
      success: false,
      error: 'به حداکثر تعداد مجاز شرکت در این آزمون رسیده‌اید',
      attemptsUsed: previousAttempts,
      maxAttempts: maxAttempts
    };
  }

  return {
    success: true,
    attemptsUsed: previousAttempts,
    attemptsRemaining: maxAttempts - previousAttempts,
    nextAttemptNumber: previousAttempts + 1,
    willBeOfficial: previousAttempts === 0
  };
}

function countPreviousAttempts(studentCode, gameId) {
  const sheet = getSheet(SHEET_NAMES.RESULTS);
  const data = sheet.getDataRange().getValues();
  let count = 0;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(studentCode) && String(data[i][1]) === String(gameId)) {
      count++;
    }
  }
  return count;
}

// ---------- Results ----------

/**
 * Saves a quiz result. Uses LockService to prevent concurrent writes
 * from corrupting the sheet when multiple students submit at once.
 * Only the first attempt (AttemptNumber === 1) is marked official.
 */
function saveResult(studentCode, gameId, correctCount, wrongCount) {
  if (!studentCode || !gameId) {
    return { success: false, error: 'اطلاعات ناقص است' };
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000); // wait up to 10s for the lock

    // Re-check attempts INSIDE the lock to avoid a race between two
    // simultaneous submissions from the same student/tab duplication.
    const settings = getGameSettings(gameId);
    const previousAttempts = countPreviousAttempts(studentCode, gameId);
    const maxAttempts = settings.maxAttempts || 3;

    if (previousAttempts >= maxAttempts) {
      return { success: false, error: 'به حداکثر تعداد مجاز شرکت رسیده‌اید' };
    }

    const attemptNumber = previousAttempts + 1;
    const isOfficial = attemptNumber === 1;

    const sheet = getSheet(SHEET_NAMES.RESULTS);
    sheet.appendRow([
      studentCode,
      gameId,
      correctCount,
      wrongCount,
      new Date(),
      attemptNumber,
      isOfficial
    ]);

    return {
      success: true,
      attemptNumber: attemptNumber,
      isOfficial: isOfficial,
      perfect: (wrongCount === 0)
    };

  } catch (e) {
    return { success: false, error: 'سرور شلوغ است، دوباره تلاش کنید' };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Helpers ----------

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('شیت "' + name + '" یافت نشد');
  return sheet;
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
