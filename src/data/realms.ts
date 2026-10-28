/**
 * 境界带来的身量。
 *
 * 每上一个大境界，气血、灵力、神识与四条根基都照一档倍率抬上一截。
 * 表里写的是「从引气起算的累积倍率」，破境时只取前后两档的比值相乘，
 * 免得一处境一处境地叠，叠成天文数字。
 * 同一大境界里晋一小阶（初期到中期），倍率不变，便不另动。
 */

import type { AttributeSet, Player } from "@/data/types";

export interface RealmMultipliers {
  /** 气血上限的累积倍率 */
  hp: number;
  /** 灵力上限的累积倍率 */
  mp: number;
  /** 神识上限的累积倍率 */
  spirit: number;
  /** 四条根基的累积倍率 */
  attributes: AttributeSet;
}

/** 引气、炼气、筑基、金丹、元婴、化神、合体、渡劫、大乘、真仙 */
export const REALM_MULTIPLIERS: RealmMultipliers[] = [
  { hp: 1, mp: 1, spirit: 1, attributes: { vitality: 1, soul: 1, wisdom: 1, agility: 1 } },
  { hp: 1.6, mp: 1.5, spirit: 1.4, attributes: { vitality: 1.15, soul: 1.15, wisdom: 1.15, agility: 1.15 } },
  { hp: 3, mp: 2.6, spirit: 2.2, attributes: { vitality: 1.35, soul: 1.35, wisdom: 1.35, agility: 1.35 } },
  { hp: 6, mp: 5, spirit: 4, attributes: { vitality: 1.6, soul: 1.6, wisdom: 1.6, agility: 1.6 } },
  { hp: 12, mp: 10, spirit: 8, attributes: { vitality: 1.9, soul: 1.9, wisdom: 1.9, agility: 1.9 } },
  { hp: 24, mp: 20, spirit: 16, attributes: { vitality: 2.3, soul: 2.3, wisdom: 2.3, agility: 2.3 } },
  { hp: 48, mp: 40, spirit: 32, attributes: { vitality: 2.8, soul: 2.8, wisdom: 2.8, agility: 2.8 } },
  { hp: 96, mp: 80, spirit: 64, attributes: { vitality: 3.4, soul: 3.4, wisdom: 3.4, agility: 3.4 } },
  { hp: 190, mp: 160, spirit: 128, attributes: { vitality: 4.2, soul: 4.2, wisdom: 4.2, agility: 4.2 } },
  { hp: 380, mp: 320, spirit: 256, attributes: { vitality: 5.2, soul: 5.2, wisdom: 5.2, agility: 5.2 } },
];

/** 这一境落在哪一大境界：四个小阶为一大境，真仙单列 */
export function realmTierOf(realmIndex: number): number {
  const idx = Math.max(0, Math.trunc(Number(realmIndex) || 0));
  return Math.min(REALM_MULTIPLIERS.length - 1, Math.floor(idx / 4));
}

const scale = (value: unknown, from: number, to: number): number => {
  const base = Number(value) || 0;
  if (!(from > 0) || !(to > 0)) return Math.max(0, Math.round(base));
  return Math.max(0, Math.round(base * (to / from)));
};

/**
 * 破境之后的身量：气血、灵力、神识与四条根基照前后两档的比值抬一截。
 * 当前的气血、灵力、神识只补上上限涨出来的那一截，不必凭空填满。
 * 潜力若已记着，也一并抬；没记便留给 withPotential 去补。
 */
export function applyRealmGrowth(player: Player, prevRealmIndex: number, nextRealmIndex: number): Player {
  const from = REALM_MULTIPLIERS[realmTierOf(prevRealmIndex)];
  const to = REALM_MULTIPLIERS[realmTierOf(nextRealmIndex)];
  if (!from || !to || from === to) return player;

  const oldHpMax = Math.max(1, Number(player.hpMax) || 1);
  const oldMpMax = Math.max(1, Number(player.mpMax) || 1);
  const oldSpiritMax = Math.max(1, Number(player.spiritMax) || 1);
  const hpMax = Math.max(1, scale(oldHpMax, from.hp, to.hp));
  const mpMax = Math.max(1, scale(oldMpMax, from.mp, to.mp));
  const spiritMax = Math.max(1, scale(oldSpiritMax, from.spirit, to.spirit));

  const stats = player.stats;
  const growth = to.attributes;
  const base = from.attributes;
  const nextStats = {
    ...stats,
    vitality: scale(stats?.vitality, base.vitality, growth.vitality),
    soul: scale(stats?.soul, base.soul, growth.soul),
    wisdom: scale(stats?.wisdom, base.wisdom, growth.wisdom),
    agility: scale(stats?.agility, base.agility, growth.agility),
    ...(stats?.potential
      ? {
          potential: {
            vitality: scale(stats.potential.vitality, base.vitality, growth.vitality),
            soul: scale(stats.potential.soul, base.soul, growth.soul),
            wisdom: scale(stats.potential.wisdom, base.wisdom, growth.wisdom),
            agility: scale(stats.potential.agility, base.agility, growth.agility),
          },
        }
      : {}),
  };

  return {
    ...player,
    hpMax,
    mpMax,
    spiritMax,
    hp: Math.min(hpMax, Math.max(1, (Number(player.hp) || 0) + Math.max(0, hpMax - oldHpMax))),
    mp: Math.min(mpMax, Math.max(0, (Number(player.mp) || 0) + Math.max(0, mpMax - oldMpMax))),
    spirit: Math.min(
      spiritMax,
      Math.max(0, (Number(player.spirit) || 0) + Math.max(0, spiritMax - oldSpiritMax)),
    ),
    stats: nextStats,
  };
}
