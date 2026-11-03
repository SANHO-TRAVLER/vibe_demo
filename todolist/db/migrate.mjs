// 표 구조(마이그레이션)를 Neon 의 두 브랜치에 똑같이 맞춘다.
//   main 브랜치 (DATABASE_URL_TEMPLATE) = 백지 템플릿: 표 구조만, 데이터 없음
//   FOR COMPANY TASK (DATABASE_URL)     = 실제 업무 데이터
// db/migrations/NNN_이름.sql 을 번호 순서로, 아직 안 한 것만 적용하고 schema_migrations 에 기록한다.
//   npm run migrate
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const TARGETS = [
  { name: '템플릿 (main)', url: process.env.DATABASE_URL_TEMPLATE, template: true },
  { name: '업무 데이터 (FOR COMPANY TASK)', url: process.env.DATABASE_URL, template: false },
];

const dir = join(root, 'db', 'migrations');
const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

// neon HTTP 드라이버는 한 번에 한 문장만 보낼 수 있어 ; 로 나눈다 (마이그레이션에는 함수 본문 같은 ; 를 쓰지 않는다)
function statements(text) {
  return text
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
    .split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
}

async function migrate({ name, url, template }) {
  if (!url) {
    console.log(`- ${name}: 연결 주소가 없어 건너뜀`);
    return;
  }
  const sql = neon(url);
  await sql.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version int PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await sql.query('SELECT version FROM schema_migrations')).map((r) => r.version));
  let applied = 0;
  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (done.has(version)) continue;
    const stmts = statements(readFileSync(join(dir, file), 'utf8'));
    await sql.transaction([
      ...stmts.map((s) => sql.query(s)),
      sql.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, file]),
    ]);
    console.log(`  ✓ ${name}: ${file}`);
    applied++;
  }
  const [{ count }] = await sql.query('SELECT count(*)::int AS count FROM quests');
  console.log(`- ${name}: ${applied ? `${applied}개 적용` : '이미 최신'} · 퀘스트 ${count}개`);
  if (template && count > 0) {
    console.warn(`  ⚠ 템플릿 브랜치에 데이터가 ${count}개 있어요. 백지 템플릿으로 쓰려면 비워 두세요.`);
  }
}

for (const target of TARGETS) {
  try {
    await migrate(target);
  } catch (err) {
    console.error(`✗ ${target.name}: ${err.message}`);
    process.exitCode = 1;
  }
}
