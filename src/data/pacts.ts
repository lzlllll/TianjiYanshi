/**
 * 约定。
 *
 * 说定的事都记在这儿：什么时候、在哪儿、跟谁了结。
 * 取货的约定误了期也不罚，只是东西还没做成，得等日子到了才取得走；
 * 口头的约定误过宽限的日子，人情上要折一点——也就折一点。
 */

import type { Pact, PactKind } from "@/data/types";

/** 口头约定的宽限：过了这几日还没了结，情谊上就该折一点了 */
export const PACT_GRACE_DAYS = 3;

/** 逾期折掉的情谊 */
export const PACT_OVERDUE_AFFINITY = 6;

/** 践约时情谊上添的一点 */
export const PACT_KEPT_AFFINITY = 4;

const clip = (raw: unknown, max: number) => String(raw ?? "").trim().slice(0, max);

/** 取货的约定到日子了没有：日子没到，东西还没做成，取不走 */
export function pactReady(pact: Pact, today: number): boolean {
  return pact.kind === "pickup" ? today >= pact.dueDay : true;
}

/** 还能不能了结：取货要等日子到，口头的随时可以去了结 */
export function canSettlePact(pact: Pact, today: number): boolean {
  return pact.status === "open" && pactReady(pact, today);
}

/** 口头约定误过宽限的日子没有：到这一步就该落账了 */
export function pactLapsed(pact: Pact, today: number): boolean {
  if (pact.status !== "open" || pact.kind !== "word") return false;
  return today > pact.dueDay + (pact.graceDays ?? PACT_GRACE_DAYS);
}

/** 还剩几日了结；过了日子便是负数 */
export function pactDaysLeft(pact: Pact, today: number): number {
  return pact.dueDay - today;
}

/** 还在等着的排在前头 */
export function pactRank(pact: Pact): number {
  return pact.status === "open" ? 0 : 1;
}

/** 说给人听的写法 */
export function pactKindLabel(kind: PactKind): string {
  return kind === "pickup" ? "定制取货" : "口头约定";
}

/**
 * 把叙事里说定的一桩话理成约定。
 * 说不出名目的就当没这回事；没写日子便按宽限的那几日算。
 */
export function normalizePact(
  raw: { name?: unknown; place?: unknown; days?: unknown; desc?: unknown },
  giver: { id: string; name: string },
  where: { cityId?: string; districtId?: number },
  today: number,
): Pact | null {
  const name = clip(raw?.name, 20);
  if (!name) return null;

  const days = Math.trunc(Number(raw?.days));
  return {
    id: `pact-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    kind: "word",
    name,
    desc: clip(raw?.desc, 120),
    giver: giver.name,
    giverId: giver.id,
    place: clip(raw?.place, 30),
    cityId: where.cityId,
    districtId: where.districtId,
    madeDay: today,
    dueDay: today + (Number.isFinite(days) && days > 0 ? days : PACT_GRACE_DAYS),
    graceDays: PACT_GRACE_DAYS,
    status: "open",
  };
}
