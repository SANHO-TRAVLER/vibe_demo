"""스카이 웨딩 게임(../shooting.py)을 브라우저용으로 빌드해 public/game/ 에 넣는다.

    python scripts/build-game.py      (또는 npm run build:game)

pygbag 이 파이썬+pygame 을 웹어셈블리로 돌린다 (pip install pygbag 필요).
게임 코드를 고치면 이 스크립트를 다시 돌리고 public/game/ 을 함께 커밋한다.
방명록 사이트의 /game/ 에서 열리고, 같은 사이트의 /api/posts 로 하객 말풍선을 받아 온다.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

demo = Path(__file__).resolve().parent.parent      # DemoWeb/
root = demo.parent                                  # 저장소 루트 (shooting.py, fonts/)
out = demo / "public" / "game"

with tempfile.TemporaryDirectory() as tmp:
    app = Path(tmp) / "sky-wedding"
    app.mkdir()
    # pygbag 은 폴더 전체를 묶으므로 게임에 필요한 것만 따로 담는다
    shutil.copy(root / "shooting.py", app / "main.py")
    shutil.copytree(root / "fonts", app / "fonts")
    subprocess.run(
        [sys.executable, "-m", "pygbag", "--build", "--app_name", "sky-wedding",
         "--title", "Sky Wedding", "--ume_block", "1", str(app)],
        check=True,
        env={**os.environ, "PYTHONUTF8": "1"},   # 한글 주석이 든 코드를 윈도우 기본 인코딩으로 읽지 않게
    )
    built = app / "build" / "web"
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(built, out)

for f in sorted(out.iterdir()):
    print(f"{f.relative_to(demo)}  {f.stat().st_size // 1024} KB")
