/* ───────── LEXI·ON 전자사전 ───────── */
"use strict";

const TIER_LABEL = { default: "보통", complex: "정밀", quick: "빠름" };
const VIEW_LABEL = { input: "문장 입력", result: "단어 해설", pron: "발음 교정", book: "단어장", settings: "설정" };
const VERDICT = {
  correct: { mark: "O", label: "정답" },
  partial: { mark: "△", label: "부분\n정답" },
  wrong:   { mark: "X", label: "오답" },
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ───────── 저장소 ───────── */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const settings = Object.assign({ tier: "default" }, store.get("lexion.settings", {}));
const state = Object.assign({
  text: "", title: "", confirmed: false,
  marks: [],        // {id, start, end, text, guess, reason}
  result: null,     // {sentence_translation, items:[...]}  +  snapshot: {text, title, marks}
  activeItem: 0,
  pronText: "",
}, store.get("lexion.session", {}));
let book = store.get("lexion.book", []);
let nextMarkId = state.marks.reduce((m, x) => Math.max(m, x.id), 0) + 1;

const saveSession = () => store.set("lexion.session", state);
const saveBook = () => { store.set("lexion.book", book); updateCount(); };

/* ───────── 공통 UI ───────── */
let toastTimer;
function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", err);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), err ? 4200 : 2200);
}
function hint(msg) { $("#hint").textContent = "◆ " + msg; }
function busy(on, text = "해석 중") {
  $("#busy").hidden = !on;
  $("#busyText").textContent = text;
  $("#led").classList.toggle("busy", on);
}
function updateCount() { $("#sbCount").textContent = `단어장 ${book.length}`; }
function updateModel() {
  $("#sbModel").textContent = aiState === "off" ? "AI: 사용할 수 없음" : `AI: Claude 구독 · ${TIER_LABEL[settings.tier]}`;
}

/* 확인이 필요한 버튼: 한 번 누르면 문구가 바뀌고, 3초 안에 다시 눌러야 실행 */
function armed(btn, label) {
  if (btn.dataset.armed) {
    clearTimeout(+btn.dataset.armed);
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.orig;
    return true;
  }
  btn.dataset.orig = btn.textContent;
  btn.textContent = label;
  btn.dataset.armed = setTimeout(() => { btn.textContent = btn.dataset.orig; delete btn.dataset.armed; }, 3000);
  return false;
}

function showView(v) {
  $$(".view").forEach((el) => el.classList.toggle("on", el.id === "view-" + v));
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $("#sbMode").textContent = VIEW_LABEL[v];
  state.view = v;
  if (v === "pron") renderPronTarget();
  if (v === "book") renderBook();
  if (v === "settings") $("#tierSel").value = settings.tier;
  const hints = {
    input: state.confirmed ? "단어를 클릭(구는 드래그)해서 체크하고, 오른쪽에 유추한 뜻과 이유를 적으세요" : "문장을 입력하거나 책 사진을 넣고 [문장 확정]을 누르세요",
    result: "왼쪽 목록에서 단어를 고르면 자세한 해설이 나와요",
    pron: "▶ 원어민 듣기로 들어 보고, AI 발음 포인트로 주의할 곳을 확인하세요",
    book: "저장한 단어를 다시 복습할 수 있어요",
    settings: "AI는 내 Claude 구독으로 동작해요 (API 키 필요 없음)",
  };
  hint(hints[v]);
}

setInterval(() => {
  const d = new Date();
  $("#sbClock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}, 1000);

/* ───────── Claude (내 구독) ───────── */
let aiState = "wait";        // wait | on | off
let samplePromise = null;
function getSample() {
  samplePromise ||= (window.claude?.use ? window.claude.use("sample") : Promise.resolve(null)).catch(() => null);
  return samplePromise;
}
getSample().then((s) => { aiState = s ? "on" : "off"; updateModel(); });

// JSON 스키마를 프롬프트용 모양 설명으로 바꾼다
function shapeOf(s) {
  if (s.type === "object") return "{" + Object.entries(s.properties).map(([k, v]) => `"${k}": ${shapeOf(v)}`).join(", ") + "}";
  if (s.type === "array") return `[${shapeOf(s.items)}, ...]`;
  if (s.enum) return s.enum.map((x) => `"${x}"`).join(" | ");
  return s.type;
}

const AI_ERR = {
  not_granted: "이 페이지의 Claude 사용이 허락되지 않았어요. 페이지를 새로고침하면 다시 물어봅니다.",
  sampling_disabled: "이 계정에서는 Claude를 쓸 수 없어요.",
  rate_limited: "Claude 사용량 한도에 닿았어요. 잠시 후 다시 시도해 주세요.",
  session_expired: "claude.ai에 다시 로그인해 주세요.",
  image_rejected: "이 사진은 보낼 수 없어요. JPG·PNG 사진으로 다시 넣어 주세요.",
  images_unavailable: "이 화면에서는 사진을 보낼 수 없어요.",
  refused: "Claude가 이 요청을 처리하지 않았어요. 문장을 바꿔 다시 시도해 주세요.",
  invalid_json: "답을 읽지 못했어요. 한 번 더 눌러 주세요.",
  prompt_too_large: "문장이 너무 길어요. 조금 줄여 주세요.",
  empty_completion: "답이 비어 있어요. 단어 수를 줄여 다시 시도해 주세요.",
};

async function askClaude({ prompt, schema, images, tier = settings.tier }) {
  const sample = await getSample();
  if (!sample) throw new Error("이 화면에서는 AI를 쓸 수 없어요. claude.ai 에서 이 페이지를 열어 주세요.");
  const input = schema
    ? `${prompt}\n\nReply with only one JSON value of exactly this shape (every key required, no extra keys):\n${shapeOf(schema)}`
    : prompt;
  try {
    return await sample.json(input, { modelTier: tier, ...(images ? { images } : {}) });
  } catch (e) {
    $("#led").classList.add("err");
    setTimeout(() => $("#led").classList.remove("err"), 3000);
    throw new Error(AI_ERR[e?.code] || "Claude 연결이 잠시 불안정해요. 다시 시도해 주세요.");
  }
}

/* ───────── 토큰화 ───────── */
const TOKEN_RE = /([A-Za-z0-9À-ÿ]+(?:['’\-][A-Za-z0-9À-ÿ]+)*)|(\s+)|([^\sA-Za-z0-9À-ÿ]+)/g;
function tokenize(text) {
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    out.push({ type: m[1] ? "w" : m[2] ? "s" : "p", text: m[0], start: m.index });
  }
  return out;
}
const norm = (w) => w.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9']/g, "");

/* ───────── 1. 문장 입력 ───────── */
const textInput = $("#textInput");
const bookTitle = $("#bookTitle");
textInput.value = state.text;
bookTitle.value = state.title;
textInput.addEventListener("input", () => { state.text = textInput.value; saveSession(); });
bookTitle.addEventListener("input", () => { state.title = bookTitle.value; saveSession(); });

function setConfirmed(on) {
  state.confirmed = on;
  $("#editor").hidden = on;
  $("#reader").hidden = !on;
  $("#btnEditText").hidden = !on;
  saveSession();
  renderPassage();
  renderMarks();
  showView("input");
}

$("#btnConfirmText").onclick = () => {
  state.text = textInput.value.trim();
  if (!state.text && pendingImage) return runOcr();
  if (!state.text) return toast("먼저 문장을 입력하거나 책 사진을 넣어 주세요", true);
  state.marks = state.marks.filter((m) => m.end < tokenize(state.text).length);
  setConfirmed(true);
};
$("#btnEditText").onclick = () => setConfirmed(false);
$("#btnClearText").onclick = (e) => {
  if ((state.text || state.marks.length) && !armed(e.currentTarget, "한 번 더 누르면 지워요")) return;
  state.text = ""; state.marks = []; textInput.value = "";
  pendingImage = null;
  $("#dzThumb").innerHTML = "";
  dzStatus();
  setConfirmed(false);
};

/* 단어 체크 (클릭 / 드래그) */
let tokens = [];
let drag = null;
function renderPassage() {
  const el = $("#passage");
  tokens = tokenize(state.text);
  const owner = new Map();
  state.marks.forEach((m, i) => { for (let t = m.start; t <= m.end; t++) owner.set(t, { m, n: i + 1 }); });
  el.innerHTML = tokens.map((t, i) => {
    if (t.type === "s") return esc(t.text).replace(/\n/g, "<br>");
    if (t.type === "p") return `<span class="p">${esc(t.text)}</span>`;
    const o = owner.get(i);
    const cls = ["w"];
    if (o) { cls.push("marked"); if (o.m.start === i) cls.push("head"); }
    return `<span class="${cls.join(" ")}" data-i="${i}"${o ? ` data-n="${o.n}" data-mid="${o.m.id}"` : ""}>${esc(t.text)}</span>`;
  }).join("");
}

function wordIndex(target) { const w = target.closest?.(".w"); return w ? Number(w.dataset.i) : null; }
$("#passage").addEventListener("mousedown", (e) => {
  const i = wordIndex(e.target);
  if (i === null) return;
  drag = { a: i, b: i };
  e.preventDefault();
});
$("#passage").addEventListener("mouseover", (e) => {
  if (!drag) return;
  const i = wordIndex(e.target);
  if (i === null) return;
  drag.b = i;
  const [s, t] = [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)];
  $$("#passage .w").forEach((w) => { const k = +w.dataset.i; w.classList.toggle("temp", k >= s && k <= t); });
});
document.addEventListener("mouseup", () => {
  if (!drag) return;
  const [s, t] = [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)];
  drag = null;
  const hit = state.marks.find((m) => s === t && s >= m.start && s <= m.end);
  if (hit) {
    state.marks = state.marks.filter((m) => m !== hit);
  } else {
    state.marks = state.marks.filter((m) => m.end < s || m.start > t);
    addMark(s, t);
  }
  saveSession();
  renderPassage();
  renderMarks();
});

function addMark(s, t, guess = "", reason = "") {
  const text = tokens.slice(s, t + 1).map((x) => x.text).join("").replace(/\s+/g, " ").trim();
  const m = { id: nextMarkId++, start: s, end: t, text, guess, reason };
  state.marks.push(m);
  state.marks.sort((a, b) => a.start - b.start);
  setTimeout(() => $(`.mark-card[data-mid="${m.id}"] input`)?.focus(), 0);
  return m;
}

function renderMarks() {
  const list = $("#markList");
  $("#markCount").textContent = `${state.marks.length}개`;
  $("#btnAnalyze").disabled = !state.marks.length;
  if (!state.marks.length) {
    list.innerHTML = `<div class="empty">${state.confirmed ? "원문에서 모르는 단어를<br>클릭해서 체크하세요." : "원문을 확정한 뒤<br>모르는 단어를 체크하세요."}</div>`;
    return;
  }
  list.innerHTML = state.marks.map((m, i) => `
    <div class="mark-card" data-mid="${m.id}">
      <div class="mark-head"><span class="n">${i + 1}</span><span class="t">${esc(m.text)}</span>
        <button title="소리 듣기" data-act="say">🔊</button><button title="체크 해제" data-act="del">✕</button></div>
      <div class="mark-body">
        <label>내가 유추한 뜻<input class="lcd-input" data-f="guess" value="${esc(m.guess)}" placeholder="예: 슬그머니 다가가다"></label>
        <label>유추 사유<textarea class="lcd-input" data-f="reason" placeholder="예: 뒤에 'toward the door'가 있고, 주인공이 들키지 않으려는 상황이라서…">${esc(m.reason)}</textarea></label>
      </div>
    </div>`).join("");
}
$("#markList").addEventListener("input", (e) => {
  const card = e.target.closest(".mark-card");
  const m = state.marks.find((x) => x.id === +card.dataset.mid);
  m[e.target.dataset.f] = e.target.value;
  saveSession();
});
$("#markList").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const card = btn.closest(".mark-card");
  const m = state.marks.find((x) => x.id === +card.dataset.mid);
  if (btn.dataset.act === "del") {
    state.marks = state.marks.filter((x) => x !== m);
    saveSession(); renderPassage(); renderMarks();
  } else if (btn.dataset.act === "say") speak(m.text, 0.8);
});
$("#markList").addEventListener("focusin", (e) => {
  const card = e.target.closest(".mark-card");
  $$(".mark-card").forEach((c) => c.classList.toggle("active", c === card));
  $$("#passage .w").forEach((w) => w.classList.toggle("active", card && w.dataset.mid === card.dataset.mid));
});

/* 이미지 → 글자 인식 */
const dz = $("#dropzone");
dz.onclick = () => $("#fileInput").click();
$("#fileInput").onchange = (e) => { const f = e.target.files[0]; if (f) ocrImage(f); e.target.value = ""; };
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
dz.addEventListener("dragleave", () => dz.classList.remove("over"));
dz.addEventListener("drop", (e) => {
  e.preventDefault(); dz.classList.remove("over");
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
  if (f) ocrImage(f);
});
document.addEventListener("paste", (e) => {
  if (state.view !== "input" || state.confirmed) return;
  const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith("image/"));
  if (item) { e.preventDefault(); ocrImage(item.getAsFile()); }
});

function imageToBase64(file, maxDim = 2000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", 0.9);
      URL.revokeObjectURL(img.src);
      resolve({ url, data: url.split(",")[1] });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const OCR_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["text", "marked_words"],
  properties: {
    text: { type: "string" },
    marked_words: { type: "array", items: { type: "string" } },
  },
};

/* 사진 상태 안내 (없으면 기본 문구) */
let pendingImage = null;   // 아직 글자를 못 읽은 사진 {url, data}
const DZ_DEFAULT = $("#dzMsg").innerHTML;
function dzStatus(kind, msg) {
  dz.classList.toggle("err", kind === "err");
  dz.classList.toggle("ready", kind === "ready");
  $("#dzMsg").innerHTML = msg || DZ_DEFAULT;
}

/* 사진 자르기 · 돌리기: 읽을 부분만 골라야 인식이 정확해진다 */
let crop = null;   // {img, rot, src, scale, sel}
function rotatedCanvas(img, rot) {
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = rot % 180 ? sh : sw;
  c.height = rot % 180 ? sw : sh;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2);
  g.rotate((rot * Math.PI) / 180);
  g.drawImage(img, -sw / 2, -sh / 2);
  return c;
}
function drawCrop() {
  crop.src = rotatedCanvas(crop.img, crop.rot);
  const stage = $("#cropStage"), cv = $("#cropCanvas");
  const s = Math.min((stage.clientWidth - 8) / crop.src.width, (stage.clientHeight - 8) / crop.src.height, 1);
  crop.scale = s;
  cv.width = Math.round(crop.src.width * s);
  cv.height = Math.round(crop.src.height * s);
  cv.getContext("2d").drawImage(crop.src, 0, 0, cv.width, cv.height);
  crop.sel = null;
  $("#cropRect").hidden = true;
}
function ocrImage(file) {
  const img = new Image();
  img.onload = () => {
    crop = { img, rot: 0, file };
    $("#cropper").hidden = false;
    drawCrop();
  };
  img.onerror = () => dzStatus("err", "이미지를 열 수 없어요. JPG · PNG 사진인지 확인해 주세요.");
  img.src = URL.createObjectURL(file);
}
(() => {
  const cv = $("#cropCanvas"), rect = $("#cropRect");
  let start = null;
  const pt = (e) => {
    const b = cv.getBoundingClientRect();
    return { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)) };
  };
  const show = (a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
    Object.assign(rect.style, { left: cv.offsetLeft + x + "px", top: cv.offsetTop + y + "px", width: w + "px", height: h + "px" });
    rect.hidden = false;
    return { x, y, w, h };
  };
  cv.addEventListener("mousedown", (e) => { start = pt(e); e.preventDefault(); });
  window.addEventListener("mousemove", (e) => { if (start) show(start, pt(e)); });
  window.addEventListener("mouseup", (e) => {
    if (!start) return;
    const r = show(start, pt(e));
    start = null;
    if (r.w < 12 || r.h < 12) { rect.hidden = true; crop.sel = null; } else crop.sel = r;
  });
  $("#cropRotate").onclick = () => { crop.rot = (crop.rot + 90) % 360; drawCrop(); };
  $("#cropCancel").onclick = () => { $("#cropper").hidden = true; crop = null; };
  $("#cropGo").onclick = () => {
    const s = crop.scale, sel = crop.sel;
    const r = sel ? { x: sel.x / s, y: sel.y / s, w: sel.w / s, h: sel.h / s } : { x: 0, y: 0, w: crop.src.width, h: crop.src.height };
    const out = document.createElement("canvas");
    out.width = Math.round(r.w); out.height = Math.round(r.h);
    out.getContext("2d").drawImage(crop.src, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
    $("#cropper").hidden = true;
    crop = null;
    out.toBlob((blob) => {
      pendingImage = { url: out.toDataURL("image/jpeg", 0.7), file: new File([blob], "page.jpg", { type: "image/jpeg" }) };
      $("#dzThumb").innerHTML = `<img src="${pendingImage.url}" alt="">`;
      runOcr();
    }, "image/jpeg", 0.92);
  };
  window.addEventListener("resize", () => { if (crop) drawCrop(); });
})();

async function runOcr() {
  if (!pendingImage) return;
  try {
    dzStatus("ready", "글자를 읽는 중이에요…");
    busy(true, "글자 읽는 중");
    const r = await askClaude({
      prompt:
`The attached image is a photo of a page from an English book that a Korean learner is reading.
Transcribe the English text printed in this image exactly as written.
- Join lines into normal paragraphs; keep blank lines between paragraphs.
- Re-join words hyphenated across line breaks.
- Skip running headers, page numbers and footnotes.
- Do not translate, correct or summarize.
In "marked_words", list any words or phrases the reader marked by hand (underlined, circled, highlighted) exactly as they appear in the text, in reading order. Empty list if none.`,
      images: [pendingImage.file],
      schema: OCR_SCHEMA,
    });
    if (!r.text.trim()) throw new Error("사진에서 영어 글자를 찾지 못했어요. 더 밝고 반듯하게 찍어 보세요.");
    pendingImage = null;
    dzStatus();
    textInput.value = (textInput.value.trim() ? textInput.value.trim() + "\n\n" : "") + r.text.trim();
    state.text = textInput.value;
    saveSession();
    if (r.marked_words.length) {
      state.text = textInput.value.trim();
      setConfirmed(true);
      autoMark(r.marked_words);
      toast(`글자 인식 완료 · 표시한 단어 ${r.marked_words.length}개를 체크했어요`);
    } else {
      toast("글자 인식 완료 · 내용을 확인하고 [문장 확정]을 누르세요");
    }
  } catch (e) {
    dzStatus("err", esc(e.message) + "<br>다시 시도하려면 <b>[문장 확정]</b>을 누르세요.");
    toast(e.message, true);
  } finally {
    busy(false);
  }
}

function autoMark(words) {
  tokens = tokenize(state.text);
  const wIdx = tokens.map((t, i) => (t.type === "w" ? i : -1)).filter((i) => i >= 0);
  const used = new Set();
  for (const phrase of words) {
    const parts = tokenize(phrase).filter((t) => t.type === "w").map((t) => norm(t.text));
    if (!parts.length) continue;
    for (let k = 0; k + parts.length <= wIdx.length; k++) {
      if (used.has(k)) continue;
      if (parts.every((p, j) => norm(tokens[wIdx[k + j]].text) === p)) {
        addMark(wIdx[k], wIdx[k + parts.length - 1]);
        for (let j = 0; j < parts.length; j++) used.add(k + j);
        break;
      }
    }
  }
  saveSession(); renderPassage(); renderMarks();
}

/* 채점 · 해설 요청 */
const ANALYSIS_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["sentence_translation", "items"],
  properties: {
    sentence_translation: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "target", "lemma", "pos", "ipa", "verdict", "score", "verdict_comment",
          "contextual_meaning", "contextual_meaning_en", "reasoning_feedback", "en_en", "en_ko", "etymology", "usage_tip"],
        properties: {
          id: { type: "integer" },
          target: { type: "string" },
          lemma: { type: "string" },
          pos: { type: "string" },
          ipa: { type: "string" },
          verdict: { type: "string", enum: ["correct", "partial", "wrong"] },
          score: { type: "integer" },
          verdict_comment: { type: "string" },
          contextual_meaning: { type: "string" },
          contextual_meaning_en: { type: "string" },
          reasoning_feedback: {
            type: "object", additionalProperties: false,
            required: ["segments", "advice"],
            properties: {
              segments: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false,
                  required: ["quote", "judgment", "comment"],
                  properties: {
                    quote: { type: "string" },
                    judgment: { type: "string", enum: ["right", "partial", "wrong"] },
                    comment: { type: "string" },
                  },
                },
              },
              advice: { type: "string" },
            },
          },
          en_en: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["pos", "definition", "example", "used_here"],
              properties: {
                pos: { type: "string" }, definition: { type: "string" },
                example: { type: "string" }, used_here: { type: "boolean" },
              },
            },
          },
          en_ko: {
            type: "array",
            items: {
              type: "object", additionalProperties: false,
              required: ["pos", "meaning"],
              properties: { pos: { type: "string" }, meaning: { type: "string" } },
            },
          },
          etymology: {
            type: "object", additionalProperties: false,
            required: ["parts", "story", "related"],
            properties: {
              parts: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false,
                  required: ["part", "origin", "meaning"],
                  properties: { part: { type: "string" }, origin: { type: "string" }, meaning: { type: "string" } },
                },
              },
              story: { type: "string" },
              related: {
                type: "array",
                items: {
                  type: "object", additionalProperties: false,
                  required: ["word", "meaning"],
                  properties: { word: { type: "string" }, meaning: { type: "string" } },
                },
              },
            },
          },
          usage_tip: { type: "string" },
        },
      },
    },
  },
};

const ANALYSIS_SYSTEM =
`You are an English reading tutor and lexicographer for a Korean adult who reads English books in the original. The learner meets an unknown word, first guesses its meaning from context, and then asks you to check the guess. Your job is to grade the guess fairly, teach the meaning in this exact context, and coach the learner's inference skill.

Write every explanation in natural Korean, except: "en_en" definitions and examples, "contextual_meaning_en", and "ipa" are in English/IPA.

For each item:
- "target": the word or phrase as it appears. "lemma": its dictionary form (for phrasal verbs or idioms, the whole expression). "pos": part of speech in Korean (e.g. 동사, 명사, 구동사, 관용구). "ipa": American IPA of the lemma, with slashes.
- "verdict": "correct" if the guess captures the contextual sense (wording can differ), "partial" if it is on the right track but misses an important nuance, direction or part of speech, "wrong" otherwise. An empty guess is "wrong". "score": 0-100.
- "verdict_comment": one or two sentences saying why.
- "contextual_meaning": the meaning in THIS sentence, as a natural Korean gloss followed by a short explanation of how the context signals it. "contextual_meaning_en": a short English paraphrase that fits the sentence.
- "reasoning_feedback.segments": split the learner's stated reasoning into its separate claims; quote each claim verbatim (short) and judge it "right", "partial" or "wrong" with a comment explaining what in the text supports or contradicts it. If no reasoning was given, return an empty list. "advice": one concrete tip for inferring words like this next time (which context clues to notice).
- "en_en": 2-5 learner-dictionary style senses, most common first; set used_here true for exactly the sense used in this sentence. Each example is a short natural sentence (not the passage).
- "en_ko": 2-6 Korean dictionary meanings, like a 영한사전 entry.
- "etymology": split into meaningful parts (prefix/root/suffix or component words), each with its origin language (e.g. 라틴어 'specere') and meaning; "story": how the meaning developed, in Korean, 2-4 sentences; "related": 2-5 related English words sharing a part, with Korean meanings. If the origin is uncertain, say so instead of inventing.
- "usage_tip": nuance, register, common collocations, or a confusable word, in Korean.

"sentence_translation": a natural Korean translation of the whole passage, faithful to its tone. Return items in the same order and with the same ids as given.`;

// sample.json 은 모양을 검증하지 않으므로, 화면이 깨지지 않게 빈 값을 채운다
function normalizeResult(r) {
  if (!r || !Array.isArray(r.items) || !r.items.length) throw new Error("답을 읽지 못했어요. 한 번 더 눌러 주세요.");
  const arr = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (x == null ? "" : String(x));
  r.sentence_translation = str(r.sentence_translation);
  r.items = r.items.map((it, i) => ({
    id: Number(it.id) || i + 1,
    target: str(it.target), lemma: str(it.lemma || it.target), pos: str(it.pos), ipa: str(it.ipa),
    verdict: VERDICT[it.verdict] ? it.verdict : "wrong",
    score: Math.max(0, Math.min(100, Number(it.score) || 0)),
    verdict_comment: str(it.verdict_comment),
    contextual_meaning: str(it.contextual_meaning), contextual_meaning_en: str(it.contextual_meaning_en),
    reasoning_feedback: {
      segments: arr(it.reasoning_feedback?.segments).map((s) => ({ quote: str(s.quote), judgment: ["right", "partial", "wrong"].includes(s.judgment) ? s.judgment : "partial", comment: str(s.comment) })),
      advice: str(it.reasoning_feedback?.advice),
    },
    en_en: arr(it.en_en).map((d) => ({ pos: str(d.pos), definition: str(d.definition), example: str(d.example), used_here: !!d.used_here })),
    en_ko: arr(it.en_ko).map((d) => ({ pos: str(d.pos), meaning: str(d.meaning) })),
    etymology: {
      parts: arr(it.etymology?.parts).map((p) => ({ part: str(p.part), origin: str(p.origin), meaning: str(p.meaning) })),
      story: str(it.etymology?.story),
      related: arr(it.etymology?.related).map((x) => ({ word: str(x.word), meaning: str(x.meaning) })),
    },
    usage_tip: str(it.usage_tip),
  }));
  return r;
}

$("#btnAnalyze").onclick = analyze;
async function analyze() {
  if (!state.marks.length) return;
  const empty = state.marks.filter((m) => !m.guess.trim());
  if (empty.length && !armed($("#btnAnalyze"), `유추 안 적은 단어 ${empty.length}개 · 그대로 채점하려면 한 번 더`)) return;
  const items = state.marks.map((m, i) =>
`[${i + 1}] target: "${m.text}"
    learner's guess: ${m.guess.trim() || "(none)"}
    learner's reasoning: ${m.reason.trim() || "(none)"}`).join("\n");
  const prompt =
`${state.title ? `Book: ${state.title}\n` : ""}Passage:
"""
${state.text}
"""

Items (id = number in brackets):
${items}`;
  busy(true, "채점 · 해설 중");
  try {
    const r = normalizeResult(await askClaude({ prompt: ANALYSIS_SYSTEM + "\n\n" + prompt, schema: ANALYSIS_SCHEMA }));
    state.result = Object.assign(r, {
      snapshot: { text: state.text, title: state.title, marks: state.marks.map((m) => ({ ...m })) },
      at: Date.now(),
    });
    state.activeItem = 0;
    saveSession();
    renderResult();
    showView("result");
    const ok = r.items.filter((x) => x.verdict === "correct").length;
    toast(`채점 완료 · ${r.items.length}개 중 ${ok}개 정답`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy(false);
  }
}

/* ───────── 2. 단어 해설 ───────── */
function markOf(result, item, idx) {
  const marks = result.snapshot.marks;
  return marks[item.id - 1] || marks[idx] || { text: item.target, guess: "", reason: "" };
}

function highlightSource(text, marks, activeIdx) {
  const tks = tokenize(text);
  const owner = new Map();
  marks.forEach((m, i) => { for (let t = m.start; t <= m.end; t++) owner.set(t, i); });
  let out = "";
  tks.forEach((t, i) => {
    const o = owner.get(i);
    const txt = esc(t.text).replace(/\n/g, "<br>");
    if (o === activeIdx) {
      const prev = owner.get(i - 1) === o, next = owner.get(i + 1) === o;
      out += (prev ? "" : '<span class="hl">') + txt + (next ? "" : "</span>");
    } else out += txt;
  });
  return out;
}

function renderResult() {
  const r = state.result;
  $("#resultEmpty").hidden = !!r;
  $("#resultWrap").hidden = !r;
  if (!r) return;
  const idx = Math.min(state.activeItem, r.items.length - 1);
  $("#trSrc").innerHTML = highlightSource(r.snapshot.text, r.snapshot.marks, idx);
  $("#trKo").textContent = r.sentence_translation;
  $("#itemList").innerHTML = r.items.map((it, i) => `
    <button class="item-btn${i === idx ? " on" : ""}" data-i="${i}">
      <span class="stamp ${it.verdict}">${VERDICT[it.verdict].mark}</span>
      <span class="w">${esc(it.target)}</span>
    </button>`).join("");
  const it = r.items[idx];
  $("#detail").innerHTML = detailHTML(it, markOf(r, it, idx), true);
}
$("#itemList").addEventListener("click", (e) => {
  const b = e.target.closest(".item-btn");
  if (!b) return;
  state.activeItem = +b.dataset.i;
  saveSession();
  renderResult();
});

function detailHTML(it, mark, canSave) {
  const v = VERDICT[it.verdict];
  const saved = book.some((b) => b.lemma === it.lemma && b.sentence === state.result?.snapshot.text);
  const segs = it.reasoning_feedback.segments;
  const tagName = { right: "맞음", partial: "애매", wrong: "틀림" };
  const parts = it.etymology.parts;
  return `
  <div class="headword">
    <h1>${esc(it.target)}</h1>
    ${it.lemma && it.lemma.toLowerCase() !== it.target.toLowerCase() ? `<span class="lemma">← ${esc(it.lemma)}</span>` : ""}
    <span class="ipa">${esc(it.ipa)}</span>
    <span class="pos">${esc(it.pos)}</span>
    <span class="hw-actions">
      <button class="kbtn" data-say="${esc(it.lemma || it.target)}" data-rate="0.8">🔊 발음</button>
      <button class="kbtn" data-say="${esc(it.lemma || it.target)}" data-rate="0.5">🐢 천천히</button>
      ${canSave ? `<button class="kbtn primary" data-save="${esc(it.id)}"${saved ? " disabled" : ""}>${saved ? "★ 저장됨" : "☆ 단어장 저장"}</button>` : ""}
    </span>
  </div>

  <div class="dgrid">
    <div class="win sec">
      <div class="win-title"><span>① 유추 판정</span></div>
      <div class="win-body">
        <div class="verdict">
          <div class="big-stamp ${it.verdict}">${v.label.replace("\n", "<br>")}</div>
          <div>
            <div class="score">${it.score}<small> / 100</small></div>
            <div>${esc(it.verdict_comment)}</div>
          </div>
        </div>
        <div class="mine">
          <div><span class="lbl">내 유추</span>${esc(mark.guess) || '<span class="dim">(적지 않음)</span>'}</div>
          <div><span class="lbl">유추 사유</span>${esc(mark.reason) || '<span class="dim">(적지 않음)</span>'}</div>
        </div>
      </div>
    </div>

    <div class="win sec">
      <div class="win-title"><span>② 문맥상 의미</span></div>
      <div class="win-body">
        <div class="ctx-ko">${esc(it.contextual_meaning)}</div>
        <div class="ctx-en">= ${esc(it.contextual_meaning_en)}</div>
        ${it.usage_tip ? `<div class="tip">💡 ${esc(it.usage_tip)}</div>` : ""}
      </div>
    </div>

    <div class="win sec full">
      <div class="win-title"><span>③ 유추 사유 첨삭</span></div>
      <div class="win-body">
        ${segs.length ? segs.map((s) => `
          <div class="seg ${s.judgment}">
            <q><span class="tag">${tagName[s.judgment]}</span>${esc(s.quote)}</q>
            ${esc(s.comment)}
          </div>`).join("") : '<div class="dim">유추 사유를 적지 않아서 첨삭할 내용이 없어요. 다음엔 "왜 그렇게 생각했는지"도 적어 보세요.</div>'}
        <div class="advice">🧭 다음에 써먹을 유추 요령 — ${esc(it.reasoning_feedback.advice)}</div>
      </div>
    </div>

    <div class="win sec">
      <div class="win-title"><span>④ 영영사전</span></div>
      <div class="win-body">
        <ol class="defs">${it.en_en.map((d) => `
          <li class="${d.used_here ? "used" : ""}"><span class="p">${esc(d.pos)}</span>${esc(d.definition)}
            <span class="ex">${esc(d.example)}</span></li>`).join("")}
        </ol>
      </div>
    </div>

    <div class="win sec">
      <div class="win-title"><span>⑤ 영한사전</span></div>
      <div class="win-body">
        <ol class="defs">${it.en_ko.map((d) => `<li><span class="p">${esc(d.pos)}</span>${esc(d.meaning)}</li>`).join("")}</ol>
      </div>
    </div>

    <div class="win sec full">
      <div class="win-title"><span>⑥ 어원</span></div>
      <div class="win-body">
        <div class="ety-parts">${parts.map((p, i) => `
          ${i ? '<span class="ety-plus">+</span>' : ""}
          <div class="ety-part"><b>${esc(p.part)}</b><small>${esc(p.origin)}</small><span>${esc(p.meaning)}</span></div>`).join("")}
        </div>
        <div>${esc(it.etymology.story)}</div>
        ${it.etymology.related.length ? `<div class="related">${it.etymology.related.map((x) => `<span><b>${esc(x.word)}</b> ${esc(x.meaning)}</span>`).join("")}</div>` : ""}
      </div>
    </div>
  </div>`;
}

function onDetailClick(e) {
  const say = e.target.closest("[data-say]");
  if (say) return speak(say.dataset.say, +say.dataset.rate);
  const sv = e.target.closest("[data-save]");
  if (sv) {
    const r = state.result;
    const idx = r.items.findIndex((x) => String(x.id) === sv.dataset.save);
    if (saveItem(r, idx)) { toast("단어장에 저장했어요"); renderResult(); }
  }
}
$("#detail").addEventListener("click", onDetailClick);
$("#bookDetail").addEventListener("click", onDetailClick);

function saveItem(r, idx) {
  const it = r.items[idx];
  if (book.some((b) => b.lemma === it.lemma && b.sentence === r.snapshot.text)) return false;
  const m = markOf(r, it, idx);
  book.unshift({
    id: Date.now() + "-" + idx,
    savedAt: Date.now(),
    lemma: it.lemma, target: it.target,
    sentence: r.snapshot.text, title: r.snapshot.title,
    translation: r.sentence_translation,
    mark: { text: m.text, guess: m.guess, reason: m.reason, start: m.start, end: m.end },
    item: it,
  });
  saveBook();
  return true;
}
$("#btnSaveAll").onclick = () => {
  const r = state.result;
  const n = r.items.reduce((c, _, i) => c + (saveItem(r, i) ? 1 : 0), 0);
  toast(n ? `${n}개를 단어장에 저장했어요` : "이미 모두 저장되어 있어요");
  renderResult();
};
$("#btnSpeakAll").onclick = () => speak(state.result.snapshot.text, +$("#rate").value);

/* ───────── 음성 (TTS) ───────── */
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  const score = (v) => (/natural|online/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 3 : 0) + (v.lang === "en-US" ? 2 : 0);
  voices.sort((a, b) => score(b) - score(a));
  const sel = $("#voiceSel");
  const keep = store.get("lexion.voice", "");
  sel.innerHTML = voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name.replace(/^Microsoft /, ""))} (${v.lang})</option>`).join("");
  if (voices.some((v) => v.name === keep)) sel.value = keep;
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}
$("#voiceSel").onchange = (e) => store.set("lexion.voice", e.target.value);
const rateEl = $("#rate");
rateEl.value = store.get("lexion.rate", 0.9);
const showRate = () => ($("#rateVal").textContent = Number(rateEl.value).toFixed(2) + "x");
showRate();
rateEl.oninput = () => { showRate(); store.set("lexion.rate", +rateEl.value); };

function speak(text, rate = 0.9, onBoundary, onEnd) {
  if (!("speechSynthesis" in window)) return toast("이 브라우저는 음성 출력을 지원하지 않아요", true);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voices.find((x) => x.name === $("#voiceSel").value) || voices[0];
  if (v) u.voice = v;
  u.lang = v?.lang || "en-US";
  u.rate = rate;
  if (onBoundary) u.onboundary = onBoundary;
  u.onend = u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}

/* ───────── 3. 발음 (듣기 + AI 발음 포인트) ───────── */
const pronInput = $("#pronInput");
let pronTokens = [];
let coachWords = new Set();   // 주의할 단어 (밑줄)

function pronText() { return state.pronText || state.text || ""; }

function renderPronTarget() {
  pronTokens = tokenize(pronText());
  const el = $("#pronTarget");
  if (!pronTokens.length) {
    el.innerHTML = '<span class="dim">연습할 문장이 없어요. [원문 가져오기]나 [✎ 편집]으로 넣어 주세요.</span>';
    return;
  }
  el.innerHTML = pronTokens.map((t, i) => {
    if (t.type !== "w") return esc(t.text).replace(/\n/g, "<br>");
    return `<span class="w${coachWords.has(norm(t.text)) ? " sub" : ""}" data-i="${i}">${esc(t.text)}</span>`;
  }).join("");
}

function resetCoach() {
  coachWords = new Set();
  $("#coach").innerHTML = '<div class="empty">[AI 발음 포인트 받기]를 누르면<br>주의할 단어와 읽는 요령을 알려 드려요.</div>';
}

$("#pronTarget").addEventListener("click", (e) => {
  const w = e.target.closest(".w");
  if (w) speak(w.textContent, 0.6);
});
$("#btnPronFromInput").onclick = () => {
  state.pronText = state.text; saveSession();
  pronInput.hidden = true; $("#pronTarget").hidden = false;
  resetCoach(); renderPronTarget();
};
$("#btnPronEdit").onclick = () => {
  if (pronInput.hidden) {
    pronInput.value = pronText();
    pronInput.hidden = false; $("#pronTarget").hidden = true;
    $("#btnPronEdit").textContent = "✔ 완료";
    pronInput.focus();
  } else {
    state.pronText = pronInput.value.trim(); saveSession();
    pronInput.hidden = true; $("#pronTarget").hidden = false;
    $("#btnPronEdit").textContent = "✎ 편집";
    resetCoach(); renderPronTarget();
  }
};

function listen() {
  const text = pronText();
  if (!text) return toast("연습할 문장이 없어요", true);
  if (state.view !== "pron") showView("pron");
  const words = $$("#pronTarget .w");
  speak(text, +rateEl.value, (ev) => {
    if (ev.name && ev.name !== "word") return;
    words.forEach((w) => {
      const t = pronTokens[+w.dataset.i];
      const on = ev.charIndex >= t.start && ev.charIndex < t.start + t.text.length;
      w.classList.toggle("speaking", on);
      if (on) w.scrollIntoView({ block: "nearest" });   // 긴 문장은 읽는 곳을 따라 내려간다
    });
  }, () => words.forEach((w) => w.classList.remove("speaking")));
}
$("#btnListen").onclick = listen;
function stopAll() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $$("#pronTarget .w.speaking").forEach((w) => w.classList.remove("speaking"));
}
$("#btnStop").onclick = stopAll;

const COACH_SCHEMA = {
  type: "object",
  properties: {
    overall: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" }, ipa: { type: "string" },
          problem: { type: "string" }, tip: { type: "string" }, korean_hint: { type: "string" },
        },
      },
    },
    rhythm_tips: { type: "array", items: { type: "string" } },
  },
};
const COACH_PROMPT =
`You are a pronunciation coach for a Korean adult learning American English. The learner is about to read the sentence below aloud. Point out the 3-6 words in it that Korean speakers most often mispronounce (L/R, V/B, F/P, TH, Z/J, short vs long vowels, final consonants, -ed/-s endings, consonant clusters, word stress), and how to read the sentence naturally.

Write in Korean. For each issue: "word" (exactly as it appears in the sentence), "ipa" (American IPA), "problem" (the typical mistake Korean speakers make on it), "tip" (concrete tongue/lip/stress instructions), "korean_hint" (an approximate Hangul reading with the stressed syllable in capitals, e.g. "브-RAY-크"). "overall": one or two sentences about the sentence's overall rhythm. "rhythm_tips": 1-3 tips about stress, linking (연음), reductions and intonation for this specific sentence, quoting the words involved.`;

async function coach() {
  const text = pronText();
  if (!text) return toast("연습할 문장이 없어요", true);
  if (state.view !== "pron") showView("pron");
  busy(true, "발음 포인트 찾는 중");
  try {
    const r = await askClaude({ prompt: `${COACH_PROMPT}\n\nSentence:\n${text.slice(0, 3000)}`, schema: COACH_SCHEMA });
    const issues = Array.isArray(r?.issues) ? r.issues : [];
    coachWords = new Set(issues.map((x) => norm(String(x.word || ""))));
    renderPronTarget();
    renderCoach({ overall: String(r?.overall || ""), issues, rhythm_tips: Array.isArray(r?.rhythm_tips) ? r.rhythm_tips : [] });
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy(false);
  }
}
$("#btnCoach").onclick = coach;

function renderCoach(r) {
  $("#coach").innerHTML = `
    <div class="coach-sum"><div>${esc(r.overall)}</div></div>
    ${r.issues.map((x) => `
      <div class="issue">
        <div class="issue-head"><b>${esc(x.word)}</b><span class="ipa">${esc(x.ipa)}</span>
          <button data-say="${esc(x.word)}" data-rate="0.85">🔊</button><button data-say="${esc(x.word)}" data-rate="0.5">🐢</button></div>
        <div class="issue-body">
          <div><b>흔한 실수</b> ${esc(x.problem)}</div>
          <div><b>교정</b> ${esc(x.tip)}</div>
          <div class="kh">한글 근사 발음: ${esc(x.korean_hint)}</div>
        </div>
      </div>`).join("")}
    ${r.rhythm_tips.length ? `<div class="win" style="margin-top:6px"><div class="win-title"><span>리듬 · 연음 · 억양</span></div>
      <div class="win-body"><ul class="tips">${r.rhythm_tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <div class="row-end" style="margin-top:8px"><button class="kbtn" data-say-all>▶ 문장 다시 듣기</button></div></div></div>` : ""}`;
}
$("#coach").addEventListener("click", (e) => {
  const b = e.target.closest("[data-say]");
  if (b) speak(b.dataset.say, +b.dataset.rate);
  if (e.target.closest("[data-say-all]")) listen();
});

/* ───────── 4. 단어장 ───────── */
let bookSel = null;
function renderBook() {
  const q = $("#bookSearch").value.trim().toLowerCase();
  const list = book.filter((b) => !q || [b.lemma, b.target, b.sentence, b.item.contextual_meaning].join(" ").toLowerCase().includes(q));
  $("#bookCount").textContent = `${book.length}개`;
  $("#bookList").innerHTML = list.length ? list.map((b) => `
    <button class="book-item${b.id === bookSel ? " on" : ""}" data-id="${esc(b.id)}">
      <div class="bw"><span class="stamp ${b.item.verdict}">${VERDICT[b.item.verdict].mark}</span>${esc(b.target)}</div>
      <div class="bm">${esc(b.item.contextual_meaning.split(/[.。\n(]/)[0].slice(0, 40))}</div>
    </button>`).join("") : '<div class="empty">저장된 단어가 없어요.</div>';
  const cur = book.find((b) => b.id === bookSel);
  $("#bookDetail").innerHTML = cur ? `
    ${detailHTML(cur.item, cur.mark, false)}
    <div class="win book-src">
      <div class="win-title"><span>출처 문장${cur.title ? " · " + esc(cur.title) : ""}</span>
        <span class="win-actions"><button class="kbtn" data-del="${esc(cur.id)}">삭제</button></span></div>
      <div class="win-body"><div class="tr-src">${highlightSource(cur.sentence, [cur.mark], 0)}</div>
        <div class="tr-ko">${esc(cur.translation)}</div>
        <div class="dim" style="margin-top:6px">${new Date(cur.savedAt).toLocaleString("ko-KR")} 저장</div></div>
    </div>` : '<div class="empty big-empty">왼쪽에서 단어를 고르세요.</div>';
}
$("#bookSearch").oninput = renderBook;
$("#bookList").addEventListener("click", (e) => {
  const b = e.target.closest(".book-item");
  if (b) { bookSel = b.dataset.id; renderBook(); }
});
$("#bookDetail").addEventListener("click", (e) => {
  const d = e.target.closest("[data-del]");
  if (d && armed(d, "한 번 더 누르면 삭제")) {
    book = book.filter((b) => b.id !== d.dataset.del);
    bookSel = null; saveBook(); renderBook();
  }
});

/* ───────── 5. 설정 ───────── */
$("#tierSel").onchange = (e) => {
  settings.tier = e.target.value;
  store.set("lexion.settings", settings);
  updateModel();
  toast(`해설 품질: ${TIER_LABEL[settings.tier]}`);
};

// 파일 저장은 claude.ai 의 다운로드 확인 창을 거친다
let downloadsPromise = null;
async function download(filename, text) {
  downloadsPromise ||= (window.claude?.use ? window.claude.use("downloads") : Promise.resolve(null)).catch(() => null);
  const dl = await downloadsPromise;
  if (!dl) return toast("이 화면에서는 파일을 저장할 수 없어요", true);
  try {
    await dl.save({ filename, data: text });
    toast("파일을 저장했어요");
  } catch (e) {
    if (e?.code !== "declined") toast("파일을 저장하지 못했어요", true);
  }
}
$("#btnExport").onclick = () => {
  const cell = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["단어", "기본형", "품사", "발음기호", "판정", "점수", "내 유추", "유추 사유", "문맥상 의미", "영한", "출처 문장", "해석", "책", "저장일"]];
  book.forEach((b) => rows.push([b.target, b.lemma, b.item.pos, b.item.ipa, VERDICT[b.item.verdict].label.replace("\n", ""), b.item.score,
    b.mark.guess, b.mark.reason, b.item.contextual_meaning, b.item.en_ko.map((x) => x.meaning).join(" / "),
    b.sentence, b.translation, b.title, new Date(b.savedAt).toLocaleDateString("ko-KR")]));
  download(`단어장_${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"));
};
$("#btnBackup").onclick = () => download(`yeongdong_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ book }, null, 1));
$("#btnRestore").onclick = () => $("#restoreFile").click();
$("#restoreFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const ids = new Set(book.map((b) => b.id));
    const add = (data.book || []).filter((b) => !ids.has(b.id));
    book = [...add, ...book].sort((a, b) => b.savedAt - a.savedAt);
    saveBook();
    toast(`${add.length}개를 복원했어요`);
  } catch {
    toast("백업 파일을 읽을 수 없어요", true);
  }
  e.target.value = "";
};

/* ───────── 탭 · 단축키 ───────── */
$$("#tabs button").forEach((b) => (b.onclick = () => showView(b.dataset.view)));

document.addEventListener("keydown", (e) => {
  if (e.altKey && /^[1-5]$/.test(e.key)) {
    e.preventDefault();
    showView(["input", "result", "pron", "book", "settings"][+e.key - 1]);
  } else if (e.altKey && e.key.toLowerCase() === "l") { e.preventDefault(); listen(); }
  else if (e.key === "Escape" && $("#cropper").hidden) stopAll();
  else if (e.ctrlKey && e.key === "Enter" && state.view === "input" && state.marks.length) { e.preventDefault(); analyze(); }
});

/* ───────── 글자 크기 (원문 · 따라 읽을 문장 따로) ───────── */
const fontSizes = Object.assign({ passage: 23, pron: 26 }, store.get("lexion.fontsize", {}));
// 예전에 저장한 크기가 범위(5~40)를 벗어나면 맞춘다
for (const k in fontSizes) fontSizes[k] = Math.max(5, Math.min(40, +fontSizes[k] || 23));
function applyFontSizes() {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(fontSizes)) {
    root.setProperty(`--fs-${k}`, v + "px");
    root.setProperty(`--fs-${k}-edit`, Math.round(v * 0.8) + "px");   // 편집칸은 조금 작게
    const ctl = $(`.fs-ctl[data-fs="${k}"]`);
    if (!ctl) continue;
    ctl.querySelector("input").value = v;
    ctl.querySelector(".fs-val").textContent = v + "px";
  }
}
$$(".fs-ctl").forEach((ctl) => ctl.querySelector("input").addEventListener("input", (e) => {
  fontSizes[ctl.dataset.fs] = +e.target.value;
  store.set("lexion.fontsize", fontSizes);
  applyFontSizes();
}));
applyFontSizes();

/* ───────── 시작 ───────── */
updateCount();
updateModel();
setConfirmed(state.confirmed && !!state.text);
renderResult();

