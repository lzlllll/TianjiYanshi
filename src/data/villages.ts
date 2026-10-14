/**
 * 野外村庄。
 *
 * 村庄没有舆图，只落在舆图预设出的点位上，一处一村。
 * 未打听之前，村里的营生与人物都还空着；打听一回，便掷定下来，此后不再变。
 * 营生只会是茶棚、杂货铺、客栈三样，未必齐全——有的村只剩一间茶棚。
 */

import type { Relation, Shop, Village, VillageBuilding, VillageBuildingKind } from "@/data/types";
import { rollGoods } from "@/data/goods";
import { rollSeats } from "@/data/shops";
import { rollDistrictNpcs } from "@/data/npcGen";

export type { Village, VillageBuilding, VillageBuildingKind };

const VILLAGE_NAMES: Record<string, string[]> = {
  中原: [
    "李家村", "王家屯", "石桥村", "柳树屯", "杏花村", "黄土坡",
    "赵家庄", "陈家洼", "望乡集", "古槐村",
  ],
  江南: [
    "梅家坞", "柳浪村", "菱湖村", "荷塘村", "水月村", "烟雨村",
    "乌篷埠", "采菱湾", "枕河里", "曲水村",
  ],
  苗疆: [
    "铜鼓寨", "山鬼村", "藤桥村", "雾竹寨", "银铃村", "蜂岩寨",
    "跳月坪", "五毒溪", "蜡染寨", "芦笙坳",
  ],
  西域: [
    "沙枣村", "驼铃村", "月牙村", "胡杨村", "井台村", "葡萄沟",
    "高昌堡", "坎儿井", "沙柳驿", "琉璃村",
  ],
  漠北: [
    "狼山村", "风口屯", "热汤村", "雪原村", "走马屯", "冻土营",
    "马奶帐", "白毛风屯", "寒泉堡", "骨笛营",
  ],
  日韩: [
    "樱枝村", "松风里", "白鹿村", "汤町村", "鹤鸣村", "石灯村",
    "神乐里", "竹取村", "町屋原", "白狐乡",
  ],
};

/**
 * 预设村名用尽后另拼新名用的词：地名头（姓氏、风物）与通名（村、屯、寨…）。
 * 一处文化圈各备一套，拼出来的名仍带着这一带的味道。
 */
const VILLAGE_NAME_HEADS: Record<string, string[]> = {
  中原: [
    "李", "王", "张", "赵", "陈", "刘", "孙", "周", "吴", "郑",
    "韩", "杨", "朱", "秦", "卫", "沈", "冯", "蒋", "褚", "何",
    "石桥", "柳树", "杏花", "黄土", "古槐", "望乡", "枣林", "河湾",
    "清风", "双井", "白杨", "三里", "墩子", "铁铺", "瓦窑", "水磨",
  ],
  江南: [
    "梅", "柳", "荷", "菱", "水", "兰", "白", "青", "吴", "沈",
    "烟雨", "乌篷", "枕河", "曲水", "杏花", "明月", "兰舟", "浣花",
    "石湖", "白蘋", "青浦", "采莲", "画桥", "竹林",
  ],
  苗疆: [
    "铜鼓", "山鬼", "藤桥", "雾竹", "银铃", "蜂岩", "跳月", "五毒", "蜡染", "芦笙",
    "竹楼", "清水", "岩脚", "芭蕉", "吊脚", "月寨", "苦竹", "花溪", "牛角", "蕨岭",
  ],
  西域: [
    "沙枣", "驼铃", "月牙", "胡杨", "井台", "葡萄", "高昌", "坎儿", "沙柳", "琉璃",
    "红柳", "烽燧", "绿洲", "沙丘", "坎井", "白杨", "火州", "香料", "玛瑙", "石城",
  ],
  漠北: [
    "狼山", "风口", "热汤", "雪原", "走马", "冻土", "马奶", "白毛风", "寒泉", "骨笛",
    "苍狼", "雪窝", "火塘", "盐海", "黑石", "北风", "白桦", "野马", "冰河", "驼峰",
  ],
  日韩: [
    "樱枝", "松风", "白鹿", "汤町", "鹤鸣", "石灯", "神乐", "竹取", "町屋", "白狐",
    "稻荷", "月见", "清泷", "千鸟", "朝雾", "若叶", "藤原", "雾岛", "长门", "濑户",
  ],
};

/** 与地名头相配的通名；拼名时按当地风土取字 */
const VILLAGE_NAME_TAILS: Record<string, string[]> = {
  中原: ["村", "屯", "庄", "洼", "坡", "集", "店", "营", "寨", "堡"],
  江南: ["村", "坞", "埠", "湾", "里", "泾", "浦", "塘", "荡", "浜"],
  苗疆: ["寨", "村", "坪", "溪", "坳", "冲", "屯", "坡", "洞", "岭"],
  西域: ["村", "沟", "堡", "井", "驿", "营", "庄", "屯", "泉", "口"],
  漠北: ["村", "屯", "营", "堡", "帐", "窝", "滩", "口", "甸", "沟"],
  日韩: ["村", "里", "町", "乡", "原", "野", "谷", "坂", "浦", "庄"],
};

const BUILDING_NAME: Record<VillageBuildingKind, Record<string, string>> = {
  茶棚: {
    中原: "村口茶棚", 江南: "桥头茶棚", 苗疆: "寨口茶摊",
    西域: "驿路茶棚", 漠北: "风口茶摊", 日韩: "町口茶屋",
  },
  杂货铺: {
    中原: "村中杂货铺", 江南: "水乡杂货铺", 苗疆: "寨里杂货铺",
    西域: "驼货杂货铺", 漠北: "皮货杂货铺", 日韩: "町屋杂货",
  },
  客栈: {
    中原: "村里客栈", 江南: "临水客栈", 苗疆: "吊脚客栈",
    西域: "驼队客栈", 漠北: "毡房客栈", 日韩: "汤町宿",
  },
};

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * 按文化圈取一个村名。
 * used 传的是本局已经用过的地名，取过的名不再取——一局之内不重号。
 * 预设名挑完了，便用「地名头 + 通名」另拼一个新名，仍与用过的撞则再拼，
 * 直到拼出个没人用过的为止。
 */
export function rollVillageName(culture?: string, used?: ReadonlySet<string>): string {
  const key = culture && VILLAGE_NAMES[culture] ? culture : "中原";
  const taken = used ?? new Set<string>();
  const free = VILLAGE_NAMES[key].filter((n) => !taken.has(n));
  if (free.length > 0) return pick(free);

  // 预设村名用尽：另拼新名
  const heads = VILLAGE_NAME_HEADS[key] ?? VILLAGE_NAME_HEADS.中原;
  const tails = VILLAGE_NAME_TAILS[key] ?? VILLAGE_NAME_TAILS.中原;
  for (let i = 0; i < 80; i++) {
    const name = pick(heads) + pick(tails);
    if (!taken.has(name)) return name;
  }
  // 头与通名都撞满了，缀一个次序，仍不与众家重名
  let name = pick(heads) + pick(tails);
  for (let n = 2; taken.has(name); n++) name = `${pick(heads)}${pick(tails)}${n}`;
  return name;
}

/** 村里有哪几样营生：三样里随机出一到三样，未必齐全 */
export function rollVillageBuildings(): VillageBuildingKind[] {
  const all: VillageBuildingKind[] = ["茶棚", "杂货铺", "客栈"];
  const kept = all.filter(() => Math.random() < 0.6);
  return kept.length > 0 ? kept : [pick(all)];
}

/** 村里那家铺子的名号 */
export function villageBuildingName(kind: VillageBuildingKind, culture?: string): string {
  const byCulture = BUILDING_NAME[kind];
  return byCulture[culture ?? "中原"] ?? byCulture.中原;
}

/** 合成村里那一家铺子：杂货铺备一货架，茶棚与客栈摆座位 */
export function makeVillageShop(
  kind: VillageBuildingKind,
  culture: string | undefined,
  sceneId: string,
  spot: number,
  idx: number,
): Shop {
  const name = villageBuildingName(kind, culture);
  const shop: Shop = { id: `village-${sceneId}-${spot}-${kind}-${idx}`, kind, name };
  if (kind === "杂货铺") {
    shop.goods = rollGoods(culture, 8);
  } else {
    shop.seats = rollSeats(kind, sceneId, spot, culture, name);
  }
  return shop;
}

/** 打听之后村里有哪些人：与平民住宅一样，掷定即固定 */
export function rollVillageNpcs(cityId: string, districtId: number, name: string, culture?: string): Relation[] {
  return rollDistrictNpcs(name, cityId, districtId, culture, 3);
}
