// api/ 함수들이 함께 쓰는 것: DB 연결, 로그인 쿠키, JSON 주고받기.
// (밑줄로 시작하는 파일은 Vercel 이 주소로 만들지 않는다.)
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const COOKIE = 'tt_session';
const SESSION_DAYS = 30;

let client = null;
export function db() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 이 없습니다. todolist/.env 또는 Vercel 환경 변수를 확인하세요.');
  client = neon(url);
  return client;
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

// Vercel 은 req.body 를 미리 읽어 주고, 로컬 개발 서버는 직접 읽는다
export async function readJson(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

// 다른 사이트에서 몰래 보내는 요청을 막기 위해, 쓰는 요청은 JSON 으로만 받는다
export function isJson(req) {
  return (req.headers['content-type'] || '').startsWith('application/json');
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET 이 없거나 너무 짧습니다 (16자 이상).');
  return s;
}

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((p) => p.trim().split('=')).filter((p) => p[0]));
}

const sameText = (a, b) => {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
};

export function checkPassword(password) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error('APP_PASSWORD 가 설정되지 않았습니다.');
  return sameText(password, expected);
}

// 쿠키 값 = "만료시각.서명"
export function sessionCookie(req) {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const value = `${expires}.${sign(String(expires))}`;
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAuthed(req) {
  const value = cookies(req)[COOKIE];
  if (!value) return false;
  const [expires, mac] = value.split('.');
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return sameText(mac, sign(expires));
}
