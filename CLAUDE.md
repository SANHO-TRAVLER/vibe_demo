# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 개요

서로 독립된 개인 프로젝트 모음이다. 빌드 시스템, 테스트, 린터는 없다. 모든 웹 앱은 프레임워크 없는 정적 HTML/CSS/바닐라 JS이고, 게임은 단일 파일 pygame 스크립트다. 사용자에게는 한국어로 답하고, 코드 주석·문서도 한국어로 쓴다.

| 경로 | 내용 |
|---|---|
| `todolist/` | 업무용 퀘스트 보드 웹앱 (가장 활발한 프로젝트) |
| `english-dict/` | 원서 읽기용 전자사전 "YEONGDONG" (로컬판 + claude.ai판) |
| `demoport/` | 조향사(향장 향료 크리에이션·어플리케이션) 프로필 웹사이트. 산호초·조개 바다 도트 테마, 모바일 지원. 글은 `content.js`, 도트는 `app.js`의 `pixel.ART`(테두리 자동), 설계는 `prd.md` |
| `DemoWeb/` | 스카이 웨딩 축하 방명록(닉네임·100자 축하글·비밀번호). 이 저장소에서 유일하게 Next.js 16 · shadcn/ui · TypeScript를 쓴다(`npm run dev`, 포트 3000, Vercel은 Root Directory `DemoWeb`). 데이터는 Neon PostgreSQL `guestbook` 테이블(`.env.local`의 `DATABASE_URL`, git 제외), 쓰기는 `src/lib/actions.ts`의 Server Actions. `/api/posts`는 `shooting.py`가 읽으니 응답 모양(`{posts: [{id, title, author}]}`)을 바꾸지 말 것. `/entrance`는 하객 입장 애니메이션, `/game/index.html`은 pygbag 웹 게임(`public/game/`, `shooting.py`를 고치면 `npm run build:game`으로 다시 빌드해 함께 커밋). 빌드 스크립트가 글꼴 힌팅을 빼고(fonttools), 클릭 대기 없이(`ume_block 0`) 시작하게 하고, 로딩 화면을 크림색으로 바꾸고, 미리 받을 파일 목록 `public/game/prefetch.json`을 쓴다. 입장 화면·게임 버튼이 그 목록을 미리 받는다(`lib/prefetch-game.ts`). 빌드한 게임만 보려면 launch.json `sky-wedding-game`(pygbag은 `localhost` 주소에선 개발용 CDN을 찾다 실패하므로 `127.0.0.1`로 연다) |
| `shooting.py` | "스카이 웨딩" 종스크롤 게임 (`shooting_v1.py`는 이전 버전). 결혼식장 하객이 DemoWeb 방명록 글을 말풍선으로 띄운다(서버가 꺼져 있으면 생략). 컴퓨터와 브라우저(pygbag, `IS_WEB`) 겸용이라 메인 루프는 `async`이고 매 프레임 `await asyncio.sleep(0)`, 터치(누른 채 끌기·탭)로도 조작한다. 브라우저에선 numpy를 불러오면 화면이 안 만들어지므로 numpy는 `importlib`로만 불러오고 웹판은 `RisoLite`를 쓴다. 소리는 시작할 때 다 만들지 않고 `Audio.build()` 제너레이터를 매 프레임 `Audio.work()`로 조금씩 돌린다(웹 3초 안 시작 목표). 브라우저 믹서는 48000Hz라 소리는 `mixer.get_init()` 주파수에 맞춰 만들고, 한 샘플씩 도는 파이썬 반복문 대신 파형표+`map` 연산을 쓸 것 |

**스카이 웨딩 디자인 = 몽글몽글한 동화책 리소 인쇄.** 사용자가 원하는 분위기는 "몽글몽글한 동화 같은 이미지"다(참고: UKI 동물 옷 아이들, GANMO 리소 진, 망점 번짐 꽃). 픽셀 도트 느낌은 쓰지 않는다. 게임과 방명록이 같은 네 잉크(핑크 `#ff8ac4`, 옐로 `#ffde54`, 하늘 `#7eb4ea`, 초록 `#56b476`)와 크림색 종이 `#f9f1e6`, 검정 대신 남색 글씨 `#2e5470`, 둥근 주아(Jua) 글꼴을 쓰고, 하객·캐릭터는 동물 옷 아이들(토끼·병아리·개구리·고양이·곰·사자·양)이고, 신랑은 곰 옷·신부는 토끼 옷·주례는 양 옷이다(게임 `CostumePainter`·`Person`, 방명록 `costume-kid.tsx`). 캐릭터 색은 잉크 색 그대로 써야 인쇄 효과에서 지저분한 망점으로 풀리지 않는다. 게임은 `Riso` 클래스가 매 프레임 단색 면은 꽉 차게, 그러데이션은 둥근 망점으로 찍고 판을 어긋나게 겹친다(numpy, 프레임당 약 12ms라 60fps 예산이 빠듯하니 무거운 처리를 더하지 말 것). 글꼴은 루트 `fonts/Jua-Regular.ttf`, 주아에 없는 ♥★ 같은 글자는 `render_text`가 시스템 글꼴로 대신 그린다. 방명록은 `DemoWeb/src/app/globals.css`의 토큰과 `.misprint`·`.riso-card`·`.halftone`·`.print-btn`, 그림은 `components/costume-kid.tsx`. 한쪽 색·캐릭터를 바꾸면 다른 쪽도 맞출 것
| `taktak/` | "탁탁땀땀드르륵": 사진에 타자기 글씨·십자수·리소 인쇄를 입히는 모바일 웹앱(PWA, 사용자 혼자 씀, 갤럭시). `html[data-theme]`을 `type`/`stitch`/`riso`로 바꿔 전환(todolist 테마 방식). 그림은 `engine.js`(잉크 번짐, X땀, 종이 띠·리본, 필름 노이즈), 화면·손가락 입력은 `app.js`, 딩벳은 `dingbats.js`(십자수는 칸 도안, 타자기는 활자 기호로 따로). 타자기 한글은 은타자 `fonts/UnTaza.woff2`(GPL v2, `UnTaza-COPYING.txt` 같이 둘 것)이고 획이 가늘어 잉크 번짐을 키우면 뭉개진다. 리본 기능은 사용자가 원치 않아 뺐다(가벼운 서비스 선호). 세 번째 컨셉 리소(`data-theme="riso"`)는 사진까지 바꾼다: `engine.js`의 `PALETTES`(흑백·파스텔·빈티지·형광)와 `risoPrint`가 판을 나눠 망점으로 찍고, 사용자는 큰 망점·많은 겹침·삐뚤게 밀린 판과 엽서 여백을 좋아한다. `data-only`는 띄어쓰기로 여러 컨셉을 쓸 수 있다. 글씨 하나를 조각 캔버스로 구워 두고 끌 때는 다시 붙이기만 하니, 끄는 중에 조각을 다시 굽지 말 것. 한글 십자수는 갈무리(또박또박) 또는 20칸 이상 필기체. 로컬 확인은 launch.json `taktak`(포트 8128) |
| `breakout.py`, `snake.py`, `tetris.html` | 작은 게임들 |

## 실행

```bash
# 웹 앱 (.claude/launch.json 에 정의됨)
python -m http.server 8123 --bind 127.0.0.1 --directory todolist      # todolist
python -m http.server 8124 --bind 127.0.0.1 --directory english-dict  # english-dict 로컬판
python -m http.server 8125 --bind 127.0.0.1 --directory demoport      # demoport

# 게임 (pygame 필요, 그림·소리 모두 코드로 생성)
python shooting.py

# 도구
python -I todolist/tools/sprites.py [--print]   # 24x24 캐릭터 도트 JSON 생성 / 터미널 미리보기
python english-dict/tools/build_cloud.py        # cloud/ → cloud/dist/yeongdong.html 한 파일로 빌드
```

## todolist

- **데스크탑 전용.** 모바일 화면 작업은 하지 않는다.
- `app.js`는 모듈 객체들(`storage`, `journal`(일지 필드·구분 정의), `pixel`, `store`, `view`, `critters`, `theme`, `search`, `exporter`)을 한 파일에 담고 있다. 데이터는 `localStorage`의 `todayTodo.v1.todos` 하나에 저장되며, 이전 버전 데이터는 `storage.normalize()`에서 보정한다. 필드를 추가하면 여기서 기본값을 채워야 기존 사용자 데이터가 깨지지 않는다.
- 퀘스트는 두 종류다: `daily`(오늘의 노동, 난이도 `weed`/`hunt`, 마감 `due`)와 `story`(장기, `steps`, 일자별 `schedule[]` 안에 세부 `steps`와 `memo`).
- **업무일지 양식이 핵심 요구사항이다.** 모든 퀘스트에는 일지 필드(`category`, `company`, `product`, `researcher`, `bm`, `qa`, `note`)가 붙고, `exporter`가 실제 업무일지와 같은 양식의 xlsx를 만든다(구분별 최소 줄 수, A열 병합, 맑은 고딕 9pt 등). ExcelJS는 버튼을 누를 때만 CDN에서 불러온다. 일지 양식 호환을 깨지 않아야 하고, 중요 일정은 완료해도 사라지면 안 된다.
- 캐릭터 도트는 `tools/sprites.py`로 만들고, 출력한 JSON을 `app.js`의 `pixel.ART`에 넣는다.
- 계절 테마는 `theme` 모듈의 `THEMES` 배열에서 관리한다.
- **DB 모드 (Neon + Vercel).** `api/`(session·login·quests)와 `app.js`의 `sync` 모듈이 퀘스트를 Neon `quests` 표(퀘스트 한 개 = `jsonb` 한 줄)와 맞춘다. `/api/session`이 없으면(python http.server) 브라우저 저장 모드로 동작한다. Neon 프로젝트 TO DO LIST_CHIIKAWA의 `main` = 백지 템플릿, `FOR COMPANY TASK` = 실제 데이터. 표 구조는 `db/migrations/NNN_*.sql`을 추가하고 `npm --prefix todolist run migrate`로 두 브랜치에 같이 적용한다. 비밀 값은 `todolist/.env`(git 제외), 로컬 확인은 `npm --prefix todolist run dev`(포트 8126). 자세한 건 `todolist/README.md`.
- `prd.md`는 설계 기록이다. 기능이 바뀔 때마다 버전별 장(§12 v0.2 → §17 v0.8 …)을 덧붙여 왔으니, 큰 변경을 하면 새 장을 추가한다.

## english-dict

두 버전이 거의 같은 구조로 따로 존재한다. 한쪽을 고치면 다른 쪽에도 반영해야 하는지 확인할 것.

- **로컬판** (`english-dict/index.html`, `app.js`): API 키 없이 무료 도구만 쓴다 — Free Dictionary, Wiktionary, Chrome 내장 Translator → MyMemory, Tesseract.js OCR, 브라우저 음성인식. 사용자는 유료 Claude API를 쓰기 싫어하므로 API 키를 넣지 않는다.
- **로컬판 배포**: Vercel 프로젝트 `english-dict` → https://english-dict-beryl.vercel.app . GitHub `vibe_demo` 저장소에 연결돼 있어 **master에 push하면 자동 배포**된다(다른 프로젝트 커밋에도 함께 돈다). Root Directory가 `english-dict`여야 한다. 저장소 루트로 돌아가면 index.html이 없어 주소가 404가 된다. `.vercelignore`가 `cloud/`·`tools/`를 뺀다. 이 설정에서 `english-dict` 폴더의 `vercel deploy`는 경로가 겹쳐 실패하니 수동 재배포는 `vercel redeploy <배포 주소> --environment production`을 쓴다. 사용자는 이 개발용 노트북이 아닌 다른 노트북에서 배포 주소로 쓴다. 데이터는 DB 없이 각 브라우저 localStorage에만 있다.
- 빌드 결과(`dist/`)와 `__pycache__`는 루트 `.gitignore`로 git에서 뺐다. `cloud/dist/yeongdong.html`은 로컬에서만 만들어 Artifact로 게시하고 GitHub에는 올리지 않는다. (예외: `DemoWeb/public/game/`의 웹 게임 빌드는 Vercel이 내주므로 커밋한다.)
- **claude.ai판** (`english-dict/cloud/`): Artifact 런타임의 `window.claude.use("sample")`(AI 채점·첨삭)과 `"downloads"`를 쓴다. claude.ai는 외부 fetch·외부 글꼴·마이크를 막으므로, `build_cloud.py`가 Galmuri 글꼴(`tools/fonts/*.woff2`)을 data URI로 넣고 CSS/JS를 인라인해서 `cloud/dist/yeongdong.html` 한 파일로 만든다. cloud 소스를 고치면 다시 빌드한 뒤 같은 파일 경로로 Artifact를 재게시한다.
