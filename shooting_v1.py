"""
종스크롤 슈팅 게임 - 스카이 레인저 (Sky Ranger)
pygame으로 만든 세로 스크롤 슈팅 게임입니다. 이미지 파일 없이 도형으로만 그립니다.

조작
  방향키 / WASD : 이동
  Z 또는 Space  : 공중 사격 (누르고 있으면 연사)
  X             : 지상 폭탄 (조준점 위치에 떨어짐)
  P             : 일시정지
  R             : 게임 오버 후 다시 시작
  ESC           : 종료

규칙
  - 공중 적은 사격으로, 지상 적(포대, 전차, 보급고)은 폭탄으로만 파괴할 수 있습니다.
  - 조준점 아래에 지상 적이 있으면 조준점이 빨갛게 변합니다.
  - 일정 시간이 지나면 보스(공중 요새)가 등장하고, 격파하면 다음 스테이지로 넘어갑니다.
"""
import math
import random
import sys

import pygame

# ===== 기본 설정 =====
W, H = 480, 720
FPS = 60
SCROLL = 1.2               # 지면 스크롤 속도(픽셀/프레임)
STAGE_LENGTH = 45 * FPS    # 보스가 나오기까지의 시간
START_LIVES = 3

# ===== 색상 =====
GRASS = (62, 112, 58)
GRASS_LIGHT = (84, 138, 70)
FIELD = (132, 120, 72)
FOREST = (34, 78, 40)
SAND = (196, 178, 120)
WATER = (46, 102, 160)
WATER_LIGHT = (78, 136, 190)
ROAD = (110, 104, 96)
WHITE = (240, 240, 240)
YELLOW = (255, 220, 80)
RED = (230, 60, 60)
ORANGE = (255, 150, 40)
CYAN = (90, 220, 255)


def load_font(size, bold=False):
    """한글이 나오는 시스템 글꼴을 찾고, 없으면 기본 글꼴 사용"""
    for name in ("malgungothic", "applegothic", "nanumgothic", "notosanscjkkr"):
        path = pygame.font.match_font(name, bold=bold)
        if path:
            return pygame.font.Font(path, size)
    return pygame.font.Font(None, size)


def river_x(wy):
    """월드 좌표 wy에서의 강 중심 x 좌표 (끊김 없이 이어지도록 사인 곡선 사용)"""
    return W / 2 + math.sin(wy * 0.0035) * 140 + math.sin(wy * 0.013) * 35


def river_half_width(wy):
    return 34 + 10 * math.sin(wy * 0.02)


# ===================================================================
# 배경 지형
# ===================================================================
class Terrain:
    """일정 높이의 지형 조각(chunk)을 미리 그려 두고 이어 붙여 스크롤"""
    CHUNK = 256

    def __init__(self):
        self.offset = 0.0
        self.cache = {}

    def make_chunk(self, idx):
        c = self.CHUNK
        surf = pygame.Surface((W, c))
        rng = random.Random(idx * 7919 + 13)
        surf.fill(GRASS)

        # 밭과 밝은 풀밭 조각
        for _ in range(4):
            color = rng.choice((FIELD, GRASS_LIGHT))
            pw, ph = rng.randint(50, 120), rng.randint(40, 90)
            surf.fill(color, (rng.randint(0, W - pw), rng.randint(0, c - ph), pw, ph))

        # 숲
        for _ in range(rng.randint(2, 4)):
            fx, fy = rng.randint(0, W), rng.randint(0, c)
            for _ in range(18):
                pygame.draw.circle(surf, FOREST,
                                   (fx + rng.randint(-40, 40), fy + rng.randint(-30, 30)),
                                   rng.randint(6, 12))

        # 도로 (가끔)
        road_row = rng.randint(30, c - 30) if rng.random() < 0.45 else None
        if road_row is not None:
            surf.fill(ROAD, (0, road_row - 6, W, 12))
            for x in range(0, W, 28):
                surf.fill(YELLOW, (x, road_row - 1, 14, 2))

        # 강 (월드 좌표 기준이라 조각 경계에서도 이어짐)
        for r in range(0, c, 2):
            wy = (idx + 1) * c - r
            rx = river_x(wy)
            hw = river_half_width(wy)
            pygame.draw.rect(surf, SAND, (rx - hw - 7, r, 2 * hw + 14, 2))
            pygame.draw.rect(surf, WATER, (rx - hw, r, 2 * hw, 2))
            if (r + idx * 7) % 22 == 0:
                pygame.draw.rect(surf, WATER_LIGHT, (rx - hw * 0.4, r, hw * 0.5, 2))

        # 다리
        if road_row is not None:
            wy = (idx + 1) * c - road_row
            rx, hw = river_x(wy), river_half_width(wy)
            surf.fill((150, 130, 100), (rx - hw - 10, road_row - 8, 2 * hw + 20, 16))
        return surf

    def update(self):
        self.offset += SCROLL

    def draw(self, screen):
        c = self.CHUNK
        first = int(self.offset // c)
        last = int((self.offset + H) // c) + 1
        for idx in range(first, last + 1):
            if idx not in self.cache:
                self.cache[idx] = self.make_chunk(idx)
            top = H + self.offset - (idx + 1) * c
            screen.blit(self.cache[idx], (0, round(top)))
        for idx in [k for k in self.cache if k < first - 1]:
            del self.cache[idx]

    def screen_to_world(self, sy):
        return H + self.offset - sy

    def on_water(self, x, sy, margin=0):
        wy = self.screen_to_world(sy)
        return abs(x - river_x(wy)) < river_half_width(wy) + 8 + margin


# ===================================================================
# 효과
# ===================================================================
class Particle:
    def __init__(self, x, y, color, speed=3.0, life=30, size=3):
        a = random.uniform(0, math.tau)
        s = random.uniform(0.3, 1.0) * speed
        self.x, self.y = x, y
        self.vx, self.vy = math.cos(a) * s, math.sin(a) * s
        self.life = self.max_life = random.randint(life // 2, life)
        self.color, self.size = color, size

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vx *= 0.94
        self.vy *= 0.94
        self.life -= 1

    def draw(self, screen):
        k = self.life / self.max_life
        r = max(1, int(self.size * k + 0.5))
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), r)


class Ring:
    """폭탄 폭발 같은 퍼지는 원"""
    def __init__(self, x, y, radius, color, life=18):
        self.x, self.y, self.radius, self.color = x, y, radius, color
        self.life = self.max_life = life

    def update(self):
        self.life -= 1
        self.y += SCROLL

    def draw(self, screen):
        k = 1 - self.life / self.max_life
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)),
                           int(self.radius * (0.4 + 0.6 * k)), 3)


# ===================================================================
# 플레이어
# ===================================================================
class Player:
    SPEED = 4.6
    RADIUS = 7
    BOMB_RANGE = 170   # 조준점까지 거리

    def __init__(self):
        self.reset()

    def reset(self):
        self.x, self.y = W / 2, H - 110
        self.cool = 0
        self.invincible = 150
        self.alive = True

    @property
    def target(self):
        return self.x, self.y - self.BOMB_RANGE

    def update(self, keys):
        dx = (keys[pygame.K_RIGHT] or keys[pygame.K_d]) - (keys[pygame.K_LEFT] or keys[pygame.K_a])
        dy = (keys[pygame.K_DOWN] or keys[pygame.K_s]) - (keys[pygame.K_UP] or keys[pygame.K_w])
        if dx and dy:
            dx, dy = dx * 0.7071, dy * 0.7071
        self.x = min(max(self.x + dx * self.SPEED, 16), W - 16)
        self.y = min(max(self.y + dy * self.SPEED, 60), H - 24)
        if self.cool > 0:
            self.cool -= 1
        if self.invincible > 0:
            self.invincible -= 1

    def draw(self, screen, tick):
        if self.invincible and (tick // 4) % 2:
            return
        x, y = self.x, self.y
        # 엔진 불꽃
        flame = 8 + (tick % 6)
        pygame.draw.polygon(screen, ORANGE, [(x - 4, y + 10), (x + 4, y + 10), (x, y + 10 + flame)])
        body = [(x, y - 18), (x + 5, y - 6), (x + 16, y + 8), (x + 5, y + 6), (x, y + 12),
                (x - 5, y + 6), (x - 16, y + 8), (x - 5, y - 6)]
        pygame.draw.polygon(screen, (205, 212, 225), body)
        pygame.draw.polygon(screen, (90, 100, 120), body, 2)
        pygame.draw.circle(screen, CYAN, (int(x), int(y - 4)), 4)

    def draw_reticle(self, screen, locked, tick):
        tx, ty = self.target
        color = RED if locked else (230, 230, 230)
        r = 12 + (2 if locked and (tick // 6) % 2 else 0)
        pygame.draw.circle(screen, color, (int(tx), int(ty)), r, 2)
        for ax, ay in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            pygame.draw.line(screen, color, (tx + ax * (r - 4), ty + ay * (r - 4)),
                             (tx + ax * (r + 5), ty + ay * (r + 5)), 2)


class Shot:
    RADIUS = 3

    def __init__(self, x, y):
        self.x, self.y = x, y
        self.dead = False

    def update(self):
        self.y -= 11
        if self.y < -10:
            self.dead = True

    def draw(self, screen):
        pygame.draw.rect(screen, YELLOW, (self.x - 2, self.y - 7, 4, 12))


class Bomb:
    """플레이어 위치에서 조준점으로 날아가 지면에서 폭발"""
    DURATION = 32
    BLAST = 30

    def __init__(self, x, y, tx, ty):
        self.sx, self.sy, self.tx, self.ty = x, y, tx, ty
        self.t = 0
        self.dead = False

    @property
    def pos(self):
        k = self.t / self.DURATION
        return (self.sx + (self.tx - self.sx) * k, self.sy + (self.ty - self.sy) * k)

    def update(self):
        self.t += 1
        self.ty += SCROLL   # 목표 지점도 지면과 함께 흘러감
        self.sy += SCROLL * 0.5

    def draw(self, screen):
        x, y = self.pos
        r = max(2, int(6 * (1 - self.t / self.DURATION)) + 2)
        pygame.draw.circle(screen, (50, 50, 50), (int(x), int(y)), r + 1)
        pygame.draw.circle(screen, (250, 200, 90), (int(x), int(y)), r)


class EnemyBullet:
    RADIUS = 4

    def __init__(self, x, y, vx, vy):
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.dead = False

    def update(self):
        self.x += self.vx
        self.y += self.vy
        if not (-20 < self.x < W + 20 and -20 < self.y < H + 20):
            self.dead = True

    def draw(self, screen, tick):
        c = (255, 120, 200) if (tick // 4) % 2 else (255, 230, 240)
        pygame.draw.circle(screen, c, (int(self.x), int(self.y)), self.RADIUS)


def aimed(x, y, tx, ty, speed, spread=0.0):
    a = math.atan2(ty - y, tx - x) + spread
    return EnemyBullet(x, y, math.cos(a) * speed, math.sin(a) * speed)


# ===================================================================
# 적
# ===================================================================
class Enemy:
    ground = False
    radius = 12
    hp = 1
    score = 100

    def __init__(self, x, y):
        self.x, self.y = x, y
        self.t = 0
        self.dead = False
        self.flash = 0

    def hit(self, dmg=1):
        self.hp -= dmg
        self.flash = 4
        return self.hp <= 0

    def offscreen(self):
        return self.y > H + 50 or self.y < -150 or self.x < -80 or self.x > W + 80

    def base_update(self):
        self.t += 1
        if self.flash:
            self.flash -= 1
        if self.offscreen() and self.t > 30:
            self.dead = True


# ----- 공중 적 -----
class Dart(Enemy):
    """빠르게 내려오며 플레이어 쪽으로 살짝 꺾는 소형기"""
    radius, hp, score = 11, 1, 100

    def update(self, game):
        self.y += 3.6 + game.stage * 0.3
        self.x += max(-1.2, min(1.2, (game.player.x - self.x) * 0.02))
        self.base_update()

    def draw(self, screen):
        x, y = self.x, self.y
        col = WHITE if self.flash else (220, 70, 70)
        pygame.draw.polygon(screen, col, [(x, y + 13), (x + 12, y - 9), (x, y - 3), (x - 12, y - 9)])
        pygame.draw.circle(screen, (255, 200, 120), (int(x), int(y)), 3)


class Weaver(Enemy):
    """좌우로 흔들리며 내려오고 가끔 총알을 쏘는 적"""
    radius, hp, score = 12, 2, 150

    def __init__(self, x, y):
        super().__init__(x, y)
        self.bx = x
        self.phase = random.uniform(0, math.tau)

    def update(self, game):
        self.y += 2.0
        self.x = self.bx + math.sin(self.t * 0.05 + self.phase) * 70
        if self.t % 90 == 45 and 0 < self.y < H * 0.6:
            game.enemy_bullets.append(aimed(self.x, self.y, game.player.x, game.player.y,
                                            3 + game.stage * 0.3))
        self.base_update()

    def draw(self, screen):
        x, y = self.x, self.y
        col = WHITE if self.flash else (170, 90, 220)
        pygame.draw.polygon(screen, col, [(x, y - 13), (x + 13, y), (x, y + 13), (x - 13, y)])
        pygame.draw.circle(screen, (60, 20, 90), (int(x), int(y)), 5)


class Gunship(Enemy):
    """화면 위쪽에 멈춰 조준 사격 후 떠나는 중형기"""
    radius, hp, score = 18, 6, 400

    def __init__(self, x, y):
        super().__init__(x, y)
        self.stop_y = random.randint(90, 220)
        self.dir = random.choice((-1, 1))

    def update(self, game):
        if self.t < 360:
            self.y += (self.stop_y - self.y) * 0.04
            self.x += self.dir * 0.6
            if self.x < 40 or self.x > W - 40:
                self.dir *= -1
            if self.t > 40 and self.t % max(40, 75 - game.stage * 6) == 0:
                for s in (-0.18, 0, 0.18):
                    game.enemy_bullets.append(aimed(self.x, self.y + 10, game.player.x,
                                                    game.player.y, 3.2 + game.stage * 0.3, s))
        else:
            self.y += 3
        self.base_update()

    def draw(self, screen):
        x, y = self.x, self.y
        col = WHITE if self.flash else (110, 130, 160)
        pygame.draw.polygon(screen, col, [(x - 24, y - 6), (x - 10, y - 14), (x + 10, y - 14),
                                          (x + 24, y - 6), (x + 12, y + 14), (x - 12, y + 14)])
        pygame.draw.rect(screen, (60, 70, 90), (x - 3, y + 4, 6, 14))
        pygame.draw.circle(screen, (255, 90, 90), (int(x), int(y - 3)), 5)


# ----- 지상 적 -----
class Turret(Enemy):
    """고정 포대: 플레이어를 향해 포신을 돌리고 사격"""
    ground, radius, hp, score = True, 13, 1, 300

    def update(self, game):
        self.y += SCROLL
        if self.t % max(55, 110 - game.stage * 10) == 30 and 20 < self.y < H * 0.75:
            game.enemy_bullets.append(aimed(self.x, self.y, game.player.x, game.player.y,
                                            2.8 + game.stage * 0.3))
        self.aim = math.atan2(game.player.y - self.y, game.player.x - self.x)
        self.base_update()

    def draw(self, screen):
        x, y = int(self.x), int(self.y)
        pygame.draw.circle(screen, (70, 70, 70), (x, y), 14)
        pygame.draw.circle(screen, WHITE if self.flash else (150, 150, 140), (x, y), 10)
        a = getattr(self, "aim", math.pi / 2)
        pygame.draw.line(screen, (40, 40, 40), (x, y), (x + math.cos(a) * 16, y + math.sin(a) * 16), 4)


class Tank(Enemy):
    """지면 위를 좌우로 움직이는 전차"""
    ground, radius, hp, score = True, 13, 1, 350

    def __init__(self, x, y):
        super().__init__(x, y)
        self.vx = random.choice((-0.9, 0.9))

    def update(self, game):
        self.y += SCROLL
        nx = self.x + self.vx
        if nx < 20 or nx > W - 20 or game.terrain.on_water(nx + self.vx * 12, self.y):
            self.vx *= -1
        else:
            self.x = nx
        if self.t % 150 == 80 and 20 < self.y < H * 0.7:
            game.enemy_bullets.append(aimed(self.x, self.y, game.player.x, game.player.y, 2.6))
        self.base_update()

    def draw(self, screen):
        x, y = self.x, self.y
        body = WHITE if self.flash else (120, 110, 60)
        pygame.draw.rect(screen, (40, 40, 30), (x - 14, y - 11, 28, 22), border_radius=3)
        pygame.draw.rect(screen, body, (x - 11, y - 9, 22, 18), border_radius=3)
        pygame.draw.circle(screen, (80, 75, 40), (int(x), int(y)), 6)
        pygame.draw.line(screen, (40, 40, 30), (x, y), (x + (14 if self.vx > 0 else -14), y), 4)


class Depot(Enemy):
    """보급고: 공격하지 않지만 점수가 높음"""
    ground, radius, hp, score = True, 16, 1, 800

    def update(self, game):
        self.y += SCROLL
        self.base_update()

    def draw(self, screen):
        x, y = self.x, self.y
        pygame.draw.rect(screen, WHITE if self.flash else (150, 90, 60), (x - 16, y - 14, 32, 28))
        pygame.draw.rect(screen, (90, 50, 30), (x - 16, y - 14, 32, 28), 2)
        pygame.draw.line(screen, (90, 50, 30), (x - 16, y - 14), (x + 16, y + 14), 2)
        pygame.draw.line(screen, (90, 50, 30), (x + 16, y - 14), (x - 16, y + 14), 2)


# ----- 보스 -----
class Fortress(Enemy):
    """스테이지 끝에 등장하는 공중 요새"""
    radius = 46
    score = 5000

    def __init__(self, stage):
        super().__init__(W / 2, -90)
        self.hp = self.max_hp = 70 + stage * 25
        self.stage = stage
        self.angle = 0.0

    def hit_test(self, x, y, r):
        return abs(x - self.x) < 62 + r and abs(y - self.y) < 34 + r

    def update(self, game):
        self.t += 1
        if self.flash:
            self.flash -= 1
        if self.t < 120:
            self.y += (140 - self.y) * 0.03
            return
        self.x = W / 2 + math.sin((self.t - 120) * 0.012) * 150
        speed = 3 + self.stage * 0.25
        px, py = game.player.x, game.player.y
        # 양쪽 포에서 번갈아 조준 사격
        if self.t % 34 == 0:
            side = -40 if (self.t // 34) % 2 else 40
            game.enemy_bullets.append(aimed(self.x + side, self.y + 20, px, py, speed))
        # 부채꼴 탄막
        if self.t % 110 == 0:
            for i in range(-4, 5):
                game.enemy_bullets.append(aimed(self.x, self.y + 30, self.x, self.y + 200,
                                                speed * 0.8, i * 0.17))
        # 체력이 절반 이하면 회전 탄막 추가
        if self.hp < self.max_hp / 2 and self.t % 8 == 0:
            self.angle += 0.45
            for k in (0, math.pi):
                a = self.angle + k
                game.enemy_bullets.append(EnemyBullet(self.x, self.y, math.cos(a) * 2.4,
                                                      math.sin(a) * 2.4))

    def draw(self, screen):
        x, y = self.x, self.y
        hull = WHITE if self.flash else (95, 105, 125)
        pts = [(x - 70, y), (x - 40, y - 34), (x + 40, y - 34), (x + 70, y),
               (x + 40, y + 34), (x - 40, y + 34)]
        pygame.draw.polygon(screen, hull, pts)
        pygame.draw.polygon(screen, (45, 50, 65), pts, 3)
        pygame.draw.circle(screen, (60, 65, 80), (int(x), int(y)), 22)
        core = (255, 80, 80) if (self.t // 10) % 2 else (255, 170, 90)
        pygame.draw.circle(screen, core, (int(x), int(y)), 12)
        for side in (-40, 40):
            pygame.draw.circle(screen, (40, 40, 50), (int(x + side), int(y + 18)), 8)


# ===================================================================
# 게임 본체
# ===================================================================
class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("스카이 레인저 - 종스크롤 슈팅")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()
        self.font = load_font(18, bold=True)
        self.big_font = load_font(44, bold=True)
        self.mid_font = load_font(24, bold=True)
        self.high_score = 0
        self.state = "title"
        self.tick = 0
        self.new_game()

    # ----- 상태 -----
    def new_game(self):
        self.terrain = Terrain()
        self.player = Player()
        self.shots, self.bombs, self.enemy_bullets = [], [], []
        self.air, self.ground_units, self.effects = [], [], []
        self.boss = None
        self.score = 0
        self.lives = START_LIVES
        self.stage = 1
        self.stage_timer = 0
        self.air_timer = 60
        self.ground_timer = 90
        self.banner = 150         # "STAGE 1" 표시 시간
        self.respawn_timer = 0
        self.paused = False

    # ----- 생성 -----
    def spawn_air(self):
        roll = random.random()
        if roll < 0.45:
            x = random.randint(60, W - 60)
            for i in range(3):
                self.air.append(Dart(x + (i - 1) * 30, -20 - abs(i - 1) * 25))
        elif roll < 0.8:
            x = random.randint(90, W - 90)
            for i in range(2):
                self.air.append(Weaver(x, -20 - i * 45))
        else:
            self.air.append(Gunship(random.randint(60, W - 60), -30))
        self.air_timer = max(30, 85 - self.stage * 8) + random.randint(0, 40)

    def spawn_ground(self):
        kind = random.choices((Turret, Tank, Depot), weights=(5, 4, 1))[0]
        for _ in range(20):
            x = random.randint(30, W - 30)
            if not self.terrain.on_water(x, -30, margin=20):
                self.ground_units.append(kind(x, -30))
                break
        self.ground_timer = max(45, 120 - self.stage * 10) + random.randint(0, 60)

    def explode(self, x, y, big=False):
        n, speed = (60, 6) if big else (18, 3.5)
        for _ in range(n):
            color = random.choice((ORANGE, YELLOW, RED, WHITE))
            self.effects.append(Particle(x, y, color, speed, 50 if big else 30, 5 if big else 3))

    # ----- 진행 -----
    def update(self):
        keys = pygame.key.get_pressed()
        self.terrain.update()
        self.stage_timer += 1
        if self.banner:
            self.banner -= 1

        # 플레이어
        p = self.player
        if p.alive:
            p.update(keys)
            if (keys[pygame.K_z] or keys[pygame.K_SPACE]) and p.cool == 0:
                self.shots += [Shot(p.x - 6, p.y - 10), Shot(p.x + 6, p.y - 10)]
                p.cool = 7
        elif self.respawn_timer:
            self.respawn_timer -= 1
            if self.respawn_timer == 0:
                if self.lives > 0:
                    p.reset()
                else:
                    self.state = "over"
                    self.high_score = max(self.high_score, self.score)

        # 적 생성
        if self.boss is None:
            if self.stage_timer >= STAGE_LENGTH:
                self.boss = Fortress(self.stage)
                self.banner = 120
            else:
                self.air_timer -= 1
                if self.air_timer <= 0:
                    self.spawn_air()
        self.ground_timer -= 1
        if self.ground_timer <= 0:
            self.spawn_ground()

        # 이동
        for obj in self.shots + self.bombs + self.enemy_bullets + self.effects:
            obj.update()
        for e in self.air + self.ground_units:
            e.update(self)
        if self.boss:
            self.boss.update(self)

        self.handle_collisions()

        # 정리
        self.shots = [s for s in self.shots if not s.dead]
        self.bombs = [b for b in self.bombs if not b.dead]
        self.enemy_bullets = [b for b in self.enemy_bullets if not b.dead]
        self.air = [e for e in self.air if not e.dead]
        self.ground_units = [e for e in self.ground_units if not e.dead]
        self.effects = [f for f in self.effects if f.life > 0]

    def handle_collisions(self):
        # 사격 → 공중 적 / 보스
        for s in self.shots:
            for e in self.air:
                if not e.dead and math.hypot(s.x - e.x, s.y - e.y) < e.radius + s.RADIUS:
                    s.dead = True
                    if e.hit():
                        e.dead = True
                        self.score += e.score
                        self.explode(e.x, e.y)
                    break
            if not s.dead and self.boss and self.boss.hit_test(s.x, s.y, s.RADIUS):
                s.dead = True
                if self.boss.hit():
                    self.defeat_boss()

        # 폭탄 → 지상 적
        for b in self.bombs:
            if b.t >= b.DURATION:
                b.dead = True
                self.effects.append(Ring(b.tx, b.ty, b.BLAST, ORANGE))
                for _ in range(8):
                    self.effects.append(Particle(b.tx, b.ty, (120, 110, 90), 2, 25, 4))
                for e in self.ground_units:
                    if math.hypot(b.tx - e.x, b.ty - e.y) < b.BLAST + e.radius * 0.5:
                        e.dead = True
                        self.score += e.score
                        self.explode(e.x, e.y)

        # 적/적탄 → 플레이어
        p = self.player
        if not p.alive or p.invincible:
            return
        for b in self.enemy_bullets:
            if math.hypot(b.x - p.x, b.y - p.y) < b.RADIUS + p.RADIUS:
                b.dead = True
                self.kill_player()
                return
        for e in self.air:
            if math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.RADIUS:
                e.dead = True
                self.explode(e.x, e.y)
                self.kill_player()
                return
        if self.boss and self.boss.hit_test(p.x, p.y, p.RADIUS):
            self.kill_player()

    def kill_player(self):
        p = self.player
        p.alive = False
        self.lives -= 1
        self.explode(p.x, p.y, big=True)
        self.enemy_bullets.clear()
        self.respawn_timer = 90

    def defeat_boss(self):
        b = self.boss
        self.score += b.score
        for _ in range(5):
            self.explode(b.x + random.randint(-60, 60), b.y + random.randint(-30, 30), big=True)
        self.enemy_bullets.clear()
        self.boss = None
        self.stage += 1
        self.stage_timer = 0
        self.banner = 150
        if self.lives < 5:
            self.lives += 1   # 스테이지 클리어 보너스

    def drop_bomb(self):
        p = self.player
        if p.alive and len(self.bombs) == 0:
            tx, ty = p.target
            self.bombs.append(Bomb(p.x, p.y, tx, ty))

    def reticle_locked(self):
        tx, ty = self.player.target
        return any(math.hypot(tx - e.x, ty - e.y) < Bomb.BLAST + e.radius * 0.5
                   for e in self.ground_units)

    # ----- 그리기 -----
    def text(self, msg, font, color, center):
        img = font.render(msg, True, color)
        shadow = font.render(msg, True, (0, 0, 0))
        rect = img.get_rect(center=center)
        self.screen.blit(shadow, rect.move(2, 2))
        self.screen.blit(img, rect)

    def draw_hud(self):
        s = self.screen
        s.blit(self.font.render(f"SCORE {self.score:07d}", True, WHITE), (10, 8))
        s.blit(self.font.render(f"HI {max(self.high_score, self.score):07d}", True, YELLOW),
               (W - 150, 8))
        s.blit(self.font.render(f"STAGE {self.stage}", True, WHITE), (10, H - 30))
        for i in range(max(0, self.lives)):
            x, y = W - 20 - i * 22, H - 18
            pygame.draw.polygon(s, (205, 212, 225), [(x, y - 9), (x + 8, y + 6), (x - 8, y + 6)])
        if self.boss:
            ratio = max(0, self.boss.hp) / self.boss.max_hp
            pygame.draw.rect(s, (60, 20, 20), (60, 38, W - 120, 8))
            pygame.draw.rect(s, RED, (60, 38, (W - 120) * ratio, 8))
        if self.banner and (self.banner // 15) % 2 == 0:
            msg = "WARNING!  공중 요새 접근" if self.boss else f"STAGE {self.stage}"
            self.text(msg, self.mid_font, RED if self.boss else WHITE, (W / 2, H / 2 - 60))

    def draw(self):
        s = self.screen
        self.terrain.draw(s)
        for e in self.ground_units:
            e.draw(s)
        for f in self.effects:
            f.draw(s)
        for b in self.bombs:
            b.draw(s)
        if self.state == "play" and self.player.alive:
            self.player.draw_reticle(s, self.reticle_locked(), self.tick)
        for e in self.air:
            e.draw(s)
        if self.boss:
            self.boss.draw(s)
        for sh in self.shots:
            sh.draw(s)
        if self.player.alive and self.state == "play":
            self.player.draw(s, self.tick)
        for b in self.enemy_bullets:
            b.draw(s, self.tick)

        if self.state == "title":
            self.draw_overlay()
            self.text("SKY RANGER", self.big_font, CYAN, (W / 2, H / 2 - 120))
            lines = ["방향키/WASD : 이동", "Z / Space : 공중 사격", "X : 지상 폭탄",
                     "P : 일시정지   ESC : 종료"]
            for i, line in enumerate(lines):
                self.text(line, self.font, WHITE, (W / 2, H / 2 - 30 + i * 30))
            if (self.tick // 30) % 2 == 0:
                self.text("Enter 키를 눌러 시작", self.mid_font, YELLOW, (W / 2, H / 2 + 130))
            return

        self.draw_hud()
        if self.state == "over":
            self.draw_overlay()
            self.text("GAME OVER", self.big_font, RED, (W / 2, H / 2 - 40))
            self.text(f"점수 {self.score}", self.mid_font, WHITE, (W / 2, H / 2 + 20))
            self.text("R 키를 눌러 다시 시작", self.font, YELLOW, (W / 2, H / 2 + 65))
        elif self.paused:
            self.draw_overlay()
            self.text("일시정지", self.big_font, WHITE, (W / 2, H / 2))

    def draw_overlay(self):
        shade = pygame.Surface((W, H), pygame.SRCALPHA)
        shade.fill((0, 0, 0, 130))
        self.screen.blit(shade, (0, 0))

    # ----- 루프 -----
    def run(self):
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    return
                if event.type != pygame.KEYDOWN:
                    continue
                if event.key == pygame.K_ESCAPE:
                    return
                if self.state == "title" and event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    self.new_game()
                    self.state = "play"
                elif self.state == "over" and event.key == pygame.K_r:
                    self.new_game()
                    self.state = "play"
                elif self.state == "play":
                    if event.key == pygame.K_p:
                        self.paused = not self.paused
                    elif event.key == pygame.K_x and not self.paused:
                        self.drop_bomb()

            if self.state == "title":
                self.terrain.update()   # 타이틀 화면에서도 배경 스크롤
            elif self.state == "play" and not self.paused:
                self.update()
            elif self.state == "over":
                self.terrain.update()
                for f in self.effects:
                    f.update()
                self.effects = [f for f in self.effects if f.life > 0]

            self.draw()
            pygame.display.flip()
            self.clock.tick(FPS)
            self.tick += 1


if __name__ == "__main__":
    Game().run()
    pygame.quit()
    sys.exit()
