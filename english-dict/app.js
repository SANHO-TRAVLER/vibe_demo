/* ───────── YEONGDONG 전자사전 · 내 컴퓨터 버전 (무료 도구만 사용) ───────── */
"use strict";

const VIEW_LABEL = { input: "문장 입력", result: "단어 해설", pron: "발음 교정", book: "단어장", settings: "설정" };
const VERDICT = {
  correct: { mark: "O", label: "맞았다" },
  partial: { mark: "△", label: "비슷\n했다" },
  wrong:   { mark: "X", label: "틀렸다" },
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ───────── 저장소 ───────── */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const state = Object.assign({
  text: "", title: "", confirmed: false,
  marks: [],        // {id, start, end, text, guess, reason}
  result: null,     // {translation, items:[...], snapshot}
  activeItem: 0,
  pronText: "",
}, store.get("lexion.session", {}));
if (state.result && !Array.isArray(state.result.items)) state.result = null;
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
function busy(on, text = "찾는 중") {
  $("#busy").hidden = !on;
  $("#busyText").textContent = text;
  $("#led").classList.toggle("busy", on);
}
function updateCount() { $("#sbCount").textContent = `단어장 ${book.length}`; }

function showView(v) {
  $$(".view").forEach((el) => el.classList.toggle("on", el.id === "view-" + v));
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $$(".key.f").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  $("#sbMode").textContent = VIEW_LABEL[v];
  state.view = v;
  if (v === "pron") renderPronTarget();
  if (v === "book") renderBook();
  if (v === "settings") renderToolStatus();
  const hints = {
    input: state.confirmed ? "단어를 클릭(구는 드래그)해서 체크하고, 오른쪽에 유추한 뜻과 이유를 적으세요" : "문장을 입력하거나 책 사진을 넣고 [문장 확정]을 누르세요",
    result: "영영사전에서 이 문장에 맞는 뜻을 고르고, 내 유추가 맞았는지 직접 판정하세요",
    pron: "▶ 원어민 듣기로 먼저 들어 보고, ● 녹음으로 따라 읽어 보세요",
    book: "저장한 단어를 다시 복습할 수 있어요",
    settings: "이 버전은 API 키 없이 무료 도구만 사용해요",
  };
  hint(hints[v]);
}

setInterval(() => {
  const d = new Date();
  $("#sbClock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}, 1000);

/* ───────── 무료 도구: 네트워크 ───────── */
const cache = new Map();
async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const p = fetch(url, { signal: AbortSignal.timeout(10000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(url, p);
  const v = await p;
  if (v === null) cache.delete(url);
  return v;
}
const stripHtml = (h) => { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent.replace(/\s+/g, " ").trim(); };

/* Wiktionary REST: 뜻 + 원형 찾기 */
async function wiktDefs(word) {
  const j = await getJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
  return j?.en || null;
}
async function findLemma(word) {
  const defs = await wiktDefs(word);
  if (!defs) return null;
  // 활용형(과거·복수·분사 등)이면 원형으로. clipping·alternative 같은 다른 form-of 는 그 뜻만 있을 때만 따라간다
  let other = null;
  for (const sec of defs) {
    for (const d of sec.definitions || []) {
      if (!/form-of-definition/.test(d.definition || "")) continue;
      const div = document.createElement("div");
      div.innerHTML = d.definition;
      const a = div.querySelector(".form-of-definition-link a");
      const t = a?.getAttribute("title");
      if (!t || t.includes(":")) continue;
      if (/past|plural|participle|present|third-person|comparative|superlative|inflection/i.test(div.textContent)) return t;
      other ||= t;
    }
  }
  const allFormOf = defs.every((sec) => (sec.definitions || []).every((d) => /form-of-definition/.test(d.definition || "")));
  return allFormOf && other ? other : word;
}

/* Free Dictionary: 영영 뜻 · 발음기호 · 원어민 녹음 */
async function freeDict(word) {
  const j = await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!Array.isArray(j)) return null;
  const phon = j.flatMap((e) => e.phonetics || []);
  const audio = (phon.find((p) => /-us\.mp3$/.test(p.audio || "")) || phon.find((p) => p.audio) || {}).audio || "";
  const ipa = j.find((e) => e.phonetic)?.phonetic || phon.find((p) => p.text)?.text || "";
  const senses = [];
  for (const e of j) for (const m of e.meanings || []) {
    for (const d of (m.definitions || []).slice(0, 3)) senses.push({ pos: m.partOfSpeech, definition: d.definition, example: d.example || "" });
  }
  return { ipa, audio, senses: senses.slice(0, 7) };
}

/* Wiktionary 위키텍스트 */
async function wikitext(host, page) {
  const j = await getJSON(`https://${host}/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*`);
  return j?.parse?.wikitext || "";
}
function section(text, re) {
  const m = text.match(re);
  if (!m) return "";
  const level = m[1].length;
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(new RegExp(`\\n={1,${level}}[^=]`));
  return end < 0 ? rest : rest.slice(0, end);
}

const LANG = {
  en: "영어", enm: "중세 영어", ang: "고대 영어", "en-early": "초기 근대 영어",
  la: "라틴어", "la-lat": "후기 라틴어", "la-med": "중세 라틴어", "la-vul": "통속 라틴어", "la-new": "근대 라틴어", LL: "후기 라틴어", ML: "중세 라틴어", VL: "통속 라틴어", NL: "근대 라틴어",
  fro: "고대 프랑스어", frm: "중세 프랑스어", fr: "프랑스어", xno: "앵글로노르만어", "roa-onf": "고대 노르만 프랑스어",
  grc: "고대 그리스어", "grc-koi": "코이네 그리스어", el: "그리스어",
  non: "고대 노르드어", "gem-pro": "게르만 조어", "gmw-pro": "서게르만 조어", "ine-pro": "인도유럽 조어", "itc-pro": "이탈리아 조어",
  dum: "중세 네덜란드어", nl: "네덜란드어", odt: "고대 네덜란드어", gml: "중세 저지 독일어", goh: "고대 고지 독일어", de: "독일어", gmh: "중세 고지 독일어",
  it: "이탈리아어", es: "스페인어", pt: "포르투갈어", ar: "아랍어", fa: "페르시아어", sa: "산스크리트어", hi: "힌디어", ja: "일본어", zh: "중국어",
  "sga": "고대 아일랜드어", ga: "아일랜드어", cy: "웨일스어", gd: "스코틀랜드 게일어", ofs: "고대 프리지아어", osx: "고대 색슨어", got: "고트어",
};
const langName = (c) => LANG[c] || c || "";

// 위키텍스트 → 읽을 수 있는 글 + 어원 사슬 · 구성 요소
function renderWiki(src) {
  const chain = [], parts = [];
  let s = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<ref[^>]*\/>/g, "").replace(/<ref[\s\S]*?<\/ref>/g, "");
  const tmpl = (inner) => {
    const raw = inner.split("|").map((x) => x.trim());
    const name = raw[0].toLowerCase();
    const pos = raw.slice(1).filter((x) => !/^[\w-]+=/.test(x));
    const named = Object.fromEntries(raw.slice(1).filter((x) => /^[\w-]+=/.test(x)).map((x) => [x.split("=")[0], x.slice(x.indexOf("=") + 1)]));
    const gloss = named.t || named.gloss || "";
    const g = (x) => (x ? ` ("${x}")` : "");
    if (/^(inh|inh\+|der|der\+|bor|bor\+|lbor|uder|ubor|slbor|obor|cal|calque|lbor\+|psm|sl)$/.test(name)) {
      const term = pos[3] || pos[2] || "";
      const gl = gloss || pos[4] || "";
      chain.push({ lang: langName(pos[1]), term, gloss: gl });
      return `${langName(pos[1])} ${term}${g(gl)}`.trim();
    }
    if (/^(m|l|mention|ll|m\+)$/.test(name)) return `${pos[2] || pos[1] || ""}${g(gloss || pos[3])}`;
    if (/^(cog|noncog|ncog|cognate)$/.test(name)) return `${langName(pos[0])} ${pos[2] || pos[1] || ""}`.trim();
    if (/^(af|affix|prefix|pre|suffix|suf|compound|com|confix|con)$/.test(name)) {
      const terms = pos.slice(1).filter(Boolean);
      const shown = terms.map((t, i) => {
        if (/^(prefix|pre)$/.test(name) && i === 0 && !t.endsWith("-")) return t + "-";
        if (/^(suffix|suf)$/.test(name) && i === terms.length - 1 && !t.startsWith("-")) return "-" + t;
        return t;
      });
      shown.forEach((t, i) => parts.push({ part: t, gloss: named[`t${i + 1}`] || named[`gloss${i + 1}`] || "" }));
      return shown.join(" + ");
    }
    if (name === "etyl") return langName(pos[0]);
    if (name === "gloss") return `("${pos[0] || ""}")`;
    if (name === "w" || name === "glossary") return pos[1] || pos[0] || "";
    if (name === "onomatopoeic" || name === "onom") return "의성어";
    if (name === "back-formation" || name === "bf") return `${pos[2] || ""}에서 역성(back-formation)`;
    if (name === "clipping" || name === "clip") return `${pos[1] || ""}의 줄임말`;
    if (name === "blend") return pos.slice(1).join(" + ") + " 의 혼성어";
    if (name === "doublet" || name === "dbt") return "같은 뿌리의 다른 낱말: " + pos.slice(1).join(", ");
    return "";
  };
  for (let i = 0; i < 6 && /\{\{/.test(s); i++) s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => tmpl(inner));
  s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''?/g, "").replace(/<[^>]+>/g, "");
  s = s.split("\n").map((l) => l.replace(/^[*#:]+\s*/, "")).filter((l) => l.trim()).join(" ");
  return { text: s.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim(), chain, parts };
}

async function etymologyOf(lemma) {
  const wt = await wikitext("en.wiktionary.org", lemma);
  const en = section(wt, /(?:^|\n)(==)English==/);
  const ety = section(en, /(?:^|\n)(===)Etymology(?: 1)?===/) || section(en, /(?:^|\n)(====)Etymology(?: 1)?====/);
  const r = ety ? renderWiki(ety) : { text: "", chain: [], parts: [] };
  // 같은 계열 외국어 낱말 나열(Cognate with …)은 학습에 도움이 안 돼서 뺀다
  r.text = r.text.split(/\s(?:Cognate with|Compare|Doublet of)\b/)[0].replace(/\bFrom\b/g, "←").replace(/,? from\b/g, " ←").trim();
  return { ...r, text: r.text.slice(0, 700), source: `https://en.wiktionary.org/wiki/${encodeURIComponent(lemma)}#Etymology`, english: en };
}

// 영한: 영어 위키낱말사전의 번역표(한국어 줄) + 한국어 위키낱말사전 뜻풀이
async function koreanOf(lemma, englishSection) {
  const out = [];
  const ko = await wikitext("ko.wiktionary.org", lemma);
  const koSec = section(ko, /(?:^|\n)(==)\s*영어\s*==/);
  koSec.split("\n").filter((l) => /^#[^:*]/.test(l)).slice(0, 5).forEach((l) => {
    const t = renderWiki(l).text;
    if (t && /[가-힣]/.test(t)) out.push({ pos: "", meaning: t });
  });
  let trans = englishSection || "";
  if (/\{\{(see translation subpage|trans-see)/.test(trans) || !/\{\{trans-top/.test(trans)) {
    const sub = await wikitext("en.wiktionary.org", lemma + "/translations");
    if (sub) trans += "\n" + sub;
  }
  const blocks = trans.split(/\{\{trans-top/).slice(1);
  for (const b of blocks) {
    const gloss = (b.match(/^\|([^}|]*)/) || [])[1] || "";
    const line = b.split("{{trans-bottom}}")[0].split("\n").find((l) => /^\*\s*Korean\s*:/.test(l));
    if (!line) continue;
    const words = [...line.matchAll(/\{\{t\+?\|ko\|([^|}]+)/g)].map((m) => m[1].trim());
    if (words.length) out.push({ pos: gloss.trim(), meaning: [...new Set(words)].join(", ") });
    if (out.length >= 8) break;
  }
  return out;
}

/* 번역: Chrome 내장 번역기(내 컴퓨터에서 처리) → 없으면 MyMemory */
// 내장 번역기가 응답하지 않는 환경도 있어서 시간 제한을 둔다 (한 번 실패하면 이번 세션은 MyMemory)
const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
let translator = null;   // null: 아직 모름, false: 못 씀
async function onDeviceTranslator() {
  if (translator !== null) return translator;
  if (!("Translator" in self)) return (translator = false);
  try {
    const av = await within(Translator.availability({ sourceLanguage: "en", targetLanguage: "ko" }), 3000);
    if (av === "unavailable") return (translator = false);
    translator = await within(Translator.create({ sourceLanguage: "en", targetLanguage: "ko" }), 60000);
  } catch { translator = false; }
  return translator;
}
async function translateKo(text, allowOnline = true) {
  if (!text.trim()) return "";
  const t = await onDeviceTranslator();
  if (t) { try { return await within(t.translate(text), 15000); } catch {} }
  if (!allowOnline) return "";
  const chunks = text.match(/[^.!?]+[.!?]*["”’']?\s*/g) || [text];
  const out = [];
  let buf = "";
  for (const c of chunks) {
    if ((buf + c).length > 450) { out.push(buf); buf = ""; }
    buf += c;
  }
  if (buf) out.push(buf);
  const res = [];
  for (const q of out.slice(0, 4)) {
    const j = await getJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q.trim())}&langpair=en|ko`);
    res.push(j?.responseData?.translatedText || "");
  }
  return res.join(" ").trim();
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
$("#btnClearText").onclick = () => {
  if ((state.text || state.marks.length) && !confirm("원문과 체크한 단어를 모두 지울까요?")) return;
  state.text = ""; state.marks = []; textInput.value = "";
  pendingImage = null;
  $("#dzThumb").innerHTML = "";
  dzStatus();
  showOcrCheck([]);
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

/* 이미지 → 글자 인식 (Tesseract, 내 컴퓨터에서 처리) */
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

let pendingImage = null;   // 아직 글자를 못 읽은 사진 {url, canvas, block}
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
    pendingImage = { url: out.toDataURL("image/jpeg", 0.7), canvas: out, block: !!sel };
    $("#dzThumb").innerHTML = `<img src="${pendingImage.url}" alt="">`;
    $("#cropper").hidden = true;
    crop = null;
    runOcr();
  };
  window.addEventListener("resize", () => { if (crop) drawCrop(); });
})();

/* 인식 전 손질: 글자 크기 키우기 + 그림자에 강한 적응형 흑백 처리 */
function scaledForOcr(src) {
  let k = 1;
  if (src.width < 1600) k = Math.min(3, 1600 / src.width);
  k = Math.min(k, 3200 / src.width, 4200 / src.height);
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function grayscale(src) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = ((d[i] - lo) / span) * 255; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(im, 0, 0);
  return c;
}
// Bradley 적응형 이진화: 주변 평균보다 15% 어두우면 글자
function binarize(src) {
  const w = src.width, h = src.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  const I = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[(y * w + x) * 4];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const half = Math.max(8, Math.floor(w / 32));
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half), y2 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half), x2 = Math.min(w - 1, x + half);
      const n = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = I[(y2 + 1) * (w + 1) + x2 + 1] - I[y1 * (w + 1) + x2 + 1] - I[(y2 + 1) * (w + 1) + x1] + I[y1 * (w + 1) + x1];
      const v = d[(y * w + x) * 4] * n <= sum * 0.85 ? 0 : 255;
      const p = (y * w + x) * 4;
      d[p] = d[p + 1] = d[p + 2] = v;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}

// 책 사진 글자 정리: 줄 끝 하이픈 잇기, 줄을 문단으로, 합자·세로줄 고치기
function cleanOcr(text) {
  return text
    .replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff")
    .replace(/(^|\s)\|(?=\s)/g, "$1I")
    .replace(/(\w)[-‐]\n(\w)/g, "$1$2")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((p) => p && !/^\d+$/.test(p) && /[A-Za-z]{2,}/.test(p))
    .join("\n\n");
}

let ocrWorker = null, ocrProgress = null;
function getOcrWorker() {
  ocrWorker ||= Tesseract.createWorker("eng", 1, { logger: (m) => ocrProgress?.(m) });
  return ocrWorker;
}

async function runOcr() {
  if (!pendingImage) return;
  if (!window.Tesseract) {
    return dzStatus("err", "글자 인식 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.");
  }
  try {
    dzStatus("ready", "글자를 읽는 중이에요… (처음 한 번은 인식 데이터를 받느라 조금 걸려요)");
    busy(true, "글자 읽는 중");
    const big = grayscale(scaledForOcr(pendingImage.canvas));
    const worker = await getOcrWorker();
    await worker.setParameters({ tessedit_pageseg_mode: pendingImage.block ? "6" : "3", preserve_interword_spaces: "1" });
    const read = async (canvas, label) => {
      ocrProgress = (m) => { if (m.status === "recognizing text") $("#busyText").textContent = `${label} ${Math.round(m.progress * 100)}%`; };
      return (await worker.recognize(canvas)).data;
    };
    // 그림자 제거본과 흑백본 중 확신도가 높은 쪽을 쓴다
    let data = await read(binarize(big), "글자 읽는 중");
    if (data.confidence < 85) {
      const alt = await read(big, "한 번 더 확인 중");
      if (alt.confidence > data.confidence) data = alt;
    }
    ocrProgress = null;
    const text = cleanOcr(data.text || "");
    if (!text) throw new Error("사진에서 영어 글자를 찾지 못했어요. 읽을 부분만 선택하거나 더 밝게 찍어 보세요.");
    pendingImage = null;
    dzStatus();
    textInput.value = (textInput.value.trim() ? textInput.value.trim() + "\n\n" : "") + text;
    state.text = textInput.value;
    saveSession();
    const unsure = [...new Set((data.words || []).filter((w) => w.confidence < 75 && /[A-Za-z]{2,}/.test(w.text)).map((w) => w.text.replace(/^[^\w]+|[^\w]+$/g, "")))].filter(Boolean);
    showOcrCheck(unsure);
    toast(unsure.length ? `글자 인식 완료 · 불확실한 단어 ${unsure.length}개를 확인해 주세요` : "글자 인식 완료 · 내용을 확인하고 [문장 확정]을 누르세요");
  } catch (e) {
    dzStatus("err", esc(e.message || "글자를 읽지 못했어요.") + "<br>다시 시도하려면 <b>[문장 확정]</b>을 누르세요.");
    toast(e.message || "글자를 읽지 못했어요", true);
  } finally {
    ocrProgress = null;
    busy(false);
  }
}

// 확신도가 낮은 단어: 누르면 입력칸에서 그 단어를 골라 바로 고칠 수 있게
function showOcrCheck(words) {
  const el = $("#ocrCheck");
  el.hidden = !words.length;
  el.innerHTML = words.length ? `<span>인식이 불확실한 단어 · 눌러서 확인하세요</span>${words.map((w) => `<button class="chip" data-w="${esc(w)}">${esc(w)}</button>`).join("")}` : "";
}
$("#ocrCheck").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  const i = textInput.value.indexOf(b.dataset.w);
  if (i < 0) { b.remove(); return; }
  textInput.focus();
  textInput.setSelectionRange(i, i + b.dataset.w.length);
  const lineH = parseFloat(getComputedStyle(textInput).lineHeight) || 28;
  textInput.scrollTop = Math.max(0, (textInput.value.slice(0, i).split("\n").length - 2) * lineH);
  b.classList.add("done");
});

/* ───────── 사전 찾기 ───────── */
const POS_KO = { noun: "명사", verb: "동사", adjective: "형용사", adverb: "부사", preposition: "전치사", conjunction: "접속사", pronoun: "대명사", interjection: "감탄사", phrase: "구", idiom: "관용구" };
const posKo = (p) => POS_KO[(p || "").toLowerCase()] || p || "";

async function lookup(mark) {
  const words = mark.text.split(/\s+/);
  const lower = mark.text.toLowerCase();
  // 원형 찾기: 구는 통째로 → 첫 단어만 원형으로 바꿔서 → 핵심 단어
  let lemma = null, isPhrase = words.length > 1, note = "";
  if (isPhrase) {
    const head = (await findLemma(words[0].toLowerCase())) || words[0].toLowerCase();
    for (const cand of [lower, [head, ...words.slice(1)].join(" ").toLowerCase()]) {
      if (await wiktDefs(cand)) { lemma = cand; break; }
    }
    if (!lemma) {
      const content = words.map((w) => w.toLowerCase()).find((w) => !FUNCTION_WORDS.has(w)) || words[0].toLowerCase();
      lemma = words[0].toLowerCase() === content ? head : (await findLemma(content)) || content;
      note = `구 전체("${mark.text}")는 사전에 없어서 핵심 단어 "${lemma}"의 뜻을 보여 드려요.`;
    }
  } else {
    lemma = (await findLemma(lower)) || (await findLemma(mark.text)) || lower;
  }

  const [fd, ety, wdefs] = await Promise.all([freeDict(lemma), etymologyOf(lemma), wiktDefs(lemma)]);
  let en_en = fd?.senses || [];
  if (!en_en.length && wdefs) {
    en_en = wdefs.flatMap((sec) => (sec.definitions || []).slice(0, 3).map((d) => ({
      pos: sec.partOfSpeech, definition: stripHtml(d.definition), example: stripHtml((d.examples || [])[0] || ""),
    }))).filter((d) => d.definition).slice(0, 7);
  }
  const en_ko = await koreanOf(lemma, ety.english);

  // 뜻풀이 한국어 번역 (내장 번역기가 있을 때만)
  if (await onDeviceTranslator()) {
    for (const d of en_en) d.ko = await translateKo(d.definition, false);
  }
  return {
    id: mark.id, target: mark.text, lemma, note,
    pos: [...new Set(en_en.map((d) => posKo(d.pos)))].slice(0, 2).join(" · "),
    ipa: fd?.ipa || "", audio: fd?.audio || "",
    en_en: en_en.map((d) => ({ pos: d.pos, definition: d.definition, example: d.example, ko: d.ko || "" })),
    en_ko,
    etymology: { text: ety.text, chain: ety.chain, parts: ety.parts, source: ety.source },
    found: !!(en_en.length || en_ko.length || ety.text),
    chosen: null, verdict: null,
  };
}

$("#btnAnalyze").onclick = analyze;
async function analyze() {
  if (!state.marks.length) return;
  busy(true, "사전 찾는 중");
  try {
    const items = [];
    for (const [i, m] of state.marks.entries()) {
      $("#busyText").textContent = `사전 찾는 중 ${i + 1}/${state.marks.length} · ${m.text}`;
      items.push(await lookup(m));
    }
    $("#busyText").textContent = "문장 번역 중";
    const translation = await translateKo(state.text);
    state.result = {
      translation, items,
      snapshot: { text: state.text, title: state.title, marks: state.marks.map((m) => ({ ...m })) },
      at: Date.now(),
    };
    state.activeItem = 0;
    saveSession();
    renderResult();
    showView("result");
    const miss = items.filter((x) => !x.found).length;
    toast(miss ? `사전 찾기 완료 · ${miss}개는 사전에서 찾지 못했어요` : "사전 찾기 완료 · 맞는 뜻을 골라 직접 판정해 보세요");
  } catch (e) {
    toast("사전을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.", true);
  } finally {
    busy(false);
  }
}

/* ───────── 유추 점검 (규칙 기반) ───────── */
const CLUES = [
  { re: /\b(but|however|although|though|yet|instead|unlike|rather than|whereas|while|despite|in spite of)\b/i, name: "대조 단서", tip: "대조어(%s) 앞뒤는 반대 분위기예요. 반대쪽 말을 뒤집어 보면 뜻이 보여요." },
  { re: /\b(means|meaning|is called|refers to|that is|in other words|known as)\b/i, name: "정의 단서", tip: "'%s' 뒤에 뜻풀이가 직접 나와요." },
  { re: /\b(such as|for example|for instance|including|like)\b/i, name: "예시 단서", tip: "'%s' 뒤의 예들이 무엇의 예인지 생각해 보세요." },
  { re: /\b(because|since|so|therefore|thus|as a result|so that)\b/i, name: "원인·결과 단서", tip: "'%s'로 이어진 원인과 결과를 맞춰 보면 뜻의 방향이 잡혀요." },
  { re: /\b(and|or)\b/i, name: "나열 단서", tip: "'%s'로 나란히 놓인 말은 비슷한 종류·분위기인 경우가 많아요." },
];
const AFFIX = [
  [/^un/, "un-", "반대·부정"], [/^re/, "re-", "다시"], [/^dis/, "dis-", "반대·분리"], [/^mis/, "mis-", "잘못"], [/^pre/, "pre-", "미리"],
  [/^over/, "over-", "지나치게"], [/^under/, "under-", "아래·부족"], [/^inter/, "inter-", "사이"], [/^trans/, "trans-", "가로질러"], [/^sub/, "sub-", "아래"],
  [/^im|^in|^il|^ir/, "in-", "부정 / 안으로"], [/^ex/, "ex-", "밖으로"], [/^de/, "de-", "아래로·제거"],
  [/less$/, "-less", "없는"], [/ful$/, "-ful", "가득한"], [/ness$/, "-ness", "상태(명사)"], [/ly$/, "-ly", "~하게(부사)"], [/able$|ible$/, "-able", "할 수 있는"],
  [/tion$|sion$/, "-tion", "행위·상태(명사)"], [/ous$/, "-ous", "~한 성질의"], [/ish$/, "-ish", "~같은·약간"], [/ward$|wards$/, "-ward", "~쪽으로"], [/ize$|ise$/, "-ize", "~하게 만들다"],
];

function sentenceAround(text, mark) {
  const tks = tokenize(text);
  const at = tks[mark.start]?.start ?? 0;
  const before = text.slice(0, at).search(/[.!?]["”’']?\s+[^.!?]*$/);
  const from = before < 0 ? 0 : before + 1;
  const endRel = text.slice(at).search(/[.!?]/);
  const to = endRel < 0 ? text.length : at + endRel + 1;
  return text.slice(from, to).trim();
}

function cluesFor(text, mark, it) {
  const sent = sentenceAround(text, mark);
  const out = [];
  for (const c of CLUES) {
    const m = sent.replace(new RegExp(`\\b${mark.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "").match(c.re);
    if (m) out.push({ name: c.name, tip: c.tip.replace("%s", m[0]) });
  }
  const parts = it.etymology.parts.length
    ? it.etymology.parts.map((p) => p.part + (p.gloss ? ` (${p.gloss})` : "")).join(" + ")
    : AFFIX.filter(([re]) => re.test(it.lemma.toLowerCase()) && it.lemma.length > 5).map(([, a, k]) => `${a} (${k})`).join(", ");
  if (parts) out.push({ name: "생김새 단서", tip: `단어를 쪼개 보면 ${parts}. 아는 조각의 뜻을 합쳐 보세요.` });
  if (/[,;—–-]\s*$/.test(text.slice(0, tokenize(text)[mark.start]?.start || 0)) || /^\s*[,(—–]/.test(text.slice((tokenize(text)[mark.end]?.start || 0) + (tokenize(text)[mark.end]?.text.length || 0)))) {
    out.push({ name: "쉼표·괄호 단서", tip: "단어 바로 앞뒤의 쉼표·대시·괄호 안에 다른 말로 바꿔 쓴 설명(동격)이 있는지 보세요." });
  }
  out.push({ name: "상황·분위기 단서", tip: "인물의 감정, 동작의 방향(toward, away, into…), 앞뒤 사건을 보고 긍정/부정·움직임/상태 중 어느 쪽인지 먼저 좁혀 보세요." });
  return { sent, clues: out };
}

// 내 유추 vs 사전 한국어 뜻: 글자 2개씩 겹치는 정도
function bigrams(s) { const t = s.replace(/[^가-힣a-z]/gi, ""); const out = new Set(); for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2)); return out; }
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((x) => { if (B.has(x)) n++; });
  return (2 * n) / (A.size + B.size);
}
function guessHint(guess, it) {
  if (!guess.trim()) return { level: "none", text: "유추한 뜻을 적지 않았어요." };
  const cands = [...it.en_ko.flatMap((x) => x.meaning.split(/[,;]/)), ...it.en_en.map((d) => d.ko).filter(Boolean)].map((x) => x.trim()).filter(Boolean);
  let best = { s: 0, c: "" };
  for (const c of cands) { const s = similarity(guess, c); if (s > best.s) best = { s, c }; }
  if (best.s >= 0.45) return { level: "close", text: `사전 뜻 "${best.c}"와 많이 비슷해요.` };
  if (best.s >= 0.2) return { level: "some", text: `사전 뜻 "${best.c}"와 일부 겹쳐요.` };
  return { level: "far", text: "사전의 한국어 뜻과 겹치는 말이 없어요. 뜻풀이를 읽고 직접 판단해 보세요." };
}

/* ───────── 2. 단어 해설 ───────── */
function markOf(result, item, idx) {
  return result.snapshot.marks.find((m) => m.id === item.id) || result.snapshot.marks[idx] || { text: item.target, guess: "", reason: "", start: 0, end: 0 };
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
  $("#trKo").textContent = r.translation || "(번역을 불러오지 못했어요)";
  $("#itemList").innerHTML = r.items.map((it, i) => `
    <button class="item-btn${i === idx ? " on" : ""}" data-i="${i}">
      <span class="stamp ${it.verdict || "none"}">${it.verdict ? VERDICT[it.verdict].mark : "?"}</span>
      <span class="w">${esc(it.target)}</span>
    </button>`).join("");
  const it = r.items[idx];
  $("#detail").innerHTML = detailHTML(it, markOf(r, it, idx), r.snapshot.text, true);
}
$("#itemList").addEventListener("click", (e) => {
  const b = e.target.closest(".item-btn");
  if (!b) return;
  state.activeItem = +b.dataset.i;
  saveSession();
  renderResult();
});

function detailHTML(it, mark, sentence, canSave) {
  const saved = canSave && book.some((b) => b.lemma === it.lemma && b.sentence === sentence);
  const h = guessHint(mark.guess || "", it);
  const chosen = it.chosen != null ? it.en_en[it.chosen] : null;
  const { clues } = cluesFor(sentence, mark, it);
  const ety = it.etymology;
  return `
  <div class="headword">
    <h1>${esc(it.target)}</h1>
    ${it.lemma && it.lemma.toLowerCase() !== it.target.toLowerCase() ? `<span class="lemma">← ${esc(it.lemma)}</span>` : ""}
    ${it.ipa ? `<span class="ipa">${esc(it.ipa)}</span>` : ""}
    ${it.pos ? `<span class="pos">${esc(it.pos)}</span>` : ""}
    <span class="hw-actions">
      ${it.audio ? `<button class="kbtn" data-audio="${esc(it.audio)}">🎙 원어민 녹음</button>` : ""}
      <button class="kbtn" data-say="${esc(it.lemma || it.target)}" data-rate="0.8">🔊 발음</button>
      <button class="kbtn" data-say="${esc(it.lemma || it.target)}" data-rate="0.5">🐢 천천히</button>
      ${canSave ? `<button class="kbtn primary" data-save="${esc(it.id)}"${saved ? " disabled" : ""}>${saved ? "★ 저장됨" : "☆ 단어장 저장"}</button>` : ""}
    </span>
  </div>
  ${it.note ? `<div class="note" style="margin:-4px 0 10px">ⓘ ${esc(it.note)}</div>` : ""}

  <div class="dgrid">
    <div class="win sec">
      <div class="win-title"><span>① 유추 판정 (직접)</span></div>
      <div class="win-body">
        <div class="mine" style="margin-top:0">
          <div><span class="lbl">내 유추</span>${esc(mark.guess) || '<span class="dim">(적지 않음)</span>'}</div>
          <div><span class="lbl">유추 사유</span>${esc(mark.reason) || '<span class="dim">(적지 않음)</span>'}</div>
        </div>
        <div class="auto-hint ${h.level}">자동 비교: ${esc(h.text)}</div>
        <div class="judge">
          ${Object.entries(VERDICT).map(([k, v]) => `<button class="kbtn judge-btn ${k}${it.verdict === k ? " on" : ""}" data-judge="${k}"><b>${v.mark}</b> ${v.label.replace("\n", "")}</button>`).join("")}
        </div>
        <div class="dim" style="font-size:12px;margin-top:6px">④ 영영사전에서 이 문장에 쓰인 뜻을 클릭해 고른 뒤, 내 유추와 비교해서 판정하세요.</div>
      </div>
    </div>

    <div class="win sec">
      <div class="win-title"><span>② 이 문장에서의 뜻</span></div>
      <div class="win-body">
        ${chosen ? `
          <div class="ctx-ko">${esc(chosen.ko || chosen.definition)}</div>
          ${chosen.ko ? `<div class="ctx-en">= ${esc(chosen.definition)}</div>` : ""}
          <div class="tip">내가 고른 뜻 (${it.chosen + 1}번)</div>`
        : '<div class="dim">아직 고르지 않았어요. ④ 영영사전에서 이 문장에 맞는 뜻을 클릭하세요.</div>'}
      </div>
    </div>

    <div class="win sec full">
      <div class="win-title"><span>③ 유추 단서 점검</span></div>
      <div class="win-body">
        ${clues.map((c) => `<div class="seg partial"><q><span class="tag">${esc(c.name)}</span></q>${esc(c.tip)}</div>`).join("")}
        <div class="advice">💬 내 유추 사유가 위 단서 중 무엇을 썼는지 비교해 보세요. AI가 사유를 구절별로 첨삭해 주는 기능은 claude.ai 버전에 있어요.</div>
      </div>
    </div>

    <div class="win sec">
      <div class="win-title"><span>④ 영영사전</span><span class="src">Free Dictionary · Wiktionary</span></div>
      <div class="win-body">
        ${it.en_en.length ? `<ol class="defs pick">${it.en_en.map((d, i) => `
          <li class="${it.chosen === i ? "used" : ""}" data-pick="${i}"><span class="p">${esc(posKo(d.pos))}</span>${esc(d.definition)}
            ${d.ko ? `<span class="ko">${esc(d.ko)}</span>` : ""}
            ${d.example ? `<span class="ex">${esc(d.example)}</span>` : ""}</li>`).join("")}
        </ol>` : '<div class="dim">영영 뜻을 찾지 못했어요.</div>'}
      </div>
    </div>

    <div class="win sec">
      <div class="win-title"><span>⑤ 영한사전</span><span class="src">위키낱말사전</span></div>
      <div class="win-body">
        ${it.en_ko.length ? `<ol class="defs">${it.en_ko.map((d) => `<li>${d.pos ? `<span class="p">${esc(d.pos)}</span><br>` : ""}${esc(d.meaning)}</li>`).join("")}</ol>`
          : '<div class="dim">위키낱말사전에 한국어 뜻이 없어요.' + (it.en_en.some((d) => d.ko) ? " ④의 뜻풀이 번역을 참고하세요." : "") + "</div>"}
      </div>
    </div>

    <div class="win sec full">
      <div class="win-title"><span>⑥ 어원</span><span class="src"><a href="${esc(ety.source)}" target="_blank" rel="noopener">위키낱말사전 원문 ↗</a></span></div>
      <div class="win-body">
        ${ety.parts.length ? `<div class="ety-parts">${ety.parts.map((p, i) => `
          ${i ? '<span class="ety-plus">+</span>' : ""}
          <div class="ety-part"><b>${esc(p.part)}</b>${p.gloss ? `<span>${esc(p.gloss)}</span>` : ""}</div>`).join("")}</div>` : ""}
        ${ety.chain.length ? `<div class="ety-chain">${[{ lang: "영어", term: it.lemma }, ...ety.chain].map((c) => `
          <div class="ety-part"><small>${esc(c.lang)}</small><b>${esc(c.term)}</b>${c.gloss ? `<span>${esc(c.gloss)}</span>` : ""}</div>`).join('<span class="ety-plus">←</span>')}</div>` : ""}
        ${ety.text ? `<div class="ety-text">${esc(ety.text)}</div>` : '<div class="dim">어원 정보를 찾지 못했어요.</div>'}
      </div>
    </div>
  </div>`;
}

// 판정 · 뜻 고르기 · 소리 · 저장 (해설 화면과 단어장 공통)
function onDetailClick(e, getItem, onChange) {
  const au = e.target.closest("[data-audio]");
  if (au) return new Audio(au.dataset.audio).play().catch(() => toast("녹음을 재생하지 못했어요", true));
  const say = e.target.closest("[data-say]");
  if (say) return speak(say.dataset.say, +say.dataset.rate);
  const it = getItem();
  if (!it) return;
  const j = e.target.closest("[data-judge]");
  if (j) { it.verdict = it.verdict === j.dataset.judge ? null : j.dataset.judge; return onChange(); }
  const pk = e.target.closest("[data-pick]");
  if (pk && !e.target.closest("a")) { const i = +pk.dataset.pick; it.chosen = it.chosen === i ? null : i; return onChange(); }
  const sv = e.target.closest("[data-save]");
  if (sv) {
    const r = state.result;
    if (saveItem(r, r.items.indexOf(it))) { toast("단어장에 저장했어요"); onChange(); }
  }
}
$("#detail").addEventListener("click", (e) => onDetailClick(e,
  () => state.result?.items[Math.min(state.activeItem, state.result.items.length - 1)],
  () => {
    // 이미 단어장에 있는 같은 단어도 판정을 맞춘다
    const it = state.result.items[Math.min(state.activeItem, state.result.items.length - 1)];
    const b = book.find((x) => x.lemma === it.lemma && x.sentence === state.result.snapshot.text);
    if (b) { b.item.verdict = it.verdict; b.item.chosen = it.chosen; saveBook(); }
    saveSession(); renderResult();
  }));

function saveItem(r, idx) {
  const it = r.items[idx];
  if (book.some((b) => b.lemma === it.lemma && b.sentence === r.snapshot.text)) return false;
  const m = markOf(r, it, idx);
  book.unshift({
    id: Date.now() + "-" + idx,
    savedAt: Date.now(),
    lemma: it.lemma, target: it.target,
    sentence: r.snapshot.text, title: r.snapshot.title,
    translation: r.translation,
    mark: { text: m.text, guess: m.guess, reason: m.reason, start: m.start, end: m.end },
    item: JSON.parse(JSON.stringify(it)),
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

/* ───────── 3. 발음 교정 ───────── */
const pronInput = $("#pronInput");
let pronTokens = [];
let lastDiff = null;      // {ops, score, heard}
let mineUrl = null;

function pronText() { return state.pronText || state.text || ""; }

function renderPronTarget(diff = lastDiff) {
  pronTokens = tokenize(pronText());
  const el = $("#pronTarget");
  if (!pronTokens.length) {
    el.innerHTML = '<span class="dim">연습할 문장이 없어요. [원문 가져오기]나 [✎ 편집]으로 넣어 주세요.</span>';
    return;
  }
  const status = new Map();
  if (diff) diff.ops.forEach((o) => { if (o.ti != null) status.set(o.ti, o); });
  el.innerHTML = pronTokens.map((t, i) => {
    if (t.type !== "w") return esc(t.text).replace(/\n/g, "<br>");
    const o = status.get(i);
    const cls = o ? ` ${o.op}` : "";
    const heard = o?.op === "sub" ? ` data-heard="${esc(o.heard)}"` : "";
    return `<span class="w${cls}" data-i="${i}"${heard}>${esc(t.text)}</span>`;
  }).join("");
}

$("#pronTarget").addEventListener("click", (e) => {
  const w = e.target.closest(".w");
  if (w) speak(w.textContent, 0.6);
});
$("#btnPronFromInput").onclick = () => {
  state.pronText = state.text; saveSession();
  pronInput.hidden = true; $("#pronTarget").hidden = false; lastDiff = null;
  resetHeard(); renderPronTarget();
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
    lastDiff = null; resetHeard(); renderPronTarget();
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
      w.classList.toggle("speaking", ev.charIndex >= t.start && ev.charIndex < t.start + t.text.length);
    });
  }, () => words.forEach((w) => w.classList.remove("speaking")));
}
$("#btnListen").onclick = listen;

/* 녹음 + 음성 인식 */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recorder = null, recStream = null, recording = false;
let finalText = "";

function resetHeard() {
  $("#heard").innerHTML = '<span class="dim">녹음 버튼을 누르고 문장을 소리 내어 읽어 보세요. 다 읽으면 다시 눌러 멈춥니다.</span>';
  $("#extraWords").textContent = "";
  $("#pronScore").textContent = "";
  $("#btnCoach").disabled = true;
}

async function toggleRec() {
  if (state.view !== "pron") showView("pron");
  if (recording) return stopRec();
  if (!SR) return toast("이 브라우저는 음성 인식을 지원하지 않아요. Chrome 이나 Edge 로 열어 주세요.", true);
  if (!pronText()) return toast("연습할 문장이 없어요", true);
  speechSynthesis.cancel();
  finalText = ""; lastDiff = null;
  renderPronTarget(null);

  // 내 목소리 녹음 (다시 듣기용)
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    recorder = new MediaRecorder(recStream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      if (mineUrl) URL.revokeObjectURL(mineUrl);
      mineUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      $("#btnPlayMine").disabled = false;
      recStream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
  } catch {
    return toast("마이크를 쓸 수 없어요. 브라우저 주소창 옆에서 마이크 권한을 허용해 주세요.", true);
  }

  rec = new SR();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    $("#heard").innerHTML = `${esc(finalText)}<span class="interim">${esc(interim)}</span>`;
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech") toast("소리가 안 들렸어요. 마이크를 확인해 주세요.", true);
    else if (e.error === "not-allowed") toast("마이크 권한이 막혀 있어요.", true);
    else if (e.error !== "aborted") toast("음성 인식 오류: " + e.error, true);
  };
  rec.onend = () => { if (recording) finishRec(); };
  rec.start();
  recording = true;
  $("#btnRec").classList.add("on");
  $("#btnRec").textContent = "■ 녹음 멈추기";
  $("#heard").innerHTML = '<span class="interim">듣고 있어요… 문장을 읽어 주세요.</span>';
  hint("다 읽었으면 [■ 녹음 멈추기] (또는 Alt+R)");
}

function stopRec() {
  if (!recording) return;
  rec.stop();           // onend 에서 finishRec
  setTimeout(() => recording && finishRec(), 1500);
}

function finishRec() {
  recording = false;
  try { rec.abort(); } catch {}
  if (recorder?.state === "recording") recorder.stop();
  $("#btnRec").classList.remove("on");
  $("#btnRec").textContent = "● 녹음 시작";
  hint("밑줄 색으로 어디가 다르게 들렸는지 확인하고, [교정 팁 보기]를 눌러 보세요");
  const heard = finalText.trim();
  if (!heard) { resetHeard(); return toast("인식된 말이 없어요. 조금 더 크게 또박또박 읽어 보세요.", true); }
  lastDiff = diffWords(pronTokens, heard);
  renderPronTarget();
  $("#heard").textContent = heard;
  const extra = lastDiff.ops.filter((o) => o.op === "extra").map((o) => o.heard);
  $("#extraWords").textContent = extra.length ? `＋ 문장에 없는데 들린 말: ${extra.join(", ")}` : "";
  $("#pronScore").textContent = `일치율 ${lastDiff.score}%`;
  $("#btnCoach").disabled = false;
}

/* 단어 단위 정렬 (편집 거리) */
function editDist(a, b) {
  const D = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      D[i][j] = Math.min(D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  return D;
}
function diffWords(tks, heard) {
  const tIdx = tks.map((t, i) => (t.type === "w" ? i : -1)).filter((i) => i >= 0);
  const a = tIdx.map((i) => norm(tks[i].text));
  const hRaw = heard.split(/\s+/).filter(Boolean);
  const b = hRaw.map(norm);
  const D = editDist(a, b);
  const ops = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push(a[i - 1] === b[j - 1] ? { op: "ok", ti: tIdx[i - 1] } : { op: "sub", ti: tIdx[i - 1], heard: hRaw[j - 1] });
      i--; j--;
    } else if (i > 0 && D[i][j] === D[i - 1][j] + 1) {
      ops.push({ op: "miss", ti: tIdx[i - 1] }); i--;
    } else {
      ops.push({ op: "extra", heard: hRaw[j - 1] }); j--;
    }
  }
  ops.reverse();
  const ok = ops.filter((o) => o.op === "ok").length;
  return { ops, heard, score: a.length ? Math.round((ok / a.length) * 100) : 0 };
}

$("#btnRec").onclick = toggleRec;
$("#btnPlayMine").onclick = () => { if (mineUrl) new Audio(mineUrl).play(); };

/* 교정 팁 (한국인이 자주 틀리는 발음 규칙) */
const SOUND_RULES = [
  { from: "r", to: "l", name: "R 을 L 처럼", tip: "R 은 혀끝이 입천장 어디에도 닿지 않아요. 혀를 뒤로 살짝 말고 입술을 조금 오므린 채 '(우)ㄹ' 하고 시작하세요." },
  { from: "l", to: "r", name: "L 을 R 처럼", tip: "L 은 혀끝을 윗니 뒤 잇몸에 꾹 붙였다 떼요. 단어 끝 L 은 혀를 붙인 채로 '을'처럼 마무리하세요." },
  { from: "v", to: "b", name: "V 를 B 처럼", tip: "V 는 윗니를 아랫입술 안쪽에 가볍게 대고 성대를 울리며 바람을 내보내요. 두 입술이 붙으면 B 가 돼요." },
  { from: "b", to: "v", name: "B 를 V 처럼", tip: "B 는 두 입술을 붙였다가 터뜨리는 소리예요. 윗니가 입술에 닿지 않게 하세요." },
  { from: "f", to: "p", name: "F 를 P 처럼", tip: "F 는 윗니를 아랫입술에 대고 '프' 하는 바람만 내보내요. 입술을 붙이면 P(ㅍ)가 돼요." },
  { from: "p", to: "f", name: "P 를 F 처럼", tip: "P 는 두 입술을 붙였다가 '퍼' 하고 터뜨리세요." },
  { from: "th", to: "s", name: "TH 를 S 처럼", tip: "TH 는 혀끝을 윗니와 아랫니 사이에 살짝 내밀고 바람을 내보내요. 혀가 이 뒤로 숨으면 S 가 돼요." },
  { from: "th", to: "t", name: "TH 를 T 처럼", tip: "혀끝을 이 사이로 살짝 내밀고, 혀를 떼지 말고 바람을 흘려보내세요." },
  { from: "th", to: "d", name: "TH 를 D 처럼", tip: "this, the 의 TH 도 혀끝을 이 사이에 두고 성대를 울려요. 잇몸을 치면 D 가 돼요." },
  { from: "th", to: "f", name: "TH 를 F 처럼", tip: "입술이 아니라 혀끝을 이 사이에 두세요." },
  { from: "z", to: "j", name: "Z 를 J 처럼", tip: "Z 는 'ㅈ'이 아니라 벌이 '즈~' 하듯 이 사이로 진동하는 바람 소리예요. 혀가 입천장에 닿으면 안 돼요." },
  { from: "z", to: "s", name: "Z 를 S 처럼", tip: "Z 는 S 와 입 모양이 같지만 성대를 울려요. 목에 손을 대고 떨림을 느껴 보세요." },
  { from: "s", to: "sh", name: "S 를 SH 처럼", tip: "she 의 SH 는 입술을 둥글게 내밀어요. S 는 입술을 옆으로 펴고 '스'를 날카롭게." },
  { from: "sh", to: "s", name: "SH 를 S 처럼", tip: "SH 는 입술을 동그랗게 앞으로 내밀고 '쉬' 하세요." },
  { from: "w", to: "", name: "W 가 빠짐", tip: "W 는 입술을 '우'로 동그랗게 모았다가 다음 모음으로 넘어가요. wood/would 처럼 '우'를 먼저 만드세요." },
];
const FUNCTION_WORDS = new Set("a an the of to and or but for in on at by with from as is are was were be been it its this that his her their my your our he she they we you i".split(" "));
const consonants = (w) => w.replace(/[aeiouy']/g, "");

function diagnose(target, heard) {
  const t = norm(target), h = norm(heard || "");
  if (!h) {
    return FUNCTION_WORDS.has(t)
      ? { name: "작은 단어가 묻힘", tip: `'${target}' 같은 기능어는 약하게 읽는 게 맞지만, 소리가 완전히 사라지면 안 돼요. 앞 단어와 이어서 짧게라도 소리를 내세요.` }
      : { name: "단어가 안 들림", tip: `'${target}'를 건너뛰었거나 너무 작게 읽었어요. 원어민 녹음을 듣고 강세 있는 음절을 또렷하게 읽어 보세요.` };
  }
  for (const r of SOUND_RULES) {
    if (!t.includes(r.from)) continue;
    const swapped = t.split(r.from).join(r.to);
    if (swapped === h || editDist(swapped, h)[swapped.length][h.length] < editDist(t, h)[t.length][h.length]) return r;
  }
  if (h.length < t.length && t.startsWith(h)) {
    const lost = t.slice(h.length);
    if (/^(ed|d)$/.test(lost)) return { name: "-ed 끝소리 빠짐", tip: "과거형 -ed 는 '드/트/이드'로 짧게라도 꼭 내요. 다음 단어와 이어 읽으면 자연스러워요 (walked_in → 웍틴)." };
    if (/^(s|es)$/.test(lost)) return { name: "-s 끝소리 빠짐", tip: "복수·3인칭 -s 는 'ㅅ/즈'로 짧게 끝까지 내요. 한국어 습관처럼 받침에서 끊지 마세요." };
    return { name: "끝 자음 약함", tip: `끝소리 '${lost}'까지 소리를 내세요. 영어는 받침 뒤에 숨을 살짝 터뜨려 끝맺어요.` };
  }
  if (consonants(t) === consonants(h)) {
    return { name: "모음 소리가 다름", tip: "자음은 맞았는데 모음이 다르게 들렸어요. 짧은 모음(ship, live)은 짧고 힘을 빼서, 긴 모음(sheep, leave)은 입을 양옆으로 당겨 길게 내세요." };
  }
  if (t.length >= 7) return { name: "강세 위치", tip: "긴 단어는 강세 음절 하나만 크고 길게, 나머지는 약하게 읽어야 알아들어요. 원어민 녹음에서 가장 크게 들리는 음절을 찾아 따라 해 보세요." };
  return { name: "다르게 들림", tip: "원어민 녹음을 천천히 듣고 한 음절씩 따라 한 뒤, 문장 속에서 다시 읽어 보세요." };
}

$("#btnCoach").onclick = async () => {
  if (!lastDiff) return;
  const issues = lastDiff.ops.filter((o) => o.op === "sub" || o.op === "miss").map((o) => {
    const word = pronTokens[o.ti].text;
    return { word, heard: o.heard || "", ...diagnose(word, o.heard) };
  });
  busy(true, "원어민 녹음 찾는 중");
  try {
    for (const x of issues.slice(0, 12)) {
      const lemma = (await findLemma(x.word.toLowerCase())) || x.word.toLowerCase();
      const fd = (await freeDict(x.word.toLowerCase())) || (await freeDict(lemma));
      x.ipa = fd?.ipa || ""; x.audio = fd?.audio || "";
    }
  } finally {
    busy(false);
  }
  renderCoach(issues);
};

function renderCoach(issues) {
  const kinds = [...new Set(issues.map((x) => x.name))];
  $("#coach").innerHTML = `
    <div class="coach-sum"><div class="score">${lastDiff.score}%</div>
      <div>${issues.length ? `다르게 들린 단어 ${issues.length}개 · 주로 <b>${esc(kinds.slice(0, 3).join(", "))}</b>` : "모든 단어가 잘 들렸어요. 훌륭해요!"}</div></div>
    ${issues.map((x) => `
      <div class="issue">
        <div class="issue-head"><b>${esc(x.word)}</b><span class="ipa">${esc(x.ipa || "")}</span>
          ${x.audio ? `<button data-audio="${esc(x.audio)}" title="실제 원어민 녹음">🎙</button>` : ""}
          <button data-say="${esc(x.word)}" data-rate="0.85">🔊</button><button data-say="${esc(x.word)}" data-rate="0.5">🐢</button></div>
        <div class="issue-body">
          <div class="heard-as">들린 말: ${esc(x.heard || "(안 들림)")}</div>
          <div><b>${esc(x.name)}</b> ${esc(x.tip)}</div>
        </div>
      </div>`).join("")}
    <div class="win" style="margin-top:6px"><div class="win-title"><span>문장 리듬</span></div>
      <div class="win-body"><ul class="tips">
        <li>명사·동사·형용사 같은 내용어는 크고 길게, the·of·to 같은 기능어는 작고 짧게 읽어요.</li>
        <li>자음으로 끝나는 단어 뒤에 모음이 오면 이어 읽어요 (an_apple → 어내플).</li>
        <li>먼저 0.7배속으로 따라 읽고, 익숙해지면 속도를 올려 보세요.</li>
      </ul>
      <div class="row-end" style="margin-top:8px"><button class="kbtn" data-say-all>▶ 문장 다시 듣기</button></div></div></div>`;
}
$("#coach").addEventListener("click", (e) => {
  const au = e.target.closest("[data-audio]");
  if (au) return new Audio(au.dataset.audio).play().catch(() => toast("녹음을 재생하지 못했어요", true));
  const b = e.target.closest("[data-say]");
  if (b) speak(b.dataset.say, +b.dataset.rate);
  if (e.target.closest("[data-say-all]")) listen();
});

/* ───────── 4. 단어장 ───────── */
let bookSel = null;
function renderBook() {
  const q = $("#bookSearch").value.trim().toLowerCase();
  const list = book.filter((b) => !q || [b.lemma, b.target, b.sentence, b.mark.guess].join(" ").toLowerCase().includes(q));
  $("#bookCount").textContent = `${book.length}개`;
  $("#bookList").innerHTML = list.length ? list.map((b) => {
    const it = b.item;
    const sub = it.chosen != null ? (it.en_en[it.chosen]?.ko || it.en_en[it.chosen]?.definition || "") : (it.contextual_meaning || it.en_ko?.[0]?.meaning || "");
    return `
    <button class="book-item${b.id === bookSel ? " on" : ""}" data-id="${esc(b.id)}">
      <div class="bw"><span class="stamp ${it.verdict || "none"}">${it.verdict ? VERDICT[it.verdict].mark : "?"}</span>${esc(b.target)}</div>
      <div class="bm">${esc(sub.slice(0, 40))}</div>
    </button>`;
  }).join("") : '<div class="empty">저장된 단어가 없어요.</div>';
  const cur = book.find((b) => b.id === bookSel);
  $("#bookDetail").innerHTML = cur ? `
    ${cur.item.en_en?.[0]?.definition !== undefined && cur.item.etymology?.chain ? detailHTML(cur.item, cur.mark, cur.sentence, false) : '<div class="dim">이 단어는 이전 버전(AI)으로 저장돼서 일부만 보여요.</div>'}
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
  if (d) {
    if (confirm("이 단어를 단어장에서 지울까요?")) {
      book = book.filter((b) => b.id !== d.dataset.del);
      bookSel = null; saveBook(); renderBook();
    }
    return;
  }
  onDetailClick(e, () => book.find((b) => b.id === bookSel)?.item, () => { saveBook(); renderBook(); });
});

/* ───────── 5. 설정 ───────── */
async function renderToolStatus() {
  const row = (ok, name, msg) => `<li class="${ok ? "ok" : "no"}"><b>${ok ? "●" : "○"} ${name}</b> ${msg}</li>`;
  let tr = "확인 중…";
  const el = $("#toolStatus");
  const paint = () => {
    el.innerHTML = [
      row(true, "사전 · 어원", "Free Dictionary, 위키낱말사전 (인터넷 필요)"),
      row(tr.startsWith("사용"), "번역", tr),
      row(!!window.Tesseract, "사진 글자 인식", window.Tesseract ? "Tesseract 준비됨 (처음 쓸 때 영어 인식 데이터 약 10MB를 받아요)" : "불러오지 못함 · 인터넷 연결 확인"),
      row(!!SR, "발음 인식", SR ? "Chrome / Edge 음성 인식 사용" : "이 브라우저는 지원하지 않아요 · Chrome 이나 Edge 로 여세요"),
      row(voices.length > 0, "원어민 음성", voices.length ? `영어 목소리 ${voices.length}개` : "영어 목소리가 없어요"),
    ].join("");
  };
  paint();
  if (!("Translator" in self)) tr = "Chrome 내장 번역기가 없어 MyMemory 무료 번역을 써요 (하루 사용량 제한 있음)";
  else {
    try {
      const av = await within(Translator.availability({ sourceLanguage: "en", targetLanguage: "ko" }), 3000);
      tr = av === "unavailable" ? "Chrome 내장 번역기에 한국어가 없어 MyMemory 무료 번역을 써요"
        : av === "available" ? "사용 중 · Chrome 내장 번역기 (내 컴퓨터에서 처리)"
        : "사용 가능 · Chrome 내장 번역기 (처음 한 번 번역 모델을 내려받아요)";
    } catch { tr = "MyMemory 무료 번역을 써요"; }
  }
  paint();
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#btnExport").onclick = () => {
  const cell = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["단어", "기본형", "품사", "발음기호", "판정", "내 유추", "유추 사유", "고른 뜻", "영한", "출처 문장", "해석", "책", "저장일"]];
  book.forEach((b) => {
    const it = b.item;
    const chosen = it.chosen != null ? it.en_en[it.chosen] : null;
    rows.push([b.target, b.lemma, it.pos, it.ipa, it.verdict ? VERDICT[it.verdict].label.replace("\n", "") : "",
      b.mark.guess, b.mark.reason, chosen ? `${chosen.definition}${chosen.ko ? " / " + chosen.ko : ""}` : (it.contextual_meaning || ""),
      (it.en_ko || []).map((x) => x.meaning).join(" / "),
      b.sentence, b.translation, b.title, new Date(b.savedAt).toLocaleDateString("ko-KR")]);
  });
  download(`단어장_${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"), "text/csv");
};
$("#btnBackup").onclick = () => download(`yeongdong_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ book }, null, 1), "application/json");
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

/* ───────── 탭 · 키보드 ───────── */
$$("#tabs button, .key.f").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
$('.key[data-act="listen"]').onclick = listen;
$('.key[data-act="rec"]').onclick = toggleRec;

$$(".krow[data-row]").forEach((row) => {
  row.innerHTML = [...row.dataset.row].map((c) => `<span class="key" data-key="${c}">${c.toUpperCase()}</span>`).join("")
    + (row.dataset.row === "asdfghjkl" ? '<span class="key" data-key="enter" style="min-width:90px">ENTER</span>' : "")
    + (row.dataset.row === "zxcvbnm" ? '<span class="key" data-key=" " style="min-width:160px">SPACE</span><span class="key" data-key="backspace" style="min-width:70px">BACK</span>' : "");
});

document.addEventListener("keydown", (e) => {
  const k = $(`.keyboard .key[data-key="${CSS.escape(e.key.toLowerCase())}"]`);
  if (k) { k.classList.add("pressed"); setTimeout(() => k.classList.remove("pressed"), 120); }
  if (e.altKey && /^[1-5]$/.test(e.key)) {
    e.preventDefault();
    showView(["input", "result", "pron", "book", "settings"][+e.key - 1]);
  } else if (e.altKey && e.key.toLowerCase() === "r") { e.preventDefault(); toggleRec(); }
  else if (e.altKey && e.key.toLowerCase() === "l") { e.preventDefault(); listen(); }
  else if (e.ctrlKey && e.key === "Enter" && state.view === "input" && state.marks.length) { e.preventDefault(); analyze(); }
});

/* ───────── 시작 ───────── */
$("#sbModel").textContent = "무료 사전 모드";
updateCount();
setConfirmed(state.confirmed && !!state.text);
renderResult();
