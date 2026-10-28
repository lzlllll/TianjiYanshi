/**
 * 客栈的房与铺位。
 *
 * 房钱按日算，歇息效率是每日能把灵力与气血补回上限的几成。
 * 通铺最贱也最吵，天字号贵得离谱，可一夜顶别处几日。
 */

export interface Room {
  id: string;
  name: string;
  desc: string;
  /** 每日房钱，单位下品灵石 */
  price: number;
  /** 每日恢复上限的成数：0.25 即每日补两成半 */
  rate: number;
}

export const ROOMS: Room[] = [
  {
    id: "bunk",
    name: "通铺",
    desc: "大炕上铺一领席子，与脚夫行商挤在一处，夜里翻身都得先打招呼。",
    price: 3,
    rate: 0.25,
  },
  {
    id: "single",
    name: "单间",
    desc: "一间偏房，一床一桌，窗纸糊得还算严实，能睡个整觉。",
    price: 10,
    rate: 0.4,
  },
  {
    id: "upper",
    name: "上房",
    desc: "楼上的上房，被褥是新换的，另有热水与一壶粗茶，伙计随叫随到。",
    price: 30,
    rate: 0.65,
  },
  {
    id: "deluxe",
    name: "天字号",
    desc: "独院独门，隔着一重花木，熏的是安神香，最吵的市声也传不进来。",
    price: 90,
    rate: 0.95,
  },
];

/** 住店最多能租多少日，免得一时手滑租出半年去 */
export const MAX_LODGE_DAYS = 30;

/** 一个时辰按十二时辰折算，住一日即推十二个时辰 */
export const HOURS_PER_DAY = 12;

/** 住店最长能租多少时辰：一日十二个时辰，三十日便是三百六十 */
export const MAX_LODGE_HOURS = MAX_LODGE_DAYS * HOURS_PER_DAY;

export function roomById(id: string): Room | undefined {
  return ROOMS.find((r) => r.id === id);
}

/** 房钱按时辰算：一日十二个时辰摊下来，最少收一文 */
export function lodgeCost(room: Room, hours: number): number {
  const h = Math.max(0, Math.trunc(hours));
  return Math.max(1, Math.round((room.price * h) / HOURS_PER_DAY));
}

/** 歇这些时辰能补回多少：按上限的成数算，取整，另外封顶 */
export function recoverAmount(max: number, room: Room, hours: number): number {
  const h = Math.max(0, Math.trunc(hours));
  const gain = Math.round(((max * room.rate) / HOURS_PER_DAY) * h);
  return Math.max(0, Math.min(max, gain));
}

/** 把时辰数说成人话：几日又几个时辰 */
export function lodgeDurationLabel(hours: number): string {
  const h = Math.max(0, Math.trunc(Number(hours) || 0));
  const d = Math.floor(h / HOURS_PER_DAY);
  const rest = h % HOURS_PER_DAY;
  return [d > 0 ? `${d} 日` : "", rest > 0 ? `${rest} 个时辰` : ""].filter(Boolean).join(" ") || "一时辰";
}
