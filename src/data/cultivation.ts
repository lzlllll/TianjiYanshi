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
