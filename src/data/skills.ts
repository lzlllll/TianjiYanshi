/**
 * 市井本事。
 *
 * 这里不是功法，也不是拳脚，是讨生活的手艺与见识：辨药材、看旧物、认路、算账。
 * 开局由叙事立下几门，往后每次判定过了就往前挪一截，十级为满。
 * 口才一类不入此列——那是另一套说法，不拿骰子量。
 */

import type { Skill, SkillCheck, SkillKind } from "@/data/types";

/** 等级封顶 */
export const SKILL_LEVEL_MAX = 10;

/** 升一级要攒的进度 */
export const SKILL_PROGRESS_MAX = 100;

/** 判定过了、没过各能长多少 */
const GAIN_ON_PASS = 15;
const GAIN_ON_FAIL = 3;

export const SKILL_KINDS: SkillKind[] = ["学识", "手艺", "阅历"];

/** 学识类判定头一回失手还能再争一争；其余类别一锤定音 */
export function isLearningKind(kind: SkillKind | undefined): boolean {
  return kind === "学识";
}

/** 把一份技能理成能用的样子：等级与进度都夹在范围内 */
export function normalizeSkill(raw: Partial<Skill>, index = 0): Skill {
  const kind: SkillKind = SKILL_KINDS.includes(raw.kind as SkillKind)
    ? (raw.kind as SkillKind)
    : "手艺";
  const level = Math.max(0, Math.min(SKILL_LEVEL_MAX, Math.trunc(Number(raw.level) || 0)));
  const max = Math.max(1, Math.trunc(Number(raw.progressMax) || SKILL_PROGRESS_MAX));
  return {
    id: String(raw.id ?? "").trim() || `skill-${index + 1}`,
    name: String(raw.name ?? "").trim().slice(0, 8) || `本事${index + 1}`,
    kind,
    level,
    progress: Math.max(0, Math.min(max - 1, Math.trunc(Number(raw.progress) || 0))),
    progressMax: max,
    desc: String(raw.desc ?? "").trim().slice(0, 80),
  };
}

/**
 * 磨一截进度，满了就升一级。
 * 已经是满级的不再往上走，进度就停在满格上。
 */
export function trainSkill(skill: Skill, gain: number): Skill {
  if (skill.level >= SKILL_LEVEL_MAX) {
    return { ...skill, progress: skill.progressMax };
  }
  let level = skill.level;
  let progress = skill.progress + Math.max(0, Math.trunc(gain));
  while (progress >= skill.progressMax && level < SKILL_LEVEL_MAX) {
    progress -= skill.progressMax;
    level += 1;
  }
  if (level >= SKILL_LEVEL_MAX) progress = skill.progressMax;
  return { ...skill, level, progress };
}

export function trainGain(success: boolean): number {
  return success ? GAIN_ON_PASS : GAIN_ON_FAIL;
}

/**
 * 同一日内同一门本事只长一截。
 * 同一天里翻来覆去考同一门，磨不出长进来；隔日再考才算数。
 */
export function trainOnceADay(
  skills: Skill[],
  name: string,
  success: boolean,
  day: number,
  checks: SkillCheck[] | undefined,
): Skill[] {
  const grewToday = (Array.isArray(checks) ? checks : []).some((c) => c?.skill === name && c.day === day);
  return grewToday ? skills : trainByName(skills, name, success);
}

/** 判定过没过，这门本事都长一截 */
export function trainByName(skills: Skill[], name: string, success: boolean): Skill[] {
  return skills.map((s) => (s.name === name ? trainSkill(s, trainGain(success)) : s));
}

/**
 * 掷一次 D20：点数加上这门技能的等级，够上难度便算过。
 * 学识类头一回失手会留一线（pending），等玩家再争一回或就此认栽；
 * 同一门若先前已经失手过，这一次便不再留余地。
 */
export function rollSkillCheck(params: {
  /** 点名要考的那一门，未必与已有技能同名 */
  asked: string;
  /** 匹配到的技能；认不出就当没这门本事，按零级算 */
  skill?: Skill;
  dc: number;
  context: string;
  day: number;
  /** 这门先前是否已经失手过 */
  failedBefore: boolean;
  /** 骰子，测试时可注入；默认随机二十面 */
  roll?: number;
}): SkillCheck {
  const { asked, skill, day, failedBefore } = params;
  const dc = Math.max(5, Math.min(30, Math.round(params.dc) || 12));
  const level = skill?.level ?? 0;
  const roll = params.roll ?? 1 + Math.floor(Math.random() * 20);
  const success = roll + level >= dc;
  const pending = !success && isLearningKind(skill?.kind) && !failedBefore;

  return {
    id: `check-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    skill: skill?.name ?? asked,
    dc,
    context: params.context.slice(0, 80),
    roll,
    level,
    total: roll + level,
    success,
    ...(pending ? { pending: true } : {}),
    day,
  };
}

/** 按名字找技能：先找同名的，再退一步找彼此包含的，如「辨药」与「辨识药材」 */
export function findSkill(skills: Skill[] | undefined, asked: string): Skill | undefined {
  const list = Array.isArray(skills) ? skills : [];
  return (
    list.find((s) => s.name === asked) ??
    list.find((s) => asked.includes(s.name) || s.name.includes(asked))
  );
}

/** 判定难度分档，给提示词用 */
export const DC_HINT = "易 8、中 12、难 16、极难 20";
