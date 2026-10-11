/**
 * 战斗里的时序。
 *
 * 交手时不计时辰，以香计：一柱香从 0% 烧到 100%，烧满便换下一柱。
 * 战斗里落下的持续状态按柱数计，香烧过几柱便减几柱。
 * 与 buffTime.ts 里那套按时辰算的相对，各管一头。
 */

import type { BattleIncense } from "@/data/types";

/** 一柱香烧满是多少 */
const FULL = 100;

/** 一回合最多烧过几柱；再快就是模型写飘了，按这个数封顶 */
const MAX_STICKS_PER_TURN = 12;

/**
 * 香烧到哪儿了。
 * 模型报的是这一柱此刻的进度；烧满一柱便翻到下一柱，
 * 翻过几柱一并报给调用方，战斗中的临时状态就照这个柱数递减。
 */
export function advanceIncense(
  prev: BattleIncense,
  reported: number | null,
): { stick: number; progress: number; burned: number } {
  if (reported === null || !Number.isFinite(reported)) {
    return { stick: prev.stick, progress: prev.progress, burned: 0 };
  }

  const burnt = Math.max(0, Math.min(MAX_STICKS_PER_TURN * FULL, Math.round(reported)));
  const burned = Math.floor(burnt / FULL);

  return {
    stick: prev.stick + burned,
    progress: burnt % FULL,
    burned,
  };
}
