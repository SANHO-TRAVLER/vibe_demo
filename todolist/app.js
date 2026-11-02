'use strict';

// ---------- storage ----------
const storage = (() => {
  const QUESTS_KEY = 'todayTodo.v1.todos';
  let available = true;

  // 이전 버전 데이터 보정: type 없으면 단기, 단기인데 난이도 없으면 풀뽑기
  function normalize(q) {
    const type = q.type === 'story' ? 'story' : 'daily';
    return {
      ...q,
      type,
      difficulty: type === 'daily' ? (q.difficulty === 'hunt' ? 'hunt' : 'weed') : undefined,
      steps: Array.isArray(q.steps) ? q.steps : [],
    };
  }

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(QUESTS_KEY);
    } catch {
      available = false;
      return [];
    }
    if (!raw) return [];
    try {
      const quests = JSON.parse(raw);
      if (!Array.isArray(quests)) throw new Error('not an array');
      return quests.map(normalize);
    } catch {
      // 손상된 데이터는 백업해 두고 빈 목록으로 시작
      try { localStorage.setItem(QUESTS_KEY + '.corrupt', raw); } catch {}
      return [];
    }
  }

  function save(quests) {
    if (!available) return;
    try {
      localStorage.setItem(QUESTS_KEY, JSON.stringify(quests));
    } catch {
      available = false;
    }
  }

  return { load, save, isAvailable: () => available, KEY: QUESTS_KEY };
})();

// ---------- dateUtil ----------
const dateUtil = {
  formatToday(date = new Date()) {
    const day = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${day} (${weekday})`;
  },
  daysSince(iso) {
    const start = new Date(iso);
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((today - start) / 86400000) + 1;
  },
};

// ---------- pixel ----------
// 문자 지도로 도트 그림(SVG)을 만든다. '.'은 투명.
const pixel = (() => {
  const COLORS = {
    // 공용
    k: '#5b4636', e: '#2b2420', w: '#ffffff', p: '#ffb3c1',
    // 아이콘
    G: '#3f9b4f', g: '#8fd48a', b: '#9a6a44',
    R: '#e2667a', r: '#ffb3c1', y: '#ffd35c', Y: '#e8a93a',
    // 캐릭터
    v: '#8fb4e0', u: '#fff0a8', a: '#c9d0da', h: '#ffdca8', o: '#e8975a',
    c: '#a8673f', m: '#f0c27b', n: '#e8d2b8', d: '#9a6a48', l: '#ecd3b4',
  };

  const ART = {
    sprout: [
      '.........',
      '.GG...GG.',
      'GggG.GggG',
      '.GggGggG.',
      '..GG.GG..',
      '....G....',
      '....G....',
      '..bbbbb..',
      '.bbbbbbb.',
    ],
    sword: [
      '......kkk',
      '.....kwak',
      '....kwak.',
      '...kwak..',
      'k.kwak...',
      '.kkak....',
      '..Yk.....',
      '.YkY.....',
      'Yk.......',
    ],
    flag: [
      '.k.......',
      '.kRRRRR..',
      '.kRrrrRR.',
      '.kRrrRR..',
      '.kRR.....',
      '.k.......',
      '.k.......',
      '.k.......',
      'kkk......',
    ],
    star: [
      '....Y....',
      '...YyY...',
      'YYYYyYYYY',
      '.YyyyyyY.',
      '..YyyyY..',
      '..YyYyY..',
      '.YyY.YyY.',
      '.YY...YY.',
    ],
    chiikawa: [
      '................',
      '..kk........kk..',
      '.kwwk......kwwk.',
      '.kwwwkkkkkkwwwk.',
      '..kwwwwwwwwwwk..',
      '.kwwwwwwwwwwwwk.',
      '.kwwwewwwwewwwk.',
      '.kwwwewwwwewwwk.',
      '.kwpwwwkkwwwpwk.',
      '.kwwwwwwwwwwwwk.',
      '..kwwwwwwwwwwk..',
      '...kkwwwwwwkk...',
      '...kwwwwwwwwk...',
      '...kwwwwwwwwk...',
      '...kwwkkkkwwk...',
      '....kk....kk....',
    ],
    hachiware: [
      '.k............k.',
      '.kk..........kk.',
      '.kvk........kvk.',
      '.kvvkkkkkkkkvvk.',
      '.kvvvvvwwvvvvvk.',
      '.kvvvvwwwwvvvvk.',
      '.kvvvwwwwwwvvvk.',
      '.kwwwewwwwewwwk.',
      '.kwwwewwwwewwwk.',
      '.kwpwwwkkwwwpwk.',
      '..kwwwwwwwwwwk..',
      '...kkwwwwwwkk...',
      '...kwwwwwwwwk...',
      '...kwwwwwwwwk...',
      '...kwwkkkkwwk...',
      '....kk....kk....',
    ],
    usagi: [
      '....kk....kk....',
      '...kuuk..kuuk...',
      '...kupk..kupk...',
      '...kupk..kupk...',
      '...kuuk..kuuk...',
      '..kkuukkkkuukk..',
      '.kuuuuuuuuuuuuk.',
      '.kuueuuuuuueuuk.',
      '.kuueuuuuuueuuk.',
      '.kupuukkkkuupuk.',
      '.kuuuukRRkuuuuk.',
      '..kuuuukkuuuuk..',
      '...kuuuuuuuuk...',
      '...kuuuuuuuuk...',
      '...kuukkkkuuk...',
      '....kk....kk....',
    ],
    armor: [
      '.......RR.......',
      '......RRk.......',
      '....kkkkkkkk....',
      '...kaaaaaaaak...',
      '..kaaaaaaaaaak..',
      '..kaaaaaaaaaak..',
      '..kakkkkkkkkak..',
      '..kaaaaaaaaaak..',
      '..kaaaakkaaaak..',
      '...kaaaaaaaak...',
      '..kkkkkkkkkkkk..',
      '.kaaaakyykaaaak.',
      '.kaaaaakkaaaaak.',
      '..kaaaaaaaaaak..',
      '..kaakkkkkkaak..',
      '...kk......kk...',
    ],
    shisa: [
      '....oo....oo....',
      '..oooooooooooo..',
      '.oookkkkkkkkooo.',
      '.ookhhhhhhhhkoo.',
      'ookhhhhhhhhhhkoo',
      'ookhhehhhhehhkoo',
      'ookhhehhhhehhkoo',
      'ookhphhkkhhphkoo',
      '.okhhhhkkhhhhko.',
      '.ookhhhhhhhhkoo.',
      '..ookkhhhhkkoo..',
      '...khhhhhhhhk...',
      '...khhhhhhhhk...',
      '...khhhhhhhhk...',
      '...khhkkkkhhk...',
      '....kk....kk....',
    ],
    kurimanju: [
      '.......kk.......',
      '......kcck......',
      '.....kcccck.....',
      '....kcccccck....',
      '...kcccccccck...',
      '..kcccccccccck..',
      '.kcccccccccccck.',
      '.kmmmmmmmmmmmmk.',
      '.kmmemmmmmmemmk.',
      '.kmpmmmmmmmmpmk.',
      '.kmmmmmkkmmmmmk.',
      '..kmmmmmmmmmmk..',
      '...kkkkkkkkkk...',
      '....kmk..kmk....',
      '....kk....kk....',
      '................',
    ],
    momonga: [
      '.kk..........kk.',
      'knnk........knnk',
      'knnnk......knnnk',
      '.knnkkkkkkkknnk.',
      '..kwwwwwwwwwwk..',
      '.kwwwwwwwwwwwwk.',
      '.kwweewwwweewwk.',
      '.kwweewwwweewwk.',
      '.kwpwwwkkwwwpwk.',
      '.kwwwwwwwwwwwwk.',
      'kwwkwwwwwwwwkwwk',
      'kwwwkwwwwwwkwwwk',
      '.kkkkwwwwwwkkkk.',
      '....kwwwwwwk....',
      '....kwkkkkwk....',
      '.....k....k.....',
    ],
    kani: [
      '................',
      '................',
      '.kk..........kk.',
      'kRRk........kRRk',
      'kRkRk......kRkRk',
      'kRRRk......kRRRk',
      '.kRk..k..k..kRk.',
      '..kRk.e..e.kRk..',
      '...kkkkkkkkkk...',
      '..kRRRRRRRRRRk..',
      '.kRRRRRRRRRRRRk.',
      '.kRpRRRkkRRRpRk.',
      '.kRRRRRRRRRRRRk.',
      '..kRRRRRRRRRRk..',
      '.k.kkkkkkkkkk.k.',
      'k.k.k......k.k.k',
    ],
    rakko: [
      '................',
      '..kk........kk..',
      '.kddkkkkkkkkddk.',
      '.kddddddddddddk.',
      'kddddllllllddddk',
      'kdddlllllllldddk',
      'kddlellllllelddk',
      'kddllllkkllllddk',
      'kdddlllllllldddk',
      '.kddddddddddddk.',
      '..kddddddddddk..',
      '.kddkddddddkddk.',
      '.kdddkddddkdddk.',
      '..kkkddddddkkk..',
      '...kddkkkkddk...',
      '....kk....kk....',
    ],
  };

  function svg(name, size = 18) {
    const rows = ART[name];
    const w = rows[0].length;
    const h = rows.length;
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    el.setAttribute('width', size);
    el.setAttribute('height', Math.round((size * h) / w));
    el.setAttribute('shape-rendering', 'crispEdges');
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('pixel-icon');
    rows.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === '.') return;
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', 1);
        rect.setAttribute('height', 1);
        rect.setAttribute('fill', COLORS[c]);
        el.appendChild(rect);
      });
    });
    return el;
  }

  return { svg };
})();

// ---------- store ----------
const store = (() => {
  const MAX_LENGTH = 100;
  const state = { quests: storage.load() };
  const listeners = [];

  function newId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function clean(text) {
    return String(text).trim().slice(0, MAX_LENGTH);
  }

  function find(id) {
    return state.quests.find((q) => q.id === id);
  }

  function commit() {
    storage.save(state.quests);
    listeners.forEach((fn) => fn(state));
  }

  const actions = {
    addQuest(type, text, difficulty) {
      const trimmed = clean(text);
      if (!trimmed) return false;
      state.quests.unshift({
        id: newId(),
        type,
        difficulty: type === 'daily' ? (difficulty === 'hunt' ? 'hunt' : 'weed') : undefined,
        text: trimmed,
        completed: false,
        steps: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
      commit();
      return true;
    },
    toggleQuest(id) {
      const quest = find(id);
      if (!quest) return;
      quest.completed = !quest.completed;
      quest.completedAt = quest.completed ? new Date().toISOString() : null;
      commit();
    },
    deleteQuest(id) {
      state.quests = state.quests.filter((q) => q.id !== id);
      commit();
    },
    addStep(questId, text) {
      const quest = find(questId);
      const trimmed = clean(text);
      if (!quest || !trimmed) return false;
      quest.steps.push({ id: newId(), text: trimmed, done: false });
      commit();
      return true;
    },
    toggleStep(questId, stepId) {
      const step = find(questId)?.steps.find((s) => s.id === stepId);
      if (!step) return;
      step.done = !step.done;
      commit();
    },
    deleteStep(questId, stepId) {
      const quest = find(questId);
      if (!quest) return;
      quest.steps = quest.steps.filter((s) => s.id !== stepId);
      commit();
    },
  };

  return {
    getState: () => state,
    subscribe: (fn) => listeners.push(fn),
    ...actions,
  };
})();

// ---------- view ----------
const view = (() => {
  const DIFFICULTY = {
    weed: { label: '풀뽑기', icon: 'sprout' },
    hunt: { label: '토벌', icon: 'sword' },
  };

  const el = {
    warning: document.getElementById('storage-warning'),
    today: document.getElementById('today'),
    dailyCount: document.getElementById('daily-count'),
    dailyTrack: document.getElementById('daily-track'),
    dailyBar: document.getElementById('daily-bar'),
    dailyList: document.getElementById('daily-list'),
    dailyEmpty: document.getElementById('daily-empty'),
    dailyClear: document.getElementById('daily-clear'),
    storyCount: document.getElementById('story-count'),
    storyList: document.getElementById('story-list'),
    storyEmpty: document.getElementById('story-empty'),
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // 사용자 입력은 textContent로만 (XSS 방지)
    return node;
  }

  function checkbox(checked, label, action) {
    const box = make('input', 'pixel-check');
    box.type = 'checkbox';
    box.checked = checked;
    box.dataset.action = action;
    box.setAttribute('aria-label', label);
    return box;
  }

  function deleteButton(label, action) {
    const btn = make('button', 'icon-btn', '✕');
    btn.type = 'button';
    btn.dataset.action = action;
    btn.setAttribute('aria-label', label);
    return btn;
  }

  function renderDaily(quest) {
    const diff = DIFFICULTY[quest.difficulty];
    const li = make('li', `quest daily ${quest.difficulty}` + (quest.completed ? ' completed' : ''));
    li.dataset.id = quest.id;
    const tag = make('span', 'diff-tag');
    tag.append(pixel.svg(diff.icon, 12), make('span', '', diff.label));
    li.append(
      checkbox(quest.completed, `${diff.label}: ${quest.text} 완료`, 'toggle-quest'),
      tag,
      make('span', 'quest-text', quest.text),
      deleteButton(`${quest.text} 삭제`, 'delete-quest'),
    );
    return li;
  }

  function renderStory(quest) {
    const done = quest.steps.filter((s) => s.done).length;
    const total = quest.steps.length;
    const percent = quest.completed ? 100 : total ? Math.round((done / total) * 100) : 0;

    const li = make('li', 'quest story' + (quest.completed ? ' completed' : ''));
    li.dataset.id = quest.id;

    const head = make('div', 'story-head');
    const title = make('div', 'story-title');
    title.append(pixel.svg('flag', 16), make('span', 'quest-text', quest.text));
    head.append(
      checkbox(quest.completed, `${quest.text} 퀘스트 완료`, 'toggle-quest'),
      title,
      deleteButton(`${quest.text} 퀘스트 삭제`, 'delete-quest'),
    );

    const meta = make('div', 'story-meta');
    meta.append(
      make('span', 'story-day', `${dateUtil.daysSince(quest.createdAt)}일째`),
      make('span', 'story-ratio', total ? `목표 ${done}/${total}` : '세부 목표 없음'),
    );
    const track = make('div', 'pixel-track small');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `${quest.text} 진행률`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(percent));
    const bar = make('div', 'pixel-bar story-bar');
    bar.style.width = percent + '%';
    track.append(bar);

    const steps = make('ul', 'steps');
    quest.steps.forEach((step) => {
      const s = make('li', 'step' + (step.done ? ' done' : ''));
      s.dataset.stepId = step.id;
      s.append(
        checkbox(step.done, `${step.text} 완료`, 'toggle-step'),
        make('span', 'step-text', step.text),
        deleteButton(`${step.text} 삭제`, 'delete-step'),
      );
      steps.append(s);
    });

    const form = make('form', 'step-form');
    form.dataset.action = 'add-step';
    form.autocomplete = 'off';
    const input = make('input');
    input.type = 'text';
    input.maxLength = 100;
    input.placeholder = '+ 세부 목표 추가';
    input.setAttribute('aria-label', `${quest.text}에 세부 목표 추가`);
    form.append(input);

    li.append(head, meta, track, steps);
    if (!quest.completed) li.append(form);
    if (quest.completed) {
      const stamp = make('div', 'stamp');
      stamp.append(pixel.svg('star', 14), make('span', '', 'CLEAR'));
      li.append(stamp);
    }
    return li;
  }

  function render(state) {
    const daily = state.quests.filter((q) => q.type === 'daily');
    const story = state.quests.filter((q) => q.type === 'story');
    const dailyDone = daily.filter((q) => q.completed).length;
    const percent = daily.length ? Math.round((dailyDone / daily.length) * 100) : 0;

    el.warning.hidden = storage.isAvailable();
    el.today.textContent = dateUtil.formatToday();

    el.dailyCount.textContent = `${dailyDone} / ${daily.length}`;
    el.dailyBar.style.width = percent + '%';
    el.dailyTrack.setAttribute('aria-valuenow', String(percent));
    el.dailyList.replaceChildren(...daily.map(renderDaily));
    el.dailyEmpty.hidden = daily.length > 0;
    el.dailyClear.hidden = !(daily.length > 0 && dailyDone === daily.length);

    const storyActive = story.filter((q) => !q.completed).length;
    el.storyCount.textContent = `진행 중 ${storyActive}`;
    el.storyList.replaceChildren(...story.map(renderStory));
    el.storyEmpty.hidden = story.length > 0;
  }

  return { render };
})();

// ---------- critters ----------
// 보드 가장자리를 둘러싼 캐릭터들. 한 번에 한 명씩 말풍선을 띄운다.
const critters = (() => {
  const SHOW_MS = 10_000;   // 말풍선 표시 시간
  const GAP_MS = 50_000;    // 말풍선이 사라진 뒤 다음 말풍선까지
  const FIRST_MS = 3_000;   // 첫 말풍선은 금방 띄워 준다

  const CAST = [
    { id: 'chiikawa', name: '치이카와', line: '시러~ 시이러~~' },
    { id: 'hachiware', name: '하치와레', line: '어떻게든 되어라~!' },
    { id: 'usagi', name: '우사기', line: '우라 야하야하' },
    { id: 'armor', name: '갑옷씨', line: '아이고~!' },
    { id: 'shisa', name: '시사', line: '샤부넴!' },
    { id: 'kurimanju', name: '쿠리만주', line: '키야아~~!!!' },
    { id: 'momonga', name: '모몽가', line: '상냥하게 까서 내 입에 쏘옥 넣어라!' },
    { id: 'kani', name: '카니', line: '활짝~~' },
    { id: 'rakko', name: '랏코', line: '(한정판 딸기 디저트가) 온다.' },
  ];

  // 자리: 보드의 어느 변(side)의 몇 % 지점(at)인지. 시계 방향으로 둘러싼다.
  const RING_WIDE = [
    { side: 'top', at: 18 }, { side: 'top', at: 50 }, { side: 'top', at: 82 },
    { side: 'right', at: 30 }, { side: 'right', at: 72 },
    { side: 'bottom', at: 75 }, { side: 'bottom', at: 25 },
    { side: 'left', at: 72 }, { side: 'left', at: 30 },
  ];
  // 좁은 화면에서는 좌우 여백이 없으니 위·아래 두 줄로
  const RING_NARROW = [
    { side: 'top', at: 10 }, { side: 'top', at: 30 }, { side: 'top', at: 50 },
    { side: 'top', at: 70 }, { side: 'top', at: 90 },
    { side: 'bottom', at: 85 }, { side: 'bottom', at: 62 },
    { side: 'bottom', at: 38 }, { side: 'bottom', at: 15 },
  ];

  const nodes = [];
  const hideTimers = new Map();
  let lastIndex = -1;

  function place(node, slot) {
    node.dataset.side = slot.side;
    const horizontal = slot.side === 'top' || slot.side === 'bottom';
    node.style.left = horizontal ? `${slot.at}%`
      : slot.side === 'left' ? 'var(--edge)' : 'calc(100% - var(--edge))';
    node.style.top = !horizontal ? `${slot.at}%`
      : slot.side === 'top' ? 'var(--edge)' : 'calc(100% - var(--edge))';
    // 말풍선은 보드 바깥쪽 여백으로 펼친다
    node.dataset.bubble = horizontal ? (slot.at < 55 ? 'right' : 'left')
      : slot.side === 'left' ? 'up-right' : 'up-left';
  }

  function layout(narrow) {
    const ring = narrow ? RING_NARROW : RING_WIDE;
    nodes.forEach((node, i) => place(node, ring[i]));
  }

  function show(i) {
    const node = nodes[i];
    clearTimeout(hideTimers.get(node));
    node.classList.add('talking');
    hideTimers.set(node, setTimeout(() => node.classList.remove('talking'), SHOW_MS));
  }

  function pickNext() {
    let i;
    do { i = Math.floor(Math.random() * CAST.length); } while (i === lastIndex && CAST.length > 1);
    lastIndex = i;
    return i;
  }

  function cycle() {
    show(pickNext());
    setTimeout(cycle, SHOW_MS + GAP_MS);
  }

  function mount(stage) {
    CAST.forEach((c, i) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'critter';
      node.title = c.name;
      node.setAttribute('aria-label', `${c.name}: ${c.line}`);
      node.style.setProperty('--delay', `${(i * 0.37) % 1.2}s`);
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.setAttribute('aria-hidden', 'true');
      bubble.textContent = c.line;
      node.append(pixel.svg(c.id, 48), bubble);
      // 클릭하면 바로 그 캐릭터의 말버릇을 들려준다 (자동 순서와는 별개)
      node.addEventListener('click', () => show(i));
      stage.append(node);
      nodes.push(node);
    });

    const narrow = window.matchMedia('(max-width: 699px)');
    layout(narrow.matches);
    narrow.addEventListener('change', (e) => layout(e.matches));

    setTimeout(cycle, FIRST_MS);
  }

  return { mount };
})();

// ---------- controller ----------
(() => {
  function shake(form) {
    form.classList.remove('shake');
    void form.offsetWidth; // 애니메이션 재시작
    form.classList.add('shake');
  }

  // 단기 / 장기 퀘스트 추가 폼
  document.querySelectorAll('.quest-form').forEach((form) => {
    const input = form.querySelector('input[type="text"]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const difficulty = form.querySelector('input[name="difficulty"]:checked')?.value;
      if (store.addQuest(form.dataset.type, input.value, difficulty)) {
        input.value = '';
      } else {
        shake(form);
      }
      input.focus();
    });
  });

  document.addEventListener('animationend', (e) => {
    if (e.animationName === 'shake') e.target.classList.remove('shake');
  });

  // 목록 이벤트는 퀘스트 보드에 위임
  const board = document.getElementById('board');

  function ids(target) {
    return {
      questId: target.closest('.quest')?.dataset.id,
      stepId: target.closest('.step')?.dataset.stepId,
    };
  }

  board.addEventListener('change', (e) => {
    const { questId, stepId } = ids(e.target);
    if (e.target.dataset.action === 'toggle-quest') store.toggleQuest(questId);
    if (e.target.dataset.action === 'toggle-step') store.toggleStep(questId, stepId);
  });

  board.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { questId, stepId } = ids(btn);
    if (btn.dataset.action === 'delete-quest') store.deleteQuest(questId);
    if (btn.dataset.action === 'delete-step') store.deleteStep(questId, stepId);
  });

  board.addEventListener('submit', (e) => {
    if (e.target.dataset.action !== 'add-step') return;
    e.preventDefault();
    const { questId } = ids(e.target);
    const input = e.target.querySelector('input');
    if (store.addStep(questId, input.value)) {
      // 다시 그린 뒤 같은 퀘스트의 입력창으로 포커스 복귀
      board.querySelector(`.quest[data-id="${questId}"] .step-form input`)?.focus();
    } else {
      shake(e.target);
    }
  });

  // 다른 탭에서 변경되면 반영
  window.addEventListener('storage', (e) => {
    if (e.key === storage.KEY) location.reload();
  });

  document.getElementById('daily-icon').append(pixel.svg('sprout', 22));
  document.getElementById('story-icon').append(pixel.svg('flag', 22));
  document.getElementById('clear-icon').append(pixel.svg('star', 16));
  document.querySelectorAll('[data-icon]').forEach((slot) => slot.append(pixel.svg(slot.dataset.icon, 14)));

  critters.mount(document.getElementById('stage'));
  store.subscribe(view.render);
  view.render(store.getState());
})();
