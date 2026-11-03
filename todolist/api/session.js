// GET /api/session → { authenticated }
// 앱은 이 주소가 있는지로 'DB 모드'인지 알아낸다 (로컬 python 서버로 열면 404 → 브라우저 저장만 씀).
import { send, isAuthed } from './_lib.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'GET 만 됩니다' });
  return send(res, 200, { authenticated: isAuthed(req) });
}
