'use strict';

document.documentElement.classList.add('js');

// ---------- 도트 ----------
// 문자 하나 = 픽셀 하나. '.'은 빈칸. outline 을 주면 바깥 테두리를 자동으로 두른다.
const pixel = (() => {
  const COLORS = {
    k: '#5b4636', e: '#2b2420', w: '#ffffff',
    // 붉은 코랄
    C: '#e8604f', c: '#f6977f', D: '#c84536',
    // 연분홍 조개 · 진주
    S: '#f3b8b5', s: '#fde3df', H: '#de9294', P: '#fde9ec', p: '#eebac5',
    // 맑은 바다
    A: '#6cc7c6', a: '#c3ece8', B: '#3e9fae', t: '#d3f3ee',
    // 해초 · 모래 · 불가사리 · 금빛
    G: '#6fbf8e', g: '#a8dcb0', N: '#3f8a63',
    Y: '#f4d9a6', y: '#fbe9c4', O: '#f2a65a', o: '#f8c98f', Q: '#e8b04a',
  };

  const ART = {
    coral: [
      'c....c....c',
      'C....C..c.C',
      'C.c..C..C.C',
      'C.C..C..CCC',
      'CCC..C...C.',
      '.C..cC...C.',
      '.C..CC..CC.',
      '.CC.C..CC..',
      '..CCC.CC...',
      '...CCCC....',
      '....DC.....',
      '....DC.....',
      '...DDCC....',
    ],
    coral2: [
      '.cc.....cc.',
      '.CC..cc.CC.',
      '.CC..CC.CC.',
      '.CCC.CCCCC.',
      '..CC.CCC...',
      'cc.CCCC..cc',
      'CC..CC..CCC',
      'CCC.CC.CCC.',
      '.CCCCCCCC..',
      '...CCCC....',
      '....DCC....',
      '...DDCCC...',
    ],
    clam: [
      '....ssssss....',
      '..ssSsSSsSss..',
      '.sSsSSsSSsSSs.',
      'sSSsSSsSSsSSSs',
      'HSHSSHSSHSSHSH',
      '.HHHHHHHHHHHH.',
      '..............',
      '.....pPPp.....',
      '....pPwPPp....',
      's...pPPPPp...s',
      'Ss..ppPPpp..sS',
      'SSssssssssssSS',
      'HSSSSSSSSSSSSH',
      '.HHSSSSSSSSHH.',
      '...HHHHHHHH...',
    ],
    scallop: [
      '...sSsSs...',
      '..sSsSsSs..',
      '.SsSsSsSsS.',
      'SsSsSsSsSsS',
      'SsSsSsSsSsS',
      '.HsSsSsSsH.',
      '..HsSsSsH..',
      '...HHHHH...',
      '..HHHHHHH..',
    ],
    pearl: [
      '.pPPp.',
      'pPwPPp',
      'pPPPPp',
      'ppPPpp',
      '.pppp.',
    ],
    starfish: [
      '.....O.....',
      '....OoO....',
      '....OoO....',
      'OOOOOoOOOOO',
      '.OOoooooOO.',
      '..OOOoOOO..',
      '..OOOOOOO..',
      '.OOO...OOO.',
      '.OO.....OO.',
      'OO.......OO',
    ],
    fish: [
      '....AAAA...',
      'A..AaaaaAA.',
      'AAAaaaaaeaA',
      'AAAaaaaaaaA',
      'AAAAaaaaAA.',
      'A...AAAA...',
    ],
    bubble: [
      '.aa.',
      'awaa',
      'aaaa',
      '.aa.',
    ],
    seaweed: [
      '.G..', '.gG.', '..G.', '..Gg', '.Gg.', '.G..', 'Gg..',
      '.G..', '.gG.', '..G.', '..Gg', '.Gg.', '.G..', '.G..',
    ],
    bottle: [
      '...SSS...',
      '...SsS...',
      '...SSS...',
      '....Q....',
      '..aaaaa..',
      '.aAAAAAa.',
      'aAwAAAAAa',
      'aAwAAAAAa',
      'aAAAAAAAa',
      'aAAAAAAAa',
      '.aAAAAAa.',
      '..aaaaa..',
    ],
    flask: [
      '..aaaaa..',
      '...aaa...',
      '...aaa...',
      '...aaa...',
      '..aaaaa..',
      '..aCCCa..',
      '.aCcCCCa.',
      '.aCCCcCa.',
      'aCCCCCCCa',
      'aCCcCCCCa',
      '.aaaaaaa.',
    ],
    envelope: [
      'yyyyyyyyyyy',
      'HyyyyyyyyyH',
      'yHyyyyyyyHy',
      'yyHyyyyyHyy',
      'yyyHyCyHyyy',
      'yyyyCCCyyyy',
      'yyyyyCyyyyy',
      'yyyyyyyyyyy',
    ],
    heart: [
      '.CC.CC.',
      'CcCCCCC',
      'CCCCCCC',
      '.CCCCC.',
      '..CCC..',
      '...C...',
    ],
    // 배경 타일 (테두리 없음)
    wave: [
      '......wwww......',
      '...wwwttttwww...',
      'wwwttttttttttttw',
      'tttttttttttttttt',
    ],
    dune: [
      '..........yy....',
      '.......yyyYYyy..',
      'yyy..yyYYYYYYYyy',
      'YYYyyYYYYYYYYYYY',
    ],
  };

  const OUTLINE = '#';

  function grid(name, outline) {
    const rows = ART[name];
    if (!outline) return rows.map((r) => [...r]);
    const w = rows[0].length + 2;
    const h = rows.length + 2;
    const at = (x, y) => (rows[y - 1] && rows[y - 1][x - 1]) || '.';
    const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => at(x, y)));
    const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < w && g[y][x] !== '.';
    return g.map((row, y) => row.map((c, x) => (
      c === '.' && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ? OUTLINE : c
    )));
  }

  // 같은 색이 가로로 이어지면 rect 하나로 합친다
  function rects(name, { outline = 'k', recolor = {} } = {}) {
    const g = grid(name, outline);
    const color = (c) => (c === OUTLINE ? COLORS[outline] : recolor[c] || COLORS[c]);
    const out = [];
    g.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        const c = row[x];
        let n = 1;
        while (row[x + n] === c) n += 1;
        if (c !== '.') out.push({ x, y, n, fill: color(c) });
        x += n;
      }
    });
    return { w: g[0].length, h: g.length, out };
  }

  function svg(name, { scale = 4, outline = 'k', recolor = {} } = {}) {
    const { w, h, out } = rects(name, { outline, recolor });
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    el.setAttribute('width', w * scale);
    el.setAttribute('height', h * scale);
    el.setAttribute('shape-rendering', 'crispEdges');
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('pixel-icon');
    out.forEach(({ x, y, n, fill }) => {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', x);
      r.setAttribute('y', y);
      r.setAttribute('width', n);
      r.setAttribute('height', 1);
      r.setAttribute('fill', fill);
      el.appendChild(r);
    });
    return el;
  }

  // CSS 배경용 data URI
  function tile(name) {
    const { w, h, out } = rects(name, { outline: false });
    const body = out.map(({ x, y, n, fill }) => `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${fill}"/>`).join('');
    const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(src)}")`;
  }

  // <span data-sprite="coral" data-scale="5" data-outline="N" data-recolor="C:#f3a3a6,c:#fff">
  function hydrate(root = document) {
    root.querySelectorAll('[data-sprite]').forEach((el) => {
      const { sprite, scale, outline, recolor } = el.dataset;
      const map = {};
      (recolor || '').split(',').filter(Boolean).forEach((pair) => {
        const [k, v] = pair.split(':');
        map[k.trim()] = v.trim();
      });
      el.replaceChildren(svg(sprite, {
        scale: Number(scale) || 4,
        outline: outline === 'none' ? false : outline || 'k',
        recolor: map,
      }));
    });
  }

  return { svg, tile, hydrate };
})();

// ---------- 화면 ----------
function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function sprite(name, scale = 4, extra = {}) {
  const span = h('span');
  span.dataset.sprite = name;
  span.dataset.scale = scale;
  Object.assign(span.dataset, extra);
  return span;
}

const P = PROFILE;
const email = `${P.email.user}@${P.email.domain}`;

function renderText() {
  document.title = `${P.name} · ${P.title}`;
  document.querySelectorAll('[data-bind]').forEach((el) => { el.textContent = P[el.dataset.bind] ?? ''; });
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  document.querySelector('.about-text').append(...P.about.map((t) => h('p', null, t)));
  document.querySelectorAll('[data-email]').forEach((el) => { el.textContent = email; });
  document.querySelectorAll('[data-mailto]').forEach((el) => { el.href = `mailto:${email}`; });
}

function renderExpertise() {
  const grid = document.getElementById('expertise-grid');
  [['creation', 'bottle'], ['application', 'flask']].forEach(([key, icon]) => {
    const e = P.expertise[key];
    const card = h('article', `expert-card ${key} pixel-box reveal`);
    const head = h('div', 'expert-head');
    const title = h('h3', null, e.title);
    title.append(h('small', null, e.en));
    head.append(sprite(icon, 4), title);
    const list = h('ul', 'expert-points');
    e.points.forEach((t) => {
      const li = h('li');
      li.append(sprite(key === 'creation' ? 'pearl' : 'heart', 2), h('span', null, t));
      list.append(li);
    });
    card.append(head, h('p', 'expert-summary', e.summary), list);
    grid.append(card);
  });

  const process = document.getElementById('process');
  P.process.forEach((s) => {
    const li = h('li', 'pixel-box reveal');
    li.append(h('h4', null, s.title), h('p', null, s.text));
    process.append(li);
  });

  document.getElementById('product-tags').append(...P.productTags.map((t) => h('li', null, t)));
  document.getElementById('family-tags').append(...P.familyTags.map((t) => h('li', null, t)));
}

function renderWorks() {
  const grid = document.getElementById('works-grid');
  const icons = [['scallop', 3, {}], ['coral2', 3, {}], ['starfish', 3, {}]];
  P.works.forEach((w, i) => {
    const card = h('article', 'work-card pixel-box reveal');
    const head = h('div', 'work-head');
    const [icon, scale, extra] = icons[i % icons.length];
    head.append(sprite(icon, scale, extra), h('span', 'work-cat', w.category));
    if (w.example) head.append(h('span', 'badge', '예시'));

    const id = `work-detail-${i}`;
    const btn = h('button', 'btn btn-small', '자세히 보기');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);

    const detail = h('div', 'work-detail');
    detail.id = id;
    detail.hidden = true;
    const notes = h('dl', 'notes');
    [['TOP', 'top'], ['MIDDLE', 'middle'], ['BASE', 'base']].forEach(([label, key]) => {
      const row = h('div');
      row.append(h('dt', null, label), h('dd', null, (w.notes[key] || []).join(' · ')));
      notes.append(row);
    });
    const challenge = h('p', 'work-challenge');
    challenge.append(h('strong', null, '해결한 과제 '), document.createTextNode(w.challenge));
    detail.append(notes, challenge);

    btn.addEventListener('click', () => {
      const open = detail.hidden;
      detail.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? '접기' : '자세히 보기';
    });

    card.append(head, h('p', 'work-family', w.family), h('h3', 'work-concept', w.concept),
      h('p', 'work-role', `맡은 일 · ${w.role}`), btn, detail);
    grid.append(card);
  });
}

function renderExperience() {
  const list = document.getElementById('timeline');
  P.experience.forEach((x) => {
    const li = h('li', 'reveal');
    const marker = sprite('pearl', 3);
    marker.classList.add('marker');
    const card = h('div', 'card pixel-box');
    card.append(h('p', 'period', x.period), h('h3', null, x.org), h('p', 'role', x.role));
    if (x.points.length) {
      const ul = h('ul');
      ul.append(...x.points.map((t) => h('li', null, t)));
      card.append(ul);
    }
    li.append(marker, card);
    list.append(li);
  });
}

// 물고기 · 거품 · 반짝임
function fillSea() {
  const fishColors = [
    {},
    { A: '#e8604f', a: '#f9c0b2' },
    { A: '#de9294', a: '#fde3df' },
    { A: '#3e9fae', a: '#a9e5e0' },
  ];
  document.querySelectorAll('.sea-life').forEach((sea, si) => {
    const count = si === 0 ? 4 : 3;
    for (let i = 0; i < count; i += 1) {
      const fish = h('div', `fish${i % 2 ? ' left' : ''}`);
      fish.style.top = `${12 + ((i * 23 + si * 11) % 70)}%`;
      fish.style.animationDuration = `${16 + ((i * 7) % 11)}s`;
      fish.style.animationDelay = `${-i * 5}s`;
      fish.append(pixel.svg('fish', { scale: i === 0 ? 4 : 3, recolor: fishColors[(i + si) % fishColors.length] }));
      sea.append(fish);
    }
    for (let i = 0; i < 9; i += 1) {
      const b = h('div', 'bubble');
      b.style.left = `${(i * 37 + si * 13) % 96 + 2}%`;
      b.style.animationDuration = `${7 + (i % 4) * 2}s`;
      b.style.animationDelay = `${-i * 1.3}s`;
      b.append(pixel.svg('bubble', { scale: 2 + (i % 2), outline: 'B' }));
      sea.append(b);
    }
    for (let i = 0; i < 5; i += 1) {
      const s = h('div', 'sparkle');
      s.style.left = `${(i * 41 + 7 + si * 17) % 94 + 3}%`;
      s.style.top = `${4 + (i * 13) % 26}%`;
      s.style.animationDelay = `${-i * 0.4}s`;
      sea.append(s);
    }
  });
}

// ---------- 동작 ----------
function toast(msg) {
  const el = document.querySelector('.toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

async function copyEmail() {
  try {
    await navigator.clipboard.writeText(email);
  } catch {
    const ta = h('textarea');
    ta.value = email;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('이메일 주소를 복사했어요');
}

function watchSections() {
  const links = [...document.querySelectorAll('.nav-links a')];
  const reveals = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
    return;
  }
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        revealer.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });
  reveals.forEach((el) => revealer.observe(el));

  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((a) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) spy.observe(target);
  });
}

// ---------- 시작 ----------
document.documentElement.style.setProperty('--wave', pixel.tile('wave'));
document.documentElement.style.setProperty('--dune', pixel.tile('dune'));
renderText();
renderExpertise();
renderWorks();
renderExperience();
pixel.hydrate();
fillSea();
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', copyEmail));
watchSections();
