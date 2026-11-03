"""
스카이 웨딩 (Sky Wedding)
손을 맞잡고 스카이다이빙하는 신랑과 신부가 하늘에서 결혼 준비물 7가지를 모은 뒤,
결혼식장으로 내려가 식을 올리는 평화로운 종스크롤 게임입니다.
pygame만 있으면 되고, 그림과 소리는 모두 코드로 만들어 냅니다.

조작
  방향키 / WASD : 이동
  M             : 소리 켜기/끄기
  Enter         : 시작 / 엔딩 후 처음으로
  ESC           : 종료

진행
  1. 하늘: 하트, 편지, 반지, 신랑 예복, 웨딩드레스, 일렉기타, 데이지 부케를 모읍니다.
     반짝이 별은 보너스, 새 떼에 부딪히면 잠깐 빙글빙글 돕니다.
  2. 7개를 다 모으면 하트 낙하산을 펴고 결혼식장으로 내려갑니다.
  3. 결혼식: 예복 갈아입기 → 편지 읽기 → 반지 교환 → 신부의 축가
     → 키스와 하트 축포 → HAPPILY EVER AFTER와 부케 던지기
"""
import math
import random
import sys
from array import array

import pygame

# ===== 기본 설정 =====
W, H = 480, 720
FPS = 60
SR = 22050                 # 효과음 샘플링 레이트
SCROLL = 1.4               # 하늘 장면 지면 스크롤 속도
FLOOR = 520                # 결혼식장 바닥(발) 높이
OFFICIANT_CHANCE = 0.12    # 주례 선생님이 부케를 받을 확률 (이스터에그)

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
SKIN = (255, 222, 196)
SUIT_YELLOW = (255, 210, 50)       # 개나리, 병아리 같은 노랑
SUIT_STRIPE = (245, 150, 40)
GROOM_SUIT = SUIT_YELLOW
BRIDE_SUIT = SUIT_YELLOW
GROOM_HELMET = (40, 60, 110)
BRIDE_HELMET = (255, 245, 250)
HAIR = (96, 62, 38)
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
    """위에서 내려다본, 손을 잡고 스카이다이빙하는 신랑(왼쪽)과 신부(오른쪽)"""
    S = pygame.Surface((200, 150), pygame.SRCALPHA)
    cx, cy = 100, 70
    fl = math.sin(tick * 0.25) * 3
    for side, suit, helmet in ((-1, GROOM_SUIT, GROOM_HELMET), (1, BRIDE_SUIT, BRIDE_HELMET)):
        px = cx + side * 32
        # 다리 (박스 자세로 벌려 구부림)
        for leg in (-1, 1):
            hip = (px + leg * 6, cy + 16)
            knee = (px + leg * 20, cy + 34 + fl * 0.5 * leg)
            foot = (px + leg * 15, cy + 52 + fl)
            pygame.draw.lines(S, suit, False, [hip, knee, foot], 9)
            pygame.draw.circle(S, (50, 45, 45), (int(foot[0]), int(foot[1])), 5)
        # 바깥 팔 (위로 구부림)
        sh = (px + side * 10, cy - 10)
        elbow = (px + side * 30, cy - 12 + fl * 0.5)
        hand = (px + side * 28, cy - 34)
        pygame.draw.lines(S, suit, False, [sh, elbow, hand], 8)
        pygame.draw.circle(S, SKIN, (int(hand[0]), int(hand[1])), 5)
        # 안쪽 팔 (가운데에서 손잡기)
        pygame.draw.line(S, suit, (px - side * 10, cy - 10), (cx + side * 4, cy - 4), 8)
        # 몸통
        pygame.draw.ellipse(S, suit, (px - 14, cy - 22, 28, 46))
        pygame.draw.line(S, SUIT_STRIPE, (px, cy - 18), (px, cy + 20), 3)
        # 머리 (헬멧)
        if side == 1:   # 신부의 펄럭이는 머리카락
            wig = math.sin(tick * 0.4) * 4
            pygame.draw.polygon(S, HAIR, [(px + 4, cy - 24), (px + 22 + wig, cy - 30), (px + 18 + wig, cy - 20)])
        pygame.draw.circle(S, helmet, (px, cy - 30), 12)
        pygame.draw.arc(S, darker(helmet, 0.7), (px - 12, cy - 42, 24, 24), 0.3, 2.8, 3)
    pygame.draw.circle(S, SKIN, (cx, cy - 4), 7)   # 맞잡은 손
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

        # 이동
        dx = (keys[pygame.K_RIGHT] or keys[pygame.K_d]) - (keys[pygame.K_LEFT] or keys[pygame.K_a])
        dy = (keys[pygame.K_DOWN] or keys[pygame.K_s]) - (keys[pygame.K_UP] or keys[pygame.K_w])
        if dx and dy:
            dx, dy = dx * 0.7071, dy * 0.7071
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
class Person:
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

    def arm(self, s, shoulder, hand, color):
        pygame.draw.line(s, color, shoulder, hand, 7)
        pygame.draw.circle(s, SKIN, (int(hand[0]), int(hand[1])), 4)

    def draw(self, s):
        f, x = self.facing, self.x
        F = self.y + self.bob
        woman = self.role == "bride"
        formal = self.outfit == "formal"
        d = 7 if woman else 0
        sh_y = F - 96 + d
        hip_y = F - 52
        hx, hy = x + f * self.lean * 7, F - 113 + d + self.lean * 3

        if not formal:
            top = legs = BRIDE_SUIT if woman else GROOM_SUIT
        elif self.role == "groom":
            top, legs = (30, 30, 36), (26, 26, 32)
        elif self.role == "officiant":
            top, legs = (96, 96, 112), (80, 80, 92)
        else:
            top, legs = (252, 252, 255), None
        arm_col = SKIN if (woman and formal) else top

        # 면사포 (몸 뒤쪽)
        if woman and formal:
            pygame.draw.polygon(s, (238, 238, 248), [(hx - f * 4, hy - 12), (hx - f * 18, hy - 4),
                                                     (x - f * 42, F - 26), (x - f * 12, F - 40)])
        # 뒤쪽 팔
        self.arm(s, (x - f * 3, sh_y + 6), self.hands[0] or (x - f * 5, F - 50), darker(arm_col))
        # 다리
        if not (woman and formal):
            sw = math.sin(self.walk) * 0.45 if self.walking else 0.0
            for a, col in ((-sw, darker(legs)), (sw, legs)):
                fx, fy = x + math.sin(a) * 50, hip_y + math.cos(a) * 50
                pygame.draw.line(s, col, (x, hip_y), (fx, fy), 9)
                pygame.draw.ellipse(s, (40, 34, 34), (fx - 6 + f * 3, fy - 4, 12, 7))
        # 몸통
        if woman and formal:
            pygame.draw.polygon(s, SKIN, [(x - 9, sh_y), (x + 9, sh_y), (x + 9, sh_y + 10), (x - 9, sh_y + 10)])
            pygame.draw.polygon(s, top, [(x - 10, sh_y + 9), (x + 10, sh_y + 9), (x + 8, F - 58), (x - 8, F - 58)])
            sway = math.sin(self.walk) * 4 if self.walking else 0
            skirt = [(x - 9, F - 60), (x + 9, F - 60), (x + f * 32 + sway, F), (x - f * 50 + sway, F + 2)]
            pygame.draw.polygon(s, (252, 252, 255), skirt)
            pygame.draw.polygon(s, (232, 210, 225), skirt, 2)
            for i in range(9):
                lx = lerp(x - f * 50, x + f * 32, i / 8) + sway
                pygame.draw.circle(s, (250, 215, 230), (int(lx), int(F - 1)), 3)
            pygame.draw.line(s, (255, 160, 195), (x - 9, F - 59), (x + 9, F - 59), 3)
        else:
            pygame.draw.polygon(s, top, [(x - 12, sh_y), (x + 12, sh_y), (x + 10, hip_y + 2), (x - 10, hip_y + 2)])
            if formal:
                pygame.draw.polygon(s, WHITE, [(x + f * 1, sh_y), (x + f * 11, sh_y), (x + f * 5, sh_y + 20)])
                pygame.draw.polygon(s, (20, 20, 20), [(x + f * 3, sh_y + 1), (x + f * 9, sh_y + 6),
                                                      (x + f * 9, sh_y + 1), (x + f * 3, sh_y + 6)])
                if self.role == "groom":
                    pygame.draw.circle(s, (255, 140, 180), (int(x - f * 4), int(sh_y + 14)), 4)
            else:
                pygame.draw.line(s, SUIT_STRIPE, (x + f * 4, sh_y + 2), (x + f * 3, hip_y), 2)
        # 머리
        if not formal:      # 스카이다이빙 헬멧
            helmet = BRIDE_HELMET if woman else GROOM_HELMET
            if woman:
                pygame.draw.polygon(s, HAIR, [(hx - f * 10, hy), (hx - f * 26, hy + 12), (hx - f * 12, hy + 8)])
            pygame.draw.circle(s, helmet, (int(hx - f * 1), int(hy - 3)), 15)
            pygame.draw.circle(s, SKIN, (int(hx + f * 4), int(hy + 3)), 11)
            pygame.draw.rect(s, (40, 70, 120), (hx + f * 3 - 7, hy - 13, 14, 6), border_radius=3)
        else:
            hair = (200, 200, 205) if self.role == "officiant" else HAIR
            pygame.draw.circle(s, hair, (int(hx - f * 2), int(hy - 3)), 14)
            pygame.draw.circle(s, SKIN, (int(hx + f * 2), int(hy + 1)), 12)
            if woman:
                pygame.draw.circle(s, hair, (int(hx - f * 12), int(hy - 7)), 7)
                for i in range(3):
                    pygame.draw.circle(s, (255, 230, 140), (int(hx - f * (4 - i * 4)), int(hy - 15 + abs(i - 1))), 2)
            if self.role == "officiant":
                pygame.draw.circle(s, (60, 60, 60), (int(hx + f * 7), int(hy - 2)), 4, 1)
        ex, ey = hx + f * 7, hy - 1
        if self.eyes_closed:
            pygame.draw.line(s, (40, 30, 30), (ex - 2, ey), (ex + 2, ey), 2)
        else:
            pygame.draw.circle(s, (40, 30, 30), (int(ex), int(ey)), 2)
        pygame.draw.arc(s, (190, 70, 80), (hx + f * 4 - 4, hy + 2, 8, 6), math.pi, math.tau, 2)
        if woman or self.blush:
            pygame.draw.circle(s, (255, 150, 160), (int(hx + f * 3), int(hy + 5)), 4 if self.blush else 3)
        if self.blush:   # 땀방울
            dx, dy = hx - f * 12, hy - 14
            pygame.draw.polygon(s, (120, 190, 240), [(dx, dy - 6), (dx - 3, dy), (dx + 3, dy)])
            pygame.draw.circle(s, (120, 190, 240), (int(dx), int(dy + 1)), 3)
        # 일렉기타
        if self.guitar:
            bx, by = x + f * 8, F - 60
            neck_end = (x + f * 50, F - 98)
            pygame.draw.line(s, (60, 30, 30), (bx - f * 8, by - 8), (x - f * 6, sh_y + 2), 3)
            pygame.draw.line(s, (130, 85, 45), (bx, by), neck_end, 5)
            pygame.draw.line(s, (40, 40, 40), neck_end, (neck_end[0] + f * 8, neck_end[1] - 7), 7)
            pygame.draw.circle(s, (225, 35, 55), (int(bx - f * 2), int(by + 5)), 14)
            pygame.draw.circle(s, (225, 35, 55), (int(bx + f * 6), int(by - 5)), 10)
            pygame.draw.circle(s, WHITE, (int(bx - f * 1), int(by + 3)), 6)
            pygame.draw.rect(s, (30, 30, 30), (bx - 4, by - 2, 8, 4))
        # 앞쪽 팔
        free_front = self.hands[1] is None
        front = self.hands[1] or ((x + f * 13, F - 62) if self.bouquet else (x + f * 8, F - 50))
        self.arm(s, (x + f * 3, sh_y + 6), front, arm_col)
        if self.ring:
            pygame.draw.circle(s, (255, 210, 70), (int(front[0]), int(front[1])), 3)
        # 부케: 지정 위치 > 비어 있는 앞손 > 비어 있는 뒷손
        if self.bouquet:
            if self.bouquet_at:
                bp = self.bouquet_at
            elif free_front:
                bp = front
            elif self.hands[0] is None:
                bp = (x - f * 5, F - 50)
            else:
                bp = None
            if bp:
                draw_bouquet(s, bp[0], bp[1] - 6, 0.75)
        # 머리 긁는 손은 머리 위에 보이도록 다시 그림
        if self.blush and self.hands[0]:
            self.arm(s, (x - f * 3, sh_y + 6), self.hands[0], arm_col)


class Guest:
    """객석 하객 (뒷모습)"""
    def __init__(self, x, y, k):
        self.x, self.y, self.k = x, y, k
        self.shirt = random.choice(((90, 120, 170), (170, 90, 110), (110, 150, 110), (200, 170, 110),
                                    (120, 100, 160), (70, 70, 80), (220, 220, 225)))
        self.hair = random.choice(((40, 30, 25), (90, 60, 35), (150, 110, 70), (200, 200, 205), (30, 30, 35)))
        self.phase = random.uniform(0, math.tau)
        self.speed = random.uniform(0.45, 0.6)
        self.holding = False    # 부케를 받았는지

    def draw(self, s, t, clapping, groove):
        k = self.k
        x = self.x + (math.sin(t * 0.12 + self.phase) * 3 * k if groove else 0)
        y = self.y - (abs(math.sin(t * 0.2)) * 6 * k if self.holding else 0)
        pygame.draw.ellipse(s, self.shirt, (x - 24 * k, y + 8 * k, 48 * k, 40 * k))
        if self.holding:   # 부케를 머리 위로 번쩍!
            for side in (-1, 1):
                pygame.draw.line(s, self.shirt, (x + side * 18 * k, y + 14 * k), (x + side * 8 * k, y - 26 * k), int(6 * k))
                pygame.draw.circle(s, SKIN, (int(x + side * 8 * k), int(y - 26 * k)), int(5 * k))
            pygame.draw.circle(s, self.hair, (int(x), int(y)), int(14 * k))
            draw_bouquet(s, x, y - 40 * k, 1.4 * k)
            return
        if clapping:
            gap = (3 + 7 * abs(math.sin(t * self.speed + self.phase))) * k
            hy = y - 14 * k
            for side in (-1, 1):
                pygame.draw.line(s, self.shirt, (x + side * 18 * k, y + 14 * k), (x + side * gap, hy), int(6 * k))
                pygame.draw.circle(s, SKIN, (int(x + side * gap), int(hy)), int(5 * k))
        pygame.draw.circle(s, self.hair, (int(x), int(y)), int(14 * k))


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
            pygame.draw.line(s, self.color, (x + 3, y - 1
                                             8), (x + 9, y - 12), 2)


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
        self.guests = [Guest(28 + i * 53, 598, 0.82) for i in range(9)] + \
                      [Guest(34 + i * 69, 676, 1.05) for i in range(7)]
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
        # 벽 아래 장식판
        bg.fill((232, 212, 196), (0, 360, W, 70))
        for x in range(0, W, 60):
            pygame.draw.rect(bg, (220, 198, 180), (x + 6, 368, 48, 54), 2)
        # 바닥과 카펫
        for y in range(430, H):
            k = (y - 430) / (H - 430)
            bg.fill((int(lerp(214, 180, k)), int(lerp(186, 150, k)), int(lerp(150, 116, k))), (0, y, W, 1))
        bg.fill((185, 40, 66), (0, 482, W, 72))
        bg.fill((230, 190, 90), (0, 482, W, 3))
        bg.fill((230, 190, 90), (0, 551, W, 3))
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

    # ----- 그리기 -----
    def draw(self, s):
        g = self.g
        s.blit(self.bg, (0, 0))
        self.officiant.draw(s)
        # 주례석 (주례자 앞)
        pygame.draw.rect(s, (150, 96, 60), (402, FLOOR - 78, 60, 78))
        pygame.draw.rect(s, (120, 74, 44), (396, FLOOR - 84, 72, 10))
        draw_heart(s, (240, 200, 90), 432, FLOOR - 42, 24)

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
        for guest in self.guests:
            guest.draw(s, self.t, clapping, self.groove)

        for h in self.hearts:
            h.draw(s)

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
        if self.ending_t > len(self.arch) * 8 + 60 and (self.ending_t // 40) % 2 == 0:
            g.text("Enter: 처음으로   ESC: 종료", g.small_font, WHITE, (W / 2, H - 22))


# ===================================================================
# 게임 본체
# ===================================================================
class Game:
    def __init__(self):
        pygame.mixer.pre_init(SR, -16, 1, 512)
        pygame.init()
        pygame.display.set_caption("스카이 웨딩")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()
        self.tiny_font = load_font(12, bold=True)
        self.small_font = load_font(16, bold=True)
        self.letter_font = load_font(19)
        self.mid_font = load_font(22, bold=True)
        self.big_font = load_font(46, bold=True)

        self.screen.fill((255, 240, 246))
        self.text("소리를 만드는 중...", self.mid_font, (190, 60, 110), (W / 2, H / 2))
        pygame.display.flip()
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

    def text(self, msg, font, color, center, alpha=255, box=False):
        img = font.render(msg, True, color)
        rect = img.get_rect(center=center)
        if box:
            panel = pygame.Surface((rect.w + 30, rect.h + 12), pygame.SRCALPHA)
            pygame.draw.rect(panel, (255, 255, 255, 215), panel.get_rect(), border_radius=16)
            self.screen.blit(panel, panel.get_rect(center=center))
            self.screen.blit(img, rect)
            return
        shadow = font.render(msg, True, (60, 30, 50))
        if alpha < 255:
            img.set_alpha(alpha)
            shadow.set_alpha(alpha)
        self.screen.blit(shadow, rect.move(2, 2))
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
        self.text("스카이 웨딩", self.big_font, (255, 120, 170), (W / 2, 150))
        self.text("Sky Wedding", self.mid_font, WHITE, (W / 2, 200))
        lines = ["손을 꼭 잡은 신랑 신부의 스카이다이빙!",
                 "하트, 편지, 반지, 예복, 웨딩드레스, 일렉기타,",
                 "데이지 부케 7가지를 모아 결혼식장으로!",
                 "반짝이 별은 보너스, 새 떼는 피해 주세요.",
                 "",
                 "방향키/WASD: 이동    M: 소리 켜기/끄기"]
        for i, line in enumerate(lines):
            if line:
                self.text(line, self.small_font, WHITE, (W / 2, 262 + i * 28))
        if (self.tick // 30) % 2 == 0:
            self.text("Enter 키를 눌러 시작", self.mid_font, YELLOW, (W / 2, 470))

    def run(self):
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    return
                if event.type != pygame.KEYDOWN:
                    continue
                if event.key == pygame.K_ESCAPE:
                    return
                if event.key == pygame.K_m:
                    self.audio.toggle_mute()
                if event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    if self.state == "title":
                        self.start_sky()
                    elif self.state == "ceremony" and self.ceremony.ending_t > 200:
                        self.audio.stop_music(300)
                        self.state = "title"
                        self.sky = SkyPhase(self, demo=True)

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
            pygame.display.flip()
            self.clock.tick(FPS)
            self.tick += 1


if __name__ == "__main__":
    Game().run()
    pygame.quit()
    sys.exit()
