"""1성구~7성구 아이콘 만들기 (개발용).

    python3 tools/make_dragonballs.py

public/dragonballs/1.png ~ 7.png (256×256, 투명 배경) 를 만든다.
- 주황 크리스탈 구슬: 왼쪽 위에서 빛이 드는 광택 + 유리 같은 테두리 + 반사광
- 별: 정확한 개수와 정식 드래곤볼 배치로 붉은 별을 구슬 안쪽에 그린다.
- 반짝임: 구슬 위쪽에 작은 십자 반짝이.

별 배치(구슬 중심 기준, y 는 아래로 +):
  1성구 가운데 · 2성구 위아래 · 3성구 삼각 · 4성구 네 귀퉁이 · 5성구 네 귀퉁이+가운데
  6성구 두 줄 세 개씩 · 7성구 가운데+둘레 여섯
"""
from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4                      # 슈퍼샘플 배수
FINAL = 256                 # 최종 아이콘 크기(px)
S = FINAL * SS              # 작업 해상도
CX = CY = S / 2
R = S * 0.44                # 구슬 반지름

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'dragonballs')

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


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t: np.ndarray | float) -> np.ndarray:
    """a, b: (3,) RGB · t: 비율(2차원이면 채널 축을 붙인다) → (..., 3)"""
    ratio = np.asarray(t, dtype=np.float32)
    if ratio.ndim == 2:
        ratio = ratio[..., None]
    return np.asarray(a, dtype=np.float32) * (1.0 - ratio) + np.asarray(b, dtype=np.float32) * ratio


def orb_layer() -> Image.Image:
    """구슬 본체 — 빛·유리 테두리·속빛"""
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    nx = (xx - CX) / R
    ny = (yy - CY) / R
    radius = np.sqrt(nx * nx + ny * ny)
    nz = np.sqrt(np.clip(1.0 - radius * radius, 0.0, 1.0))

    # 왼쪽 위 앞에서 비추는 빛
    light = np.array([-0.44, -0.52, 0.73], dtype=np.float32)
    light /= np.linalg.norm(light)
    diffuse = np.clip(nx * light[0] + ny * light[1] + nz * light[2], 0.0, 1.0)

    body = mix((230, 78, 0), (255, 132, 10), smoothstep(0.02, 0.55, diffuse))
    body = mix(body, (255, 178, 34), smoothstep(0.50, 0.90, diffuse))
    body = mix(body, (255, 228, 132), smoothstep(0.88, 1.0, diffuse))

    # 구슬 속에서 번지는 따뜻한 빛
    inner = np.exp(-(((nx + 0.05) ** 2 + (ny + 0.10) ** 2) / 0.34))
    body = mix(body, (255, 206, 104), 0.22 * inner)

    # 아래쪽 그늘 (구슬이 둥글게 보이도록)
    body = mix(body, (196, 62, 0), 0.34 * smoothstep(-0.2, 1.0, ny) * smoothstep(0.25, 1.0, radius))

    # 유리 테두리 — 오른쪽 아래 가장자리 안쪽의 반사광
    ring = np.exp(-(((radius - 0.92) / 0.045) ** 2))
    lower_right = smoothstep(-0.35, 0.75, ny * 0.6 + nx * 0.4)
    body = mix(body, (255, 242, 200), 0.42 * ring * lower_right)

    # 테두리는 살짝 어둡게 (유리 두께)
    body = mix(body, (208, 66, 0), 0.62 * smoothstep(0.90, 1.0, radius))

    # 왼쪽 위 하이라이트 — 작고 아주 밝은 점 + 넓게 퍼지는 반사
    hotspot = np.exp(-(((nx + 0.38) ** 2 + (ny + 0.42) ** 2) / 0.010))
    body = mix(body, (255, 255, 248), 0.98 * hotspot)
    broad = np.exp(-(((nx + 0.28) ** 2 + (ny + 0.32) ** 2) / 0.075))
    body = mix(body, (255, 248, 208), 0.20 * broad)

    # 구슬 속 소용돌이 (아주 옅게)
    swirl = np.sin(3.0 * np.arctan2(ny, nx) + 5.5 * radius - 1.0)
    wisp = np.clip(swirl, 0.0, 1.0) * smoothstep(0.2, 0.9, radius) * 0.09
    body = mix(body, (255, 232, 168), wisp)

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


def draw_star(base: Image.Image, cx: float, cy: float, radius: float, rotation: float) -> None:
    """붉은 별 하나 — 그림자 + 입체 색 + 진한 테두리 + 작은 반사"""
    poly = star_polygon(cx, cy, radius, rotation)

    # 별 그림자 (구슬 안쪽에 살짝 떠 보이게)
    shadow = Image.new('RGBA', base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon([(x + radius * 0.10, y + radius * 0.12) for x, y in poly], fill=(120, 26, 0, 190))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius * 0.18)))

    # 별 모양 마스크
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)

    # 별 색 — 왼쪽 위는 밝은 빨강, 오른쪽 아래는 진한 빨강
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    gx = (xx - (cx - radius * 0.35)) / (radius * 1.7)
    gy = (yy - (cy - radius * 0.40)) / (radius * 1.8)
    t = np.clip(np.sqrt(np.clip(gx * gx + gy * gy, 0.0, 4.0)) / 1.15, 0.0, 1.0)
    star_rgb = mix((240, 66, 62), (152, 4, 20), t)
    star_alpha = np.asarray(mask, dtype=np.float32)
    layer = np.dstack([star_rgb, star_alpha]).astype(np.uint8)
    base.alpha_composite(Image.fromarray(layer, 'RGBA'))

    # 진한 테두리
    ImageDraw.Draw(base).line(
        poly + [poly[0]],
        fill=(122, 4, 16, 235),
        width=max(2, int(radius * 0.05)),
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
        fill=(255, 240, 232, 120),
    )
    base.alpha_composite(Image.composite(glint.filter(ImageFilter.GaussianBlur(radius * 0.05)),
                                         Image.new('RGBA', base.size, (0, 0, 0, 0)), mask))


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
        fill=(255, 255, 250, alpha),
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
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # 구슬 바깥의 은은한 빛
    halo = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse(
        [CX - R * 1.04, CY - R * 1.04, CX + R * 1.04, CY + R * 1.04],
        fill=(255, 172, 44, 110),
    )
    base.alpha_composite(halo.filter(ImageFilter.GaussianBlur(R * 0.09)))
    orb = orb_layer()
    # 왼쪽 위 광택 — 유리구슬에 비친 창문 빛 (둥근 호)
    gloss = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).arc(
        [CX - R * 0.74, CY - R * 0.78, CX + R * 0.30, CY + R * 0.26],
        start=150,
        end=258,
        fill=(255, 255, 245, 150),
        width=max(3, int(R * 0.055)),
    )
    gloss = gloss.filter(ImageFilter.GaussianBlur(R * 0.030))
    # 구슬 안쪽만 남긴다
    clip = Image.new('L', (S, S), 0)
    ImageDraw.Draw(clip).ellipse([CX - R * 0.97, CY - R * 0.97, CX + R * 0.97, CY + R * 0.97], fill=255)
    orb.alpha_composite(Image.composite(gloss, Image.new('RGBA', (S, S), (0, 0, 0, 0)), clip))
    base.alpha_composite(orb)

    radius = STAR_RADIUS[stars] * R
    for index, (sx, sy) in enumerate(STAR_LAYOUTS[stars]):
        draw_star(base, CX + sx * R, CY + sy * R, radius, star_rotation(index, stars))

    # 반짝임 — 구슬 위쪽과 오른쪽 아래
    sparkle(base, CX + R * 0.40, CY - R * 0.66, R * 0.19, 225)
    sparkle(base, CX - R * 0.70, CY + R * 0.30, R * 0.11, 170)
    sparkle(base, CX + R * 0.72, CY + R * 0.60, R * 0.08, 150)

    return downscale(base)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for stars in range(1, 8):
        image = make_ball(stars)
        path = os.path.join(OUT_DIR, f'{stars}.png')
        image.save(path, optimize=True)
        print(f'{path}  ({os.path.getsize(path) // 1024} KB)')


if __name__ == '__main__':
    main()
