// GET /api/quests → { quests: [...] }  (지우지 않은 퀘스트 전부)
// PUT /api/quests { upserts: [퀘스트...], deletes: [id...] } → 바뀐 것만 저장
// 퀘스트 단위로 저장해서, 두 컴퓨터에서 서로 다른 퀘스트를 고쳐도 덮어쓰지 않는다.
import { db, send, readJson, isJson, isAuthed } from './_lib.js';

const MAX_ITEMS = 500;
const MAX_ID = 100;

const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID;

export default async function handler(req, res) {
  if (!isAuthed(req)) return send(res, 401, { error: '로그인이 필요해요' });
  try {
    const sql = db();

    if (req.method === 'GET') {
      const rows = await sql.query('SELECT data FROM quests WHERE deleted_at IS NULL ORDER BY created_at DESC');
      return send(res, 200, { quests: rows.map((r) => r.data) });
    }

    if (req.method === 'PUT') {
      if (!isJson(req)) return send(res, 415, { error: 'JSON 으로 보내 주세요' });
      const { upserts = [], deletes = [] } = await readJson(req);
      if (!Array.isArray(upserts) || !Array.isArray(deletes) || upserts.length + deletes.length > MAX_ITEMS) {
        return send(res, 400, { error: '형식이 맞지 않아요' });
      }
      if (!upserts.every((q) => q && typeof q === 'object' && validId(q.id)) || !deletes.every(validId)) {
        return send(res, 400, { error: '퀘스트 id 가 올바르지 않아요' });
      }
      const queries = upserts.map((q) => sql.query(
        `INSERT INTO quests (id, data, updated_at, deleted_at) VALUES ($1, $2::jsonb, now(), NULL)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), deleted_at = NULL`,
        [q.id, JSON.stringify(q)],
      ));
      if (deletes.length) {
        queries.push(sql.query('UPDATE quests SET deleted_at = now() WHERE id = ANY($1::text[])', [deletes]));
      }
      if (queries.length) await sql.transaction(queries);
      return send(res, 200, { ok: true, saved: upserts.length, deleted: deletes.length });
    }

    return send(res, 405, { error: 'GET, PUT 만 됩니다' });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}
