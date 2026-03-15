const state = {
  courses: [],
  wordlists: {},
  currentListId: 'A1',
  filter: 'all',
  search: '',
  entries: [],
  progress: {},
  custom: [],
  queue: [],
  plan: {
    dailyTarget: 30,
    date: null,
    done: 0,
    streak: 0,
  },
  practice: {
    dictation: false,
    maskExamples: false,
    autoSpeak: false,
    voiceId: 'auto',
    rate: 1,
  },
  dictationAttempts: {},
  voices: [],
};

const elements = {
  courseGrid: document.getElementById('courseGrid'),
  courseSelect: document.getElementById('courseSelect'),
  filterSelect: document.getElementById('filterSelect'),
  searchInput: document.getElementById('searchInput'),
  wordList: document.getElementById('wordList'),
  wrongList: document.getElementById('wrongList'),
  heroMetrics: document.getElementById('heroMetrics'),
  dueCount: document.getElementById('dueCount'),
  knownCount: document.getElementById('knownCount'),
  totalCount: document.getElementById('totalCount'),
  flashcard: document.getElementById('flashcard'),
  cardFront: document.getElementById('cardFront'),
  cardBack: document.getElementById('cardBack'),
  synonymTags: document.getElementById('synonymTags'),
  markKnown: document.getElementById('markKnown'),
  markLearning: document.getElementById('markLearning'),
  nextCard: document.getElementById('nextCard'),
  startPractice: document.getElementById('startPractice'),
  resetProgress: document.getElementById('resetProgress'),
  importFile: document.getElementById('importFile'),
  importStatus: document.getElementById('importStatus'),
  downloadTemplate: document.getElementById('downloadTemplate'),
  dailyTarget: document.getElementById('dailyTarget'),
  savePlan: document.getElementById('savePlan'),
  startDaily: document.getElementById('startDaily'),
  todayDone: document.getElementById('todayDone'),
  todayLeft: document.getElementById('todayLeft'),
  dueToday: document.getElementById('dueToday'),
  streakCount: document.getElementById('streakCount'),
  viewWrongList: document.getElementById('viewWrongList'),
  toggleDictation: document.getElementById('toggleDictation'),
  toggleMask: document.getElementById('toggleMask'),
  toggleAutoSpeak: document.getElementById('toggleAutoSpeak'),
  dictationBox: document.getElementById('dictationBox'),
  dictationInput: document.getElementById('dictationInput'),
  checkDictation: document.getElementById('checkDictation'),
  dictationResult: document.getElementById('dictationResult'),
  speakWord: document.getElementById('speakWord'),
  speakExample: document.getElementById('speakExample'),
  spellThenSpeak: document.getElementById('spellThenSpeak'),
  voiceSelect: document.getElementById('voiceSelect'),
  rateInput: document.getElementById('rateInput'),
  rateValue: document.getElementById('rateValue'),
};

const PROGRESS_KEY = 'wortsprint-progress-v2';
const CUSTOM_KEY = 'wortsprint-custom-v1';
const PLAN_KEY = 'wortsprint-plan-v1';
const PRACTICE_KEY = 'wortsprint-practice-v1';

const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30, 60];

const loadJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return res.json();
};

const getTodayKey = () => {
  return new Date().toLocaleDateString('sv-SE');
};

const addDays = (dateKey, days) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const base = new Date(year, month - 1, day);
  base.setDate(base.getDate() + days);
  return base.toLocaleDateString('sv-SE');
};

const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/[.,!?;:()"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripArticle = (value) => value.replace(/^(der|die|das|ein|eine|einer|einen|einem|eines)\s+/, '');

const normalizeWord = (value) => stripArticle(normalize(value));

const simplifyUmlaut = (value) =>
  value
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

const maskExample = (example, word) => {
  if (!example) return '';
  if (!word) return example;
  const tokens = normalizeWord(word).split(' ').filter(Boolean);
  if (tokens.length === 0) return example;
  let masked = example;
  tokens.forEach((token) => {
    const reg = new RegExp(token, 'gi');
    masked = masked.replace(reg, '____');
  });
  return masked;
};

const editDistance = (a, b) => {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
};

const diffChars = (answer, target) => {
  const a = normalizeWord(answer);
  const b = normalizeWord(target);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  const prev = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(null));

  for (let i = 0; i <= a.length; i += 1) {
    dp[i][0] = i;
    prev[i][0] = 'del';
  }
  for (let j = 0; j <= b.length; j += 1) {
    dp[0][j] = j;
    prev[0][j] = 'ins';
  }
  prev[0][0] = null;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const options = [
        { v: dp[i - 1][j] + 1, op: 'del' },
        { v: dp[i][j - 1] + 1, op: 'ins' },
        { v: dp[i - 1][j - 1] + cost, op: cost === 0 ? 'match' : 'sub' },
      ];
      options.sort((x, y) => x.v - y.v);
      dp[i][j] = options[0].v;
      prev[i][j] = options[0].op;
    }
  }

  let i = a.length;
  let j = b.length;
  const answerOut = [];
  const targetOut = [];
  while (i > 0 || j > 0) {
    const op = prev[i][j];
    if (op === 'match' || op === 'sub') {
      answerOut.push({ char: a[i - 1], type: op === 'match' ? 'right' : 'wrong' });
      targetOut.push({ char: b[j - 1], type: op === 'match' ? 'right' : 'right' });
      i -= 1;
      j -= 1;
    } else if (op === 'del') {
      answerOut.push({ char: a[i - 1], type: 'extra' });
      targetOut.push({ char: '•', type: 'dim' });
      i -= 1;
    } else if (op === 'ins') {
      answerOut.push({ char: '•', type: 'dim' });
      targetOut.push({ char: b[j - 1], type: 'missing' });
      j -= 1;
    } else {
      break;
    }
  }

  return {
    answer: answerOut.reverse(),
    target: targetOut.reverse(),
  };
};

const renderDiff = (answer, target) => {
  const diff = diffChars(answer, target);
  const renderLine = (items) =>
    items.map((item) => `<span class="${item.type}">${item.char || '•'}</span>`).join('');

  return `
    <div class="diff">
      <div><span class="dim">你的：</span>${renderLine(diff.answer)}</div>
      <div><span class="dim">正确：</span>${renderLine(diff.target)}</div>
    </div>
  `;
};

const buildVariants = (entry) => {
  const raw = entry.word || '';
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  const variants = new Set();
  parts.forEach((part) => {
    part.split('/').forEach((variant) => variants.add(variant.trim()));
    const base = part.split(',')[0];
    variants.add(base);
    variants.add(stripArticle(base));
  });
  if (variants.size === 0) {
    variants.add(raw);
  }
  return Array.from(variants).map((value) => normalizeWord(value)).filter(Boolean);
};

const getSynonyms = (entry) => {
  const raw = entry.word || '';
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.slice(1);
};

const findEntryBySynonym = (text) => {
  const target = normalizeWord(text);
  if (!target) return null;
  return (
    state.entries.find((entry) => buildVariants(entry).includes(target)) || null
  );
};

const isDictationCorrect = (answer, entry) => {
  const normalized = normalizeWord(answer);
  if (!normalized) return false;

  const variants = buildVariants(entry);
  const simplifiedAnswer = simplifyUmlaut(normalized);

  for (const variant of variants) {
    if (normalized === variant) return true;
    if (simplifyUmlaut(variant) === simplifiedAnswer) return true;
    const dist = editDistance(normalized, variant);
    const maxDist = variant.length <= 5 ? 1 : 2;
    if (dist <= maxDist) return true;
  }

  return false;
};

const getHint = (entry, attempt = 1) => {
  const raw = entry.word || '';
  const base = raw.split('|')[0];
  const normalized = normalizeWord(base);
  if (!normalized) return '';
  const tokens = normalized.split(' ').filter(Boolean);
  const lengths = tokens.map((t) => t.length).join('+');
  const firstToken = tokens[0] || '';

  if (attempt <= 1) {
    const firstLetter = firstToken[0] || '';
    return `提示：首字母 ${firstLetter}，长度 ${lengths}`;
  }
  if (attempt === 2) {
    const firstTwo = firstToken.slice(0, 2);
    return `提示：前两字母 ${firstTwo}，长度 ${lengths}`;
  }

  const partial = firstToken.slice(0, Math.max(2, Math.ceil(firstToken.length / 2)));
  return `提示：部分词形 ${partial}…，长度 ${lengths}`;
};

const getVoices = () => {
  if (!window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  return voices.filter((voice) => voice.lang && voice.lang.toLowerCase().startsWith('de'));
};

const renderVoiceOptions = () => {
  const voices = getVoices();
  state.voices = voices;
  if (!elements.voiceSelect) return;
  elements.voiceSelect.innerHTML = '';

  const autoOption = document.createElement('option');
  autoOption.value = 'auto';
  autoOption.textContent = '自动 (推荐)';
  elements.voiceSelect.appendChild(autoOption);

  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} · ${voice.lang}`;
    elements.voiceSelect.appendChild(option);
  });

  elements.voiceSelect.value = state.practice.voiceId || 'auto';
};

const speakWithVoice = (text, rate = state.practice.rate || 1) => {
  if (!window.speechSynthesis) {
    alert('当前浏览器不支持语音朗读。');
    return;
  }
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = rate;

  if (state.practice.voiceId && state.practice.voiceId !== 'auto') {
    const match = state.voices.find((voice) => voice.voiceURI === state.practice.voiceId);
    if (match) {
      utterance.voice = match;
    }
  }

  window.speechSynthesis.speak(utterance);
};

const speak = (text) => {
  if (!window.speechSynthesis) {
    alert('当前浏览器不支持语音朗读。');
    return;
  }
  if (!text) return;
  window.speechSynthesis.cancel();
  speakWithVoice(text);
};

const speakSpellThenWord = (word) => {
  if (!word) return;
  window.speechSynthesis.cancel();
  const letters = normalizeWord(word).split('').filter(Boolean).join(' ');
  const slower = Math.max(0.7, (state.practice.rate || 1) - 0.2);
  speakWithVoice(letters, slower);
  speakWithVoice(word, state.practice.rate || 1);
};

const init = async () => {
  const [courses, wordlists] = await Promise.all([
    loadJSON('/german-vocab/data/courses.json'),
    loadJSON('/german-vocab/data/wordlists.json'),
  ]);

  state.courses = courses.courses;
  state.wordlists = wordlists.lists;
  state.custom = loadCustomList();
  state.progress = loadProgress();
  state.plan = loadPlan();
  state.practice = loadPractice();

  hydratePlanForToday();

  renderCourses();
  renderCourseSelect();
  updateEntries();
  updateStats();
  renderWordList();
  renderWrongList();
  prepareQueue();
  renderFlashcard();
  updateImportStatus();
  renderPlan();
  renderPractice();
  renderVoiceOptions();

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = renderVoiceOptions;
  }
};

const loadProgress = () => {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (e) {
    return {};
  }
};

const saveProgress = () => {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
};

const loadPlan = () => {
  try {
    return JSON.parse(localStorage.getItem(PLAN_KEY)) || state.plan;
  } catch (e) {
    return state.plan;
  }
};

const savePlan = () => {
  localStorage.setItem(PLAN_KEY, JSON.stringify(state.plan));
};

const loadPractice = () => {
  try {
    return JSON.parse(localStorage.getItem(PRACTICE_KEY)) || state.practice;
  } catch (e) {
    return state.practice;
  }
};

const savePractice = () => {
  localStorage.setItem(PRACTICE_KEY, JSON.stringify(state.practice));
};

const hydratePlanForToday = () => {
  const today = getTodayKey();
  if (state.plan.date !== today) {
    if (state.plan.date && state.plan.done >= state.plan.dailyTarget) {
      state.plan.streak = (state.plan.streak || 0) + 1;
    } else if (state.plan.date) {
      state.plan.streak = 0;
    }
    state.plan.date = today;
    state.plan.done = 0;
    savePlan();
  }
};

const loadCustomList = () => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || [];
  } catch (e) {
    return [];
  }
};

const saveCustomList = () => {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.custom));
};

const renderCourses = () => {
  elements.courseGrid.innerHTML = '';
  state.courses.forEach((course) => {
    const card = document.createElement('div');
    card.className = 'course-card';

    const count = state.wordlists[course.level]?.length || 0;

    card.innerHTML = `
      <div class="course-title">${course.title}</div>
      <div class="course-meta">级别：${course.level} · ${course.focus}</div>
      <div class="course-meta">词表数量：${count > 0 ? count : '待导入'}</div>
      <div class="resource-list">
        ${course.resources
          .map(
            (res) => `
              <div class="resource">
                <div>${res.title}</div>
                <div>${res.publisher}</div>
                ${res.note ? `<div class="muted">${res.note}</div>` : ''}
                <a href="${res.url}" target="_blank" rel="noreferrer">打开资源</a>
              </div>
            `
          )
          .join('')}
      </div>
    `;
    elements.courseGrid.appendChild(card);
  });
};

const renderCourseSelect = () => {
  const options = [
    { id: 'A1', label: 'Year 1 · A1' },
    { id: 'A2', label: 'Year 2 · A2' },
    { id: 'B1', label: 'Year 3 · B1' },
    { id: 'B2', label: 'Year 4 · B2（可导入词表）' },
  ];

  if (state.custom.length > 0) {
    options.push({ id: 'custom', label: '自定义词表' });
  }

  elements.courseSelect.innerHTML = '';
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    elements.courseSelect.appendChild(option);
  });

  elements.courseSelect.value = state.currentListId;
};

const getListEntries = (listId) => {
  if (listId === 'custom') {
    return state.custom.map((entry, index) => ({
      ...entry,
      id: `custom-${index}`,
    }));
  }
  if (listId === 'B2') {
    return [];
  }
  const list = state.wordlists[listId] || [];
  return list.map((entry, index) => ({
    ...entry,
    id: `${listId}-${index}`,
  }));
};

const updateEntries = () => {
  state.entries = getListEntries(state.currentListId);
};

const getProgress = (entryId) => {
  if (!state.progress[entryId]) {
    state.progress[entryId] = { stage: 0, due: getTodayKey(), wrong: 0, lastReviewed: null };
  }
  return state.progress[entryId];
};

const updateStats = () => {
  const total = state.entries.length;
  const today = getTodayKey();
  let known = 0;
  let due = 0;

  state.entries.forEach((entry) => {
    const prog = getProgress(entry.id);
    if (prog.stage >= 3) {
      known += 1;
    }
    if (prog.due <= today) {
      due += 1;
    }
  });

  elements.totalCount.textContent = total || '--';
  elements.knownCount.textContent = known || 0;
  elements.dueCount.textContent = due || 0;

  elements.heroMetrics.innerHTML = `
    <div class="mini">当前课程：${state.currentListId}</div>
    <div class="mini">筛选：${state.filter === 'all' ? '全部' : state.filter === 'new' ? '未掌握' : '已掌握'}</div>
  `;
};

const applyFilters = () => {
  let filtered = state.entries;

  if (state.filter === 'new') {
    filtered = filtered.filter((entry) => getProgress(entry.id).stage === 0);
  } else if (state.filter === 'known') {
    filtered = filtered.filter((entry) => getProgress(entry.id).stage >= 3);
  }

  if (state.search) {
    const keyword = state.search.toLowerCase();
    filtered = filtered.filter((entry) =>
      entry.word.toLowerCase().includes(keyword) ||
      (entry.example && entry.example.toLowerCase().includes(keyword)) ||
      (entry.raw && entry.raw.toLowerCase().includes(keyword))
    );
  }

  return filtered;
};

const renderWordList = () => {
  const filtered = applyFilters();
  const maxItems = 120;
  elements.wordList.innerHTML = '';

  if (filtered.length === 0) {
    elements.wordList.innerHTML = '<div class="word-row">暂无词条，请导入词表。</div>';
    return;
  }

  filtered.slice(0, maxItems).forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'word-row';
    const example = state.practice.maskExamples ? maskExample(entry.example || entry.raw || '', entry.word) : entry.example || entry.raw || '—';
    const synonyms = getSynonyms(entry);
    row.innerHTML = `
      <strong>${entry.word}</strong>
      <span>${example}</span>
      ${synonyms.length ? `<div class="synonym-tags">${synonyms
        .map((syn) => `<span class="synonym-tag" data-synonym="${syn}">${syn}</span>`)
        .join('')}</div>` : ''}
    `;
    elements.wordList.appendChild(row);
  });

  if (filtered.length > maxItems) {
    const more = document.createElement('div');
    more.className = 'word-row';
    more.innerHTML = `<strong>已显示前 ${maxItems} 条</strong><span>使用搜索进一步筛选</span>`;
    elements.wordList.appendChild(more);
  }
};

const renderWrongList = () => {
  const wrongEntries = state.entries
    .map((entry) => ({ entry, prog: getProgress(entry.id) }))
    .filter((item) => item.prog.wrong > 0)
    .sort((a, b) => b.prog.wrong - a.prog.wrong)
    .slice(0, 40);

  elements.wrongList.innerHTML = '';
  if (wrongEntries.length === 0) {
    elements.wrongList.innerHTML = '<div class="word-row">暂无错词记录。</div>';
    return;
  }

  wrongEntries.forEach(({ entry, prog }) => {
    const row = document.createElement('div');
    row.className = 'word-row';
    const example = state.practice.maskExamples ? maskExample(entry.example || entry.raw || '', entry.word) : entry.example || entry.raw || '—';
    const synonyms = getSynonyms(entry);
    row.innerHTML = `
      <strong>${entry.word}</strong>
      <span>${example}</span>
      <span>错词次数：${prog.wrong}</span>
      ${synonyms.length ? `<div class="synonym-tags">${synonyms
        .map((syn) => `<span class="synonym-tag" data-synonym="${syn}">${syn}</span>`)
        .join('')}</div>` : ''}
    `;
    elements.wrongList.appendChild(row);
  });
};

const renderSynonymTags = (entry) => {
  const synonyms = getSynonyms(entry);
  elements.synonymTags.innerHTML = '';
  if (!synonyms.length) return;
  synonyms.forEach((syn) => {
    const tag = document.createElement('span');
    tag.className = 'synonym-tag';
    tag.textContent = syn;
    tag.dataset.synonym = syn;
    elements.synonymTags.appendChild(tag);
  });
};

const getDueEntries = () => {
  const today = getTodayKey();
  return state.entries.filter((entry) => getProgress(entry.id).due <= today);
};

const prepareQueue = (mode = 'normal') => {
  let filtered = applyFilters();

  if (state.practice.dictation) {
    filtered = filtered.filter((entry) => getProgress(entry.id).stage < 3);
  }

  if (mode === 'daily') {
    const dueEntries = getDueEntries().filter((entry) => !state.practice.dictation || getProgress(entry.id).stage < 3);
    const dueIds = new Set(dueEntries.map((entry) => entry.id));
    const newEntries = filtered.filter((entry) => getProgress(entry.id).stage === 0 && !dueIds.has(entry.id));

    const target = state.plan.dailyTarget || 30;
    const picked = [...dueEntries];

    if (picked.length < target) {
      picked.push(...newEntries.slice(0, target - picked.length));
    }

    state.queue = picked.map((entry) => entry.id);
    shuffle(state.queue);
    return;
  }

  state.queue = filtered.map((entry) => entry.id);
  shuffle(state.queue);
};

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

const getNextEntry = () => {
  if (state.queue.length === 0) {
    prepareQueue();
  }
  const nextId = state.queue.shift();
  return state.entries.find((entry) => entry.id === nextId);
};

const renderFlashcard = () => {
  const entry = getNextEntry();
  if (!entry) {
    elements.cardFront.textContent = '暂无词条';
    elements.cardBack.textContent = '请导入词表或选择其他课程';
    elements.synonymTags.innerHTML = '';
    if (elements.dictationResult) {
      elements.dictationResult.textContent = '等待输入';
    }
    return;
  }
  elements.flashcard.classList.remove('flipped');
  elements.flashcard.dataset.entryId = entry.id;
  state.dictationAttempts[entry.id] = 0;
  if (elements.dictationResult) {
    elements.dictationResult.textContent = '等待输入';
  }

  if (state.practice.dictation) {
    elements.cardFront.textContent = '听写模式：点击朗读按钮';
  } else {
    elements.cardFront.textContent = entry.word;
  }

  const example = state.practice.maskExamples ? maskExample(entry.example || entry.raw || '', entry.word) : entry.example || entry.raw || '暂无例句';
  elements.cardBack.textContent = example;
  renderSynonymTags(entry);

  if (state.practice.autoSpeak) {
    speak(entry.word);
  }
};

const markEntry = (known) => {
  const entryId = elements.flashcard.dataset.entryId;
  if (!entryId) return;
  hydratePlanForToday();

  const today = getTodayKey();
  const progress = getProgress(entryId);

  if (known) {
    progress.stage = Math.min(progress.stage + 1, REVIEW_INTERVALS.length - 1);
  } else {
    progress.stage = 0;
    progress.wrong += 1;
  }
  progress.due = addDays(today, REVIEW_INTERVALS[progress.stage]);
  progress.lastReviewed = today;

  state.progress[entryId] = progress;
  saveProgress();

  state.plan.done += 1;
  savePlan();

  updateStats();
  renderWordList();
  renderWrongList();
  renderPlan();
  renderFlashcard();
};

const renderPlan = () => {
  hydratePlanForToday();
  elements.dailyTarget.value = state.plan.dailyTarget || 30;
  elements.todayDone.textContent = state.plan.done;
  elements.todayLeft.textContent = Math.max((state.plan.dailyTarget || 30) - state.plan.done, 0);
  elements.dueToday.textContent = getDueEntries().length;
  elements.streakCount.textContent = state.plan.streak || 0;
};

const renderPractice = () => {
  elements.toggleDictation.checked = state.practice.dictation;
  elements.toggleMask.checked = state.practice.maskExamples;
  elements.toggleAutoSpeak.checked = state.practice.autoSpeak;
  elements.dictationBox.classList.toggle('active', state.practice.dictation);
  elements.rateInput.value = state.practice.rate || 1;
  elements.rateValue.textContent = `${Number(state.practice.rate || 1).toFixed(2)}x`;
};

const updateImportStatus = () => {
  if (state.custom.length === 0) {
    elements.importStatus.textContent = '尚未导入';
  } else {
    elements.importStatus.textContent = `已导入 ${state.custom.length} 条`;
  }
};

const handleImport = async (file) => {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const entries = [];
  lines.forEach((line) => {
    const parts = line.split(/\t|,/);
    const word = parts[0]?.trim();
    if (!word) return;
    const example = parts.slice(1).join(' ').trim();
    entries.push({ word, example, raw: line });
  });
  state.custom = entries;
  saveCustomList();
  renderCourseSelect();
  if (state.currentListId === 'custom') {
    updateEntries();
    updateStats();
    renderWordList();
    renderWrongList();
    prepareQueue();
    renderFlashcard();
  }
  updateImportStatus();
};

const downloadTemplate = () => {
  const template = 'Wort,Beispiel\nlernen|studieren,Ich lerne Deutsch.\narbeiten|jobben,Ich arbeite heute.';
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'wortliste_template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const resetProgress = () => {
  state.progress = {};
  state.plan.done = 0;
  saveProgress();
  savePlan();
  updateStats();
  renderWordList();
  renderWrongList();
  prepareQueue();
  renderFlashcard();
  renderPlan();
};

const checkDictation = () => {
  const entryId = elements.flashcard.dataset.entryId;
  if (!entryId) return;
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) return;
  const answer = elements.dictationInput.value || '';
  if (!answer.trim()) {
    elements.dictationResult.textContent = '请输入内容';
    return;
  }
  if (isDictationCorrect(answer, entry)) {
    elements.dictationResult.textContent = '正确！';
    state.dictationAttempts[entryId] = 0;
    markEntry(true);
  } else {
    const attempts = (state.dictationAttempts[entryId] || 0) + 1;
    state.dictationAttempts[entryId] = attempts;
    const hint = getHint(entry, attempts);
    elements.dictationResult.innerHTML = `不正确，${hint}${renderDiff(answer, entry.word)}`;
    speak(entry.word);
    if (attempts >= 3) {
      elements.dictationResult.innerHTML = `不正确，正确答案：${entry.word}${renderDiff(answer, entry.word)}`;
      state.dictationAttempts[entryId] = 0;
      markEntry(false);
    }
  }
  elements.dictationInput.value = '';
};

if (elements.courseSelect) {
  elements.courseSelect.addEventListener('change', (event) => {
    state.currentListId = event.target.value;
    updateEntries();
    updateStats();
    renderWordList();
    renderWrongList();
    prepareQueue();
    renderFlashcard();
    renderPlan();
  });
}

if (elements.filterSelect) {
  elements.filterSelect.addEventListener('change', (event) => {
    state.filter = event.target.value;
    updateStats();
    renderWordList();
    prepareQueue();
    renderFlashcard();
  });
}

if (elements.searchInput) {
  elements.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.trim();
    renderWordList();
    prepareQueue();
    renderFlashcard();
  });
}

if (elements.flashcard) {
  elements.flashcard.addEventListener('click', () => {
    elements.flashcard.classList.toggle('flipped');
  });
}

if (elements.markKnown) {
  elements.markKnown.addEventListener('click', () => markEntry(true));
}

if (elements.markLearning) {
  elements.markLearning.addEventListener('click', () => markEntry(false));
}

if (elements.nextCard) {
  elements.nextCard.addEventListener('click', () => renderFlashcard());
}

if (elements.startPractice) {
  elements.startPractice.addEventListener('click', () => {
    prepareQueue();
    renderFlashcard();
  });
}

if (elements.resetProgress) {
  elements.resetProgress.addEventListener('click', resetProgress);
}

if (elements.importFile) {
  elements.importFile.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImport(file);
    }
  });
}

if (elements.downloadTemplate) {
  elements.downloadTemplate.addEventListener('click', downloadTemplate);
}

if (elements.savePlan) {
  elements.savePlan.addEventListener('click', () => {
    const value = Number(elements.dailyTarget.value) || 30;
    state.plan.dailyTarget = Math.min(Math.max(value, 5), 200);
    savePlan();
    renderPlan();
  });
}

if (elements.startDaily) {
  elements.startDaily.addEventListener('click', () => {
    prepareQueue('daily');
    renderFlashcard();
  });
}

if (elements.viewWrongList) {
  elements.viewWrongList.addEventListener('click', () => {
    elements.wrongList?.scrollIntoView({ behavior: 'smooth' });
  });
}

if (elements.toggleDictation) {
  elements.toggleDictation.addEventListener('change', (event) => {
    state.practice.dictation = event.target.checked;
    savePractice();
    renderPractice();
    prepareQueue();
    renderFlashcard();
  });
}

if (elements.toggleMask) {
  elements.toggleMask.addEventListener('change', (event) => {
    state.practice.maskExamples = event.target.checked;
    savePractice();
    renderWordList();
    renderWrongList();
    renderFlashcard();
  });
}

if (elements.toggleAutoSpeak) {
  elements.toggleAutoSpeak.addEventListener('change', (event) => {
    state.practice.autoSpeak = event.target.checked;
    savePractice();
  });
}

if (elements.voiceSelect) {
  elements.voiceSelect.addEventListener('change', (event) => {
    state.practice.voiceId = event.target.value;
    savePractice();
  });
}

if (elements.rateInput) {
  elements.rateInput.addEventListener('input', (event) => {
    state.practice.rate = Number(event.target.value) || 1;
    savePractice();
    renderPractice();
  });
}

if (elements.checkDictation) {
  elements.checkDictation.addEventListener('click', checkDictation);
}

if (elements.dictationInput) {
  elements.dictationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      checkDictation();
    }
  });
}

if (elements.speakWord) {
  elements.speakWord.addEventListener('click', () => {
    const entryId = elements.flashcard.dataset.entryId;
    const entry = state.entries.find((item) => item.id === entryId);
    if (entry) {
      speak(entry.word);
    }
  });
}

if (elements.speakExample) {
  elements.speakExample.addEventListener('click', () => {
    const entryId = elements.flashcard.dataset.entryId;
    const entry = state.entries.find((item) => item.id === entryId);
    if (entry) {
      speak(entry.example || entry.raw || entry.word);
    }
  });
}

const handleSynonymClick = (synonym) => {
  const entry = findEntryBySynonym(synonym);
  if (entry) {
    elements.flashcard.dataset.entryId = entry.id;
    elements.flashcard.classList.remove('flipped');
    elements.cardFront.textContent = state.practice.dictation ? '听写模式：点击朗读按钮' : entry.word;
    const example = state.practice.maskExamples
      ? maskExample(entry.example || entry.raw || '', entry.word)
      : entry.example || entry.raw || '暂无例句';
    elements.cardBack.textContent = example;
    renderSynonymTags(entry);
    if (state.practice.autoSpeak) {
      speak(entry.word);
    }
  }
  speak(synonym);
};

if (elements.synonymTags) {
  elements.synonymTags.addEventListener('click', (event) => {
    const target = event.target;
    if (target.classList.contains('synonym-tag')) {
      const synonym = target.dataset.synonym || target.textContent;
      handleSynonymClick(synonym);
    }
  });
}

if (elements.wordList) {
  elements.wordList.addEventListener('click', (event) => {
    const target = event.target;
    if (target.classList.contains('synonym-tag')) {
      const synonym = target.dataset.synonym || target.textContent;
      handleSynonymClick(synonym);
    }
  });
}

if (elements.wrongList) {
  elements.wrongList.addEventListener('click', (event) => {
    const target = event.target;
    if (target.classList.contains('synonym-tag')) {
      const synonym = target.dataset.synonym || target.textContent;
      handleSynonymClick(synonym);
    }
  });
}

if (elements.spellThenSpeak) {
  elements.spellThenSpeak.addEventListener('click', () => {
    const entryId = elements.flashcard.dataset.entryId;
    const entry = state.entries.find((item) => item.id === entryId);
    if (entry) {
      speakSpellThenWord(entry.word);
    }
  });
}

init().catch((err) => {
  console.error(err);
  elements.cardFront.textContent = '加载失败';
  elements.cardBack.textContent = '请检查数据文件是否存在。';
});
