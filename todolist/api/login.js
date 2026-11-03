// POST /api/login { password } → 맞으면 30일짜리 로그인 쿠키
// DELETE /api/login → 로그아웃
import { send, readJson, isJson, checkPassword, sessionCookie, clearCookie } from './_lib.js';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 만 됩니다' });
  if (!isJson(req)) return send(res, 415, { error: 'JSON 으로 보내 주세요' });
  try {
    const { password } = await readJson(req);
    if (typeof password !== 'string' || !checkPassword(password)) {
      // 마구 넣어 보는 걸 늦추려고 틀리면 잠깐 기다린다
      await new Promise((r) => setTimeout(r, 600));
      return send(res, 401, { error: '비밀번호가 달라요' });
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req) });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}
