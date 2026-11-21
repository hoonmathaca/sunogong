"""1성구~7성구 아이콘 만들기 (개발용).

    python3 tools/make_dragonballs.py              # public/dragonballs/1.png ~ 7.png
    python3 tools/make_dragonballs.py --sheet      # + 미리보기 시트(다운로드 폴더)

public/dragonballs/1.png ~ 7.png (256×256, 투명 배경) 를 만든다.
- 무지개 7색을 차분하게 톤다운한 뮤트 파스텔 팔레트:
  코랄레드 · 살구주황 · 버터옐로 · 세이지그린 · 더스티스카이 · 슬레이트네이비 · 라벤더퍼플
- 별은 하얀색 (구슬 색이 밝아도 보이도록 별 테두리·그림자를 구슬의 진한 톤으로)
- 왼쪽 위에서 빛이 드는 광택 + 유리 같은 테두리 + 반사광
- 별: 정확한 개수와 정식 드래곤볼 배치
- 반짝임: 구슬 위쪽에 작은 십자 반짝이

별 배치(구슬 중심 기준, y 는 아래로 +):
  1성구 가운데 · 2성구 위아래 · 3성구 삼각 · 4성구 네 귀퉁이 · 5성구 네 귀퉁이+가운데
  6성구 두 줄 세 개씩 · 7성구 가운데+둘레 여섯
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 4                      # 슈퍼샘플 배수
FINAL = 256                 # 최종 아이콘 크기(px)
S = FINAL * SS              # 작업 해상도
CX = CY = S / 2
R = S * 0.44                # 구슬 반지름

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'public', 'dragonballs')
SHEET_PATH = os.path.join(os.path.dirname(ROOT), '..', 'downloads', '선오공-무지개-1~7성구-아이콘.png')
FONT = os.path.join(ROOT, '.assets_fonts', 'Pretendard-Bold.otf')

# 정식 드래곤볼 별 배치
STAR_LAYOUTS: dict[int, list[tuple[float, float]]] = {
    1: [(0.0, 0.0)],
    2: [(0.0, -0.33), (0.0, 0.33)],
    3: [(0.0, -0.37), (-0.33, 0.27), (0.33, 0.27)],
    4: [(-0.32, -0.32), (0.32, -0.32), (-0.32, 0.32), (0.32, 0.32)],
    5: [(-0.33, -0.33), (0.33, -0.33), (0.0, 0.0), (-0.33, 0.33), (0.33, 0.33)],
    6: [(-0.34, -0.43), (0.34, -0.43), (-0.34, 0.0), (0.34, 0.0), (-0.34, 0.43), (0.34, 0.43)],
    7: [(0.0, 0.0)]
    + [
        (0.43 * math.cos(math.radians(a)), 0.43 * math.sin(math.radians(a)))
        for a in (150, 210, 270, 330, 30, 90)
    ],
}

STAR_RADIUS = {1: 0.250, 2: 0.205, 3: 0.190, 4: 0.180, 5: 0.140, 6: 0.128, 7: 0.113}

# 무지개 7색 — 채도를 낮춘 뮤트 파스텔 (base: 구슬 중간톤, light: 빛 받는 톤, deep: 그늘·테두리 톤)
PALETTE: dict[int, dict[str, tuple[int, int, int]]] = {
    1: {'name': '코랄레드', 'base': (228, 122, 110), 'light': (246, 174, 164), 'deep': (178, 78, 70)},
    2: {'name': '살구주황', 'base': (243, 176, 126), 'light': (252, 209, 176), 'deep': (198, 122, 76)},
    3: {'name': '버터옐로', 'base': (246, 212, 138), 'light': (253, 234, 186), 'deep': (200, 160, 84)},
    4: {'name': '세이지그린', 'base': (150, 180, 133), 'light': (188, 210, 172), 'deep': (102, 130, 88)},
    5: {'name': '더스티스카이', 'base': (156, 192, 222), 'light': (198, 222, 241), 'deep': (102, 140, 176)},
    6: {'name': '슬레이트네이비', 'base': (92, 115, 158), 'light': (133, 157, 196), 'deep': (54, 73, 112)},
    7: {'name': '라벤더퍼플', 'base': (186, 158, 199), 'light': (216, 196, 227), 'deep': (134, 105, 152)},
}

STAR_WHITE = (255, 253, 247)
STAR_WHITE_DIM = (242, 238, 229)


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t: np.ndarray | float) -> np.ndarray:
    """a, b: (3,) RGB · t: 비율(2차원이면 채널 축을 붙인다) → (..., 3)"""
    ratio = np.asarray(t, dtype=np.float32)
    if ratio.ndim == 2:
        ratio = ratio[..., None]
    return np.asarray(a, dtype=np.float32) * (1.0 - ratio) + np.asarray(b, dtype=np.float32) * ratio


def toward(color, target, ratio: float) -> tuple[int, int, int]:
    """두 색 사이 중간색 (ratio 만큼 target 쪽으로)"""
    return tuple(int(round(c + (t - c) * ratio)) for c, t in zip(color, target))


def orb_layer(pal: dict[str, tuple[int, int, int]]) -> Image.Image:
    """구슬 본체 — 빛·유리 테두리·속빛"""
    base, light, deep = pal['base'], pal['light'], pal['deep']
    shadow = toward(base, deep, 0.62)          # 그늘은 진한 톤을 살짝만 섞어 차분하게
    sheen = toward(light, (255, 255, 255), 0.72)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    nx = (xx - CX) / R
    ny = (yy - CY) / R
    radius = np.sqrt(nx * nx + ny * ny)
    nz = np.sqrt(np.clip(1.0 - radius * radius, 0.0, 1.0))

    # 왼쪽 위 앞에서 비추는 빛
    light_dir = np.array([-0.44, -0.52, 0.73], dtype=np.float32)
    light_dir /= np.linalg.norm(light_dir)
    diffuse = np.clip(nx * light_dir[0] + ny * light_dir[1] + nz * light_dir[2], 0.0, 1.0)

    body = mix(shadow, base, smoothstep(0.02, 0.58, diffuse))
    body = mix(body, light, smoothstep(0.50, 0.90, diffuse))
    body = mix(body, sheen, smoothstep(0.88, 1.0, diffuse))

    # 구슬 속에서 번지는 부드러운 빛
    inner = np.exp(-(((nx + 0.05) ** 2 + (ny + 0.10) ** 2) / 0.34))
    body = mix(body, toward(light, (255, 255, 255), 0.35), 0.20 * inner)

    # 아래쪽 그늘 (구슬이 둥글게 보이도록)
    body = mix(body, shadow, 0.22 * smoothstep(-0.2, 1.0, ny) * smoothstep(0.25, 1.0, radius))

    # 유리 테두리 — 오른쪽 아래 가장자리 안쪽의 반사광
    ring = np.exp(-(((radius - 0.92) / 0.045) ** 2))
    lower_right = smoothstep(-0.35, 0.75, ny * 0.6 + nx * 0.4)
    body = mix(body, toward(light, (255, 255, 255), 0.55), 0.40 * ring * lower_right)

    # 테두리는 살짝 어둡게 (유리 두께)
    body = mix(body, toward(base, deep, 0.8), 0.40 * smoothstep(0.90, 1.0, radius))

    # 왼쪽 위 하이라이트 — 작고 아주 밝은 점 + 넓게 퍼지는 반사
    hotspot = np.exp(-(((nx + 0.38) ** 2 + (ny + 0.42) ** 2) / 0.010))
    body = mix(body, (255, 255, 252), 0.95 * hotspot)
    broad = np.exp(-(((nx + 0.28) ** 2 + (ny + 0.32) ** 2) / 0.075))
    body = mix(body, toward(light, (255, 255, 255), 0.6), 0.18 * broad)

    # 구슬 속 소용돌이 (아주 옅게)
    swirl = np.sin(3.0 * np.arctan2(ny, nx) + 5.5 * radius - 1.0)
    wisp = np.clip(swirl, 0.0, 1.0) * smoothstep(0.2, 0.9, radius) * 0.07
    body = mix(body, toward(light, (255, 255, 255), 0.5), wisp)

    alpha = smoothstep(1.0, 1.0 - 1.4 / R, radius)
    arr = np.dstack([np.clip(body, 0, 255), alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def star_polygon(cx: float, cy: float, radius: float, rotation_deg: float = -90.0) -> list[tuple[float, float]]:
    """5각 별 꼭짓점 (안쪽 반지름 = 바깥의 0.45)"""
    points: list[tuple[float, float]] = []
    inner = radius * 0.45
    for index in range(10):
        r = radius if index % 2 == 0 else inner
        a = math.radians(rotation_deg + index * 36.0)
        points.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return points


def draw_star(
    base: Image.Image,
    cx: float,
    cy: float,
    radius: float,
    rotation: float,
    pal: dict[str, tuple[int, int, int]],
) -> None:
    """하얀 별 하나 — 구슬 그늘색 그림자 + 진한 테두리 + 입체감 있는 흰색"""
    poly = star_polygon(cx, cy, radius, rotation)
    deep = pal['deep']

    # 별 그림자 (구슬 안쪽에 살짝 떠 보이게)
    shadow = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon(
        [(x + radius * 0.09, y + radius * 0.11) for x, y in poly], fill=deep + (110,)
    )
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius * 0.17)))

    # 별 모양 마스크
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)

    # 별 색 — 왼쪽 위는 순백, 오른쪽 아래는 살짝 따뜻한 흰색
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    gx = (xx - (cx - radius * 0.35)) / (radius * 1.7)
    gy = (yy - (cy - radius * 0.40)) / (radius * 1.8)
    t = np.clip(np.sqrt(np.clip(gx * gx + gy * gy, 0.0, 4.0)) / 1.15, 0.0, 1.0)
    star_rgb = mix(STAR_WHITE, STAR_WHITE_DIM, t)
    star_alpha = np.asarray(mask, dtype=np.float32)
    layer = np.dstack([star_rgb, star_alpha]).astype(np.uint8)
    base.alpha_composite(Image.fromarray(layer, 'RGBA'))

    # 별 테두리 — 구슬이 밝아도 흰 별이 또렷하게
    ImageDraw.Draw(base).line(
        poly + [poly[0]],
        fill=deep + (205,),
        width=max(2, int(radius * 0.055)),
        joint='curve',
    )

    # 왼쪽 위 작은 반사 — 별이 반짝이는 느낌
    glint = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ImageDraw.Draw(glint).ellipse(
        [
            cx - radius * 0.50 - radius * 0.13,
            cy - radius * 0.54 - radius * 0.075,
            cx - radius * 0.50 + radius * 0.13,
            cy - radius * 0.54 + radius * 0.075,
        ],
        fill=(255, 255, 255, 150),
    )
    base.alpha_composite(
        Image.composite(glint.filter(ImageFilter.GaussianBlur(radius * 0.05)),
                        Image.new('RGBA', base.size, (0, 0, 0, 0)), mask)
    )


def star_rotation(index: int, total: int) -> float:
    """별마다 조금씩 돌려 자연스럽게"""
    if total == 1:
        return -90.0
    return -90.0 + [0, 7, -8, 5, -6, 8, -4][index % 7]


def sparkle(base: Image.Image, cx: float, cy: float, size: float, alpha: int = 210) -> None:
    """작은 십자 반짝이"""
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).polygon(
        [
            (cx, cy - size), (cx + size * 0.15, cy - size * 0.15), (cx + size, cy),
            (cx + size * 0.15, cy + size * 0.15), (cx, cy + size), (cx - size * 0.15, cy + size * 0.15),
            (cx - size, cy), (cx - size * 0.15, cy - size * 0.15),
        ],
        fill=(255, 255, 252, alpha),
    )
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(size * 0.08)))


def downscale(image: Image.Image) -> Image.Image:
    """투명 경계가 어둡거나 하얗게 번지지 않도록 float premultiplied 로 줄인다"""
    arr = np.asarray(image, dtype=np.float32) / 255.0
    alpha = np.clip(arr[..., 3], 0.0, 1.0)
    premul = arr[..., :3] * alpha[..., None]
    channels = [
        np.asarray(Image.fromarray(premul[..., index], 'F').resize((FINAL, FINAL), Image.LANCZOS))
        for index in range(3)
    ]
    small_alpha = np.clip(np.asarray(Image.fromarray(alpha, 'F').resize((FINAL, FINAL), Image.LANCZOS)), 0.0, 1.0)
    rgb = np.stack(channels, axis=-1) / np.maximum(small_alpha[..., None], 1e-4)
    rgb = np.clip(rgb, 0.0, 1.0) * 255.0
    return Image.fromarray(np.dstack([rgb, small_alpha * 255.0]).astype(np.uint8), 'RGBA')


def make_ball(stars: int) -> Image.Image:
    pal = PALETTE[stars]
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # 구슬 바깥의 은은한 빛
    halo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse(
        [CX - R * 1.04, CY - R * 1.04, CX + R * 1.04, CY + R * 1.04],
        fill=pal['base'] + (95,),
    )
    base.alpha_composite(halo.filter(ImageFilter.GaussianBlur(R * 0.09)))
    orb = orb_layer(pal)
    base.alpha_composite(orb)

    radius = STAR_RADIUS[stars] * R
    for index, (sx, sy) in enumerate(STAR_LAYOUTS[stars]):
        draw_star(base, CX + sx * R, CY + sy * R, radius, star_rotation(index, stars), pal)

    # 반짝임(십자)는 넣지 않는다 — 하얀 별과 헷갈려 성구 개수를 세기 어려워진다.

    return downscale(base)


def rainbow_layer() -> Image.Image:
    """무지개 볼 — 7가지 톤다운 색이 구슬 안에서 부드럽게 섞여 도는 영롱한 구슬"""
    colors = [PALETTE[i]['base'] for i in range(1, 8)]
    light = [PALETTE[i]['light'] for i in range(1, 8)]
    deep = [PALETTE[i]['deep'] for i in range(1, 8)]

    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    nx = (xx - CX) / R
    ny = (yy - CY) / R
    radius = np.sqrt(nx * nx + ny * ny)
    nz = np.sqrt(np.clip(1.0 - radius * radius, 0.0, 1.0))

    # 색 띠 — 각도 + 중심에서 퍼지는 나선으로 7색이 구슬 전체를 감아 돈다
    angle = np.arctan2(ny, nx)
    turn = (angle + math.pi) / (2 * math.pi)            # 0..1 한 바퀴
    pos = (turn * 2.0 + radius * 1.15) % 1.0            # 나선
    value = pos * 7.0
    i0 = np.floor(value).astype(np.int32) % 7
    frac = value - np.floor(value)
    blend = smoothstep(0.30, 0.70, frac)[..., None]

    base_arr = np.zeros((S, S, 3), dtype=np.float32)
    for index in range(7):
        mask = (i0 == index)[..., None].astype(np.float32)
        nxt = np.asarray(colors[(index + 1) % 7], dtype=np.float32)
        mixed = np.asarray(colors[index], dtype=np.float32) * (1.0 - blend) + nxt * blend
        base_arr += mask * mixed

    # 빛 — 왼쪽 위에서 (색은 그대로 두고 밝기만)
    light_dir = np.array([-0.42, -0.50, 0.76], dtype=np.float32)
    light_dir /= np.linalg.norm(light_dir)
    diffuse = np.clip(nx * light_dir[0] + ny * light_dir[1] + nz * light_dir[2], 0.0, 1.0)

    body = base_arr * (0.86 + 0.26 * diffuse[..., None])
    body = mix(body, (255, 255, 252), 0.16 * smoothstep(0.86, 1.0, diffuse))

    # 아래쪽 그늘 — 둥글게
    body = mix(body, np.asarray((70, 74, 96), dtype=np.float32), 0.10 * smoothstep(0.1, 1.0, ny) * smoothstep(0.3, 1.0, radius))

    # 구슬 속에서 번지는 무지갯빛
    glow = np.exp(-(((nx + 0.02) ** 2 + (ny + 0.06) ** 2) / 0.34))
    body = mix(body, np.asarray(light[2], dtype=np.float32), 0.12 * glow)

    # 가장자리 — 유리 두께
    rim = smoothstep(0.88, 1.0, radius)
    body = mix(body, (250, 250, 246), 0.28 * rim * smoothstep(-0.5, 0.9, ny * 0.5 + nx * 0.5))

    # 왼쪽 위 반짝 하이라이트
    hotspot = np.exp(-(((nx + 0.40) ** 2 + (ny + 0.44) ** 2) / 0.008))
    body = mix(body, (255, 255, 255), 0.95 * hotspot)
    broad = np.exp(-(((nx + 0.30) ** 2 + (ny + 0.34) ** 2) / 0.05))
    body = mix(body, (255, 255, 250), 0.10 * broad)

    alpha = smoothstep(1.0, 1.0 - 1.4 / R, radius)
    arr = np.dstack([np.clip(body, 0, 255), alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def make_rainbow_ball() -> Image.Image:
    """칠성구를 합쳐 만드는 무지개 볼 (256×256, 투명 배경)"""
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # 무지갯빛 후광
    halo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(halo)
    for index in range(7):
        a0 = -90 + index * (360 / 7)
        draw.pieslice(
            [CX - R * 1.06, CY - R * 1.06, CX + R * 1.06, CY + R * 1.06],
            start=a0 - 2, end=a0 + 360 / 7 + 2,
            fill=PALETTE[index + 1]['light'] + (85,),
        )
    halo = halo.filter(ImageFilter.GaussianBlur(R * 0.12))
    base.alpha_composite(halo)

    base.alpha_composite(rainbow_layer())

    # 영롱한 반짝임 — 무지개 볼에만
    sparkle(base, CX + R * 0.42, CY - R * 0.60, R * 0.20, 235)
    sparkle(base, CX - R * 0.66, CY + R * 0.26, R * 0.13, 200)
    sparkle(base, CX + R * 0.68, CY + R * 0.56, R * 0.10, 180)
    sparkle(base, CX - R * 0.18, CY - R * 0.84, R * 0.07, 160)

    return downscale(base)


def make_sheet(balls: list[Image.Image], rainbow: Image.Image | None = None) -> None:
    """미리보기 시트 — 하얀 별이 밝은 구슬에서도 읽히는지 한눈에 보도록"""
    items = [(index + 1, ball) for index, ball in enumerate(balls)]
    if rainbow is not None:
        items.append((0, rainbow))
    count = len(items)
    tile, gap, margin, top = 300, 28, 48, 118
    width = margin * 2 + tile * count + gap * (count - 1)
    height = top + tile + 92
    sheet = Image.new('RGB', (width, height), (250, 249, 246))
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 34), '선오공 · 무지개 1~7성구 아이콘', font=ImageFont.truetype(FONT, 44), fill=(18, 41, 107))
    draw.text(
        (margin, 88),
        '톤다운 뮤트 파스텔 7색 + 하얀 별 · 256×256 투명 PNG',
        font=ImageFont.truetype(FONT, 22),
        fill=(120, 133, 160),
    )
    label_font = ImageFont.truetype(FONT, 24)
    for position, (stars, ball) in enumerate(items):
        x = margin + position * (tile + gap)
        y = top
        draw.rounded_rectangle([x, y, x + tile, y + tile], radius=36, fill=(255, 255, 255),
                               outline=(226, 230, 238), width=2)
        art = ball.resize((tile - 36, tile - 36), Image.LANCZOS)
        sheet.paste(art, (x + 18, y + 18), art)
        text = '무지개 볼 (칠성구 합성)' if stars == 0 else f'{stars}성구 · {PALETTE[stars]["name"]}'
        tw = draw.textlength(text, font=label_font)
        draw.text((x + (tile - tw) / 2, y + tile + 22), text, font=label_font, fill=(52, 62, 88))
    os.makedirs(os.path.dirname(SHEET_PATH), exist_ok=True)
    sheet.save(SHEET_PATH, optimize=True)
    print(f'{SHEET_PATH}  ({width}×{height})')


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    balls: list[Image.Image] = []
    for stars in range(1, 8):
        image = make_ball(stars)
        balls.append(image)
        path = os.path.join(OUT_DIR, f'{stars}.png')
        image.save(path, optimize=True)
        print(f'{path}  ({os.path.getsize(path) // 1024} KB)')

    rainbow = make_rainbow_ball()
    rainbow_path = os.path.join(OUT_DIR, 'rainbow.png')
    rainbow.save(rainbow_path, optimize=True)
    print(f'{rainbow_path}  ({os.path.getsize(rainbow_path) // 1024} KB)')

    if '--sheet' in sys.argv[1:]:
        make_sheet(balls, rainbow)


if __name__ == '__main__':
    main()
