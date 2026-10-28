/**
 * 修炼的算法：把「一段时辰能长多少进度」定在一处，供各处共用。
 *
 * 底子是每时辰一点进度。落在什么地方修，进益差在那一处的灵气厚薄上：
 * 本门的灵脉一类建筑每高一级多添三成，静室与自家洞府另各有加成。
 * 叙事里写到打坐闭关，也照这一套算，不必各写各的。
 */

import { facilityInfo } from "@/data/sectFacilities";

/** 每时辰的修炼进度 */
export const CULTIVATION_PER_HOUR = 1;

/** 本门灵脉每高一级，多添三成 */
const SPIRIT_PER_LEVEL = 0.3;

/** 静室里修，比寻常处所强出五成 */
const MEDITATION_ROOM_MUL = 1.5;

/** 自家洞府次之，多两成 */
const HOME_MUL = 1.2;

export interface LocalCultivation {
  /** 这一处的倍数 */
  mul: number;
  /** 一句话说清倍数由何而来 */
  note: string;
}

/** 一处地方的修炼效率：灵脉等级与所在场所两样说了算 */
export function localCultivation(args: { spiritLevel?: number; location?: string }): LocalCultivation {
  const parts: string[] = [];
  let mul = 1;

  const lv = Math.max(0, Math.min(5, Math.trunc(Number(args.spiritLevel) || 0)));
  if (lv > 0) {
    mul += lv * SPIRIT_PER_LEVEL;
    parts.push(`本门灵脉 ${lv} 级`);
  }
  if (args.location === "meditation_room") {
    mul *= MEDITATION_ROOM_MUL;
    parts.push("静室之中");
  } else if (args.location === "home") {
    mul *= HOME_MUL;
    parts.push("自家洞府");
  }

  return {
    mul: Math.round(mul * 100) / 100,
    note: parts.length > 0 ? parts.join("、") : "寻常地界，不比别处厚薄",
  };
}

/**
 * 由宗门各处建筑的等级，定出本门的修炼效率。
 * 灵脉类建筑里最高的那一座说了算；人不在山门里，facilities 传空即可。
 */
export function localCultivationFrom(input: {
  facilities?: Record<string, { level?: number } | undefined>;
  location?: string;
}): LocalCultivation {
  const spiritLevel = Object.entries(input.facilities ?? {}).reduce((max, [name, state]) => {
    if (facilityInfo(name).kind !== "spirit") return max;
    return Math.max(max, Number(state?.level) || 1);
  }, 0);
  return localCultivation({ spiritLevel, location: input.location });
}

/** 这一段时辰该长多少修炼进度；不足一时辰按一时辰算，总不至于白坐 */
export function cultivationGain(hours: number, mul: number): number {
  const h = Math.max(0, Number(hours) || 0);
  if (h <= 0) return 0;
  return Math.max(1, Math.round(h * CULTIVATION_PER_HOUR * (Number(mul) || 1)));
}

/**
 * 打坐时气血、灵力、神识每时辰各回上限的几成。
 * 修的是吐纳周天，不是躺平大睡，所以回得慢：坐一日也只补回两成多的气血。
 */
export const CULTIVATE_RECOVER_PER_HOUR = { hp: 0.02, mp: 0.04, spirit: 0.03 };

export interface CultivateRecovery {
  hp: number;
  mp: number;
  spirit: number;
  hpGain: number;
  mpGain: number;
  spiritGain: number;
}

/** 打坐这些时辰，气血、灵力、神识各回多少：按上限的成数按时辰摊，封顶不回超 */
export function cultivationRecovery(args: {
  hours: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  spirit: number;
  spiritMax: number;
  /** 回灵快慢的乘数：心法品阶与经脉贯通程度说了算 */
  mpFactor?: number;
  /** 气血回复的快慢：体魄越厚回得越快 */
  hpFactor?: number;
  /** 神识回复的快慢：神魂越定回得越快 */
  spiritFactor?: number;
}): CultivateRecovery {
  const h = Math.max(0, Number(args.hours) || 0);
  const cap = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  const hpMax = cap(args.hpMax);
  const mpMax = cap(args.mpMax);
  const spiritMax = cap(args.spiritMax);
  const hp = Math.min(hpMax, cap(args.hp));
  const mp = Math.min(mpMax, cap(args.mp));
  const spirit = Math.min(spiritMax, cap(args.spirit));
  const mpFactor = Math.max(0.1, Number(args.mpFactor) || 1);
  const hpFactor = Math.max(0.1, Number(args.hpFactor) || 1);
  const spiritFactor = Math.max(0.1, Number(args.spiritFactor) || 1);
  const hpGain = Math.max(
    0,
    Math.min(hpMax - hp, Math.round(hpMax * CULTIVATE_RECOVER_PER_HOUR.hp * h * hpFactor)),
  );
  const mpGain = Math.max(
    0,
    Math.min(mpMax - mp, Math.round(mpMax * CULTIVATE_RECOVER_PER_HOUR.mp * h * mpFactor)),
  );
  const spiritGain = Math.max(
    0,
    Math.min(
      spiritMax - spirit,
      Math.round(spiritMax * CULTIVATE_RECOVER_PER_HOUR.spirit * h * spiritFactor),
    ),
  );
  return {
    hp: hp + hpGain,
    mp: mp + mpGain,
    spirit: spirit + spiritGain,
    hpGain,
    mpGain,
    spiritGain,
  };
}
