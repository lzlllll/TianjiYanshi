import type { Location, LocationType } from "@/data/types";

/**
 * 城中可往来的场所。玩家不能手动切换，只能由叙事触发后经结算回写；
 * 这张表同时是下发给模型的可选值来源，也是回写时的校验依据。
 */
export const LOCATIONS: Location[] = [
  {
    id: "home",
    name: "住所",
    description: "你在当地落脚的地方，宁静雅致，适合休整。",
    icon: "居",
    allowedActions: ["休息", "冥想", "闭关"],
  },
  {
    id: "alchemy_room",
    name: "炼丹房",
    description: "丹炉齐备的炼丹之所，灵气充沛。",
    icon: "丹",
    allowedActions: ["炼丹", "配药", "研究丹方"],
  },
  {
    id: "forge_room",
    name: "炼器室",
    description: "炼器工坊，炉火熊熊，可锻神兵。",
    icon: "器",
    allowedActions: ["炼器", "锻造", "修复法宝"],
  },
  {
    id: "meditation_room",
    name: "闭关室",
    description: "隔绝外界干扰的静室，宜潜心修炼。",
    icon: "静",
    allowedActions: ["修炼", "突破", "参悟"],
  },
  {
    id: "market",
    name: "集市",
    description: "坊市繁华，商贾云集，可买卖交换。",
    icon: "市",
    allowedActions: ["购物", "出售", "打探消息"],
  },
  {
    id: "library",
    name: "藏经阁",
    description: "典籍所在，功法秘籍琳琅满目。",
    icon: "书",
    allowedActions: ["研读", "参悟", "借阅"],
  },
  {
    id: "training_ground",
    name: "演武场",
    description: "切磋比武之地，可磨练武技。",
    icon: "武",
    allowedActions: ["修炼", "切磋", "演练"],
  },
  {
    id: "outdoor",
    name: "野外",
    description: "山野之间，灵气驳杂，机缘与危险并存。",
    icon: "野",
    allowedActions: ["探索", "狩猎", "采集"],
  },
];

/** 场所名清单，下发给模型供其选择 */
export const LOCATION_NAMES = LOCATIONS.map((l) => l.name);

const LOCATION_BY_ID = new Map<string, Location>(LOCATIONS.map((l) => [l.id, l]));
const LOCATION_BY_NAME = new Map<string, Location>(LOCATIONS.map((l) => [l.name, l]));

/**
 * 按 id 或场所名解析。只认表里已有的场所，认不出返回 undefined，
 * 调用方据此丢弃这次改动，免得模型编出「丹房」这类名字让界面上无处可去。
 */
export function resolveLocation(value: unknown): LocationType | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/[「」『』"'“”\s]/g, "");
  if (!text) return undefined;

  const exact = LOCATION_BY_ID.get(text) ?? LOCATION_BY_NAME.get(text);
  if (exact) return exact.id;
  // 「炼丹房中」「藏经阁里」这类带方位字的写法，用已有场所名做前缀匹配
  return LOCATIONS.find((l) => text.startsWith(l.name))?.id;
}
