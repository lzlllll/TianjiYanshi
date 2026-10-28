/**
 * 四条根基的成算。
 *
 * 每一条都分「潜力」与「当前」：潜力是这一条能练到的顶，当前是眼下实有的数；
 * 修炼只能把当前往上挪，挪到潜力便停住。临时状态（buff/debuff）压在当前之上再算，
 * 不受潜力所限——疯药提气可以一时超出平日的底子。
 * 战斗里的体力、挪步远近、神魂加持、回灵快慢与修炼快慢，都从这里取一份说法。
 */

import type {
  AttributeSet,
  Buff,
  Player,
  PlayerStats,
  Technique,
  TechniqueCategory,
  TechniqueStatGain,
} from "@/data/types";

/** 四条根基的顺序 */
export const ATTRIBUTE_KEYS: (keyof AttributeSet)[] = ["vitality", "soul", "wisdom", "agility"];

/** 四条根基的说法 */
export const ATTRIBUTE_LABELS: Record<keyof AttributeSet, string> = {
  vitality: "体力",
  soul: "神魂",
  wisdom: "悟性",
  agility: "身法",
};

/** 旧档没有潜力时，照当前值往上留的一截余地 */
const POTENTIAL_GAP = 40;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 四条根基的当前数值 */
export function currentAttributes(stats: PlayerStats | undefined | null): AttributeSet {
  return {
    vitality: num(stats?.vitality),
    soul: num(stats?.soul),
    wisdom: num(stats?.wisdom),
    agility: num(stats?.agility),
  };
}

/**
 * 四条根基的潜力。
 * 写过便照写；没写过（旧档、开局刚立的人物）便照当前值往上留一截，
 * 往后这一截就是修炼能挪到的顶。
 */
export function potentialOf(stats: PlayerStats | undefined | null): AttributeSet {
  const cur = currentAttributes(stats);
  const raw = stats?.potential;
  const pick = (key: keyof AttributeSet) => {
    const stored = num(raw?.[key]);
    return Math.max(cur[key], stored > 0 ? stored : cur[key] + POTENTIAL_GAP);
  };
  return {
    vitality: pick("vitality"),
    soul: pick("soul"),
    wisdom: pick("wisdom"),
    agility: pick("agility"),
  };
}

/** 把潜力补齐的一份 stats；载入旧档、开局落定时都用它过一道 */
export function withPotential(stats: PlayerStats | undefined | null): PlayerStats {
  const cur = currentAttributes(stats);
  return {
    ...cur,
    heartScores: Array.isArray(stats?.heartScores) ? stats.heartScores : [],
    potential: potentialOf(stats),
  };
}

/**
 * 临时状态压过的四条根基。
 * buff 与 debuff 一律照名录里的效力算：fixed 逐层相加、percentage 照底数折算、multiplier 连乘，
 * 算出来的数不再与潜力相较——提气疯药压过了顶就是压过了。
 */
export function effectiveAttributes(player: Pick<Player, "stats" | "buffs"> | undefined | null): AttributeSet {
  const base = currentAttributes(player?.stats);
  const out: AttributeSet = { ...base };
  const buffs = Array.isArray(player?.buffs) ? (player!.buffs as Buff[]) : [];
  if (buffs.length === 0) return out;

  for (const key of ATTRIBUTE_KEYS) {
    let fixed = 0;
    let pct = 0;
    let mul = 1;
    for (const buff of buffs) {
      if (!buff) continue;
      const stacks = Math.max(1, Math.trunc(num(buff.stacks) || 1));
      for (const effect of Array.isArray(buff.effects) ? buff.effects : []) {
        if (effect?.stat !== key) continue;
        const value = num(effect.value);
        if (effect.valueType === "fixed") fixed += value * stacks;
        else if (effect.valueType === "percentage") pct += value * stacks;
        else if (effect.valueType === "multiplier") mul *= Math.pow(value || 1, stacks);
      }
    }
    const total = (base[key] + fixed) * (1 + pct / 100) * mul;
    out[key] = Math.max(0, Math.round(Number.isFinite(total) ? total : base[key]));
  }
  return out;
}

/**
 * 修炼涨一截当前数值：写进 stats，略去超过潜力的那部分。
 * 已越过潜力的（多是叙事直接改的），便不再涨。
 */
export function growAttribute(stats: PlayerStats, stat: keyof AttributeSet, amount: number): PlayerStats {
  const add = Math.trunc(num(amount));
  if (add <= 0) return stats;
  const potential = potentialOf(stats);
  const cur = num(stats[stat]);
  const next = Math.min(potential[stat], cur + add);
  // 潜力一并写回：旧档没有这一项，练过一截之后便记下，往后照它封顶
  return { ...stats, potential, [stat]: Math.max(cur, next) };
}

/** 战斗里的体力上限：体力越厚，能挪的次数越多 */
export const STAMINA_BASE = 20;
export function battleStaminaMax(vitality: number): number {
  return Math.max(STAMINA_BASE, Math.round(STAMINA_BASE + Math.max(0, num(vitality)) * 1.2));
}

/** 挪一格要耗多少体力 */
export const MOVE_STAMINA_COST = 10;

/** 每一合回多少体力：久战不倒，站着不动也回一口气 */
export function staminaRegen(max: number): number {
  return Math.max(5, Math.round(Math.max(0, num(max)) * 0.15));
}

/** 一回合最多挪几格：身法越利落，走得越远，至多四格 */
export function movementLimit(agility: number): number {
  return Math.min(4, Math.max(1, 1 + Math.floor(Math.max(0, num(agility)) / 25)));
}

/** 精神类功法：神魂催得动的那几门 */
export function isSpiritTechnique(category: TechniqueCategory | string): boolean {
  return category === "神通" || category === "秘术";
}

/** 神魂对精神类功法伤害的加持 */
export function soulDamageFactor(soul: number): number {
  return 1 + Math.min(300, Math.max(0, num(soul))) / 600;
}

/** 心法品阶对回灵的加持 */
const GRADE_RECOVERY: Record<string, number> = {
  凡品: 1,
  灵品: 1.15,
  玄品: 1.3,
  天品: 1.5,
  仙品: 1.8,
};

/** 经脉贯通程度：通畅比例减去带伤的那一截，0 到 1 */
export function meridianClarityRatio(
  meridians: { clarity: number; maxClarity: number; damage?: boolean }[] | undefined,
): number {
  const list = Array.isArray(meridians) ? meridians : [];
  if (list.length === 0) return 0.5;
  const ratio =
    list.reduce((sum, m) => {
      const max = Math.max(1, num(m.maxClarity) || 100);
      return sum + Math.min(1, Math.max(0, num(m.clarity) / max));
    }, 0) / list.length;
  const hurt = list.filter((m) => m.damage).length / list.length;
  return Math.max(0, Math.min(1, ratio - hurt * 0.1));
}

/** 回灵快慢：心法品阶与经脉贯通程度两样说了算 */
export function heartRecoveryFactor(
  grade: string | undefined,
  meridians: { clarity: number; maxClarity: number; damage?: boolean }[] | undefined,
): number {
  const g = GRADE_RECOVERY[grade ?? "凡品"] ?? 1;
  return g * (0.7 + meridianClarityRatio(meridians) * 0.6);
}

/**
 * 打坐、住店、静修时的回复快慢：
 * 体魄厚的人气血回得快，神魂定的人神识回得快，灵力则看当前心法的品阶与经脉贯通。
 */
export function recoveryFactors(
  player: Pick<Player, "stats" | "buffs" | "meridians" | "activeHeartTechnique">,
  techniques?: Technique[],
): { hp: number; mp: number; spirit: number } {
  const attrs = effectiveAttributes(player);
  const list = Array.isArray(techniques) ? techniques : [];
  const heart =
    list.find((t) => t.id === player.activeHeartTechnique) ??
    list.find((t) => t.category === "心法");
  return {
    hp: 1 + Math.min(300, Math.max(0, num(attrs.vitality))) / 500,
    mp: heartRecoveryFactor(heart?.grade, player.meridians),
    spirit: 1 + Math.min(300, Math.max(0, num(attrs.soul))) / 500,
  };
}

/** 悟性对功法修炼速度的加持 */
export function wisdomTrainFactor(wisdom: number): number {
  return 1 + Math.min(300, Math.max(0, num(wisdom))) / 500;
}

/** 各门类修成一重时长哪一条根基的常例 */
export function defaultStatGainOf(category: TechniqueCategory | string): TechniqueStatGain {
  switch (category) {
    case "炼体":
      return { stat: "vitality", perLevel: 1 };
    case "身法":
      return { stat: "agility", perLevel: 1 };
    case "神通":
      return { stat: "wisdom", perLevel: 1 };
    case "秘术":
      return { stat: "soul", perLevel: 1 };
    case "心法":
    default:
      return { stat: "soul", perLevel: 1 };
  }
}
