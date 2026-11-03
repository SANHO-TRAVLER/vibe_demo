"""스카이 웨딩 게임(../shooting.py)을 브라우저용으로 빌드해 public/game/ 에 넣는다.

    python scripts/build-game.py      (또는 npm run build:game)

pygbag 이 파이썬+pygame 을 웹어셈블리로 돌린다 (pip install pygbag 필요).
게임 코드를 고치면 이 스크립트를 다시 돌리고 public/game/ 을 함께 커밋한다.
방명록 사이트의 /game/ 에서 열리고, 같은 사이트의 /api/posts 로 하객 말풍선을 받아 온다.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

demo = Path(__file__).resolve().parent.parent      # DemoWeb/
root = demo.parent                                  # 저장소 루트 (shooting.py, fonts/)
out = demo / "public" / "game"


def dress_page(page):
    """pygbag 기본 페이지(회색 바탕·초록 상자·디버그 터미널)를 스카이 웨딩 로딩 화면으로 바꾼다.
    - 디버그용 터미널(xterm.js)은 내려받지 않는다
    - 크림색 종이 위에 남색 주아 느낌 글씨, 핑크 테두리 딱지"""
    html = page.read_text(encoding="utf-8")
    swaps = [
        ('xtermjs : "1"', 'xtermjs : "0"'),
        ('platform.document.body.style.background = "#7f7f7f"',
         'platform.document.body.style.background = "#f9f1e6"'),
        ('"Ready to start ! Please click/touch page"', '"화면을 눌러 시작해 주세요 ♥"'),
        # 딱지는 CSS 로 화면 가운데에 (pygbag 의 가운데 맞춤 함수는 불릴 때도 안 불릴 때도 있어 위치를 안 건드리게)
        ("background: green;", "background: #fff; border: 3px solid #ff8ac4; border-radius: 18px;"
                               " inset: 0; margin: auto; width: fit-content; height: fit-content;"),
        ('infobox.style.left = left + "px";', ""),
        ('infobox.style.top = top + "px";', ""),
        ("color: blue;", "color: #2e5470; font: 18px 'Malgun Gothic', sans-serif;"),
        ("background-color:powderblue;", "background-color:#f9f1e6;"),
        (">Downloading...<", ">스카이 웨딩 준비 중...<"),
        (">Loading, please wait ...<", ">스카이 웨딩 준비 중... ♥<"),
    ]
    for old, new in swaps:
        if old not in html:
            sys.exit(f"pygbag 페이지 모양이 바뀌었습니다. build-game.py 의 dress_page 를 고쳐 주세요: {old!r}")
        html = html.replace(old, new)
    page.write_text(html, encoding="utf-8")


def write_prefetch_list(game):
    """방명록 입장 화면이 게임 파일을 미리 받아 두도록(src/lib/prefetch-game.ts) 받을 파일 목록을 쓴다.
    pygbag 이 여는 파이썬 실행 파일(약 9MB)·pygame·게임 묶음이다. 미리 받아 두면 게임이 3초쯤 빨리 뜬다."""
    html = (game / "index.html").read_text(encoding="utf-8")
    cdn = re.search(r'cdn : "([^"]+)"', html).group(1)              # .../cdn/0.9.3/
    py = re.search(r'PYBUILD : "([\d.]+)"', html).group(1).replace(".", "")   # 312
    root = cdn.rstrip("/").rsplit("/", 1)[0] + "/"                   # .../cdn/
    urls = [cdn + "pythons.js", f"{cdn}cpython{py}/main.js", f"{cdn}cpython{py}/main.data",
            f"{cdn}cpython{py}/main.wasm", cdn + "cpythonrc.py", "/game/sky-wedding.tar.gz"]
    index = f"{root}index-{cdn.rstrip('/').rsplit('/', 1)[1]}-cp{py}.json"
    try:    # pygame 바퀴(whl) 파일 이름은 pygbag 패키지 목록에서 찾는다
        with urllib.request.urlopen(index, timeout=20) as res:
            wheel = json.load(res)["pygame"]
        urls += [index, root + wheel.replace("<abi>", f"cp{py}").replace("<api>", "wasm32_bi_emscripten")]
    except Exception as e:
        print("pygame 파일 이름을 못 찾아 미리 받기 목록에서 뺍니다:", e)
    (game / "prefetch.json").write_text(json.dumps(urls, indent=1), encoding="utf-8")


def slim_font(path):
    """주아 글꼴에서 화면 크기별 보정 정보(힌팅)만 빼 내려받을 양을 줄인다 (압축 719KB → 384KB).
    글자 모양과 글자 수는 그대로다. fontTools 가 없으면 원래 글꼴을 그대로 쓴다 (pip install fonttools)."""
    try:
        from fontTools import subset
    except ImportError:
        print("fontTools 가 없어 글꼴을 줄이지 않습니다 (pip install fonttools)")
        return
    before = path.stat().st_size
    subset.main([str(path), "--glyphs=*", "--unicodes=*", "--no-hinting", "--drop-tables+=DSIG",
                 "--name-IDs=*", "--notdef-outline", f"--output-file={path}"])
    print(f"글꼴 {before // 1024} KB → {path.stat().st_size // 1024} KB")


with tempfile.TemporaryDirectory() as tmp:
    app = Path(tmp) / "sky-wedding"
    app.mkdir()
    # pygbag 은 폴더 전체를 묶으므로 게임에 필요한 것만 따로 담는다
    shutil.copy(root / "shooting.py", app / "main.py")
    shutil.copytree(root / "fonts", app / "fonts")
    slim_font(app / "fonts" / "Jua-Regular.ttf")
    subprocess.run(
        [sys.executable, "-m", "pygbag", "--build", "--app_name", "sky-wedding",
         "--title", "Sky Wedding", "--ume_block", "0", str(app)],
        check=True,
        env={**os.environ, "PYTHONUTF8": "1"},   # 한글 주석이 든 코드를 윈도우 기본 인코딩으로 읽지 않게
    )
    built = app / "build" / "web"
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(built, out)
    dress_page(out / "index.html")
    write_prefetch_list(out)

for f in sorted(out.iterdir()):
    print(f"{f.relative_to(demo)}  {f.stat().st_size // 1024} KB")
