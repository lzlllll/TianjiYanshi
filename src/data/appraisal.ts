/**
 * 鉴宝。
 *
 * 旧货铺收来的旧物看不出名堂，得请宝物阁的行家过眼。
 * 这一眼不白看，价钱按这件东西的行情开口——越像是好东西，行家要的越多。
 */

import { itemSalePrice } from "@/data/goods";
import type { InventoryItem } from "@/data/types";

/** 请人看一眼至少要点钱，开门做生意的总要收个底 */
export const APPRAISE_MIN_FEE = 20;

/** 照行情的几成开口 */
const FEE_RATE = 0.8;

/** 请人看这一件要多少下品灵石 */
export function appraiseFee(item: InventoryItem): number {
  const worth = itemSalePrice(item);
  return Math.max(APPRAISE_MIN_FEE, Math.round(worth * FEE_RATE));
}
