/**
 * 五行与变异灵根的归一与生克。
 *
 * 模型写灵根时花样极多：「火」「fire」「火灵根」「Fire 属性」都可能出现，
 * 判修炼条件时若照字面比对，同一条火灵根便认不出，故一律先归到九系正名再比。
 * 生克也是同一条道理：表里记的是「这一系生哪一系、克哪一系」，
 * 判定时要反过来问「玩家的这一系，是否生/克了功法那一系」。
 */

import type { ElementType } from "@/data/types";

export const VALID_ELEMENTS: ElementType[] = ["金", "木", "水", "火", "土", "风", "雷", "冰", "暗"];

const ELEMENT_ALIASES: Record<string, ElementType> = {
  金: "金",
  木: "木",
  水: "水",
  火: "火",
  土: "土",
  风: "风",
  雷: "雷",
  冰: "冰",
  暗: "暗",
  metal: "金",
  wood: "木",
  water: "水",
  fire: "火",
  earth: "土",
  wind: "风",
  thunder: "雷",
  lightning: "雷",
  ice: "冰",
  dark: "暗",
  jin: "金",
  mu: "木",
  shui: "水",
  huo: "火",
  tu: "土",
  feng: "风",
  lei: "雷",
  bing: "冰",
  an: "暗",
};

/** 把写出来的元素名理成九系之一；认不出返回 null */
export function normalizeElement(raw: unknown): ElementType | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s"'「」【】]/g, "");
  if (!key) return null;
  if (ELEMENT_ALIASES[key]) return ELEMENT_ALIASES[key];
  // 「火灵根」「火系」「火属性」这类写法，剥去尾缀再认
  const bare = key.replace(/(灵根|属性|元素|系)/g, "");
  return ELEMENT_ALIASES[bare] ?? null;
}

/** 这一系生哪一系 */
export const ELEMENT_GENERATES: Record<ElementType, ElementType> = {
  金: "水",
  木: "火",
  水: "木",
  火: "土",
  土: "金",
  风: "雷",
  雷: "火",
  冰: "水",
  暗: "土",
};

/** 这一系克哪一系 */
export const ELEMENT_COUNTERS: Record<ElementType, ElementType> = {
  金: "木",
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  风: "土",
  雷: "水",
  冰: "火",
  暗: "风",
};

/** 玩家的这一系是否生出了功法的这一系 */
export function generatesElement(rootElement: unknown, techElement: unknown): boolean {
  const root = normalizeElement(rootElement);
  const tech = normalizeElement(techElement);
  return Boolean(root && tech && ELEMENT_GENERATES[root] === tech);
}

/** 玩家的这一系是否克住了功法的这一系 */
export function countersElement(rootElement: unknown, techElement: unknown): boolean {
  const root = normalizeElement(rootElement);
  const tech = normalizeElement(techElement);
  return Boolean(root && tech && ELEMENT_COUNTERS[root] === tech);
}
