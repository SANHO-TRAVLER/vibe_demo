// 업무 데이터 브랜치의 퀘스트를 JSON 파일로 내려받는다 (백지로 되돌리기 전에 한 번).
//   npm run backup  →  backups/quests-YYYY-MM-DD-HHMM.json  (git 에 올라가지 않음)
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL 이 없어요. todolist/.env 를 확인하세요.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const rows = await sql.query('SELECT data, deleted_at FROM quests ORDER BY created_at');
const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
mkdirSync(join(root, 'backups'), { recursive: true });
const file = join(root, 'backups', `quests-${stamp}.json`);
writeFileSync(file, JSON.stringify(rows.map((r) => ({ ...r.data, deletedAt: r.deleted_at })), null, 2));
console.log(`✓ 퀘스트 ${rows.length}개를 ${file} 에 저장했어요`);
