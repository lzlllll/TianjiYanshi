# -*- coding: utf-8 -*-
"""宅邸建筑贴图的对齐标定。

贴图是 1024 见方的等距立绘，自带一块薄方台。要把它摆到宅邸院的菱形格上，
得知道那块方台在图上占多大、落在哪，本脚本就量这两个数，并写出标定表：

    w  方台菱形宽 ÷ 图宽
    cx 方台菱形中心的横向占比
    cy 方台菱形中心的纵向占比

做法：把图缩到 512 见方，与纸底颜色差超过阈值的是前景；纸底有颗粒，
散点会把边界撑到画布边上，所以只取最大的一块连通区，底座一定连着房身，
是整张图里最大的一片。再取这一片里最宽的一行作菱形的左右角，
最下一行为下角，中心随之定出。

用法：
    python tools/manor-sprite-align.py            量全部，打印表格并写标定表
    python tools/manor-sprite-align.py 亭_江南.jpg  只描这一张，输出核对图
"""
import os
import statistics
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "image_assets", "宅邸建筑贴图")
OUT_TS = os.path.join(ROOT, "src", "data", "map", "manorSprites.ts")

SCALE = 512          # 缩到这个边长再量，误差 ±2 原图像素
TX = 16              # 与纸底的通道差阈值

SHAPES = ["亭", "正房", "厢房", "工坊", "水榭", "高阁", "花园", "水域"]
CULTURES = ["中原", "江南", "苗疆", "西域", "漠北", "日韩"]

# 这几张没画方台底座，量出来的不是底座：水榭_苗疆画的是水中栈台加一块离岸的泥地，
# 最大连通区是水面，取不到菱形。先拿同形制其余几张的中位数顶上，重画贴图后撤掉这条。
NO_BASE = {("水榭", "苗疆")}


def load_mask(path):
    im = Image.open(path).convert("RGB").resize((SCALE, SCALE), Image.LANCZOS)
    px = im.load()
    # 纸底颜色取四边一圈的中位数
    rs, gs, bs = [], [], []
    for i in range(SCALE):
        for x, y in ((i, 0), (i, SCALE - 1), (0, i), (SCALE - 1, i)):
            r, g, b = px[x, y]
            rs.append(r); gs.append(g); bs.append(b)
    bg = (statistics.median(rs), statistics.median(gs), statistics.median(bs))

    mask = bytearray(SCALE * SCALE)
    for y in range(SCALE):
        for x in range(SCALE):
            r, g, b = px[x, y]
            if max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) > TX:
                mask[y * SCALE + x] = 1
    return mask


def largest_component(mask):
    seen = bytearray(SCALE * SCALE)
    best = []
    for start in range(SCALE * SCALE):
        if not mask[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        cells = []
        while stack:
            cur = stack.pop()
            cells.append(cur)
            y, x = divmod(cur, SCALE)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < SCALE and 0 <= ny < SCALE:
                    nxt = ny * SCALE + nx
                    if mask[nxt] and not seen[nxt]:
                        seen[nxt] = 1
                        stack.append(nxt)
        if len(cells) > len(best):
            best = cells
    return best


def load_stats(path):
    cells = largest_component(load_mask(path))
    if not cells:
        return None
    rows = {}
    for cur in cells:
        y, x = divmod(cur, SCALE)
        lo, hi = rows.get(y, (x, x))
        rows[y] = (min(lo, x), max(hi, x))
    ys = sorted(rows)
    top, bottom = ys[0], ys[-1]
    span = bottom - top
    # 底座在最下面，宽处只在下半段找，免得把比底座更宽的屋檐量进来
    lo = top + int(span * 0.55)
    best = None
    for y in range(lo, bottom + 1):
        if y not in rows:
            continue
        l, r = rows[y]
        near = [rows[yy][1] - rows[yy][0] for yy in range(max(lo, y - 2), min(bottom, y + 2) + 1) if yy in rows]
        width = statistics.median(near)
        if best is None or width > best[0]:
            best = (width, y, l, r)
    width, cy, xl, xr = best
    radius = width / 2
    return {
        "top": top,
        "bottom": bottom,
        "width": width,
        "cx": (xl + xr) / 2,
        "cy": cy,
        "k": (bottom - cy) / radius if radius else 0,
        "pixels": len(cells),
    }


def measure_all():
    table = {}
    for shape in SHAPES:
        table[shape] = {}
        for culture in CULTURES:
            name = f"{shape}_{culture}.jpg"
            path = os.path.join(SRC, name)
            s = load_stats(path) if os.path.exists(path) else None
            if not s:
                print(f"缺图或量不出来：{name}")
                continue
            table[shape][culture] = {
                "w": round(s["width"] / SCALE, 4),
                "cx": round(s["cx"] / SCALE, 4),
                "cy": round(s["cy"] / SCALE, 4),
            }
            print(
                f"{name},{s['width'] / SCALE:.4f},{s['cx'] / SCALE:.4f},{s['cy'] / SCALE:.4f},"
                f"k={s['k']:.3f},底边={s['bottom']}"
            )
    # 无底座的几张用同形制中位数顶上；放在量完之后统一处理，免得边量边改
    for shape, culture in NO_BASE:
        if shape not in table or culture not in table[shape]:
            continue
        rest = [a for c, a in table[shape].items() if c != culture]
        if not rest:
            continue
        bad = table[shape][culture]
        table[shape][culture] = {
            "w": round(statistics.median(a["w"] for a in rest), 4),
            "cx": round(statistics.median(a["cx"] for a in rest), 4),
            "cy": round(statistics.median(a["cy"] for a in rest), 4),
        }
        print(f"{shape}_{culture}.jpg 无底座，量得 {bad}，改用同形制中位数 {table[shape][culture]}")
    return table


def write_ts(table):
    lines = [
        "/**",
        " * 宅邸建筑贴图的对齐标定。",
        " *",
        " * 贴图是等距立绘，自带一块薄方台；把它摆到宅邸院的菱形格上，",
        " * 得知道方台在图上占多大、落在哪，这里记的就是这两个数：",
        " * - w：方台菱形宽 ÷ 图宽",
        " * - cx：方台菱形中心的横向占比",
        " * - cy：方台菱形中心的纵向占比",
        " *",
        " * 由 tools/manor-sprite-align.py 量出，勿手改；重画贴图后跑一遍脚本再生成。",
        " */",
        'import { assetUrl } from "@/data/map";',
        'import type { ManorShape } from "@/data/types";',
        "",
        "export interface ManorSpriteAlign {",
        "  /** 方台菱形宽 ÷ 图宽 */",
        "  w: number;",
        "  /** 方台菱形中心的横向占比 */",
        "  cx: number;",
        "  /** 方台菱形中心的纵向占比 */",
        "  cy: number;",
        "}",
        "",
        "/** 形制 → 文化圈 → 对齐点 */",
        "export const MANOR_SPRITE_ALIGN: Record<ManorShape, Record<string, ManorSpriteAlign>> = {",
    ]
    for shape in SHAPES:
        lines.append(f"  {shape}: {{")
        for culture in CULTURES:
            a = table.get(shape, {}).get(culture)
            if not a:
                continue
            lines.append(f"    {culture}: {{ w: {a['w']}, cx: {a['cx']}, cy: {a['cy']} }},")
        lines.append("  },")
    lines += [
        "};",
        "",
        "/**",
        " * 一格菱形上该摆哪张立绘、摆多大。",
        " *",
        " * cellWidth 是格子的菱形对角宽，也就是它在屏幕上的横向宽度；",
        " * 立绘按方台宽度与格宽等比放大，左上角相对格心的偏移由方台中心倒推。",
        " * 认不出地域就退到中原那一套，免得整格空着。",
        " */",
        "export function manorSpriteLayout(shape: ManorShape, culture: string | undefined, cellWidth: number) {",
        "  const byCulture = MANOR_SPRITE_ALIGN[shape];",
        '  const key = culture && byCulture[culture] ? culture : byCulture["中原"] ? "中原" : Object.keys(byCulture)[0];',
        "  const align = byCulture[key];",
        "  const width = cellWidth / align.w;",
        "  return {",
        '    url: assetUrl(`image_assets/宅邸建筑贴图/${shape}_${key}.jpg`),',
        "    align,",
        "    width,",
        "    height: width,",
        "    left: -align.cx * width,",
        "    top: -align.cy * width,",
        "  };",
        "}",
        "",
    ]
    with open(OUT_TS, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("写出标定表:", OUT_TS)


def draw_check(names):
    os.makedirs(os.path.join(ROOT, "tools", "_calib"), exist_ok=True)
    for name in names:
        s = load_stats(os.path.join(SRC, name))
        im = Image.open(os.path.join(SRC, name)).convert("RGB")
        draw = ImageDraw.Draw(im)
        r = s["width"] / 2 * im.width / SCALE
        cx, cy, bottom = s["cx"] * im.width / SCALE, s["cy"] * im.height / SCALE, s["bottom"] * im.height / SCALE
        draw.polygon(
            [(cx, 2 * cy - bottom), (cx + r, cy), (cx, bottom), (cx - r, cy)],
            outline=(220, 30, 30),
            width=3,
        )
        out = os.path.join(ROOT, "tools", "_calib", f"{name}.png")
        im.save(out)
        print(out)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        draw_check(sys.argv[1:])
    else:
        write_ts(measure_all())
