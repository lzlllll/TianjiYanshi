/**
 * 功法每修成一重，四条根基里跟着长一截。
 *
 * 重数照熟练度算（与功法界面同一套），故不必另记「练到第几重」；
 * 每回进度动过之后，拿前后两份功法名录比一比，涨了几重便补几截。
 * 新参得的功法不算——那是白捡的，不是修出来的。
 */

import type { AttributeSet, PlayerStats, Technique, TechniqueStatGain } from "@/data/types";
import { techniqueLevelOf } from "@/lib/skillCalc";
import { defaultStatGainOf, growAttribute } from "@/lib/attributes";

const ATTRS: (keyof AttributeSet)[] = ["vitality", "soul", "wisdom", "agility"];

/** 这一门每重长哪一条、长多少；没写便照门类给一个常例 */
export function techniqueStatGainOf(tech: Technique | undefined | null): TechniqueStatGain {
  const raw = tech?.statGain;
  if (raw && ATTRS.includes(raw.stat)) {
    const per = Number(raw.perLevel);
    return {
      stat: raw.stat,
      perLevel: Math.min(3, Math.max(1, Math.round(Number.isFinite(per) && per > 0 ? per : 1))),
    };
  }
  return defaultStatGainOf(tech?.category ?? "心法");
}

/**
 * 照前后两份功法名录，把涨出来的重数折成根基。
 * 进度没动、或是新参得的，都不在此列。
 */
export function applyTechniqueGrowth(
  prev: Technique[] | undefined,
  next: Technique[] | undefined,
  stats: PlayerStats,
): PlayerStats {
  const list = Array.isArray(prev) ? prev : [];
  const nextList = Array.isArray(next) ? next : [];
  if (list.length === 0 || nextList.length === 0) return stats;

  const before = new Map(list.map((t) => [t.id, techniqueLevelOf(t)]));
  let out = stats;
  for (const tech of nextList) {
    const was = before.get(tech.id);
    if (was === undefined) continue;
    const gained = techniqueLevelOf(tech) - was;
    if (gained <= 0) continue;
    const gain = techniqueStatGainOf(tech);
    out = growAttribute(out, gain.stat, gain.perLevel * gained);
  }
  return out;
}
