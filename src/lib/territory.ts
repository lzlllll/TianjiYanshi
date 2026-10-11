/**
 * 势力范围图：按「离哪一处势力最近，就归哪一处」逐格上色——这就是一张栅格化的沃洛诺伊图。
 *
 * 底图上的蓝色水系要避开：把底图缩到一张小画布上逐点取样，够蓝的格子留白不铺色。
 * 取样走 canvas，若底图跨域取不到像素，就退回不判水的画法，领地照铺。
 */

/** 一处势力的坐标与所属颜色 */
export interface TerritorySeed {
  x: number;
  y: number;
  /** #rrggbb */
  color: string;
  label: string;
  /** 是不是本门 */
  mine?: boolean;
}

/** 一撮可分辨的颜色，按势力名目定死取一支 */
export const FACTION_PALETTE = [
  "#c2543a",
  "#3f7d63",
  "#4a6fa5",
  "#8a6a34",
  "#7a4a7a",
  "#2f7d8a",
  "#a04a2a",
  "#5a7a3a",
  "#8a4a5a",
  "#4a5a8a",
];

/** 本门另用一色，好与旁家分得开 */
export const MINE_FACTION_COLOR = "#c9a24a";

/** 照名目取一支固定的颜色；本门另给一色 */
export function factionColor(ownerId: string, mine?: boolean): string {
  if (mine) return MINE_FACTION_COLOR;
  const seed = [...String(ownerId)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return FACTION_PALETTE[seed % FACTION_PALETTE.length];
}

/** 够不够蓝：底图上水系的那一抹色 */
export function isWaterPixel(r: number, g: number, b: number): boolean {
  return b >= 92 && b - r >= 28 && b - g >= 20;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 把势力范围画成一张与场景同比例的图，返回 data URL。
 * 逐格判定：水里的格子留白，离所有势力都太远的荒地也留白。
 */
export function renderTerritoryOverlay(args: {
  img: HTMLImageElement;
  width: number;
  height: number;
  seeds: TerritorySeed[];
  /** 每格多少像素，越小越细；默认 4 */
  step?: number;
  /** 离势力超过这么远便不算它的地界，默认 240 */
  maxRadius?: number;
}): string {
  const { img, seeds } = args;
  const width = Math.max(1, Math.round(args.width));
  const height = Math.max(1, Math.round(args.height));
  if (!img || seeds.length === 0) throw new Error("没有可画的势力");
  const step = Math.max(2, Math.round(args.step ?? 4));
  const maxRadius = Math.max(40, Math.round(args.maxRadius ?? 240));
  const gw = Math.ceil(width / step);
  const gh = Math.ceil(height / step);

  // ---- 一、取样判水 ----
  const water = new Uint8Array(gw * gh);
  let useWater = false;
  try {
    const sample = document.createElement("canvas");
    sample.width = gw;
    sample.height = gh;
    const sctx = sample.getContext("2d");
    if (sctx) {
      sctx.drawImage(img, 0, 0, gw, gh);
      const src = sctx.getImageData(0, 0, gw, gh).data;
      let wet = 0;
      for (let i = 0; i < gw * gh; i++) {
        const r = src[i * 4];
        const g = src[i * 4 + 1];
        const b = src[i * 4 + 2];
        if (isWaterPixel(r, g, b)) {
          water[i] = 1;
          wet++;
        }
      }
      // 占比离谱便不当真，免得整张图被判成水、或是滴水不见
      const frac = wet / (gw * gh);
      useWater = frac > 0.02 && frac < 0.6;
    }
  } catch {
    // 跨域取不到像素，就退回不判水的画法
    useWater = false;
  }

  // ---- 二、逐格找最近的势力 ----
  const owner = new Int16Array(gw * gh).fill(-1);
  const maxR2 = maxRadius * maxRadius;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = gy * gw + gx;
      if (useWater && water[idx]) continue;
      const x = gx * step + step / 2;
      const y = gy * step + step / 2;
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (let s = 0; s < seeds.length; s++) {
        const dx = seeds[s].x - x;
        const dy = seeds[s].y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best >= 0 && bestD <= maxR2) owner[idx] = best;
    }
  }

  // ---- 三、上色，边界压深一档 ----
  const rgb = seeds.map((s) => hexToRgb(s.color));
  const out = document.createElement("canvas");
  out.width = gw;
  out.height = gh;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("画布不可用");
  const im = octx.createImageData(gw, gh);
  const data = im.data;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = gy * gw + gx;
      const o = owner[idx];
      if (o < 0) continue;
      const nb = [
        gx > 0 ? owner[idx - 1] : -1,
        gx < gw - 1 ? owner[idx + 1] : -1,
        gy > 0 ? owner[idx - gw] : -1,
        gy < gh - 1 ? owner[idx + gw] : -1,
      ];
      const edge = nb.some((n) => n !== o);
      const [r, g, b] = rgb[o];
      const k = edge ? 0.5 : 1;
      const at = idx * 4;
      data[at] = Math.round(r * k);
      data[at + 1] = Math.round(g * k);
      data[at + 2] = Math.round(b * k);
      data[at + 3] = edge ? 224 : 132;
    }
  }
  octx.putImageData(im, 0, 0);
  return out.toDataURL("image/png");
}
