/**
 * 阵上的朝向与出手方位。
 *
 * 每位都面朝东南西北之一；从背后或侧方攻入，比正面硬拼更见便宜。
 * 方位由两处定：攻方的落脚处，与守方的朝向。数值一律由本地算，
 * 模型只负责把这一手写成「绕到背后」还是「迎面而上」。
 */

import type { BattleEntity, BattleFacing } from "@/data/types";

export const FACINGS: BattleFacing[] = ["东", "南", "西", "北"];

const OPPOSITE: Record<BattleFacing, BattleFacing> = {
  东: "西",
  西: "东",
  南: "北",
  北: "南",
};

/** 背后出手的伤害倍数 */
export const BACK_STRIKE_FACTOR = 1.3;

/** 侧方出手的伤害倍数 */
export const SIDE_STRIKE_FACTOR = 1.15;

/** 这一位面朝哪一方；没写字便按敌我相对站定——自己人朝南，敌人朝北 */
export function facingOf(entity: BattleEntity | null | undefined): BattleFacing {
  const raw = entity?.facing;
  if (raw && FACINGS.includes(raw)) return raw;
  return entity?.type === "enemy" ? "北" : "南";
}

/** 攻方落在守方的哪一边：照两处坐标里差得远的那一向算 */
export function directionFrom(target: { x: number; y: number }, attacker: { x: number; y: number }): BattleFacing {
  const dx = attacker.x - target.x;
  const dy = attacker.y - target.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "东" : "西";
  return dy >= 0 ? "南" : "北";
}

export interface StrikeAngle {
  kind: "front" | "side" | "back";
  /** 中文说法：正面、侧方、背后 */
  label: string;
  /** 伤害倍数 */
  factor: number;
}

/**
 * 这一手是从哪一侧攻入的。
 * 守方面朝的那一方算出正面；正对面便是背后；其余两向算侧方。
 */
export function strikeAngle(
  attacker: { x: number; y: number },
  target: BattleEntity,
): StrikeAngle {
  const facing = facingOf(target);
  const from = directionFrom(target.position, attacker);
  if (from === facing) return { kind: "front", label: "正面", factor: 1 };
  if (from === OPPOSITE[facing]) return { kind: "back", label: "背后", factor: BACK_STRIKE_FACTOR };
  return { kind: "side", label: "侧方", factor: SIDE_STRIKE_FACTOR };
}
