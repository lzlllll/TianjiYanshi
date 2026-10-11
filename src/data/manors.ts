/**
 * 宅邸。
 *
 * 一处宅邸是 7×7 的空地：先花灵石把「形体」盖起来（亭、正房、工坊……），
 * 盖好之后再进屋给它派一个「功能」（聚灵、丹房、演武……），
 * 有了功能才谈得上加成。建筑可升级、拆除、改建，但地块不能挪。
 */

import { MANOR_GRID, type ManorCell, type ManorFunction, type ManorPlot, type ManorShape } from "@/data/types";

export { MANOR_GRID };

/** 各样建筑形体的造价，下品灵石 */
export const SHAPE_COST: Record<ManorShape, number> = {
  亭: 120,
  正房: 400,
  厢房: 260,
  工坊: 320,
  水榭: 300,
  高阁: 520,
  花园: 180,
  水域: 150,
};

/** 一处宅地（7×7 空地）的价钱 */
export const MANOR_PLOT_PRICE = 1200;

/** 第 level 级升到 level+1 的价钱 */
export function upgradeCost(shape: ManorShape, level: number): number {
  return Math.round(SHAPE_COST[shape] * (0.5 + Math.max(1, level) * 0.4));
}

/** 拆除退回几成 */
export function demolishRefund(shape: ManorShape, level: number): number {
  const spent = SHAPE_COST[shape] + Math.max(0, level - 1) * SHAPE_COST[shape] * 0.6;
  return Math.round(spent * 0.4);
}

/** 改建：把一处建筑换成另一形体，补差价 */
export function convertCost(from: ManorShape, to: ManorShape, level: number): number {
  return Math.max(20, Math.round((SHAPE_COST[to] - SHAPE_COST[from]) * 0.6 + SHAPE_COST[to] * 0.2 + Math.max(1, level) * 10));
}

/** 各类功能的加成：每级的效率增量与说法 */
export const FUNCTION_INFO: Record<ManorFunction, { note: string; perLevel: number }> = {
  聚灵: { note: "修炼效率", perLevel: 0.06 },
  丹房: { note: "炼丹成效", perLevel: 0.05 },
  锻坊: { note: "炼器成效", perLevel: 0.05 },
  经阁: { note: "参悟熟练", perLevel: 0.05 },
  演武: { note: "练功进度", perLevel: 0.05 },
  仓廪: { note: "储物格数", perLevel: 1 },
  客舍: { note: "歇息回复", perLevel: 0.05 },
  园圃: { note: "灵田产出", perLevel: 0.05 },
};

export const MANOR_FUNCTIONS: ManorFunction[] = ["聚灵", "丹房", "锻坊", "经阁", "演武", "仓廪", "客舍", "园圃"];
export const MANOR_SHAPES: ManorShape[] = ["亭", "正房", "厢房", "工坊", "水榭", "高阁", "花园", "水域"];

/**
 * 各功能只许挂在某些形体上：丹房锻坊非工坊不可，园圃要花园或水域，
 * 聚灵要临水的亭、高阁或水面，起居类落在正房厢房。
 */
export const FUNCTION_SHAPES: Record<ManorFunction, ManorShape[]> = {
  聚灵: ["亭", "高阁", "水域"],
  丹房: ["工坊"],
  锻坊: ["工坊"],
  经阁: ["高阁", "正房"],
  演武: ["花园", "亭"],
  仓廪: ["厢房", "正房"],
  客舍: ["厢房", "正房"],
  园圃: ["花园", "水域"],
};

/** 这一处形体上能不能配这个功能 */
export function manorFunctionAllowed(shape: ManorShape, fn: ManorFunction): boolean {
  return (FUNCTION_SHAPES[fn] ?? []).includes(shape);
}

/** 歇息一日回复的最大比例；客舍加成再抬一抬，封顶全满 */
export const REST_BASE_RATIO = 0.6;
export function restRatio(bonus: number): number {
  return Math.min(1, REST_BASE_RATIO * (1 + Math.max(0, bonus)));
}

/** 这一日落在哪个季度，记「年-Q季」 */
export function quarterKey(time: { year: number; month: number }): string {
  return `${time.year}-Q${Math.floor((Math.max(1, time.month) - 1) / 3) + 1}`;
}

/** 中原、漠北、西域入冬便不生：冬月（12、1、2）不产 */
export function cropBlockedByWinter(culture: string | undefined, month: number): boolean {
  const cold = culture === "中原" || culture === "漠北" || culture === "西域";
  return !!cold && (month === 12 || month === 1 || month === 2);
}

/** 一季的收获量：底子一份，园圃加成再添一成 */
export function cropYield(bonus: number): number {
  return Math.max(1, Math.round(1 * (1 + Math.max(0, bonus))));
}

/** 名下各处宅邸里，某一项功能的加成合计 */
export function manorBonusOf(plots: ManorPlot[] | undefined, fn: ManorFunction): number {
  let total = 0;
  for (const p of plots ?? []) {
    for (const c of p.cells ?? []) {
      if (c?.fn === fn) total += FUNCTION_INFO[fn].perLevel * Math.max(1, c.level);
    }
  }
  return Math.round(total * 100) / 100;
}

/** 一处宅邸的功能加成汇总 */
export function manorBonuses(cells: (ManorCell | null)[]): { fn: ManorFunction; total: number }[] {
  const acc = new Map<ManorFunction, number>();
  for (const c of cells) {
    if (!c?.fn) continue;
    const per = FUNCTION_INFO[c.fn]?.perLevel ?? 0;
    acc.set(c.fn, (acc.get(c.fn) ?? 0) + per * Math.max(1, c.level));
  }
  return [...acc.entries()].map(([fn, total]) => ({ fn, total: Math.round(total * 100) / 100 }));
}

/** 新建一处宅地：7×7 全空 */
export function emptyPlot(input: { place: string; cityId?: string; districtId?: number }): ManorPlot {
  return {
    id: `plot-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    place: input.place,
    cityId: input.cityId,
    districtId: input.districtId,
    cells: Array.from({ length: MANOR_GRID * MANOR_GRID }, () => null),
  };
}
