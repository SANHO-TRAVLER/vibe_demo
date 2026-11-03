// 로컬에서 Vercel 과 똑같이 돌려 보는 개발 서버: 화면 파일 + api/ 함수.
//   npm run dev  →  http://127.0.0.1:8126
// todolist/.env 의 값을 읽는다. (그냥 화면만 볼 때는 python -m http.server 로 열면 브라우저 저장 모드)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const PORT = Number(process.env.PORT || 8126);

// Vercel 에 올라가는 것과 같은 화면 파일만 내준다 (.env·db·tools 등은 막음)
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const api = url.pathname.match(/^\/api\/([a-z]+)$/);
  try {
    if (api) {
      const file = join(root, 'api', `${api[1]}.js`);
      if (!existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    const name = STATIC[url.pathname];
    if (!name) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[extname(name)]);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(await readFile(join(root, name)));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('server error');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`노동 게시판 개발 서버: http://127.0.0.1:${PORT}`));
