"""무지개 신룡 아이콘 만들기 (개발용).

    python3 tools/make_shenron.py <신룡_원본>

칠성구를 합쳤을 때 소환되는 무지개 아기 신룡의 흰 배경을 지워
public/dragonballs/shenron.png (512×512, 투명) 를 만든다.
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_mascot import cutout, fit  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'dragonballs', 'shenron.png')


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit('사용법: python3 tools/make_shenron.py <신룡_원본>')
    art = cutout(sys.argv[1])
    art = art.crop(art.getbbox())
    fit(art, 512, 0.02).save(OUT, optimize=True)
    with Image.open(OUT) as im:
        print(f'{OUT}  {im.size[0]}x{im.size[1]}  ({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
