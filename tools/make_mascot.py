"""선오공 마스코트 이미지 생성 — 마스코트 원본 한 장에서 앱에 쓰는 이미지를 모두 만든다.

  python3 tools/make_mascot.py <마스코트_원본>

원본은 흰 배경 PNG 이고, 배경만 지워 투명 PNG 로 저장한다.
만들어지는 파일:
  public/images/mascot-full.png      마스코트 전신 + 주변 칠성구 (800x800, 투명)
  public/images/mascot-face.png      마스코트 얼굴 (512x512, 투명)
  public/icons/icon-192.png          192x192
  public/icons/icon-512.png          512x512
  public/icons/icon-maskable-512.png 512x512 (maskable 안전영역 안)
  public/icons/apple-touch-icon.png  180x180
  public/images/og-image.png         1200x630 공유 미리보기

훈수학 로고(hunsu-logo·hunsu-badge)는 마스코트와 별개라 건드리지 않는다.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, '.assets_fonts', 'Pretendard-Bold.otf')

NAVY = (18, 41, 107)
BLUE = (29, 74, 155)
BLUE_SOFT = (232, 240, 255)
GRAY = (120, 133, 160)
WHITE = (255, 255, 255)

# 원본 1254×1254 기준 자리 (다른 크기 원본이면 비율로 맞춘다)
BASE = 1254
ART_BOX = (88, 88, 1172, 1172)      # 마스코트 + 주변 칠성구 전체
FACE_BOX = (400, 292, 870, 762)     # 얼굴 (머리카락·안경·입) — 주변 성구·지팡이는 빼고


def cutout(path: str) -> Image.Image:
    """흰 배경을 가장자리부터 지워 투명 PNG 로 만든다 (그림 안의 흰색은 그대로)."""
    bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise SystemExit(f'이미지를 열 수 없어요: {path}')
    h, w = bgr.shape[:2]
    white = (bgr.min(axis=2) >= 235).astype(np.uint8)
    tmp = white.copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for seed in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)]:
        cv2.floodFill(tmp, mask, seed, 2)
    background = tmp == 2
    alpha = np.where(background, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
    rgba = np.dstack([cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), alpha])
    return Image.fromarray(rgba, 'RGBA')


def scaled_box(box, src_w: int, src_h: int):
    """1254 기준 좌표를 원본 크기에 맞춰 바꾼다."""
    fx = src_w / BASE
    fy = src_h / BASE
    x0, y0, x1, y1 = box
    return (round(x0 * fx), round(y0 * fy), round(x1 * fx), round(y1 * fy))


def character_only(img: Image.Image) -> Image.Image:
    """마스코트 본체(구름·지팡이 포함)만 남기고 주변 칠성구·반짝이는 지운다."""
    arr = np.array(img)
    solid = (arr[..., 3] > 20).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(solid, 8)
    if count <= 1:
        return img
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    keep = labels == biggest
    out = arr.copy()
    out[..., 3] = np.where(keep, arr[..., 3], 0)
    out[~keep] = 0                       # 투명한 곳의 RGB 도 지워 경계에 색이 비치지 않게
    return Image.fromarray(out, 'RGBA')


def fit(img: Image.Image, size: int, pad_ratio: float = 0.02) -> Image.Image:
    """정사각 캔버스 가운데에 비율을 지키며 넣는다."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - pad_ratio * 2))
    ratio = min(inner / img.width, inner / img.height)
    resized = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit('사용법: python3 tools/make_mascot.py <마스코트_원본>')
    mascot_src = sys.argv[1]

    work_dir = os.path.join(ROOT, '.tmp')
    os.makedirs(work_dir, exist_ok=True)

    full = cutout(mascot_src)
    art = full.crop(full.getbbox())          # 흰 여백만 정리 (칠성구 포함)
    art.save(os.path.join(work_dir, 'mascot-cut.png'))

    images = os.path.join(ROOT, 'public', 'images')
    icons = os.path.join(ROOT, 'public', 'icons')
    os.makedirs(images, exist_ok=True)
    os.makedirs(icons, exist_ok=True)

    # 전신 — 주변 칠성구까지 함께 (앱의 대표 그림)
    art_pad = art.copy()
    side = max(art_pad.width, art_pad.height)
    squared_art = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    squared_art.alpha_composite(art_pad, ((side - art_pad.width) // 2, (side - art_pad.height) // 2))
    fit(squared_art, 800, 0.012).save(os.path.join(images, 'mascot-full.png'))

    # 얼굴 — 머리 부분만. 아래쪽은 직선으로 잘린 티가 나지 않게 살짝 부드럽게 지운다
    face_box = scaled_box(FACE_BOX, full.width, full.height)
    part = character_only(full).crop(face_box)
    fp = np.array(part)
    fade = max(1, int(part.height * 0.10))
    for i in range(fade):
        row = part.height - fade + i
        fp[row, :, 3] = (fp[row, :, 3].astype(np.int32) * i // fade).astype(np.uint8)
    part = Image.fromarray(fp)
    side = max(part.width, part.height)
    squared_face = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    squared_face.alpha_composite(part, ((side - part.width) // 2, (side - part.height) // 2))
    fit(squared_face, 512, 0.01).save(os.path.join(images, 'mascot-face.png'))

    # 앱 아이콘 — 연한 하늘색 바탕 + 마스코트
    def icon(size_px: int, content: float) -> Image.Image:
        canvas = Image.new('RGBA', (size_px, size_px), BLUE_SOFT + (255,))
        inner = size_px * content
        ratio = min(inner / art.width, inner / art.height)
        resized = art.resize((max(1, round(art.width * ratio)), max(1, round(art.height * ratio))), Image.LANCZOS)
        canvas.alpha_composite(resized, ((size_px - resized.width) // 2, (size_px - resized.height) // 2))
        return canvas

    icon(512, 0.88).convert('RGB').save(os.path.join(icons, 'icon-512.png'), optimize=True)
    icon(192, 0.88).convert('RGB').save(os.path.join(icons, 'icon-192.png'), optimize=True)
    icon(180, 0.88).convert('RGB').save(os.path.join(icons, 'apple-touch-icon.png'), optimize=True)
    icon(512, 0.70).convert('RGB').save(os.path.join(icons, 'icon-maskable-512.png'), optimize=True)

    # 공유 미리보기 1200x630
    og = Image.new('RGB', (1200, 630), WHITE)
    d = ImageDraw.Draw(og)
    d.ellipse((700, -140, 1420, 640), fill=BLUE_SOFT)
    d.rectangle((0, 612, 1200, 630), fill=NAVY)

    og_mascot = art.copy()
    ratio = 462 / og_mascot.height
    og_mascot = og_mascot.resize((round(og_mascot.width * ratio), 462), Image.LANCZOS)
    og.paste(og_mascot, (700, 126), og_mascot)

    d.text((72, 118), '선오공', font=font(120), fill=NAVY)
    d.text((76, 268), '선생님, 오늘도 공부했어요!', font=font(46), fill=BLUE)
    d.text((78, 336), '4자리 코드로 들어와 공부시간과 푼 문제를 기록해요', font=font(27), fill=GRAY)

    badge = Image.open(os.path.join(images, 'hunsu-badge.png')).convert('RGBA')
    br = 128 / badge.height
    badge = badge.resize((round(badge.width * br), 128), Image.LANCZOS)
    og.paste(badge, (78, 418), badge)
    d.text((222, 452), '훈수학학원', font=font(40), fill=NAVY)
    og.save(os.path.join(images, 'og-image.png'), optimize=True)

    print('완료:')
    for path in [
        'public/images/mascot-full.png',
        'public/images/mascot-face.png',
        'public/images/og-image.png',
        'public/icons/icon-192.png',
        'public/icons/icon-512.png',
        'public/icons/icon-maskable-512.png',
        'public/icons/apple-touch-icon.png',
    ]:
        p = os.path.join(ROOT, path)
        with Image.open(p) as im:
            print(f'  {path}  {im.size[0]}x{im.size[1]}')


if __name__ == '__main__':
    main()
