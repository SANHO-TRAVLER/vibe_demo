"""cloud/ 소스를 claude.ai 아티팩트용 HTML 한 파일로 묶는다.

python tools/build_cloud.py  ->  cloud/dist/yeongdong.html
글꼴(Galmuri)은 tools/fonts/*.woff2 를 data URI 로 넣는다 (claude.ai 는 외부 글꼴 CSS 를 막음).
"""
import base64, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
cloud = root / "cloud"
fonts = root / "tools" / "fonts"

html = (cloud / "index.html").read_text(encoding="utf-8")
title = re.search(r"<title>(.*?)</title>", html).group(1)
body = re.search(r"<body>(.*?)<script src=", html, re.S).group(1)

faces = "".join(
    f'@font-face{{font-family:"{f.stem}";src:url(data:font/woff2;base64,{base64.b64encode(f.read_bytes()).decode()}) format("woff2");font-display:swap}}\n'
    for f in sorted(fonts.glob("*.woff2"))
)
css = (cloud / "style.css").read_text(encoding="utf-8")
js = (cloud / "app.js").read_text(encoding="utf-8")

out = f"""<title>{title}</title>
<style>
{faces}{css}
</style>
{body.strip()}
<script>
{js}
</script>
"""
dist = cloud / "dist"
dist.mkdir(exist_ok=True)
(dist / "yeongdong.html").write_text(out, encoding="utf-8")
print("built", dist / "yeongdong.html", f"{len(out.encode()) / 1e6:.2f} MB")
