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

/** 按文化圈取一个村名 */
export function rollVillageName(culture?: string): string {
  const pool = (culture && VILLAGE_NAMES[culture]) || VILLAGE_NAMES.中原;
  return pick(pool);
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
