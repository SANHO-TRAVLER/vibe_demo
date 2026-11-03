"""24x24 캐릭터 도트 생성기.

타원·사각형을 쌓아 몸을 만들고, 바깥 테두리를 자동으로 그린 뒤 얼굴을 찍는다.
실행하면 {이름: [행 문자열...]} JSON을 출력한다 (app.js의 pixel.ART에 넣는다).
    python -I tools/sprites.py           # JSON
    python -I tools/sprites.py --print   # 터미널에서 모양 확인
"""
import json
import math
import sys

N = 24


class Canvas:
    def __init__(self, w=N, h=N):
        self.w, self.h = w, h
        self.g = [['.'] * w for _ in range(h)]

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = c

    def get(self, x, y):
        return self.g[y][x] if 0 <= x < self.w and 0 <= y < self.h else '.'

    def ellipse(self, cx, cy, rx, ry, c, where=None):
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    if where is None or where(x, y):
                        self.g[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def recolor(self, frm, to, where):
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] in frm and where(x, y):
                    self.g[y][x] = to

    def outline(self, c='k'):
        filled = [[v != '.' for v in row] for row in self.g]
        for y in range(self.h):
            for x in range(self.w):
                if filled[y][x]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < self.w and 0 <= ny < self.h and filled[ny][nx]:
                        self.g[y][x] = c
                        break

    def paste(self, other):
        """다른 캔버스의 칠한 칸을 위에 덮어 그린다 (같은 크기)."""
        for y in range(self.h):
            for x in range(self.w):
                if other.g[y][x] != '.':
                    self.g[y][x] = other.g[y][x]

    def pts(self, c, *xy):
        for x, y in xy:
            self.px(x, y, c)

    def rows(self):
        return [''.join(r) for r in self.g]


def blob(cv, c, head_cy=10.5, head_rx=10, head_ry=7.6, body_rx=6.8):
    """치이카와류 기본형: 넓고 둥근 머리에 몸이 붙은 찹쌀떡 + 짧은 팔과 발."""
    cv.ellipse(11.5, head_cy, head_rx, head_ry, c)
    cv.ellipse(11.5, 18.2, body_rx, 3.6, c)
    cv.ellipse(3.6, 15.6, 1.5, 1.3, c)    # 팔
    cv.ellipse(19.4, 15.6, 1.5, 1.3, c)
    cv.rect(7, 21, 9, 21, c)              # 발 (가운데는 비움)
    cv.rect(14, 21, 16, 21, c)


def dot_eyes(cv, y=10, lx=7, rx=15, w=2, h=2):
    for ex in (lx, rx):
        cv.rect(ex, y, ex + w - 1, y + h - 1, 'e')


def blush(cv, y=12, lx=3, rx=18, w=3):
    for bx in (lx, rx):
        cv.rect(bx, y, bx + w - 1, y, 'p')


def open_mouth(cv, y=12):
    """작게 벌린 입: 테두리 + 분홍 혀."""
    cv.pts('k', (10, y), (13, y), (10, y + 1), (13, y + 1), (11, y + 2), (12, y + 2))
    cv.pts('R', (11, y), (12, y), (11, y + 1), (12, y + 1))


def chiikawa():
    cv = Canvas()
    cv.ellipse(4.6, 4.4, 1.9, 1.8, 'w')   # 작고 둥근 귀
    cv.ellipse(18.4, 4.4, 1.9, 1.8, 'w')
    blob(cv, 'w')
    cv.outline()
    dot_eyes(cv)
    blush(cv)
    open_mouth(cv)
    return cv.rows()


def hachiware():
    cv = Canvas()
    cv.ellipse(6.2, 3.8, 3.7, 2.8, 'v')    # 둥근 귀 — 리본처럼 두 덩이
    cv.ellipse(16.8, 3.8, 3.7, 2.8, 'v')
    blob(cv, 'w')
    cv.ellipse(20.6, 19.4, 1.8, 1.2, 'v')  # 파란 꼬리
    # 머리 위는 파랑, 가운데로 좁은 흰 홈이 올라간다
    cv.recolor('w', 'v', lambda x, y: y <= 6 and abs(x - 11.5) > 1)
    cv.outline()
    for ex in (7, 15):                     # 반짝이는 동그란 눈
        cv.rect(ex, 9, ex + 1, 10, 'e')
        cv.px(ex + 1, 9, 'w')
    blush(cv)
    cv.pts('k', (10, 12), (11, 13), (12, 13), (13, 12), (11, 12), (12, 12))   # ω 입
    cv.pts('w', (11, 12), (12, 12))
    return cv.rows()


def usagi():
    cv = Canvas()
    cv.ellipse(8.2, 5, 1.8, 5.2, 'u')     # 길쭉한 귀
    cv.ellipse(14.8, 5, 1.8, 5.2, 'u')
    cv.ellipse(11.5, 12.4, 8.2, 5.6, 'u')  # 머리
    cv.ellipse(11.5, 18.6, 5, 3.4, 'u')    # 가는 몸
    cv.ellipse(5.8, 17, 1.3, 1.2, 'u')
    cv.ellipse(17.2, 17, 1.3, 1.2, 'u')
    cv.rect(8, 21, 10, 21, 'u')
    cv.rect(13, 21, 15, 21, 'u')
    cv.outline()
    dot_eyes(cv, y=11, lx=8, rx=15, w=1, h=2)
    blush(cv, y=13, lx=5, rx=16)
    cv.pts('k', (11, 14), (12, 14))
    return cv.rows()


def armor():
    cv = Canvas()
    cv.ellipse(11.5, 7, 6.6, 5.6, 'a')     # 투구
    cv.ellipse(11.5, 16, 6.4, 4.6, 'a')    # 갑옷 몸통
    cv.ellipse(4.6, 14.5, 1.6, 2.6, 'a')   # 팔
    cv.ellipse(18.4, 14.5, 1.6, 2.6, 'a')
    cv.rect(8, 20, 10, 22, 'a')            # 다리
    cv.rect(13, 20, 15, 22, 'a')
    cv.outline()
    cv.recolor('a', 'A', lambda x, y: x in (11, 12) and 2 <= y <= 5)   # 투구 능선
    cv.recolor('a', 'A', lambda x, y: x in (7, 8) and 4 <= y <= 5)     # 반사광
    cv.rect(7, 7, 16, 8, 'k')                                           # 바이저
    for x in (9, 11, 13, 15):
        cv.px(x, 9, 'k')                                                # 숨구멍 창살
    cv.rect(7, 13, 16, 13, 'k')                                         # 가슴판 이음새
    cv.rect(8, 18, 15, 18, 'b')                                         # 허리띠
    return cv.rows()


def shisa():
    cv = Canvas()
    for cx in (2.4, 20.6):                 # 머리 양옆에만 있는 곱슬 갈기
        for cy in (6.6, 9.8, 13):
            cv.ellipse(cx, cy, 2.1, 1.9, 'o')
    cv.ellipse(5.6, 3.6, 2, 1.9, 'h')      # 작고 둥근 귀
    cv.ellipse(17.4, 3.6, 2, 1.9, 'h')
    blob(cv, 'h', head_rx=9)
    cv.rect(11, 22, 12, 22, 'o')           # 꼬리 끝
    cv.outline()
    # 앞섶이 열린 빨간 셔츠 (가운데로 크림색 배가 보인다)
    cv.recolor('h', 'R', lambda x, y: 16 <= y <= 20 and abs(x - 11.5) >= 2.5)
    cv.pts('w', (7, 17), (8, 19), (16, 19), (17, 17))             # 꽃무늬
    for cx in (2, 21):                     # 갈기 컬 무늬
        cv.pts('O', (cx, 8), (cx, 11))
    cv.pts('o', (5, 3), (6, 4), (18, 3), (17, 4))                 # 귀 안쪽
    cv.pts('o', (6, 6), (7, 7), (8, 6), (15, 6), (16, 7), (17, 6))   # 하트 모양 눈썹
    for ex in (7, 15):
        cv.rect(ex, 9, ex + 1, 10, 'e')
        cv.px(ex + 1, 9, 'w')
    blush(cv, y=11, lx=4, rx=17)
    open_mouth(cv, y=11)
    return cv.rows()


def kurimanju():
    cv = Canvas()
    cv.ellipse(11.5, 12, 10.4, 7.6, 'm')   # 넓적한 만주 몸
    cv.ellipse(11.5, 5.6, 4.8, 2.6, 'c')   # 위에 얹힌 밤색 뚜껑
    cv.ellipse(3.4, 15, 1.4, 1.3, 'm')
    cv.ellipse(19.6, 15, 1.4, 1.3, 'm')
    cv.rect(7, 19, 9, 21, 'm')
    cv.rect(14, 19, 16, 21, 'm')
    cv.outline()
    cv.pts('C', (9, 4), (10, 4), (8, 5))   # 뚜껑 반사광
    dot_eyes(cv, y=11, lx=7, rx=15)
    blush(cv, y=13, lx=4, rx=17)
    cv.pts('k', (11, 14), (12, 14))
    return cv.rows()


def momonga():
    cv = Canvas()
    # 뒤로 크게 펼친 복슬복슬한 꼬리
    cv.ellipse(15.8, 10.6, 6.8, 9.4, 's')
    for i in range(9):
        t = -math.pi / 2 + i / 8 * math.pi
        cv.ellipse(15.8 + 6.8 * math.cos(t), 10.6 + 9.4 * math.sin(t), 1.4, 1.4, 's')
    cv.ellipse(5.4, 4.6, 2.6, 2.6, 'w')    # 둥근 귀
    cv.ellipse(15.6, 4.6, 2.6, 2.6, 'w')
    cv.ellipse(10.5, 11.2, 8.8, 6.8, 'w')  # 머리 (꼬리 앞에서 왼쪽으로 조금)
    cv.ellipse(10.5, 18.4, 6, 3.4, 'w')
    cv.rect(6, 21, 8, 21, 'w')
    cv.rect(12, 21, 14, 21, 'w')
    cv.outline()
    for i in range(9):                     # 꼬리 털결
        t = -math.pi / 2 + (i + 0.5) / 8 * math.pi * 0.9
        for r in (0.55, 0.8):
            x, y = round(15.8 + 6.8 * r * math.cos(t)), round(10.6 + 9.4 * r * math.sin(t))
            if cv.g[y][x] == 's':
                cv.px(x, y, 'S')
    cv.pts('S', (5, 4), (5, 5), (15, 4), (15, 5))   # 귀 안쪽 선
    cv.ellipse(2.6, 13.4, 1.4, 1.4, 'w')   # 볼에 댄 손
    cv.ellipse(18.4, 13.4, 1.4, 1.4, 'w')
    cv.pts('k', (1, 13), (2, 12), (3, 12), (19, 12), (18, 12), (20, 13))
    for ex in (5, 13):                     # 지그시 감은 눈 (눈꺼풀 + 눈동자)
        cv.rect(ex, 10, ex + 2, 10, 'k')
        cv.rect(ex, 11, ex + 2, 11, 'e')
        cv.px(ex + 2, 11, 'w')
    blush(cv, y=13, lx=4, rx=14, w=2)
    cv.pts('k', (9, 13), (10, 14), (11, 13))
    return cv.rows()


def kani():
    cv = Canvas()
    for cx in (6, 17):                     # 머리 위 꽃게 집게
        cv.ellipse(cx, 3, 2.6, 2.3, 'q')
        cv.rect(cx, 5, cx, 6, 'q')
    cv.ellipse(11.5, 12.6, 9.6, 8.6, 'P')  # 동그란 복숭앗빛 몸
    cv.ellipse(2.4, 18.4, 1.6, 1.8, 'g')   # 초록 가방
    cv.rect(8, 21, 9, 21, 'P')
    cv.rect(14, 21, 15, 21, 'P')
    cv.outline()
    cv.recolor('P', 'Q', lambda x, y: y <= 7)          # 분홍 머리 윗부분
    for cx in (6, 17):                     # 집게 홈
        cv.pts('.', (cx, 0))
        cv.pts('k', (cx, 1), (cx, 2))
    cv.pts('k', (2, 16), (3, 16))          # 가방 끈
    for ex in (8, 14):
        cv.rect(ex, 11, ex + 1, 12, 'e')
        cv.px(ex + 1, 11, 'w')
    blush(cv, y=14, lx=5, rx=16)
    cv.pts('k', (10, 14), (11, 15), (12, 15), (13, 14), (11, 14), (12, 14))   # ω 입
    cv.pts('P', (11, 14), (12, 14))
    cv.pts('k', (18, 15), (19, 16))        # 볼의 회오리
    return cv.rows()


def rakko():
    cv = Canvas()
    cv.ellipse(11.5, 11.6, 9.8, 9.4, 'l')  # 동글동글한 털뭉치
    cv.ellipse(20.8, 17.6, 2.2, 1.5, 'w')  # 바람에 날리는 스카프 끝
    cv.outline()
    # 보송한 털 느낌: 테두리를 한 칸씩 연하게
    cv.recolor('k', 'K', lambda x, y: (x + y) % 2 == 0 and not (18 <= x and 15 <= y <= 19))
    # 목에 두른 하얀 스카프
    cv.recolor('l', 'w', lambda x, y: y in (15, 16))
    cv.recolor('lw', 'k', lambda x, y: y in (14, 17) and 2 <= x <= 21)
    cv.pts('e', (10, 17), (11, 17), (12, 17), (13, 17), (11, 18), (12, 18))   # 스카프 매듭
    cv.pts('e', (4, 8), (3, 9), (4, 9), (5, 9), (4, 10))  # 반짝 표시
    for ex in (8, 14):                     # 작은 눈
        cv.rect(ex, 11, ex + 1, 11, 'e')
    blush(cv, y=12, lx=5, rx=16, w=2)
    cv.pts('k', (10, 13), (11, 14), (12, 14), (13, 13))
    return cv.rows()


# ---------- 오브제 ----------

def weeds(stage):
    """풀숲. stage 2=무성, 1=절반, 0=다 뽑아서 더미만 남음."""
    cv = Canvas()
    cv.rect(1, 20, 22, 21, 'b')                        # 흙
    tufts = {
        2: [(3, 8), (6, 12), (9, 9), (12, 14), (15, 10), (18, 12), (21, 8)],
        1: [(4, 6), (9, 5), (14, 7), (19, 5)],
        0: [],
    }[stage]
    for cx, h in tufts:                                # 가운데 줄기 + 양옆으로 휜 잎
        cv.rect(cx, 20 - h, cx, 19, 'g')
        for i in range(1, h // 2):
            cv.px(cx - 1 - i // 3, 20 - i * 2, 'g')
            cv.px(cx + 1 + i // 3, 21 - i * 2, 'g')
    if stage == 0:
        for y, x0, x1 in ((17, 5, 16), (18, 4, 18), (19, 6, 17)):   # 뽑은 풀 더미
            cv.rect(x0, y, x1, y, 'g')
        cv.rect(19, 16, 19, 19, 'g')                    # 새로 난 새싹 하나
        cv.pts('g', (18, 15), (20, 15))
    cv.outline()
    cv.recolor('g', 'G', lambda x, y: (x + y) % 3 == 0)
    return cv.rows()


def board(notes):
    """노동 게시판. notes = 꽂힌 공고 수 (0~4)."""
    cv = Canvas()
    cv.rect(5, 14, 6, 22, 'b')                         # 기둥
    cv.rect(17, 14, 18, 22, 'b')
    cv.rect(2, 3, 21, 14, 'W')                         # 판자
    cv.outline()
    for y in (6, 10):                                  # 나뭇결
        cv.rect(3, y, 20, y, 'X')
    for (x, y) in [(4, 5), (10, 5), (16, 5), (7, 10)][:notes]:
        cv.rect(x, y, x + 3, y + 3, 'w')               # 공고 종이
        cv.rect(x + 1, y + 2, x + 2, y + 2, 'K')       # 글씨
        cv.px(x + 1, y, 'R')                           # 압정
    return cv.rows()


def beer():
    """가득 찬 맥주잔. 잔 안은 맥주 12줄 : 거품 3줄 = 4:1, 거품은 잔 위로 몽글몽글 넘친다."""
    cv = Canvas()
    cv.rect(5, 7, 15, 21, 'y')                         # 맥주 (잔 안 7~21줄)
    for y in range(11, 18):                            # 손잡이
        cv.px(16, y, 'A'); cv.px(19, y, 'A')
    cv.rect(16, 10, 19, 10, 'A')
    cv.rect(16, 18, 19, 18, 'A')
    cv.rect(5, 7, 15, 9, 'w')                          # 거품 (잔 안 3줄)
    cv.ellipse(10, 7, 6.4, 2.1, 'w')                   # 잔 위로 몽글몽글 넘치는 거품
    cv.ellipse(7.5, 5.6, 2, 1.2, 'w')
    cv.ellipse(12, 5.4, 2.2, 1.3, 'w')
    cv.outline()
    cv.rect(17, 11, 18, 17, '.')                       # 손잡이 구멍
    cv.recolor('y', 'Y', lambda x, y: x >= 13)         # 오른쪽 그늘
    cv.recolor('w', 'A', lambda x, y: y == 9 and x % 2 == 0)   # 거품 아랫면 결
    cv.pts('w', (7, 13), (8, 16), (10, 12), (11, 18), (9, 20), (12, 15))   # 올라오는 기포
    cv.rect(6, 11, 6, 19, 'u')                         # 유리 반사광
    return cv.rows()


def ramen():
    cv = Canvas()
    cv.ellipse(11.5, 14, 10, 7, 'R', where=lambda x, y: y >= 13)   # 그릇
    cv.rect(8, 21, 15, 21, 'R')                                     # 굽
    cv.ellipse(11.5, 13, 10, 2.6, 'u')                              # 면
    for i, x in enumerate(range(15, 22)):                           # 젓가락
        cv.px(x, 12 - i, 'b'); cv.px(x + 1, 13 - i, 'b')
    cv.outline()
    cv.rect(3, 16, 20, 16, 'w')                                     # 그릇 무늬 띠
    cv.pts('R', (5, 16), (9, 16), (13, 16), (17, 16))
    cv.ellipse(7, 12.4, 1.8, 1.2, 'w')                              # 나루토
    cv.pts('p', (7, 12), (6, 12))
    cv.rect(11, 11, 13, 12, 'y'); cv.px(12, 12, 'Y')                # 달걀
    cv.rect(15, 11, 16, 13, 'G')                                    # 김
    for x, y in ((6, 8), (7, 7), (6, 6), (7, 5), (11, 7), (12, 6), (11, 5), (12, 4), (11, 3),
                 (16, 7), (17, 6)):                                 # 김(김이 모락모락)
        cv.px(x, y, 's')
    return cv.rows()


def bear_pochette():
    """달력 표시용 곰돌이 포셰트 얼굴 (14x12). F = 털색 — 화면에서 퀘스트 색으로 바꿔 칠한다."""
    return [
        '..kk......kk..',
        '.kFFk....kFFk.',
        '.kFFFkkkkFFFk.',
        'kFFFFFFFFFFFFk',
        'kFFeFFFFFFeFFk',
        'kFFFFweewFFFFk',
        'kFFFwwwwwwFFFk',
        'kFFFwewwewFFFk',
        'kFFFwweewwFFFk',
        '.kFFFwwwwFFFk.',
        '..kkFFFFFFkk..',
        '....kkkkkk....',
    ]


# ---------- 크리스마스 테마 ----------

def chubby_star(cv, cx, cy, R, ratio=0.56):
    """통통한 오각별 + '별 세 개'의 얼굴 (동그란 눈, 꽉 문 이빨). 자기 테두리를 가진 채로 cv 위에 덮는다."""
    star = Canvas(cv.w, cv.h)
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = R if i % 2 == 0 else R * ratio
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    def inside(px, py):
        hit = False
        for i in range(len(pts)):
            (x1, y1), (x2, y2) = pts[i], pts[i - 1]
            if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
                hit = not hit
        return hit

    for y in range(cv.h):
        for x in range(cv.w):
            if inside(x + 0.5, y + 0.5):
                star.g[y][x] = 'y'
    star.outline()
    ix, iy = int(cx), int(cy)
    star.recolor('y', 'Y', lambda x, y: x > ix + 2 and y > iy + 1)        # 오른쪽 아래 그늘
    for ex in (ix - 4, ix + 2):                                             # 동그란 눈 (흰자 + 눈동자)
        star.rect(ex, iy - 2, ex + 2, iy, 'w')
        star.px(ex + 1, iy - 1, 'e')
    star.rect(ix - 3, iy + 2, ix + 3, iy + 4, 'k')                         # 꽉 문 이빨
    for x in range(ix - 2, ix + 3):
        star.px(x, iy + 3, 'w' if (x - ix) % 2 == 0 else 'k')
    cv.paste(star)


def star_trio(cv, ox, oy, R=8.5):
    """치이카와의 '별 세 개': 위에 하나, 아래 둘 (위 별은 아래 별들 뒤에)."""
    chubby_star(cv, ox, oy, R)
    chubby_star(cv, ox - R * 0.95, oy + R * 1.2, R)
    chubby_star(cv, ox + R * 0.95, oy + R * 1.2, R)


def xmas_tree():
    """오너먼트가 빼곡한 큰 트리 + 꼭대기에 별 세 개 (64x88)."""
    import random
    W, H, CX = 64, 88, 32
    cv = Canvas(W, H)
    tiers = [(26, 40, 11), (34, 52, 17), (44, 64, 23), (56, 78, 30)]   # (위, 아래, 아래쪽 반폭)
    for top, bottom, hw in tiers:
        for y in range(top, bottom):
            half = 2 + (hw - 2) * (y - top) / (bottom - top - 1)
            for x in range(W):
                if abs(x + 0.5 - CX) <= half:
                    cv.g[y][x] = 'T'
    cv.rect(28, 78, 35, 85, 'b')                                            # 기둥
    cv.outline()
    cv.recolor('T', 'U', lambda x, y: (x + 0.5 - CX) > (y - 26) * 0.2 + 2)   # 오른쪽 그늘
    cv.recolor('T', 'V', lambda x, y: (CX - x - 0.5) > (y - 26) * 0.32 + 3 and (x + y) % 3 == 0)  # 왼쪽 반짝임
    # 금빛 갈랜드: 층마다 비스듬히 한 줄
    for top, bottom, hw in tiers:
        y0 = top + (bottom - top) * 0.6
        for x in range(W):
            y = round(y0 + (x - CX) * 0.28)
            if 0 <= y < H and cv.g[y][x] in 'TUV' and x % 2 == 0:
                cv.g[y][x] = 'Y'
    # 오너먼트: 서로 겹치지 않게 빼곡히
    rng = random.Random(7)
    spots = [(x, y) for y in range(28, 76) for x in range(W - 1)
             if all(cv.get(x + dx, y + dy) in 'TUV' for dx in (0, 1) for dy in (0, 1))]
    rng.shuffle(spots)
    chosen = []
    colors = ['D', 'y', 'B', 'w', 'D', 'y', 'A']
    for x, y in spots:
        if all((x - a) ** 2 + (y - b) ** 2 >= 18 for a, b in chosen):
            chosen.append((x, y))
    for i, (x, y) in enumerate(chosen):
        c = colors[i % len(colors)]
        cv.rect(x, y, x + 1, y + 1, c)
        cv.px(x, y, 'w' if c != 'w' else 'A')                               # 반짝 하이라이트
    star_trio(cv, CX, 9)
    return cv.rows()


def xmas_gifts():
    """트리 밑 선물 더미 (72x30)."""
    cv = Canvas(72, 30)
    # (x, y, w, h, 상자색, 리본색) — 뒤에 있는 것부터
    boxes = [
        (30, 9, 11, 8, 'D', 'w'), (47, 6, 10, 8, 'T', 'y'),
        (2, 15, 16, 14, 'D', 'y'), (16, 11, 12, 18, 'T', 'D'), (27, 17, 18, 12, 'w', 'D'),
        (44, 13, 14, 16, 'y', 'T'), (57, 18, 13, 11, 'B', 'w'),
    ]
    for x, y, w, h, body, ribbon in boxes:
        cv.rect(x, y, x + w - 1, y + h - 1, 'k')
        cv.rect(x + 1, y + 1, x + w - 2, y + h - 2, body)
        rx = x + w // 2 - 1
        ry = y + h // 2 - 1
        cv.rect(rx, y + 1, rx + 1, y + h - 2, ribbon)                     # 세로 리본
        cv.rect(x + 1, ry, x + w - 2, ry + 1, ribbon)                     # 가로 리본
        # 위에 나비 리본
        cv.pts(ribbon, (rx - 1, y - 1), (rx - 2, y - 2), (rx + 2, y - 1), (rx + 3, y - 2), (rx, y - 1), (rx + 1, y - 1))
        cv.pts('k', (rx - 3, y - 2), (rx - 2, y - 3), (rx + 3, y - 3), (rx + 4, y - 2))
    return cv.rows()


def snowflake():
    """동그란 픽셀 눈송이 (5x5)."""
    return [
        '.SSS.',
        'SwwwS',
        'SwwwS',
        'SwwwS',
        '.SSS.',
    ]


SPRITES = {
    'chiikawa': chiikawa, 'hachiware': hachiware, 'usagi': usagi, 'armor': armor,
    'shisa': shisa, 'kurimanju': kurimanju, 'momonga': momonga, 'kani': kani, 'rakko': rakko,
    'weeds2': lambda: weeds(2), 'weeds1': lambda: weeds(1), 'weeds0': lambda: weeds(0),
    **{f'board{n}': (lambda n=n: board(n)) for n in range(5)},
    'beer': beer,
    'ramen': ramen,
    'bear': bear_pochette,
    'xmasTree': xmas_tree, 'xmasGifts': xmas_gifts, 'snowflake': snowflake,
}

if __name__ == '__main__':
    out = {k: f() for k, f in SPRITES.items()}
    if len(sys.argv) > 1 and sys.argv[1] == '--print':
        for k, rows in out.items():
            print(k)
            print('\n'.join(rows).replace('.', ' '))
    else:
        print(json.dumps(out))
