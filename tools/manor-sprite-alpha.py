# -*- coding: utf-8 -*-
"""给宅邸建筑贴图去纸底，出透明底的 PNG。

贴图是米白纸底上画的一张方图，直接铺到院面会在邻格留下暖色方块。
做法：与纸底相近、且能从画布边缘连过去的像素一概抠掉。
只认连通到边缘的那一片，屋里浅色的墙、窗纸被墨线围着，走不进去，不会被误伤。

用法：
    python tools/manor-sprite-alpha.py            出全部 48 张
    python tools/manor-sprite-alpha.py --check    顺带出一张品红底对照图
"""
import os
import statistics
import sys
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "image_assets", "宅邸建筑贴图")
OUT = os.path.join(ROOT, "image_assets", "宅邸建筑贴图透明")

SIZE = 512          # 出图边长：院面上立绘最大也就一百多像素，512 足够
THRESH = 55         # 与纸底的三通道差之和，超过就算画上的东西
FEATHER = 0.7       # 边缘羽化半径，压掉锯齿


def cut_paper(path):
    im = Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    px = im.load()

    rs, gs, bs = [], [], []
    for i in range(SIZE):
        for x, y in ((i, 0), (i, SIZE - 1), (0, i), (SIZE - 1, i)):
            r, g, b = px[x, y]
            rs.append(r); gs.append(g); bs.append(b)
    paper = (statistics.median(rs), statistics.median(gs), statistics.median(bs))

    def paper_like(x, y):
        r, g, b = px[x, y]
        return abs(r - paper[0]) + abs(g - paper[1]) + abs(b - paper[2]) <= THRESH

    # 从四边起，把与纸底相近又连成一片的像素收成背景
    bg = bytearray(SIZE * SIZE)
    stack = []
    for i in range(SIZE):
        for x, y in ((i, 0), (i, SIZE - 1), (0, i), (SIZE - 1, i)):
            idx = y * SIZE + x
            if not bg[idx] and paper_like(x, y):
                bg[idx] = 1
                stack.append(idx)
    while stack:
        cur = stack.pop()
        y, x = divmod(cur, SIZE)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < SIZE and 0 <= ny < SIZE:
                nxt = ny * SIZE + nx
                if not bg[nxt] and paper_like(nx, ny):
                    bg[nxt] = 1
                    stack.append(nxt)

    alpha = Image.frombytes("L", (SIZE, SIZE), bytes(0 if v else 255 for v in bg))
    out = im.copy()
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(FEATHER)))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    names = sorted(f for f in os.listdir(SRC) if f.lower().endswith(".jpg"))
    for name in names:
        cut_paper(os.path.join(SRC, name)).save(
            os.path.join(OUT, os.path.splitext(name)[0] + ".png"), optimize=True
        )
        print("去底:", name)

    if "--check" in sys.argv:
        # 品红底拼一张对照图：纸底没抠净的地方一眼能看出来
        cols, tile = 8, 256
        rows = (len(names) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tile, rows * tile), (236, 214, 232))
        for i, name in enumerate(names):
            one = Image.open(os.path.join(OUT, os.path.splitext(name)[0] + ".png")).convert("RGBA").resize((tile, tile), Image.LANCZOS)
            sheet.paste(one, ((i % cols) * tile, (i // cols) * tile), one)
        path = os.path.join(ROOT, "tools", "_alpha_check.png")
        sheet.save(path)
        print("对照图:", path)


if __name__ == "__main__":
    main()
