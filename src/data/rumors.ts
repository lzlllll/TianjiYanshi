/**
 * 流言：打尖时邻桌的议论、旁人漏出来的口风，记在存档里。
 * 只留一个月，过期的从列表里落下去，叙事那边也不再报给模型。
 */

import type { GameTime, Rumor } from "@/data/types";
import { daySerial } from "@/lib/gameTime";

/** 流言的保质期，按日算 */
export const RUMOR_KEEP_DAYS = 30;

/** 到今日还没过期的那些；存档里乱序或字段缺失都挡在外面 */
export function aliveRumors(list: Rumor[] | undefined, time: GameTime): Rumor[] {
  const today = daySerial(time);
  return (Array.isArray(list) ? list : []).filter(
    (r) => r && typeof r.text === "string" && r.text && today - r.day < RUMOR_KEEP_DAYS,
  );
}
