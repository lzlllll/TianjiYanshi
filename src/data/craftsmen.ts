/**
 * 匠人区。
 *
 * 临水的那几条街上挤着作坊：开炉的、执锤的、刻符的，各有各的门道。
 * 哪几门工匠在这一局里开着张，掷一次便写进存档，往后不再换人。
 * 客人上门说得出要什么，匠人便掂量料钱与工钱，报一个价与取货的日子。
 */

import { rollDistrictNpc } from "@/data/npcGen";
import type { CraftOffer, Relation, Workshop } from "@/data/types";

/** 一门行当：称谓、作坊里那件家什、惯出的活计 */
export interface CraftTrade {
  /** 称谓，如「铁匠」 */
  title: string;
  /** 作坊里立着的那件家什 */
  work: string;
  /** 这门手艺惯出的活计，归到哪一类 */
  kindHint: string;
}

/** 匠人区里能开的几门行当 */
export const CRAFT_TRADES: CraftTrade[] = [
  { title: "炼丹师", work: "丹炉", kindHint: "丹药" },
  { title: "铁匠", work: "铁砧", kindHint: "法宝" },
  { title: "炼器师", work: "淬火池", kindHint: "法宝" },
  { title: "符师", work: "符案", kindHint: "符箓" },
  { title: "玉匠", work: "解玉砂", kindHint: "杂物" },
  { title: "木匠", work: "木作台", kindHint: "杂物" },
  { title: "织匠", work: "织机", kindHint: "杂物" },
  { title: "皮匠", work: "鞣皮缸", kindHint: "杂物" },
];

/** 一处匠人区里至多开几间作坊 */
export const MAX_CRAFTSMEN = 4;

/** 街坊间传的几句名声 */
const BACKGROUNDS = [
  "这一带的作坊年头都不短，锤声与药香从早响到晚。",
  "沿河的几条巷子尽是作坊，地上落着一层铁屑与碎玉。",
  "此地的手艺人多是祖上传下来的，接活看人，也看顺不顺眼。",
  "铺面不大，里头的家什却齐全，远近都来这儿定做东西。",
];

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** 一门行当的性情形貌，写在人设里，往后交谈照着演 */
function craftsmanPersona(name: string, trade: CraftTrade, affiliation: string): string {
  return `${name}，${affiliation}的${trade.title}，守着${trade.work}过活。手上活儿细，价钱上却不肯多说。`;
}

/**
 * 现开一处匠人区：掷两三门到四门行当，各配一位固定下来的工匠。
 * 姓名与性情形貌沿用街上现拼人那一套，只把营生换成这门口手艺。
 */
export function rollWorkshop(
  metAt: string,
  cityId: string,
  districtId: number,
  culture?: string,
  count = 2 + Math.floor(Math.random() * 3),
): Workshop {
  const want = Math.max(2, Math.min(MAX_CRAFTSMEN, Math.trunc(count) || 3));
  const pool = CRAFT_TRADES.slice();
  const craftsmen: Relation[] = [];

  for (let i = 0; i < want && pool.length > 0; i++) {
    const trade = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const base = rollDistrictNpc(metAt, cityId, districtId, culture);
    const affiliation = base.affiliation && base.affiliation !== "无" ? base.affiliation : "本地作坊";
    craftsmen.push({
      ...base,
      title: trade.title,
      affiliation,
      affinity: 25 + Math.floor(Math.random() * 15),
      note: `${metAt}的${trade.title}，作坊里立着${trade.work}。${base.appearance || ""}${base.personality || ""}`.trim(),
      persona: craftsmanPersona(base.name, trade, affiliation),
    });
  }

  return { background: pick(BACKGROUNDS), craftsmen };
}

/** 这位工匠的行当 */
export function tradeOf(craftsman: Relation): CraftTrade | undefined {
  return tradeByTitle(craftsman.title);
}

/** 按称谓找这一门行当 */
export function tradeByTitle(title: string | undefined): CraftTrade | undefined {
  return CRAFT_TRADES.find((t) => t.title === title);
}

/** 料钱工钱的地板与顶棚，下品灵石 */
export const CRAFT_PRICE_RANGE: [number, number] = [30, 5000];

/** 说定几日后取货 */
export const CRAFT_DAYS_RANGE: [number, number] = [1, 30];

const clip = (raw: unknown, max: number) => String(raw ?? "").trim().slice(0, max);

const clamp = (raw: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};

/**
 * 把匠人报的价理成一份可用的单子。
 * 说不出物件名目的就当还没谈拢，返回 null，改口再议便是。
 */
export function clampCraftOffer(raw: unknown): CraftOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  const name = clip(src.name, 20);
  if (!name) return null;

  return {
    name,
    // 类别与品阶照行囊那一套归一化，这里先原样收下
    type: clip(src.type, 8) || "杂物",
    grade: clip(src.grade, 8) || "凡品",
    desc: clip(src.desc, 120) || `${name}，作坊里新出的活计。`,
    icon: clip(src.icon, 2) || name.charAt(0),
    elements: src.elements && typeof src.elements === "object" ? (src.elements as Record<string, number>) : undefined,
    price: clamp(src.price, CRAFT_PRICE_RANGE[0], CRAFT_PRICE_RANGE[1], 200),
    days: clamp(src.days, CRAFT_DAYS_RANGE[0], CRAFT_DAYS_RANGE[1], 5),
  };
}
