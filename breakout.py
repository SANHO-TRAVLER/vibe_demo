import random
import tkinter as tk
import tkinter.font as tkfont
from tkinter import messagebox


WIDTH = 800
HEIGHT = 600
PADDLE_WIDTH = 110
PADDLE_HEIGHT = 14
BALL_RADIUS = 9
BALL_SPEED = 8
BLOCK_ROWS = 6
BLOCK_COLUMNS = 10
BLOCK_GAP = 6
BLOCK_TOP = 70
BLOCK_HEIGHT = 24
EVENT_HEART_COUNT = 120


class BreakoutGame:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("블럭깨기")
        self.root.resizable(False, False)
        self.root.configure(bg="#101827")

        self.score = 0
        self.lives = 3
        self.running = False
        self.paused = False
        self.left_pressed = False
        self.right_pressed = False
        self.after_id: str | None = None
        self.event_after_id: str | None = None

        header = tk.Frame(root, bg="#101827", height=50)
        header.pack(fill="x")

        self.score_label = tk.Label(
            header,
            text="점수 0",
            fg="#f8fafc",
            bg="#101827",
            font=("맑은 고딕", 12, "bold"),
        )
        self.score_label.pack(side="left", padx=18, pady=12)

        self.status_label = tk.Label(
            header,
            text="스페이스: 시작 / 일시정지",
            fg="#93c5fd",
            bg="#101827",
            font=("맑은 고딕", 10),
        )
        self.status_label.pack(side="right", padx=18, pady=12)

        self.canvas = tk.Canvas(
            root,
            width=WIDTH,
            height=HEIGHT,
            bg="#172033",
            highlightthickness=0,
        )
        self.canvas.pack(padx=12, pady=(0, 12))

        self.canvas.bind("<Motion>", self.move_paddle_with_mouse)
        self.root.bind("<Left>", lambda _event: self.set_key("left", True))
        self.root.bind("<KeyRelease-Left>", lambda _event: self.set_key("left", False))
        self.root.bind("<Right>", lambda _event: self.set_key("right", True))
        self.root.bind("<KeyRelease-Right>", lambda _event: self.set_key("right", False))
        self.root.bind("<space>", lambda _event: self.toggle_pause())
        self.root.bind("<KeyPress-r>", lambda _event: self.reset_game())
        self.root.bind("<KeyPress-R>", lambda _event: self.reset_game())

        self.reset_game()

    def reset_game(self) -> None:
        if self.after_id is not None:
            self.root.after_cancel(self.after_id)
            self.after_id = None
        if self.event_after_id is not None:
            self.root.after_cancel(self.event_after_id)
            self.event_after_id = None

        self.canvas.delete("all")
        self.score = 0
        self.lives = 3
        self.running = False
        self.paused = False
        self.left_pressed = False
        self.right_pressed = False
        self.paddle_hits = 0
        self.blocks: list[int] = []
        self.event_heart_items: list[int] = []
        self.event_heart_states: list[list[float]] = []

        self.paddle_x = WIDTH / 2
        self.paddle_y = HEIGHT - 42
        self.paddle = self.canvas.create_rectangle(
            self.paddle_x - PADDLE_WIDTH / 2,
            self.paddle_y - PADDLE_HEIGHT / 2,
            self.paddle_x + PADDLE_WIDTH / 2,
            self.paddle_y + PADDLE_HEIGHT / 2,
            fill="#38bdf8",
            outline="",
        )
        self.create_blocks()
        self.create_ball()
        self.update_header()
        self.draw_overlay("SPACE를 눌러 시작")

    def create_blocks(self) -> None:
        block_width = (WIDTH - 36 - (BLOCK_COLUMNS - 1) * BLOCK_GAP) / BLOCK_COLUMNS
        colors = ["#FBE3EC", "#F4B6C2", "#D98CA5", "#A95C78"]

        for row in range(BLOCK_ROWS):
            for column in range(BLOCK_COLUMNS):
                x1 = 18 + column * (block_width + BLOCK_GAP)
                y1 = BLOCK_TOP + row * (BLOCK_HEIGHT + BLOCK_GAP)
                block = self.canvas.create_rectangle(
                    x1,
                    y1,
                    x1 + block_width,
                    y1 + BLOCK_HEIGHT,
                    fill=colors[row % len(colors)],
                    outline="#172033",
                    width=2,
                )
                self.blocks.append(block)

    def create_ball(self) -> None:
        self.ball_x = WIDTH / 2
        self.ball_y = HEIGHT - 75
        self.ball_dx = random.choice([-BALL_SPEED, BALL_SPEED])
        self.ball_dy = -BALL_SPEED
        self.ball = self.canvas.create_polygon(
            self.heart_points(self.ball_x, self.ball_y),
            fill="#E63946",
            outline="",
        )

    def heart_points(self, x: float, y: float) -> list[float]:
        return [
            x,
            y + 13,
            x - 15,
            y - 1,
            x - 15,
            y - 7,
            x - 11,
            y - 12,
            x - 5,
            y - 12,
            x,
            y - 6,
            x + 5,
            y - 12,
            x + 11,
            y - 12,
            x + 15,
            y - 7,
            x + 15,
            y - 1,
        ]

    def set_key(self, direction: str, pressed: bool) -> None:
        if direction == "left":
            self.left_pressed = pressed
        else:
            self.right_pressed = pressed

    def move_paddle_with_mouse(self, event: tk.Event) -> None:
        self.paddle_x = max(
            PADDLE_WIDTH / 2,
            min(WIDTH - PADDLE_WIDTH / 2, event.x),
        )
        self.draw_paddle()

    def draw_paddle(self) -> None:
        self.canvas.coords(
            self.paddle,
            self.paddle_x - PADDLE_WIDTH / 2,
            self.paddle_y - PADDLE_HEIGHT / 2,
            self.paddle_x + PADDLE_WIDTH / 2,
            self.paddle_y + PADDLE_HEIGHT / 2,
        )

    def toggle_pause(self) -> None:
        if not self.running:
            self.running = True
            self.status_label.config(text="SPACE: 일시정지  |  R: 다시 시작")
            self.clear_overlay()
            self.game_loop()
        elif self.paused:
            self.paused = False
            self.status_label.config(text="SPACE: 일시정지  |  R: 다시 시작")
            self.clear_overlay()
            self.game_loop()
        else:
            self.paused = True
            self.status_label.config(text="일시정지됨  |  SPACE: 계속")
            self.draw_overlay("일시정지")

    def game_loop(self) -> None:
        if not self.running or self.paused:
            return

        self.move_paddle()
        self.move_ball()
        if self.running and not self.paused:
            self.after_id = self.root.after(16, self.game_loop)

    def move_paddle(self) -> None:
        direction = int(self.right_pressed) - int(self.left_pressed)
        self.paddle_x = max(
            PADDLE_WIDTH / 2,
            min(WIDTH - PADDLE_WIDTH / 2, self.paddle_x + direction * 8),
        )
        self.draw_paddle()

    def move_ball(self) -> None:
        next_x = self.ball_x + self.ball_dx
        next_y = self.ball_y + self.ball_dy

        if next_x - BALL_RADIUS <= 0 or next_x + BALL_RADIUS >= WIDTH:
            self.ball_dx *= -1
            next_x = self.ball_x + self.ball_dx
        if next_y - BALL_RADIUS <= 0:
            self.ball_dy *= -1
            next_y = self.ball_y + self.ball_dy

        paddle_left = self.paddle_x - PADDLE_WIDTH / 2
        paddle_right = self.paddle_x + PADDLE_WIDTH / 2
        paddle_top = self.paddle_y - PADDLE_HEIGHT / 2
        if (
            self.ball_dy > 0
            and paddle_left - BALL_RADIUS <= next_x <= paddle_right + BALL_RADIUS
            and paddle_top - BALL_RADIUS <= next_y <= paddle_top + BALL_RADIUS
        ):
            hit_position = (next_x - self.paddle_x) / (PADDLE_WIDTH / 2)
            self.ball_dx = max(-12, min(12, hit_position * 12))
            if abs(self.ball_dx) < 2:
                self.ball_dx = 2 if self.ball_dx >= 0 else -2
            self.ball_dy = -abs(self.ball_dy)
            next_y = paddle_top - BALL_RADIUS
            self.paddle_hits += 1
            if self.paddle_hits >= 3:
                self.finish_event()
                return

        hit_block = self.find_hit_block(next_x, next_y)
        if hit_block is not None:
            self.canvas.delete(hit_block)
            self.blocks.remove(hit_block)
            self.score += 10
            self.ball_dy *= -1
            self.update_header()

            if not self.blocks:
                self.finish_game("승리했습니다!")
                return

        if next_y - BALL_RADIUS > HEIGHT:
            self.lives -= 1
            self.update_header()
            if self.lives <= 0:
                self.finish_game("게임 오버")
                return
            self.ball_x = WIDTH / 2
            self.ball_y = HEIGHT - 75
            self.ball_dx = random.choice([-BALL_SPEED, BALL_SPEED])
            self.ball_dy = -BALL_SPEED
            self.canvas.coords(self.ball, *self.heart_points(self.ball_x, self.ball_y))
            return

        self.ball_x = next_x
        self.ball_y = next_y
        self.canvas.coords(self.ball, *self.heart_points(self.ball_x, self.ball_y))

    def find_hit_block(self, x: float, y: float) -> int | None:
        overlapping = self.canvas.find_overlapping(
            x - BALL_RADIUS,
            y - BALL_RADIUS,
            x + BALL_RADIUS,
            y + BALL_RADIUS,
        )
        for item in overlapping:
            if item in self.blocks:
                return item
        return None

    def update_header(self) -> None:
        self.score_label.config(text=f"점수 {self.score}  |  목숨 {self.lives}")

    def draw_overlay(self, text: str) -> None:
        self.canvas.delete("overlay")
        self.canvas.create_rectangle(
            0,
            0,
            WIDTH,
            HEIGHT,
            fill="#0f172a",
            stipple="gray50",
            outline="",
            tags="overlay",
        )
        self.canvas.create_text(
            WIDTH / 2,
            HEIGHT / 2,
            text=text,
            fill="#f8fafc",
            font=("맑은 고딕", 24, "bold"),
            tags="overlay",
        )

    def clear_overlay(self) -> None:
        self.canvas.delete("overlay")

    def get_event_font(self) -> str:
        available_fonts = set(tkfont.families(self.root))
        for font_name in (
            "Arial Rounded MT Bold",
            "Comic Sans MS",
            "휴먼둥근헤드라인",
            "맑은 고딕",
        ):
            if font_name in available_fonts:
                return font_name
        return "TkDefaultFont"

    def finish_game(self, message: str) -> None:
        self.running = False
        self.paused = False
        self.status_label.config(text="R: 다시 시작  |  SPACE: 시작")
        self.draw_overlay(f"{message}\n점수: {self.score}   (R을 눌러 다시 시작)")

    def finish_event(self) -> None:
        self.running = False
        self.paused = False
        self.status_label.config(text="이벤트 발생!  |  R: 다시 시작")
        self.canvas.delete("all")
        self.event_heart_items = []
        self.event_heart_states = []

        event_colors = ["#E63946", "#F4B6C2", "#D98CA5", "#A95C78", "#FFFFFF"]
        for _ in range(EVENT_HEART_COUNT):
            x = random.uniform(15, WIDTH - 15)
            y = random.uniform(-HEIGHT, HEIGHT)
            speed = random.uniform(2.5, 6.0)
            heart = self.canvas.create_polygon(
                self.heart_points(x, y),
                fill=random.choice(event_colors),
                outline="",
                tags="event_background",
            )
            self.event_heart_items.append(heart)
            self.event_heart_states.append([x, y, speed])

        message_font = (self.get_event_font(), 34, "bold")
        outline_offsets = (
            (-3, -3),
            (0, -3),
            (3, -3),
            (-3, 0),
            (3, 0),
            (-3, 3),
            (0, 3),
            (3, 3),
        )
        for offset_x, offset_y in outline_offsets:
            self.canvas.create_text(
                WIDTH / 2 + offset_x,
                HEIGHT / 2 + offset_y,
                text="진성아 사랑해♥",
                fill="#8B1E3F",
                font=message_font,
                tags="event_message_outline",
            )
        self.canvas.create_text(
            WIDTH / 2,
            HEIGHT / 2,
            text="진성아 사랑해♥",
            fill="#FFFFFF",
            font=message_font,
            tags="event_message",
        )
        self.animate_event_hearts()

    def animate_event_hearts(self) -> None:
        for heart, state in zip(self.event_heart_items, self.event_heart_states):
            state[1] += state[2]
            if state[1] > HEIGHT + 20:
                state[0] = random.uniform(15, WIDTH - 15)
                state[1] = random.uniform(-120, -20)
                state[2] = random.uniform(2.5, 6.0)
            self.canvas.coords(heart, *self.heart_points(state[0], state[1]))

        self.canvas.tag_raise("event_message_outline")
        self.canvas.tag_raise("event_message")
        self.event_after_id = self.root.after(35, self.animate_event_hearts)


def main() -> None:
    root = tk.Tk()
    BreakoutGame(root)
    root.mainloop()


if __name__ == "__main__":
    main()