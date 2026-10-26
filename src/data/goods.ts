/**
 * 杂货铺的货物。
 *
 * 六十样家常货物各有一条底价与一句说明，进货的多寡按城池的文化背景分权重：
 * 表中六个数依次对 CULTURES 里的 中原、江南、日韩、西域、漠北、苗疆。
 * 卖价 = 底价 × 当日浮动 × 叙事给的时效修正，认不出的文化按中原算。
 */

import type { GameTime, Good, InventoryItem, ItemGrade, PriceAdjust } from "@/data/types";
import { daySerial } from "@/lib/gameTime";

/** 权重表列序，改动这里要同步改每一行的六个数字 */
export const CULTURES = ["中原", "江南", "日韩", "西域", "漠北", "苗疆"] as const;

/** 货名、底价（下品灵石）、说明、六地进货权重 */
const GOODS: [string, number, string, number[]][] = [
  ["盐", 2, "粗盐，灶上离不得。", [9, 9, 8, 4, 3, 5]],
  ["米", 2, "城郊田里新收的米。", [9, 9, 8, 5, 4, 6]],
  ["面", 2, "麦磨的白面，细些的贵。", [8, 7, 7, 6, 5, 4]],
  ["茶叶", 3, "粗茶，解渴用得着。", [9, 10, 8, 6, 4, 6]],
  ["菜籽油", 3, "灶上炒菜使的。", [8, 8, 6, 5, 3, 5]],
  ["酱醋", 2, "油盐酱醋，都是坛装的。", [8, 8, 6, 4, 3, 5]],
  ["铁锅", 4, "生铁打的厚锅，保养得法能传三代。", [9, 8, 7, 6, 7, 4]],
  ["菜刀", 5, "铁匠铺里打的，刃口正。", [8, 7, 7, 6, 6, 4]],
  ["铁钉", 2, "一小包，什物都能钉。", [8, 7, 7, 6, 6, 4]],
  ["铁锹", 6, "农具，翻地挖沟都使。", [7, 6, 6, 5, 6, 4]],
  ["磨刀石", 2, "一块青石，磨得快。", [7, 6, 6, 5, 5, 4]],
  ["粗布", 3, "自家织的粗布，结实。", [8, 8, 7, 6, 6, 5]],
  ["绸缎", 12, "一匹上好绸子，剪裁得当见客也体面。", [6, 10, 7, 7, 2, 4]],
  ["棉花", 4, "弹好的棉花，絮被褥用。", [7, 7, 5, 5, 6, 3]],
  ["针线", 2, "一包针配两轴线。", [8, 8, 7, 5, 4, 5]],
  ["布鞋", 3, "千层底，走远路不磨脚。", [6, 6, 6, 5, 5, 5]],
  ["草鞋", 1, "稻草编的，下地穿。", [6, 6, 6, 5, 7, 6]],
  ["斗笠", 2, "竹篾编的，遮雨也遮日头。", [5, 6, 6, 7, 6, 8]],
  ["蓑衣", 3, "棕毛扎的雨具，雨天披着走。", [5, 6, 6, 6, 5, 8]],
  ["雨伞", 4, "油纸伞，撑开来像一朵花。", [6, 8, 8, 5, 3, 6]],
  ["蒲扇", 2, "蒲葵叶缝的，扇着有风。", [6, 8, 7, 4, 3, 6]],
  ["竹席", 4, "夏夜垫着凉。", [6, 9, 7, 5, 4, 7]],
  ["草席", 3, "糙些，也睡得。", [6, 8, 6, 5, 5, 6]],
  ["木盆", 4, "杉木箍的，洗衣洗澡都使。", [6, 7, 6, 6, 5, 6]],
  ["陶碗", 2, "粗陶，一摞四只。", [8, 8, 7, 6, 5, 5]],
  ["竹筷", 1, "一把竹筷，削得齐整。", [7, 8, 7, 4, 3, 6]],
  ["瓦罐", 3, "存米存水都不坏。", [7, 7, 6, 6, 5, 5]],
  ["铜盆", 7, "黄铜打的，擦亮了照得见人。", [7, 8, 6, 6, 4, 3]],
  ["铜壶", 8, "烧水沏茶，壶身有缠枝纹。", [7, 8, 6, 7, 5, 3]],
  ["铜镜", 10, "磨得光，照得见眉眼。", [6, 8, 6, 7, 4, 3]],
  ["铜铃", 3, "挂门口，风一吹就响。", [6, 6, 6, 7, 5, 8]],
  ["算盘", 6, "掌柜手边离不开的东西。", [7, 8, 6, 7, 3, 3]],
  ["毛笔", 5, "狼毫小笔，写账写字都好。", [7, 8, 7, 2, 1, 2]],
  ["墨锭", 6, "松烟墨，磨得开。", [7, 8, 6, 2, 1, 2]],
  ["宣纸", 5, "一刀百张，纸性柔。", [7, 8, 6, 2, 1, 2]],
  ["字帖", 4, "旧帖拓本，临字用。", [7, 8, 7, 2, 1, 2]],
  ["火折子", 2, "一吹就着，出门必备。", [8, 8, 7, 7, 6, 5]],
  ["灯油", 3, "点灯使的，熬一夜约耗半盏。", [8, 7, 6, 5, 4, 5]],
  ["蜡烛", 3, "白蜡红蜡都有，红白事都用。", [7, 7, 6, 5, 3, 5]],
  ["木炭", 3, "一筐，冬天烧了取暖。", [7, 6, 6, 5, 8, 4]],
  ["香烛", 3, "上香用，庙前常见。", [8, 8, 7, 3, 3, 8]],
  ["纸钱", 1, "一沓黄纸，坟前烧的。", [7, 7, 6, 3, 2, 7]],
  ["竹筐", 2, "背东西使，编得密。", [7, 8, 6, 5, 4, 7]],
  ["麻绳", 2, "一捆，结实得很。", [7, 7, 6, 6, 6, 5]],
  ["菜篮", 2, "提菜上街，一只手的量。", [6, 7, 6, 5, 4, 6]],
  ["鱼篓", 2, "竹编的，装鱼不漏水。", [5, 9, 6, 3, 2, 8]],
  ["梳篦", 4, "黄杨木梳，齿密。", [6, 8, 7, 5, 3, 4]],
  ["胭脂", 8, "一小盒，姑娘家总要买。", [5, 8, 7, 6, 2, 5]],
  ["香料", 9, "西边来的香，烧一点满室都是。", [5, 7, 6, 10, 3, 6]],
  ["药材", 6, "寻常几味，治个风寒。", [7, 7, 6, 6, 4, 9]],
  ["蛇蜕", 12, "苗疆收来的，药里使得着。", [3, 3, 2, 4, 2, 10]],
  ["兽皮", 8, "硝过的皮子，做褥子垫着暖。", [4, 3, 3, 6, 10, 7]],
  ["干肉", 4, "耐放，赶路时带着啃。", [6, 5, 5, 7, 9, 6]],
  ["马奶酒", 5, "酸口，喝惯的人才爱。", [3, 2, 2, 6, 10, 3]],
  ["青稞", 3, "北边的粗粮，磨粉炒着吃。", [2, 1, 1, 5, 10, 2]],
  ["蜜饯", 4, "果脯，哄孩子最灵。", [6, 8, 6, 5, 2, 6]],
  ["糖霜", 5, "细白糖，比蜜饯贵些。", [6, 8, 6, 5, 2, 6]],
  ["风筝", 2, "竹骨纸面，放起来能上天。", [5, 7, 6, 3, 4, 5]],
  ["花种", 2, "一包花籽，随手撒在院角。", [5, 7, 7, 3, 2, 5]],
  ["泥人", 1, "街边捏的小玩意，不值几个钱。", [5, 7, 6, 3, 3, 4]],
];

const GOOD_BY_NAME = new Map(GOODS.map((g) => [g[0], g]));

/** 是不是预设表里的货物；叙事给的时效修正只认表里有的 */
export function isKnownGood(name: string): boolean {
  return GOOD_BY_NAME.has(name);
}

/** 货物的说明，点开看详情时用 */
export function goodDesc(name: string): string {
  return GOOD_BY_NAME.get(name)?.[2] ?? "";
}

/** 货物的底价；不认识的货给个中不溜的数，免得显示成 0 */
export function goodBase(name: string): number {
  return GOOD_BY_NAME.get(name)?.[1] ?? 5;
}

export const ALL_GOOD_NAMES = GOODS.map((g) => g[0]);

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * 当日的行情涨落，八折到一成二之间。
 * 同一天里同一样货的价不跳，隔天换个日子才变，故按「货名 + 日序」定出来。
 */
function dateFluctuation(name: string, day: number): number {
  let h = 2166136261 ^ Math.trunc(day);
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = ((h >>> 0) % 2001) / 10000;
  return 0.8 + r * 2;
}

/** 眼下还有效的时效修正；过期的略过 */
function activeFactor(name: string, day: number, adjusts: PriceAdjust[] | undefined): number {
  if (!Array.isArray(adjusts)) return 1;
  let factor = 1;
  for (const a of adjusts) {
    if (a?.good !== name) continue;
    if (typeof a.untilDay === "number" && day > a.untilDay) continue;
    const f = Number(a.factor);
    if (Number.isFinite(f) && f > 0) factor *= f;
  }
  return factor;
}

/**
 * 一样货眼下的卖价：底价乘当日浮动，再乘叙事给的时效修正，取整、最低一文。
 * 铺面标价、讲价基准、AI 报价都走这一个口子，免得几处各算各的。
 */
export function goodPrice(
  name: string,
  base: number,
  time: GameTime,
  adjusts?: PriceAdjust[],
): number {
  const day = daySerial(time);
  const price = base * dateFluctuation(name, day) * activeFactor(name, day, adjusts);
  return Math.max(1, Math.round(price));
}

/** 开市时进哪些货：按当地权重取若干样，不重样 */
export function rollGoods(culture: string | undefined, count: number): Good[] {
  const col = Math.max(0, CULTURES.indexOf((culture ?? "") as (typeof CULTURES)[number]));
  const remaining = GOODS.map((g) => ({
    name: g[0],
    base: g[1],
    weight: Math.max(0, g[3][col] || 0),
  })).filter((g) => g.weight > 0);

  const items: Good[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const total = remaining.reduce((sum, g) => sum + g.weight, 0);
    let roll = Math.random() * total;
    let at = remaining.length - 1;
    for (let k = 0; k < remaining.length; k++) {
      roll -= remaining[k].weight;
      if (roll < 0) {
        at = k;
        break;
      }
    }
    const [picked] = remaining.splice(at, 1);
    items.push({
      name: picked.name,
      base: picked.base,
      stock: 3 + Math.floor(Math.random() * 18),
    });
  }
  return items;
}

/** 各品阶物件的作价，卖出时按这个折算 */
const GRADE_VALUE: Record<ItemGrade, number> = {
  凡品: 8,
  灵品: 40,
  玄品: 150,
  天品: 600,
  仙品: 2500,
};

/**
 * 掌柜对某一样东西、某一数量肯出的价钱，按品阶与件数折算。
 * 铺子总要赚一手，故只给七成，再由讲价往上抬。
 */
export function itemSalePriceFor(item: Pick<InventoryItem, "grade">, count: number): number {
  const unit = GRADE_VALUE[item.grade] ?? 8;
  const n = Math.max(1, Math.trunc(Number(count)) || 1);
  return Math.max(1, Math.round(unit * n * 0.7));
}

/** 一样东西整组肯出的价钱 */
export function itemSalePrice(item: InventoryItem): number {
  return itemSalePriceFor(item, item.count);
}

/** 随机一样货的名，供自检与测试用 */
export function randomGoodName(): string {
  return pick(ALL_GOOD_NAMES);
}
