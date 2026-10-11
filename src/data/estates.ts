/**
 * 地产：玩家名下的屋舍。
 *
 * 屋舍可歇息、修炼、演武、储物，进益按「基础效率 × 完好度」折算。
 * 基础效率生成时掷定，不可增，封顶 0.7；完好度随日子缓慢下降，
 * 掉到 0 便住不得，须花时间与灵石重建。报价由效率折算，购入时可讲价。
 */

import type { Estate, EstateOffer } from "@/data/types";

/** 每日掉的完好度 */
export const ESTATE_DECAY_PER_DAY = 1;
/** 维护：每补 10 点完好度的价钱，下品灵石 */
export const MAINTAIN_COST_PER_10 = 20;
/** 重建：完好度为 0 后，花这些日子复原 */
export const REBUILD_DAYS = 3;
/** 重建后回到多少完好度 */
export const REBUILD_CONDITION = 60;
/** 讲价的门槛，按本事等级加骰点判 */
export const HAGGLE_DC = 13;

/** 出租时可选的一处租客；只作议租的由头，真租给谁、月租几何由叙事定 */
export const RENT_TENANT_KINDS = ["寻常人家", "商旅行客", "清修之人", "同门故旧"] as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const round10 = (v: number) => Math.round(v / 10) * 10;

/** 生成一处屋舍的基础效率：0.35 到 0.70，步进 0.05，封顶 0.7 */
export function rollBaseEfficiency(): number {
  const step = 7 + Math.floor(Math.random() * 8); // 7..14
  return round2(clamp(step / 20, 0.35, 0.7));
}

/** 由基础效率定报价 */
export function estatePrice(baseEfficiency: number): number {
  return round10(200 + clamp(Number(baseEfficiency) || 0, 0, 0.7) * 2600);
}

/** 按完好度折算实际效率 */
export function estateEfficiency(e: Pick<Estate, "baseEfficiency" | "condition">): number {
  return round2(clamp(Number(e.baseEfficiency) || 0, 0, 0.7) * (clamp(Number(e.condition) || 0, 0, 100) / 100));
}

/** 把完好度维护到满要多少灵石 */
export function maintainCost(condition: number): number {
  const missing = Math.max(0, 100 - clamp(Number(condition) || 0, 0, 100));
  return round10((missing / 10) * MAINTAIN_COST_PER_10);
}

/** 重建的价钱 */
export function rebuildCost(e: Pick<Estate, "baseEfficiency">): number {
  return round10(120 + clamp(Number(e.baseEfficiency) || 0, 0, 0.7) * 800);
}

/** 出手能退回多少灵石：按完好度折价 */
export function sellRefund(e: Pick<Estate, "price" | "condition">): number {
  const ratio = 0.4 + 0.4 * (clamp(Number(e.condition) || 0, 0, 100) / 100);
  return round10((Number(e.price) || 0) * ratio);
}

/** 讲价：一次判定，成了按差距给折扣，失手便照原价 */
export function haggleDiscount(roll: number, level: number, dc = HAGGLE_DC): number {
  const margin = roll + level - dc;
  if (margin < 0) return 0;
  if (margin >= 8) return 0.3;
  if (margin >= 4) return 0.2;
  return 0.1;
}

const ESTATE_NAMES: Record<string, string[]> = {
  中原: ["青瓦小院", "槐荫别院", "黄土小院", "旧宅", "四合小院"],
  江南: ["临水小筑", "枕河小院", "荷风别院", "画舫精舍", "菱歌小院"],
  苗疆: ["吊脚小楼", "竹楼小院", "山寨木屋", "藤荫小院", "铜鼓别院"],
  西域: ["土坯小院", "井台别院", "葡萄架小院", "胡杨小院", "沙柳精舍"],
  漠北: ["毡房小院", "火塘小屋", "风雪别院", "皮帐小筑", "热泉小院"],
  日韩: ["町屋小院", "松风精舍", "汤町小筑", "樱枝小院", "石灯居"],
};

/** 按文化圈取一处屋舍的名号 */
export function rollEstateName(culture?: string): string {
  const pool = (culture && ESTATE_NAMES[culture]) || ESTATE_NAMES.中原;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 掷一处待售屋舍：名号、基础效率与报价 */
export function rollEstateOffer(input: {
  place: string;
  culture?: string;
  cityId?: string;
  districtId?: number;
  villageKey?: string;
}): EstateOffer {
  const baseEfficiency = rollBaseEfficiency();
  return {
    id: `estate-offer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    name: rollEstateName(input.culture),
    place: input.place,
    cityId: input.cityId,
    districtId: input.districtId,
    villageKey: input.villageKey,
    baseEfficiency,
    price: estatePrice(baseEfficiency),
  };
}
