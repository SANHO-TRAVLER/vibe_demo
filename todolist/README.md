# 노동 게시판 — DB(Neon) 연결 안내

## 구조

| 무엇 | 어디 | 하는 일 |
|---|---|---|
| 화면 | `index.html`, `app.js`, `style.css` | 퀘스트 보드 |
| 서버 함수 | `api/` (Vercel) | 로그인, 퀘스트 불러오기·저장 |
| 표 구조 | `db/migrations/*.sql` | 두 브랜치에 똑같이 적용 |

Neon 프로젝트 **TO DO LIST_CHIIKAWA**
- `main` 브랜치 = **백지 템플릿** (표 구조만, 데이터 없음)
- `FOR COMPANY TASK` 브랜치 = **실제 업무 데이터** (앱이 쓰는 곳)

열기 방식에 따라 저장 위치가 달라진다.
- Vercel 주소 / `npm run dev` → **DB 모드** (비밀번호 로그인, Neon 에 저장, 여러 컴퓨터에서 같은 데이터)
- `python -m http.server` → **브라우저 저장 모드** (예전처럼 이 브라우저에만 저장)

## 처음 한 번

1. `todolist/.env` 를 채운다 (`.env.example` 참고, git 에 올라가지 않음).
   - `DATABASE_URL` = Neon 콘솔 → FOR COMPANY TASK 브랜치 → Connect 의 연결 주소
   - `DATABASE_URL_TEMPLATE` = 같은 곳에서 main 브랜치의 연결 주소
   - `APP_PASSWORD` = 게시판 비밀번호
   - `SESSION_SECRET` = 이미 임의 값이 들어 있음
2. 표 만들기 (두 브랜치 모두):
   ```bash
   npm --prefix todolist run migrate
   ```
3. 로컬에서 확인: `npm --prefix todolist run dev` → http://127.0.0.1:8126
   - 처음 로그인하면, 이 브라우저에 있던 퀘스트를 DB 에 올릴지 물어본다.

## 인터넷에 올리기 (Vercel)

1. Vercel → Add New Project → GitHub 저장소 `vibe_demo` 선택
2. **Root Directory = `todolist`**, Framework Preset = Other
3. Environment Variables 에 `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET` 를 `.env` 와 같은 값으로
4. Deploy → 나온 주소를 회사·집 컴퓨터에서 열고 비밀번호로 로그인

`.vercelignore` 가 `prd.md`·`tools/`·`db/`·`.env` 를 빼고 올리므로 설계 기록·비밀 값은 공개되지 않는다.

## 백지에서 다시 시작하기

1. 먼저 백업: `npm --prefix todolist run backup` → `todolist/backups/quests-날짜.json`
   (엑셀 일지로도 받아 두면 좋다)
2. Neon 콘솔 → Branches → `FOR COMPANY TASK` → **Reset from parent**
   → main(백지 템플릿) 상태로 돌아간다. 데이터는 비고 표 구조는 그대로.
   - 기존 데이터를 남겨 두고 싶으면 Reset 대신 main 에서 새 브랜치를 만들고, `DATABASE_URL` 을 새 브랜치 주소로 바꾼다.

## 표 구조를 바꿀 때 (템플릿과 데이터 함께)

1. `db/migrations/002_무엇.sql` 처럼 다음 번호로 파일을 추가한다 (`;` 로 끝나는 SQL 문들).
2. `npm --prefix todolist run migrate` → main 과 FOR COMPANY TASK 에 **똑같이** 적용되고, 각 브랜치의 `schema_migrations` 표에 기록된다.

퀘스트 내용은 통째로 `jsonb` 로 저장하므로, 화면에 새 칸(필드)을 추가하는 정도는 표를 고칠 필요 없이 `app.js` 의 `storage.normalize()` 에서 기본값만 채우면 된다.
