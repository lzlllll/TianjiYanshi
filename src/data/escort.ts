/**
 * 镖局。
 *
 * 镖局里坐着一班走镖的人。谁要出远门又怕路上不干净，就到柜上问一声，
 * 寻一位跟着；佣金当面付清，雇期一到各自上路。
 * 雇来的镖师与你同行，遇上打斗站你这一边。
 */

import { REALM_NAMES } from "@/data/mockData";
import type { EscortOffer, Relation } from "@/data/types";

/** 佣金的地板与顶棚，下品灵石 */
export const ESCORT_FEE_RANGE: [number, number] = [40, 900];

/** 一趟雇几日 */
export const ESCORT_DAYS_RANGE: [number, number] = [3, 30];

/** 镖师属性的上下限，模型写得再离谱也不出这个框 */
const STAT_MAX = 200;

const clip = (raw: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};

const words = (raw: unknown, max: number): string => String(raw ?? "").trim().slice(0, max);

/**
 * 把模型报的镖师理成一份可用的聘书。
 * 说不出姓名的就当柜上没寻着人，返回 null。
 */
export function clampEscort(raw: unknown, fallbackRealm = "炼气初期"): EscortOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const rawStats = src.stats && typeof src.stats === "object" ? (src.stats as Record<string, unknown>) : {};

  const name = words(src.name, 6);
  if (!name) return null;

  const realm = words(src.realm, 12);
  const title = words(src.title, 12) || "镖师";
  const age = clip(src.age, 0, 300, 0);
  const hpMax = clip(rawStats.hpMax, 20, STAT_MAX, 120);
  const mpMax = clip(rawStats.mpMax, 0, STAT_MAX, 40);
  const personality = words(src.personality, 40);

  return {
    name,
    title,
    realm: REALM_NAMES.includes(realm) ? realm : fallbackRealm,
    gender: ["男", "女", "不详"].includes(words(src.gender, 4)) ? words(src.gender, 4) : undefined,
    age: age > 0 ? age : undefined,
    origin: words(src.origin, 40) || undefined,
    personality: personality || undefined,
    appearance: words(src.appearance, 40) || undefined,
    affiliation: words(src.affiliation, 40) || undefined,
    note: words(src.note, 200) || "走镖多年的老手，眼下在柜上等活。",
    persona:
      words(src.persona, 600) ||
      `${name}，${title}，${personality || "话不多"}。眼下受雇于人，一路护着雇主。`,
    stats: {
      hp: clip(rawStats.hp, 1, hpMax, hpMax),
      hpMax,
      mp: clip(rawStats.mp, 0, mpMax, mpMax),
      mpMax,
      attack: clip(rawStats.attack, 1, STAT_MAX, 20),
      defense: clip(rawStats.defense, 0, STAT_MAX, 15),
      speed: clip(rawStats.speed, 1, STAT_MAX, 20),
    },
    fee: clip(src.fee, ESCORT_FEE_RANGE[0], ESCORT_FEE_RANGE[1], 120),
    days: clip(src.days, ESCORT_DAYS_RANGE[0], ESCORT_DAYS_RANGE[1], 7),
  };
}

/** 雇下的镖师写成尘缘里的一条，雇期一到便自行告辞 */
export function escortToRelation(
  offer: EscortOffer,
  today: number,
  where: { cityId: string; districtId: number; metAt: string },
): Relation {
  return {
    id: `npc-escort-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: offer.name,
    title: offer.title,
    type: "friend",
    affinity: 55,
    affinityMax: 100,
    realm: offer.realm,
    note: offer.note,
    gender: offer.gender,
    age: offer.age,
    origin: offer.origin,
    personality: offer.personality,
    appearance: offer.appearance,
    affiliation: offer.affiliation,
    persona: offer.persona,
    stats: offer.stats,
    cityId: where.cityId,
    districtId: where.districtId,
    metAt: where.metAt,
    traveling: true,
    hireUntilDay: today + offer.days,
    hireFee: offer.fee,
  };
}

/** 雇期过了没有 */
export function isEscortExpired(r: Relation, today: number): boolean {
  return typeof r.hireUntilDay === "number" && today > r.hireUntilDay;
}
