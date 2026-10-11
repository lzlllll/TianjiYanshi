/**
 * 玩家在坊市里自设的铺面。
 *
 * 与同名相近的 src/data/shops.ts（坊市里掷出来的那些 NPC 铺子）各管一头：
 * 这里管的是玩家自己盘下、自己经营的门面。盘店费按文化圈定，投入的本钱进资金池；
 * 货物、设施与月收支由「经营」面板里以文字与 AI 往来改动。月收支按月结算，
 * 进出都走资金池；资金池不够维持开支连欠三月，铺子便被债主收走。
 */

import type { PlayerShop, ShopFacility, ShopGood, ShopKind } from "@/data/types";

/** 连欠三月便被债主收走 */
export const SHOP_ARREARS_LIMIT = 3;

/** 盘店费，按文化圈定；认不出的文化背景按中原的一半上下 */
const LEASE_BY_CULTURE: Record<string, number> = {
  中原: 800,
  江南: 900,
  苗疆: 500,
  西域: 600,
  漠北: 450,
  日韩: 700,
};

export function shopLeaseCost(culture?: string): number {
  return (culture && LEASE_BY_CULTURE[culture]) || 600;
}

/** 玩家开铺时可选的营生 */
export const PLAYER_SHOP_KINDS: ShopKind[] = [
  "杂货铺",
  "丹药铺/医馆",
  "符箓铺",
  "炼器坊",
  "旧货铺",
  "书铺",
  "乐器坊",
  "灵兽栏",
  "宝物阁",
  "茶棚",
  "客栈",
  "瓦舍",
];

/** 玩家开口说营生时可随手挑的几个说法 */
export const SHOP_SETUP_TYPE_SUGGESTS = [
  "酒楼",
  "客栈",
  "瓦舍",
  "药铺",
  "杂货铺",
  "兵刃铺",
  "符箓铺",
  "书肆",
  "茶肆",
  "当铺",
];

/** 货架上最多摆几样货 */
export const SHOP_GOODS_MAX = 12;
/** 铺子里最多置几处设施 */
export const SHOP_FACILITIES_MAX = 8;
/** 月收支的上限，免得叙事随手给出个离谱的数 */
export const SHOP_MONEY_MAX = 100000;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 把 AI 给的货物理一理：名号去空、单价与存货夹在合理区间 */
export function clampShopGoods(list: unknown): ShopGood[] {
  if (!Array.isArray(list)) return [];
  const out: ShopGood[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = String((raw as any).name ?? "").trim().slice(0, 20);
    if (!name) continue;
    out.push({
      name,
      price: clamp(Math.round(Number((raw as any).price) || 0), 0, SHOP_MONEY_MAX),
      stock: clamp(Math.round(Number((raw as any).stock) || 0), 0, 9999),
      desc: String((raw as any).desc ?? "").trim().slice(0, 60) || undefined,
    });
    if (out.length >= SHOP_GOODS_MAX) break;
  }
  return out;
}

/** 把 AI 给的设施理一理：名号去空、月耗夹在合理区间 */
export function clampShopFacilities(list: unknown): ShopFacility[] {
  if (!Array.isArray(list)) return [];
  const out: ShopFacility[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = String((raw as any).name ?? "").trim().slice(0, 16);
    if (!name) continue;
    out.push({
      name,
      upkeep: clamp(Math.round(Number((raw as any).upkeep) || 0), 0, SHOP_MONEY_MAX),
      effect: String((raw as any).effect ?? "").trim().slice(0, 60) || undefined,
    });
    if (out.length >= SHOP_FACILITIES_MAX) break;
  }
  return out;
}

/** 月开支合计：铺面自身 + 各处设施的维持 */
export function shopMonthlyExpense(shop: Pick<PlayerShop, "monthlyExpense" | "facilities">): number {
  const upkeep = (shop.facilities ?? []).reduce((sum, f) => sum + Math.max(0, Math.round(Number(f.upkeep) || 0)), 0);
  return Math.max(0, Math.round(Number(shop.monthlyExpense) || 0)) + upkeep;
}

/** 月净额：进项减去开支合计 */
export function shopMonthlyNet(shop: Pick<PlayerShop, "monthlyIncome" | "monthlyExpense" | "facilities">): number {
  return Math.max(0, Math.round(Number(shop.monthlyIncome) || 0)) - shopMonthlyExpense(shop);
}
