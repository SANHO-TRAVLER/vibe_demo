"""
뱀 게임 (Snake Game)
- 표준 라이브러리 tkinter만 사용하므로 별도 설치가 필요 없습니다.
- 조작: 방향키 또는 WASD로 이동, Space로 일시정지, R로 재시작

게임 규칙
1. 분홍색 하트를 1개 먹으면
2. '진, 성, 아, 사, 랑, 해' 글자 먹이 6개가 화면 곳곳에 한꺼번에 나타납니다.
3. 글자는 반드시 순서대로 먹어야 하며, 순서가 틀리면 게임이 끝납니다.
4. 6글자를 순서대로 모두 먹으면 화면 가득 커다란 빨간 하트가 나타납니다.
"""
import math
import random
import tkinter as tk

# ===== 게임 설정 =====
CELL = 24          # 한 칸 크기(픽셀)
COLS = 28          # 가로 칸 수
ROWS = 22          # 세로 칸 수
START_SPEED = 130  # 시작 속도(ms, 작을수록 빠름)
MIN_SPEED = 60     # 최고 속도 제한

HEARTS_NEEDED = 1                      # 글자 먹이가 나오기 전 먹어야 할 하트 수
WORD = ["진", "성", "아", "사", "랑", "해"]  # 순서대로 먹어야 하는 글자

BG_COLOR = "#1e1e2e"
SNAKE_HEAD = "#a6e3a1"
SNAKE_BODY = "#40a02b"
HEART_PINK = "#ff8fb8"
LETTER_BG = "#f5c2e7"
LETTER_FG = "#5b1035"
BIG_HEART_RED = "#e3122c"
TEXT_COLOR = "#cdd6f4"
FONT = "맑은 고딕"

DIRECTIONS = {
    "Up": (0, -1), "w": (0, -1),
    "Down": (0, 1), "s": (0, 1),
    "Left": (-1, 0), "a": (-1, 0),
    "Right": (1, 0), "d": (1, 0),
}


def heart_points(cx, cy, size, steps=60):
    """(cx, cy)를 중심으로 폭이 약 size인 하트 다각형 좌표 목록"""
    scale = size / 34
    points = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = (13 * math.cos(t) - 5 * math.cos(2 * t)
             - 2 * math.cos(3 * t) - math.cos(4 * t))
        points.extend((cx + x * scale, cy - (y + 2.5) * scale))
    return points


class SnakeGame:
    def __init__(self, root):
        self.root = root
        self.root.title("뱀 게임")
        self.root.resizable(False, False)

        self.score_label = tk.Label(root, font=(FONT, 13, "bold"),
                                    bg=BG_COLOR, fg=TEXT_COLOR)
        self.score_label.pack(fill="x")

        self.canvas = tk.Canvas(root, width=COLS * CELL, height=ROWS * CELL,
                                bg=BG_COLOR, highlightthickness=0)
        self.canvas.pack()

        self.high_score = 0
        self.after_id = None
        root.bind("<Key>", self.on_key)
        self.reset()

    # ===== 상태 관리 =====
    def reset(self):
        """게임 상태 초기화"""
        if self.after_id:
            self.root.after_cancel(self.after_id)
            self.after_id = None
        cx, cy = COLS // 2, ROWS // 2
        self.snake = [(cx, cy), (cx - 1, cy), (cx - 2, cy)]
        self.direction = (1, 0)
        self.next_direction = (1, 0)
        self.score = 0
        self.speed = START_SPEED
        self.paused = False
        self.game_over = False
        self.win = False
        self.fail_reason = ""
        self.hearts_eaten = 0
        self.next_index = 0      # 다음에 먹어야 할 글자의 위치
        self.foods = {}          # {(x, y): None(하트) 또는 글자}
        self.spawn_heart()
        self.update_status()
        self.tick()

    def free_cells(self):
        occupied = set(self.snake) | set(self.foods)
        return [(x, y) for x in range(COLS) for y in range(ROWS)
                if (x, y) not in occupied]

    def spawn_heart(self):
        cells = self.free_cells()
        if cells:
            self.foods[random.choice(cells)] = None

    def spawn_letters(self):
        """화면을 3x2 구역으로 나누고 구역마다 글자 하나씩 분산 배치"""
        regions = []
        for ry in range(2):
            for rx in range(3):
                x0, x1 = rx * COLS // 3, (rx + 1) * COLS // 3
                y0, y1 = ry * ROWS // 2, (ry + 1) * ROWS // 2
                regions.append((x0, x1, y0, y1))
        random.shuffle(regions)

        hx, hy = self.snake[0]
        for letter, (x0, x1, y0, y1) in zip(WORD, regions):
            occupied = set(self.snake) | set(self.foods)
            # 구역 가장자리 1칸은 비워 두고, 뱀 머리 바로 앞은 피함
            candidates = [(x, y)
                          for x in range(x0 + 1, x1 - 1)
                          for y in range(y0 + 1, y1 - 1)
                          if (x, y) not in occupied
                          and abs(x - hx) + abs(y - hy) > 3]
            if not candidates:
                candidates = self.free_cells()
            if candidates:
                self.foods[random.choice(candidates)] = letter

    # ===== 입력 =====
    def on_key(self, event):
        key = event.keysym
        if key in ("r", "R"):
            self.reset()
            return
        if key == "space" and not self.game_over:
            self.paused = not self.paused
            self.draw()
            return
        key = key.lower() if len(key) == 1 else key
        if key in DIRECTIONS:
            dx, dy = DIRECTIONS[key]
            # 반대 방향으로는 바로 돌 수 없음
            if (dx, dy) != (-self.direction[0], -self.direction[1]):
                self.next_direction = (dx, dy)

    # ===== 게임 진행 =====
    def tick(self):
        """한 프레임 진행"""
        if not self.paused and not self.game_over:
            self.move()
        self.draw()
        if not self.game_over:
            self.after_id = self.root.after(self.speed, self.tick)

    def move(self):
        self.direction = self.next_direction
        hx, hy = self.snake[0]
        new_head = (hx + self.direction[0], hy + self.direction[1])

        # 벽 충돌
        if not (0 <= new_head[0] < COLS and 0 <= new_head[1] < ROWS):
            self.end_game("벽에 부딪혔어요")
            return

        ate = new_head in self.foods
        # 꼬리는 먹이를 먹지 않으면 이동하므로 충돌 검사에서 제외
        body = self.snake if ate else self.snake[:-1]
        if new_head in body:
            self.end_game("몸에 부딪혔어요")
            return

        self.snake.insert(0, new_head)
        if not ate:
            self.snake.pop()
            return

        food = self.foods.pop(new_head)
        self.speed = max(MIN_SPEED, self.speed - 3)

        if food is None:  # 하트
            self.score += 10
            self.hearts_eaten += 1
            if self.hearts_eaten >= HEARTS_NEEDED:
                self.spawn_letters()
            else:
                self.spawn_heart()
        elif food == WORD[self.next_index]:  # 올바른 순서의 글자
            self.score += 20
            self.next_index += 1
            if self.next_index == len(WORD):
                self.end_game(win=True)
        else:  # 순서가 틀린 글자
            self.end_game(f"순서가 틀렸어요! ('{WORD[self.next_index]}' 차례였어요)")
        self.update_status()

    def end_game(self, reason="", win=False):
        self.game_over = True
        self.win = win
        self.fail_reason = reason
        self.high_score = max(self.high_score, self.score)
        self.update_status()

    def update_status(self):
        if self.hearts_eaten < HEARTS_NEEDED:
            goal = f"하트 {self.hearts_eaten}/{HEARTS_NEEDED}"
        elif self.next_index < len(WORD):
            done = "".join(WORD[:self.next_index]) or "-"
            goal = f"먹은 글자: {done}   다음: '{WORD[self.next_index]}'"
        else:
            goal = "완성!"
        self.score_label.config(
            text=f"점수: {self.score}   최고: {self.high_score}   |   {goal}")

    # ===== 그리기 =====
    def draw(self):
        c = self.canvas
        c.delete("all")
        w, h = COLS * CELL, ROWS * CELL

        if self.win:
            self.draw_win_screen(w, h)
            return

        # 먹이
        for (fx, fy), letter in self.foods.items():
            cx, cy = (fx + 0.5) * CELL, (fy + 0.5) * CELL
            if letter is None:
                c.create_polygon(heart_points(cx, cy, CELL * 0.95),
                                 fill=HEART_PINK, outline="", smooth=True)
            else:
                c.create_oval(fx * CELL + 1, fy * CELL + 1,
                              (fx + 1) * CELL - 1, (fy + 1) * CELL - 1,
                              fill=LETTER_BG, outline=HEART_PINK, width=2)
                c.create_text(cx, cy, text=letter, fill=LETTER_FG,
                              font=(FONT, int(CELL * 0.5), "bold"))

        # 뱀
        for i, (x, y) in enumerate(self.snake):
            color = SNAKE_HEAD if i == 0 else SNAKE_BODY
            c.create_rectangle(x * CELL + 1, y * CELL + 1,
                               (x + 1) * CELL - 1, (y + 1) * CELL - 1,
                               fill=color, outline="")

        if self.game_over:
            c.create_text(w / 2, h / 2 - 30, text="게임 오버",
                          fill=TEXT_COLOR, font=(FONT, 32, "bold"))
            c.create_text(w / 2, h / 2 + 15, text=self.fail_reason,
                          fill=TEXT_COLOR, font=(FONT, 14))
            c.create_text(w / 2, h / 2 + 45, text="R 키를 눌러 다시 시작",
                          fill=TEXT_COLOR, font=(FONT, 12))
        elif self.paused:
            c.create_text(w / 2, h / 2, text="일시정지 (Space)",
                          fill=TEXT_COLOR, font=(FONT, 24, "bold"))

    def draw_win_screen(self, w, h):
        """화면 가득 커다란 빨간 하트"""
        c = self.canvas
        size = min(w, h * 1.15) * 0.98
        c.create_polygon(heart_points(w / 2, h / 2, size, steps=200),
                         fill=BIG_HEART_RED, outline="", smooth=True)
        c.create_text(w / 2, h * 0.45, text="".join(WORD[:3]) + " " +
                      "".join(WORD[3:]), fill="white",
                      font=(FONT, int(size / 10), "bold"))
        c.create_text(w / 2, h - 14, text="R 키를 눌러 다시 시작",
                      fill=TEXT_COLOR, font=(FONT, 11))


if __name__ == "__main__":
    root = tk.Tk()
    root.configure(bg=BG_COLOR)
    SnakeGame(root)
    root.mainloop()
