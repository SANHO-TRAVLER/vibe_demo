'use strict';

// ---------- storage ----------
const storage = (() => {
  const QUESTS_KEY = 'todayTodo.v1.todos';
  let available = true;

  // 이전 버전 데이터 보정: type 없으면 단기, 단기인데 난이도 없으면 풀뽑기,
  // 마감(due)과 일자별 기록(schedule)이 없으면 빈 값
  function normalize(q) {
    const type = q.type === 'story' ? 'story' : 'daily';
    const info = {};
    journal.FIELDS.forEach((f) => { info[f.id] = typeof q[f.id] === 'string' ? q[f.id] : ''; });
    return {
      ...q,
      ...info,
      category: journal.CATEGORIES.some((c) => c.id === q.category) ? q.category : '',
      type,
      difficulty: type === 'daily' ? (q.difficulty === 'hunt' ? 'hunt' : 'weed') : undefined,
      due: type === 'daily' && typeof q.due === 'string' ? q.due : null,
      steps: Array.isArray(q.steps) ? q.steps : [],
      schedule: Array.isArray(q.schedule)
        ? q.schedule.map((e) => ({
          ...e,
          steps: Array.isArray(e.steps) ? e.steps : [],
          memo: typeof e.memo === 'string' ? e.memo : '',
        }))
        : [],
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

// ---------- journal ----------
// 업무 일지 양식의 항목. 퀘스트 내용(text)은 일지의 '세부사항' 칸이 된다.
const journal = {
  // minRows: 엑셀로 뽑을 때 구분마다 최소로 그려 둘 줄 수 (원래 양식과 같은 모양)
  CATEGORIES: [
    { id: 'fragrance-client', label: '향료개발 (고객사 대응)', minRows: 14 },
    { id: 'fragrance-tech', label: '향료개발 (기술 개발)', minRows: 3 },
    { id: 'documents', label: '자료대응', minRows: 5 },
    { id: 'copy-review', label: '문안 검수', minRows: 2 },
    { id: 'issue', label: '이슈 대응', minRows: 4 },
    { id: 'sales', label: '영업 지원', minRows: 4 },
    { id: 'research', label: '연구 지원', minRows: 6 },
  ],
  FIELDS: [
    { id: 'company', label: '업체명' },
    { id: 'product', label: '제품명' },
    { id: 'researcher', label: '담당 연구원' },
    { id: 'bm', label: '담당 BM/영업' },
    { id: 'qa', label: '품질보증 담당자' },
    { id: 'note', label: '비고' },
  ],
  categoryLabel(id) {
    return journal.CATEGORIES.find((c) => c.id === id)?.label ?? '';
  },
};

// ---------- dateUtil ----------
const dateUtil = {
  formatToday(date = new Date()) {
    const day = date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${day} (${weekday})`;
  },
  // 두 날짜('YYYY-MM-DD') 사이의 날 수
  daysBetween(from, to) {
    return Math.round((dateUtil.fromKey(to) - dateUtil.fromKey(from)) / 86400000);
  },
  // 그 날짜의 시각 기록: 오늘이면 지금, 다른 날이면 그날의 '지금 시각'
  stamp(day = dateUtil.key()) {
    const now = new Date();
    if (day === dateUtil.key(now)) return now.toISOString();
    const d = dateUtil.fromKey(day);
    d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return d.toISOString();
  },
  // ISO 시각 → 그 시각의 로컬 날짜
  dayOf(iso) {
    return dateUtil.key(new Date(iso));
  },
  shortKey(key) {
    const [, m, d] = key.split('-').map(Number);
    return `${m}/${d}`;
  },
  // 로컬 날짜 'YYYY-MM-DD' (toISOString은 UTC라 자정 근처에 하루 밀린다)
  key(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },
  fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  formatKey(key) {
    const date = dateUtil.fromKey(key);
    const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
  },
  // 마감 표시: due는 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM'
  dueLabel(due, now = new Date()) {
    const [day, time] = due.split('T');
    const diff = Math.round((dateUtil.fromKey(day) - dateUtil.fromKey(dateUtil.key(now))) / 86400000);
    const end = time ? new Date(`${day}T${time}`) : new Date(dateUtil.fromKey(day).getTime() + 86400000);
    const overdue = now >= end;
    let text;
    if (overdue) text = '마감 지남';
    else if (diff === 0) text = time ? `오늘 ${time}까지` : '오늘까지';
    else if (diff === 1) text = time ? `내일 ${time}` : '내일까지';
    else text = `D-${diff}`;
    return { text, overdue, title: `마감 ${dateUtil.formatKey(day)}${time ? ' ' + time : ''}` };
  },
};

// ---------- daybook ----------
// 하루 단위 보드 규칙.
// 어떤 날의 보드 = 그날까지 수주했고, 아직 안 끝냈거나 그날 이후에 끝낸 퀘스트.
// 그래서 오늘 못 끝낸 일만 내일로 넘어가고, 끝낸 일은 끝낸 날짜에서 다시 볼 수 있다.
const daybook = {
  on(q, day) {
    if (dateUtil.dayOf(q.createdAt) > day) return false;
    if (!q.completed) return true;
    return dateUtil.dayOf(q.completedAt || q.createdAt) >= day;
  },
  // 그날 기준으로 본 모습: 그 뒤에 끝낸 퀘스트는 그날엔 아직 진행 중
  asOf(q, day) {
    return q.completed && dateUtil.dayOf(q.completedAt || q.createdAt) > day ? { ...q, completed: false } : q;
  },
  quests(all, day) {
    return all.filter((q) => daybook.on(q, day)).map((q) => daybook.asOf(q, day));
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
    v: '#8db8e3', u: '#fbf1c6', a: '#aab2bd', A: '#dde2e8', h: '#fbf0cf', o: '#c99478',
    O: '#8f5a40', c: '#a8673f', C: '#d39a6a', m: '#ecd2a2', q: '#f29aaa', P: '#fde6df',
    Q: '#f7b8c0', s: '#d3e7f8', S: '#93c0e8', l: '#f6e7c9', K: '#c9b08e', L: '#9a7b55',
    // 곰돌이 포셰트 털색 (달력에서 퀘스트 색으로 바꿔 칠함)
    F: '#f7a8c0',
    // 크리스마스 (트리 초록·그늘·반짝임, 오너먼트 빨강·파랑)
    T: '#2f7d4a', U: '#1f5c36', V: '#4fa865', D: '#d23b44', B: '#5b8fd0',
    // 오브제
    W: '#d9a66b', X: '#b98450',
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
      '........................',
      '........................',
      '....kk....kkkk....kk....',
      '...kwwkkkkwwwwkkkkwwk...',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '...kwwwwwwwwwwwwwwwwk...',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '.kwwwwwwwwwwwwwwwwwwwwk.',
      '.kwwwwweewwwwwweewwwwwk.',
      '.kwwwwweewwwwwweewwwwwk.',
      '.kwpppwwwwkRRkwwwwpppwk.',
      '..kwwwwwwwkRRkwwwwwwwk..',
      '..kwwwwwwwwkkwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '...kkkwwwwwwwwwwwwkkk...',
      '....kwwwwwwwwwwwwwwk....',
      '....kwwwwwwwwwwwwwwk....',
      '.....kwwwwwwwwwwwwk.....',
      '......kwwwwwwwwwwk......',
      '.......kkkkkkkkkk.......',
      '........................',
    ],
    hachiware: [
      '........................',
      '....kkkkkk....kkkkkk....',
      '...kvvvvvvkkkkvvvvvvk...',
      '..kvvvvvvvvwwvvvvvvvvk..',
      '..kvvvvvvvvwwvvvvvvvvk..',
      '..kvvvvvvvvwwvvvvvvvvk..',
      '...kvvvvvvvwwvvvvvvvk...',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '.kwwwwwewwwwwwwewwwwwwk.',
      '.kwwwwweewwwwwweewwwwwk.',
      '.kwwwwwwwwwwwwwwwwwwwwk.',
      '.kwpppwwwwkwwkwwwwpppwk.',
      '..kwwwwwwwwkkwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '...kkkwwwwwwwwwwwwkkk...',
      '....kwwwwwwwwwwwwwwkkkk.',
      '....kwwwwwwwwwwwwwwvvvvk',
      '.....kwwwwwwwwwwwwkkvvvk',
      '......kwwwwwwwwwwk..kkk.',
      '.......kkkkkkkkkk.......',
      '........................',
    ],
    usagi: [
      '.......kuk....kuk.......',
      '.......kuuk..kuuk.......',
      '......kuuuk..kuuuk......',
      '......kuuuk..kuuuk......',
      '......kuuuk..kuuuk......',
      '......kuuuk..kuuuk......',
      '......kuuukkkkuuuk......',
      '......kuuuuuuuuuuk......',
      '.....kkuuuuuuuuuukk.....',
      '....kuuuuuuuuuuuuuuk....',
      '....kuuuuuuuuuuuuuuk....',
      '...kuuuueuuuuuueuuuuk...',
      '...kuuuueuuuuuueuuuuk...',
      '...kupppuuuuuuuupppuk...',
      '...kuuuuuuukkuuuuuuuk...',
      '....kuuuuuuuuuuuuuuk....',
      '.....kuuuuuuuuuuuuk.....',
      '....kuuuuuuuuuuuuuuk....',
      '.....kuuuuuuuuuuuuk.....',
      '......kuuuuuuuuuuk......',
      '......kuuuuuuuuuuk......',
      '.......kuuuuuuuuk.......',
      '........kkkkkkkk........',
      '........................',
    ],
    armor: [
      '........................',
      '.........kkkkkk.........',
      '.......kkaaAAaakk.......',
      '......kaaaaAAaaaak......',
      '.....kaAAaaAAaaaaak.....',
      '.....kaAAaaAAaaaaak.....',
      '.....kaaaaaaaaaaaak.....',
      '....kaakkkkkkkkkkaak....',
      '.....kakkkkkkkkkkak.....',
      '.....kaaakakakakaak.....',
      '.....kaaaaaaaaaaaak.....',
      '.....kkaaaaaaaaaakk.....',
      '....kakkkaaaaaakkkak....',
      '...kaakkkkkkkkkkkkaak...',
      '...kaaaaaaaaaaaaaaaak...',
      '...kaaaaaaaaaaaaaaaak...',
      '...kaaaaaaaaaaaaaaaak...',
      '....kaaaaaaaaaaaaaak....',
      '.....kaabbbbbbbbaak.....',
      '......kaaaaaaaaaak......',
      '.......kaaaaaaaak.......',
      '.......kaaakkaaak.......',
      '.......kaaakkaaak.......',
      '........kkk..kkk........',
    ],
    shisa: [
      '........................',
      '.....kk..........kk.....',
      '....khhk...kk...khhk....',
      '...khohhkkkhhkkkhhohk...',
      '..kkhhohhhhhhhhhhohhkk..',
      '.kookhhhhhhhhhhhhhhkook.',
      'koooohohohhhhhhohohooook',
      'kooohhhohhhhhhhhohhhoook',
      'koOohhhhhhhhhhhhhhhhoOok',
      'koohhhhewhhhhhhewhhhhook',
      'koohhhheehhhhhheehhhhook',
      'koOhppphhhkRRkhhhppphOok',
      'koohhhhhhhkRRkhhhhhhhook',
      'kooohhhhhhhkkhhhhhhhoook',
      'kooohhhhhhhhhhhhhhhhoook',
      '.kkhhhhhhhhhhhhhhhhhhkk.',
      '..kRRRRRRRhhhhRRRRRRRk..',
      '...kkkRwRRhhhhRRRwkkk...',
      '....kRRRRRhhhhRRRRRk....',
      '....kRRRwRhhhhRRwRRk....',
      '.....kRRRRhhhhRRRRk.....',
      '......khhhhhhhhhhk......',
      '.......kkkkookkkk.......',
      '...........kk...........',
    ],
    kurimanju: [
      '........................',
      '........................',
      '........................',
      '........kkkkkkkk........',
      '.......kcCCccccck.......',
      '......kcCcccccccck......',
      '....kkmccccccccccmkk....',
      '...kmmmmccccccccmmmmk...',
      '..kmmmmmmmccccmmmmmmmk..',
      '.kmmmmmmmmmmmmmmmmmmmmk.',
      '.kmmmmmmmmmmmmmmmmmmmmk.',
      '.kmmmmmeemmmmmmeemmmmmk.',
      '.kmmmmmeemmmmmmeemmmmmk.',
      '.kmmpppmmmmmmmmmmpppmmk.',
      '.kmmmmmmmmmkkmmmmmmmmmk.',
      '.kmmmmmmmmmmmmmmmmmmmmk.',
      '..kmmmmmmmmmmmmmmmmmmk..',
      '...kmmmmmmmmmmmmmmmmk...',
      '....kkmmmmmmmmmmmmkk....',
      '......kmmmmmmmmmmk......',
      '......kmmmkkkkmmmk......',
      '......kmmmk..kmmmk......',
      '.......kkk....kkk.......',
      '........................',
    ],
    momonga: [
      '...............kskkk....',
      '..............ksssssk...',
      '....kkkk....kksssssskk..',
      '...kwwwwk..ksswwwwssssk.',
      '..kwwSwwkkkssswSwwwSsssk',
      '..kwwSwwwwwwwwwSwwwssskk',
      '...kwwwwwwwwwwwwwwSsSsss',
      '...kwwwwwwwwwwwwwwsSssss',
      '..kwwwwwwwwwwwwwwwwssSss',
      '..kwwwwwwwwwwwwwwwwSsssk',
      '.kwwwkkkwwwwwkkkwwwwssss',
      '.kwwweewwwwwweewwwwwSSss',
      '.kkkwwwwwwwwwwwwwwkksssk',
      '.kwwppwwwkwkwwppwwwwkSsk',
      '..wwwwwwwwkwwwwwwwwwssss',
      '...kwwwwwwwwwwwwwwSsssss',
      '....kwwwwwwwwwwwwsssSskk',
      '.....kwwwwwwwwwwssSsssk.',
      '....kwwwwwwwwwwwwSssssk.',
      '....kwwwwwwwwwwwwssskk..',
      '.....kwwwwwwwwwwssssk...',
      '.....kwwwwwwwwwsskkk....',
      '......kkkkkkkkkkk.......',
      '........................',
    ],
    kani: [
      '.....k.k........k.k.....',
      '....kqkqk......kqkqk....',
      '...kqqkqqk....kqqkqqk...',
      '...kqqqqqk....kqqqqqk...',
      '...kqqqqqkkkkkkqqqqqk...',
      '....kqqqQQQQQQQQqqqk....',
      '.....kQQQQQQQQQQQQk.....',
      '....kQQQQQQQQQQQQQQk....',
      '...kPPPPPPPPPPPPPPPPk...',
      '..kPPPPPPPPPPPPPPPPPPk..',
      '..kPPPPPPPPPPPPPPPPPPk..',
      '..kPPPPPewPPPPewPPPPPk..',
      '.kPPPPPPeePPPPeePPPPPPk.',
      '.kPPPPPPPPPPPPPPPPPPPPk.',
      '..kPPpppPPkPPkPPpppPPk..',
      '..kPPPPPPPPkkPPPPPkPPk..',
      '..kkPPPPPPPPPPPPPPPkPk..',
      '.kggPPPPPPPPPPPPPPPPk...',
      'kgggkPPPPPPPPPPPPPPk....',
      'kgggkkPPPPPPPPPPPPk.....',
      '.kggk.kPPPPPPPPPPk......',
      '..kk...kPPPPPPPPk.......',
      '........kkkkkkkk........',
      '........................',
    ],
    rakko: [
      '........................',
      '........................',
      '........KkKkKkKk........',
      '......kKllllllllkK......',
      '.....kllllllllllllK.....',
      '....kllllllllllllllK....',
      '...kllllllllllllllllK...',
      '..kllllllllllllllllllK..',
      '..Klellllllllllllllllk..',
      '..keeelllllllllllllllK..',
      '.kllelllllllllllllllllK.',
      '.Klllllleelllleellllllk.',
      '.klllpplllllllllppllllK.',
      '.Kllllllllkllkllllllllk.',
      '..Kkkkkkkkkkkkkkkkkkkk..',
      '..kwwwwwwwwwwwwwwwwwwk..',
      '..Kwwwwwwwwwwwwwwwwwwkk.',
      '...Kkkkkkkeeeekkkkkkkkwk',
      '....Klllllleellllllwwwwk',
      '.....Kllllllllllllkkkwk.',
      '......KkllllllllKk...k..',
      '........kKkKkKkK........',
      '........................',
      '........................',
    ],
    weeds2: [
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '............k...........',
      '...........kGk..........',
      '......k..k.kgk....k.....',
      '.....kgkkgkkgk.k.kgk....',
      '....kkGk.kkkGkkGkkGk....',
      '...kgkgkkkgkgkkggkgkk...',
      '...kkkgkggkkgkggkkgkgk..',
      '..kGgkGkkGgkGgkGgkGkkGk.',
      '.kkgkkgkGgkkgkGgkGgkGgk.',
      'kGkgGkgGkgGkgGkgGkgGkgkk',
      '.kkGkgGkgGkgGkgGkgGkgGkg',
      '.kGgkGgkGgkGgkGgkGgkGgkk',
      '..kgGkgGkgGkgGkgGkgGkgGk',
      '.kgGkgGkgGkgGkgGkgGkgGk.',
      '.kkggkggkggkggkggkggkggk',
      'kbbbbbbbbbbbbbbbbbbbbbbk',
      'kbbbbbbbbbbbbbbbbbbbbbbk',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
      '........................',
    ],
    weeds1: [
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '..............k.........',
      '....k........kGk........',
      '...kGk...k...kgk...k....',
      '...kgk..kGk..kgk..kgk...',
      '..kggk..kgk.kgGk..kgk...',
      '...kGgk.kgk..kggk.kGk...',
      '..kGgk.kgGk.kggk.kGgk...',
      '.kkkgGkkkggkkkGgkkkgGkk.',
      'kbbbbbbbbbbbbbbbbbbbbbbk',
      'kbbbbbbbbbbbbbbbbbbbbbbk',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
      '........................',
    ],
    weeds0: [
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '........................',
      '..................k.k...',
      '.................kGkgk..',
      '.....kkkkkkkkkkkk.kgk...',
      '....kggGggGggGggGkkGk...',
      '...kggGggGggGggGggGgk...',
      '.kkkkkggGggGggGggGkgkkk.',
      'kbbbbbbbbbbbbbbbbbbbbbbk',
      'kbbbbbbbbbbbbbbbbbbbbbbk',
      '.kkkkkkkkkkkkkkkkkkkkkk.',
      '........................',
    ],
    board0: [
      '........................',
      '........................',
      '..kkkkkkkkkkkkkkkkkkkk..',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWXXXXXXXXXXXXXXXXXXWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWXXXXXXXXXXXXXXXXXXWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '..kkkbbkkkkkkkkkkbbkkk..',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '.....kk..........kk.....',
    ],
    board1: [
      '........................',
      '........................',
      '..kkkkkkkkkkkkkkkkkkkk..',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWwRwwWWWWWWWWWWWWWWk.',
      '.kWXwwwwXXXXXXXXXXXXXWk.',
      '.kWWwKKwWWWWWWWWWWWWWWk.',
      '.kWWwwwwWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWXXXXXXXXXXXXXXXXXXWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '..kkkbbkkkkkkkkkkbbkkk..',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '.....kk..........kk.....',
    ],
    board2: [
      '........................',
      '........................',
      '..kkkkkkkkkkkkkkkkkkkk..',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWwRwwWWwRwwWWWWWWWWk.',
      '.kWXwwwwXXwwwwXXXXXXXWk.',
      '.kWWwKKwWWwKKwWWWWWWWWk.',
      '.kWWwwwwWWwwwwWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWXXXXXXXXXXXXXXXXXXWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '..kkkbbkkkkkkkkkkbbkkk..',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '.....kk..........kk.....',
    ],
    board3: [
      '........................',
      '........................',
      '..kkkkkkkkkkkkkkkkkkkk..',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWwRwwWWwRwwWWwRwwWWk.',
      '.kWXwwwwXXwwwwXXwwwwXWk.',
      '.kWWwKKwWWwKKwWWwKKwWWk.',
      '.kWWwwwwWWwwwwWWwwwwWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWXXXXXXXXXXXXXXXXXXWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '..kkkbbkkkkkkkkkkbbkkk..',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '.....kk..........kk.....',
    ],
    board4: [
      '........................',
      '........................',
      '..kkkkkkkkkkkkkkkkkkkk..',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWWwRwwWWwRwwWWwRwwWWk.',
      '.kWXwwwwXXwwwwXXwwwwXWk.',
      '.kWWwKKwWWwKKwWWwKKwWWk.',
      '.kWWwwwwWWwwwwWWwwwwWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '.kWXXXXwRwwXXXXXXXXXXWk.',
      '.kWWWWWwwwwWWWWWWWWWWWk.',
      '.kWWWWWwKKwWWWWWWWWWWWk.',
      '.kWWWWWwwwwWWWWWWWWWWWk.',
      '.kWWWWWWWWWWWWWWWWWWWWk.',
      '..kkkbbkkkkkkkkkkbbkkk..',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '....kbbk........kbbk....',
      '.....kk..........kk.....',
    ],
    beer: [
      '........................',
      '........................',
      '........................',
      '........................',
      '......kkkkkkkkk.........',
      '.....kwwwwwwwwwk........',
      '....kwwwwwwwwwwwk.......',
      '...kwwwwwwwwwwwwwk......',
      '....kwwwwwwwwwwwk.......',
      '....kwAwAwAwAwAwkkkk....',
      '....kyyyyyyyyYYYAAAAk...',
      '....kyuyyyyyyYYYA..Ak...',
      '....kyuyyywyyYYYA..Ak...',
      '....kyuwyyyyyYYYA..Ak...',
      '....kyuyyyyyyYYYA..Ak...',
      '....kyuyyyyywYYYA..Ak...',
      '....kyuywyyyyYYYA..Ak...',
      '....kyuyyyyyyYYYA..Ak...',
      '....kyuyyyywyYYYAAAAk...',
      '....kyuyyyyyyYYYkkkk....',
      '....kyyyywyyyYYYk.......',
      '....kyyyyyyyyYYYk.......',
      '.....kkkkkkkkkkk........',
      '........................',
    ],
    ramen: [
      '........................',
      '........................',
      '........................',
      '...........s............',
      '............s...........',
      '.......s...s.........k..',
      '......s.....s....s..kbk.',
      '.......s...s....s..kbkbk',
      '......s...........kbkbk.',
      '.................kbkbk..',
      '......kkkkkkkkkkkbkbk...',
      '...kkkuuuuuyyyuGGubkk...',
      '..kuuuppwuuyYyuGGbuuuk..',
      '.kuuuuwwwuuuuuuGGuuuuuk.',
      '.kRuuuuuuuuuuuuuuuuuuRk.',
      '.kRRRRuuuuuuuuuuuuRRRRk.',
      '.kRwwRwwwRwwwRwwwRwwwRk.',
      '..kRRRRRRRRRRRRRRRRRRk..',
      '...kRRRRRRRRRRRRRRRRk...',
      '....kRRRRRRRRRRRRRRk....',
      '.....kkRRRRRRRRRRkk.....',
      '.......kRRRRRRRRk.......',
      '........kkkkkkkk........',
      '........................',
    ],
    bear: [
      '..kk......kk..',
      '.kFFk....kFFk.',
      '.kFFFkkkkFFFk.',
      'kFFFFFFFFFFFFk',
      'kFFeFFFFFFeFFk',
      'kFFFFweewFFFFk',
      'kFFFwwwwwwFFFk',
      'kFFFwewwewFFFk',
      'kFFFwweewwFFFk',
      '.kFFFwwwwFFFk.',
      '..kkFFFFFFkk..',
      '....kkkkkk....',
    ],
    xmasTree: [
      '...............................kk...............................',
      '..............................kyyk..............................',
      '..............................kyyk..............................',
      '.............................kyyyyk.............................',
      '............................kkyyyykk............................',
      '........................kkkkyyyyyyyykkkk........................',
      '.......................kyyyyyyyyyyyyyyyyk.......................',
      '........................kyyywwwyyywwwyyk........................',
      '.........................kyywewyyywewyk.........................',
      '..........................kywwwyyywwwk..........................',
      '.......................k..kyyyyyyyyyyk..k.......................',
      '......................kyk.kyykkkkkkkYk.kyk......................',
      '......................kyykkyykwkwkwkYkkyyk......................',
      '.....................kyyyykyykkkkkkkYkyyyyk.....................',
      '....................kkyyyykyyykkkkyYYkyyyykk....................',
      '................kkkkyyyyyyykkkkkkkkkkyyyyyyykkkk................',
      '...............kyyyyyyyyyyyyyyykyyyyyyyyyyyyyyyyk...............',
      '................kyywwwyyywwwyyykkyyywwwyyywwwyyk................',
      '.................kywewyyywewyyk..kyywewyyywewyk.................',
      '.................kywwwyyywwwyk....kywwwyyywwwyk.................',
      '..................kyyyyyyyyyyk....kyyyyyyyyyyk..................',
      '..................kykkkkkkkYYk....kyykkkkkkkYk..................',
      '..................kykwkwkwkYYk....kyykwkwkwkYk..................',
      '..................kykkkkkkkYYk....kyykkkkkkkYk..................',
      '..................kyyyykkyYYYk....kyyyykkyyYYk..................',
      '..................kykkk..kkkYkkkkkkykkk..kkkYk..................',
      '...................k........kkTTTTkk........k...................',
      '............................kTTTTTUk............................',
      '............................kTTTTwDk............................',
      '...........................kTTTTTDDUk...........................',
      '..........................kVTTTTTTTUUk..........................',
      '..........................kTTTwATTTUUk..........................',
      '.........................kTTTTAATTTUwBk.........................',
      '........................kTYTYTTTTTTUBBUk........................',
      '.......................kTTTTTTYTYTTTUUUUk.......................',
      '.......................kTVTTwDTTTTYTUUUUk.......................',
      '......................kTVTTTDDTTTAwTYUYUUk......................',
      '.....................kTVTTTTTTTTTwwTUUwyYUk.....................',
      '.....................kVTTTTTTTTTTTTTUUyyUUk.....................',
      '....................kVTTVwDTTTwBTTTTTUUUUUUk....................',
      '.....................kkkkDDTTTBBTTTTTUUkkkk.....................',
      '.......................kTTTTTTTTTTTTTUUUk.......................',
      '......................kTTTTTTTTTTTTTTUUUUk......................',
      '.....................kwyYTYTTTTTTTTTTUUUUUk.....................',
      '....................kTyyTTTTYTYTTTTTAwUUUUUk....................',
      '...................kTVTTTTTTTAwTYTYTwwUUUUUUk...................',
      '..................kwyTTTTTTTTwwTTTTTYTYUUAwUUk..................',
      '..................kyyTTTTwyTTTTTTTTTTTUUYwwUUk..................',
      '.................kVTTVTTTyyTTTTTwBTTTTUUUUYUYUk.................',
      '................kVTTVTTTTTTTTTTTBBTTTTTUUUUUUUYk................',
      '...............kwATVTTwDTTTTTTTTTTTTTTTUUUUUUUwDk...............',
      '..............kVAAVTTTDDTTTTTwDTTTTTTTTwAUUUUUDDUk..............',
      '...............kkkkkkTTTTTTTTDDTTTTTTTTAAUUkkkkkk...............',
      '...................kYTYTTTTTTTTTTTTTTTTUUUUUk...................',
      '..................kTTTTTYTYTTTTTTTwDTTTTUUwyUk..................',
      '.................kTTTTTTTTwyYTYTTTDDTTTTUUyyUUk.................',
      '................kwDTTTTTTTyyTTTTYTTTTTwAUUUUUUUk................',
      '...............kTDDTTTTTTTTTTTwyTTYTYTAAUUUUUwBUk...............',
      '.............kkTTVTTTTwyTTTTTTyyTTTTTTYTYUUUUBBUUkk.............',
      '............kVTTVTTTTTyyTTTTTTTTTTwyTTTTTUYUYUUUUwyk............',
      '...........kVTTVTTTTTTTTTTTTTTTTTTyyTTTTTUUUUUYUYyyUk...........',
      '..........kVwyVTTVTwDTTTTTTTTTTTTTTTTTTTTUUUUUUUUUYUUk..........',
      '.........kVTyyTTVTTDDTTTTwDTTTwBTTTTTTTTTUUUwAUUUUUUYUk.........',
      '........kVYTVTTVTTTTTTTTTDDTTTBBTTTTTTTAwUUUAAUUUUUUUUUk........',
      '.........kkkkkkkkkkTTTTTTTTTTTTTTTTTTTTwwTUUUkkkkkkkkkk.........',
      '.................kYTTTTTTTTTTTTTTTTTTTTTTTUUUUk.................',
      '...............kkTTTYTYTTTTAwTTTTTTTTTTTTTUUUUUkk...............',
      '..............kTwATTTTAwYTTwwTTTwATTTwDTTTUUUUUUUk..............',
      '.............kTTAATTTTwwTTYTYTTTAATTTDDTTTUUUUUUUUk.............',
      '...........kkTTTTTTTTTTTTTTTTTYTYTTTTTTTTwDUUUUUwDUkk...........',
      '..........kAwTVTTTTwBTTTTTTTTwyTTTYTYTTTTDDUUUUUDDUUUk..........',
      '.........kVwwVTTTTTBBTTTwDTTTyyTTTTTTTYTYTTUUUUUUUUUUUk.........',
      '.......kkVTTVTTTTTTTTTTTDDTTTTTTTwATTTTTTTYUUUUUUUUUwBUkk.......',
      '......kTVTTVTTTTTTTTTTTTTTTTTTTTTAATTTTTTTTUYUYUUUUUBBUUUk......',
      '.....kTVTTVTTVTwDTTTTTTTTTTTTTTTTTTTTTTTTTTTUUUUYUYUUUUUwyk.....',
      '...kkTVTwyTTVTTDDTTTTwDTTTwyTTTTTTTTwyTTTTwBUUUUUwDUYUYUyyUkk...',
      '..kTTVTTyyTVTTTTTTTTTDDTTTyyTTTTTTTTyyTTTTBBUUUUUDDUUUUUYUYUUk..',
      '.kTTVTTVTTVTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTUUUUUUUUUUUUUUUUYUk.',
      '..kkkkkkkkkkkkkkkkkkkkkkkkkkbbbbbbbbkkkkkkkkkkkkkkkkkkkkkkkkkk..',
      '...........................kbbbbbbbbk...........................',
      '...........................kbbbbbbbbk...........................',
      '...........................kbbbbbbbbk...........................',
      '...........................kbbbbbbbbk...........................',
      '...........................kbbbbbbbbk...........................',
      '...........................kbbbbbbbbk...........................',
      '...........................kbbbbbbbbk...........................',
      '............................kkkkkkkk............................',
      '................................................................',
    ],
    xmasGifts: [
      '........................................................................',
      '........................................................................',
      '........................................................................',
      '.................................................k....k.................',
      '................................................ky....yk................',
      '..................................................yyyy..................',
      '................................k....k.........kkkkkkkkkk...............',
      '...............................kw....wk........kTTTyyTTTk...............',
      '...................k....k........wwww..........kTTTyyTTTk...............',
      '..................kD....Dk....kkkkkkkkkkk......kyyyyyyyyk...............',
      '....................DDDD......kDDDwwDDDDk......kkyyyykyyk...............',
      '................kkkkkkkkkkkk..kDDDwwDDDDk......kTTTyyTkTk...............',
      '.......k....k...kTTTTDDTTTTk..kwwwwwwwwwk......kTTTTTTTTk...............',
      '......ky....yk..kTTTTDDTTTTk..kwwwwwwwwwk...kkkkkkkkkkkkkk..............',
      '........yyyy....kTTTTDDTTTTk..kDDkwwDDkDk...kyyyyyTTyyyyyk..............',
      '..kkkkkkkkkkkkkkkTTTTDDTTTTk..kDkDwwDDDkk...kyyyyyTTyyyyyk..k....k......',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTk..kkkkDDDDkkk...kyyyyyTTyyyyyk.kw....wk.....',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTkkkkkkkkkkkkkkkkkkyyyyyTTyyyyyk...wwww.......',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTkwwwwwwwDDwwwwwwwkyyyyyTTyyyyykkkkkkkkkkkkk..',
      '..kDDDDDDyyDDDDDkDDDDDDDDDDkwwwwwwwDDwwwwwwwkyyyyyTTyyyyykBBBBwwBBBBBk..',
      '..kDDDDDDyyDDDDDkDDDDDDDDDDkwwwwwwwDDwwwwwwwkTTTTTTTTTTTTkBBBBwwBBBBBk..',
      '..kyyyyyyyyyyyyykTTTTDDTTTTkwwwwwwwDDwwwwwwwkTTTTTTTTTTTTkBBBBwwBBBBBk..',
      '..kyyyyyyyyyyyyykTTTTDDTTTTkDDDDDDDDDDDDDDDDkyyyyyTTyyyyykwwwwwwwwwwwk..',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTkDDDDDDDDDDDDDDDDkyyyyyTTyyyyykwwwwwwwwwwwk..',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTkwwwwwwwDDwwwwwwwkyyyyyTTyyyyykBBBBwwBBBBBk..',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTkwwwwwwwDDwwwwwwwkyyyyyTTyyyyykBBBBwwBBBBBk..',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTkwwwwwwwDDwwwwwwwkyyyyyTTyyyyykBBBBwwBBBBBk..',
      '..kDDDDDDyyDDDDDkTTTTDDTTTTkwwwwwwwDDwwwwwwwkyyyyyTTyyyyykBBBBwwBBBBBk..',
      '..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
      '........................................................................',
    ],
    snowflake: [
      '.SSS.',
      'SwwwS',
      'SwwwS',
      'SwwwS',
      '.SSS.',
    ],
  };

  // recolor: 특정 색 글자만 바꿔 칠할 때 (예: 곰돌이 털 F → 퀘스트 색)
  function svg(name, size = 18, recolor = {}) {
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
        rect.setAttribute('fill', recolor[c] || COLORS[c]);
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
  const MEMO_MAX = 2000;
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

  function findEntry(questId, entryId) {
    return find(questId)?.schedule.find((e) => e.id === entryId);
  }

  function commit() {
    storage.save(state.quests);
    listeners.forEach((fn) => fn(state));
  }

  const actions = {
    // day: 수주한 날짜 (지난 날 빠뜨린 일, 앞으로 할 일을 그 날짜로 적을 수 있다)
    addQuest(type, text, difficulty, due = null, info = {}, day = dateUtil.key()) {
      const trimmed = clean(text);
      if (!trimmed) return false;
      const fields = {};
      journal.FIELDS.forEach((f) => { fields[f.id] = String(info[f.id] ?? '').trim().slice(0, f.id === 'note' ? 2000 : 200); });
      state.quests.unshift({
        id: newId(),
        ...fields,
        category: journal.CATEGORIES.some((c) => c.id === info.category) ? info.category : '',
        type,
        difficulty: type === 'daily' ? (difficulty === 'hunt' ? 'hunt' : 'weed') : undefined,
        due: type === 'daily' ? due : null,
        text: trimmed,
        completed: false,
        steps: [],
        schedule: [],
        createdAt: dateUtil.stamp(day),
        completedAt: null,
      });
      commit();
      return true;
    },
    // day: 보고 있는 날짜. 그날 화면에서 안 끝난 걸로 보이면 그날 끝낸 것으로, 끝난 걸로 보이면 되돌린다
    toggleQuest(id, day = dateUtil.key()) {
      const quest = find(id);
      if (!quest) return;
      if (daybook.asOf(quest, day).completed) {
        quest.completed = false;
        quest.completedAt = null;
      } else {
        quest.completed = true;
        quest.completedAt = dateUtil.stamp(day);
      }
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
    // 스토리 퀘스트 달력: 날짜별 할 일 기록
    addEntry(questId, date, text) {
      const quest = find(questId);
      const trimmed = clean(text);
      if (!quest || quest.type !== 'story' || !trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const entry = { id: newId(), date, text: trimmed, done: false, steps: [], memo: '' };
      quest.schedule.push(entry);
      commit();
      return entry.id;
    },
    toggleEntry(questId, entryId) {
      const entry = findEntry(questId, entryId);
      if (!entry) return;
      entry.done = !entry.done;
      commit();
    },
    // 일지 정보 수정. 글자 칸은 타이핑마다 저장만(silent), 구분 선택은 화면도 갱신
    setQuestField(questId, field, value, silent = false) {
      const quest = find(questId);
      if (!quest) return;
      if (field === 'category') {
        quest.category = journal.CATEGORIES.some((c) => c.id === value) ? value : '';
      } else if (journal.FIELDS.some((f) => f.id === field)) {
        quest[field] = String(value).slice(0, field === 'note' ? 2000 : 200);
      } else {
        return;
      }
      if (silent) storage.save(state.quests);
      else commit();
    },
    // 일정 밑의 세부 퀘스트
    addEntryStep(questId, entryId, text) {
      const entry = findEntry(questId, entryId);
      const trimmed = clean(text);
      if (!entry || !trimmed) return false;
      entry.steps.push({ id: newId(), text: trimmed, done: false });
      commit();
      return true;
    },
    toggleEntryStep(questId, entryId, stepId) {
      const step = findEntry(questId, entryId)?.steps.find((s) => s.id === stepId);
      if (!step) return;
      step.done = !step.done;
      commit();
    },
    deleteEntryStep(questId, entryId, stepId) {
      const entry = findEntry(questId, entryId);
      if (!entry) return;
      entry.steps = entry.steps.filter((s) => s.id !== stepId);
      commit();
    },
    // 메모는 타이핑마다 저장만 하고 화면은 다시 그리지 않는다 (입력 중 커서가 튀지 않게)
    setEntryMemo(questId, entryId, memo) {
      const entry = findEntry(questId, entryId);
      if (!entry) return;
      entry.memo = String(memo).slice(0, MEMO_MAX);
      storage.save(state.quests);
    },
    deleteEntry(questId, entryId) {
      const quest = find(questId);
      if (!quest) return;
      quest.schedule = quest.schedule.filter((e) => e.id !== entryId);
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
    calTitle: document.getElementById('cal-title'),
    calDays: document.getElementById('cal-days'),
    calDayTitle: document.getElementById('cal-day-title'),
    calEntries: document.getElementById('cal-entries'),
    calEmpty: document.getElementById('cal-empty'),
    entryForm: document.getElementById('entry-form'),
    entryQuest: document.getElementById('entry-quest'),
    dayPicker: document.getElementById('day-picker'),
    dayToday: document.querySelector('.day-nav [data-day="today"]'),
    upcoming: document.getElementById('upcoming'),
    pastBanner: document.getElementById('past-banner'),
    pastBannerText: document.getElementById('past-banner-text'),
  };

  // 달력에서 퀘스트를 구분하는 색 (먼저 수주한 퀘스트부터 차례로)
  const QUEST_COLORS = ['#f7a8c0', '#8db8e3', '#8fd48a', '#ffd35c', '#c9a3e6', '#ef9a5a'];

  // 카드에서 펼쳐 둔 일정·일지 정보 (다시 그려도 펼침 상태 유지, 저장하지 않음)
  const openEntries = new Set();

  // 달력 화면 상태 (저장하지 않음)
  const cal = {
    month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
    selected: dateUtil.key(),
  };

  const calendar = {
    shift(delta) {
      cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + delta, 1);
    },
    today() {
      const d = new Date();
      cal.month = new Date(d.getFullYear(), d.getMonth(), 1);
      cal.selected = dateUtil.key(d);
    },
    pick(key) {
      cal.selected = key;
      const d = dateUtil.fromKey(key);
      cal.month = new Date(d.getFullYear(), d.getMonth(), 1);
    },
    selected: () => cal.selected,
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

  // 일지 정보 입력 칸 묶음. 수주 폼(새 퀘스트)과 퀘스트 편집에서 같이 쓴다.
  // action이 있으면 편집용(바로 저장), 없으면 수주 폼용(제출할 때 읽음)
  function journalFields(values, idPrefix, action) {
    const grid = make('div', 'journal-grid');
    const field = (id, label, control) => {
      control.id = `${idPrefix}-${id}`;
      control.dataset.field = id;
      if (action) control.dataset.action = action;
      const wrap = make('div', `journal-field jf-${id}`);
      const lab = make('label', '', label);
      lab.htmlFor = control.id;
      wrap.append(lab, control);
      grid.append(wrap);
    };
    const select = make('select');
    select.append(new Option('구분 선택', ''), ...journal.CATEGORIES.map((c) => new Option(c.label, c.id)));
    select.value = values.category || '';
    field('category', '구분', select);
    journal.FIELDS.forEach((f) => {
      const control = make(f.id === 'note' ? 'textarea' : 'input');
      if (f.id === 'note') control.rows = 2;
      else control.type = 'text';
      control.maxLength = f.id === 'note' ? 2000 : 200;
      if (['researcher', 'bm', 'qa'].includes(f.id)) control.placeholder = '여러 명은 쉼표로';
      control.value = values[f.id] || '';
      field(f.id, f.label, control);
    });
    return grid;
  }

  // 퀘스트에 붙는 📋 일지 정보 (펼쳐서 편집)
  function renderJournal(quest) {
    const details = make('details', 'journal');
    details.dataset.openKey = `j:${quest.id}`;
    details.open = openEntries.has(details.dataset.openKey);
    details.append(
      make('summary', 'journal-summary', journalSummary(quest)),
      journalFields(quest, `q-${quest.id}`, 'journal-field'),
    );
    return details;
  }

  function journalSummary(quest) {
    const filled = journal.FIELDS.filter((f) => quest[f.id].trim()).length + (quest.category ? 1 : 0);
    return `📋 일지 정보 ${filled ? `(${filled}/7)` : '— 비어 있음'}`;
  }

  // 일지 글자 칸을 고치는 동안 입력창은 건드리지 않고 요약 줄만 바꿔 끼운다
  function refreshJournalMeta(quest) {
    const li = document.querySelector(`.quest[data-id="${quest.id}"]`);
    if (!li) return;
    li.querySelector(':scope > .journal > .journal-summary').textContent = journalSummary(quest);
    const holder = quest.type === 'daily' ? li.querySelector('.quest-body') : li;
    holder.querySelector(':scope > .journal-line')?.remove();
    const line = journalLine(quest);
    if (!line) return;
    if (quest.type === 'daily') holder.append(line);
    else li.querySelector(':scope > .story-head').after(line);
  }

  // 퀘스트 이름 아래 한 줄: [구분] 업체명 · 제품명
  function journalLine(quest) {
    const parts = [quest.company, quest.product].map((v) => v.trim()).filter(Boolean);
    if (!quest.category && !parts.length) return null;
    const line = make('span', 'journal-line');
    if (quest.category) line.append(make('span', 'journal-cat', journal.categoryLabel(quest.category)));
    if (parts.length) line.append(make('span', '', parts.join(' · ')));
    return line;
  }

  function renderDaily(quest, day) {
    const diff = DIFFICULTY[quest.difficulty];
    const li = make('li', `quest daily ${quest.difficulty}` + (quest.completed ? ' completed' : ''));
    li.dataset.id = quest.id;
    const tag = make('span', 'diff-tag');
    tag.append(pixel.svg(diff.icon, 12), make('span', '', diff.label));
    // 할 일과 마감은 한 묶음: 좁으면 마감이 할 일 아래로 내려간다
    const body = make('span', 'quest-body');
    body.append(make('span', 'quest-text', quest.text));
    // 전날에서 넘어온 일
    const since = dateUtil.dayOf(quest.createdAt);
    if (since < day) body.append(make('span', 'carry-tag', `↪ ${dateUtil.shortKey(since)}부터`));
    if (quest.due) {
      const due = dateUtil.dueLabel(quest.due);
      const badge = make('span', 'due-tag' + (due.overdue && !quest.completed ? ' overdue' : ''), `⏰ ${due.text}`);
      badge.title = due.title;
      body.append(badge);
    }
    const line = journalLine(quest);
    if (line) body.append(line);
    li.append(
      checkbox(quest.completed, `${diff.label}: ${quest.text} 완료`, 'toggle-quest'),
      tag,
      body,
      deleteButton(`${quest.text} 삭제`, 'delete-quest'),
      renderJournal(quest),
    );
    return li;
  }

  // 일정 날짜 상태: 완료 / 오늘 / 지남 / D-n
  function entryWhen(entry, today) {
    if (entry.done) return { text: '✓ 완료', cls: 'done' };
    if (entry.date === today) return { text: '오늘', cls: 'today' };
    if (entry.date < today) return { text: '지남', cls: 'overdue' };
    const diff = Math.round((dateUtil.fromKey(entry.date) - dateUtil.fromKey(today)) / 86400000);
    return { text: `D-${diff}`, cls: '' };
  }

  // 스토리 카드의 📅 일정 체크리스트. 완료해도 사라지지 않고 날짜순으로 남는다.
  // 각 일정을 펼치면 세부 퀘스트와 메모가 나온다.
  function renderSchedule(quest) {
    const today = dateUtil.key();
    const box = make('div', 'schedule');
    const done = quest.schedule.filter((e) => e.done).length;
    box.append(make('p', 'schedule-title', `📅 일정 ${done}/${quest.schedule.length}`));

    const list = make('ul', 'sched-list');
    [...quest.schedule].sort((a, b) => a.date.localeCompare(b.date)).forEach((entry) => {
      const when = entryWhen(entry, today);
      const item = make('li', 'sched' + (entry.done ? ' done' : ''));
      item.dataset.entryId = entry.id;

      const details = make('details', 'sched-detail');
      details.dataset.openKey = entry.id;
      details.open = openEntries.has(entry.id);
      const summary = make('summary', 'sched-summary');
      const stepsDone = entry.steps.filter((s) => s.done).length;
      const extra = [
        entry.steps.length ? `세부 ${stepsDone}/${entry.steps.length}` : '',
        entry.memo.trim() ? '📝' : '',
      ].filter(Boolean).join(' · ');
      summary.append(
        make('span', 'sched-date', dateUtil.formatKey(entry.date)),
        make('span', 'sched-text', entry.text),
        make('span', `sched-when ${when.cls}`, when.text),
      );
      if (extra) summary.append(make('span', 'sched-extra', extra));

      // 세부 퀘스트
      const subList = make('ul', 'sched-steps');
      entry.steps.forEach((step) => {
        const s = make('li', 'sched-step' + (step.done ? ' done' : ''));
        s.dataset.schedStepId = step.id;
        s.append(
          checkbox(step.done, `${step.text} 완료`, 'toggle-entry-step'),
          make('span', 'step-text', step.text),
          deleteButton(`${step.text} 삭제`, 'delete-entry-step'),
        );
        subList.append(s);
      });
      const subForm = make('form', 'step-form sched-step-form');
      subForm.dataset.action = 'add-entry-step';
      subForm.autocomplete = 'off';
      const subInput = make('input');
      subInput.type = 'text';
      subInput.maxLength = 100;
      subInput.placeholder = '+ 세부 퀘스트 추가';
      subInput.setAttribute('aria-label', `${entry.text}에 세부 퀘스트 추가`);
      subForm.append(subInput);

      // 메모
      const memoLabel = make('label', 'sched-memo-label', '메모');
      const memo = make('textarea', 'sched-memo');
      memo.id = `memo-${entry.id}`;
      memoLabel.htmlFor = memo.id;
      memo.rows = 3;
      memo.maxLength = 2000;
      memo.placeholder = '이 날 일정에 대한 메모를 남겨요';
      memo.value = entry.memo;
      memo.dataset.action = 'entry-memo';

      const remove = make('button', 'sched-remove', '일정 삭제');
      remove.type = 'button';
      remove.dataset.action = 'delete-entry';

      const body = make('div', 'sched-body');
      body.append(make('p', 'sched-sub-title', '세부 퀘스트'), subList, subForm, memoLabel, memo, remove);
      details.append(summary, body);

      // 체크는 이 체크리스트에서만 한다
      item.append(checkbox(entry.done, `${dateUtil.formatKey(entry.date)} ${entry.text} 완료`, 'toggle-entry'), details);
      list.append(item);
    });
    box.append(list);
    return box;
  }

  function renderStory(quest, day) {
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
      make('span', 'story-day', `${dateUtil.daysBetween(dateUtil.dayOf(quest.createdAt), day) + 1}일째`),
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

    li.append(head);
    const line = journalLine(quest);
    if (line) li.append(line);
    li.append(meta, track, renderJournal(quest));
    if (quest.schedule.length) li.append(renderSchedule(quest));
    li.append(steps);
    if (!quest.completed) li.append(form);
    if (quest.completed) {
      const stamp = make('div', 'stamp');
      stamp.append(pixel.svg('star', 14), make('span', '', 'CLEAR'));
      li.append(stamp);
    }
    return li;
  }

  function questColors(story) {
    const colors = new Map();
    [...story].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((q, i) => colors.set(q.id, QUEST_COLORS[i % QUEST_COLORS.length]));
    return colors;
  }

  function renderCalendar(story) {
    const colors = questColors(story);
    const today = dateUtil.key();

    // 날짜별 기록 모으기: { 'YYYY-MM-DD': [{ quest, entry }] }
    const byDate = new Map();
    story.forEach((quest) => quest.schedule.forEach((entry) => {
      if (!byDate.has(entry.date)) byDate.set(entry.date, []);
      byDate.get(entry.date).push({ quest, entry });
    }));

    const year = cal.month.getFullYear();
    const month = cal.month.getMonth();
    el.calTitle.textContent = `${year}년 ${month + 1}월`;

    // 일요일부터 시작하는 6주 격자
    const start = new Date(year, month, 1 - cal.month.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = dateUtil.key(d);
      const items = byDate.get(key) || [];
      const btn = make('button', 'cal-day');
      btn.type = 'button';
      btn.dataset.action = 'cal-pick';
      btn.dataset.date = key;
      if (d.getMonth() !== month) btn.classList.add('outside');
      if (d.getDay() === 0) btn.classList.add('sun');
      if (d.getDay() === 6) btn.classList.add('sat');
      if (key === today) btn.classList.add('today');
      if (key === cal.selected) btn.classList.add('selected');
      btn.setAttribute('aria-pressed', String(key === cal.selected));
      btn.setAttribute('aria-label', `${dateUtil.formatKey(key)}${items.length ? `, 할 일 ${items.length}개` : ''}`);
      btn.append(make('span', 'cal-num', String(d.getDate())));
      if (items.length) {
        // 일정이 있는 날엔 곰돌이 포셰트 얼굴. 털색은 퀘스트 색, 여러 퀘스트면 겹쳐서 최대 3마리
        const bears = make('span', 'cal-bears');
        const quests = [...new Set(items.map((it) => it.quest.id))];
        quests.slice(0, 3).forEach((id) => bears.append(pixel.svg('bear', 20, { F: colors.get(id) })));
        btn.append(bears);
      }
      cells.push(btn);
    }
    el.calDays.replaceChildren(...cells);

    // 선택한 날의 할 일
    const items = byDate.get(cal.selected) || [];
    el.calDayTitle.textContent = `${dateUtil.formatKey(cal.selected)} 할 일`;
    // 달력에서는 보기만 한다. 누르면 카드의 그 일정으로 이동해 펼친다 (체크는 카드에서).
    el.calEntries.replaceChildren(...items.map(({ quest, entry }) => {
      const li = make('li', 'cal-entry' + (entry.done ? ' done' : ''));
      const btn = make('button', 'cal-entry-btn');
      btn.type = 'button';
      btn.dataset.action = 'goto-entry';
      btn.dataset.questId = quest.id;
      btn.dataset.entryId = entry.id;
      const tag = make('span', 'entry-quest', quest.text);
      tag.style.setProperty('--quest', colors.get(quest.id));
      const when = entryWhen(entry, today);
      const line = make('span', 'cal-entry-line');
      line.append(make('span', 'entry-text', entry.text), make('span', `sched-when ${when.cls}`, when.text));
      btn.append(line, tag);
      const stepsDone = entry.steps.filter((s) => s.done).length;
      if (entry.steps.length || entry.memo.trim()) {
        const extra = make('span', 'cal-entry-extra');
        if (entry.steps.length) extra.append(make('span', '', `세부 ${stepsDone}/${entry.steps.length}`));
        if (entry.memo.trim()) extra.append(make('span', 'cal-entry-memo', `📝 ${entry.memo.trim().split('\n')[0]}`));
        btn.append(extra);
      }
      btn.setAttribute('aria-label', `${quest.text} · ${entry.text} (${when.text}) — 카드에서 열기`);
      li.append(btn);
      return li;
    }));
    el.calEmpty.hidden = items.length > 0;
    el.calEmpty.textContent = story.length
      ? '이 날 기록된 할 일이 없어요.'
      : '스토리 퀘스트를 먼저 수주하면 날짜별 할 일을 기록할 수 있어요.';

    // 기록할 퀘스트 선택지: 진행 중인 스토리 퀘스트 (바뀔 때만 다시 그려 선택을 유지)
    const active = story.filter((q) => !q.completed);
    const signature = active.map((q) => q.id + q.text).join('|');
    if (el.entryQuest.dataset.signature !== signature) {
      const previous = el.entryQuest.value;
      el.entryQuest.replaceChildren(...active.map((q) => {
        const opt = make('option', '', `🚩 ${q.text}`);
        opt.value = q.id;
        return opt;
      }));
      if (active.some((q) => q.id === previous)) el.entryQuest.value = previous;
      el.entryQuest.dataset.signature = signature;
    }
    el.entryForm.hidden = active.length === 0;
  }

  // 보고 있는 날짜. null이면 '오늘'을 따라간다 (자정이 지나면 저절로 다음 날)
  let viewDay = null;
  const currentDay = () => viewDay ?? dateUtil.key();
  function setDay(key) {
    viewDay = key && key !== dateUtil.key() ? key : null;
  }

  // 오늘 보드 아래: 앞날로 미리 적어 둔 퀘스트 (오늘의 노동·스토리 퀘스트 모두)
  function renderUpcoming(all, today) {
    const ahead = all.filter((q) => !q.completed && dateUtil.dayOf(q.createdAt) > today);
    el.upcoming.hidden = !ahead.length;
    if (!ahead.length) return;
    const days = [...new Set(ahead.map((q) => dateUtil.dayOf(q.createdAt)))].sort();
    el.upcoming.dataset.date = days[0];
    el.upcoming.textContent = `📅 앞으로 예정된 일 ${ahead.length}건 · ${days.slice(0, 3).map(dateUtil.shortKey).join(', ')}${days.length > 3 ? ' …' : ''}`;
  }

  function render(state) {
    const day = currentDay();
    const today = dateUtil.key();
    const isToday = day === today;
    const onBoard = daybook.quests(state.quests, day);
    const daily = onBoard.filter((q) => q.type === 'daily');
    const story = onBoard.filter((q) => q.type === 'story');
    const dailyDone = daily.filter((q) => q.completed).length;
    const percent = daily.length ? Math.round((dailyDone / daily.length) * 100) : 0;

    el.warning.hidden = storage.isAvailable();
    el.today.textContent = isToday ? dateUtil.formatToday()
      : `${dateUtil.formatKey(day)} · ${day < today ? '지난 날' : '앞날'}`;
    el.dayPicker.value = day;
    el.dayToday.disabled = isToday;
    el.pastBanner.hidden = isToday;
    el.pastBanner.classList.toggle('future', day > today);
    el.pastBannerText.textContent = day < today
      ? `📖 ${dateUtil.formatKey(day)} 보드예요. 여기서 적는 일은 이 날 수주한 것으로, 체크는 이 날 끝낸 것으로 기록돼요.`
      : `🗓️ ${dateUtil.formatKey(day)} 보드예요. 미리 적어 둔 일은 이 날부터 보드에 나타나요.`;

    el.dailyCount.textContent = `${dailyDone} / ${daily.length}`;
    el.dailyBar.style.width = percent + '%';
    el.dailyTrack.setAttribute('aria-valuenow', String(percent));
    el.dailyList.replaceChildren(...daily.map((q) => renderDaily(q, day)));
    el.dailyEmpty.hidden = daily.length > 0;
    el.dailyEmpty.textContent = isToday ? '게시판이 비어 있어요. 오늘의 노동을 받아 볼까요?'
      : day < today ? '이 날은 기록된 노동이 없어요. 빠뜨린 일이 있으면 적어 두세요.'
        : '이 날 할 일을 미리 적어 둘 수 있어요.';
    el.dailyClear.hidden = !(daily.length > 0 && dailyDone === daily.length);
    if (isToday) renderUpcoming(state.quests, today);
    else el.upcoming.hidden = true;

    const storyActive = story.filter((q) => !q.completed).length;
    el.storyCount.textContent = `진행 중 ${storyActive}`;
    el.storyList.replaceChildren(...story.map((q) => renderStory(q, day)));
    el.storyEmpty.hidden = story.length > 0;
    el.storyEmpty.textContent = isToday ? '아직 시작한 스토리 퀘스트가 없어요.' : '이 날 진행 중인 스토리 퀘스트가 없어요.';
    // 달력은 끝난 퀘스트의 일정까지 전부 보여 준다 (중요한 날짜는 사라지지 않게)
    renderCalendar(state.quests.filter((q) => q.type === 'story'));
  }

  return {
    render,
    calendar,
    currentDay,
    setDay,
    shiftDay(n) {
      const d = dateUtil.fromKey(currentDay());
      d.setDate(d.getDate() + n);
      setDay(dateUtil.key(d));
    },
    setEntryOpen(id, open) { if (open) openEntries.add(id); else openEntries.delete(id); },
    journalFields,
    refreshJournalMeta,
  };
})();

// ---------- critters ----------
// 보드 가장자리를 둘러싼 캐릭터들. 한 번에 한 명씩 말풍선을 띄운다.
const critters = (() => {
  const SHOW_MS = 50_000;   // 자동 말풍선 유지 시간 = 다음 캐릭터로 바뀌는 간격
  const CLICK_MS = 10_000;  // 클릭해서 띄운 말풍선 유지 시간
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

  // 하치와레 맞은편(아래 가운데)에 번갈아 놓이는 오브제.
  // 퀘스트 상태에 따라 그림과 대사가 바뀐다.
  const PROPS = [
    {
      name: '풀숲',
      look(quests) {
        const weeds = quests.filter((q) => q.type === 'daily' && q.difficulty === 'weed');
        const left = weeds.filter((q) => !q.completed).length;
        if (!weeds.length) return { art: 'weeds2', line: '오늘은 풀뽑기가 없어요. 풀이 무성해~' };
        if (!left) return { art: 'weeds0', line: '풀 다 뽑았다!' };
        return { art: left / weeds.length > 0.5 ? 'weeds2' : 'weeds1', line: `풀뽑기 ${left}개 남았어` };
      },
    },
    {
      name: '노동 게시판',
      look(quests) {
        const open = quests.filter((q) => !q.completed).length;
        return {
          art: `board${Math.min(open, 4)}`,
          line: open ? `남은 노동 ${open}건` : '오늘 일거리는 끝!',
        };
      },
    },
    {
      name: '맥주',
      look(quests) {
        const daily = quests.filter((q) => q.type === 'daily');
        return daily.length && daily.every((q) => q.completed)
          ? { art: 'beer', line: '노동 뒤의 한 잔! 키야아~' }
          : { art: 'beer', line: '노동이 끝나면 이 한 잔이 기다려요…' };
      },
    },
    {
      name: '라멘',
      look: () => ({ art: 'ramen', line: '라멘 한 그릇 어때? 후루룩' }),
    },
  ];

  // 자리
  // - 위·아래(top/bottom): 보드 가장자리의 몇 % 지점(at)에 걸터앉는다. dy로 높낮이를 조금씩 달리해 일직선이 되지 않게.
  // - 옆(left/right): 보드 옆 레일에 order 순서로 서서, 스크롤하면 화면을 따라 내려온다 (보드가 길어도 어정쩡하게 뜨지 않게).
  //   dx로 레일 안에서 살짝 비켜 선다.
  const RING_WIDE = [
    { side: 'top', at: 16, dy: 6 }, { side: 'top', at: 50, dy: -5 }, { side: 'top', at: 84, dy: 3 },
    { side: 'right', order: 0, dx: -6 }, { side: 'right', order: 1, dx: 8 },
    { side: 'bottom', at: 76, dy: -4 }, { side: 'bottom', at: 24, dy: 5 },
    { side: 'left', order: 1, dx: -6 }, { side: 'left', order: 0, dx: 7 },
  ];
  // 좁은 화면에서는 좌우 여백이 없으니 위·아래 두 줄로 (아래 가운데는 오브제 자리)
  const RING_NARROW = [
    { side: 'top', at: 10, dy: 3 }, { side: 'top', at: 30, dy: -3 }, { side: 'top', at: 50, dy: 4 },
    { side: 'top', at: 70, dy: -2 }, { side: 'top', at: 90, dy: 3 },
    { side: 'bottom', at: 90, dy: -3 }, { side: 'bottom', at: 70, dy: 3 },
    { side: 'bottom', at: 30, dy: -3 }, { side: 'bottom', at: 10, dy: 2 },
  ];
  const PROP_SLOT = { side: 'bottom', at: 50, dy: 0 };

  const nodes = [];
  const hideTimers = new Map();
  let lastIndex = -1;
  let prop = null;          // { node, art, bubble }
  let propIndex = -1;
  let quests = [];

  let stageEl = null;
  const rails = {};         // { left, right }: 레일 안의 sticky 상자

  // 위·아래 가장자리에 걸터앉히기
  function placeEdge(node, slot) {
    stageEl.append(node);
    node.classList.remove('in-rail');
    node.dataset.side = slot.side;
    node.style.left = `${slot.at}%`;
    const edge = slot.side === 'top' ? 'var(--edge)' : '(100% - var(--edge))';
    node.style.top = `calc(${edge} + ${slot.dy || 0}px)`;
    node.style.removeProperty('--dx');
    // 말풍선은 보드 바깥쪽 여백으로 펼친다
    node.dataset.bubble = slot.at < 55 ? 'right' : 'left';
  }

  // 옆 레일에 세우기 (append 순서 = 위에서부터)
  function placeRail(node, slot) {
    rails[slot.side].append(node);
    node.classList.add('in-rail');
    node.dataset.side = slot.side;
    node.style.left = '';
    node.style.top = '';
    node.style.setProperty('--dx', `${slot.dx || 0}px`);
    node.dataset.bubble = slot.side === 'left' ? 'up-right' : 'up-left';
  }

  function layout(narrow) {
    const ring = narrow ? RING_NARROW : RING_WIDE;
    const sideSlots = [];
    ring.forEach((slot, i) => {
      if (slot.side === 'top' || slot.side === 'bottom') placeEdge(nodes[i], slot);
      else sideSlots.push([slot, nodes[i]]);
    });
    sideSlots.sort((a, b) => a[0].order - b[0].order).forEach(([slot, node]) => placeRail(node, slot));
    placeEdge(prop.node, PROP_SLOT);
  }

  function show(node, ms = CLICK_MS) {
    clearTimeout(hideTimers.get(node));
    node.classList.add('talking');
    hideTimers.set(node, setTimeout(() => node.classList.remove('talking'), ms));
  }

  function hide(node) {
    clearTimeout(hideTimers.get(node));
    node.classList.remove('talking');
  }

  function pickNext() {
    let i;
    do { i = Math.floor(Math.random() * CAST.length); } while (i === lastIndex && CAST.length > 1);
    lastIndex = i;
    return i;
  }

  // 지금 오브제를 퀘스트 상태에 맞게 다시 그린다
  function renderProp() {
    if (propIndex < 0) return;
    const p = PROPS[propIndex];
    const { art, line } = p.look(quests);
    if (prop.art !== art) {
      prop.node.querySelector('svg')?.remove();
      prop.node.prepend(pixel.svg(art, 48));
      prop.art = art;
    }
    prop.node.title = p.name;
    prop.node.setAttribute('aria-label', `${p.name}: ${line}`);
    prop.bubble.textContent = line;
  }

  function nextProp() {
    propIndex = (propIndex + 1) % PROPS.length;
    prop.node.hidden = false;
    prop.node.classList.remove('talking');
    prop.node.classList.remove('appear');
    void prop.node.offsetWidth; // 등장 애니메이션 재시작
    prop.node.classList.add('appear');
    renderProp();
  }

  // 50초마다 말하는 캐릭터가 바뀌고, 그 순간 오브제도 다음 것으로 바뀐다
  function cycle() {
    if (lastIndex >= 0) hide(nodes[lastIndex]);
    show(nodes[pickNext()], SHOW_MS);
    nextProp();
    setTimeout(cycle, SHOW_MS);
  }

  function update(state) {
    // 오브제는 늘 오늘의 보드 기준 (지난 기록을 보고 있어도)
    quests = daybook.quests(state.quests, dateUtil.key());
    renderProp();
  }

  function bubbleOf(text) {
    const bubble = document.createElement('span');
    bubble.className = 'bubble';
    bubble.setAttribute('aria-hidden', 'true');
    bubble.textContent = text;
    return bubble;
  }

  function mount(stage) {
    stageEl = stage;
    ['left', 'right'].forEach((side) => {
      const rail = document.createElement('div');
      rail.className = `rail rail-${side}`;
      const inner = document.createElement('div');
      inner.className = 'rail-inner';
      rail.append(inner);
      stage.append(rail);
      rails[side] = inner;
    });

    CAST.forEach((c, i) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'critter';
      node.title = c.name;
      node.setAttribute('aria-label', `${c.name}: ${c.line}`);
      node.style.setProperty('--delay', `${(i * 0.37) % 1.2}s`);
      node.append(pixel.svg(c.id, 48), bubbleOf(c.line));
      // 클릭하면 바로 그 캐릭터의 말버릇을 들려준다 (자동 순서와는 별개)
      node.addEventListener('click', () => show(node));
      stage.append(node);
      nodes.push(node);
    });

    // 오브제는 첫 말풍선과 함께 등장한다
    const propNode = document.createElement('button');
    propNode.type = 'button';
    propNode.className = 'critter prop';
    propNode.hidden = true;
    prop = { node: propNode, art: null, bubble: bubbleOf('') };
    propNode.append(prop.bubble);
    propNode.addEventListener('click', () => show(propNode));
    stage.append(propNode);

    const narrow = window.matchMedia('(max-width: 699px)');
    layout(narrow.matches);
    narrow.addEventListener('change', (e) => layout(e.matches));

    setTimeout(cycle, FIRST_MS);
  }

  return { mount, update };
})();

// ---------- theme ----------
// 계절 테마. <html data-theme="...">로 색을 바꾸고, 테마마다 배경 장면을 붙인다.
// 고른 테마는 이 브라우저에만 기억한다.
const theme = (() => {
  const KEY = 'todayTodo.v1.theme';
  const THEMES = [
    { id: 'default', label: '기본' },
    { id: 'christmas', label: '🎄 크리스마스' },
  ];
  const SNOWFLAKES = 48;
  let scene = [];

  function load() {
    try { return localStorage.getItem(KEY) || 'default'; } catch { return 'default'; }
  }

  function save(id) {
    try { localStorage.setItem(KEY, id); } catch {}
  }

  // 쌓인 눈의 물결 무늬 한 칸 (32x10 도트) → 가로로 반복할 배경 그림
  function snowWave() {
    const w = 32;
    const h = 10;
    let rects = '';
    for (let x = 0; x < w; x++) {
      const top = Math.round(4 - 3 * Math.sin((2 * Math.PI * x) / w));
      for (let y = top; y < h; y++) {
        const fill = y === top ? '%2393c0e8' : y === top + 1 ? '%23e6f1fb' : '%23ffffff';
        rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${fill}'/>`;
      }
    }
    return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${rects}</svg>")`;
  }

  function christmas() {
    const wave = snowWave();

    // 뒤쪽 장면 (보드 뒤에 깔린다): 창 높이만 한 트리 → 그 밑동을 덮는 쌓인 눈 → 눈 위의 선물 더미
    const back = document.createElement('div');
    back.className = 'xmas-back';
    back.setAttribute('aria-hidden', 'true');
    const tree = pixel.svg('xmasTree', 240);
    tree.classList.add('xmas-tree');
    const ground = document.createElement('div');
    ground.className = 'xmas-ground';
    ground.style.setProperty('--snow-wave', wave);
    const gifts = pixel.svg('xmasGifts', 230);
    gifts.classList.add('xmas-gifts');
    back.append(tree, ground, gifts);

    // 앞쪽: 송송 내리는 눈 (클릭은 그대로 아래로 통과)
    const snow = document.createElement('div');
    snow.className = 'xmas-snow';
    snow.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < SNOWFLAKES; i++) {
      const flake = document.createElement('span');
      flake.className = 'flake';
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.animationDuration = `${9 + Math.random() * 10}s`;
      flake.style.animationDelay = `${-Math.random() * 19}s`;
      flake.style.setProperty('--sway', `${(Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 24)}px`);
      flake.append(pixel.svg('snowflake', [8, 10, 14][i % 3]));
      snow.append(flake);
    }
    return [back, snow];
  }

  function apply(id) {
    if (!THEMES.some((t) => t.id === id)) id = 'default';
    document.documentElement.dataset.theme = id;
    scene.forEach((el) => el.remove());
    scene = id === 'christmas' ? christmas() : [];
    document.body.append(...scene);
    document.querySelectorAll('[data-theme-id]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.themeId === id));
    });
  }

  function mount(picker) {
    picker.append(...THEMES.map((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-btn';
      btn.dataset.themeId = t.id;
      btn.textContent = t.label;
      return btn;
    }));
    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme-id]');
      if (!btn) return;
      save(btn.dataset.themeId);
      apply(btn.dataset.themeId);
    });
    apply(load());
  }

  return { mount };
})();

// ---------- search ----------
// 지난 업무 이력 검색. 띄어쓰기로 나눈 낱말이 퀘스트 어딘가에 모두 들어 있으면 찾는다.
const search = (() => {
  const LIMIT = 30;

  // 퀘스트에서 검색할 글자들 (어디서 찾았는지 보여 주려고 이름표를 붙인다)
  function fields(q) {
    const list = [
      { label: '세부사항', text: q.text },
      { label: '구분', text: journal.categoryLabel(q.category) },
      ...journal.FIELDS.map((f) => ({ label: f.label, text: q[f.id] })),
      ...q.steps.map((s) => ({ label: '세부 목표', text: s.text })),
    ];
    q.schedule.forEach((e) => {
      const when = dateUtil.formatKey(e.date);
      list.push({ label: `${when} 일정`, text: e.text, entryId: e.id });
      list.push({ label: `${when} 일정 메모`, text: e.memo, entryId: e.id });
      e.steps.forEach((s) => list.push({ label: `${when} 일정 세부 퀘스트`, text: s.text, entryId: e.id }));
    });
    return list.filter((f) => f.text && f.text.trim());
  }

  function terms(query) {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function run(quests, query) {
    const words = terms(query);
    if (!words.length) return [];
    const results = [];
    quests.forEach((q) => {
      const fs = fields(q);
      const hay = fs.map((f) => f.text.toLowerCase()).join('\n');
      if (!words.every((w) => hay.includes(w))) return;
      // 보여 줄 대표 근거: 첫 낱말이 들어 있는 칸 (세부사항이 먼저)
      const hit = fs.find((f) => f.text.toLowerCase().includes(words[0])) || fs[0];
      results.push({ quest: q, hit });
    });
    // 최근에 움직인 일부터
    const last = (q) => q.completedAt || q.createdAt;
    return results.sort((a, b) => last(b.quest).localeCompare(last(a.quest))).slice(0, LIMIT);
  }

  // 찾은 낱말을 <mark>로 감싼 조각 (사용자 글은 textContent로만 넣는다)
  function highlight(text, words) {
    const frag = document.createDocumentFragment();
    const lower = text.toLowerCase();
    let i = 0;
    while (i < text.length) {
      let at = -1;
      let len = 0;
      words.forEach((w) => {
        const j = lower.indexOf(w, i);
        if (j !== -1 && (at === -1 || j < at)) { at = j; len = w.length; }
      });
      if (at === -1) { frag.append(text.slice(i)); break; }
      if (at > i) frag.append(text.slice(i, at));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(at, at + len);
      frag.append(mark);
      i = at + len;
    }
    return frag;
  }

  // 긴 글은 찾은 곳 앞뒤만 잘라 보여 준다
  function snippet(text, word) {
    const flat = text.replace(/\s+/g, ' ');
    const at = Math.max(0, flat.toLowerCase().indexOf(word));
    const start = Math.max(0, at - 20);
    const end = Math.min(flat.length, at + word.length + 40);
    return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
  }

  return { run, terms, highlight, snippet };
})();

// ---------- exporter ----------
// 오늘의 퀘스트를 업무 일지 양식(.xlsx)으로 뽑는다.
// ExcelJS는 버튼을 누를 때만 불러온다 (평소에는 인터넷 없이 동작).
const exporter = (() => {
  const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  const HEADERS = ['', '업체명', '제품명', '세부사항', '담당 연구원', '담당 BM/영업', '품질보증 담당자', '비고'];
  const WIDTHS = [12, 16, 30, 60, 11, 12, 30, 55];
  const FONT = { name: '맑은 고딕', size: 9 };
  const BORDER = { style: 'thin', color: { argb: 'FF808080' } };
  let loading = null;

  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    loading = loading || new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = EXCELJS_URL;
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => { loading = null; script.remove(); reject(new Error('ExcelJS를 불러오지 못했어요')); };
      document.head.append(script);
    });
    return loading;
  }

  // 담당자 칸은 쉼표로 구분한 이름을 양식처럼 줄바꿈으로
  const people = (v) => v.split(/\s*[,/]\s*/).filter(Boolean).join('\n');

  // 일지에 들어갈 줄: 그날의 보드 (그날 남아 있던 일 + 그날 끝낸 일)
  function collect(quests, dayKey) {
    const byOld = (a, b) => a.createdAt.localeCompare(b.createdAt);
    const onBoard = daybook.quests(quests, dayKey);
    const daily = onBoard.filter((q) => q.type === 'daily').sort(byOld);
    const story = onBoard.filter((q) => q.type === 'story').sort(byOld);
    return [...daily, ...story].map((q) => {
      let detail = q.text;
      // 스토리 퀘스트는 오늘 날짜 일정을 세부사항 아래에 덧붙인다
      if (q.type === 'story') {
        q.schedule.filter((e) => e.date === dayKey)
          .forEach((e) => { detail += `\n· ${e.text}${e.done ? ' (완료)' : ''}`; });
      }
      return {
        category: q.category,
        values: [q.company, q.product, detail, people(q.researcher), people(q.bm), people(q.qa), q.note],
      };
    });
  }

  // 줄바꿈된 글이 잘리지 않게 대략적인 줄 높이를 잡는다 (한글은 폭이 넓어 2칸으로 셈)
  function rowHeight(values) {
    const lines = values.map((v, i) => String(v || '').split('\n').reduce((sum, line) => {
      const width = [...line].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
      return sum + Math.max(1, Math.ceil(width / (WIDTHS[i + 1] * 1.1)));
    }, 0));
    return Math.max(15, 12.5 * Math.max(...lines) + 3);
  }

  async function build(quests, dayKey) {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(dayKey);
    ws.columns = WIDTHS.map((width) => ({ width }));
    ws.addRow(HEADERS);

    const items = collect(quests, dayKey);
    const groups = journal.CATEGORIES.map((c) => ({ label: c.label, minRows: c.minRows, items: items.filter((it) => it.category === c.id) }));
    const loose = items.filter((it) => !it.category);
    if (loose.length) groups.push({ label: '미분류', minRows: 1, items: loose });

    groups.forEach((g) => {
      const first = ws.rowCount + 1;
      const count = Math.max(g.minRows, g.items.length);
      for (let i = 0; i < count; i++) {
        const values = g.items[i]?.values ?? ['', '', '', '', '', '', ''];
        const row = ws.addRow([i === 0 ? g.label.replace(' (', '\n(') : '', ...values]);
        row.height = rowHeight(values);
      }
      if (count > 1) ws.mergeCells(first, 1, first + count - 1, 1);
    });

    ws.eachRow({ includeEmpty: true }, (row, r) => {
      for (let c = 1; c <= HEADERS.length; c++) {
        const cell = row.getCell(c);
        cell.font = r === 1 ? { ...FONT, bold: true } : FONT;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
        if (r === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      }
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return wb.xlsx.writeBuffer();
  }

  async function download(quests, dayKey = dateUtil.key()) {
    const buffer = await build(quests, dayKey);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = `업무일지_${dayKey}.xlsx`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return filename;
  }

  return { download, build };
})();

// ---------- controller ----------
(() => {
  function shake(form) {
    form.classList.remove('shake');
    void form.offsetWidth; // 애니메이션 재시작
    form.classList.add('shake');
  }

  // 마감 입력 → 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM'. 시간만 고르면 오늘, 둘 다 비우면 없음
  function readDue(form) {
    const date = form.querySelector('input[name="due-date"]');
    const time = form.querySelector('input[name="due-time"]');
    if (!date || (!date.value && !time.value)) return null;
    const day = date.value || view.currentDay();
    return time.value ? `${day}T${time.value}` : day;
  }

  function clearDue(form) {
    form.querySelectorAll('input[name="due-date"], input[name="due-time"]').forEach((i) => { i.value = ''; });
  }

  // 수주 폼의 일지 정보 칸 채우기
  document.querySelectorAll('[data-journal-slot]').forEach((slot) => {
    slot.append(view.journalFields({}, `new-${slot.dataset.journalSlot}`));
  });

  function readInfo(form) {
    const info = {};
    form.querySelectorAll('.journal-new [data-field]').forEach((c) => { info[c.dataset.field] = c.value; });
    return info;
  }

  // 다음 수주를 위해 업체·제품·비고만 비운다 (구분과 담당자는 이어서 쓰는 경우가 많아 남김)
  function clearInfo(form) {
    form.querySelectorAll('.journal-new [data-field="company"], .journal-new [data-field="product"], .journal-new [data-field="note"]')
      .forEach((c) => { c.value = ''; });
  }

  // 단기 / 장기 퀘스트 추가 폼
  document.querySelectorAll('.quest-form').forEach((form) => {
    const input = form.querySelector('.form-row input[type="text"]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const difficulty = form.querySelector('input[name="difficulty"]:checked')?.value;
      if (store.addQuest(form.dataset.type, input.value, difficulty, readDue(form), readInfo(form), view.currentDay())) {
        input.value = '';
        clearDue(form);
        clearInfo(form);
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
      entryId: target.closest('.sched')?.dataset.entryId,
      schedStepId: target.closest('.sched-step')?.dataset.schedStepId,
    };
  }

  board.addEventListener('change', (e) => {
    const { questId, stepId, entryId, schedStepId } = ids(e.target);
    const action = e.target.dataset.action;
    if (action === 'toggle-quest') store.toggleQuest(questId, view.currentDay());
    if (action === 'toggle-step') store.toggleStep(questId, stepId);
    if (action === 'toggle-entry') store.toggleEntry(questId, entryId);
    if (action === 'toggle-entry-step') store.toggleEntryStep(questId, entryId, schedStepId);
    // 구분 선택은 바로 화면에 반영
    if (action === 'journal-field' && e.target.tagName === 'SELECT') {
      store.setQuestField(questId, e.target.dataset.field, e.target.value);
    }
  });

  // 메모·일지 정보 글자 칸은 쓰는 즉시 저장 (화면은 다시 그리지 않아 커서가 튀지 않음)
  board.addEventListener('input', (e) => {
    const action = e.target.dataset.action;
    const { questId, entryId } = ids(e.target);
    if (action === 'entry-memo') store.setEntryMemo(questId, entryId, e.target.value);
    if (action === 'journal-field' && e.target.tagName !== 'SELECT') {
      store.setQuestField(questId, e.target.dataset.field, e.target.value, true);
      const quest = store.getState().quests.find((q) => q.id === questId);
      if (quest) view.refreshJournalMeta(quest);
    }
  });

  // 일정·일지 정보 펼침 상태 기억 (toggle 이벤트는 버블링되지 않아 캡처로 받는다)
  board.addEventListener('toggle', (e) => {
    const key = e.target.dataset?.openKey;
    if (key) view.setEntryOpen(key, e.target.open);
  }, true);

  // 보고 있는 날짜의 일지 엑셀로 받기
  const exportBtn = document.getElementById('export-btn');
  const exportStatus = document.getElementById('export-status');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportStatus.textContent = '엑셀 만드는 중…';
    try {
      const name = await exporter.download(store.getState().quests, view.currentDay());
      exportStatus.textContent = `✓ ${name} 저장했어요`;
    } catch {
      exportStatus.textContent = '엑셀 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
    } finally {
      exportBtn.disabled = false;
    }
  });

  // 날짜 이동 (머리글 + 지난 기록 안내줄)
  const header = document.querySelector('.header');
  header.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-day]');
    if (!btn) return;
    if (btn.dataset.day === 'prev') view.shiftDay(-1);
    if (btn.dataset.day === 'next') view.shiftDay(1);
    if (btn.dataset.day === 'today') view.setDay(null);
    exportStatus.textContent = '';
    view.render(store.getState());
  });
  document.getElementById('day-picker').addEventListener('change', (e) => {
    if (!e.target.value) return;
    view.setDay(e.target.value);
    exportStatus.textContent = '';
    view.render(store.getState());
  });

  // 업무 이력 검색
  const searchBox = document.querySelector('.search');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const TYPE_ICON = { weed: 'sprout', hunt: 'sword' };

  function renderSearch() {
    const query = searchInput.value.trim();
    if (!query) { searchResults.hidden = true; return; }
    const words = search.terms(query);
    const results = search.run(store.getState().quests, query);
    const list = document.createElement('ul');
    list.className = 'search-list';
    results.forEach(({ quest, hit }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-hit';
      btn.dataset.questId = quest.id;
      if (hit.entryId) btn.dataset.entryId = hit.entryId;

      const title = document.createElement('span');
      title.className = 'search-title';
      title.append(pixel.svg(quest.type === 'story' ? 'flag' : TYPE_ICON[quest.difficulty], 12));
      const text = document.createElement('span');
      text.append(search.highlight(quest.text, words));
      const status = document.createElement('span');
      status.className = 'search-status' + (quest.completed ? ' done' : '');
      status.textContent = quest.completed
        ? `${dateUtil.formatKey(dateUtil.dayOf(quest.completedAt || quest.createdAt))} 완료`
        : '진행 중';
      title.append(text, status);

      const meta = document.createElement('span');
      meta.className = 'search-meta';
      meta.textContent = [
        quest.category ? `[${journal.categoryLabel(quest.category)}]` : '',
        [quest.company, quest.product].filter((v) => v.trim()).join(' · '),
        `${dateUtil.shortKey(dateUtil.dayOf(quest.createdAt))} 수주`,
      ].filter(Boolean).join('  ');

      btn.append(title, meta);
      if (hit.label !== '세부사항') {
        const why = document.createElement('span');
        why.className = 'search-why';
        why.append(`${hit.label}: `, search.highlight(search.snippet(hit.text, words.find((w) => hit.text.toLowerCase().includes(w)) || words[0]), words));
        btn.append(why);
      }
      const li = document.createElement('li');
      li.append(btn);
      list.append(li);
    });
    const count = document.createElement('p');
    count.className = 'search-count';
    count.textContent = results.length ? `${results.length}건${results.length >= 30 ? ' (최근 30건까지)' : ''}` : '찾는 업무가 없어요.';
    searchResults.replaceChildren(count, list);
    searchResults.hidden = false;
  }

  searchInput.addEventListener('input', renderSearch);
  searchInput.addEventListener('focus', renderSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchResults.hidden = true; }
  });
  searchResults.addEventListener('click', (e) => {
    const hit = e.target.closest('.search-hit');
    if (!hit) return;
    searchResults.hidden = true;
    reveal(hit.dataset.questId, hit.dataset.entryId);
  });
  // 검색창 바깥을 누르면 결과를 닫는다
  document.addEventListener('click', (e) => {
    if (!searchBox.contains(e.target)) searchResults.hidden = true;
  });

  // 달력 이동·날짜 선택은 저장하지 않는 화면 상태라 직접 다시 그린다
  function calendarAction(action, btn) {
    if (action === 'cal-prev') view.calendar.shift(-1);
    else if (action === 'cal-next') view.calendar.shift(1);
    else if (action === 'cal-today') view.calendar.today();
    else if (action === 'cal-pick') view.calendar.pick(btn.dataset.date);
    else return false;
    view.render(store.getState());
    if (action === 'cal-pick') document.querySelector(`.cal-day[data-date="${btn.dataset.date}"]`)?.focus();
    return true;
  }

  // 퀘스트(와 그 일정)를 찾아가 보여 준다.
  // 지금 보는 날짜의 보드에 없으면 그 퀘스트가 있던 날(끝낸 날, 아니면 오늘)로 이동한다.
  function reveal(questId, entryId, keepDay = false) {
    const quest = store.getState().quests.find((q) => q.id === questId);
    if (!quest) return;
    if (!keepDay || !daybook.on(quest, view.currentDay())) {
      const created = dateUtil.dayOf(quest.createdAt);
      view.setDay(quest.completed ? dateUtil.dayOf(quest.completedAt || quest.createdAt)
        : created > dateUtil.key() ? created : null);
    }
    if (entryId) view.setEntryOpen(entryId, true);
    view.render(store.getState());
    const item = entryId
      ? board.querySelector(`.sched[data-entry-id="${entryId}"]`)
      : board.querySelector(`.quest[data-id="${questId}"]`);
    if (!item) return;
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (item.querySelector('summary') || item).focus?.({ preventScroll: true });
    item.classList.add('flash');
    setTimeout(() => item.classList.remove('flash'), 1200);
  }

  board.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (calendarAction(action, btn)) return;
    if (action === 'goto-entry') return reveal(btn.dataset.questId, btn.dataset.entryId, true);
    if (action === 'go-day') {
      view.setDay(btn.dataset.date);
      view.render(store.getState());
      document.querySelector('.header').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const { questId, stepId, entryId, schedStepId } = ids(btn);
    if (action === 'delete-quest') store.deleteQuest(questId);
    if (action === 'delete-step') store.deleteStep(questId, stepId);
    if (action === 'delete-entry') {
      // 중요한 일정이라 한 번 더 눌러야 지워진다
      if (btn.dataset.armed !== 'true') {
        btn.dataset.armed = 'true';
        btn.textContent = '한 번 더 누르면 삭제돼요';
        setTimeout(() => { btn.dataset.armed = 'false'; btn.textContent = '일정 삭제'; }, 3000);
        return;
      }
      store.deleteEntry(questId, entryId);
    }
    if (action === 'delete-entry-step') store.deleteEntryStep(questId, entryId, schedStepId);
    if (action === 'clear-due') clearDue(btn.closest('form'));
  });

  board.addEventListener('submit', (e) => {
    if (e.target.id === 'entry-form') {
      e.preventDefault();
      const input = document.getElementById('entry-input');
      const questId = document.getElementById('entry-quest').value;
      if (store.addEntry(questId, view.calendar.selected(), input.value)) {
        input.value = '';
      } else {
        shake(e.target);
      }
      input.focus();
      return;
    }
    if (e.target.dataset.action === 'add-entry-step') {
      e.preventDefault();
      const { questId, entryId } = ids(e.target);
      const input = e.target.querySelector('input');
      if (store.addEntryStep(questId, entryId, input.value)) {
        // 다시 그린 뒤 같은 일정의 입력창으로 포커스 복귀
        board.querySelector(`.sched[data-entry-id="${entryId}"] .sched-step-form input`)?.focus();
      } else {
        shake(e.target);
      }
      return;
    }
    if (e.target.dataset.action !== 'add-step') return;
    e.preventDefault();
    const { questId } = ids(e.target);
    const input = e.target.querySelector('input');
    if (store.addStep(questId, input.value)) {
      // 다시 그린 뒤 같은 퀘스트의 입력창으로 포커스 복귀
      board.querySelector(`.quest[data-id="${questId}"] > .step-form input`)?.focus();
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

  theme.mount(document.getElementById('theme-picker'));
  critters.mount(document.getElementById('stage'));
  store.subscribe(view.render);
  store.subscribe(critters.update);
  view.render(store.getState());
  critters.update(store.getState());

  // 마감 지남·D-day·오늘 표시가 시간이 흐르면서 바뀌도록 1분마다 다시 그린다
  // (카드 안 입력창에 쓰는 중이면 글이 날아가지 않게 건너뛴다)
  setInterval(() => {
    if (document.activeElement?.closest('.quest, .cal-entry')) return;
    view.render(store.getState());
  }, 60_000);
})();
