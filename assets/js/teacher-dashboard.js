/**
 * Boshra Girls' Primary School - Educational Portal
 * assets/js/teacher-dashboard.js
 *
 * Depends on google-sync.js. Requires an active teacher session
 * (set by login.html via syncVerifyTeacherToken) — redirects to
 * login.html otherwise.
 */

let currentTeacher = null;
let allGames = [];

document.addEventListener('DOMContentLoaded', async () => {
  currentTeacher = getCurrentTeacher();
  if (!currentTeacher) {
    window.location.href = 'login.html';
    return;
  }

  document.getElementById('teacherNameDisplay').textContent = currentTeacher.name || currentTeacher.email;

  if (!hasPerm('canManageTeachers')) {
    document.getElementById('teachersTabBtn').style.display = 'none';
  }

  initTabs();
  initGamesTab();
  initQuestionsTab();
  initTeachersTab();
  initAiTab();
  initAccountTab();

  await refreshGames();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearTeacherSession();
  window.location.href = 'login.html';
});

// ---------- Permissions ----------

function hasPerm(key) {
  if (!currentTeacher) return false;
  return currentTeacher.role === 'Admin' || !!currentTeacher[key];
}

function isGameAllowed(gameId) {
  if (!currentTeacher) return false;
  if (currentTeacher.role === 'Admin') return true;
  const allowed = String(currentTeacher.allowedGames || 'ALL').trim().toUpperCase();
  if (allowed === 'ALL') return true;
  return String(currentTeacher.allowedGames).split(',').map(s => s.trim()).includes(String(gameId));
}

// ---------- Tabs ----------

function initTabs() {
  document.querySelectorAll('#dashTabs .dash-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dashTabs .dash-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  document.querySelectorAll('[data-aitab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-aitab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('ai-gen').style.display = btn.dataset.aitab === 'gen' ? 'block' : 'none';
      document.getElementById('ai-analysis').style.display = btn.dataset.aitab === 'analysis' ? 'block' : 'none';
    });
  });
}

// ---------- Shared: games list ----------

async function refreshGames() {
  const result = await syncListGames();
  allGames = result.success ? result.games : [];
  renderGamesTable();
  populateGameSelect(document.getElementById('q_gameSelect'));
  populateGameSelect(document.getElementById('ai_gameSelect'));
  populateGameSelect(document.getElementById('an_gameSelect'));

  if (document.getElementById('q_gameSelect').value) {
    loadQuestionsForSelectedGame();
  }
}

function populateGameSelect(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = allGames
    .filter(g => isGameAllowed(g.gameId))
    .map(g => `<option value="${g.gameId}">${g.icon || ''} ${g.title} (${g.gameId})</option>`)
    .join('');
  if (current) selectEl.value = current;
}

// ==================================================================
// بخش بازی‌ها
// ==================================================================

function initGamesTab() {
  document.getElementById('g_type').addEventListener('change', (e) => {
    document.getElementById('g_customFileWrap').style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  document.getElementById('gameFormReset').addEventListener('click', resetGameForm);

  document.getElementById('gameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('gameFormStatus');
    statusEl.textContent = 'در حال ذخیره...';
    statusEl.className = 'status-msg';

    const gameId = document.getElementById('g_gameId').value.trim();
    const isEditing = allGames.some(g => String(g.gameId) === String(gameId));

    const payload = {
      gameId: gameId,
      title: document.getElementById('g_title').value.trim(),
      subject: document.getElementById('g_subject').value.trim(),
      icon: document.getElementById('g_icon').value.trim(),
      imageUrl: document.getElementById('g_imageUrl').value.trim(),
      accentColor: document.getElementById('g_accentColor').value,
      type: document.getElementById('g_type').value,
      customFile: document.getElementById('g_customFile').value.trim()
    };

    const gameResult = isEditing ? await syncUpdateGame(payload) : await syncAddGame(payload);

    if (!gameResult.success) {
      statusEl.textContent = gameResult.error || 'خطا در ذخیره بازی';
      statusEl.className = 'status-msg status-err';
      return;
    }

    const settingsResult = await syncSaveGameSettings({
      gameId: gameId,
      timerSeconds: Number(document.getElementById('g_timerSeconds').value) || 180,
      questionCount: Number(document.getElementById('g_questionCount').value) || 10,
      isOpen: document.getElementById('g_isOpen').checked,
      maxAttempts: Number(document.getElementById('g_maxAttempts').value) || 3
    });

    if (!settingsResult.success) {
      statusEl.textContent = 'بازی ذخیره شد ولی تنظیمات آزمون ذخیره نشد: ' + (settingsResult.error || '');
      statusEl.className = 'status-msg status-err';
    } else {
      statusEl.textContent = 'با موفقیت ذخیره شد.';
      statusEl.className = 'status-msg status-ok';
    }

    resetGameForm();
    await refreshGames();
  });
}

function resetGameForm() {
  document.getElementById('gameForm').reset();
  document.getElementById('g_customFileWrap').style.display = 'none';
  document.getElementById('gameFormStatus').textContent = '';
}

function renderGamesTable() {
  const tbody = document.getElementById('gamesTableBody');
  tbody.innerHTML = allGames.map(g => `
    <tr>
      <td>${g.gameId}</td>
      <td>${g.icon || ''} ${g.title}</td>
      <td>${g.subject || ''}</td>
      <td>${g.type === 'custom' ? 'سفارشی' : 'پوسته‌ی آماده'}</td>
      <td>—</td>
      <td>
        <button class="btn btn-small btn-ghost" data-edit-game="${g.gameId}">ویرایش</button>
        ${hasPerm('canManageGames') ? `<button class="btn btn-small btn-danger" data-del-game="${g.gameId}">حذف</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">بازی‌ای ثبت نشده است.</td></tr>';

  tbody.querySelectorAll('[data-edit-game]').forEach((btn) => {
    btn.addEventListener('click', () => editGame(btn.dataset.editGame));
  });
  tbody.querySelectorAll('[data-del-game]').forEach((btn) => {
    btn.addEventListener('click', () => deleteGame(btn.dataset.delGame));
  });
}

async function editGame(gameId) {
  const game = allGames.find(g => String(g.gameId) === String(gameId));
  if (!game) return;

  document.getElementById('g_gameId').value = game.gameId;
  document.getElementById('g_title').value = game.title || '';
  document.getElementById('g_subject').value = game.subject || '';
  document.getElementById('g_icon').value = game.icon || '';
  document.getElementById('g_imageUrl').value = game.imageUrl || '';
  document.getElementById('g_accentColor').value = game.accentColor || '#FF7F8E';
  document.getElementById('g_type').value = game.type || 'template';
  document.getElementById('g_customFile').value = game.customFile || '';
  document.getElementById('g_customFileWrap').style.display = game.type === 'custom' ? 'block' : 'none';

  const settings = await syncGetGameSettings(gameId);
  if (settings.success) {
    document.getElementById('g_timerSeconds').value = settings.timerSeconds;
    document.getElementById('g_questionCount').value = settings.questionCount;
    document.getElementById('g_maxAttempts').value = settings.maxAttempts;
    document.getElementById('g_isOpen').checked = !!settings.isOpen;
  }

  document.querySelector('[data-tab="games"]').click();
  document.getElementById('gameForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteGame(gameId) {
  if (!confirm('این بازی حذف شود؟ (سوالات و نتایج قبلی حذف نمی‌شوند)')) return;
  const result = await syncDeleteGame(gameId);
  if (result.success) await refreshGames();
  else alert(result.error || 'خطا در حذف');
}

// ==================================================================
// بخش سوالات
// ==================================================================

function initQuestionsTab() {
  document.getElementById('q_gameSelect').addEventListener('change', loadQuestionsForSelectedGame);
  document.getElementById('questionFormReset').addEventListener('click', resetQuestionForm);

  document.getElementById('questionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('questionFormStatus');
    const gameId = document.getElementById('q_gameSelect').value;

    if (!gameId) {
      statusEl.textContent = 'ابتدا یک بازی انتخاب کنید';
      statusEl.className = 'status-msg status-err';
      return;
    }

    const payload = {
      questionId: document.getElementById('qu_questionId').value || undefined,
      gameId: gameId,
      questionText: document.getElementById('qu_questionText').value.trim(),
      option1: document.getElementById('qu_option1').value.trim(),
      option2: document.getElementById('qu_option2').value.trim(),
      option3: document.getElementById('qu_option3').value.trim(),
      option4: document.getElementById('qu_option4').value.trim(),
      correctAnswer: document.getElementById('qu_correctAnswer').value.trim(),
      active: document.getElementById('qu_active').checked
    };

    const result = payload.questionId ? await syncUpdateQuestion(payload) : await syncAddQuestion(payload);

    statusEl.textContent = result.success ? 'سوال ذخیره شد.' : (result.error || 'خطا در ذخیره سوال');
    statusEl.className = 'status-msg ' + (result.success ? 'status-ok' : 'status-err');

    if (result.success) {
      resetQuestionForm();
      loadQuestionsForSelectedGame();
    }
  });
}

function resetQuestionForm() {
  document.getElementById('questionForm').reset();
  document.getElementById('qu_questionId').value = '';
  document.getElementById('questionFormStatus').textContent = '';
}

async function loadQuestionsForSelectedGame() {
  const gameId = document.getElementById('q_gameSelect').value;
  const tbody = document.getElementById('questionsTableBody');
  if (!gameId) { tbody.innerHTML = ''; return; }

  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">در حال بارگذاری...</td></tr>';
  const result = await syncGetQuestionsByGame(gameId);

  if (!result.success) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${result.error || 'خطا'}</td></tr>`;
    return;
  }

  tbody.innerHTML = result.questions.map(q => `
    <tr>
      <td>${q.questionText}</td>
      <td>${q.correctAnswer}</td>
      <td>${q.active ? '✅' : '⛔'}</td>
      <td>
        <button class="btn btn-small btn-ghost" data-edit-q="${q.questionId}">ویرایش</button>
        <button class="btn btn-small btn-danger" data-del-q="${q.questionId}">حذف</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">سوالی ثبت نشده است.</td></tr>';

  tbody.querySelectorAll('[data-edit-q]').forEach((btn) => {
    const q = result.questions.find(x => String(x.questionId) === btn.dataset.editQ);
    btn.addEventListener('click', () => editQuestion(q));
  });
  tbody.querySelectorAll('[data-del-q]').forEach((btn) => {
    btn.addEventListener('click', () => deleteQuestionRow(btn.dataset.delQ));
  });
}

function editQuestion(q) {
  if (!q) return;
  document.getElementById('qu_questionId').value = q.questionId;
  document.getElementById('qu_questionText').value = q.questionText;
  document.getElementById('qu_option1').value = q.options[0] || '';
  document.getElementById('qu_option2').value = q.options[1] || '';
  document.getElementById('qu_option3').value = q.options[2] || '';
  document.getElementById('qu_option4').value = q.options[3] || '';
  document.getElementById('qu_correctAnswer').value = q.correctAnswer;
  document.getElementById('qu_active').checked = !!q.active;
  document.getElementById('questionForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteQuestionRow(questionId) {
  if (!confirm('این سوال حذف شود؟')) return;
  const result = await syncDeleteQuestion(questionId);
  if (result.success) loadQuestionsForSelectedGame();
  else alert(result.error || 'خطا در حذف');
}

// ==================================================================
// بخش آموزگاران
// ==================================================================

function initTeachersTab() {
  if (!hasPerm('canManageTeachers')) return;

  loadTeachers();
  document.getElementById('teacherFormReset').addEventListener('click', () => {
    document.getElementById('teacherForm').reset();
    document.getElementById('teacherFormStatus').textContent = '';
  });

  document.getElementById('teacherForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('teacherFormStatus');

    const payload = {
      email: document.getElementById('t_email').value.trim(),
      name: document.getElementById('t_name').value.trim(),
      role: document.getElementById('t_role').value,
      allowedGames: document.getElementById('t_allowedGames').value.trim() || 'ALL',
      allowedClasses: document.getElementById('t_allowedClasses').value.trim() || 'ALL',
      canEditQuestions: document.getElementById('t_canEditQuestions').checked,
      canManageGames: document.getElementById('t_canManageGames').checked,
      canManageTeachers: document.getElementById('t_canManageTeachers').checked
    };

    const result = await syncUpsertTeacher(payload);
    statusEl.textContent = result.success ? 'آموزگار ذخیره شد.' : (result.error || 'خطا');
    statusEl.className = 'status-msg ' + (result.success ? 'status-ok' : 'status-err');

    if (result.success) {
      document.getElementById('teacherForm').reset();
      loadTeachers();
    }
  });
}

async function loadTeachers() {
  const tbody = document.getElementById('teachersTableBody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">در حال بارگذاری...</td></tr>';

  const result = await syncListTeachers();
  if (!result.success) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${result.error || 'خطا'}</td></tr>`;
    return;
  }

  tbody.innerHTML = result.teachers.map(t => `
    <tr>
      <td>${t.email}</td>
      <td>${t.name || ''}</td>
      <td>${t.role}</td>
      <td>${t.allowedGames}</td>
      <td>${t.allowedClasses}</td>
      <td style="font-size:0.78rem;">
        ${t.canEditQuestions ? '📝سوال ' : ''}${t.canManageGames ? '🎮بازی ' : ''}${t.canManageTeachers ? '👩‍🏫آموزگار' : ''}
      </td>
      <td>${t.hasPassword ? '✅ تنظیم شده' : '—'}</td>
      <td>
        <button class="btn btn-small btn-ghost" data-edit-t="${t.email}">ویرایش</button>
        <button class="btn btn-small btn-ghost" data-reset-pw="${t.email}">ریست رمز</button>
        <button class="btn btn-small btn-danger" data-del-t="${t.email}">حذف</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit-t]').forEach((btn) => {
    const t = result.teachers.find(x => x.email === btn.dataset.editT);
    btn.addEventListener('click', () => editTeacher(t));
  });
  tbody.querySelectorAll('[data-del-t]').forEach((btn) => {
    btn.addEventListener('click', () => deleteTeacherRow(btn.dataset.delT));
  });
  tbody.querySelectorAll('[data-reset-pw]').forEach((btn) => {
    btn.addEventListener('click', () => adminResetPassword(btn.dataset.resetPw));
  });
}

async function adminResetPassword(email) {
  const newPassword = prompt('رمز عبور جدید برای ' + email + ' را وارد کنید (حداقل ۸ کاراکتر):');
  if (!newPassword) return;
  if (newPassword.length < 8) { alert('رمز باید حداقل ۸ کاراکتر باشد'); return; }

  const result = await syncSetPassword(email, newPassword);
  if (result.success) {
    alert('رمز عبور با موفقیت تنظیم شد.');
    loadTeachers();
  } else {
    alert(result.error || 'خطا در تنظیم رمز');
  }
}

function editTeacher(t) {
  if (!t) return;
  document.getElementById('t_email').value = t.email;
  document.getElementById('t_name').value = t.name || '';
  document.getElementById('t_role').value = t.role;
  document.getElementById('t_allowedGames').value = t.allowedGames;
  document.getElementById('t_allowedClasses').value = t.allowedClasses;
  document.getElementById('t_canEditQuestions').checked = t.canEditQuestions;
  document.getElementById('t_canManageGames').checked = t.canManageGames;
  document.getElementById('t_canManageTeachers').checked = t.canManageTeachers;
  document.getElementById('teacherForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteTeacherRow(email) {
  if (!confirm('این آموزگار حذف شود؟')) return;
  const result = await syncDeleteTeacher(email);
  if (result.success) loadTeachers();
  else alert(result.error || 'خطا در حذف');
}

// ==================================================================
// حساب من — تنظیم رمز عبور شخصی
// ==================================================================

function initAccountTab() {
  document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('accountStatus');
    const p1 = document.getElementById('acc_newPassword').value;
    const p2 = document.getElementById('acc_confirmPassword').value;

    if (p1 !== p2) {
      statusEl.textContent = 'رمز عبور و تکرار آن یکسان نیستند';
      statusEl.className = 'status-msg status-err';
      return;
    }

    const result = await syncSetPassword(currentTeacher.email, p1);
    statusEl.textContent = result.success ? 'رمز عبور با موفقیت ذخیره شد.' : (result.error || 'خطا');
    statusEl.className = 'status-msg ' + (result.success ? 'status-ok' : 'status-err');
    if (result.success) document.getElementById('passwordForm').reset();
  });
}

// ==================================================================
// استودیوی هوش مصنوعی
// ==================================================================

function initAiTab() {
  document.getElementById('ai_buildPromptBtn').addEventListener('click', buildQuestionPrompt);
  document.getElementById('ai_copyPromptBtn').addEventListener('click', () => copyText('ai_generatedPrompt'));
  document.getElementById('ai_parseBtn').addEventListener('click', parseAndPreviewQuestions);

  document.getElementById('an_mode').addEventListener('change', (e) => {
    const isGame = e.target.value === 'game';
    document.getElementById('an_gameWrap').style.display = isGame ? 'block' : 'none';
    document.getElementById('an_studentWrap').style.display = isGame ? 'none' : 'block';
    document.getElementById('an_classFilterWrap').style.display = isGame ? 'block' : 'none';
  });
  document.getElementById('an_buildBtn').addEventListener('click', buildAnalysisPrompt);
  document.getElementById('an_copyPromptBtn').addEventListener('click', () => copyText('an_generatedPrompt'));
}

function copyText(elId) {
  const el = document.getElementById(elId);
  el.select();
  navigator.clipboard && navigator.clipboard.writeText(el.value).catch(() => {
    document.execCommand('copy');
  });
}

function buildQuestionPrompt() {
  const game = allGames.find(g => String(g.gameId) === document.getElementById('ai_gameSelect').value);
  const topic = document.getElementById('ai_topic').value.trim();
  const count = Number(document.getElementById('ai_count').value) || 10;

  const prompt = `شما یک معلم فارسی دبستان دخترانه هستید. لطفاً ${count} سوال چهارگزینه‌ای مناسب برای دانش‌آموزان دبستان بر اساس موضوع زیر طراحی کنید:

موضوع: ${game ? game.title : ''} — ${topic}

قوانین مهم:
- زبان و لحن ساده و مناسب سن دبستان باشد.
- هر سوال دقیقاً ۴ گزینه داشته باشد که فقط یکی درست است.
- خروجی را فقط و فقط به‌صورت یک آرایه‌ی JSON معتبر بده، بدون هیچ توضیح اضافه، دقیقاً با این ساختار:

[
  {
    "questionText": "متن سوال",
    "option1": "گزینه ۱",
    "option2": "گزینه ۲",
    "option3": "گزینه ۳",
    "option4": "گزینه ۴",
    "correctAnswer": "متن دقیق گزینه‌ی درست (باید عیناً با یکی از چهار گزینه بالا یکسان باشد)"
  }
]`;

  document.getElementById('ai_generatedPrompt').value = prompt;
}

async function parseAndPreviewQuestions() {
  const statusEl = document.getElementById('ai_genStatus');
  const previewEl = document.getElementById('ai_previewList');
  const gameId = document.getElementById('ai_gameSelect').value;
  const raw = document.getElementById('ai_pasteResponse').value.trim();

  let parsed;
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    statusEl.textContent = 'متن پیست‌شده یک JSON معتبر نیست. لطفاً فقط خروجی هوش مصنوعی را (بدون توضیح اضافه) پیست کنید.';
    statusEl.className = 'status-msg status-err';
    return;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    statusEl.textContent = 'ساختار JSON باید یک آرایه از سوالات باشد.';
    statusEl.className = 'status-msg status-err';
    return;
  }

  previewEl.innerHTML = `<p style="color:var(--text-muted);">${parsed.length} سوال شناسایی شد. در حال افزودن...</p>`;
  let successCount = 0;

  for (const item of parsed) {
    const result = await syncAddQuestion({
      gameId: gameId,
      questionText: item.questionText,
      option1: item.option1, option2: item.option2, option3: item.option3, option4: item.option4,
      correctAnswer: item.correctAnswer,
      active: true
    });
    if (result.success) successCount++;
  }

  statusEl.textContent = `${successCount} از ${parsed.length} سوال با موفقیت به بانک سوالات اضافه شد.`;
  statusEl.className = 'status-msg status-ok';
  previewEl.innerHTML = '';
  document.getElementById('ai_pasteResponse').value = '';

  if (document.getElementById('q_gameSelect').value === gameId) {
    loadQuestionsForSelectedGame();
  }
}

async function buildAnalysisPrompt() {
  const statusEl = document.getElementById('an_status');
  const mode = document.getElementById('an_mode').value;
  statusEl.textContent = 'در حال دریافت داده‌ها...';
  statusEl.className = 'status-msg';

  let results, subjectLine;

  if (mode === 'game') {
    const gameId = document.getElementById('an_gameSelect').value;
    const game = allGames.find(g => String(g.gameId) === gameId);
    const classFilter = document.getElementById('an_classFilter').value.trim();
    const res = await syncGetResultsByGame(gameId, classFilter);
    if (!res.success) { statusEl.textContent = res.error; statusEl.className = 'status-msg status-err'; return; }
    results = res.results;
    subjectLine = `نتایج ${classFilter ? 'کلاس ' + classFilter : 'کلاس'} در بازی «${game ? game.title : gameId}»`;
  } else {
    const studentCode = document.getElementById('an_studentCode').value.trim();
    const res = await syncGetResultsByStudent(studentCode);
    if (!res.success) { statusEl.textContent = res.error; statusEl.className = 'status-msg status-err'; return; }
    results = res.results;
    subjectLine = `نتایج دانش‌آموز با کد ${studentCode} در همه‌ی بازی‌ها`;
  }

  if (!results.length) {
    statusEl.textContent = 'هیچ نتیجه‌ی ثبت‌شده‌ای (نوبت رسمی) برای این مورد پیدا نشد.';
    statusEl.className = 'status-msg status-err';
    return;
  }

  const dataLines = results.map(r =>
    `- کد دانش‌آموزی: ${r.studentCode} | بازی: ${r.gameId} | درست: ${r.correctCount} | غلط: ${r.wrongCount}`
  ).join('\n');

  const prompt = `شما یک مشاور آموزشی دبستان هستید. بر اساس داده‌های زیر (فقط نتایج رسمی، بدون نمره‌ی عددی — فقط تعداد پاسخ درست/غلط)، یک تحلیل کوتاه و راهکارهای عملی برای آموزگار و والدین جهت بهبود یادگیری ارائه بده. لحن دلسوزانه، سازنده و بدون قضاوت باشد.

${subjectLine}:
${dataLines}

لطفاً خروجی را در قالب زیر بده:
۱. جمع‌بندی کلی وضعیت
۲. نقاط قوت
۳. زمینه‌های نیازمند تمرین بیشتر
۴. ۳ پیشنهاد عملی برای آموزگار
۵. ۳ پیشنهاد عملی برای والدین جهت تمرین در خانه`;

  document.getElementById('an_generatedPrompt').value = prompt;
  statusEl.textContent = 'پرامپت آماده شد.';
  statusEl.className = 'status-msg status-ok';
}
