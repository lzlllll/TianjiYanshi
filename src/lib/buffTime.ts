/**
 * 增益与减益的时效。
 *
 * 非战斗的状态一律按游戏时辰算（durationType 为 until），到了那个时辰自行失效；
 * 战斗里的临时状态另按柱香算（durationType 为 incense），由烧过的柱数递减。
 * 前者走这里判定与清理，界面上也照这份算。
 */

import type { Buff, GameTime } from "@/data/types";
import { reached, shiftGameTime } from "@/lib/gameTime";

/** 这个增益是不是已经过时了 */
export function isBuffExpired(buff: Buff, now: GameTime): boolean {
  if (buff.durationType !== "until") return false;
  if (!buff.until) return false;
  return reached(now, buff.until);
}

/** 到此刻还生效的那些 */
export function aliveBuffs(buffs: Buff[] | undefined, now: GameTime): Buff[] {
  return (Array.isArray(buffs) ? buffs : []).filter((b) => b && !isBuffExpired(b, now));
}

/**
 * 顺手把过时的丢掉。
 * 传回来的引用与原来相同时，说明一条都没到期，调用方可以据此省下一次写入。
 */
export function pruneBuffs(buffs: Buff[] | undefined, now: GameTime): Buff[] {
  const list = Array.isArray(buffs) ? buffs : [];
  return list.some((b) => b && isBuffExpired(b, now)) ? aliveBuffs(list, now) : list;
}

/**
 * 泡汤的药力：把身上的负面状态各往前挪几个时辰。
 * 挪过了此刻的就算养好了，直接散去；挪不动的（永久、条件式、按柱香算的）原样留着。
 * 原数组不动，返回新的一份与就此散去的名目。
 */
export function shortenDebuffs(
  buffs: Buff[] | undefined,
  now: GameTime,
  hours: number,
): { buffs: Buff[]; washed: string[] } {
  const list = Array.isArray(buffs) ? buffs : [];
  const washed: string[] = [];
  const next: Buff[] = [];

  for (const buff of list) {
    if (!buff || !buff.isDebuff || buff.durationType !== "until" || !buff.until) {
      next.push(buff);
      continue;
    }
    // 往前挪的时辰数总小于一日，不会退到上个月去
    const shortened = shiftGameTime(buff.until, -hours);
    if (reached(now, shortened)) {
      washed.push(buff.name);
      continue;
    }
    next.push({ ...buff, until: shortened });
  }

  return { buffs: next, washed };
}
