/**
 * 瓦舍。
 *
 * 戏台上唱念做打，台下人挤人。听一场戏费些戏钱，也费两个时辰，
 * 但台上台下听来的门道能落到某门本事上——涨得不多，胜在不用自己去磕。
 * 一日最多两场，多了耳朵也听木了。
 */

import { SKILL_LEVEL_MAX, SKILL_PROGRESS_MAX } from "@/data/skills";
import type { Skill, SkillKind, WaseShows } from "@/data/types";

/** 一日最多听几场 */
export const WASE_MAX_PER_DAY = 2;

/** 一场戏的戏钱，下品灵石 */
export const WASE_PRICE = 12;

/** 一场戏费几个时辰 */
export const WASE_HOURS = 2;

/** 听一场能长的那点进度，此数之间随缘 */
export const WASE_GAIN_RANGE: [number, number] = [4, 9];

/** 身上一门本事也没有时，听戏偶尔也能听出一门新的来 */
export const WASE_NEW_SKILL_CHANCE = 0.25;

/**
 * 听戏能听出来的那几门新本事。
 * 都是台上那点营生——听腔、记词、品曲、看身段，不是什么了不得的绝艺。
 */
const WASE_NEW_SKILLS: { name: string; kind: SkillKind; desc: string }[] = [
  { name: "听音辨律", kind: "学识", desc: "台上的腔调板眼，听得出一二。" },
  { name: "记词", kind: "学识", desc: "唱过的词，听一遍便记个大概。" },
  { name: "品曲", kind: "阅历", desc: "曲中悲喜，听得出所以然。" },
  { name: "看身段", kind: "阅历", desc: "台上一抬手一投足，看得出人的斤两。" },
  { name: "做戏", kind: "手艺", desc: "学得来台上那几分做派。" },
];

/** 今天已经听过几场；记的若是别日，就当今日还没开张 */
export function showsToday(shows: WaseShows | undefined, today: number): number {
  if (!shows || shows.day !== today) return 0;
  return Math.max(0, Math.trunc(shows.count) || 0);
}

/** 今日还剩几场 */
export function showsLeft(shows: WaseShows | undefined, today: number): number {
  return Math.max(0, WASE_MAX_PER_DAY - showsToday(shows, today));
}

/**
 * 这一场听下来的去处：要么是身上某门本事往前挪一截，
 * 要么——只有在身上一门能长的本事也没有时——偶尔多出一门新的来。
 */
export type WaseGain =
  | { kind: "train"; id: string; name: string; gain: number }
  | { kind: "new"; skill: Skill };

/**
 * 从身上的几门本事里随手挑一门，小幅涨一截；满级的没得再涨，也就不挑了。
 * 一门本事也没有（或是都已满级）时，多半听不进心里去，偶尔才多出一门新本事来。
 */
export function pickWaseGain(skills: Skill[] | undefined): WaseGain | null {
  const list = (Array.isArray(skills) ? skills : []).filter((s) => s && s.level < SKILL_LEVEL_MAX);

  if (list.length > 0) {
    const picked = list[Math.floor(Math.random() * list.length)];
    const [lo, hi] = WASE_GAIN_RANGE;
    return {
      kind: "train",
      id: picked.id,
      name: picked.name,
      gain: Math.round(lo + Math.random() * (hi - lo)),
    };
  }

  if (Math.random() >= WASE_NEW_SKILL_CHANCE) return null;

  // 身上已经有的名目不再给，免得凑出两门一样的本事
  const owned = new Set((Array.isArray(skills) ? skills : []).map((s) => s?.name));
  const pool = WASE_NEW_SKILLS.filter((s) => !owned.has(s.name));
  if (pool.length === 0) return null;

  const picked = pool[Math.floor(Math.random() * pool.length)];
  return {
    kind: "new",
    skill: {
      id: `skill-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      name: picked.name,
      kind: picked.kind,
      level: 0,
      progress: 0,
      progressMax: SKILL_PROGRESS_MAX,
      desc: picked.desc,
    },
  };
}
