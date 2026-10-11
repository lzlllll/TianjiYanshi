/**
 * 宗门之间的交情。
 *
 * 关系是对称的，一处只记一条：两个点位编号排序后以「|」相连作名目，
 * 免得同一桩事由两端各记一遍。起初一张白纸，由叙事与新闻往里添改。
 * 附庸这一档另在附庸一方的点位上记 vassalOf，日结时照它进贡。
 */

import type { SectRelation, SectSite, SectStance } from "@/data/types";

/** 五档相处之道，由亲至疏 */
export const SECT_STANCES: SectStance[] = ["附庸", "结盟", "友好", "中立", "敌对"];

/** 踏破一处宗门之后，可以做的几件事；占了城村则另有「占领」一路 */
export type SectWarChoice = "掠夺" | "附庸" | "摧毁" | "占领";

/** 各档默认的交情深浅：叙事只报了档次时，照这里补一个数 */
export const STANCE_RELATION: Record<SectStance, number> = {
  附庸: 40,
  结盟: 70,
  友好: 35,
  中立: 0,
  敌对: -70,
};

const clampRel = (n: number) => Math.max(-100, Math.min(100, Math.round(n)));

/** 两处宗门归一名目：编号排序后以「|」相连 */
export function sectPairId(a: string, b: string): string {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  return x <= y ? `${x}|${y}` : `${y}|${x}`;
}

export function isSectStance(v: unknown): v is SectStance {
  return typeof v === "string" && (SECT_STANCES as string[]).includes(v);
}

/**
 * 把外来的（叙事或新闻里写的）一笔宗门关系理一理。
 * 两个编号缺一不可，且不能是同一处；对不上档次的归中立。
 */
export function normalizeSectRelation(raw: unknown, sinceDay?: number): SectRelation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const a = String(r.a ?? r.from ?? r.attacker ?? "").trim();
  const b = String(r.b ?? r.to ?? r.target ?? "").trim();
  if (!a || !b || a === b) return null;
  const stance = isSectStance(r.stance) ? r.stance : "中立";
  const rel = Number(r.relation);
  const relation = Number.isFinite(rel) ? clampRel(rel) : STANCE_RELATION[stance];
  const note = String(r.note ?? "").trim().slice(0, 120) || undefined;
  const day = Number(r.sinceDay ?? sinceDay);
  const id = sectPairId(a, b);
  const [lo, hi] = id.split("|");
  return {
    id,
    a: lo,
    b: hi,
    stance,
    relation,
    note,
    sinceDay: Number.isFinite(day) ? Math.trunc(day) : undefined,
  };
}

/** 添一笔或改一笔：同一对宗门只留最新的一条 */
export function upsertSectRelation(list: SectRelation[], rel: SectRelation): SectRelation[] {
  const arr = Array.isArray(list) ? list : [];
  const at = arr.findIndex((x) => x?.id === rel.id);
  if (at < 0) return [...arr, rel];
  return arr.map((x, i) => (i === at ? { ...x, ...rel } : x));
}

/** 查一处宗门与另一处之间的交情 */
export function findSectRelation(
  list: SectRelation[],
  a: string,
  b: string,
): SectRelation | undefined {
  const id = sectPairId(a, b);
  return (Array.isArray(list) ? list : []).find((x) => x?.id === id);
}

/** 一处宗门的附庸都有谁 */
export function vassalsOf(sites: SectSite[], overlordId: string): SectSite[] {
  if (!overlordId) return [];
  return (Array.isArray(sites) ? sites : []).filter((s) => s && s.vassalOf === overlordId);
}

/** 附庸一日该进的贡品：照它的品级与门下人数估一笔 */
export function vassalTribute(site: SectSite): number {
  const level = Math.max(1, Number(site?.level) || 1);
  const disciples = Math.max(0, Number(site?.disciples) || 0);
  return Math.round(level * 25 + disciples * 1.5 + 15);
}
