"""
스카이 웨딩 (Sky Wedding)
손을 맞잡고 스카이다이빙하는 신랑과 신부가 하늘에서 결혼 준비물 7가지를 모은 뒤,
결혼식장으로 내려가 식을 올리는 평화로운 종스크롤 게임입니다.
pygame만 있으면 되고, 그림과 소리는 모두 코드로 만들어 냅니다.

화면은 몽글몽글한 동화책 리소 인쇄 느낌입니다. 매 프레임 그린 그림을
핑크·옐로·하늘·초록 네 가지 잉크로 나눠, 단색 면은 꽉 차게, 그러데이션은 둥근
망점으로 찍고, 판마다 살짝 어긋나게(misregistration) 겹친 뒤 종이 결을 얹습니다
(numpy 필요, 없으면 원래 색). 하객은 동물 옷을 입은 아이들이고,
신랑은 곰 옷, 신부는 토끼 옷, 주례 선생님은 양 옷을 입었습니다.
글꼴은 fonts/ 의 주아(Jua, SIL OFL)를 쓰고, 없으면 시스템 글꼴을 씁니다.

웹(휴대폰)판
  DemoWeb 방명록의 "게임 하기" 버튼으로 브라우저에서도 돌아갑니다. pygbag 이 이 파일을 웹어셈블리로
  바꾸며(DemoWeb: npm run build:game → public/game/), 웹판은 numpy 대신 가벼운 RisoLite 효과를 씁니다.
  휴대폰에선 화면을 누른 채 끌어서 이동하고, 화면을 누르면 시작합니다.

조작
  방향키 / WASD : 이동 (화면을 누른 채 끌어도 됨)
  M             : 소리 켜기/끄기
  R             : 리소 인쇄 효과 켜기/끄기
  Enter         : 시작 / 엔딩 후 처음으로 (엔딩 화면의 "처음부터 다시" 버튼과 같음)
  B             : 엔딩에서 축하 방명록 열기 ("방명록으로" 버튼과 같음, 웹판은 방명록으로 돌아감)
  ESC           : 종료

진행
  1. 하늘: 하트, 편지, 반지, 신랑 예복, 웨딩드레스, 일렉기타, 데이지 부케를 모읍니다.
     반짝이 별은 보너스, 새 떼에 부딪히면 잠깐 빙글빙글 돕니다.
  2. 7개를 다 모으면 하트 낙하산을 펴고 결혼식장으로 내려갑니다.
  3. 결혼식: 예복 갈아입기 → 편지 읽기 → 반지 교환 → 신부의 축가
     → 키스와 하트 축포 → HAPPILY EVER AFTER와 부케 던지기

게시판 연동
  DemoWeb 축하 방명록(웹 서버의 /api/posts)의 글 하나마다 하객 한 명이 정해져,
  결혼식장에서 그 축하 한마디를 말풍선으로 띄웁니다. 식 도중 새 글이 올라오면
  해당 하객이 폴짝 뛰며 NEW 말풍선을 띄웁니다. 게시판 웹 서버가 켜져 있어야 하며,
  꺼져 있으면 말풍선 없이 그대로 진행됩니다.
"""
import asyncio
import importlib
import json
import math
import os
import random
import sys
import threading
import time
import urllib.request
import webbrowser
from array import array
from pathlib import Path

import pygame


# ===== 기본 설정 =====
W, H = 480, 720
FPS = 60
SR = 22050                 # 효과음 샘플링 레이트
SCROLL = 1.4               # 하늘 장면 지면 스크롤 속도
FLOOR = 520                # 결혼식장 바닥(발) 높이
OFFICIANT_CHANCE = 0.12    # 주례 선생님이 부케를 받을 확률 (이스터에그)
FONT_DIR = Path(__file__).resolve().parent / "fonts"
IS_WEB = sys.platform == "emscripten"   # pygbag 으로 브라우저에서 돌아가는 중 (DemoWeb /game)

# 리소 인쇄 효과용 numpy (컴퓨터에서만). 브라우저(pygbag)에선 numpy 를 불러오기만 해도 pygame 화면이
# 안 만들어지므로 쓰지 않고 RisoLite 를 쓴다. pygbag 은 코드 속 import 문을 보고 패키지를 미리 받으니
# 문자열로 불러와 눈에 띄지 않게 한다.
try:
    np = None if IS_WEB else importlib.import_module("numpy")
except ImportError:
    np = None
TOUCH_LIFT = 70            # 터치로 움직일 때 신랑 신부가 손가락보다 이만큼 위에 오게(px)

# ===== 리소 인쇄 (몽글몽글 동화책) =====
RISO_PAPER = (249, 241, 230)           # 크림색 종이
RISO_SPECK = (232, 216, 198)           # 종이 섬유 얼룩
# 잉크: (이름, 색, 판 어긋남 dx, dy). DemoWeb 방명록도 같은 네 잉크를 쓴다.
# 겹쳐 찍히면 곱해져서 핑크+옐로=코랄, 핑크+하늘=보라, 하늘+초록=청록 … 이 된다.
RISO_INKS = [("pink", (255, 138, 196), 2, 1),
             ("yellow", (255, 222, 84), -2, 2),
             ("blue", (126, 180, 234), 0, 0),
             ("green", (86, 180, 118), 1, -1)]
INK = {name: color for name, color, _, _ in RISO_INKS}
INK_TEXT = (46, 84, 112)               # 글씨·선: 검정 대신 부드러운 남색 (GANMO 제목 색)
RISO_SCREEN = 6                        # 망점 간격(px). 45도로 기운 둥근 점
RISO_SPREAD = 40                       # 망점 세기. 작을수록 단색 면이 꽉 차고 그러데이션만 점이 된다
# DemoWeb 게시판 글 목록 API (다른 주소면 환경 변수 DEMOWEB_URL 로 바꾼다)
DEMOWEB_URL = os.environ.get("DEMOWEB_URL", "http://localhost:3000").rstrip("/")
BOARD_URL = DEMOWEB_URL + "/api/posts"
BOARD_POLL_SEC = 2.0       # 웹 서버에서 글 목록을 다시 받아 오는 간격(초)
BOARD_POLL_SEC_WEB = 6.0   # 웹판은 받아 오는 동안 화면이 잠깐 멈추므로 더 드물게
BOARD_POLL = 60            # 받아 둔 목록을 게임에 반영하는 간격(프레임)
# 글 번호 → 하객 자리. 연달아 쓴 글이 앞뒤 줄로 고루 퍼지도록 섞어 둔 순서
SEAT_ORDER = [4, 12, 1, 9, 7, 14, 2, 10, 5, 13, 0, 8, 6, 15, 3, 11]

ITEM_KINDS = ["heart", "letter", "ring", "tux", "dress", "guitar", "bouquet"]
ITEM_NAMES = {"heart": "하트", "letter": "편지", "ring": "반지",
              "tux": "신랑 예복", "dress": "웨딩드레스", "guitar": "일렉기타", "bouquet": "데이지 부케"}
ITEM_SHORT = {"heart": "하트", "letter": "편지", "ring": "반지",
              "tux": "예복", "dress": "드레스", "guitar": "기타", "bouquet": "부케"}

# ===== 색상 =====
GRASS = (88, 150, 76)
GRASS_LIGHT = (112, 172, 88)
FIELD = (196, 186, 120)
FLOWER_FIELD = (214, 150, 190)
FOREST = (52, 110, 58)
SAND = (214, 198, 150)
WATER = (70, 140, 200)
WATER_LIGHT = (130, 190, 230)
ROAD = (150, 144, 136)
WHITE = (255, 255, 255)
YELLOW = (255, 225, 90)
PINK = (255, 120, 170)
SUIT_YELLOW = (255, 210, 50)       # 신랑 신부 점프슈트: 개나리, 병아리 같은 노랑
HEART_PINKS = [(255, 105, 150), (255, 150, 185), (240, 60, 100),
               (255, 185, 205), (230, 40, 80), (255, 90, 120)]


# ===================================================================
# 공용 도구
# ===================================================================
def ease(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


def lerp(a, b, k):
    return a + (b - a) * k


def darker(c, k=0.78):
    return tuple(int(v * k) for v in c)


def load_font(size, bold=False):
    """둥글고 통통한 주아 글꼴(fonts/Jua-Regular.ttf). 원래 굵어서 bold 는 따로 없다.
    글꼴 파일이 없으면 시스템 한글 글꼴을 쓴다."""
    path = FONT_DIR / "Jua-Regular.ttf"
    if path.exists():
        return pygame.font.Font(str(path), size)
    for name in ("malgungothic", "applegothic", "nanumgothic", "notosanscjkkr"):
        path = pygame.font.match_font(name, bold=bold)
        if path:
            return pygame.font.Font(path, size)
    return pygame.font.Font(None, size)


def load_script_font(size):
    """세리프 필기체 글꼴 (없으면 이탤릭 세리프)"""
    for name in ("monotypecorsiva", "edwardianscriptitc", "palacescriptmt", "kunstlerscript",
                 "vivaldi", "scriptmtbold", "brushscriptmt", "segoescript",
                 "lucidahandwriting"):
        path = pygame.font.match_font(name)
        if path:
            return pygame.font.Font(path, size)
    path = pygame.font.match_font("georgia,timesnewroman,serif", italic=True)
    font = pygame.font.Font(path, size) if path else pygame.font.Font(None, size)
    font.set_italic(path is None)
    return font


# 하트 모양 (폭이 1인 단위 좌표)
HEART_UNIT = []
for _i in range(40):
    _t = math.tau * _i / 40
    _x = 16 * math.sin(_t) ** 3
    _y = 13 * math.cos(_t) - 5 * math.cos(2 * _t) - 2 * math.cos(3 * _t) - math.cos(4 * _t)
    HEART_UNIT.append((_x / 34, -(_y + 2.5) / 34))


def heart_poly(cx, cy, size, sx=1.0):
    return [(cx + ux * size * sx, cy + uy * size) for ux, uy in HEART_UNIT]


def draw_heart(s, color, cx, cy, size, sx=1.0):
    pygame.draw.polygon(s, color, heart_poly(cx, cy, size, sx))


_glow_cache = {}


def glow(radius, color):
    key = (radius, color)
    if key not in _glow_cache:
        g = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
        for r in range(radius, 0, -2):
            a = int(90 * (1 - r / radius) ** 1.5)
            pygame.draw.circle(g, (*color, a), (radius, radius), r)
        _glow_cache[key] = g
    return _glow_cache[key]


# ===================================================================
# 효과음 합성 (외부 파일 없이 코드로 소리 생성)
# ===================================================================
def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tone(freq, dur, wave="sine", vol=0.4, attack=0.005, decay=4.0,
         slide=None, drive=0.0, vibrato=0.0):
    n = int(dur * SR)
    out = [0.0] * n
    ph = 0.0
    tail = max(1, int(0.015 * SR))
    norm = math.tanh(drive) if drive else 1.0
    for i in range(n):
        t = i / SR
        f = freq if slide is None else freq + (slide - freq) * i / n
        if vibrato:
            f *= 1 + vibrato * math.sin(math.tau * 5.5 * t)
        ph += f / SR
        fr = ph - int(ph)
        if wave == "sine":
            v = math.sin(math.tau * ph)
        elif wave == "square":
            v = 0.6 if fr < 0.5 else -0.6
        elif wave == "saw":
            v = 2 * fr - 1
        else:  # triangle
            v = 4 * abs(fr - 0.5) - 1
        if drive:
            v = math.tanh(v * drive) / norm
        env = min(1.0, t / attack) * math.exp(-decay * t)
        if n - i < tail:
            env *= (n - i) / tail
        out[i] = v * env * vol
    return out


def noise(dur, vol=0.4, decay=8.0, smooth=0.0, attack=0.002, swell=False):
    n = int(dur * SR)
    out = [0.0] * n
    y = 0.0
    for i in range(n):
        t = i / SR
        y += (1 - smooth) * (random.uniform(-1, 1) - y)
        env = math.sin(math.pi * i / n) if swell else min(1.0, t / attack) * math.exp(-decay * t)
        out[i] = y * env * vol
    return out


def mix(dst, src, start=0):
    end = start + len(src)
    if end > len(dst):
        dst.extend([0.0] * (end - len(dst)))
    for i, v in enumerate(src):
        dst[start + i] += v
    return dst


def melody(seq, step, **kw):
    """seq: [(midi 또는 None, 길이(step 단위)), ...]"""
    buf, pos = [], 0.0
    for m, length in seq:
        if m is not None:
            mix(buf, tone(midi(m), length * step + 0.05, **kw), int(pos * SR))
        pos += length * step
    total = int(pos * SR)
    if len(buf) < total:
        buf.extend([0.0] * (total - len(buf)))
    return buf[:total]


class Audio:
    def __init__(self):
        self.sounds = {}
        self.muted = False
        self.music = None
        self.lengths = {}
        init = pygame.mixer.get_init()
        self.ok = bool(init) and init[1] == -16
        self.channels = init[2] if init else 1
        if self.ok:
            pygame.mixer.set_num_channels(16)
            self.build()

    def make(self, name, samples, volume=1.0):
        data = array("h", (int(max(-1.0, min(1.0, v)) * 32000) for v in samples))
        if self.channels > 1:
            data = array("h", (v for v in data for _ in range(self.channels)))
        snd = pygame.mixer.Sound(buffer=data.tobytes())
        snd.set_volume(volume)
        self.sounds[name] = snd
        self.lengths[name] = len(samples) / SR

    def build(self):
        # 아이템 획득: 반짝이는 상승 아르페지오
        buf = []
        for i, m in enumerate((84, 88, 91, 96)):
            mix(buf, tone(midi(m), 0.35, "triangle", 0.35, decay=7), int(i * 0.06 * SR))
        self.make("item", buf)
        # 반짝이 별
        buf = tone(2093, 0.18, "sine", 0.22, decay=18)
        mix(buf, tone(3136, 0.16, "sine", 0.12, decay=20), int(0.04 * SR))
        self.make("sparkle", buf, 0.7)
        # 새와 부딪힘: 뿅~ 하고 내려가는 소리
        self.make("bump", tone(520, 0.35, "square", 0.22, decay=5, slide=140))
        # 6개 모두 모음: 짧은 팡파레
        buf = []
        for i, m in enumerate((72, 76, 79)):
            mix(buf, tone(midi(m), 0.2, "triangle", 0.35, decay=6), int(i * 0.12 * SR))
        for m in (72, 76, 79, 84):
            mix(buf, tone(midi(m), 1.0, "triangle", 0.2, decay=2.5), int(0.36 * SR))
        self.make("complete", buf)
        # 낙하산 펴지는 바람 소리
        self.make("whoosh", noise(1.3, 0.9, smooth=0.93, swell=True))
        # 옷 갈아입기 펑
        buf = noise(0.45, 0.7, decay=9, smooth=0.75)
        mix(buf, tone(900, 0.6, "sine", 0.18, decay=5, slide=2600))
        self.make("poof", buf)
        # 착지
        self.make("land", tone(180, 0.25, "sine", 0.5, decay=12, slide=70))
        # 종이 바스락
        self.make("paper", noise(0.3, 0.35, decay=10, smooth=0.45))
        # 반지 종소리
        buf = tone(1318.5, 1.8, "sine", 0.3, decay=2.2)
        mix(buf, tone(2637, 1.4, "sine", 0.12, decay=3.5))
        mix(buf, tone(3951, 0.9, "sine", 0.06, decay=6))
        self.make("bell", buf)
        # 뽀뽀
        self.make("kiss", tone(1300, 0.13, "sine", 0.35, decay=12, slide=2300))
        # 하트 부풀기
        buf = tone(170, 2.5, "sine", 0.3, attack=0.2, decay=0.0, slide=760, vibrato=0.04)
        mix(buf, tone(340, 2.5, "triangle", 0.12, attack=0.2, decay=0.0, slide=1520, vibrato=0.04))
        self.make("inflate", buf)
        # 하트 펑!
        buf = noise(0.4, 1.0, decay=13, smooth=0.25)
        mix(buf, tone(140, 0.35, "sine", 0.8, decay=9, slide=40))
        self.make("pop", buf)
        # 하객 박수 (6초)
        buf = [0.0] * int(6.0 * SR)
        for _ in range(420):
            t = random.uniform(0, 5.8)
            loud = min(1.0, t / 0.6) * (1.0 if t < 4.0 else (5.8 - t) / 1.8)
            mix(buf, noise(0.04, 0.35 * loud * random.uniform(0.5, 1.0), decay=120,
                           smooth=random.uniform(0.2, 0.6)), int(t * SR))
        self.make("clap", buf, 0.8)

        # 신부의 축가: 일렉기타 멜로디 (창작곡)
        song = [(67, 2), (72, 2), (74, 2), (76, 4), (74, 2), (72, 4),
                (76, 2), (79, 2), (81, 4), (79, 2), (76, 2), (74, 4),
                (72, 2), (74, 2), (76, 2), (79, 2), (84, 8)]
        lead = [(m - 12, l) for m, l in song]
        buf = melody(lead, 0.22, wave="saw", vol=0.28, decay=1.8, drive=3.5)
        fifth = [(m + 7, l) for m, l in lead]
        harm = melody(fifth, 0.22, wave="saw", vol=0.12, decay=1.8, drive=3.5)
        for i, v in enumerate(harm):
            buf[i] += v
        roots = [(48, 8), (53, 8), (55, 8), (48, 8), (53, 8), (48, 8)]
        bass = melody(roots, 0.22, wave="triangle", vol=0.3, decay=0.8)
        for i, v in enumerate(bass[:len(buf)]):
            buf[i] += v
        buf.extend(tone(midi(60), 1.2, "saw", 0.25, decay=2.5, drive=3.5))
        self.make("song", buf, 0.9)

        # 하늘 배경음: 오르골 멜로디 (창작곡, 반복)
        tune = [(76, 2), (79, 2), (84, 2), (83, 2), (81, 2), (79, 2), (76, 4),
                (77, 2), (81, 2), (86, 2), (84, 2), (83, 4), (79, 4),
                (76, 2), (79, 2), (84, 2), (83, 2), (81, 2), (84, 2), (88, 2), (86, 2),
                (84, 2), (83, 2), (81, 2), (83, 2), (84, 8)]
        buf = melody(tune, 0.25, wave="sine", vol=0.22, decay=3.5)
        bass = melody([(48, 8), (45, 8), (41, 8), (43, 8), (48, 8), (45, 8), (41, 8), (48, 8)],
                      0.25, wave="triangle", vol=0.16, decay=1.2)
        for i, v in enumerate(bass[:len(buf)]):
            buf[i] += v
        self.make("bgm_sky", buf, 0.6)

        # 결혼식장 배경음: 잔잔한 화음
        buf = [0.0] * int(8 * SR)
        for k, chord in enumerate(((60, 64, 67), (57, 60, 64), (53, 57, 60), (55, 59, 62))):
            for m in chord:
                mix(buf, tone(midi(m), 2.1, "sine", 0.09, attack=0.4, decay=0.6), int(k * 2 * SR))
        self.make("bgm_hall", buf[:int(8 * SR)], 0.6)

    def play(self, name):
        if self.ok and not self.muted and name in self.sounds:
            self.sounds[name].play()

    def play_music(self, name):
        self.stop_music(0)
        if self.ok and name in self.sounds:
            self.music = self.sounds[name]
            self.music.play(loops=-1)

    def stop_music(self, fade_ms=600):
        if self.music:
            if fade_ms:
                self.music.fadeout(fade_ms)
            else:
                self.music.stop()
            self.music = None

    def toggle_mute(self):
        if not self.ok:
            return
        self.muted = not self.muted
        if self.muted:
            pygame.mixer.pause()
        else:
            pygame.mixer.unpause()


# ===================================================================
# 아이템 아이콘
# ===================================================================
def draw_icon(s, kind, x, y, k=1.0):
    """폭 약 32*k 크기의 아이템 아이콘"""
    if kind == "heart":
        draw_heart(s, (255, 80, 135), x, y + 1 * k, 30 * k)
        pygame.draw.circle(s, WHITE, (int(x - 7 * k), int(y - 5 * k)), max(1, int(3 * k)))
    elif kind == "letter":
        rect = (x - 15 * k, y - 10 * k, 30 * k, 21 * k)
        pygame.draw.rect(s, (255, 248, 230), rect)
        pygame.draw.rect(s, (170, 130, 100), rect, max(1, int(2 * k)))
        pygame.draw.lines(s, (170, 130, 100), False,
                          [(x - 15 * k, y - 10 * k), (x, y + 2 * k), (x + 15 * k, y - 10 * k)],
                          max(1, int(2 * k)))
        draw_heart(s, (220, 40, 80), x, y + 2 * k, 9 * k)
    elif kind == "ring":
        pygame.draw.circle(s, (240, 190, 60), (int(x), int(y + 5 * k)), int(11 * k), max(2, int(3.5 * k)))
        gem = [(x - 7 * k, y - 9 * k), (x - 4 * k, y - 14 * k), (x + 4 * k, y - 14 * k),
               (x + 7 * k, y - 9 * k), (x, y - 3 * k)]
        pygame.draw.polygon(s, (180, 235, 255), gem)
        pygame.draw.polygon(s, WHITE, gem, 1)
    elif kind == "tux":
        pygame.draw.polygon(s, (30, 30, 36), [(x - 13 * k, y - 13 * k), (x + 13 * k, y - 13 * k),
                                              (x + 15 * k, y + 15 * k), (x - 15 * k, y + 15 * k)])
        pygame.draw.polygon(s, WHITE, [(x - 6 * k, y - 13 * k), (x + 6 * k, y - 13 * k), (x, y + 3 * k)])
        pygame.draw.polygon(s, (200, 30, 60), [(x - 6 * k, y - 12 * k), (x, y - 9 * k), (x - 6 * k, y - 6 * k)])
        pygame.draw.polygon(s, (200, 30, 60), [(x + 6 * k, y - 12 * k), (x, y - 9 * k), (x + 6 * k, y - 6 * k)])
        for by in (6, 11):
            pygame.draw.circle(s, (200, 200, 200), (int(x), int(y + by * k)), max(1, int(1.5 * k)))
    elif kind == "dress":
        pygame.draw.polygon(s, WHITE, [(x - 4 * k, y - 4 * k), (x + 4 * k, y - 4 * k),
                                       (x + 16 * k, y + 15 * k), (x - 16 * k, y + 15 * k)])
        pygame.draw.polygon(s, (240, 170, 200), [(x - 4 * k, y - 4 * k), (x + 4 * k, y - 4 * k),
                                                 (x + 16 * k, y + 15 * k), (x - 16 * k, y + 15 * k)],
                            max(1, int(1.5 * k)))
        pygame.draw.polygon(s, WHITE, [(x - 5 * k, y - 15 * k), (x + 5 * k, y - 15 * k),
                                       (x + 4 * k, y - 4 * k), (x - 4 * k, y - 4 * k)])
        pygame.draw.line(s, (255, 150, 190), (x - 5 * k, y - 4 * k), (x + 5 * k, y - 4 * k), max(1, int(2 * k)))
    elif kind == "guitar":
        pygame.draw.line(s, (130, 85, 45), (x - 2 * k, y + 2 * k), (x + 13 * k, y - 14 * k), max(2, int(3.5 * k)))
        pygame.draw.line(s, (40, 40, 40), (x + 12 * k, y - 13 * k), (x + 17 * k, y - 18 * k), max(2, int(5 * k)))
        pygame.draw.circle(s, (225, 35, 55), (int(x - 6 * k), int(y + 7 * k)), int(9 * k))
        pygame.draw.circle(s, (225, 35, 55), (int(x - 1 * k), int(y + 1 * k)), int(6.5 * k))
        pygame.draw.circle(s, WHITE, (int(x - 5 * k), int(y + 6 * k)), max(1, int(3.5 * k)))
        pygame.draw.line(s, (30, 30, 30), (x - 10 * k, y + 9 * k), (x - 3 * k, y + 2 * k), max(1, int(2 * k)))
    elif kind == "bouquet":
        draw_bouquet(s, x, y, k)


def draw_daisy(s, x, y, k):
    pr = max(1, int(2.6 * k))
    for j in range(8):
        a = j * math.pi / 4
        pygame.draw.circle(s, WHITE, (int(x + math.cos(a) * 4 * k), int(y + math.sin(a) * 4 * k)), pr)
    pygame.draw.circle(s, (255, 200, 40), (int(x), int(y)), max(1, int(2.6 * k)))


def draw_bouquet(s, x, y, k=1.0):
    """데이지 꽃 부케 (폭 약 32*k)"""
    for dx in (-5, -2, 1, 4):
        pygame.draw.line(s, (90, 150, 70), (x + dx * k * 0.4, y + 16 * k), (x + dx * k, y), max(1, int(2 * k)))
    for lx in (-1, 1):
        pygame.draw.polygon(s, (110, 175, 80), [(x + lx * 3 * k, y - 2 * k), (x + lx * 15 * k, y - 4 * k),
                                                (x + lx * 6 * k, y + 4 * k)])
    for dx, dy in ((-8, -2), (8, -2), (0, 0), (-4, -10), (5, -10), (0, -18) if k > 0.5 else (0, -10)):
        draw_daisy(s, x + dx * k, y + dy * k, k)
    pygame.draw.polygon(s, (255, 150, 190), [(x, y + 8 * k), (x - 7 * k, y + 4 * k), (x - 7 * k, y + 12 * k)])
    pygame.draw.polygon(s, (255, 150, 190), [(x, y + 8 * k), (x + 7 * k, y + 4 * k), (x + 7 * k, y + 12 * k)])
    pygame.draw.circle(s, (240, 110, 160), (int(x), int(y + 8 * k)), max(1, int(2.5 * k)))


def draw_icon_glow(s, kind, x, y, k=1.0, tick=0):
    r = int(28 * k)
    g = glow(r, (255, 240, 200))
    s.blit(g, (x - r, y - r))
    pulse = 1 + 0.06 * math.sin(tick * 0.15)
    pygame.draw.circle(s, (255, 255, 255), (int(x), int(y)), int(21 * k * pulse), 2)
    draw_icon(s, kind, x, y, k)


# ===================================================================
# 하늘 장면: 지형, 구름, 아이템, 새, 별
# ===================================================================
def river_x(wy):
    return W / 2 + math.sin(wy * 0.0035) * 140 + math.sin(wy * 0.013) * 35


def river_half_width(wy):
    return 30 + 9 * math.sin(wy * 0.02)


class Terrain:
    CHUNK = 256

    def __init__(self):
        self.offset = 0.0
        self.cache = {}

    def make_chunk(self, idx):
        c = self.CHUNK
        surf = pygame.Surface((W, c))
        rng = random.Random(idx * 7919 + 13)
        surf.fill(GRASS)
        for _ in range(4):
            color = rng.choice((FIELD, GRASS_LIGHT, FLOWER_FIELD, GRASS_LIGHT))
            pw, ph = rng.randint(50, 120), rng.randint(40, 90)
            surf.fill(color, (rng.randint(0, W - pw), rng.randint(0, c - ph), pw, ph))
        for _ in range(rng.randint(2, 4)):
            fx, fy = rng.randint(0, W), rng.randint(0, c)
            for _ in range(16):
                pygame.draw.circle(surf, FOREST, (fx + rng.randint(-40, 40), fy + rng.randint(-30, 30)),
                                   rng.randint(6, 12))
        # 작은 집들
        for _ in range(rng.randint(0, 3)):
            hx, hy = rng.randint(20, W - 40), rng.randint(10, c - 30)
            surf.fill((245, 240, 230), (hx, hy, 18, 14))
            surf.fill(rng.choice(((200, 90, 80), (90, 120, 190), (220, 160, 80))), (hx, hy, 18, 7))
        road_row = rng.randint(30, c - 30) if rng.random() < 0.4 else None
        if road_row is not None:
            surf.fill(ROAD, (0, road_row - 5, W, 10))
        for r in range(0, c, 2):
            wy = (idx + 1) * c - r
            rx, hw = river_x(wy), river_half_width(wy)
            pygame.draw.rect(surf, SAND, (rx - hw - 6, r, 2 * hw + 12, 2))
            pygame.draw.rect(surf, WATER, (rx - hw, r, 2 * hw, 2))
            if (r + idx * 7) % 22 == 0:
                pygame.draw.rect(surf, WATER_LIGHT, (rx - hw * 0.4, r, hw * 0.5, 2))
        if road_row is not None:
            wy = (idx + 1) * c - road_row
            rx, hw = river_x(wy), river_half_width(wy)
            surf.fill((190, 170, 140), (rx - hw - 10, road_row - 7, 2 * hw + 20, 14))
        return surf

    def update(self, speed=SCROLL):
        self.offset += speed

    def draw(self, screen):
        c = self.CHUNK
        first = int(self.offset // c)
        last = int((self.offset + H) // c) + 1
        for idx in range(first, last + 1):
            if idx not in self.cache:
                self.cache[idx] = self.make_chunk(idx)
            screen.blit(self.cache[idx], (0, round(H + self.offset - (idx + 1) * c)))
        for idx in [k for k in self.cache if k < first - 1]:
            del self.cache[idx]

    def river_distance(self, x, sy):
        wy = H + self.offset - sy
        return abs(x - river_x(wy)) - river_half_width(wy)


class Cloud:
    def __init__(self, y=None):
        self.surf = pygame.Surface((170, 100), pygame.SRCALPHA)
        for _ in range(8):
            pygame.draw.circle(self.surf, (255, 255, 255, 150),
                               (random.randint(40, 130), random.randint(35, 65)), random.randint(18, 32))
        self.reset(y)

    def reset(self, y=None):
        self.x = random.randint(-60, W - 100)
        self.y = random.randint(-600, -120) if y is None else y
        self.speed = SCROLL * random.uniform(1.8, 2.6)

    def update(self, k=1.0):
        self.y += self.speed * k
        if self.y > H + 20:
            self.reset()

    def draw(self, s):
        s.blit(self.surf, (self.x, self.y))


class ItemBubble:
    def __init__(self, kind):
        self.kind = kind
        self.bx = random.randint(60, W - 60)
        self.x, self.y = self.bx, -30
        self.t = random.randint(0, 100)
        self.dead = False

    def update(self):
        self.t += 1
        self.y += SCROLL + 0.5
        self.x = self.bx + math.sin(self.t * 0.04) * 30
        if self.y > H + 40:
            self.dead = True

    def draw(self, s, tick):
        draw_icon_glow(s, self.kind, self.x, self.y, 1.0, tick)


class Bird:
    def __init__(self, x, y, vx):
        self.x, self.y, self.vx = x, y, vx
        self.vy = SCROLL * 0.4
        self.phase = random.uniform(0, math.tau)
        self.dead = False

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.phase += 0.3
        if self.x < -120 or self.x > W + 120 or self.y < -60 or self.y > H + 40:
            self.dead = True

    def draw(self, s):
        flap = 7 * math.sin(self.phase)
        x, y = self.x, self.y
        pts = [(x - 14, y - flap), (x - 6, y - 2), (x, y + 2), (x + 6, y - 2), (x + 14, y - flap)]
        pygame.draw.lines(s, (250, 250, 250), False, pts, 4)
        pygame.draw.lines(s, (120, 120, 130), False, pts, 1)


class Star:
    def __init__(self, x, y):
        self.x, self.y = x, y
        self.t = random.randint(0, 60)
        self.dead = False

    def update(self):
        self.t += 1
        self.y += SCROLL * 1.3
        if self.y > H + 20:
            self.dead = True

    def draw(self, s):
        r = 8 + 2 * math.sin(self.t * 0.2)
        a = self.t * 0.05
        pts = []
        for i in range(8):
            rr = r if i % 2 == 0 else r * 0.35
            pts.append((self.x + math.cos(a + i * math.pi / 4) * rr, self.y + math.sin(a + i * math.pi / 4) * rr))
        pygame.draw.polygon(s, YELLOW, pts)
        pygame.draw.circle(s, WHITE, (int(self.x), int(self.y)), 2)


class Particle:
    def __init__(self, x, y, color, speed=3.0, life=30, size=3, gravity=0.0, shape="dot"):
        a = random.uniform(0, math.tau)
        sp = random.uniform(0.3, 1.0) * speed
        self.x, self.y = x, y
        self.vx, self.vy = math.cos(a) * sp, math.sin(a) * sp
        self.life = self.max_life = random.randint(max(1, life // 2), life)
        self.color, self.size, self.gravity, self.shape = color, size, gravity, shape

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vx *= 0.94
        self.vy = self.vy * 0.94 + self.gravity
        self.life -= 1

    def draw(self, s):
        k = self.life / self.max_life
        if self.shape == "heart":
            draw_heart(s, self.color, self.x, self.y, self.size * (0.5 + 0.5 * k))
        elif self.shape == "puff":
            pygame.draw.circle(s, self.color, (int(self.x), int(self.y)), int(self.size * (1.4 - 0.6 * k)))
        else:
            pygame.draw.circle(s, self.color, (int(self.x), int(self.y)), max(1, int(self.size * k + 0.5)))


class TextPop:
    def __init__(self, text, x, y, font, color=WHITE):
        self.img = font.render(text, True, color)
        self.x, self.y = x, y
        self.life = self.max_life = 45

    def update(self):
        self.y -= 0.8
        self.life -= 1

    def draw(self, s):
        img = self.img.copy()
        img.set_alpha(int(255 * min(1, self.life / 20)))
        s.blit(img, img.get_rect(center=(self.x, self.y)))


def draw_couple_topdown(target, x, y, tick, scale=1.0, angle=0.0):
    """위에서 내려다본, 손을 잡고 스카이다이빙하는 신랑(왼쪽, 곰 옷)과 신부(오른쪽, 토끼 옷).
    식장과 같은 통통한 동물 옷 아이들: 노란 점프슈트 + 동물 모자"""
    S = pygame.Surface((200, 150), pygame.SRCALPHA)
    cx, cy = 100, 72
    fl = math.sin(tick * 0.25) * 3
    flap = math.sin(tick * 0.4) * 3     # 바람에 펄럭이는 토끼 귀
    for side, kind in ((-1, "bear"), (1, "bunny")):
        p = CostumePainter(kind, 1.1)
        px = cx + side * 32
        suit, line = SUIT_YELLOW, _CORAL
        # 짧고 통통한 다리 (벌린 자세)
        for leg in (-1, 1):
            hip = (px + leg * 7, cy + 14)
            foot = (px + leg * 17, cy + 38 + fl * (0.5 if leg > 0 else 1))
            pygame.draw.line(S, line, (hip[0] + 1, hip[1] + 1), (foot[0] + 1, foot[1] + 1), 13)
            pygame.draw.line(S, suit, hip, foot, 10)
            p.blob(S, "circle", foot, 6, fill=line, line=darker(line, 0.8))
        # 바깥 팔 (위로 만세)
        sh = (px + side * 12, cy - 6)
        hand = (px + side * 30, cy - 28 + fl * 0.5)
        pygame.draw.line(S, line, (sh[0] + 1, sh[1] + 1), (hand[0] + 1, hand[1] + 1), 12)
        pygame.draw.line(S, suit, sh, hand, 9)
        p.blob(S, "circle", hand, 6, fill=suit, line=line)
        # 안쪽 팔 (가운데에서 손잡기)
        pygame.draw.line(S, suit, (px - side * 10, cy - 6), (cx + side * 4, cy - 2), 9)
        # 통통한 몸통 + 지퍼
        p.blob(S, "rrect", (px - 17, cy - 20, 34, 42), 16, fill=suit, line=line)
        pygame.draw.line(S, line, (px, cy - 16), (px, cy + 16), 2)
        # 머리: 동물 모자 (위에서 보니 귀와 모자 꼭대기만)
        hx, hy = px, cy - 32
        if kind == "bunny":
            for ear in (-1, 1):
                p.blob(S, "ellipse", (hx + ear * 9 - 5 + flap * ear * 0.5, hy - 30 + abs(flap), 10, 26))
        else:
            p.draw_ears(S, hx, hy, 14)
        p.blob(S, "circle", (hx, hy), 14)
        pygame.draw.circle(S, p.face, (hx, hy + 6), 6)     # 아래로 살짝 보이는 얼굴
    p.blob(S, "circle", (cx, cy - 2), 7, fill=SUIT_YELLOW, line=_CORAL)   # 맞잡은 손
    if scale != 1.0 or angle:
        S = pygame.transform.rotozoom(S, angle, scale)
    target.blit(S, S.get_rect(center=(int(x), int(y))))


def draw_canopy_topdown(s, x, y, scale, k):
    """하트 모양 낙하산 (k: 펴진 정도 0~1)"""
    if k <= 0:
        return
    size = 170 * scale * (0.3 + 0.7 * k)
    cx, cy = x, y - 100 * scale * k
    for dx in (-48, -16, 16, 48):
        pygame.draw.line(s, (240, 240, 240), (cx + dx * scale * k, cy + size * 0.12),
                         (x + dx * 0.55 * scale, y - 20 * scale), 1)
    draw_heart(s, (255, 110, 160), cx, cy, size)
    draw_heart(s, (255, 160, 195), cx, cy - size * 0.05, size * 0.7)
    draw_heart(s, (255, 205, 225), cx, cy - size * 0.1, size * 0.35)


def draw_chapel_topdown(s, ch, scale=1.0):
    x, y = ch["x"], ch["y"]
    pygame.draw.circle(s, (160, 210, 130), (int(x), int(y)), 100)
    pygame.draw.rect(s, (235, 225, 200), (x - 10, y + 44, 20, 80))
    for fx, fy, col in ch["flowers"]:
        pygame.draw.circle(s, col, (int(x + fx), int(y + fy)), 4)
    for tx, ty in ((-72, -60), (72, -60), (-74, 52), (74, 52)):
        pygame.draw.circle(s, FOREST, (int(x + tx), int(y + ty)), 14)
    pygame.draw.rect(s, (250, 250, 246), (x - 40, y - 54, 80, 104))
    pygame.draw.rect(s, (240, 150, 170), (x - 36, y - 50, 36, 96))
    pygame.draw.rect(s, (220, 120, 148), (x, y - 50, 36, 96))
    pygame.draw.line(s, (250, 220, 230), (x, y - 50), (x, y + 46), 2)
    draw_heart(s, (225, 40, 75), x, y - 2, 30)
    pygame.draw.rect(s, (150, 100, 70), (x - 8, y + 46, 16, 8))


# ===================================================================
# 하늘 장면
# ===================================================================
class SkyPhase:
    def __init__(self, game, demo=False):
        self.g = game
        self.demo = demo
        self.terrain = Terrain()
        self.clouds = [Cloud(random.randint(-200, H)) for _ in range(5)]
        self.x, self.y = W / 2, H - 200
        self.collected = []
        self.items, self.birds, self.stars, self.effects = [], [], [], []
        self.item_timer, self.bird_timer, self.star_timer = 80, 300, 40
        self.tumble = 0
        self.safe = 0
        self.stars_got = 0
        self.msg, self.msg_timer = f"아이템 {len(ITEM_KINDS)}개를 모아 결혼식장으로!", 180
        self.t = 0
        self.descent = -1
        self.chapel = None
        self.chute = 0.0
        self.zoom = 1.0
        self.couple_scale = 1.0
        self.fade = 0.0

    # ----- 진행 -----
    def say(self, text, frames=120):
        self.msg, self.msg_timer = text, frames

    def remaining(self):
        on_screen = {it.kind for it in self.items}
        return [k for k in ITEM_KINDS if k not in self.collected and k not in on_screen]

    def update(self, keys):
        self.t += 1
        if self.msg_timer:
            self.msg_timer -= 1
        if self.demo:
            self.terrain.update()
            for c in self.clouds:
                c.update()
            self.x = W / 2 + math.sin(self.t * 0.02) * 70
            self.y = H * 0.62 + math.sin(self.t * 0.031) * 30
            return
        if self.descent >= 0:
            self.update_descent()
            return

        # 이동: 방향키, 또는 화면을 누른 채 끌면(터치·마우스) 손가락 쪽으로
        dx = (keys[pygame.K_RIGHT] or keys[pygame.K_d]) - (keys[pygame.K_LEFT] or keys[pygame.K_a])
        dy = (keys[pygame.K_DOWN] or keys[pygame.K_s]) - (keys[pygame.K_UP] or keys[pygame.K_w])
        if dx and dy:
            dx, dy = dx * 0.7071, dy * 0.7071
        if not (dx or dy) and pygame.mouse.get_pressed()[0]:
            mx, my = pygame.mouse.get_pos()
            tx, ty = mx - self.x, my - TOUCH_LIFT - self.y     # 손가락에 가리지 않게 조금 위로
            dist = math.hypot(tx, ty)
            if dist > 6:
                k = min(1.0, dist / 40) / dist                 # 가까우면 천천히 멈춘다
                dx, dy = tx * k, ty * k
        speed = 1.2 if self.tumble else 4.2
        self.x = min(max(self.x + dx * speed, 60), W - 60)
        self.y = min(max(self.y + dy * speed, 120), H - 60)
        if self.tumble:
            self.tumble -= 1
        if self.safe:
            self.safe -= 1

        self.terrain.update()
        for c in self.clouds:
            c.update()

        # 생성
        self.item_timer -= 1
        if self.item_timer <= 0 and len(self.collected) < len(ITEM_KINDS):
            pool = self.remaining()
            if pool and len(self.items) < 2:
                self.items.append(ItemBubble(random.choice(pool)))
            self.item_timer = random.randint(170, 230)
        self.bird_timer -= 1
        if self.bird_timer <= 0:
            self.spawn_birds()
        self.star_timer -= 1
        if self.star_timer <= 0:
            x0 = random.randint(70, W - 70)
            for i in range(5):
                self.stars.append(Star(x0 + math.sin(i * 0.9) * 40, -20 - i * 40))
            self.star_timer = random.randint(80, 140)

        for obj in self.items + self.birds + self.stars + self.effects:
            obj.update()
        self.collide()
        self.items = [o for o in self.items if not o.dead]
        self.birds = [o for o in self.birds if not o.dead]
        self.stars = [o for o in self.stars if not o.dead]
        self.effects = [o for o in self.effects if o.life > 0]

    def spawn_birds(self):
        side = random.choice((-1, 1))
        n = random.randint(3, 5)
        y0 = random.randint(140, H - 240)
        for i in range(n):
            off = abs(i - n // 2)
            x = (-30 - off * 26) if side == 1 else (W + 30 + off * 26)
            self.birds.append(Bird(x, y0 + off * 18, side * random.uniform(2.0, 2.8)))
        self.bird_timer = random.randint(200, 320)

    def touching(self, x, y, r):
        return ((x - self.x) / (52 + r)) ** 2 + ((y - self.y + 5) / (42 + r)) ** 2 < 1

    def collide(self):
        g = self.g
        for it in self.items:
            if self.touching(it.x, it.y, 14):
                it.dead = True
                self.collected.append(it.kind)
                g.audio.play("item")
                for _ in range(24):
                    self.effects.append(Particle(it.x, it.y, random.choice(HEART_PINKS + [YELLOW, WHITE]), 4, 35, 3))
                if len(self.collected) == len(ITEM_KINDS):
                    g.audio.play("complete")
                    self.say("모든 아이템을 모았어요! 결혼식장으로 낙하!", 240)
                    self.descent = 0
                else:
                    self.say(f"{ITEM_NAMES[it.kind]} 획득!  ({len(self.collected)}/{len(ITEM_KINDS)})", 100)
        for st in self.stars:
            if self.touching(st.x, st.y, 6):
                st.dead = True
                self.stars_got += 1
                g.audio.play("sparkle")
                self.effects.append(TextPop("+1", st.x, st.y - 10, g.small_font, YELLOW))
        if not self.tumble and not self.safe:
            for b in self.birds:
                if self.touching(b.x, b.y, 4):
                    self.tumble = 60
                    self.safe = 100
                    g.audio.play("bump")
                    self.say("앗! 새와 부딪혀서 빙글빙글~", 90)
                    for bb in self.birds:
                        bb.vy = -3
                    for _ in range(8):
                        self.effects.append(Particle(b.x, b.y, (240, 240, 240), 3, 30, 3))
                    break

    def update_descent(self):
        g = self.g
        self.descent += 1
        t = self.descent
        for obj in self.items + self.birds + self.stars + self.effects:
            obj.update()
        self.effects = [o for o in self.effects if o.life > 0]
        if t == 1:
            g.audio.stop_music(1500)
            self.items.clear()
            # 강을 피해서 결혼식장 위치 정하기
            xs = [W / 2, 130, W - 130, 170, W - 170]
            best = max(xs, key=lambda x: self.terrain.river_distance(x, -170))
            rng = random.Random(7)
            flowers = []
            for _ in range(60):
                a = rng.uniform(0, math.tau)
                r = rng.uniform(55, 95)
                flowers.append((math.cos(a) * r, math.sin(a) * r,
                                rng.choice(((255, 160, 200), WHITE, (255, 220, 120)))))
            self.chapel = {"x": best, "y": -170.0, "flowers": flowers}
        if t == 40:
            g.audio.play("whoosh")
        if t >= 40:
            self.chute = min(1.0, self.chute + 0.03)

        ch = self.chapel
        target_y = H * 0.42
        speed = max(0.0, min(3.0, (target_y - ch["y"]) * 0.02 + 0.2)) if ch["y"] < target_y else 0.0
        ch["y"] += speed
        self.terrain.update(speed)
        for c in self.clouds:
            c.update(1.0 if t < 200 else 3.0)
        if t > 60:
            self.x = lerp(self.x, ch["x"], 0.03)
            self.y = lerp(self.y, ch["y"] + 10, 0.03)
        if t > 200:
            k = (t - 200) / 160
            self.zoom = 1 + 5 * k * k
            self.couple_scale = 1 - 0.4 * k
        if t > 300:
            self.fade = min(1.0, (t - 300) / 60)
        if t >= 370:
            g.start_ceremony()

    # ----- 그리기 -----
    def draw(self, s):
        g = self.g
        tick = self.t
        self.terrain.draw(s)
        if self.chapel:
            draw_chapel_topdown(s, self.chapel)
        for c in self.clouds:
            c.draw(s)
        for st in self.stars:
            st.draw(s)
        for b in self.birds:
            b.draw(s)
        for it in self.items:
            it.draw(s, tick)

        cx, cy = self.x, self.y
        if self.zoom > 1.0:
            ch = self.chapel
            zw, zh = W / self.zoom, H / self.zoom
            rx = min(max(ch["x"] - zw / 2, 0), W - zw)
            ry = min(max(ch["y"] - zh / 2, 0), H - zh)
            sub = s.subsurface(pygame.Rect(int(rx), int(ry), max(1, int(zw)), max(1, int(zh)))).copy()
            s.blit(pygame.transform.smoothscale(sub, (W, H)), (0, 0))
            cx, cy = (self.x - rx) * self.zoom, (self.y - ry) * self.zoom
            cx, cy = lerp(cx, W / 2, 0.5), lerp(cy, H / 2, 0.5)

        if not (self.safe and not self.tumble and (tick // 5) % 2):
            angle = (self.tumble / 60) * 720 if self.tumble else 0
            draw_canopy_topdown(s, cx, cy, self.couple_scale, self.chute)
            draw_couple_topdown(s, cx, cy, tick, self.couple_scale, angle)

        for e in self.effects:
            e.draw(s)
        if not self.demo:
            if self.descent < 0:
                self.draw_hud(s)
            if self.msg_timer:
                g.text(self.msg, g.mid_font, WHITE, (W / 2, H * 0.3),
                       alpha=min(255, self.msg_timer * 8))
        if self.fade:
            shade = pygame.Surface((W, H))
            shade.fill(WHITE)
            shade.set_alpha(int(255 * self.fade))
            s.blit(shade, (0, 0))

    def draw_hud(self, s):
        g = self.g
        panel = pygame.Surface((W, 78), pygame.SRCALPHA)
        panel.fill((255, 255, 255, 110))
        s.blit(panel, (0, 0))
        for i, kind in enumerate(ITEM_KINDS):
            x = (W - len(ITEM_KINDS) * 64) // 2 + i * 64 + 32
            got = kind in self.collected
            box = pygame.Rect(x - 26, 6, 52, 46)
            pygame.draw.rect(s, (255, 240, 248) if got else (230, 230, 236), box, border_radius=10)
            pygame.draw.rect(s, PINK if got else (190, 190, 200), box, 2, border_radius=10)
            if got:
                draw_icon(s, kind, x, 29, 0.85)
            else:
                ghost = pygame.Surface((52, 46), pygame.SRCALPHA)
                draw_icon(ghost, kind, 26, 23, 0.85)
                ghost.set_alpha(60)
                s.blit(ghost, box)
            img = g.tiny_font.render(ITEM_SHORT[kind], True, (90, 60, 80))
            s.blit(img, img.get_rect(center=(x, 62)))
        img = g.small_font.render(f"★ {self.stars_got}", True, (150, 110, 20))
        s.blit(img, (W - img.get_width() - 10, 82))


# ===================================================================
# 결혼식장 장면 (옆에서 본 모습)
# ===================================================================
# 동물 옷 (UKI 그림처럼 통통한 몸 + 동물 모자 + 다른 잉크로 비껴 그은 선)
# 이름: (옷 색, 선 색, 얼굴 색). 색은 리소 잉크와 그 겹친 색에서 고른다.
_PURPLE, _CORAL, _TEAL = (123, 92, 162), (249, 113, 63), (41, 120, 98)
_PINK, _YELLOW, _BLUE, _GREEN = INK["pink"], INK["yellow"], INK["blue"], INK["green"]
_FLUFF = (255, 252, 246)
COSTUMES = {
    "bunny": (_PINK, _PURPLE, _YELLOW),
    "chick": (_YELLOW, _CORAL, _PINK),
    "frog": (_GREEN, _TEAL, _YELLOW),
    "cat": (_BLUE, _PURPLE, _PINK),
    "bear": (_CORAL, _PURPLE, _YELLOW),
    "lion": (_YELLOW, _CORAL, _PINK),
    "sheep": (_FLUFF, _PINK, _PINK),
}


class CostumePainter:
    """동물 옷 그리기 도구 (하객·신랑 신부·주례가 함께 쓴다)"""
    def __init__(self, costume, k=1.0):
        self.costume, self.k = costume, k
        self.fill, self.line, self.face = COSTUMES[costume]

    def blob(self, s, kind, geom, r=None, fill=None, line=None):
        """색을 채우고, 선 판을 1px 비껴 찍는다 (리소 판 어긋남 느낌).
        kind: "ellipse"(사각형 안 타원), "circle"(중심, 반지름), "rrect"(둥근 사각형, r=모서리)"""
        fill, line = fill or self.fill, line or self.line
        lw = max(1, round(2 * self.k))
        if kind == "circle":
            c = (int(geom[0]), int(geom[1]))
            pygame.draw.circle(s, fill, c, int(r))
            pygame.draw.circle(s, line, (c[0] + 1, c[1] + 1), int(r), lw)
            return
        rect = pygame.Rect(geom)
        if kind == "ellipse":
            pygame.draw.ellipse(s, fill, rect)
            pygame.draw.ellipse(s, line, rect.move(1, 1), lw)
        else:
            pygame.draw.rect(s, fill, rect, border_radius=int(r))
            pygame.draw.rect(s, line, rect.move(1, 1), lw, border_radius=int(r))

    def draw_ears(self, s, x, y, r):
        k, kind = self.k, self.costume
        if kind == "bunny":
            for side in (-1, 1):
                self.blob(s, "ellipse", (x + side * 0.55 * r - 0.3 * r, y - 2.15 * r, 0.6 * r, 1.6 * r))
        elif kind == "bear":
            for side in (-1, 1):
                self.blob(s, "circle", (x + side * 0.78 * r, y - 0.72 * r), 0.42 * r)
        elif kind == "cat":
            for side in (-1, 1):
                pts = [(x + side * 0.25 * r, y - 0.8 * r), (x + side * 0.95 * r, y - 1.35 * r), (x + side * 0.95 * r, y - 0.2 * r)]
                pygame.draw.polygon(s, self.fill, pts)
                pygame.draw.lines(s, self.line, False, [(px + 1, py + 1) for px, py in pts], max(1, round(2 * k)))
        elif kind == "frog":
            for side in (-1, 1):
                self.blob(s, "circle", (x + side * 0.5 * r, y - 0.85 * r), 0.42 * r)
        elif kind == "chick":
            pygame.draw.ellipse(s, self.fill, (x - 0.15 * r, y - 1.5 * r, 0.35 * r, 0.7 * r))
            pygame.draw.ellipse(s, self.fill, (x + 0.05 * r, y - 1.35 * r, 0.35 * r, 0.6 * r))
        elif kind == "lion":
            for i in range(12):     # 갈기
                a = i * math.tau / 12
                pygame.draw.circle(s, _CORAL, (int(x + math.cos(a) * 1.05 * r), int(y + math.sin(a) * 1.05 * r)), int(0.42 * r))
        elif kind == "sheep":
            for i in range(10):     # 복슬복슬 털
                a = i * math.tau / 10
                self.blob(s, "circle", (x + math.cos(a) * 0.95 * r, y + math.sin(a) * 0.95 * r), 0.36 * r)
            for side in (-1, 1):    # 노란 뿔
                pygame.draw.circle(s, _YELLOW, (int(x + side * 1.15 * r), int(y + 0.1 * r)), int(0.4 * r))
                pygame.draw.circle(s, _CORAL, (int(x + side * 1.15 * r) + 1, int(y + 0.1 * r) + 1), int(0.2 * r), 1)

    def draw_face(self, s, x, y, r, turn=0.0, closed=False, blush=False):
        """동그랗게 웃는 얼굴: 반달 눈(^ ^) + 활짝 웃는 입 + 발그레한 볼.
        turn(-1~1)만큼 얼굴이 옆으로 돌아간다(옆모습 캐릭터용). closed 는 지그시 감은 눈(키스할 때)."""
        k = self.k
        lw = max(2, round(1.8 * k))
        fx, fy = x + turn * 0.18 * r, y + 0.12 * r
        pygame.draw.circle(s, self.face, (int(fx), int(fy)), int(0.66 * r))
        # 볼터치: 얼굴과 다른 잉크로 큼직한 타원 (핑크 얼굴엔 코랄)
        cheek = _CORAL if self.face == _PINK else _PINK
        bw, bh = (0.36 * r, 0.22 * r) if blush else (0.3 * r, 0.18 * r)
        for side in (-1, 1):
            cx = fx + side * 0.4 * r + turn * 0.05 * r
            pygame.draw.ellipse(s, cheek, (cx - bw / 2, fy + 0.13 * r, bw, bh))
        for side in (-1, 1):
            ex = fx + side * 0.25 * r + turn * 0.08 * r
            ey = fy - 0.02 * r
            eye = (ex - 0.14 * r, ey - 0.1 * r, 0.28 * r, 0.24 * r)
            # 웃는 눈은 위로 볼록(^), 감은 눈은 아래로 볼록
            pygame.draw.arc(s, INK_TEXT, eye, math.pi if closed else 0, math.tau if closed else math.pi, lw)
        # 활짝 웃는 입: 아래로 둥근 반원 + 속은 코랄
        mx, my, mw = fx + turn * 0.06 * r, fy + 0.2 * r, 0.26 * r
        pts = [(mx + math.cos(a) * mw / 2, my + math.sin(a) * mw * 0.45) for a in
               [i * math.pi / 8 for i in range(9)]]
        pygame.draw.polygon(s, _CORAL, pts)
        pygame.draw.lines(s, INK_TEXT, True, pts, max(1, round(1.2 * k)))
        if self.costume == "chick":     # 부리 모자
            pygame.draw.polygon(s, _CORAL, [(x - 0.2 * r, y - 0.7 * r), (x + 0.2 * r, y - 0.7 * r), (x, y - 0.45 * r)])


class Person:
    """식장의 신랑(곰 옷)·신부(토끼 옷)·주례(양 옷). 하객처럼 머리가 크고 몸이 통통한 동물 옷 아이들.
    식 진행(run_script)이 쓰는 좌표(hands, lean, bob, bouquet_at …)는 예전 그대로 받는다."""
    COSTUME = {"groom": "bear", "bride": "bunny", "officiant": "sheep"}
    TUX = _BLUE                     # 신랑 예복: 하늘 잉크 한 판 (어중간한 남색은 망점으로 풀려 지저분해진다)
    HEAD_R = 19

    def __init__(self, role, x, facing):
        self.role = role            # "groom", "bride", "officiant"
        self.x, self.y = x, FLOOR
        self.facing = facing        # 1: 오른쪽, -1: 왼쪽
        self.outfit = "formal" if role == "officiant" else "jump"
        self.walk = 0.0
        self.walking = False
        self.hands = (None, None)   # (뒤쪽 손, 앞쪽 손) 목표 위치
        self.lean = 0.0
        self.eyes_closed = False
        self.guitar = False
        self.ring = False
        self.bouquet = False        # 비어 있는 손에 부케를 듦
        self.bouquet_at = None      # 부케 위치를 직접 지정할 때
        self.bob = 0.0
        self.blush = False          # 쑥스러운 볼터치와 땀방울
        self.paint = CostumePainter(self.COSTUME[role], 1.25)

    def suit(self):
        """(옷 색, 선 색). 스카이다이빙 땐 노란 점프슈트"""
        if self.outfit != "formal":
            return SUIT_YELLOW, _CORAL
        return {"groom": (self.TUX, _PURPLE), "bride": (_FLUFF, _PINK), "officiant": (_GREEN, _TEAL)}[self.role]

    def arm(self, s, shoulder, hand, color, line):
        pygame.draw.line(s, line, (shoulder[0] + 1, shoulder[1] + 1), (hand[0] + 1, hand[1] + 1), 12)
        pygame.draw.line(s, color, shoulder, hand, 9)
        self.paint.blob(s, "circle", hand, 6, fill=color, line=line)     # 동그란 손(앞발)

    def draw(self, s):
        f, x = self.facing, self.x
        F = self.y + self.bob
        p = self.paint
        woman = self.role == "bride"
        formal = self.outfit == "formal"
        dress = woman and formal
        top, line = self.suit()
        r = self.HEAD_R
        hx, hy = x + f * self.lean * 7, F - 99 + self.lean * 3
        sh_back, sh_front = (x - f * 7, F - 70), (x + f * 7, F - 70)

        # 면사포 (몸 뒤쪽): 머리에서 바닥까지 몽글하게
        if dress:
            veil = [(hx - f * 4, hy - 14), (hx - f * 22, hy - 4), (x - f * 40, F - 6), (x - f * 12, F - 30)]
            pygame.draw.polygon(s, (250, 246, 252), veil)
            pygame.draw.lines(s, _PINK, False, [(vx + 1, vy + 1) for vx, vy in veil[:3]], 2)
        # 뒤쪽 팔
        self.arm(s, sh_back, self.hands[0] or (x - f * 15, F - 46), darker(top, 0.9), line)
        # 짧고 통통한 다리
        if not dress:
            sw = math.sin(self.walk) * 6 if self.walking else 0.0
            for side, col in ((-1, darker(top, 0.9)), (1, top)):
                lx = x + side * 8 + side * sw * f
                p.blob(s, "rrect", (lx - 7, F - 28, 14, 26), 7, fill=col, line=line)
                p.blob(s, "ellipse", (lx - 8 + f * 3, F - 7, 16, 9), fill=line, line=darker(line, 0.8))
        # 몸통
        if dress:
            sway = math.sin(self.walk) * 4 if self.walking else 0
            skirt = [(x - 13, F - 64), (x + 13, F - 64), (x + f * 30 + sway, F), (x - f * 42 + sway, F + 2)]
            pygame.draw.polygon(s, _FLUFF, skirt)
            pygame.draw.lines(s, _PINK, True, [(sx + 1, sy + 1) for sx, sy in skirt], 2)
            for i in range(9):      # 치맛단 레이스
                lx = lerp(x - f * 42, x + f * 30, i / 8) + sway
                pygame.draw.circle(s, _PINK, (int(lx), int(F - 1)), 3)
            p.blob(s, "rrect", (x - 15, F - 80, 30, 22), 10, fill=_FLUFF, line=_PINK)    # 윗도리
            pygame.draw.line(s, _PINK, (x - 13, F - 62), (x + 13, F - 62), 4)             # 리본 띠
        elif self.role == "officiant" and formal:
            p.blob(s, "rrect", (x - 21, F - 80, 42, 78), 16, fill=top, line=line)          # 긴 가운
            for side in (-1, 1):
                pygame.draw.line(s, _YELLOW, (x + side * 6, F - 76), (x + side * 8, F - 10), 4)
        else:
            p.blob(s, "rrect", (x - 19, F - 80, 38, 56), 17, fill=top, line=line)
            if formal:              # 신랑 예복: 흰 셔츠 V + 핑크 나비넥타이 + 꽃
                pygame.draw.polygon(s, _FLUFF, [(x - 8, F - 79), (x + 8, F - 79), (x, F - 60)])
                pygame.draw.polygon(s, _PINK, [(x - 7, F - 77), (x, F - 73), (x - 7, F - 69)])
                pygame.draw.polygon(s, _PINK, [(x + 7, F - 77), (x, F - 73), (x + 7, F - 69)])
                pygame.draw.circle(s, _YELLOW, (int(x - f * 11), int(F - 64)), 4)
            else:                   # 점프슈트 지퍼
                pygame.draw.line(s, line, (x + f * 3, F - 78), (x + f * 3, F - 30), 2)
        # 머리: 동물 모자 + 동그란 얼굴
        p.draw_ears(s, hx, hy, r)
        p.blob(s, "circle", (hx, hy), r)
        p.draw_face(s, hx, hy, r, turn=f * 0.8, closed=self.eyes_closed, blush=woman or self.blush)
        if dress:                   # 꽃 머리띠
            for i, col in enumerate((_YELLOW, _PINK, _YELLOW, _PINK, _YELLOW)):
                a = math.pi * (1.15 + i * 0.17)
                pygame.draw.circle(s, col, (int(hx + math.cos(a) * r * 0.92), int(hy + math.sin(a) * r * 0.92)), 3)
        if self.role == "officiant":    # 동그란 안경
            pygame.draw.circle(s, INK_TEXT, (int(hx + f * 7), int(hy)), 5, 1)
        if self.blush:   # 땀방울
            dx, dy = hx - f * 16, hy - 14
            pygame.draw.polygon(s, _BLUE, [(dx, dy - 6), (dx - 3, dy), (dx + 3, dy)])
            pygame.draw.circle(s, _BLUE, (int(dx), int(dy + 1)), 3)
        # 일렉기타
        if self.guitar:
            bx, by = x + f * 8, F - 54
            neck_end = (x + f * 50, F - 92)
            pygame.draw.line(s, _PURPLE, (bx - f * 8, by - 8), (x - f * 6, F - 76), 3)
            pygame.draw.line(s, _CORAL, (bx, by), neck_end, 5)
            pygame.draw.line(s, INK_TEXT, neck_end, (neck_end[0] + f * 8, neck_end[1] - 7), 7)
            p.blob(s, "circle", (bx - f * 2, by + 5), 14, fill=_PINK, line=_PURPLE)
            p.blob(s, "circle", (bx + f * 6, by - 5), 10, fill=_PINK, line=_PURPLE)
            pygame.draw.circle(s, _YELLOW, (int(bx - f * 1), int(by + 3)), 6)
        # 앞쪽 팔
        free_front = self.hands[1] is None
        front = self.hands[1] or ((x + f * 16, F - 58) if self.bouquet else (x + f * 15, F - 46))
        self.arm(s, sh_front, front, top, line)
        if self.ring:
            pygame.draw.circle(s, _YELLOW, (int(front[0]), int(front[1])), 4, 2)
        # 부케: 지정 위치 > 비어 있는 앞손 > 비어 있는 뒷손
        if self.bouquet:
            if self.bouquet_at:
                bp = self.bouquet_at
            elif free_front:
                bp = front
            elif self.hands[0] is None:
                bp = (x - f * 15, F - 46)
            else:
                bp = None
            if bp:
                draw_bouquet(s, bp[0], bp[1] - 6, 0.75)
        # 머리 긁는 손은 머리 위에 보이도록 다시 그림
        if self.blush and self.hands[0]:
            self.arm(s, sh_back, self.hands[0], top, line)


class Guest(CostumePainter):
    """객석 하객: 동물 옷을 입은 아이. 평소엔 신랑 신부 쪽을 보는 뒷모습이고,
    말풍선을 띄울 때(turned)는 뒤돌아 얼굴을 보여 준다."""
    def __init__(self, x, y, k, costume=None):
        super().__init__(costume or random.choice(list(COSTUMES)), k)
        self.x, self.y = x, y
        self.phase = random.uniform(0, math.tau)
        self.speed = random.uniform(0.45, 0.6)
        self.holding = False    # 부케를 받았는지
        self.hop = 0            # 새 글을 올리면 폴짝 (남은 프레임)

    def draw(self, s, t, clapping, groove, turned=False):
        k = self.k
        x = self.x + (math.sin(t * 0.12 + self.phase) * 3 * k if groove else 0)
        y = self.y - (abs(math.sin(t * 0.2)) * 6 * k if self.holding else 0)
        if self.hop:
            y -= abs(math.sin(self.hop / 30 * math.pi * 3)) * 10 * k
        r = 15 * k
        arm = max(2, int(7 * k))
        self.blob(s, "ellipse", (x - 23 * k, y + 8 * k, 46 * k, 40 * k))    # 통통한 몸
        if not turned and self.costume in ("bunny", "bear", "sheep"):        # 뒷모습엔 꼬리
            pygame.draw.circle(s, _FLUFF if self.costume != "bear" else self.fill,
                               (int(x), int(y + 36 * k)), int(5 * k))
        if self.holding:   # 부케를 머리 위로 번쩍!
            for side in (-1, 1):
                pygame.draw.line(s, self.fill, (x + side * 18 * k, y + 14 * k), (x + side * 9 * k, y - 26 * k), arm)
                self.blob(s, "circle", (x + side * 9 * k, y - 26 * k), 5 * k)
        elif clapping:
            gap = (3 + 7 * abs(math.sin(t * self.speed + self.phase))) * k
            hy = y - 12 * k
            for side in (-1, 1):
                pygame.draw.line(s, self.fill, (x + side * 18 * k, y + 14 * k), (x + side * gap, hy), arm)
                self.blob(s, "circle", (x + side * gap, hy), 5 * k)
        self.draw_ears(s, x, y, r)
        self.blob(s, "circle", (x, y), r)                                    # 동물 모자
        if turned:
            self.draw_face(s, x, y, r)
        if self.holding:
            draw_bouquet(s, x, y - 42 * k, 1.4 * k)


class FloatIcon:
    """아이템 아이콘이 날아와 장착되는 연출"""
    def __init__(self, kind, start, end, frames=50):
        self.kind, self.start, self.end, self.frames = kind, start, end, frames
        self.t = 0

    @property
    def done(self):
        return self.t >= self.frames

    def update(self):
        self.t += 1

    def draw(self, s, tick):
        k = ease(self.t / self.frames)
        x = lerp(self.start[0], self.end[0], k)
        y = lerp(self.start[1], self.end[1], k) - math.sin(k * math.pi) * 30
        draw_icon_glow(s, self.kind, x, y, 0.9, tick)


class Note:
    def __init__(self, x, y):
        self.x, self.y = x, y
        self.vx = random.uniform(-0.6, 0.6)
        self.life = self.max_life = 90
        self.color = random.choice(((255, 90, 140), (120, 90, 220), (255, 170, 50), (60, 160, 220)))
        self.double = random.random() < 0.4

    def update(self):
        self.x += self.vx + math.sin(self.life * 0.1) * 0.5
        self.y -= 1.1
        self.life -= 1

    def draw(self, s):
        x, y = self.x, self.y
        pygame.draw.ellipse(s, self.color, (x - 6, y - 4, 10, 8))
        pygame.draw.line(s, self.color, (x + 3, y), (x + 3, y - 18), 2)
        if self.double:
            pygame.draw.ellipse(s, self.color, (x + 8, y - 6, 10, 8))
            pygame.draw.line(s, self.color, (x + 17, y - 2), (x + 17, y - 20), 2)
            pygame.draw.line(s, self.color, (x + 3, y - 18), (x + 17, y - 20), 3)
        else:
            pygame.draw.line(s, self.color, (x + 3, y - 18), (x + 9, y - 12), 2)


class MiniHeart:
    """팔랑팔랑 떨어지는 작은 하트"""
    def __init__(self, x, y, burst=False):
        self.x, self.y = x, y
        if burst:
            a = random.uniform(0, math.tau)
            sp = random.uniform(2, 10)
            self.vx, self.vy = math.cos(a) * sp, math.sin(a) * sp - 2
        else:
            self.vx, self.vy = 0.0, random.uniform(0.6, 1.4)
        self.fall = random.uniform(0.7, 1.5)
        self.size = random.uniform(9, 20)
        self.color = random.choice(HEART_PINKS)
        self.phase = random.uniform(0, math.tau)
        self.flip = random.uniform(0, math.tau)
        self.flip_speed = random.uniform(0.04, 0.11)
        self.sway = random.uniform(0.5, 1.5)

    def update(self):
        self.vx *= 0.95
        self.vy += (self.fall - self.vy) * 0.05
        self.phase += 0.04
        self.flip += self.flip_speed
        self.x += self.vx + math.sin(self.phase) * self.sway
        self.y += self.vy

    def draw(self, s):
        sx = max(0.12, abs(math.cos(self.flip)))
        draw_heart(s, self.color, self.x, self.y, self.size, sx)


class Board:
    """DemoWeb 게시판 글 목록을 웹 서버(/api/posts)에서 받아 온다.
    컴퓨터에선 화면이 멈추지 않도록 뒤쪽 스레드가 BOARD_POLL_SEC 마다 받아 온다.
    웹(브라우저)판은 스레드를 못 쓰므로 poll() 때 BOARD_POLL_SEC_WEB 마다 직접 받아 온다."""
    def __init__(self, url=BOARD_URL):
        if IS_WEB:      # 방명록과 같은 사이트에서 돌아가므로 그 사이트의 /api/posts
            url = str(__import__("platform").window.location.origin) + "/api/posts"
        self.url = url
        self.posts = {}         # 글 번호 → (제목, 작성자). 게임 쪽에서 본 마지막 목록
        self.loaded = False
        self._latest = None     # 받아 둔 최신 목록
        self._lock = threading.Lock()
        self._next_fetch = 0.0
        if not IS_WEB:
            threading.Thread(target=self._fetch_loop, daemon=True).start()

    def _fetch(self):
        try:
            if IS_WEB:  # pygbag 이 urlretrieve 를 브라우저 요청으로 바꿔 둔다
                path, _ = urllib.request.urlretrieve(self.url)
                with open(path, encoding="utf-8") as fh:
                    data = json.load(fh)
            else:
                with urllib.request.urlopen(self.url, timeout=3) as res:
                    data = json.loads(res.read().decode("utf-8"))
            posts = {int(p["id"]): (str(p["title"]), str(p["author"])) for p in data["posts"]}
        except Exception:   # 서버가 꺼져 있거나 응답이 이상하면 말풍선 없이 그대로 진행
            return
        with self._lock:
            self._latest = posts

    def _fetch_loop(self):
        while True:
            self._fetch()
            time.sleep(BOARD_POLL_SEC)

    def poll(self):
        """(새로 생긴 글 번호 목록, 이번에 처음 받아 왔는지)를 돌려준다."""
        if IS_WEB and time.time() >= self._next_fetch:
            self._next_fetch = time.time() + BOARD_POLL_SEC_WEB
            self._fetch()
        with self._lock:
            posts = self._latest
        if posts is None:
            return [], False
        first = not self.loaded
        self.loaded = True
        new = [] if first else sorted(set(posts) - set(self.posts))
        self.posts = posts
        return new, first

    @staticmethod
    def seat(post_id):
        return SEAT_ORDER[(post_id - 1) % len(SEAT_ORDER)]


def clip_text(font, text, width):
    """글자 폭이 width를 넘으면 잘라서 … 를 붙인다"""
    if font.size(text)[0] <= width:
        return text
    while text and font.size(text + "…")[0] > width:
        text = text[:-1]
    return text + "…"


def wrap_text(font, text, width, max_lines):
    """글자 단위로 줄을 나눈다 (한글은 띄어쓰기 없이도 끊긴다). 넘치면 마지막 줄 끝을 … 로"""
    lines, line = [], ""
    for ch in " ".join(text.split()):
        if font.size(line + ch)[0] > width:
            lines.append(line.rstrip())
            line = ch.lstrip()
            if len(lines) == max_lines:
                lines[-1] = clip_text(font, lines[-1] + "…", width)
                return lines
        else:
            line += ch
    if line:
        lines.append(line)
    return lines


_glyph_cache = {}
_fallback_fonts = {}


def has_glyph(font, ch):
    """글꼴에 그 글자가 있는지: 없는 글자 자리(빈 네모)와 그림이 같으면 없는 것"""
    key = (id(font), ch)
    if key not in _glyph_cache:
        img = font.render(ch, True, (0, 0, 0))
        missing = font.render("", True, (0, 0, 0))
        _glyph_cache[key] = ch.isspace() or (img.get_size() != missing.get_size()
                                             or pygame.image.tobytes(img, "RGBA") != pygame.image.tobytes(missing, "RGBA"))
    return _glyph_cache[key]


def render_text(font, text, color):
    """방명록 글처럼 아무 글자나 올 수 있는 글을 그린다.
    주아에 없는 글자(♥ ★ 등)는 시스템 글꼴로 바꿔 그려 빈 네모가 안 나오게 한다."""
    if all(has_glyph(font, ch) for ch in text):
        return font.render(text, True, color)
    size = font.get_height() * 4 // 5
    if size not in _fallback_fonts:
        path = next((p for p in (pygame.font.match_font(n) for n in ("segoeuisymbol", "malgungothic", "applegothic"))
                     if p), None)
        _fallback_fonts[size] = pygame.font.Font(path, size)
    runs, cur, cur_ok = [], "", None
    for ch in text:                     # 글꼴이 같은 글자끼리 묶기
        ok = has_glyph(font, ch)
        if cur and ok != cur_ok:
            runs.append((cur, cur_ok))
            cur = ""
        cur, cur_ok = cur + ch, ok
    if cur:
        runs.append((cur, cur_ok))
    imgs = [(font if ok else _fallback_fonts[size]).render(run, True, color) for run, ok in runs]
    out = pygame.Surface((sum(i.get_width() for i in imgs), font.get_height()), pygame.SRCALPHA)
    x = 0
    for img in imgs:
        out.blit(img, (x, (out.get_height() - img.get_height()) // 2))
        x += img.get_width()
    return out


class SpeechBubble:
    """하객 머리 위에 통 튀어나오는 방명록 말풍선 (둥근 말풍선 + 어긋나게 찍힌 옐로 그림자)"""
    POP, LIFE, FADE = 14, 210, 24
    TEXT = INK_TEXT             # 글씨: 부드러운 남색
    PINK = INK["pink"]
    YELLOW = INK["yellow"]

    def __init__(self, game, guest, post_id, title, author, new=False):
        self.guest, self.post_id, self.new = guest, post_id, new
        self.life = self.LIFE + (90 if new else 0)
        self.t = 0
        font = game.small_font
        lines = [render_text(font, line, self.TEXT) for line in wrap_text(font, title, 150, 2)]
        author_img = render_text(game.tiny_font, clip_text(game.tiny_font, f"- {author}", 150), self.PINK)
        w = max([author_img.get_width()] + [img.get_width() for img in lines]) + 22
        h = sum(img.get_height() for img in lines) + author_img.get_height() + 14
        top = 8 if new else 0   # NEW 딱지 자리
        self.img = pygame.Surface((w + 5 + (10 if new else 0), top + h + 14), pygame.SRCALPHA)
        fill = (255, 246, 190) if new else (255, 255, 255)
        body = pygame.Rect(0, top, w, h)
        cx = w // 2
        tail = [(cx - 8, top + h - 3), (cx + 8, top + h - 3), (cx - 2, top + h + 11)]
        # 옐로 판이 3px 비껴 찍힌 그림자 → 바탕 → 핑크 테두리
        pygame.draw.rect(self.img, self.YELLOW, body.move(4, 4), border_radius=14)
        pygame.draw.polygon(self.img, self.YELLOW, [(px + 4, py + 4) for px, py in tail])
        pygame.draw.rect(self.img, fill, body, border_radius=14)
        pygame.draw.rect(self.img, self.PINK, body, 2, border_radius=14)
        pygame.draw.polygon(self.img, fill, tail)
        pygame.draw.lines(self.img, self.PINK, False, [tail[0], tail[2], tail[1]], 2)
        pygame.draw.line(self.img, fill, (tail[0][0] + 2, tail[0][1]), (tail[1][0] - 2, tail[1][1]), 3)
        y = top + 7
        for img in lines:
            self.img.blit(img, (11, y))
            y += img.get_height()
        self.img.blit(author_img, (11, y))
        if new:
            badge = game.tiny_font.render("NEW", True, WHITE)
            br = badge.get_rect(topright=(self.img.get_width(), 0)).inflate(12, 4).clamp(self.img.get_rect())
            pygame.draw.rect(self.img, self.PINK, br, border_radius=br.h // 2)
            self.img.blit(badge, badge.get_rect(center=br.center))

    @property
    def done(self):
        return self.t >= self.life

    def update(self):
        self.t += 1

    def draw(self, s, lift):
        g = self.guest
        k = min(1.0, self.t / self.POP)    # 0 → 1.15 → 1 로 통 튀어나오기
        scale = 1.15 * math.sin(k / 0.7 * math.pi / 2) if k < 0.7 else lerp(1.15, 1.0, (k - 0.7) / 0.3)
        img = self.img
        if scale != 1.0:
            img = pygame.transform.smoothscale(img, (max(1, int(img.get_width() * scale)),
                                                     max(1, int(img.get_height() * scale))))
        img.set_alpha(int(255 * min(1.0, (self.life - self.t) / self.FADE)))
        rect = img.get_rect(midbottom=(g.x, g.y - 16 * g.k - lift))
        rect.x = max(4, min(W - 4 - rect.w, rect.x))
        s.blit(img, rect)


class Ceremony:
    LETTER_LINES = ["사랑하는 당신에게,",
                    "하늘에서 손을 맞잡았던 그날처럼",
                    "어떤 바람이 불어와도",
                    "이 손 절대 놓지 않을게요.",
                    "평생 함께 날아요."]

    def __init__(self, game):
        self.g = game
        self.t = 0
        self.bg = self.build_hall()
        self.bride = Person("bride", 80, 1)
        self.groom = Person("groom", 135, 1)
        self.officiant = Person("officiant", 432, -1)
        # 동물 옷은 옆자리끼리 겹치지 않게 돌려 가며 입힌다
        kinds = list(COSTUMES)
        random.shuffle(kinds)
        seats = [(28 + i * 53, 598, 0.82) for i in range(9)] + [(34 + i * 69, 676, 1.05) for i in range(7)]
        self.guests = [Guest(x, y, k, kinds[i % len(kinds)]) for i, (x, y, k) in enumerate(seats)]
        self.icons, self.notes, self.hearts, self.effects = [], [], [], []
        self.caption = None
        self.chute = None           # (x, y, alpha)
        self.poof = 0
        self.letter_held = False
        self.card_t = -1
        self.big_heart = None       # (x, y, size)
        self.flash = 0.0
        self.clap = 0
        self.groove = False
        self.rain = 0.0
        self.ending_t = -1
        self.arch = None
        self.toss = None            # 날아가는 부케 (x, y, 회전각, 크기)
        self.fade_in = 1.0
        self.bubbles = []
        game.board.poll()
        self.bubble_queue = self.intro_queue()
        self.bubble_wait = 70
        self.script = self.run_script()
        game.audio.play_music("bgm_hall")

    # ----- 배경 -----
    def build_hall(self):
        bg = pygame.Surface((W, H))
        for y in range(430):
            k = y / 430
            bg.fill((int(lerp(253, 242, k)), int(lerp(246, 228, k)), int(lerp(238, 216, k))), (0, y, W, 1))
        # 창문 (하늘과 구름)
        for wx in (70, 200, 330):
            rect = pygame.Rect(wx - 34, 90, 68, 200)
            win = pygame.Surface(rect.size)
            for y in range(rect.h):
                win.fill((int(lerp(150, 215, y / rect.h)), int(lerp(200, 235, y / rect.h)), 250), (0, y, rect.w, 1))
            for cxp, cyp in ((20, 60), (45, 120), (15, 160)):
                pygame.draw.circle(win, WHITE, (cxp, cyp), 12)
                pygame.draw.circle(win, WHITE, (cxp + 12, cyp + 3), 9)
            mask = pygame.Surface(rect.size, pygame.SRCALPHA)
            pygame.draw.rect(mask, (255, 255, 255, 255), (0, 34, rect.w, rect.h - 34))
            pygame.draw.circle(mask, (255, 255, 255, 255), (rect.w // 2, 34), 34)
            win.set_colorkey(None)
            win_a = win.convert_alpha() if pygame.display.get_surface() else win
            win_a.blit(mask, (0, 0), special_flags=pygame.BLEND_RGBA_MULT)
            bg.blit(win_a, rect)
            pygame.draw.arc(bg, (220, 190, 120), (rect.x, rect.y, rect.w, 68), 0, math.pi, 4)
            pygame.draw.line(bg, (220, 190, 120), (rect.x + 1, rect.y + 34), (rect.x + 1, rect.bottom), 4)
            pygame.draw.line(bg, (220, 190, 120), (rect.right - 2, rect.y + 34), (rect.right - 2, rect.bottom), 4)
            pygame.draw.line(bg, (220, 190, 120), (rect.x, rect.bottom), (rect.right, rect.bottom), 4)
            pygame.draw.line(bg, (220, 190, 120), (wx, rect.y + 4), (wx, rect.bottom), 2)
            shaft = pygame.Surface((W, H), pygame.SRCALPHA)
            pygame.draw.polygon(shaft, (255, 250, 210, 38),
                                [(rect.x, rect.bottom), (rect.right, rect.bottom), (wx + 90, FLOOR + 30), (wx - 10, FLOOR + 30)])
            bg.blit(shaft, (0, 0))
        # 벽 아래 장식판 (옅은 핑크 → 인쇄하면 고운 핑크 망점)
        bg.fill((252, 222, 232), (0, 360, W, 70))
        for x in range(0, W, 60):
            pygame.draw.rect(bg, INK["pink"], (x + 6, 368, 48, 54), 2, border_radius=10)
        # 바닥: 종이색에서 옐로로 번지는 그러데이션(꽃 그림의 망점 번짐처럼), 카펫은 핑크 잉크 한 판
        for y in range(430, H):
            k = (y - 430) / (H - 430)
            bg.fill((int(lerp(250, 255, k)), int(lerp(240, 226, k)), int(lerp(226, 130, k))), (0, y, W, 1))
        bg.fill(INK["pink"], (0, 482, W, 72))
        bg.fill(INK["yellow"], (0, 482, W, 4))
        bg.fill(INK["yellow"], (0, 550, W, 4))
        # 꽃 장식 줄
        rng = random.Random(3)
        for i in range(8):
            x0, x1 = i * 64, i * 64 + 64
            pts = [(lerp(x0, x1, j / 10), 30 + math.sin(j / 10 * math.pi) * 22) for j in range(11)]
            pygame.draw.lines(bg, (110, 160, 100), False, pts, 3)
            for px, py in pts[1:-1:2]:
                pygame.draw.circle(bg, rng.choice(((255, 170, 200), WHITE, (255, 210, 225))), (int(px), int(py)), 6)
        # 꽃 받침대
        for fx in (140, 265):
            pygame.draw.rect(bg, (240, 236, 228), (fx - 6, 380, 12, 60))
            pygame.draw.rect(bg, (240, 236, 228), (fx - 14, 436, 28, 8))
            for _ in range(14):
                pygame.draw.circle(bg, rng.choice(((255, 160, 195), WHITE, (255, 205, 220), (120, 170, 110))),
                                   (fx + rng.randint(-18, 18), 368 + rng.randint(-14, 12)), rng.randint(5, 8))
        # 꽃 아치 (주례석)
        for j in range(60):
            a = math.pi * j / 59
            ax, ay = 432 + math.cos(a) * 44, 300 - math.sin(a) * 44
            pygame.draw.circle(bg, rng.choice(((255, 160, 195), WHITE, (255, 205, 220), (120, 170, 110))),
                               (int(ax), int(ay)), rng.randint(6, 9))
        for px in (388, 476):
            for y in range(300, FLOOR, 10):
                pygame.draw.circle(bg, rng.choice(((255, 160, 195), WHITE, (120, 170, 110))),
                                   (px + rng.randint(-3, 3), y), rng.randint(5, 8))
        return bg

    # ----- 연출 대본 (제너레이터로 프레임 단위 진행) -----
    def wait(self, n):
        for _ in range(n):
            yield

    def hold_hands(self, y_off=56):
        b, m = self.bride, self.groom
        mid = ((b.x + m.x) / 2, FLOOR - y_off)
        for p, other in ((b, m), (m, b)):
            toward = (other.x - p.x) * p.facing > 0
            p.hands = (None, mid) if toward else (mid, None)

    def walk_to(self, moves, hold=False, speed=1.3):
        while True:
            moving = False
            for p, tx in moves:
                dx = tx - p.x
                if abs(dx) > speed:
                    sign = 1 if dx > 0 else -1
                    p.x += sign * speed
                    p.facing = sign
                    p.walking = True
                    p.walk += 0.16
                    moving = True
                else:
                    p.x = tx
                    p.walking = False
            if hold:
                self.hold_hands()
            if not moving:
                return
            yield

    def sparkle_burst(self, x, y, n=30, colors=None):
        colors = colors or [YELLOW, WHITE, (255, 190, 220)]
        for _ in range(n):
            self.effects.append(Particle(x, y, random.choice(colors), 4, 45, 3))

    def run_script(self):
        g, A = self.g, self.g.audio
        b, m = self.bride, self.groom

        # 0) 하트 낙하산을 타고 결혼식장에 착지
        self.caption = "결혼식장 도착!"
        for i in range(160):
            y = lerp(-170, FLOOR, ease(i / 160))
            b.y = m.y = y
            self.chute = ((b.x + m.x) / 2, y - 200, 255)
            self.hold_hands()
            yield
        b.y = m.y = FLOOR
        A.play("land")
        for _ in range(12):
            self.effects.append(Particle(lerp(b.x, m.x, random.random()), FLOOR, (230, 215, 200), 2.5, 25, 4))
        for i in range(60):
            cx, cy, _ = self.chute
            self.chute = (cx + 1.5, cy - 3, int(255 * (1 - i / 60)))
            yield
        self.chute = None
        yield from self.wait(30)

        # 1) 각자의 예복으로 갈아입기
        self.caption = "1. 예복으로 갈아입기"
        self.icons += [FloatIcon("tux", (m.x + 60, 180), (m.x, FLOOR - 80), 60),
                       FloatIcon("dress", (b.x - 40, 180), (b.x, FLOOR - 80), 60)]
        yield from self.wait(60)
        self.icons.clear()
        A.play("poof")
        self.poof = 50
        for p in (b, m):
            for _ in range(18):
                self.effects.append(Particle(p.x, FLOOR - 60, (250, 245, 250), 2.5, 50, 16, shape="puff"))
            self.sparkle_burst(p.x, FLOOR - 60, 20)
        yield from self.wait(18)
        b.outfit = m.outfit = "formal"
        yield from self.wait(60)
        self.icons.append(FloatIcon("bouquet", (b.x - 50, 170), (b.x + 13, FLOOR - 68), 50))
        yield from self.wait(50)
        self.icons.clear()
        A.play("sparkle")
        b.bouquet = True
        self.sparkle_burst(b.x + 13, FLOOR - 70, 16, [WHITE, (255, 220, 80)])
        yield from self.wait(50)

        # 2) 주례석 앞까지 걸어가서 편지 함께 읽기
        self.caption = "2. 주례석 앞에서 편지 읽기"
        yield from self.walk_to([(b, 285), (m, 340)], hold=True)
        b.facing = m.facing = 1
        yield from self.wait(25)
        self.icons.append(FloatIcon("letter", (312, 150), (313, FLOOR - 82), 50))
        yield from self.wait(50)
        self.icons.clear()
        A.play("paper")
        self.letter_held = True
        b.hands = (None, (303, FLOOR - 80))
        m.hands = ((324, FLOOR - 80), None)
        self.card_t = 0
        yield from self.wait(420)
        A.play("paper")
        self.card_t = -1
        self.letter_held = False
        b.hands = m.hands = (None, None)
        yield from self.wait(30)

        # 3) 서로 바라보고 반지 나눠 끼기
        self.caption = "3. 반지 나눠 끼기"
        m.facing = -1
        yield from self.wait(30)
        self.icons.append(FloatIcon("ring", (312, 150), (312, FLOOR - 130), 50))
        yield from self.wait(50)
        self.icons.clear()
        b.hands = (None, (305, FLOOR - 70))
        m.hands = (None, (319, FLOOR - 70))
        yield from self.wait(20)
        A.play("bell")
        b.ring = m.ring = True
        self.sparkle_burst(312, FLOOR - 70, 40, [YELLOW, WHITE, (255, 230, 150)])
        for _ in range(6):
            self.effects.append(Particle(312, FLOOR - 120, random.choice(HEART_PINKS), 2, 60, 8,
                                         gravity=-0.03, shape="heart"))
        yield from self.wait(130)
        b.hands = m.hands = (None, None)

        # 4) 신부가 신랑 앞에서 일렉기타를 메고 축가
        self.caption = "4. 신부의 축가"
        b.bouquet, m.bouquet = False, True     # 축가 동안 부케는 신랑이 들고 있기
        yield from self.walk_to([(b, 222)])
        b.facing = 1
        yield from self.wait(25)
        self.icons.append(FloatIcon("guitar", (150, 150), (b.x + 10, FLOOR - 70), 50))
        yield from self.wait(50)
        self.icons.clear()
        b.guitar = True
        yield from self.wait(25)
        A.stop_music(400)
        A.play("song")
        self.groove = True
        song_frames = int(A.lengths.get("song", 10.0) * FPS) + 20
        for i in range(song_frames):
            strum = math.sin(i * 0.5) * 6
            b.hands = ((b.x + 38, FLOOR - 86), (b.x + 6, FLOOR - 58 + strum))
            b.bob = -abs(math.sin(i * 0.14)) * 3
            m.bob = -abs(math.sin(i * 0.14 + 1)) * 2
            if i % 18 == 0:
                self.notes.append(Note(b.x + random.randint(0, 40), FLOOR - 120))
            yield
        b.bob = m.bob = 0
        b.guitar = False
        b.hands = (None, None)
        self.groove = False
        A.play_music("bgm_hall")
        yield from self.wait(30)

        # 5) 다시 신랑 옆으로, 키스 → 하트가 부풀다가 펑!
        self.caption = "5. 맹세의 키스"
        yield from self.walk_to([(b, 302)])
        b.bouquet, m.bouquet = True, False     # 부케를 다시 신부에게
        b.facing, m.facing = 1, -1
        self.hold_hands(60)
        yield from self.wait(30)
        for i in range(40):
            b.lean = m.lean = ease(i / 40)
            yield
        b.eyes_closed = m.eyes_closed = True
        A.play("kiss")
        for _ in range(5):
            self.effects.append(Particle(321, FLOOR - 130, random.choice(HEART_PINKS), 1.5, 60, 9,
                                         gravity=-0.04, shape="heart"))
        yield from self.wait(50)
        # 하늘에서 얻은 하트가 떠올라 부풀기
        start = (321, FLOOR - 150)
        for i in range(70):
            k = ease(i / 70)
            self.big_heart = (lerp(start[0], W / 2, k), lerp(start[1], 215, k), lerp(26, 70, k))
            yield
        A.play("inflate")
        for i in range(150):
            k = i / 150
            wobble = 1 + 0.06 * math.sin(i * 0.5) * k
            self.big_heart = (W / 2, 215, lerp(70, 330, k * k) * wobble)
            yield
        # 펑!
        self.big_heart = None
        A.play("pop")
        self.flash = 1.0
        for _ in range(260):
            self.hearts.append(MiniHeart(W / 2 + random.uniform(-120, 120), 215 + random.uniform(-100, 100), True))
        A.play("clap")
        self.clap = 360
        self.rain = 2.5
        yield from self.wait(70)
        for i in range(40):
            b.lean = m.lean = 1 - ease(i / 40)
            yield
        b.eyes_closed = m.eyes_closed = False
        yield from self.wait(60)

        # 6) HAPPILY EVER AFTER
        self.caption = None
        self.ending_t = 0
        b.hands = m.hands = (None, None)
        yield from self.wait(40)

        # 7) 부케 던지기: 매번 다른 하객이 받음
        for i in range(24):     # 팔을 들어 올리는 준비 동작
            k = ease(i / 24)
            hand = (b.x + lerp(13, 4, k), lerp(FLOOR - 62, FLOOR - 150, k))
            b.hands = (None, hand)
            b.bouquet_at = hand
            yield
        start = b.bouquet_at
        b.bouquet, b.bouquet_at = False, None
        A.play("whoosh")
        # 이스터에그: 가끔은 주례 선생님이 부케를 받음 (연달아 받지는 않음)
        officiant_catch = ((g.last_catcher != "officiant" or OFFICIANT_CHANCE >= 1)
                           and random.random() < OFFICIANT_CHANCE)
        if officiant_catch:
            g.last_catcher = "officiant"
            o = self.officiant
            end = (o.x + o.facing * 26, FLOOR - 100)
            end_scale = 0.75
        else:
            choices = [i for i in range(len(self.guests)) if i != g.last_catcher]
            idx = random.choice(choices)
            g.last_catcher = idx
            catcher = self.guests[idx]
            end = (catcher.x, catcher.y - 40 * catcher.k)
            end_scale = 1.4 * catcher.k
        frames = 80
        for i in range(frames):
            k = i / frames
            x = lerp(start[0], end[0], k)
            y = lerp(start[1], end[1], k) - math.sin(k * math.pi) * 170
            self.toss = (x, y, k * 900, lerp(0.75, end_scale, k))
            if i == 12:
                b.hands = (None, None)
            yield
        self.toss = None
        A.play("complete")
        self.sparkle_burst(end[0], end[1], 40, [YELLOW, WHITE, (255, 190, 220)])
        for _ in range(8):
            self.effects.append(Particle(end[0], end[1], random.choice(HEART_PINKS), 2, 60, 9,
                                         gravity=-0.04, shape="heart"))
        if not officiant_catch:
            catcher.holding = True
            self.effects.append(TextPop("부케 캐치!", end[0], end[1] - 50, g.mid_font, (230, 60, 110)))
            while True:
                yield

        # 주례 선생님: 부케를 들고 쑥스러워서 머리 긁적긁적
        o = self.officiant
        o.bouquet = True
        o.blush = True
        o.eyes_closed = True
        pop = TextPop("어이쿠, 허허...", o.x - 40, FLOOR - 165, g.mid_font, (150, 80, 60))
        pop.life = pop.max_life = 150
        self.effects.append(pop)
        t = 0
        while True:
            t += 1
            hx, hy = o.x + o.facing * o.lean * 7, FLOOR - 113
            scratch = math.sin(t * 0.45) * 4
            o.hands = ((hx - o.facing * 6 + scratch, hy - 13 + abs(scratch) * 0.5),   # 뒷손: 머리 긁기
                       (o.x + o.facing * 26, FLOOR - 94))                             # 앞손: 부케
            o.bouquet_at = o.hands[1]
            o.bob = -abs(math.sin(t * 0.08)) * 2
            yield

    # ----- 진행 -----
    def update(self):
        self.t += 1
        next(self.script)
        if self.fade_in > 0:
            self.fade_in = max(0.0, self.fade_in - 1 / 45)
        if self.poof:
            self.poof -= 1
        if self.flash:
            self.flash = max(0.0, self.flash - 0.04)
        if self.clap:
            self.clap -= 1
        if self.card_t >= 0:
            self.card_t += 1
        if self.ending_t >= 0:
            self.ending_t += 1
        if self.rain > 0:
            if random.random() < self.rain % 1 or self.rain >= 1:
                for _ in range(max(1, int(self.rain))):
                    self.hearts.append(MiniHeart(random.uniform(0, W), -20))
            self.rain = max(0.2, self.rain - 0.01)
        for obj in self.icons + self.notes + self.hearts + self.effects:
            obj.update()
        self.notes = [n for n in self.notes if n.life > 0]
        self.hearts = [h for h in self.hearts if h.y < H + 30]
        self.effects = [e for e in self.effects if e.life > 0]
        self.update_bubbles()

    # ----- 게시판 말풍선 -----
    def intro_queue(self):
        """글을 번호순으로 하나씩 두두둥 띄울 차례 (자리가 겹치면 최근 글)"""
        return sorted({Board.seat(i): i for i in sorted(self.g.board.posts)}.values())

    def pop_bubble(self, post_id, new=False):
        post = self.g.board.posts.get(post_id)
        if not post:
            return
        guest = self.guests[Board.seat(post_id)]
        self.bubbles = [b for b in self.bubbles if b.guest is not guest]
        self.bubbles.append(SpeechBubble(self.g, guest, post_id, *post, new=new))
        if new:
            guest.hop = 30
            self.g.audio.play("pop")

    def update_bubbles(self):
        board = self.g.board
        if self.t % BOARD_POLL == 0:
            new, first = board.poll()
            if first:   # 식이 시작된 뒤에야 처음 받아 왔으면 그때 한 바퀴 띄운다
                self.bubble_queue = self.intro_queue()
            for post_id in new:
                self.pop_bubble(post_id, new=True)
            # 지워진 글의 말풍선은 거둔다
            self.bubbles = [b for b in self.bubbles if b.post_id in board.posts]
        for guest in self.guests:
            if guest.hop:
                guest.hop -= 1
        if self.bubble_wait:
            self.bubble_wait -= 1
        elif self.bubble_queue:
            # 두 줄 말풍선이라 한꺼번에 많으면 겹친다: 3개까지만 띄우고 나머지는 차례를 기다린다
            if len(self.bubbles) < 3:
                self.pop_bubble(self.bubble_queue.pop(0))
                self.bubble_wait = 12
        elif board.posts and len(self.bubbles) < 3:
            # 한 바퀴 돈 뒤에는 가끔씩 아무 하객이나 다시 한마디
            self.pop_bubble(random.choice(list(board.posts)))
            self.bubble_wait = random.randint(60, 140)
        for b in self.bubbles:
            b.update()
        self.bubbles = [b for b in self.bubbles if not b.done]

    # ----- 그리기 -----
    def draw(self, s):
        g = self.g
        s.blit(self.bg, (0, 0))
        self.officiant.draw(s)
        # 주례석 (주례자 앞)
        # 주례석: 코랄 잉크 한 판 + 보라 선, 노란 하트
        pygame.draw.rect(s, _CORAL, (402, FLOOR - 78, 60, 78), border_top_left_radius=8, border_top_right_radius=8)
        pygame.draw.rect(s, _PURPLE, (403, FLOOR - 77, 60, 78), 2, border_top_left_radius=8, border_top_right_radius=8)
        pygame.draw.rect(s, _PINK, (396, FLOOR - 86, 72, 12), border_radius=6)
        draw_heart(s, _YELLOW, 432, FLOOR - 42, 24)

        if self.chute:
            cx, cy, alpha = self.chute
            layer = pygame.Surface((W, H), pygame.SRCALPHA)
            for dx in (-60, -25, 25, 60):
                pygame.draw.line(layer, (230, 230, 230, alpha), (cx + dx, cy + 30),
                                 (cx + dx * 0.3, cy + 160), 1)
            for size, col in ((190, (255, 110, 160)), (130, (255, 160, 195)), (70, (255, 205, 225))):
                pygame.draw.polygon(layer, (*col, alpha), heart_poly(cx, cy - (190 - size) * 0.08, size))
            s.blit(layer, (0, 0))

        self.groom.draw(s)
        self.bride.draw(s)
        if self.letter_held:
            pygame.draw.rect(s, (255, 250, 236), (300, FLOOR - 98, 26, 32))
            pygame.draw.rect(s, (190, 160, 130), (300, FLOOR - 98, 26, 32), 1)
            for ly in range(5):
                pygame.draw.line(s, (200, 180, 160), (304, FLOOR - 92 + ly * 5), (322, FLOOR - 92 + ly * 5), 1)

        if self.poof:
            k = self.poof / 50
            for p in (self.bride, self.groom):
                for j in range(6):
                    a = j * math.tau / 6 + self.t * 0.05
                    pygame.draw.circle(s, (252, 250, 252),
                                       (int(p.x + math.cos(a) * 18), int(FLOOR - 60 + math.sin(a) * 34)),
                                       int(26 * k + 4))

        for ic in self.icons:
            ic.draw(s, self.t)
        for n in self.notes:
            n.draw(s)
        for e in self.effects:
            e.draw(s)
        if self.big_heart:
            x, y, size = self.big_heart
            draw_heart(s, (200, 30, 70), x, y + 2, size * 1.04)
            draw_heart(s, (255, 80, 135), x, y, size)
            pygame.draw.circle(s, (255, 200, 220), (int(x - size * 0.22), int(y - size * 0.15)), max(2, int(size * 0.06)))

        clapping = self.clap > 0
        talking = {b.guest for b in self.bubbles}     # 말풍선을 띄운 하객은 뒤돌아 얼굴을 보여 준다
        for guest in self.guests:
            guest.draw(s, self.t, clapping, self.groove, turned=guest in talking or guest.holding)

        for h in self.hearts:
            h.draw(s)
        # 앞줄 말풍선이 위에 오게. 앞줄 홀수 자리는 조금 더 높이 띄워 덜 겹치게
        # (뒷줄은 더 올리면 신랑 신부 발을 가린다)
        for b in sorted(self.bubbles, key=lambda b: (b.guest.y, b.new)):
            i = self.guests.index(b.guest)
            b.draw(s, 34 if i >= 9 and i % 2 else 0)

        if self.toss:
            x, y, angle, k = self.toss
            surf = pygame.Surface((50, 56), pygame.SRCALPHA)
            draw_bouquet(surf, 25, 30, 1.0)
            surf = pygame.transform.rotozoom(surf, angle, k)
            s.blit(surf, surf.get_rect(center=(int(x), int(y))))

        if self.card_t >= 0:
            self.draw_letter_card(s)
        if self.caption:
            g.text(self.caption, g.mid_font, (120, 40, 70), (W / 2, 26), box=True)
        if self.ending_t >= 0:
            self.draw_ending(s)
        if self.flash:
            fl = pygame.Surface((W, H))
            fl.fill(WHITE)
            fl.set_alpha(int(220 * self.flash))
            s.blit(fl, (0, 0))
        if self.fade_in:
            fl = pygame.Surface((W, H))
            fl.fill(WHITE)
            fl.set_alpha(int(255 * self.fade_in))
            s.blit(fl, (0, 0))

    def draw_letter_card(self, s):
        g = self.g
        k = ease(self.card_t / 25)
        rect = pygame.Rect(40, 60, 400, 210)
        card = pygame.Surface(rect.size, pygame.SRCALPHA)
        pygame.draw.rect(card, (255, 251, 240, 245), card.get_rect(), border_radius=14)
        pygame.draw.rect(card, (210, 170, 140), card.get_rect(), 3, border_radius=14)
        draw_heart(card, (230, 60, 100), rect.w - 30, 28, 22)
        shown = max(0, (self.card_t - 25) // 3)    # 한 글자씩 나타나기
        y = 28
        for line in self.LETTER_LINES:
            part = line[:shown]
            shown -= len(line)
            if part:
                card.blit(g.letter_font.render(part, True, (90, 50, 50)), (28, y))
            y += 34
        card.set_alpha(int(255 * k))
        s.blit(card, (rect.x, rect.y + (1 - k) * 20))

    def build_arch(self):
        text = "HAPPILY EVER AFTER"
        font = load_script_font(60)
        total = sum(font.size(c)[0] for c in text)
        R, cx, cy = 190, W / 2, 370
        size = int(max(28, min(110, 60 * R * 2.6 / total)))
        font = load_script_font(size)
        widths = [font.size(c)[0] for c in text]
        total = sum(widths)
        glyphs, pos = [], -total / 2
        for ch, w in zip(text, widths):
            mid = pos + w / 2
            pos += w
            if ch == " ":
                continue
            theta = mid / R
            fill = font.render(ch, True, (175, 20, 70))
            edge = font.render(ch, True, WHITE)
            o = 4
            surf = pygame.Surface((fill.get_width() + 2 * o, fill.get_height() + 2 * o), pygame.SRCALPHA)
            for j in range(16):
                a = j * math.tau / 16
                surf.blit(edge, (o + math.cos(a) * o, o + math.sin(a) * o))
            surf.blit(fill, (o, o))
            surf.blit(fill, (o + 1, o))   # 획을 조금 더 굵게
            surf = pygame.transform.rotozoom(surf, -math.degrees(theta), 1.0)
            x = cx + R * math.sin(theta)
            y = cy - R * math.cos(theta)
            glyphs.append((surf, (x, y)))
        return glyphs

    def draw_ending(self, s):
        g = self.g
        if self.arch is None:
            self.arch = self.build_arch()
        veil = pygame.Surface((W, H), pygame.SRCALPHA)
        a = int(min(150, self.ending_t * 2))
        # 글자 뒤에만 아치 모양으로 옅은 흰 띠를 깔아 읽기 쉽게
        pygame.draw.circle(veil, (255, 255, 255, a), (W // 2, 370), 235, 85,
                           draw_top_left=True, draw_top_right=True)
        s.blit(veil, (0, 0))
        for i, (surf, (x, y)) in enumerate(self.arch):
            age = self.ending_t - i * 8
            if age <= 0:
                break
            img = surf.copy()
            img.set_alpha(int(255 * min(1, age / 25)))
            lift = (1 - ease(age / 25)) * 12
            s.blit(img, img.get_rect(center=(x, y + lift)))
        buttons = self.ending_buttons()
        if buttons:
            g.button(s, buttons["restart"], "처음부터 다시", (255, 255, 255), INK["pink"])
            g.button(s, buttons["guestbook"], "방명록으로 ♥", INK["pink"], (255, 255, 255))

    def ending_buttons(self):
        """엔딩 글자가 다 나오면 화면 아래에 뜨는 버튼 자리. 아직이면 None"""
        if self.arch is None or self.ending_t <= len(self.arch) * 8 + 60:
            return None
        y = H - 74
        return {"restart": pygame.Rect(W / 2 - 196, y, 180, 52),
                "guestbook": pygame.Rect(W / 2 + 16, y, 180, 52)}


# ===================================================================
# 리소 인쇄 필터
# ===================================================================
class Riso:
    """다 그린 화면을 동화책 리소 인쇄물처럼 바꾼다.
    1) 색을 '잉크 조합' 중 하나로 고르되, 중간색(그러데이션)은 45도로 기운 둥근 망점으로 풀고
    2) 잉크 판마다 1~2px씩 어긋나게 찍은 뒤 3) 잉크가 덜 묻은 자리·종이 얼룩을 얹는다."""
    # 쓸 잉크 조합 (비트: 핑크 1, 옐로 2, 하늘 4, 초록 8). 탁해지는 조합(핑크+초록 등)은 뺀다.
    COMBOS = [0, 1, 2, 4, 8, 1 | 2, 1 | 4, 4 | 8, 2 | 8, 1 | 4 | 8]

    def __init__(self, size=(W, H)):
        w, h = size
        # 잉크 조합의 겹쳐 찍힌 색 = 종이 x 잉크들 (곱하기 혼합). 16번 = 종이 얼룩
        colors = []
        for bits in range(16):
            c = np.array(RISO_PAPER, float)
            for i, (_, ink, _, _) in enumerate(RISO_INKS):
                if bits >> i & 1:
                    c *= np.array(ink) / 255
            colors.append(c)
        self.colors = np.vstack([colors, [RISO_SPECK]]).astype(np.uint8)
        palette = np.array([colors[b] for b in self.COMBOS])

        # 망점 단계(16) x 색(채널당 16단계) → 가장 가까운 잉크 조합(비트) 표 (64KB라 캐시에 들어간다).
        # 망점 문턱값을 표에 미리 넣어 두면 매 프레임엔 표만 찾으면 된다. 초록에 무게를 더 준다.
        centers = np.arange(16) * 16 + 8
        grid = np.stack(np.meshgrid(centers, centers, centers, indexing="ij"), -1).reshape(-1, 3)
        offsets = ((np.arange(16) + 0.5) / 16 - 0.5) * RISO_SPREAD
        shifted = np.clip(grid[None] + offsets[:, None, None], 0, 255).reshape(-1, 1, 3)
        dist = (((shifted - palette[None]) ** 2) * np.array([3, 4, 2])).sum(-1)
        self.lut = np.array(self.COMBOS, np.uint8)[dist.argmin(-1)]   # [단계 * 4096 + 색 번호] → 잉크 비트

        # 아래 배열은 모두 (세로, 가로) 순서다. 화면 메모리가 그 순서라 계산이 빠르다.
        # 45도로 기운 둥근 망점 무늬: 칸마다 문턱 단계(0~15)
        yy, xx = np.mgrid[0:h, 0:w].astype(float)
        u = (xx + yy) / (RISO_SCREEN * math.sqrt(2))
        v = (yy - xx) / (RISO_SCREEN * math.sqrt(2))
        dots = (np.cos(2 * math.pi * u) + np.cos(2 * math.pi * v)) / 4 + 0.5
        self.level = (np.clip(dots * 16, 0, 15).astype(np.uint32) * 4096)

        # 잉크가 덜 묻은 자리(판마다 다름)와 종이 얼룩. 고운 종이 결이 되도록 1px 단위
        rng = np.random.default_rng(20261103)
        self.layers = [(1 << i, dy, dx, (rng.random((h, w)) >= 0.045).astype(np.uint8) * (1 << i))
                       for i, (_, _, dx, dy) in enumerate(RISO_INKS)]
        self.speck = (rng.random((h, w)) < 0.02).astype(np.uint8) * 16
        self.mapped = None

    def apply(self, src, dst):
        # 픽셀을 정수 하나(0xRRGGBB 꼴)로 한꺼번에 다뤄야 60fps 안에 끝난다
        px = pygame.surfarray.pixels2d(src)
        p = np.array(px.T, dtype=np.uint32)     # (세로, 가로) 순서로 복사
        del px                                  # 화면 잠금 풀기
        rs, gs, bs = src.get_shifts()[:3]
        key = (p >> (rs + 4)) & 15              # 빨강 4비트 << 8 | 초록 << 4 | 파랑
        key <<= 8
        key |= (p >> (bs + 4)) & 15
        p >>= gs + 4                            # p는 더 안 쓰므로 그 자리에서 계산
        p &= 15
        p <<= 4
        key |= p
        key += self.level
        idx = self.lut.take(key)
        out = np.zeros_like(idx)
        for bit, dy, dx, keep in self.layers:
            layer = idx & bit
            if dx or dy:
                layer = np.roll(layer, (dy, dx), axis=(0, 1))
            layer &= keep
            out |= layer
        out += (out == 0) * self.speck
        if self.mapped is None or self.mapped[0] is not dst:     # 화면 픽셀 형식에 맞춘 잉크 색
            self.mapped = (dst, np.array([dst.map_rgb(tuple(int(v) for v in c)) for c in self.colors],
                                         dtype=np.uint32))
        pygame.surfarray.blit_array(dst, self.mapped[1].take(out).T)


class RisoLite:
    """numpy 없이(브라우저판) 쓰는 가벼운 리소 효과. pygame 의 C 연산만 쓴다.
    1) 둥근 망점 무늬를 더하고 빼서 중간색을 점으로 풀고
    2) 잉크 조합 색만 든 8비트 팔레트 화면에 옮겨 그려 색을 잉크로 고르고(가장 가까운 색)
    3) 종이 결을 곱하기로 얹는다. 판 어긋남은 없다."""
    TILE = 8                # 망점 무늬 한 칸(px). 45도로 기운 점이 TILE/√2 간격으로 찍힌다
    SPREAD = 44

    def __init__(self, size=(W, H)):
        w, h = size
        colors = []
        for bits in Riso.COMBOS:
            c = list(RISO_PAPER)
            for i, (_, ink, _, _) in enumerate(RISO_INKS):
                if bits >> i & 1:
                    c = [v * k / 255 for v, k in zip(c, ink)]
            colors.append(tuple(int(v) for v in c))
        self.pal = pygame.Surface(size, 0, 8)
        self.pal.set_palette(colors + [RISO_PAPER] * (256 - len(colors)))
        self.tmp = pygame.Surface(size)

        # 망점 무늬: 문턱값보다 밝으면 더하고(plus) 어두우면 뺀다(minus)
        t = self.TILE
        plus, minus = pygame.Surface((t, t)), pygame.Surface((t, t))
        for y in range(t):
            for x in range(t):
                d = (math.cos(math.pi * (x + y) * 2 / t) + math.cos(math.pi * (y - x) * 2 / t)) / 4
                v = int(d * self.SPREAD)
                plus.set_at((x, y), (max(0, v),) * 3)
                minus.set_at((x, y), (max(0, -v),) * 3)
        self.plus, self.minus = self.tiled(plus, size), self.tiled(minus, size)

        # 종이 결: 64px 무늬를 깔아 곱한다 (대부분 흰색, 드문드문 옅은 얼룩)
        rng = random.Random(20261103)
        grain = pygame.Surface((64, 64))
        grain.fill((255, 255, 255))
        for _ in range(64 * 64 // 18):
            g = rng.randint(222, 245)
            grain.set_at((rng.randrange(64), rng.randrange(64)), (g, g - 6, g - 14))
        self.grain = self.tiled(grain, size)

    @staticmethod
    def tiled(tile, size):
        out = pygame.Surface(size)
        tw, th = tile.get_size()
        for y in range(0, size[1], th):
            for x in range(0, size[0], tw):
                out.blit(tile, (x, y))
        return out

    def apply(self, src, dst):
        self.tmp.blit(src, (0, 0))
        self.tmp.blit(self.plus, (0, 0), special_flags=pygame.BLEND_RGB_ADD)
        self.tmp.blit(self.minus, (0, 0), special_flags=pygame.BLEND_RGB_SUB)
        self.pal.blit(self.tmp, (0, 0))          # 팔레트에서 가장 가까운 잉크 색으로
        dst.blit(self.pal, (0, 0))
        dst.blit(self.grain, (0, 0), special_flags=pygame.BLEND_RGB_MULT)


# ===================================================================
# 게임 본체
# ===================================================================
class Game:
    def __init__(self):
        pygame.mixer.pre_init(SR, -16, 1, 512)
        pygame.init()
        pygame.display.set_caption("스카이 웨딩")
        self.display = pygame.display.set_mode((W, H))
        self.screen = pygame.Surface((W, H))     # 여기에 그린 뒤 present()에서 인쇄 효과를 입혀 내보낸다
        self.riso = Riso() if np is not None else RisoLite()
        self.riso_on = True
        self.clock = pygame.time.Clock()
        self.tiny_font = load_font(12, bold=True)
        self.small_font = load_font(16, bold=True)
        self.letter_font = load_font(19)
        self.mid_font = load_font(22, bold=True)
        self.big_font = load_font(46, bold=True)

        self.screen.fill((255, 240, 246))
        self.text("소리를 만드는 중...", self.mid_font, (190, 60, 110), (W / 2, H / 2))
        self.present()
        try:
            self.audio = Audio()
        except pygame.error:
            self.audio = Audio.__new__(Audio)
            self.audio.ok, self.audio.sounds, self.audio.muted, self.audio.music, self.audio.lengths = False, {}, False, None, {}

        self.state = "title"
        self.sky = SkyPhase(self, demo=True)
        self.ceremony = None
        self.tick = 0
        self.last_catcher = None   # 지난번에 부케를 받은 하객
        self.board = Board()

    def present(self):
        if self.riso and self.riso_on:
            self.riso.apply(self.screen, self.display)
        else:
            self.display.blit(self.screen, (0, 0))
        pygame.display.flip()

    def text(self, msg, font, color, center, alpha=255, box=False):
        img = font.render(msg, True, color)
        rect = img.get_rect(center=center)
        if box:
            # 둥근 종이 딱지 + 핑크 잉크 테두리 (동화책 라벨 느낌)
            panel = pygame.Surface((rect.w + 34, rect.h + 14), pygame.SRCALPHA)
            pygame.draw.rect(panel, (255, 255, 255, 230), panel.get_rect(), border_radius=18)
            pygame.draw.rect(panel, INK["pink"], panel.get_rect(), 3, border_radius=18)
            self.screen.blit(panel, panel.get_rect(center=center))
            self.screen.blit(img, rect)
            return
        # 남색 잉크로 테두리와 그림자를 둘러 망점 배경 위에서도 읽히게
        shadow = font.render(msg, True, INK_TEXT)
        if alpha < 255:
            img.set_alpha(alpha)
            shadow.set_alpha(alpha)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (2, 2), (1, 2), (2, 1)):
            self.screen.blit(shadow, rect.move(dx, dy))
        self.screen.blit(img, rect)

    def start_sky(self):
        self.sky = SkyPhase(self)
        self.state = "sky"
        self.audio.play_music("bgm_sky")

    def start_ceremony(self):
        self.ceremony = Ceremony(self)
        self.state = "ceremony"

    def draw_title(self):
        s = self.screen
        self.sky.draw(s)
        shade = pygame.Surface((W, H), pygame.SRCALPHA)
        shade.fill((255, 255, 255, 70))
        s.blit(shade, (0, 0))
        self.text("스카이 웨딩", self.big_font, INK["pink"], (W / 2, 150))
        self.text("Sky Wedding", self.mid_font, WHITE, (W / 2, 200))
        lines = ["손을 꼭 잡은 신랑 신부의 스카이다이빙!",
                 "하트, 편지, 반지, 예복, 웨딩드레스, 일렉기타,",
                 "데이지 부케 7가지를 모아 결혼식장으로!",
                 "반짝이 별은 보너스, 새 떼는 피해 주세요.",
                 "방향키, 또는 화면을 손가락으로 끌어서 이동",
                 "M: 소리 켜기/끄기    R: 인쇄 효과"]
        # 설명은 둥근 종이 카드에 남색 잉크로 (망점 배경 위 작은 글씨는 읽기 어렵다)
        card = pygame.Rect(0, 0, 400, 186)
        card.center = (W / 2, 262 + 2.5 * 28)
        pygame.draw.rect(s, INK["yellow"], card.move(5, 5), border_radius=22)    # 어긋나게 찍힌 그림자
        pygame.draw.rect(s, (255, 255, 255), card, border_radius=22)
        pygame.draw.rect(s, INK["pink"], card, 3, border_radius=22)
        for i, line in enumerate(lines):
            if line:
                img = self.small_font.render(line, True, INK_TEXT)
                s.blit(img, img.get_rect(center=(W / 2, 262 + i * 28)))
        if (self.tick // 30) % 2 == 0:
            self.text("Enter 키나 화면을 눌러 시작", self.mid_font, YELLOW, (W / 2, 470))

    def press_start(self, pos=None):
        """Enter 키나 화면 터치(pos): 타이틀에선 시작.
        엔딩에선 '처음부터 다시'(또는 Enter)·'방명록으로' 버튼을 눌렀을 때만 움직인다."""
        if self.state == "title":
            self.start_sky()
            return
        buttons = self.ceremony.ending_buttons() if self.state == "ceremony" else None
        if not buttons:
            return
        if pos is not None and buttons["guestbook"].collidepoint(pos):
            self.go_guestbook()
        elif pos is None or buttons["restart"].collidepoint(pos):
            self.audio.stop_music(300)
            self.state = "title"
            self.sky = SkyPhase(self, demo=True)

    def go_guestbook(self):
        """축하 방명록으로: 웹판은 같은 사이트의 첫 화면으로 이동, 컴퓨터판은 브라우저로 연다"""
        if IS_WEB:
            window = __import__("platform").window
            window.location.href = str(window.location.origin) + "/"
        else:
            webbrowser.open(DEMOWEB_URL + "/")

    def button(self, s, rect, label, fill, color):
        """동글동글한 버튼: 옐로 판이 비껴 찍힌 그림자 + 남색 테두리"""
        r = rect.h // 2
        pygame.draw.rect(s, INK["yellow"], rect.move(4, 4), border_radius=r)
        pygame.draw.rect(s, fill, rect, border_radius=r)
        pygame.draw.rect(s, INK_TEXT, rect, 3, border_radius=r)
        img = render_text(self.mid_font, label, color)
        s.blit(img, img.get_rect(center=rect.center))

    async def run(self):
        # 웹(pygbag)에서도 돌도록 매 프레임 끝에 브라우저에 차례를 넘긴다 (await asyncio.sleep(0))
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    return
                if event.type == pygame.MOUSEBUTTONDOWN and getattr(event, "button", 1) == 1:
                    self.press_start(getattr(event, "pos", None))
                if event.type != pygame.KEYDOWN:
                    continue
                if event.key == pygame.K_ESCAPE and not IS_WEB:
                    return
                if event.key == pygame.K_m:
                    self.audio.toggle_mute()
                if event.key == pygame.K_r:
                    self.riso_on = not self.riso_on
                if event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    self.press_start()
                if event.key == pygame.K_b and self.state == "ceremony" and self.ceremony.ending_buttons():
                    self.go_guestbook()

            keys = pygame.key.get_pressed()
            if self.state == "title":
                self.sky.update(keys)
                self.draw_title()
            elif self.state == "sky":
                self.sky.update(keys)
                if self.state == "sky":
                    self.sky.draw(self.screen)
            if self.state == "ceremony":
                self.ceremony.update()
                self.ceremony.draw(self.screen)

            if self.audio.muted:
                img = self.tiny_font.render("소리 꺼짐 (M)", True, (120, 120, 120))
                self.screen.blit(img, (8, H - 18))
            self.present()
            self.clock.tick(FPS)
            self.tick += 1
            await asyncio.sleep(0)


async def main():
    await Game().run()
    pygame.quit()


if __name__ == "__main__":
    asyncio.run(main())
