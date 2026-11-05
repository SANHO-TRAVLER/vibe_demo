'use strict';
// 그림 엔진: 잉크 번짐 글씨, X땀, 종이 띠·리본, 사진 바탕과 필름 노이즈.
// 글씨 하나는 '조각(sprite)' 캔버스 하나로 구워 두고, 끌 때는 조각만 다시 붙인다.

const Engine = (() => {
  // 한글은 은타자(진짜 옛 타자기 글꼴), 영문은 고른 타자 글꼴로 찍는다
  const FONTS = {
    elite: { css: '"Special Elite","UnTaza",monospace', weight: 400, families: ['Special Elite', 'UnTaza'] },
    courier: { css: '"Courier Prime","UnTaza",monospace', weight: 700, families: ['Courier Prime', 'UnTaza'] },
  };
  const DING_FONT = 'Noto Sans Symbols 2';
  const STITCH_FONTS = {
    script: { css: '"Dancing Script","Gaegu",cursive', weight: 700, families: ['Dancing Script', 'Gaegu'] },
    dot: { css: '"Galmuri11"', weight: 400, families: ['Galmuri11'] },
    dot14: { css: '"Galmuri14"', weight: 400, families: ['Galmuri14'] },
  };

  // 리소 색 조합. c·m·y·k는 사진을 나눈 판이고, 판마다 잉크 하나를 얹는다.
  // inks는 글씨에 고를 수 있는 잉크 순서다
  const PALETTES = {
    mono: {
      plates: [
        { ch: 'l', ink: '#29292d', angle: 45, gain: 1 },
        { ch: 'l', ink: '#55555b', angle: 15, gain: 0.6 },
      ],
      inks: ['#29292d', '#6d6d73'],
    },
    pastel: {
      plates: [
        { ch: 'y', ink: '#fbe58e', angle: 0, gain: 1 },
        { ch: 'c', ink: '#9bd6e6', angle: 15, gain: 1 },
        { ch: 'm', ink: '#f7aecb', angle: 75, gain: 1 },
        { ch: 'k', ink: '#7a9ccc', angle: 45, gain: 1 },
      ],
      inks: ['#7a9ccc', '#f28fb8', '#7fc9dc', '#f2cf55'],
    },
    vivid: {
      plates: [
        { ch: 'y', ink: '#f5c83c', angle: 0, gain: 1 },
        { ch: 'c', ink: '#1f9e8f', angle: 15, gain: 1 },
        { ch: 'm', ink: '#ee5a36', angle: 75, gain: 1 },
        { ch: 'k', ink: '#2c3563', angle: 45, gain: 1 },
      ],
      inks: ['#2c3563', '#ee5a36', '#1f9e8f', '#f5c83c'],
    },
    fluoro: {
      plates: [
        { ch: 'y', ink: '#f6f02a', angle: 0, gain: 1 },
        { ch: 'c', ink: '#1fd2c8', angle: 15, gain: 1 },
        { ch: 'm', ink: '#ff3fa8', angle: 75, gain: 1 },
        { ch: 'k', ink: '#5a2fd0', angle: 45, gain: 1 },
      ],
      inks: ['#5a2fd0', '#ff3fa8', '#1fd2c8', '#f6f02a'],
    },
  };

  // ── 도구 ──────────────────────────────────────────
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const HANGUL = /[가-힣]/;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) {
    const [r, g, b] = rgb(hex);
    const f = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  function hash(x, y, s) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // 상자 흐림 3번 = 가우시안에 가깝다. ctx.filter에 기대지 않아 어느 브라우저든 결과가 같다.
  function blur(src, w, h, radius) {
    const r = Math.max(1, Math.round(radius));
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    const pass = (from, to, horizontal) => {
      const outer = horizontal ? h : w, inner = horizontal ? w : h;
      const norm = 1 / (2 * r + 1);
      for (let o = 0; o < outer; o++) {
        const at = (i) => (horizontal ? o * w + clamp(i, 0, inner - 1) : clamp(i, 0, inner - 1) * w + o);
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += from[at(i)];
        for (let i = 0; i < inner; i++) {
          to[at(i)] = sum * norm;
          sum += from[at(i + r + 1)] - from[at(i - r)];
        }
      }
    };
    for (let i = 0; i < 3; i++) {
      pass(a, b, true);
      pass(b, a, false);
    }
    return a;
  }

  // ── 글씨 바탕 ─────────────────────────────────────
  function tornPath(ctx, x, y, w, h, rand) {
    const step = Math.max(5, h / 9);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = x; i < x + w; i += step * 2) ctx.lineTo(i, y + (rand() - 0.5) * h * 0.035);
    ctx.lineTo(x + w, y);
    for (let i = y; i < y + h; i += step) ctx.lineTo(x + w + (rand() - 0.5) * step * 1.1, i);
    ctx.lineTo(x + w, y + h);
    for (let i = x + w; i > x; i -= step * 2) ctx.lineTo(i, y + h + (rand() - 0.5) * h * 0.035);
    ctx.lineTo(x, y + h);
    for (let i = y + h; i > y; i -= step) ctx.lineTo(x + (rand() - 0.5) * step * 1.1, i);
    ctx.closePath();
  }

  function paperStrip(ctx, x, y, w, h, seed) {
    const rand = random(seed);
    ctx.save();
    ctx.shadowColor = 'rgba(30,20,10,.38)';
    ctx.shadowBlur = h * 0.1;
    ctx.shadowOffsetY = h * 0.05;
    tornPath(ctx, x, y, w, h, rand);
    ctx.fillStyle = '#f5edda';
    ctx.fill();
    ctx.restore();
    ctx.save();
    tornPath(ctx, x, y, w, h, random(seed));
    ctx.clip();
    for (let i = 0, n = (w * h) / 500; i < n; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(120,90,50,.1)' : 'rgba(255,255,255,.3)';
      ctx.fillRect(x + rand() * w, y + rand() * h, 1 + rand() * 3, 1);
    }
    ctx.restore();
  }

  function backing(ctx, item, box) {
    if (item.back === 'paper') paperStrip(ctx, box.x, box.y, box.w, box.h, item.seed);
  }

  // ── 타자기: 잉크 번짐 ─────────────────────────────
  function layoutType(item, W) {
    const font = FONTS[item.font] || FONTS.elite;
    const ding = item.kind === 'ding';
    const px = item.size * W * (ding ? 2 : 1);
    const lines = ding ? [item.glyph || DING_GLYPHS[item.ding] || '♥'] : item.text.split('\n');
    const fontStr = ding ? `400 ${px}px "${DING_FONT}"` : `${font.weight} ${px}px ${font.css}`;
    const m = canvas(1, 1).getContext('2d');
    m.font = fontStr;
    // 은타자 한글은 글자 사이가 넓어서 조금 당긴다
    const adv = (ch) => m.measureText(ch).width * (HANGUL.test(ch) ? 0.9 : 1);
    const lineH = px * 1.5;
    const placed = [];
    let width = 0;
    lines.forEach((line, row) => {
      let x = 0;
      for (const ch of Array.from(line)) {
        const w = adv(ch);
        placed.push({ ch, x, row, w });
        x += w;
      }
      width = Math.max(width, x);
    });
    return { px, lineH, width, rows: lines.length, placed, fontStr };
  }

  // 글자마다 어긋나는 양. 같은 글씨는 언제 구워도 같은 모양이고, 막대를 움직이면 크기만 변한다
  function scatterPlan(item, placed, px) {
    const rand = random(item.seed + 11);
    const s = item.kind === 'ding' ? 0 : item.scatter;
    const lines = new Map();
    return placed.map((g) => {
      if (!lines.has(g.row)) {
        lines.set(g.row, {
          shift: (rand() - 0.5) * px * 1.4 * s,      // 줄 시작이 어긋난다
          slope: (rand() - 0.5) * 0.09 * s,          // 줄이 비스듬히 흐른다
          drift: 0,
          push: 0,
        });
      }
      const line = lines.get(g.row);
      line.drift = clamp(line.drift + (rand() - 0.5) * 0.7, -1, 1);   // 글자 높이가 천천히 오르내린다
      line.push += (rand() - 0.5) * px * 0.26 * s;    // 글자 사이가 벌어졌다 좁아진다
      const jump = rand() < 0.16 ? (rand() < 0.5 ? -1 : 1) * px * 0.3 * s : 0;   // 가끔 툭 튀는 글자
      return {
        dx: line.shift + line.push,
        dy: line.drift * px * 0.26 * s + (rand() - 0.5) * px * 0.18 * s + jump + g.x * line.slope,
        rot: (rand() - 0.5) * (0.03 + 0.6 * s),
      };
    });
  }

  function inkSprite(item, W) {
    const { px, lineH, width, rows, placed, fontStr } = layoutType(item, W);
    const ding = item.kind === 'ding';
    const hasBack = item.back !== 'none';
    const plan = scatterPlan(item, placed, px);
    const reachX = Math.max(0, ...plan.map((p) => Math.abs(p.dx)));
    const reachY = Math.max(0, ...plan.map((p) => Math.abs(p.dy)));
    const padX = Math.ceil(px * (hasBack ? 1.15 : 0.55) + reachX + px * Math.abs(item.slant) * 0.5);
    const padY = Math.ceil(px * (hasBack ? 0.72 : 0.55) + reachY);
    const cw = Math.ceil(width + padX * 2);
    const ch = Math.ceil(rows * lineH + padY * 2);

    // 1) 글자마다 위치·힘을 다르게 찍는다
    const mask = canvas(cw, ch);
    const c = mask.getContext('2d', { willReadFrequently: true });
    const rand = random(item.seed);
    c.font = fontStr;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillStyle = '#000';
    c.strokeStyle = '#000';
    c.lineWidth = px * 0.012;
    c.lineJoin = 'round';
    const units = [];
    placed.forEach((g, i) => {
      const p = plan[i];
      const x = padX + g.x + g.w / 2 + p.dx;
      const y = padY + (g.row + 0.5) * lineH + p.dy;
      c.save();
      c.translate(x, y);
      c.rotate(p.rot);
      if (!ding) c.transform(1, 0, -item.slant, 1, 0, 0);   // 이탤릭: 글자 윗부분을 옆으로 민다
      c.globalAlpha = 0.72 + rand() * 0.28;
      c.fillText(g.ch, 0, 0);
      if (HANGUL.test(g.ch)) c.strokeText(g.ch, 0, 0);   // 은타자 획은 가늘어서 잉크를 조금 더 먹인다
      if (rand() < 0.14) {                       // 가끔 두 번 찍힌 듯한 그림자
        c.globalAlpha = 0.28;
        c.fillText(g.ch, px * 0.022, px * 0.012);
      }
      c.restore();
      units.push({ x: Math.floor(x - g.w * 0.75), y: Math.floor(y - lineH * 0.7), w: Math.ceil(g.w * 1.5), h: Math.ceil(lineH * 1.4), key: g.ch.trim() !== '' });
    });

    // 2) 번짐: 뭉갠 글자를 노이즈로 흔들어 다시 자르면 가장자리가 종이결처럼 퍼진다
    const img = c.getImageData(0, 0, cw, ch);
    const n = cw * ch;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = img.data[i * 4 + 3] / 255;
    const bleed = item.bleed;
    const near = blur(a, cw, ch, px * (0.006 + 0.014 * bleed));
    const far = blur(a, cw, ch, px * (0.03 + 0.075 * bleed));
    const [r, g, b] = rgb(item.ink);
    const seed = item.seed % 9973;
    const loScale = 1 / Math.max(3, px * 0.16);
    const dryScale = 1 / Math.max(2, px * 0.06);
    for (let y = 0, i = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++, i++) {
        const j = i * 4;
        if (far[i] < 0.012) { img.data[j + 3] = 0; continue; }
        const lo = noise(x * loScale, y * loScale, seed);
        const fibre = noise(x * 0.5, y * 0.16, seed + 1);
        const th = 0.42 - 0.16 * bleed + (lo - 0.5) * (0.14 + 0.3 * bleed) + (fibre - 0.5) * (0.08 + 0.2 * bleed);
        const edge = smooth(th - 0.11, th + 0.11, near[i]);
        const halo = smooth(0.06, 0.55, far[i] + (lo - 0.5) * 0.3) * bleed * 0.42;
        const pool = smooth(0.5, 0.85, far[i]) * 0.25;
        const dry = 0.72 + 0.4 * noise(x * dryScale, y * dryScale, seed + 2);
        const ink = clamp(Math.max(edge * dry + pool * edge, halo));
        img.data[j] = r; img.data[j + 1] = g; img.data[j + 2] = b;
        img.data[j + 3] = ink * 255;
      }
    }
    c.putImageData(img, 0, 0);

    const out = canvas(cw, ch);
    const o = out.getContext('2d');
    const box = { x: px * 0.1, y: px * 0.08, w: cw - px * 0.2, h: ch - px * 0.16 };
    backing(o, item, box);
    o.globalCompositeOperation = hasBack ? 'multiply' : 'source-over';
    o.drawImage(mask, 0, 0);
    return {
      cv: out, w: cw, h: ch,
      blend: !hasBack && item.ink !== '#f7f3ea' ? 'multiply' : 'source-over',
      units: units.filter((u) => u.key),
      sound: 'key',
    };
  }

  // ── 리소: 글씨 ─────────────────────────────────────
  // 고른 잉크 판에 다음 잉크 판을 살짝 어긋나게 겹쳐 찍는다
  function risoSprite(item, W, riso) {
    const pal = PALETTES[riso.palette];
    const ding = item.kind === 'ding';
    const px = item.size * W * (ding ? 2 : 1.15);
    const lines = ding ? [item.glyph || DING_GLYPHS[item.ding] || '♥'] : item.text.split('\n');
    const fontStr = ding ? `400 ${px}px "${DING_FONT}"` : `400 ${px}px "Jua"`;
    const m = canvas(1, 1).getContext('2d');
    m.font = fontStr;
    const width = Math.max(1, ...lines.map((l) => m.measureText(l).width));
    const lineH = px * 1.3;
    const shift = px * (0.02 + 0.13 * riso.mis);
    const hasBack = item.back !== 'none';
    const slant = ding ? 0 : item.slant;
    const padX = Math.ceil((hasBack ? px * 0.9 : px * 0.3) + shift + px * Math.abs(slant) * 0.5);
    const padY = Math.ceil((hasBack ? px * 0.6 : px * 0.3) + shift);
    const cw = Math.ceil(width + padX * 2);
    const ch = Math.ceil(lines.length * lineH + padY * 2);

    const stamp = (color, dx, dy, seed) => {
      const cv = canvas(cw, ch);
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.font = fontStr;
      c.textBaseline = 'middle';
      c.fillStyle = color;
      lines.forEach((l, i) => {
        c.setTransform(1, 0, -slant, 1, padX + dx, padY + (i + 0.5) * lineH + dy);
        c.fillText(l, 0, 0);
      });
      c.setTransform(1, 0, 0, 1, 0, 0);
      const img = c.getImageData(0, 0, cw, ch);
      const d = img.data;
      // 잉크가 덜 묻은 자리: 작은 구멍과 얼룩이 손맛을 만든다
      for (let y = 0, i = 3; y < ch; y++) {
        for (let x = 0; x < cw; x++, i += 4) {
          if (!d[i]) continue;
          const n = hash(x, y, seed);
          const blot = noise(x / 3, y / 3, seed + 1);
          d[i] *= n > 0.94 ? 0.35 : 0.84 + 0.16 * blot;
        }
      }
      c.putImageData(img, 0, 0);
      return cv;
    };

    const rand = random(item.seed + riso.seed);
    const inks = pal.inks;
    const first = inks[item.risoInk % inks.length];
    const second = inks[(item.risoInk + 1) % inks.length];
    const ang = rand() * 6.28;
    const out = canvas(cw, ch);
    const o = out.getContext('2d');
    if (hasBack) backing(o, item, { x: px * 0.1, y: px * 0.08, w: cw - px * 0.2, h: ch - px * 0.16 });
    o.globalCompositeOperation = hasBack ? 'multiply' : 'source-over';
    o.drawImage(stamp(second, Math.cos(ang) * shift, Math.sin(ang) * shift, 3), 0, 0);
    o.globalCompositeOperation = 'multiply';
    o.drawImage(stamp(first, 0, 0, 5), 0, 0);
    return { cv: out, w: cw, h: ch, blend: hasBack ? 'source-over' : 'multiply', units: [{ x: 0, y: 0, w: cw, h: ch, key: true }], sound: 'drum' };
  }

  // ── 리소: 사진 ─────────────────────────────────────
  // 사진을 판으로 나눈다. 판 하나는 잉크가 얼마나 묻을지를 적은 표다
  function separate(layer) {
    const SCALE = 0.5;
    const w = Math.max(2, Math.round(layer.width * SCALE));
    const h = Math.max(2, Math.round(layer.height * SCALE));
    const cv = canvas(w, h);
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(layer, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;
    // 사진마다 어둡고 밝은 끝을 맞춰, 흐린 사진도 잉크가 또렷하게 나오게 한다
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) | 0]++;
    const cut = (w * h) * 0.01;
    let lo = 0, hi = 255, sum = 0;
    while (lo < 254 && (sum += hist[lo]) < cut) lo++;
    sum = 0;
    while (hi > lo + 1 && (sum += hist[hi]) < cut) hi--;
    const span = 1 / (hi - lo);
    const planes = { c: new Float32Array(w * h), m: new Float32Array(w * h), y: new Float32Array(w * h), k: new Float32Array(w * h), l: new Float32Array(w * h) };
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const r = clamp((d[i] - lo) * span), g = clamp((d[i + 1] - lo) * span), b = clamp((d[i + 2] - lo) * span);
      const k = 1 - Math.max(r, g, b);
      const rest = k < 1 ? 1 / (1 - k) : 0;
      const keep = 1 - k * 0.55;
      planes.c[j] = (1 - r - k) * rest * keep;
      planes.m[j] = (1 - g - k) * rest * keep;
      planes.y[j] = (1 - b - k) * rest * keep;
      planes.k[j] = k ** 1.5;
      planes.l[j] = 1 - (r * 0.3 + g * 0.59 + b * 0.11);
    }
    return { planes, w, h, SCALE };
  }

  const COS = Float32Array.from({ length: 1024 }, (_, i) => Math.cos((i / 1024) * Math.PI * 2));
  let grainTable = null;
  function grainField() {
    if (grainTable) return grainTable;
    grainTable = new Float32Array(65536);
    const rand = random(1234);
    for (let i = 0; i < 65536; i++) grainTable[i] = rand();
    return grainTable;
  }

  // 판 한 장을 찍는다. trans에는 종이에 닿는 빛이 판마다 곱해진다
  function printPlate(trans, area, sep, plate, opt, rand) {
    const { x0, y0, w, h, px, py, pw, ph } = area;
    const { cell, overlap, mis, W } = opt;
    const data = sep.planes[plate.ch];
    const { w: dw, h: dh, SCALE } = sep;
    const [ir, ig, ib] = rgb(plate.ink).map((v) => 1 - v / 255);
    const rad = (plate.angle * Math.PI) / 180;
    const ca = Math.cos(rad) / cell, sa = Math.sin(rad) / cell;
    const dir = rand() * Math.PI * 2;
    const dist = W * 0.017 * mis * (0.45 + rand() * 0.75);
    const shiftX = Math.cos(dir) * dist, shiftY = Math.sin(dir) * dist * 0.7;
    const skew = (rand() - 0.5) * 0.02 * mis;
    // 롤러가 미끄러지듯 줄마다 옆으로 밀린다
    const wobble = new Float32Array(h);
    const amp = W * 0.0035 * mis;
    const f1 = 0.004 + rand() * 0.006, f2 = 0.018 + rand() * 0.02, p1 = rand() * 6.3, p2 = rand() * 6.3;
    for (let y = 0; y < h; y++) wobble[y] = amp * Math.sin(y * f1 + p1) + amp * 0.45 * Math.sin(y * f2 + p2);
    const gain = (0.8 + overlap * 0.75) * plate.gain;
    const soft = Math.min(0.3, 1.3 / cell);
    const grain = grainField();
    const gx = (rand() * 256) | 0, gy = (rand() * 256) | 0;
    const cx = px + pw / 2, cy = py + ph / 2;
    const maxX = dw - 1, maxY = dh - 1;
    const K = 1024;

    for (let row = 0, o = 0; row < h; row++) {
      const y = row + y0;
      const yy = y - cy;
      for (let col = 0; col < w; col++, o += 3) {
        const x = col + x0;
        const xx = x - cx;
        const sx = (x - px - shiftX + skew * yy + wobble[row]) * SCALE;
        const sy = (y - py - shiftY - skew * xx) * SCALE;
        if (sx < 0 || sy < 0 || sx > maxX || sy > maxY) continue;
        const raw = data[(sy | 0) * dw + (sx | 0)];
        if (raw < 0.015) continue;
        const dens = raw * gain;
        // 둥근 망점: 두 방향 물결을 더한 값이 잉크가 먼저 앉는 자리
        const u = x * ca + y * sa, v = y * ca - x * sa;
        const screen = 0.5 - 0.25 * (COS[(((u * K) | 0) & 1023)] + COS[(((v * K) | 0) & 1023)]);
        const n = grain[(((y + gy) & 255) << 8) | ((x + gx) & 255)];
        const n2 = grain[(((((y + gx) >> 2)) & 255) << 8) | (((x + gy) >> 2) & 255)];
        const edge = dens - screen + (n2 - 0.5) * 0.14;
        if (edge <= -soft) continue;
        let a = edge >= soft ? 1 : (edge + soft) / (soft * 2);
        // 잉크가 덜 묻은 자리와 작은 얼룩
        a *= n > 0.965 ? 0.2 : 0.78 + 0.22 * n2;
        trans[o] *= 1 - a * ir;
        trans[o + 1] *= 1 - a * ig;
        trans[o + 2] *= 1 - a * ib;
      }
    }
  }

  // 사진을 판 순서대로 찍는다. onPlate는 판이 끝날 때마다 불린다
  async function risoPrint(job) {
    const { base, print, riso, W, H, alive, onPlate, pause } = job;
    const pal = PALETTES[riso.palette];
    const sep = separate(print.layer);
    const pad = Math.ceil(W * 0.03);
    const x0 = Math.max(0, print.x - pad), y0 = Math.max(0, print.y - pad);
    const x1 = Math.min(W, print.x + print.w + pad), y1 = Math.min(H, print.y + print.h + pad);
    const w = x1 - x0, h = y1 - y0;
    const area = { x0, y0, w, h, px: print.x, py: print.y, pw: print.w, ph: print.h };
    const opt = { W, mis: riso.mis, overlap: riso.overlap, cell: Math.max(4, W * (0.005 + 0.03 * riso.dot)) };
    const trans = new Float32Array(w * h * 3).fill(1);
    const rand = random(riso.seed + 7);
    const sheet = canvas(w, h);
    const sc = sheet.getContext('2d');
    const img = sc.createImageData(w, h);
    const out = canvas(W, H);
    const oc = out.getContext('2d');
    for (let i = 0; i < pal.plates.length; i++) {
      await new Promise((ok) => setTimeout(ok, pause));
      if (!alive()) return null;
      printPlate(trans, area, sep, pal.plates[i], opt, rand);
      const last = i === pal.plates.length - 1;
      if (!pause && !last) continue;
      for (let p = 0, q = 0; p < trans.length; p += 3, q += 4) {
        img.data[q] = trans[p] * 255;
        img.data[q + 1] = trans[p + 1] * 255;
        img.data[q + 2] = trans[p + 2] * 255;
        img.data[q + 3] = 255;
      }
      sc.putImageData(img, 0, 0);
      oc.globalCompositeOperation = 'source-over';
      oc.drawImage(base, 0, 0);
      oc.globalCompositeOperation = 'multiply';
      oc.drawImage(sheet, x0, y0);
      onPlate(out, i);
    }
    return out;
  }

  // ── 십자수: 글자를 칸으로 ─────────────────────────
  // 반환: { cols, rows, cells: [[x, y], ...] } — 칸 왼쪽 위 좌표
  function textCells(text, fontKey, rowsWanted, slant = 0) {
    const dot = fontKey === 'dot';
    const big = dot && rowsWanted >= 15;
    const font = dot ? (big ? STITCH_FONTS.dot14 : STITCH_FONTS.dot) : STITCH_FONTS.script;
    // 필기체 한글은 획이 많아 20칸 아래로는 뭉개진다. 한글이 있으면 칸 수를 올린다
    const rowsUsed = !dot && HANGUL.test(text) ? Math.max(rowsWanted, 20) : rowsWanted;
    const px = dot ? (big ? 14 : 12) : Math.round(rowsUsed * 1.2);
    const lineH = dot ? (big ? 17 : 14) : Math.round(px * 1.15);
    const lines = text.split('\n');
    const fontStr = `${font.weight} ${px}px ${font.css}`;
    const m = canvas(1, 1).getContext('2d');
    m.font = fontStr;
    const lean = Math.ceil(px * Math.abs(slant));
    const width = Math.ceil(Math.max(1, ...lines.map((l) => m.measureText(l).width))) + px + lean * 2;
    const height = lines.length * lineH + px;
    const cv = canvas(width, height);
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.font = fontStr;
    c.textBaseline = 'middle';
    c.fillStyle = '#000';
    if (!dot) {                      // 작은 칸에서 가는 획이 끊기지 않게 살짝 굵힌다
      c.strokeStyle = '#000';
      c.lineWidth = Math.max(0.5, px * 0.035);
      c.lineJoin = 'round';
    }
    lines.forEach((l, i) => {
      const y = Math.round(px / 2 + (i + 0.5) * lineH);
      c.setTransform(1, 0, -slant, 1, Math.round(px / 2) + lean, y);
      c.fillText(l, 0, 0);
      if (!dot) c.strokeText(l, 0, 0);
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    const d = c.getImageData(0, 0, width, height).data;
    const cells = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (d[(y * width + x) * 4 + 3] > 112) cells.push([x, y]);
      }
    }
    return { ...trim(cells), rowsUsed: dot ? (big ? 15 : 12) : rowsUsed };
  }

  function dingCells(name) {
    const cells = [];
    DINGBATS[name].forEach((line, y) => {
      Array.from(line).forEach((ch, x) => { if (ch === '#') cells.push([x, y]); });
    });
    return trim(cells);
  }

  function trim(cells) {
    if (!cells.length) return { cols: 1, rows: 1, cells: [] };
    const x0 = Math.min(...cells.map((p) => p[0]));
    const y0 = Math.min(...cells.map((p) => p[1]));
    const moved = cells.map(([x, y]) => [x - x0, y - y0]);
    return {
      cols: Math.max(...moved.map((p) => p[0])) + 1,
      rows: Math.max(...moved.map((p) => p[1])) + 1,
      cells: moved,
    };
  }

  // X땀 한 개. 실의 그림자, 몸통, 꼬임, 윤을 겹쳐 그린다. 바늘구멍도 찍는다.
  function drawStitch(c, x, y, size, color, kind, rand) {
    const wool = kind === 'wool';
    const lw = size * (wool ? 0.44 : 0.34);
    const m = size * 0.12;
    const j = () => (rand() - 0.5) * size * 0.14;
    const p = [
      [x + m + j(), y + size - m + j()], [x + size - m + j(), y + m + j()],   // 아래 다리 /
      [x + m + j(), y + m + j()], [x + size - m + j(), y + size - m + j()],   // 위 다리 \
    ];
    c.fillStyle = 'rgba(25,12,8,.5)';
    p.forEach(([px, py]) => {
      c.beginPath();
      c.arc(px, py, size * 0.06, 0, 7);
      c.fill();
    });
    c.lineCap = 'round';
    const leg = (a, b) => {
      const line = (dx, dy) => {
        c.beginPath();
        c.moveTo(a[0] + dx, a[1] + dy);
        c.lineTo(b[0] + dx, b[1] + dy);
        c.stroke();
      };
      c.setLineDash([]);
      c.strokeStyle = 'rgba(20,10,8,.34)';
      c.lineWidth = lw * 1.08;
      line(lw * 0.14, lw * 0.22);
      c.strokeStyle = color;
      c.lineWidth = lw;
      line(0, 0);
      c.strokeStyle = shade(color, -0.3);
      c.lineWidth = lw * 0.2;
      c.setLineDash([lw * 0.5, lw * 0.55]);
      line(lw * 0.13, lw * 0.13);
      c.strokeStyle = shade(color, 0.32);
      c.lineWidth = lw * 0.18;
      c.setLineDash([lw * 0.75, lw * 0.5]);
      line(-lw * 0.16, -lw * 0.13);
      c.setLineDash([]);
      if (wool) {                    // 털실의 잔털
        c.strokeStyle = shade(color, 0.14);
        c.lineWidth = Math.max(0.7, lw * 0.05);
        for (let i = 0; i < 8; i++) {
          const t = rand();
          const hx = a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * lw;
          const hy = a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * lw;
          const ang = rand() * 6.3;
          const len = lw * (0.3 + rand() * 0.6);
          c.beginPath();
          c.moveTo(hx, hy);
          c.lineTo(hx + Math.cos(ang) * len, hy + Math.sin(ang) * len);
          c.stroke();
        }
      }
    };
    leg(p[0], p[1]);
    leg(p[2], p[3]);
  }

  function stitchSprite(item, W) {
    const ding = item.kind === 'ding';
        const grid = ding ? dingCells(item.ding) : textCells(item.text, item.stitchFont, item.rows, item.slant);
    const nominal = ding ? grid.rows : grid.rowsUsed;
    const cell = Math.max(3, (item.size * W * (ding ? 2.2 : 2)) / nominal);
    const hasBack = item.back !== 'none';
    const padX = Math.ceil(hasBack ? cell * nominal * 0.62 : cell);
    const padY = Math.ceil(hasBack ? cell * nominal * 0.38 : cell);
    const cw = Math.ceil(grid.cols * cell + padX * 2);
    const ch = Math.ceil(grid.rows * cell + padY * 2);
    const out = canvas(cw, ch);
    const c = out.getContext('2d');
    backing(c, item, { x: cell * 0.2, y: cell * 0.2, w: cw - cell * 0.4, h: ch - cell * 0.4 });
    const rand = random(item.seed);
    const order = grid.cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const units = [];
    for (const [gx, gy] of order) {
      const x = padX + gx * cell, y = padY + gy * cell;
      drawStitch(c, x, y, cell, item.thread, item.threadKind, rand);
      units.push({ x: Math.floor(x - cell * 0.3), y: Math.floor(y - cell * 0.3), w: Math.ceil(cell * 1.6), h: Math.ceil(cell * 1.6), key: true });
    }
    return { cv: out, w: cw, h: ch, blend: 'source-over', units, sound: 'stitch' };
  }

  function fontsFor(item, concept) {
    if (item.kind === 'ding') return concept === 'stitch' ? [] : [DING_FONT];
    if (concept === 'riso') return ['Jua'];
    if (concept === 'type') return (FONTS[item.font] || FONTS.elite).families;
    if (item.stitchFont === 'dot') return item.rows >= 15 ? ['Galmuri14'] : ['Galmuri11'];
    return STITCH_FONTS.script.families;
  }

  async function loadFonts(families, text) {
    const sample = (text || 'A') + 'Aa가' + TYPE_DINGS.map((d) => d[0]).join('');
    const job = Promise.all(families.map((f) => document.fonts.load(`700 40px "${f}"`, sample).catch(() => null)));
    await Promise.race([job, new Promise((ok) => setTimeout(ok, 5000))]);   // 인터넷이 없어도 멈추지 않게
  }

  // ── 사진 바탕 ─────────────────────────────────────
  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    const size = 384;
    const cv = canvas(size, size);
    const c = cv.getContext('2d');
    const img = c.createImageData(size, size);
    const rand = random(77);
    for (let i = 0; i < size * size; i++) {
      // 평균 128 둘레의 입자. 큰 값이 드물게 튀어야 필름 같다
      const v = 128 + ((rand() + rand() + rand()) / 3 - 0.5) * 300;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = clamp(v, 0, 255);
      img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    grainTile = cv;
    return cv;
  }

  function film(c, x, y, w, h, amount) {
    if (amount <= 0) return;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    // 빛바랜 검정과 살짝 따뜻한 색
    c.globalCompositeOperation = 'lighten';
    c.fillStyle = `rgba(52,42,38,${0.55 * amount})`;
    c.fillRect(x, y, w, h);
    c.globalCompositeOperation = 'soft-light';
    c.fillStyle = `rgba(245,190,130,${0.3 * amount})`;
    c.fillRect(x, y, w, h);
    // 입자: 긴 변 1600 기준 1.4배로 키워 알갱이가 보이게 한다
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = clamp(0.25 + amount * 0.75);
    const tile = grain();
    const scale = Math.max(1, (Math.max(w, h) / 1600) * 1.4);
    c.translate(x, y);
    c.scale(scale, scale);
    c.fillStyle = c.createPattern(tile, 'repeat');
    c.fillRect(0, 0, w / scale, h / scale);
    c.restore();
    // 가장자리 어둡게
    c.save();
    const v = c.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.45, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.56);
    v.addColorStop(0, 'rgba(20,12,8,0)');
    v.addColorStop(1, `rgba(20,12,8,${0.34 * amount})`);
    c.fillStyle = v;
    c.fillRect(x, y, w, h);
    c.restore();
  }

  function paperTexture(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
    const rand = random(5);
    for (let i = 0, n = (w * h) / 700; i < n; i++) {
      c.fillStyle = rand() < 0.5 ? 'rgba(110,80,50,.06)' : 'rgba(255,255,255,.28)';
      c.fillRect(x + rand() * w, y + rand() * h, 1 + rand() * 3, 1);
    }
  }

  const FRAME_COLORS = {
    wood: ['#6a3f26', '#8a5635', '#44271a'],
    red: ['#d9432a', '#ee6a4c', '#a92c19'],
    cream: ['#efe5d0', '#fff8ea', '#c9bda6'],
  };

  function drawFrame(c, W, H, t, kind) {
    const [base, light, dark] = FRAME_COLORS[kind] || FRAME_COLORS.wood;
    const side = (pts, color) => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fillStyle = color;
      c.fill();
    };
    side([[0, 0], [W, 0], [W - t, t], [t, t]], light);
    side([[0, H], [W, H], [W - t, H - t], [t, H - t]], dark);
    side([[0, 0], [t, t], [t, H - t], [0, H]], base);
    side([[W, 0], [W - t, t], [W - t, H - t], [W, H]], base);
    if (kind === 'wood') {           // 나뭇결
      const rand = random(9);
      c.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        c.strokeStyle = `rgba(30,14,6,${0.08 + rand() * 0.14})`;
        const d = rand() * t;
        c.beginPath();
        if (i % 2) { c.moveTo(0, d); c.lineTo(W, d); c.moveTo(0, H - d); c.lineTo(W, H - d); }
        else { c.moveTo(d, 0); c.lineTo(d, H); c.moveTo(W - d, 0); c.lineTo(W - d, H); }
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.lineWidth = Math.max(1, t * 0.05);
    c.strokeRect(t, t, W - t * 2, H - t * 2);
  }

  // 실 테두리: 홈질은 긴 실밥, X자는 X땀을 줄지어 놓는다
  function drawBorder(c, x, y, w, h, kind, color, unit) {
    const rand = random(31);
    const edge = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / unit));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0;
        const bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
        if (kind === 'cross') {
          drawStitch(c, ax - unit / 2, ay - unit / 2, unit, color, 'cotton', rand);
        } else if (i % 2 === 0) {
          const lw = unit * 0.3;
          const wob = () => (rand() - 0.5) * unit * 0.14;
          const a = [ax + wob(), ay + wob()], b = [bx + wob(), by + wob()];
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(20,10,8,.34)';
          c.lineWidth = lw;
          c.beginPath(); c.moveTo(a[0] + lw * 0.15, a[1] + lw * 0.2); c.lineTo(b[0] + lw * 0.15, b[1] + lw * 0.2); c.stroke();
          c.strokeStyle = color;
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
          c.strokeStyle = shade(color, 0.3);
          c.lineWidth = lw * 0.18;
          c.setLineDash([lw * 0.7, lw * 0.5]);
          c.beginPath(); c.moveTo(a[0] - lw * 0.13, a[1] - lw * 0.13); c.lineTo(b[0] - lw * 0.13, b[1] - lw * 0.13); c.stroke();
          c.setLineDash([]);
        }
      }
    };
    edge(x, y, x + w, y);
    edge(x + w, y, x + w, y + h);
    edge(x + w, y + h, x, y + h);
    edge(x, y + h, x, y);
  }

  // 사진과 놓는 방식으로 작업 크기를 정하고 바탕을 굽는다
  // fast는 사진을 끄는 동안 쓴다. 필름 입자를 건너뛰어 손가락을 따라오게 한다
  function buildBase(s, fast) {
    const MAX = 1600;
    const photo = s.photo;
    const iw = photo ? photo.naturalWidth || photo.width : 1200;
    const ih = photo ? photo.naturalHeight || photo.height : 1500;
    // 틀 비율. 원본이면 사진 그대로, 아니면 사진의 긴 변을 틀의 긴 변으로 삼는다
    const longSide = Math.max(iw, ih);
    const [rw, rh] = s.ratio === 'orig' ? [iw, ih] : s.ratio.split(':').map(Number);
    const pw0 = rw >= rh ? longSide : (longSide * rw) / rh;
    const ph0 = rw >= rh ? (longSide * rh) / rw : longSide;
    const riso = s.concept === 'riso';
    const postcard = riso && s.layout === 'full';   // 리소는 종이 끝까지 찍지 않아 엽서처럼 여백이 남는다
    const mat = s.layout !== 'full' || postcard;
    const framed = s.layout === 'frame';
    const margin = postcard ? 0.045 : mat ? 0.34 : 0;
    const longest = Math.max(pw0, ph0);
    let fit = Math.min(1, MAX / (longest * (1 + margin * 2) * (framed ? 1.12 : 1)));
    if (!photo) fit = mat ? 0.62 : 1;
    const pw = Math.round(pw0 * fit), ph = Math.round(ph0 * fit);
    const m = Math.round(longest * fit * margin);
    const inner = { w: pw + m * 2, h: ph + m * 2 };
    const t = framed ? Math.round(Math.max(inner.w, inner.h) * 0.05) : 0;
    const W = inner.w + t * 2, H = inner.h + t * 2;
    const cv = canvas(W, H);
    const c = cv.getContext('2d');

    if (mat) paperTexture(c, 0, 0, W, H, s.matColor);
    const px = t + m, py = t + m;
    let slot = { overX: 0, overY: 0 };
    let print = null;
    if (photo) {
      if (mat && !riso) {
        c.save();
        c.shadowColor = 'rgba(30,20,10,.35)';
        c.shadowBlur = W * 0.008;
        c.shadowOffsetY = W * 0.003;
        c.fillStyle = '#000';
        c.fillRect(px, py, pw, ph);
        c.restore();
      }
      // 틀을 빈틈없이 덮는 크기가 기준(zoom 1)이고, 넘치는 만큼만 옮길 수 있다
      const k = Math.max(pw / iw, ph / ih) * s.zoom;
      const dw = iw * k, dh = ih * k;
      const fx = (pw - dw) / 2 + (s.panX * (dw - pw)) / 2;
      const fy = (ph - dh) / 2 + (s.panY * (dh - ph)) / 2;
      slot = { overX: dw - pw, overY: dh - ph };
      if (riso) {
        // 찍을 원판을 따로 둔다. 끄는 중에는 원판을 그대로 보여 준다
        const layer = canvas(pw, ph);
        layer.getContext('2d').drawImage(photo, fx, fy, dw, dh);
        print = { layer, x: px, y: py, w: pw, h: ph };
        if (fast) c.drawImage(layer, px, py);
      } else {
        c.save();
        c.beginPath();
        c.rect(px, py, pw, ph);
        c.clip();
        c.drawImage(photo, px + fx, py + fy, dw, dh);
        c.restore();
        if (!fast) film(c, px, py, pw, ph, s.noise);
      }
    } else if (!mat) {
      paperTexture(c, 0, 0, W, H, s.matColor);
    }
    if (s.border !== 'none') {
      const inset = Math.min(W, H) * 0.045 + t;
      const unit = Math.min(W, H) * 0.024;
      drawBorder(c, inset, inset, W - inset * 2, H - inset * 2, s.border, s.borderColor, unit);
    }
    if (framed) drawFrame(c, W, H, t, s.frameKind);
    return { cv, W, H, slot, print };
  }

  return {
    random, canvas, shade, clamp, FONTS, buildBase,
    PALETTES, risoPrint, risoSprite, inkSprite, stitchSprite, textCells, dingCells, drawStitch, fontsFor, loadFonts,
  };
})();
