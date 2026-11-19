"""선오공 자리표시자 이미지 생성.

사용자가 실제 이미지(마스코트 전신/얼굴, 훈수학 로고)를 보내면
같은 파일 이름으로 덮어쓰기만 하면 앱에 바로 반영됩니다.

  python3 tools/make_placeholders.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

NAVY = (18, 41, 107, 255)
NAVY_SOFT = (34, 64, 127, 255)
BLUE = (29, 74, 155, 255)
BLUE_LIGHT = (216, 227, 248, 255)
BLUE_PALE = (240, 245, 255, 255)
WHITE = (255, 255, 255, 255)
CHEEK = (255, 196, 196, 120)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATH = os.path.join(ROOT, '.assets_fonts', 'Pretendard-Bold.otf')


def font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()


def draw_mascot(img_size, body_only=False, pad=0.04):
    """네이비 마스코트(전신). 4배 확대 후 축소해 부드럽게."""
    S = 4
    w = h = img_size * S
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    p = pad * w
    left, right = p, w - p
    top = p + (0.0 if not body_only else 0.08 * h)
    bottom = h - p

    # 그림자
    d.ellipse([left + 0.18 * w, bottom - 0.05 * h, right - 0.18 * w, bottom + 0.01 * h], fill=(18, 41, 107, 40))

    # 몸통(둥근 사각형) + 머리(원) 를 합친 블롭
    d.rounded_rectangle(
        [left + 0.10 * w, top + 0.26 * h, right - 0.10 * w, bottom - 0.10 * h],
        radius=0.34 * w,
        fill=NAVY,
    )
    d.ellipse([left + 0.06 * w, top + 0.02 * h, right - 0.06 * w, top + 0.62 * h], fill=NAVY)

    # 더듬이
    d.line([w / 2, top + 0.03 * h, w / 2, top - 0.06 * h], fill=NAVY, width=int(0.018 * w))
    d.ellipse([w / 2 - 0.055 * w, top - 0.13 * h, w / 2 + 0.055 * w, top - 0.02 * h], fill=BLUE)

    # 배(밝은 부분)
    d.ellipse([left + 0.26 * w, top + 0.42 * h, right - 0.26 * w, bottom - 0.16 * h], fill=NAVY_SOFT)

    # 얼굴: 흰 얼굴판
    d.ellipse([left + 0.20 * w, top + 0.14 * h, right - 0.20 * w, top + 0.52 * h], fill=WHITE)

    eye_y = top + 0.30 * h
    eye_r = 0.052 * w
    for cx in (w / 2 - 0.11 * w, w / 2 + 0.11 * w):
        d.ellipse([cx - eye_r, eye_y - eye_r * 1.15, cx + eye_r, eye_y + eye_r * 1.15], fill=NAVY)
        d.ellipse([cx - eye_r * 0.34, eye_y - eye_r * 0.75, cx + eye_r * 0.12, eye_y - eye_r * 0.2], fill=WHITE)

    # 웃는 입
    d.arc(
        [w / 2 - 0.075 * w, eye_y + 0.01 * h, w / 2 + 0.075 * w, eye_y + 0.13 * h],
        start=15,
        end=165,
        fill=NAVY,
        width=int(0.016 * w),
    )

    # 볼
    for cx in (w / 2 - 0.20 * w, w / 2 + 0.20 * w):
        d.ellipse([cx - 0.045 * w, eye_y + 0.03 * h, cx + 0.045 * w, eye_y + 0.10 * h], fill=CHEEK)

    # 발
    d.ellipse([w / 2 - 0.22 * w, bottom - 0.16 * h, w / 2 - 0.02 * w, bottom - 0.01 * h], fill=NAVY_SOFT)
    d.ellipse([w / 2 + 0.02 * w, bottom - 0.16 * h, w / 2 + 0.22 * w, bottom - 0.01 * h], fill=NAVY_SOFT)

    return img.resize((img_size, img_size), Image.LANCZOS)


def draw_logo_mark(size):
    """훈수학 원형 로고 자리표시자: 남색 링 + 펼친 책."""
    S = 4
    n = size * S
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.ellipse([0, 0, n - 1, n - 1], fill=NAVY)
    d.ellipse([0.07 * n, 0.07 * n, 0.93 * n, 0.93 * n], fill=WHITE)
    d.ellipse([0.12 * n, 0.12 * n, 0.88 * n, 0.88 * n], fill=BLUE_PALE)

    # 펼친 책
    cx, cy = n / 2, n / 2
    d.polygon(
        [(cx - 0.30 * n, cy - 0.06 * n), (cx, cy - 0.14 * n), (cx, cy + 0.16 * n), (cx - 0.30 * n, cy + 0.10 * n)],
        fill=BLUE,
    )
    d.polygon(
        [(cx + 0.30 * n, cy - 0.06 * n), (cx, cy - 0.14 * n), (cx, cy + 0.16 * n), (cx + 0.30 * n, cy + 0.10 * n)],
        fill=NAVY,
    )
    d.line([(cx, cy - 0.14 * n), (cx, cy + 0.16 * n)], fill=WHITE, width=int(0.012 * n))

    return img.resize((size, size), Image.LANCZOS)


def draw_icon(size, padding_ratio=0.18):
    """홈 화면 아이콘: 남색 바탕 + 흰 마스코트 얼굴."""
    S = 3
    n = size * S
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(0.22 * n), fill=NAVY)

    inner = int(n * (1 - padding_ratio * 2))
    face = draw_mascot(inner, body_only=True, pad=0.0)
    img.alpha_composite(face, (int((n - inner) / 2), int((n - inner) / 2) + int(0.02 * n)))
    return img.resize((size, size), Image.LANCZOS)


def draw_og(width=1200, height=630):
    img = Image.new('RGBA', (width, height), WHITE)
    d = ImageDraw.Draw(img)

    # 배경 장식
    d.ellipse([width * 0.58, -height * 0.35, width * 1.25, height * 0.95], fill=BLUE_PALE)
    d.rounded_rectangle([0, height - 14, width, height], fill=NAVY)

    mascot = draw_mascot(int(height * 0.82))
    img.alpha_composite(mascot, (int(width * 0.62), int(height * 0.10)))

    title_font = font(150)
    sub_font = font(46)
    small_font = font(34)

    d.text((80, 150), '선오공', font=title_font, fill=NAVY)
    d.text((84, 320), '선생님, 오늘도 공부했어요!', font=sub_font, fill=BLUE)
    d.text((84, 400), '4자리 코드로 들어와 공부시간과 푼 문제를 기록해요', font=small_font, fill=(120, 136, 170, 255))
    d.text((84, 510), '훈수학학원', font=small_font, fill=NAVY)

    return img.convert('RGB')


def main():
    images_dir = os.path.join(ROOT, 'public', 'images')
    icons_dir = os.path.join(ROOT, 'public', 'icons')
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(icons_dir, exist_ok=True)

    draw_mascot(800).save(os.path.join(images_dir, 'mascot-full.png'))
    draw_mascot(512, body_only=True, pad=0.02).save(os.path.join(images_dir, 'mascot-face.png'))
    draw_logo_mark(256).save(os.path.join(images_dir, 'hunsu-logo.png'))

    draw_icon(192).save(os.path.join(icons_dir, 'icon-192.png'))
    draw_icon(512).save(os.path.join(icons_dir, 'icon-512.png'))
    draw_icon(180, padding_ratio=0.12).save(os.path.join(icons_dir, 'apple-touch-icon.png'))

    draw_og().save(os.path.join(images_dir, 'og-image.png'))

    for path in [
        'public/images/mascot-full.png',
        'public/images/mascot-face.png',
        'public/images/hunsu-logo.png',
        'public/images/og-image.png',
        'public/icons/icon-192.png',
        'public/icons/icon-512.png',
        'public/icons/apple-touch-icon.png',
    ]:
        full = os.path.join(ROOT, path)
        print(f'{path}  {os.path.getsize(full)} bytes')


if __name__ == '__main__':
    main()
