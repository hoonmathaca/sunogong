"""선오공 이미지 생성 — 마스코트·로고 원본에서 앱에 쓰는 모든 이미지를 만든다.

  python3 tools/make_images.py <마스코트_원본> <로고_원본>

원본은 흰 배경 JPEG 이고, 배경만 지워 투명 PNG 로 저장한다.
만들어지는 파일:
  public/images/mascot-full.png      마스코트 전신 (800x800, 투명)
  public/images/mascot-face.png      마스코트 얼굴 (512x512, 투명)
  public/images/hunsu-logo.png       훈수학 로고 (512x512, 투명)
  public/images/hunsu-badge.png      훈수학 원형 배지 (256x256, 작은 자리용)
  public/icons/icon-192.png          192x192
  public/icons/icon-512.png          512x512
  public/icons/icon-maskable-512.png 512x512 (maskable 안전영역 안)
  public/icons/apple-touch-icon.png  180x180
  public/images/og-image.png         1200x630 공유 미리보기
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
BLUE_LINE = (216, 227, 248)
GRAY = (120, 133, 160)
WHITE = (255, 255, 255)


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
    img = Image.fromarray(rgba, 'RGBA')
    return img.crop(img.getbbox())


def fit(img: Image.Image, size: int, pad_ratio: float = 0.02) -> Image.Image:
    """정사각 캔버스 가운데에 비율을 지키며 넣는다."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * (1 - pad_ratio * 2))
    ratio = min(inner / img.width, inner / img.height)
    resized = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def square_crop(img: Image.Image, box, pad_ratio: float = 0.02) -> Image.Image:
    part = img.crop(box)
    side = max(part.width, part.height)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(part, ((side - part.width) // 2, (side - part.height) // 2))
    return canvas


def circle_art(canvas: Image.Image, img: Image.Image, center, radius: int, zoom: float = 1.0) -> None:
    """이미지를 원 안에만 보이도록 잘라 붙인다 (얼굴 배지·앱 아이콘용)."""
    side = int(radius * 2 * zoom)
    ratio = side / img.width if img.width >= img.height else side / img.height
    scaled = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius), fill=255
    )
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    layer.alpha_composite(scaled, (center[0] - scaled.width // 2, center[1] - scaled.height // 2))
    canvas.paste(layer, (0, 0), mask)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit('사용법: python3 tools/make_images.py <마스코트_원본> <로고_원본>')
    mascot_src, logo_src = sys.argv[1], sys.argv[2]

    work_dir = os.path.join(ROOT, '.tmp')
    os.makedirs(work_dir, exist_ok=True)

    mascot = cutout(mascot_src)
    logo = cutout(logo_src)
    mascot.save(os.path.join(work_dir, 'mascot-cut.png'))
    logo.save(os.path.join(work_dir, 'logo-cut.png'))

    images = os.path.join(ROOT, 'public', 'images')
    icons = os.path.join(ROOT, 'public', 'icons')
    os.makedirs(images, exist_ok=True)
    os.makedirs(icons, exist_ok=True)

    # 전신
    full = fit(mascot, 800, 0.015)
    full.save(os.path.join(images, 'mascot-full.png'))

    # 얼굴 — 전신의 머리 부분만 남기고, 왼쪽 아래에 붙은 손(지팡이 쥐)은 지운다
    face_src = mascot.copy()
    pixels = np.array(face_src)
    pixels[455:, :255, 3] = 0
    pixels[495:, :330, 3] = 0
    face_src = Image.fromarray(pixels)
    face_box = (175, 0, 865, 545)
    part = face_src.crop(face_box)
    # 아래쪽은 직선으로 잘린 티가 나지 않게 살짝 부드럽게 지운다
    fp = np.array(part)
    fade = max(1, int(part.height * 0.05))
    for i in range(fade):
        row = part.height - fade + i
        fp[row, :, 3] = (fp[row, :, 3].astype(np.int32) * i // fade).astype(np.uint8)
    part = Image.fromarray(fp)
    side = max(part.width, part.height)
    squared = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    squared.alpha_composite(part, ((side - part.width) // 2, (side - part.height) // 2))
    face = squared
    face_512 = fit(face, 512, 0.01)
    face_512.save(os.path.join(images, 'mascot-face.png'))

    # 훈수학 로고 (전체)
    logo_512 = fit(logo, 512, 0.02)
    logo_512.save(os.path.join(images, 'hunsu-logo.png'))

    # 훈수학 원형 배지 — 로고 위쪽 얼굴만 담아 작은 자리에서도 읽히게
    badge_face = square_crop(logo, (200, 10, 580, 312), 0.0)
    size = 256
    badge = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    d.ellipse((2, 2, size - 3, size - 3), fill=NAVY + (255,))
    d.ellipse((13, 13, size - 14, size - 14), fill=WHITE + (255,))
    circle_art(badge, badge_face, (size // 2, size // 2 + 2), int(size * 0.36), zoom=1.15)
    badge.save(os.path.join(images, 'hunsu-badge.png'))

    # 앱 아이콘 — 연한 하늘색 바탕 + 마스코트 전신
    def icon(size_px: int, content: float) -> Image.Image:
        canvas = Image.new('RGBA', (size_px, size_px), BLUE_SOFT + (255,))
        inner = size_px * content
        ratio = min(inner / mascot.width, inner / mascot.height)
        art = mascot.resize((max(1, round(mascot.width * ratio)), max(1, round(mascot.height * ratio))), Image.LANCZOS)
        canvas.alpha_composite(art, ((size_px - art.width) // 2, (size_px - art.height) // 2))
        return canvas

    icon(512, 0.84).convert('RGB').save(os.path.join(icons, 'icon-512.png'), optimize=True)
    icon(192, 0.84).convert('RGB').save(os.path.join(icons, 'icon-192.png'), optimize=True)
    icon(180, 0.84).convert('RGB').save(os.path.join(icons, 'apple-touch-icon.png'), optimize=True)
    icon(512, 0.66).convert('RGB').save(os.path.join(icons, 'icon-maskable-512.png'), optimize=True)

    # 공유 미리보기 1200x630
    og = Image.new('RGB', (1200, 630), WHITE)
    d = ImageDraw.Draw(og)
    d.ellipse((700, -140, 1420, 640), fill=BLUE_SOFT)
    d.rectangle((0, 612, 1200, 630), fill=NAVY)

    og_mascot = mascot.copy()
    ratio = 470 / og_mascot.height
    og_mascot = og_mascot.resize((round(og_mascot.width * ratio), 470), Image.LANCZOS)
    og.paste(og_mascot, (735, 118), og_mascot)

    d.text((72, 118), '선오공', font=font(120), fill=NAVY)
    d.text((76, 268), '선생님, 오늘도 공부했어요!', font=font(46), fill=BLUE)
    d.text((78, 336), '4자리 코드로 들어와 공부시간과 푼 문제를 기록해요', font=font(27), fill=GRAY)

    og_logo = logo.copy()
    lr = 168 / og_logo.height
    og_logo = og_logo.resize((round(og_logo.width * lr), 168), Image.LANCZOS)
    og.paste(og_logo, (74, 410), og_logo)
    og.save(os.path.join(images, 'og-image.png'), optimize=True)

    print('완료:')
    for path in [
        'public/images/mascot-full.png',
        'public/images/mascot-face.png',
        'public/images/hunsu-logo.png',
        'public/images/hunsu-badge.png',
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
