/**
 * 汤池。
 *
 * 坊市里的浴堂按时辰计钱：下汤泡一个时辰，身上的负面状态便往前挪八个时辰，
 * 挪过了此刻的就算养好了。泡澡本身也费时辰，两下相抵，净赚七个时辰的清爽。
 */

/** 一次最多泡几个时辰；泡久了反倒耗神 */
export const BATH_MAX_HOURS = 6;

/** 一个时辰的汤钱，下品灵石 */
export const BATH_PRICE_PER_HOUR = 8;

/** 每泡一个时辰，负面状态缩短的时辰数 */
export const BATH_RELIEF_PER_HOUR = 8;

/** 泡几个时辰要多少下品灵石；时辰数先夹到上限 */
export function bathCost(hours: number): number {
  return clampHours(hours) * BATH_PRICE_PER_HOUR;
}

/** 把玩家点的时辰数夹进 1 到上限之间 */
export function clampHours(hours: number): number {
  const n = Math.trunc(Number(hours));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(BATH_MAX_HOURS, n);
}
