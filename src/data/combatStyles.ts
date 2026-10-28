/**
 * 功法的出手样式与两环相克。
 *
 * 十种样式分两环：外功五式近身相克，奇门五式远程异术相克；跨环不克。
 * 每一式只克一式、只被一式克，记两条链便够：
 * 长兵 → 挥砍短兵 → 刺击短兵 → 软兵 → 拳脚 → 长兵
 * 射术 → 音律 → 御兽 → 符阵 → 术法 → 射术
 * 数值由本地算，叙事只把「一寸长一寸强」「横刀封住直刺」这类经过写出来。
 */

import type { CombatStyle, Technique, TechniqueCategory } from "@/data/types";

export const COMBAT_STYLES: CombatStyle[] = [
  "长兵",
  "挥砍短兵",
  "刺击短兵",
  "软兵",
  "拳脚",
  "射术",
  "音律",
  "御兽",
  "符阵",
  "术法",
];

/** 这一式克哪一式 */
export const STYLE_COUNTER: Record<CombatStyle, CombatStyle> = {
  长兵: "挥砍短兵",
  挥砍短兵: "刺击短兵",
  刺击短兵: "软兵",
  软兵: "拳脚",
  拳脚: "长兵",
  射术: "音律",
  音律: "御兽",
  御兽: "符阵",
  符阵: "术法",
  术法: "射术",
};

/** 这份名录里，克这一式的是哪一式 */
export const STYLE_COUNTERED_BY: Record<CombatStyle, CombatStyle> = (() => {
  const out = {} as Record<CombatStyle, CombatStyle>;
  for (const style of COMBAT_STYLES) out[style] = style;
  for (const style of COMBAT_STYLES) out[STYLE_COUNTER[style]] = style;
  return out;
})();

/** 各式的短说明，功法面板与提示词共用 */
export const STYLE_HINT: Record<CombatStyle, string> = {
  长兵: "枪棍戟矛，一寸长一寸强，先手压制",
  挥砍短兵: "刀斧锤，大开大合，专斩缠丝",
  刺击短兵: "剑与匕首，快准贴身，抢中门",
  软兵: "鞭链绳索，缠腕缴械，防不胜防",
  拳脚: "徒手擒拿，贴身短打，断缠锁足",
  射术: "弓弩飞矢，远袭打断起手",
  音律: "箫琴铃，范围扰神，乱人心志",
  御兽: "驱使灵兽蛊虫，群战缠斗",
  符阵: "符箓阵旗，场控困敌禁法",
  术法: "神通秘术直发，远程范围爆发",
};

/** 模型写出的样式名与别名，认得出便收下 */
const STYLE_ALIASES: Record<string, CombatStyle> = {
  长兵: "长兵",
  长兵器: "长兵",
  枪: "长兵",
  棍: "长兵",
  戟: "长兵",
  矛: "长兵",
  挥砍短兵: "挥砍短兵",
  挥砍: "挥砍短兵",
  刀: "挥砍短兵",
  斧: "挥砍短兵",
  锤: "挥砍短兵",
  刺击短兵: "刺击短兵",
  刺击: "刺击短兵",
  剑: "刺击短兵",
  匕首: "刺击短兵",
  短兵: "刺击短兵",
  软兵: "软兵",
  鞭: "软兵",
  链: "软兵",
  索: "软兵",
  拳脚: "拳脚",
  拳掌: "拳脚",
  徒手: "拳脚",
  擒拿: "拳脚",
  射术: "射术",
  弓: "射术",
  弩: "射术",
  箭: "射术",
  飞镖: "射术",
  针: "射术",
  暗器: "射术",
  音律: "音律",
  琴: "音律",
  箫: "音律",
  铃: "音律",
  御兽: "御兽",
  兽: "御兽",
  蛊: "御兽",
  符阵: "符阵",
  符: "符阵",
  阵: "符阵",
  禁制: "符阵",
  术法: "术法",
  法术: "术法",
  神通: "术法",
  秘术: "术法",
};

/** 把写出来的样式名理成十式之一；认不出返回 null */
export function normalizeCombatStyle(raw: unknown): CombatStyle | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  if (COMBAT_STYLES.includes(key as CombatStyle)) return key as CombatStyle;
  return STYLE_ALIASES[key] ?? null;
}

/** 没写样式时按功法门类给一个常例 */
export function defaultStyleOf(category: TechniqueCategory | string): CombatStyle {
  switch (category) {
    case "炼体":
      return "拳脚";
    case "身法":
      return "刺击短兵";
    case "秘术":
      return "符阵";
    case "神通":
      return "术法";
    case "心法":
    default:
      return "术法";
  }
}

/** 这一门功法用的是什么样式：写了照写，没写照门类补 */
export function techniqueStyleOf(tech: Technique | null | undefined): CombatStyle {
  return normalizeCombatStyle(tech?.style) ?? defaultStyleOf(tech?.category ?? "心法");
}

/** 一式的一句说法，如「刺击短兵 · 克软兵 · 被挥砍短兵克」 */
export function styleBrief(style: CombatStyle): string {
  return `${style} · 克${STYLE_COUNTER[style]} · 被${STYLE_COUNTERED_BY[style]}克`;
}

export interface StyleMatchup {
  kind: "advantage" | "disadvantage" | "neutral";
  /** 伤害倍率 */
  factor: number;
  /** 一句话说法 */
  label: string;
}

/**
 * 两式相遇的成算。守方没有样式、跨环、同式，一律不吃倍率。
 * 克 +20%，被克 -15%，不做叠乘。
 */
export function styleMatchup(
  attacker: CombatStyle | undefined | null,
  defender: CombatStyle | undefined | null,
): StyleMatchup {
  if (!attacker || !defender) return { kind: "neutral", factor: 1, label: "样式无涉" };
  if (STYLE_COUNTER[attacker] === defender) {
    return { kind: "advantage", factor: 1.2, label: `${attacker}克${defender}` };
  }
  if (STYLE_COUNTER[defender] === attacker) {
    return { kind: "disadvantage", factor: 0.85, label: `${attacker}被${defender}克` };
  }
  return { kind: "neutral", factor: 1, label: `${attacker}与${defender}互不相克` };
}
