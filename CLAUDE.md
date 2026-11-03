# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 개요

서로 독립된 개인 프로젝트 모음이다. 빌드 시스템, 테스트, 린터는 없다. 모든 웹 앱은 프레임워크 없는 정적 HTML/CSS/바닐라 JS이고, 게임은 단일 파일 pygame 스크립트다. 사용자에게는 한국어로 답하고, 코드 주석·문서도 한국어로 쓴다.

| 경로 | 내용 |
|---|---|
| `todolist/` | 업무용 퀘스트 보드 웹앱 (가장 활발한 프로젝트) |
| `english-dict/` | 원서 읽기용 전자사전 "YEONGDONG" (로컬판 + claude.ai판) |
| `demoport/` | 조향사(향장 향료 크리에이션·어플리케이션) 프로필 웹사이트. 산호초·조개 바다 도트 테마, 모바일 지원. 글은 `content.js`, 도트는 `app.js`의 `pixel.ART`(테두리 자동), 설계는 `prd.md` |
| `DemoWeb/` | 익명 게시판. 이 저장소에서 유일하게 Next.js 16 · shadcn/ui · TypeScript를 쓴다(`npm run dev`, 포트 3000). 데이터는 Neon PostgreSQL(`.env.local`의 `DATABASE_URL`, git 제외), 쓰기는 `src/lib/actions.ts`의 Server Actions. `/api/posts`는 `shooting.py`가 읽으니 응답 모양(`{posts: [{id, title, author}]}`)을 바꾸지 말 것 |
| `shooting.py` | "스카이 웨딩" 종스크롤 게임 (`shooting_v1.py`는 이전 버전). 결혼식장 하객이 DemoWeb 게시글을 말풍선으로 띄운다(서버가 꺼져 있으면 생략) |
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
- `prd.md`는 설계 기록이다. 기능이 바뀔 때마다 버전별 장(§12 v0.2 → §17 v0.8 …)을 덧붙여 왔으니, 큰 변경을 하면 새 장을 추가한다.

## english-dict

두 버전이 거의 같은 구조로 따로 존재한다. 한쪽을 고치면 다른 쪽에도 반영해야 하는지 확인할 것.

- **로컬판** (`english-dict/index.html`, `app.js`): API 키 없이 무료 도구만 쓴다 — Free Dictionary, Wiktionary, Chrome 내장 Translator → MyMemory, Tesseract.js OCR, 브라우저 음성인식. 사용자는 유료 Claude API를 쓰기 싫어하므로 API 키를 넣지 않는다.
- **claude.ai판** (`english-dict/cloud/`): Artifact 런타임의 `window.claude.use("sample")`(AI 채점·첨삭)과 `"downloads"`를 쓴다. claude.ai는 외부 fetch·외부 글꼴·마이크를 막으므로, `build_cloud.py`가 Galmuri 글꼴(`tools/fonts/*.woff2`)을 data URI로 넣고 CSS/JS를 인라인해서 `cloud/dist/yeongdong.html` 한 파일로 만든다. cloud 소스를 고치면 다시 빌드한 뒤 같은 파일 경로로 Artifact를 재게시한다.
