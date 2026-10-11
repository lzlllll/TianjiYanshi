/**
 * 客栈茶棚的菜牌。
 *
 * 六种文化背景各有一份预设菜：名字、价钱、一句话说明，以及吃下去的益处。
 * 益处都做得轻微，且只顶一阵子——按游戏时辰算，吃到什么时辰为止，
 * 图的是那股热乎劲儿，不足以改变局面。
 */

import type { Buff, BuffTargetStat, BuffValueType, GameTime } from "@/data/types";
import { shiftGameTime } from "@/lib/gameTime";

export interface Dish {
  name: string;
  /** 一句话说明 */
  desc: string;
  /** 价钱，单位下品灵石 */
  price: number;
  /** 单字图标 */
  icon: string;
  /** 益处叫什么名目，如「饱暖」「微醺」 */
  buffName: string;
  stat: BuffTargetStat;
  value: number;
  valueType: BuffValueType;
  /** 顶几个时辰 */
  hours: number;
}

const 中原菜: Dish[] = [
  { name: "羊肉泡馍", desc: "滚汤泡着掰碎的馍，就一碟糖蒜。", price: 20, icon: "馍", buffName: "饱暖", stat: "vitality", value: 3, valueType: "fixed", hours: 12 },
  { name: "阳春面", desc: "清汤细面，撒一把青蒜，便宜又实在。", price: 8, icon: "面", buffName: "暖胃", stat: "maxHp", value: 4, valueType: "fixed", hours: 6 },
  { name: "胡辣汤", desc: "辛香酸辣，喝下去额上就见了汗。", price: 10, icon: "汤", buffName: "发汗", stat: "vitality", value: 2, valueType: "fixed", hours: 18 },
  { name: "卤牛肉", desc: "切得薄薄的酱牛肉，配着酒最好。", price: 26, icon: "肉", buffName: "长力", stat: "attack", value: 4, valueType: "fixed", hours: 12 },
  { name: "驴肉火烧", desc: "外皮酥脆，夹得满满一层熟肉。", price: 16, icon: "火", buffName: "顶饿", stat: "maxHp", value: 3, valueType: "fixed", hours: 12 },
  { name: "烧刀子", desc: "一小壶烈酒，入喉像一条火线。", price: 12, icon: "酒", buffName: "微醺", stat: "speed", value: 2, valueType: "fixed", hours: 6 },
];

const 江南菜: Dish[] = [
  { name: "蟹粉小笼", desc: "皮薄汁多，咬开要先吸一口汤。", price: 28, icon: "笼", buffName: "鲜美", stat: "wisdom", value: 3, valueType: "fixed", hours: 12 },
  { name: "莼菜羹", desc: "碧色滑嫩，据说是旧时贡品。", price: 18, icon: "羹", buffName: "清心", stat: "soul", value: 3, valueType: "fixed", hours: 12 },
  { name: "桂花酿", desc: "甜香微醺，女子也爱喝一盏。", price: 15, icon: "酿", buffName: "微醺", stat: "speed", value: 2, valueType: "fixed", hours: 6 },
  { name: "阳澄醉蟹", desc: "酒香浸透的蟹，膏黄冰凉。", price: 34, icon: "蟹", buffName: "长力", stat: "attack", value: 3, valueType: "fixed", hours: 12 },
  { name: "青团", desc: "艾草揉进糯米，一口春气。", price: 9, icon: "团", buffName: "暖胃", stat: "maxHp", value: 4, valueType: "fixed", hours: 6 },
  { name: "松鼠鳜鱼", desc: "浇上滚烫的酸甜汁，滋滋作响。", price: 42, icon: "鱼", buffName: "开怀", stat: "vitality", value: 4, valueType: "fixed", hours: 18 },
];

const 苗疆菜: Dish[] = [
  { name: "酸汤鱼", desc: "汤色乳白，酸得人眉毛一挑。", price: 26, icon: "鱼", buffName: "开胃", stat: "vitality", value: 3, valueType: "fixed", hours: 12 },
  { name: "竹筒饭", desc: "糯米混着腊味，在竹筒里蒸熟。", price: 12, icon: "竹", buffName: "顶饿", stat: "maxHp", value: 5, valueType: "fixed", hours: 12 },
  { name: "五色糯米饭", desc: "用草叶染成五色，看着就喜庆。", price: 14, icon: "饭", buffName: "顺气", stat: "soul", value: 3, valueType: "fixed", hours: 12 },
  { name: "蜂蛹酥", desc: "炸得金黄，胆大的人才敢下筷。", price: 22, icon: "酥", buffName: "长力", stat: "attack", value: 4, valueType: "fixed", hours: 12 },
  { name: "腌酸笋", desc: "气味冲鼻，本地人却顿顿少不了。", price: 8, icon: "笋", buffName: "清心", stat: "mp", value: 4, valueType: "fixed", hours: 18 },
  { name: "山栏米酒", desc: "土法酿的米酒，甜里带辣。", price: 10, icon: "酒", buffName: "微醺", stat: "speed", value: 2, valueType: "fixed", hours: 6 },
];

const 西域菜: Dish[] = [
  { name: "烤羊肉串", desc: "炭火上滋滋冒油，撒着孜然。", price: 18, icon: "串", buffName: "长力", stat: "attack", value: 4, valueType: "fixed", hours: 12 },
  { name: "手抓饭", desc: "油亮的米粒里埋着胡萝卜与羊肉。", price: 22, icon: "饭", buffName: "顶饿", stat: "maxHp", value: 5, valueType: "fixed", hours: 12 },
  { name: "胡饼", desc: "烤得焦黄，揣在怀里能放几日。", price: 6, icon: "饼", buffName: "顶饿", stat: "maxHp", value: 3, valueType: "fixed", hours: 6 },
  { name: "葡萄酿", desc: "西域来的酒，色如深紫宝石。", price: 20, icon: "酿", buffName: "微醺", stat: "speed", value: 3, valueType: "fixed", hours: 6 },
  { name: "沙枣糕", desc: "细沙似的甜，压得住口干。", price: 9, icon: "糕", buffName: "生津", stat: "mp", value: 4, valueType: "fixed", hours: 18 },
  { name: "骆驼奶", desc: "酸中带咸，据说是路上最好的一口。", price: 13, icon: "奶", buffName: "暖胃", stat: "vitality", value: 3, valueType: "fixed", hours: 12 },
];

const 漠北菜: Dish[] = [
  { name: "手把肉", desc: "大块羊肉下锅，捞起来蘸盐就吃。", price: 24, icon: "肉", buffName: "长力", stat: "attack", value: 4, valueType: "fixed", hours: 12 },
  { name: "马奶酒", desc: "略酸微醺，喝惯的人离不了。", price: 12, icon: "酒", buffName: "微醺", stat: "speed", value: 3, valueType: "fixed", hours: 6 },
  { name: "奶茶", desc: "砖茶熬开兑上奶，撒一把盐。", price: 7, icon: "茶", buffName: "暖身", stat: "vitality", value: 3, valueType: "fixed", hours: 18 },
  { name: "烤羊腿", desc: "整只架上火，外焦里嫩。", price: 38, icon: "腿", buffName: "壮气", stat: "maxHp", value: 6, valueType: "fixed", hours: 12 },
  { name: "血肠", desc: "灌得紧实，切开来是乌黑的一圈。", price: 15, icon: "肠", buffName: "补血", stat: "maxHp", value: 5, valueType: "fixed", hours: 6 },
  { name: "炒米", desc: "干炒的糜子，抓一把就能充饥。", price: 5, icon: "米", buffName: "顶饿", stat: "maxHp", value: 2, valueType: "fixed", hours: 12 },
];

const 日韩菜: Dish[] = [
  { name: "味噌汤", desc: "一碟小菜一碗汤，吃着清爽。", price: 10, icon: "汤", buffName: "清心", stat: "soul", value: 3, valueType: "fixed", hours: 12 },
  { name: "荞麦面", desc: "盛在竹屉上，蘸汁吃，凉而滑。", price: 14, icon: "面", buffName: "爽利", stat: "speed", value: 3, valueType: "fixed", hours: 12 },
  { name: "天妇罗", desc: "裹了薄糊炸得酥脆，趁热最好。", price: 20, icon: "炸", buffName: "开怀", stat: "vitality", value: 3, valueType: "fixed", hours: 12 },
  { name: "清酒", desc: "温过的小壶，一口下去暖到指尖。", price: 16, icon: "酒", buffName: "微醺", stat: "speed", value: 2, valueType: "fixed", hours: 6 },
  { name: "茶泡饭", desc: "冷饭浇上热茶，撒些海苔碎。", price: 8, icon: "饭", buffName: "暖胃", stat: "maxHp", value: 4, valueType: "fixed", hours: 6 },
  { name: "烤鱼", desc: "整尾串在签上，盐烤得皮脆肉嫩。", price: 26, icon: "鱼", buffName: "长力", stat: "attack", value: 4, valueType: "fixed", hours: 12 },
];

/** 六地的菜牌；认不出的文化背景照中原来 */
export const CULTURE_DISHES: Record<string, Dish[]> = {
  中原: 中原菜,
  江南: 江南菜,
  苗疆: 苗疆菜,
  西域: 西域菜,
  漠北: 漠北菜,
  日韩: 日韩菜,
};

export function dishesFor(culture: string | undefined): Dish[] {
  return (culture && CULTURE_DISHES[culture]) || CULTURE_DISHES.中原;
}

/** 一道菜吃下去顶的那一阵；到了时辰自行消退 */
export function dishBuff(dish: Dish, source: string, now: GameTime): Buff {
  return {
    id: `dish-${dish.name}`,
    name: dish.buffName,
    category: "attribute",
    icon: dish.icon,
    durationType: "until",
    until: shiftGameTime(now, dish.hours),
    stacks: 1,
    maxStacks: 1,
    effects: [{ stat: dish.stat, valueType: dish.valueType, value: dish.value }],
    isDebuff: false,
    source,
    description: dish.desc,
  };
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** 随便上一道当地的菜；人家做东时用得上 */
export function randomDish(culture: string | undefined): Dish {
  return pick(dishesFor(culture));
}
