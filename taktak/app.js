'use strict';
// 화면과 조작. 그림은 engine.js가 그리고, 여기서는 상태와 손가락 입력을 맡는다.

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const THEME_KEY = 'taktak.v1.concept';

const INKS = [['#1d1a18', '검정'], ['#b3202a', '빨강'], ['#23356b', '남색'], ['#f7f3ea', '흰색']];
const THREADS = [
  ['#9d1b2c', '버건디'], ['#cf1f33', '빨강'], ['#e2542a', '주황'], ['#e88aa5', '분홍'],
  ['#2c3e75', '남색'], ['#3f7a4d', '초록'], ['#f2e7cf', '크림'], ['#20201f', '검정'],
];
const MATS = [['#f6efe0', '크림'], ['#ffffff', '흰색'], ['#f3e6a8', '노랑'], ['#f4cfd4', '분홍'], ['#cfe0d0', '민트']];

const state = {
  concept: 'type',
  tab: 'text',
  photo: null,
  layout: 'full',
  ratio: 'orig',
  zoom: 1,
  panX: 0,
  panY: 0,
  slot: { overX: 0, overY: 0 },
  riso: { palette: 'vivid', dot: 0.5, mis: 0.6, overlap: 0.6, seed: 1 },
  matColor: '#f6efe0',
  frameKind: 'wood',
  noise: 0.35,
  border: 'none',
  borderColor: '#9d1b2c',
  items: [],
  sel: null,
  W: 1200,
  H: 1500,
  base: null,
  tool: 'pen',
  cols: 44,
};

// 새 글씨의 기본값. 글씨를 고르면 그 글씨의 값으로 바뀐다.
const opts = {
  size: 0.06, rot: 0, slant: 0, bleed: 0.65, scatter: 0.6, ink: '#1d1a18', font: 'elite',
  stitchFont: 'script', rows: 14, thread: '#9d1b2c', threadKind: 'cotton',
  back: 'none', risoInk: 0,
};

const hand = { cells: new Map(), ghost: new Set(), undo: [], cv: null };

const stage = $('#stage');
const ctx = stage.getContext('2d');
const wrap = $('#stageWrap');
const frame = $('#frame');
const view = { s: 1, x: 0, y: 0 };
let nextId = 1;

// ── 그리기 ────────────────────────────────────────
let queued = false;
function draw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    paint(ctx, true);
  });
}

function placeItem(c, item, sprite, image) {
  const live = gesture.pinch && gesture.pinch.item === item ? gesture.pinch.scale : 1;
  c.save();
  c.translate(item.x * state.W, item.y * state.H);
  c.rotate((item.rot * Math.PI) / 180);
  c.scale(live, live);
  c.globalCompositeOperation = sprite.blend;
  c.drawImage(image, -sprite.w / 2, -sprite.h / 2);
  c.restore();
}

function paint(c, preview) {
  const { W, H } = state;
  c.clearRect(0, 0, W, H);
  if (state.base) c.drawImage(state.base, 0, 0);
  if (hand.cv) c.drawImage(hand.cv, 0, 0);
  for (const item of state.items) {
    if (!item.sprite) continue;
    const image = item.anim && preview ? item.anim.cv : item.sprite.cv;
    placeItem(c, item, item.sprite, image);
  }
  if (!preview) return;
  if (state.tab === 'grid' && state.concept === 'stitch') paintGrid(c);
  else if (state.tab !== 'photo' && state.sel && state.sel.sprite) paintSelection(c, state.sel);
}

function paintSelection(c, item) {
  const live = gesture.pinch && gesture.pinch.item === item ? gesture.pinch.scale : 1;
  const w = item.sprite.w * live, h = item.sprite.h * live;
  const unit = Math.max(state.W, state.H) / 420;
  c.save();
  c.translate(item.x * state.W, item.y * state.H);
  c.rotate((item.rot * Math.PI) / 180);
  c.lineWidth = unit;
  c.setLineDash([unit * 5, unit * 4]);
  c.strokeStyle = '#fff';
  c.strokeRect(-w / 2, -h / 2, w, h);
  c.lineDashOffset = unit * 4.5;
  c.strokeStyle = '#d93a4a';
  c.strokeRect(-w / 2, -h / 2, w, h);
  c.restore();
}

function cellSize() { return state.W / state.cols; }

function paintGrid(c) {
  const { W, H } = state;
  const size = cellSize();
  c.save();
  c.fillStyle = 'rgba(44,62,117,.62)';
  for (const key of hand.ghost) {
    const [x, y] = key.split(',').map(Number);
    if (!hand.cells.has(key)) c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  }
  c.lineWidth = Math.max(1, W / 1400);
  for (let i = 0; i <= state.cols; i++) {
    c.strokeStyle = i % 10 === 0 ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.32)';
    c.beginPath(); c.moveTo(i * size, 0); c.lineTo(i * size, H); c.stroke();
  }
  for (let i = 0; i * size <= H; i++) {
    c.strokeStyle = i % 10 === 0 ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.32)';
    c.beginPath(); c.moveTo(0, i * size); c.lineTo(W, i * size); c.stroke();
  }
  c.restore();
}

// 화면에 맞는 표시 크기
function fit() {
  const cs = getComputedStyle(wrap);
  const fs = getComputedStyle(frame);
  const availW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(fs.paddingLeft) - parseFloat(fs.paddingRight);
  const availH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(fs.paddingTop) - parseFloat(fs.paddingBottom);
  const k = Math.max(0.01, Math.min(availW / state.W, availH / state.H));
  stage.style.width = `${Math.floor(state.W * k)}px`;
  stage.style.height = `${Math.floor(state.H * k)}px`;
}

function applyView() {
  frame.style.transform = view.s === 1 && !view.x && !view.y ? '' : `translate(${view.x}px,${view.y}px) scale(${view.s})`;
}

function rebuildBase(fast) {
  const { cv, W, H, slot, print } = Engine.buildBase(state, fast);
  const resized = W !== state.W || H !== state.H;
  const printing = print && !fast;
  // 찍는 동안에는 앞 그림을 두었다가 새 인쇄로 바꾼다. 크기가 달라졌거나 드르륵이면 빈 종이부터 시작한다
  if (!printing || resized || printAnimate || !state.base) state.base = cv;
  state.slot = slot;
  state.W = W;
  state.H = H;
  if (stage.width !== W || stage.height !== H) { stage.width = W; stage.height = H; }
  fit();
  if (resized) {
    redrawHand();
    prepareAll();
  }
  if (printing) startPrint(cv, print);
  else printToken++;
  draw();
}

// ── 드르륵 ────────────────────────────────────────
let printToken = 0;
let printAnimate = false;
let printJob = Promise.resolve();

function startPrint(base, print) {
  const token = ++printToken;
  const animated = printAnimate;
  printAnimate = false;
  if (animated) frame.classList.add('printing');
  printJob = Engine.risoPrint({
    base, print, riso: state.riso, W: state.W, H: state.H,
    pause: animated ? 420 : 0,
    alive: () => token === printToken,
    onPlate: (cv) => {
      state.base = cv;
      if (animated) sound('drum');
      draw();
    },
  }).finally(() => {
    if (token === printToken) frame.classList.remove('printing');
  });
}

// 새 어긋남으로 다시 찍는다
function reprint() {
  state.riso.seed = (state.riso.seed + 1) % 9999;
  printAnimate = true;
  rebuildBase();
  prepareAll();
}

let risoTimer = null;
function risoChanged() {
  clearTimeout(risoTimer);
  risoTimer = setTimeout(() => {
    rebuildBase();
    prepareAll();
  }, 140);
}

function renderRisoChips() {
  const box = $('#risoChips');
  box.replaceChildren(...Engine.PALETTES[state.riso.palette].inks.map((color, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.style.setProperty('--c', color);
    b.setAttribute('aria-label', `잉크 ${i + 1}`);
    b.setAttribute('aria-pressed', String(i === opts.risoInk % Engine.PALETTES[state.riso.palette].inks.length));
    b.addEventListener('click', () => setOpt('risoInk', i));
    return b;
  }));
}

// 사진을 옮기는 동안은 한 프레임에 한 번만 굽고, 손을 떼면 필름까지 다시 굽는다
let photoQueued = false;
let photoTimer = null;
function photoMoved() {
  clearTimeout(photoTimer);
  photoTimer = setTimeout(() => rebuildBase(), 160);
  if (photoQueued) return;
  photoQueued = true;
  requestAnimationFrame(() => {
    photoQueued = false;
    rebuildBase(true);
  });
}

function resetCrop() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
}

// ── 글씨 조각 ─────────────────────────────────────
async function prepare(item) {
  item.token = (item.token || 0) + 1;
  const token = item.token;
  await Engine.loadFonts(Engine.fontsFor(item, state.concept), item.text);
  if (token !== item.token) return false;
  const empty = item.kind === 'text' && !item.text.trim();
  if (empty) { item.sprite = null; draw(); return false; }
  if (state.concept === 'riso') item.sprite = Engine.risoSprite(item, state.W, state.riso);
  else if (state.concept === 'type') item.sprite = Engine.inkSprite(item, state.W);
  else item.sprite = Engine.stitchSprite(item, state.W);
  draw();
  return true;
}

function prepareAll() { state.items.forEach(prepare); }

let debounce = null;
function prepareLater(item) {
  clearTimeout(debounce);
  debounce = setTimeout(() => prepare(item), 140);
}

// 글자가 하나씩 찍히고, 한 땀씩 놓이는 애니메이션
function animate(item) {
  const sprite = item.sprite;
  if (!sprite || !sprite.units.length) return;
  const cv = Engine.canvas(sprite.w, sprite.h);
  const c = cv.getContext('2d');
  const anim = { cv, i: 0 };
  item.anim = anim;
  const keyed = sprite.sound === 'key';
  const perStep = keyed ? 1 : Math.max(1, Math.ceil(sprite.units.length / 50));
  const delay = keyed ? Math.min(80, 1600 / sprite.units.length) : 26;
  const step = () => {
    if (item.anim !== anim) return;
    for (let k = 0; k < perStep && anim.i < sprite.units.length; k++, anim.i++) {
      const u = sprite.units[anim.i];
      c.drawImage(sprite.cv, u.x, u.y, u.w, u.h, u.x, u.y, u.w, u.h);
    }
    sound(sprite.sound);
    if (keyed) strikeShake();
    draw();
    if (anim.i >= sprite.units.length) { item.anim = null; draw(); return; }
    setTimeout(step, delay);
  };
  step();
}

function strikeShake() {
  frame.classList.remove('strike-hit');
  void frame.offsetWidth;
  frame.classList.add('strike-hit');
}

// ── 소리 (파일 없이 만든다) ───────────────────────
let audio = null;
function sound(kind) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (kind === 'drum') { drumSound(); return; }
    const len = kind === 'key' ? 0.05 : 0.03;
    const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'key' ? 1900 : 900;
    const gain = audio.createGain();
    gain.gain.value = kind === 'key' ? 0.35 : 0.1;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
  } catch { /* 소리는 없어도 된다 */ }
}

// 드럼이 도는 소리: 낮은 잡음을 빠르게 끊어 드르륵거리게 한다
function drumSound() {
  const len = 0.38;
  const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / audio.sampleRate;
    const beat = (t * 32) % 1 < 0.45 ? 1 : 0.15;
    d[i] = (Math.random() * 2 - 1) * beat * Math.min(1, (len - t) * 8);
  }
  const src = audio.createBufferSource();
  src.buffer = buf;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  const gain = audio.createGain();
  gain.gain.value = 0.22;
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start();
}

// ── 글씨 추가·선택 ────────────────────────────────
function newItem(extra) {
  const spread = state.items.length % 5;
  return {
    id: nextId++,
    seed: Math.floor(Math.random() * 1e9),
    kind: 'text',
    text: '',
    x: 0.5,
    y: 0.34 + spread * 0.08,
    ...opts,
    ...extra,
  };
}

async function strike() {
  const text = $('#textInput').value.replace(/\s+$/, '');
  if (!text.trim()) { $('#textInput').focus(); return; }
  const item = newItem({ text });
  state.items.push(item);
  select(item);
  if (await prepare(item)) animate(item);
}

async function addDing(name, glyph) {
  const item = newItem({ kind: 'ding', ding: name, glyph, size: Math.max(0.05, opts.size), back: 'none' });
  state.items.push(item);
  select(item);
  if (await prepare(item)) animate(item);
}

function select(item) {
  state.sel = item;
  if (item) {
    Object.keys(opts).forEach((k) => { if (item[k] !== undefined) opts[k] = item[k]; });
    if (item.kind === 'text') $('#textInput').value = item.text;
  }
  syncControls();
  draw();
}

function deselect() {
  state.sel = null;
  opts.rot = 0;                    // 기울기는 글씨마다 따로. 새 글씨는 반듯하게 시작한다
  $('#textInput').value = '';
  syncControls();
  draw();
}

function removeSelected() {
  state.items = state.items.filter((i) => i !== state.sel);
  deselect();
}

function hitTest(x, y) {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (!item.sprite) continue;
    const dx = x - item.x * state.W, dy = y - item.y * state.H;
    const a = (-item.rot * Math.PI) / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(rx) <= item.sprite.w / 2 && Math.abs(ry) <= item.sprite.h / 2) return item;
  }
  return null;
}

// ── 손땀 층 ───────────────────────────────────────
function redrawHand() {
  if (!hand.cells.size) { hand.cv = null; draw(); return; }
  hand.cv = Engine.canvas(state.W, state.H);
  const c = hand.cv.getContext('2d');
  for (const [key, color] of hand.cells) stitchAt(c, key, color);
  draw();
}

function stitchAt(c, key, color) {
  const [x, y] = key.split(',').map(Number);
  const size = cellSize();
  Engine.drawStitch(c, x * size, y * size, size, color, opts.threadKind, Engine.random(x * 7919 + y * 104729));
}

function setCell(key, on, stroke) {
  const had = hand.cells.get(key);
  if (on) {
    if (had === opts.thread) return;
    hand.cells.set(key, opts.thread);
    if (!hand.cv) hand.cv = Engine.canvas(state.W, state.H);
    stitchAt(hand.cv.getContext('2d'), key, opts.thread);
    sound('stitch');
  } else {
    if (had === undefined) return;
    hand.cells.delete(key);
    stroke.erased = true;
  }
  if (!stroke.changes.some((ch) => ch.key === key)) stroke.changes.push({ key, had });
  if (stroke.erased) redrawHand();
  draw();
}

function paintLine(from, to, stroke) {
  const size = cellSize();
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (size / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const gx = Math.floor((from.x + (to.x - from.x) * t) / size);
    const gy = Math.floor((from.y + (to.y - from.y) * t) / size);
    if (gx < 0 || gy < 0 || gx >= state.cols || gy * size >= state.H) continue;
    setCell(`${gx},${gy}`, state.tool === 'pen', stroke);
  }
}

function undoStroke() {
  const stroke = hand.undo.pop();
  if (!stroke) return;
  stroke.changes.forEach(({ key, had }) => {
    if (had === undefined) hand.cells.delete(key);
    else hand.cells.set(key, had);
  });
  redrawHand();
}

function layGhost(grid) {
  const startX = Math.max(0, Math.floor((state.cols - grid.cols) / 2));
  const startY = Math.max(0, Math.floor((state.H / cellSize() - grid.rows) / 2));
  grid.cells.forEach(([x, y]) => hand.ghost.add(`${x + startX},${y + startY}`));
  draw();
}

function moveGhost(dx, dy) {
  const moved = new Set();
  for (const key of hand.ghost) {
    const [x, y] = key.split(',').map(Number);
    moved.add(`${x + dx},${y + dy}`);
  }
  hand.ghost = moved;
  draw();
}

// ── 손가락 입력 ───────────────────────────────────
const pointers = new Map();
const gesture = { photo: null, photoZoom: null, drag: null, pinch: null, stroke: null, view: null, ghost: null, last: null };

function toCanvas(e) {
  const r = stage.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * state.W, y: ((e.clientY - r.top) / r.height) * state.H };
}

function twoFingers() {
  const [a, b] = [...pointers.values()];
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
  };
}

function inGrid() { return state.tab === 'grid' && state.concept === 'stitch'; }

function onDown(e) {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const p = toCanvas(e);

  if (state.tab === 'photo') {
    if (!state.photo) return;
    if (pointers.size === 1) {
      gesture.photo = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
    } else if (pointers.size === 2) {
      gesture.photo = null;
      gesture.photoZoom = { start: twoFingers(), zoom: state.zoom };
    }
    return;
  }

  if (inGrid()) {
    if (pointers.size === 1) {
      if (state.tool === 'move') {
        gesture.ghost = { x: p.x, y: p.y };
      } else {
        gesture.stroke = { changes: [] };
        gesture.last = p;
        paintLine(p, p, gesture.stroke);
      }
    } else if (pointers.size === 2) {
      // 두 손가락이 닿으면 칠하던 첫 땀을 무르고 확대로 넘어간다
      if (gesture.stroke) {
        hand.undo.push(gesture.stroke);
        undoStroke();
        gesture.stroke = null;
      }
      gesture.ghost = null;
      gesture.view = { start: twoFingers(), s: view.s, x: view.x, y: view.y };
    }
    return;
  }

  if (pointers.size === 1) {
    const hit = hitTest(p.x, p.y);
    if (hit) {
      if (hit !== state.sel) select(hit);
      gesture.drag = { item: hit, dx: p.x - hit.x * state.W, dy: p.y - hit.y * state.H };
    } else if (state.sel) {
      deselect();
    }
  } else if (pointers.size === 2 && state.sel) {
    gesture.drag = null;
    gesture.pinch = { item: state.sel, start: twoFingers(), rot: state.sel.rot, scale: 1 };
  }
}

function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const p = toCanvas(e);

  if (gesture.photoZoom && pointers.size >= 2) {
    const g = gesture.photoZoom;
    state.zoom = Engine.clamp(g.zoom * (twoFingers().dist / g.start.dist), 1, 5);
    $('#zoom').value = state.zoom;
    photoMoved();
    return;
  }
  if (gesture.photo) {
    const g = gesture.photo;
    const scale = state.W / stage.getBoundingClientRect().width;
    const { overX, overY } = state.slot;
    if (overX > 0) state.panX = Engine.clamp(g.panX + ((e.clientX - g.x) * scale * 2) / overX, -1, 1);
    if (overY > 0) state.panY = Engine.clamp(g.panY + ((e.clientY - g.y) * scale * 2) / overY, -1, 1);
    photoMoved();
    return;
  }

  if (gesture.view && pointers.size >= 2) {
    const now = twoFingers();
    const v = gesture.view;
    view.s = Engine.clamp(v.s * (now.dist / v.start.dist), 1, 6);
    view.x = v.x + now.cx - v.start.cx;
    view.y = v.y + now.cy - v.start.cy;
    if (view.s === 1) { view.x = 0; view.y = 0; }
    applyView();
    return;
  }
  if (gesture.ghost) {
    const size = cellSize();
    const dx = Math.round((p.x - gesture.ghost.x) / size);
    const dy = Math.round((p.y - gesture.ghost.y) / size);
    if (dx || dy) {
      moveGhost(dx, dy);
      gesture.ghost = { x: gesture.ghost.x + dx * size, y: gesture.ghost.y + dy * size };
    }
    return;
  }
  if (gesture.stroke) {
    paintLine(gesture.last, p, gesture.stroke);
    gesture.last = p;
    return;
  }
  if (gesture.pinch && pointers.size >= 2) {
    const now = twoFingers();
    const g = gesture.pinch;
    g.scale = Engine.clamp(now.dist / g.start.dist, 0.25, 5);
    g.item.rot = g.rot + (now.angle - g.start.angle);
    draw();
    return;
  }
  if (gesture.drag) {
    const { item, dx, dy } = gesture.drag;
    item.x = Engine.clamp((p.x - dx) / state.W, -0.05, 1.05);
    item.y = Engine.clamp((p.y - dy) / state.H, -0.05, 1.05);
    draw();
  }
}

function onUp(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) gesture.photoZoom = null;
  if (!pointers.size) gesture.photo = null;
  if (gesture.stroke) {
    if (gesture.stroke.changes.length) hand.undo.push(gesture.stroke);
    gesture.stroke = null;
  }
  if (gesture.pinch && pointers.size < 2) {
    const g = gesture.pinch;
    gesture.pinch = null;
    g.item.size = Engine.clamp(g.item.size * g.scale, 0.012, 0.4);
    g.item.rot = ((g.item.rot + 180) % 360 + 360) % 360 - 180;
    opts.size = g.item.size;
    opts.rot = g.item.rot;
    syncControls();
    prepare(g.item);
  }
  if (pointers.size < 2) gesture.view = null;
  if (!pointers.size) { gesture.drag = null; gesture.ghost = null; }
}

// ── 컨셉 스위치 (오늘의 할일 테마처럼 html data-theme만 바꾼다) ─
function setConcept(id) {
  if (!['type', 'stitch', 'riso'].includes(id)) id = 'type';
  const changed = id !== state.concept;
  state.concept = id;
  document.documentElement.dataset.theme = id;
  $('meta[name="theme-color"]').content = { type: '#ece2cd', stitch: '#efe4d2', riso: '#f8f0e0' }[id];
  try { localStorage.setItem(THEME_KEY, id); } catch { /* 기억 못 해도 동작한다 */ }
  $$('[data-concept]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.concept === id)));
  $('#strikeBtn').textContent = { type: '탁!', stitch: '땀땀', riso: '드르륵' }[id];
  if ((state.tab === 'grid' && id !== 'stitch') || (state.tab === 'print' && id !== 'riso')) setTab('text');
  syncControls();
  fit();
  if (changed) {
    printAnimate = id === 'riso' && !!state.photo;
    rebuildBase();                 // 리소는 사진까지 바뀌니 바탕을 다시 굽는다
    prepareAll();
  }
  draw();
}

function setTab(id) {
  state.tab = id;
  $$('.tab[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  $$('.panel').forEach((p) => { p.hidden = p.dataset.panel !== id; });
  if (id !== 'grid' && view.s !== 1) resetView();
  draw();
}

function resetView() {
  view.s = 1; view.x = 0; view.y = 0;
  applyView();
}

// ── 컨트롤 묶기 ───────────────────────────────────
// 값을 바꾸면 고른 글씨에도 바로 반영한다
function setOpt(key, value) {
  opts[key] = value;
  const item = state.sel;
  if (!item) { syncControls(); return; }
  item[key] = value;
  if (key !== 'rot') prepareLater(item);
  syncControls();
  draw();
}

const GROUP_TARGET = { palette: 'riso', ratio: 'state', layout: 'state', frameKind: 'state', border: 'state', tool: 'state' };

function setGroup(group, value) {
  if (group === 'palette') {
    state.riso.palette = value;
    renderRisoChips();
    syncControls();
    risoChanged();
    return;
  }
  if (GROUP_TARGET[group]) {
    state[group] = value;
    syncControls();
    if (group === 'ratio' || group === 'layout' || group === 'frameKind' || group === 'border') {
      if (group === 'layout' || group === 'ratio') resetView();
      if (group === 'ratio') { resetCrop(); syncControls(); }
      rebuildBase();
    }
    return;
  }
  setOpt(group, value);
}

function makeChips(el, list, read, write) {
  list.forEach(([color, name]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.style.setProperty('--c', color);
    b.title = name;
    b.setAttribute('aria-label', name);
    b.dataset.color = color;
    b.addEventListener('click', () => write(color));
    el.append(b);
  });
  el.dataset.read = read;
}

function syncControls() {
  $$('.seg[data-group]').forEach((seg) => {
    const g = seg.dataset.group;
    const v = g === 'palette' ? state.riso.palette : GROUP_TARGET[g] ? state[g] : opts[g];
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
  });
  const values = { ink: opts.ink, thread: opts.thread, matColor: state.matColor };
  $$('.chips').forEach((box) => {
    box.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === values[box.dataset.read])));
  });
  $('#size').value = opts.size;
  $('#rot').value = opts.rot;
  $('#slant').value = opts.slant;
  $('#bleed').value = opts.bleed;
  $('#scatter').value = opts.scatter;
  $('#dot').value = state.riso.dot;
  $('#mis').value = state.riso.mis;
  $('#overlap').value = state.riso.overlap;
  renderRisoChips();
  $('#rows').value = opts.rows;
  $('#noise').value = state.noise;
  $('#zoom').value = state.zoom;
  $('#noiseOut').textContent = `${Math.round(state.noise * 100)}`;
  $('#cols').value = state.cols;

  const text = state.sel && state.sel.kind === 'text';
  const any = !!state.sel;
  $('#selBar').hidden = !any;
  $('#strikeBtn').disabled = text;
  $('#textInput').disabled = any && !text;
  $$('[data-when]').forEach((el) => {
    const [key, list] = el.dataset.when.split(':');
    const v = key === 'layout' ? state.layout : opts[key];
    el.hidden = !list.split(',').includes(v);
  });
  $('#pickHint').hidden = !!state.photo;
}

async function loadPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.photo = img;             // <img>로 읽으면 휴대폰 사진의 회전 정보가 저절로 반영된다
    resetView();
    resetCrop();
    printAnimate = state.concept === 'riso';
    rebuildBase();
    syncControls();
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('이 사진은 열 수 없어요. 다른 사진을 골라 주세요.'); };
  img.src = url;
}

// ── 저장 ──────────────────────────────────────────
let savedBlob = null;
let savedUrl = '';                 // JPG 내용을 그대로 담은 주소. 임시 blob 주소는 휴대폰에서 확장자 없이 저장될 수 있다
async function openSave() {
  await printJob;                  // 찍는 중이면 끝난 그림을 저장한다
  const out = Engine.canvas(state.W, state.H);
  const c = out.getContext('2d');
  paint(c, false);
  out.toBlob((blob) => {
    savedBlob = blob;
    const img = $('#saveImg');
    savedUrl = out.toDataURL('image/jpeg', 0.93);
    img.src = savedUrl;            // 미리보기를 꾹 눌러 저장해도 JPG로 받는다
    $('#shareBtn').hidden = !(navigator.canShare && navigator.canShare({ files: [saveFile()] }));
    $('#saveDialog').showModal();
  }, 'image/jpeg', 0.93);
}

function saveFile() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return new File([savedBlob], `taktak-${stamp}.jpg`, { type: 'image/jpeg' });
}

function download() {
  const a = document.createElement('a');
  a.href = savedUrl;
  a.download = saveFile().name;
  a.type = 'image/jpeg';
  document.body.append(a);         // 문서에 붙어 있어야 누르기가 듣는 브라우저가 있다
  a.click();
  a.remove();
}

async function share() {
  try { await navigator.share({ files: [saveFile()] }); } catch { /* 사용자가 닫은 경우 */ }
}

// ── 딩벳 썸네일 ───────────────────────────────────
function dingButton(name, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ding';
  b.setAttribute('aria-label', name);
  b.title = name;
  const grid = Engine.dingCells(name);
  const cell = 3;
  const cv = Engine.canvas((grid.cols + 2) * cell, (grid.rows + 2) * cell);
  const c = cv.getContext('2d');
  c.fillStyle = '#9d1b2c';
  grid.cells.forEach(([x, y]) => c.fillRect((x + 1) * cell, (y + 1) * cell, cell - 0.6, cell - 0.6));
  b.append(cv);
  b.addEventListener('click', () => onClick(name));
  return b;
}

// 타자기 딩벳은 활자 그대로 보여 준다
function typeDingButton([glyph, label, stitchName]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ding glyph';
  b.textContent = glyph;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => addDing(stitchName, glyph));
  return b;
}

// ── 시작 ──────────────────────────────────────────
function wire() {
  $('#switch').addEventListener('click', (e) => {
    const b = e.target.closest('[data-concept]');
    if (b) setConcept(b.dataset.concept);
  });
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  $$('.seg[data-group]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setGroup(seg.dataset.group, b.dataset.value);
    });
  });

  makeChips($('#inkChips'), INKS, 'ink', (c) => setOpt('ink', c));
  makeChips($('#threadChips'), THREADS, 'thread', (c) => { setOpt('thread', c); state.borderColor = c; if (state.border !== 'none') rebuildBase(); });
  makeChips($('#threadChips2'), THREADS, 'thread', (c) => { opts.thread = c; state.borderColor = c; syncControls(); });
  makeChips($('#matChips'), MATS, 'matColor', (c) => { state.matColor = c; syncControls(); rebuildBase(); });

  ['size', 'rot', 'slant', 'bleed', 'scatter', 'rows'].forEach((id) => {
    $(`#${id}`).addEventListener('input', (e) => setOpt(id, Number(e.target.value)));
  });
  $('#noise').addEventListener('input', (e) => {
    state.noise = Number(e.target.value);
    $('#noiseOut').textContent = `${Math.round(state.noise * 100)}`;
    clearTimeout(wire.noiseTimer);
    wire.noiseTimer = setTimeout(rebuildBase, 90);
  });
  ['dot', 'mis', 'overlap'].forEach((id) => {
    $(`#${id}`).addEventListener('input', (e) => {
      state.riso[id] = Number(e.target.value);
      risoChanged();
    });
  });
  $('#printBtn').addEventListener('click', reprint);
  $('#zoom').addEventListener('input', (e) => {
    state.zoom = Number(e.target.value);
    photoMoved();
  });
  $('#cropResetBtn').addEventListener('click', () => {
    resetCrop();
    syncControls();
    rebuildBase();
  });
  $('#cols').addEventListener('input', (e) => {
    state.cols = Number(e.target.value);
    redrawHand();
    draw();
  });

  $('#textInput').addEventListener('input', (e) => {
    const item = state.sel;
    if (item && item.kind === 'text') { item.text = e.target.value; prepareLater(item); }
  });
  // 키보드가 올라오면 옵션을 접어 사진이 보이게 한다
  $('#textInput').addEventListener('focus', () => document.body.classList.add('typing'));
  $('#textInput').addEventListener('blur', () => setTimeout(() => {
    document.body.classList.remove('typing');
    fit();
  }, 120));

  $('#strikeBtn').addEventListener('click', strike);
  $('#deselectBtn').addEventListener('click', deselect);
  $('#deleteBtn').addEventListener('click', removeSelected);

  const pick = () => $('#fileInput').click();
  $('#pickBtn').addEventListener('click', pick);
  $('#pickHint').addEventListener('click', pick);
  $('#cameraBtn').addEventListener('click', () => $('#cameraInput').click());
  $('#fileInput').addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });
  $('#cameraInput').addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });

  Object.keys(DINGBATS).forEach((name) => {
    $('#dingGrid').append(dingButton(name, (n) => addDing(n)));
    $('#ghostDings').append(dingButton(name, (n) => layGhost(Engine.dingCells(n))));
  });

  $('#typeDingGrid').append(...TYPE_DINGS.map(typeDingButton));

  $('#undoBtn').addEventListener('click', undoStroke);
  $('#zoomResetBtn').addEventListener('click', resetView);
  $('#clearHandBtn').addEventListener('click', () => {
    if (!hand.cells.size || !confirm('놓은 땀을 전부 지울까요?')) return;
    hand.cells.clear();
    hand.undo = [];
    redrawHand();
  });
  $('#ghostBtn').addEventListener('click', async () => {
    const text = $('#ghostText').value.trim();
    if (!text) return;
    await Engine.loadFonts(['Galmuri14', 'Dancing Script', 'Gaegu'], text);
    layGhost(Engine.textCells(text, opts.stitchFont, opts.rows, opts.slant));
  });
  $('#ghostClearBtn').addEventListener('click', () => { hand.ghost.clear(); draw(); });

  $('#saveBtn').addEventListener('click', openSave);
  $('#downloadBtn').addEventListener('click', download);
  $('#shareBtn').addEventListener('click', share);
  $('#closeSave').addEventListener('click', () => $('#saveDialog').close());

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);

  new ResizeObserver(fit).observe(wrap);
}

function start() {
  wire();
  let saved = 'type';
  try { saved = localStorage.getItem(THEME_KEY) || 'type'; } catch { /* 없으면 기본값 */ }
  state.concept = ['stitch', 'riso'].includes(saved) ? saved : 'type';
  setTab('text');
  rebuildBase();
  setConcept(state.concept);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
