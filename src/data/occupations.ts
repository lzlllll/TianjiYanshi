/**
 * 城村的归属。
 *
 * 城与村本身是随地图发下来的死数据，改不得，故「谁占着哪一处」另记一张表：
 * 一条一个去处，占了便按月向它收贡金。本门占的进本门宝库，
 * 别家占的照记，日结时并入那一处宗门自己的账。
 */

import { occupationKey } from "@/data/types";
import type { Occupation, OccupationKind } from "@/data/types";

/** 一处的月度贡金：城厚村薄，各按名目定死，不掷骰 */
export function occupationTribute(kind: OccupationKind, targetId: string): number {
  const seed = [...String(targetId)].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (kind === "city") return 90 + (seed % 8) * 20;
  return 20 + (seed % 5) * 10;
}

export function occupationIdOf(o: Occupation): string {
  return occupationKey(o.kind, o.targetId);
}

export function findOccupation(
  list: Occupation[] | undefined,
  kind: OccupationKind,
  targetId: string,
): Occupation | undefined {
  const key = occupationKey(kind, targetId);
  return (Array.isArray(list) ? list : []).find((o) => o && occupationIdOf(o) === key);
}

/** 一处的拥有者；没被占便是空 */
export function ownerOf(
  list: Occupation[] | undefined,
  kind: OccupationKind,
  targetId: string,
): Occupation | undefined {
  return findOccupation(list, kind, targetId);
}

/** 添一处或换一处之主：同一个去处只留最新的一条 */
export function upsertOccupation(list: Occupation[] | undefined, occ: Occupation): Occupation[] {
  const arr = Array.isArray(list) ? list : [];
  const key = occupationIdOf(occ);
  const at = arr.findIndex((o) => o && occupationIdOf(o) === key);
  if (at < 0) return [...arr, occ];
  return arr.map((o, i) => (i === at ? { ...o, ...occ } : o));
}

export function removeOccupation(
  list: Occupation[] | undefined,
  kind: OccupationKind,
  targetId: string,
): Occupation[] {
  const key = occupationKey(kind, targetId);
  return (Array.isArray(list) ? list : []).filter((o) => !o || occupationIdOf(o) !== key);
}

/** 把外部写来的（叙事或新闻里的）一条归属理一理；两条编号缺一不可 */
export function normalizeOccupation(raw: unknown): Occupation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind: OccupationKind | null =
    r.kind === "village" ? "village" : r.kind === "city" ? "city" : null;
  if (!kind) return null;
  const targetId = String(r.targetId ?? "").trim();
  const ownerSectId = String(r.ownerSectId ?? "").trim();
  if (!targetId || !ownerSectId) return null;
  const sinceDay = Number(r.sinceDay);
  const settledMonth = String(r.settledMonth ?? "").trim() || undefined;
  return {
    kind,
    targetId,
    targetName: String(r.targetName ?? "").trim() || targetId,
    ownerSectId,
    ownerName: String(r.ownerName ?? "").trim() || ownerSectId,
    sinceDay: Number.isFinite(sinceDay) ? Math.trunc(sinceDay) : undefined,
    settledMonth,
  };
}
