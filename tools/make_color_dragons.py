"""7색 드래곤 · 교환권 아이콘 만들기 (개발용).

    python3 tools/make_color_dragons.py

· 무지개 신룡(public/dragonballs/shenron.png, downloads/shenron-joayong-hun-rainbow.png 에서 만든 것)을
  색만 바꿔 빨강·주황·노랑·초록·파랑·남색·보라 드래곤 아이콘 7장을 만든다.
  (모양은 그대로라 7마리가 한 가족처럼 보인다. 레인보우 드래곤은 shenron.png 를 그대로 쓴다)
· 사탕교환권 · 1,000포인트 교환권 · 10,000포인트 교환권 아이콘도 함께 만든다.
"""
import colorsys
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'public', 'dragonballs')
BASE = os.path.join(OUT_DIR, 'shenron.png')
FONT = os.path.join(ROOT, '.assets_fonts', 'Pretendard-Bold.otf')

# 이름: (목표 색상H 0~360, 채도 배율, 밝기 배율)
DRAGON_COLORS = {
    'red': (352, 1.06, 1.00),
    'orange': (28, 1.10, 1.02),
    'yellow': (46, 1.05, 0.99),
    'green': (126, 1.08, 0.97),
    'blue': (212, 1.08, 0.98),
    'navy': (234, 1.10, 0.86),
    'purple': (276, 1.10, 1.00),
    # 히든 검은용 — 다른 용과 같은 그림에 아주 어두운 색만 입힌다
    'black': (238, 0.20, 0.30, 0.10),
}


def recolor(src: Image.Image, hue_deg: float, sat_scale: float, val_scale: float, sat_floor: float = 0.72) -> Image.Image:
    """색이 있는 픽셀만 목표 색상으로 옮긴다. 흰 얼굴·검은 선은 그대로 둔다."""
    out = src.copy()
    px = out.load()
    target = (hue_deg % 360) / 360.0
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            # 색이 거의 없는 흰색·회색·검은 선은 손대지 않는다
            if ss < 0.12 or ll < 0.12 or ll > 0.985:
                continue
            # 옅은 파스텔 띠도 색이 뭉개지지 않게 채도를 끌어올린다
            nss = min(1.0, max(sat_floor, ss) * sat_scale)
            nll = min(1.0, max(0.0, ll * val_scale))
            nr, ng, nb = colorsys.hls_to_rgb(target, nll, nss)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


def vertical_gradient(size, top, bottom) -> Image.Image:
    w, h = size
    img = Image.new('RGB', size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (w, y)], fill=color)
    return img


def make_ticket(name: str, top: str, bottom: str, title: str, sub: str, text_color=(255, 255, 255)) -> None:
    size = 256
    w = h = size
    body = (26, 44, 222, 188)  # left, top, right, bottom

    mask = Image.new('L', (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle(body, radius=26, fill=255)
    # 양옆 반원 오려 내기 (티켓 모양)
    r = 20
    md.ellipse((body[0] - r, (body[1] + body[3]) // 2 - r, body[0] + r, (body[1] + body[3]) // 2 + r), fill=0)
    md.ellipse((body[2] - r, (body[1] + body[3]) // 2 - r, body[2] + r, (body[1] + body[3]) // 2 + r), fill=0)

    grad = vertical_gradient((w, h), top, bottom).convert('RGBA')
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)
    # 흰 테두리
    draw.rounded_rectangle(body, radius=26, outline=(255, 255, 255, 235), width=5)
    # 왼쪽 점선
    for y in range(body[1] + 14, body[3] - 10, 14):
        draw.line([(body[0] + 30, y), (body[0] + 30, y + 7)], fill=(255, 255, 255, 150), width=4)

    big = ImageFont.truetype(FONT, 46 if len(title) <= 5 else 40)
    small = ImageFont.truetype(FONT, 24)

    cx = (body[0] + 30 + body[2]) // 2 + 6

    def center(text, font, y, fill):
        box = draw.textbbox((0, 0), text, font=font)
        tw = box[2] - box[0]
        draw.text((cx - tw / 2, y), text, font=font, fill=fill)

    # 그림자 → 글자
    center(title, big, 62, (0, 0, 0, 40))
    center(title, big, 60, (255, 255, 255, 255))
    center(sub, small, 122, (255, 255, 255, 240))
    center('교환권', small if len(sub) < 6 else ImageFont.truetype(FONT, 20), 152, (255, 255, 255, 210))

    path = os.path.join(OUT_DIR, f'ticket-{name}.png')
    img.save(path, optimize=True)
    print(f'{path}  {img.size[0]}x{img.size[1]}  ({os.path.getsize(path) // 1024} KB)')


def main() -> None:
    with Image.open(BASE) as src:
        src = src.convert('RGBA')
        base = src.copy()
        for name, spec in DRAGON_COLORS.items():
            hue, sat, val = spec[0], spec[1], spec[2]
            floor = spec[3] if len(spec) > 3 else 0.72
            img = recolor(base, hue, sat, val, floor)
            path = os.path.join(OUT_DIR, f'dragon-{name}.png')
            img.save(path, optimize=True)
            print(f'{path}  {img.size[0]}x{img.size[1]}  ({os.path.getsize(path) // 1024} KB)')

    make_ticket('candy', (255, 150, 180), (233, 64, 112), '사탕', '달콤')
    make_ticket('1000', (255, 200, 90), (240, 140, 0), '1,000', 'POINT')
    make_ticket('10000', (176, 140, 255), (98, 58, 200), '10,000', 'POINT')
    make_ticket('secret', (78, 78, 96), (24, 24, 32), '시크릿', 'SECRET')


if __name__ == '__main__':
    main()
