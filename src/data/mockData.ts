import type {
  Player,
  RealmTier,
  HeartModifier,
  BuffTargetStat,
} from "./types";

/**
 * 境界表。表上某一档的 cultivationNeeded，是「由上一档跨到这一档」所需的修为，
 * 即涨到这一档的数额便算突破，多出来的修为带进下一档。
 *
 * 数额的底子：修炼每时辰得 1 点进度，每日专心四个时辰，一昼夜四点。
 * 以此为准，炼气初期到炼气圆满合计 4320 点，正是一千零八十日、三年整；
 * 引气期是凡人起步的短程，合 760 点；筑基之后每上一层，总量约为此前的四倍。
 * 后续各境（金丹、元婴、化神、合体、渡劫、大乘）都照这个倍数排下来。
 */
export const REALMS: RealmTier[] = [
  // 引气：合计 760
  { name: "引气", stage: "初期", cultivationNeeded: 100 },
  { name: "引气", stage: "中期", cultivationNeeded: 120 },
  { name: "引气", stage: "后期", cultivationNeeded: 240 },
  { name: "引气", stage: "圆满", cultivationNeeded: 400 },
  // 炼气：合计 4320，三年
  { name: "炼气", stage: "初期", cultivationNeeded: 700 },
  { name: "炼气", stage: "中期", cultivationNeeded: 1000 },
  { name: "炼气", stage: "后期", cultivationNeeded: 1400 },
  { name: "炼气", stage: "圆满", cultivationNeeded: 1920 },
  // 筑基：合计 18000
  { name: "筑基", stage: "初期", cultivationNeeded: 3000 },
  { name: "筑基", stage: "中期", cultivationNeeded: 4500 },
  { name: "筑基", stage: "后期", cultivationNeeded: 5900 },
  { name: "筑基", stage: "圆满", cultivationNeeded: 7600 },
  // 金丹：合计 75000
  { name: "金丹", stage: "初期", cultivationNeeded: 12000 },
  { name: "金丹", stage: "中期", cultivationNeeded: 18000 },
  { name: "金丹", stage: "后期", cultivationNeeded: 25000 },
  { name: "金丹", stage: "圆满", cultivationNeeded: 32000 },
  // 元婴：合计 313000
  { name: "元婴", stage: "初期", cultivationNeeded: 50000 },
  { name: "元婴", stage: "中期", cultivationNeeded: 78000 },
  { name: "元婴", stage: "后期", cultivationNeeded: 103000 },
  { name: "元婴", stage: "圆满", cultivationNeeded: 132000 },
  // 化神：合计 1300000
  { name: "化神", stage: "初期", cultivationNeeded: 200000 },
  { name: "化神", stage: "中期", cultivationNeeded: 325000 },
  { name: "化神", stage: "后期", cultivationNeeded: 429000 },
  { name: "化神", stage: "圆满", cultivationNeeded: 546000 },
  // 合体：合计 5400000
  { name: "合体", stage: "初期", cultivationNeeded: 800000 },
  { name: "合体", stage: "中期", cultivationNeeded: 1350000 },
  { name: "合体", stage: "后期", cultivationNeeded: 1780000 },
  { name: "合体", stage: "圆满", cultivationNeeded: 2270000 },
  // 渡劫：合计 22500000
  { name: "渡劫", stage: "初期", cultivationNeeded: 3300000 },
  { name: "渡劫", stage: "中期", cultivationNeeded: 5600000 },
  { name: "渡劫", stage: "后期", cultivationNeeded: 7400000 },
  { name: "渡劫", stage: "圆满", cultivationNeeded: 9500000 },
  // 大乘：合计 94000000
  { name: "大乘", stage: "初期", cultivationNeeded: 13000000 },
  { name: "大乘", stage: "中期", cultivationNeeded: 23500000 },
  { name: "大乘", stage: "后期", cultivationNeeded: 31000000 },
  { name: "大乘", stage: "圆满", cultivationNeeded: 39500000 },
  { name: "真仙", stage: "飞升", cultivationNeeded: 0 },
];

/**
 * 境界扁平表：大境界名 + 阶段，索引即 player.realmIndex。
 * 提示词与数据解析都必须以此为准，否则高境界角色会被判成「未知」。
 */
export const REALM_NAMES: string[] = REALMS.map((r) => `${r.name}${r.stage}`);

/**
 * 神念传音的门槛：金丹期。
 * 到了金丹，神识撑得起远距离的交谈，天各一方也能说得上话。
 */
export const TALK_MIN_REALM_INDEX = Math.max(0, REALMS.findIndex((r) => r.name === "金丹"));

/** 到金丹了没有；到了便可不在一处交谈 */
export function canConverse(realmIndex: number | undefined): boolean {
  return Number(realmIndex) >= TALK_MIN_REALM_INDEX;
}

/**
 * 能不能与这人交谈。
 * 人在一处，随时可谈，不必讲境界；
 * 不在一处，须到金丹以上，方能以神念传音。
 */
export function canTalkTo(realmIndex: number | undefined, samePlace: boolean): boolean {
  return samePlace || canConverse(realmIndex);
}

export const DAO_PATHS: Record<string, { name: string; description: string }> = {
  sword: { name: "剑道真意", description: "剑修之道，以剑入道，一剑破万法" },
  sharp_weapon: { name: "利器刀锋", description: "刀枪斧钺等利器之术" },
  blunt_weapon: { name: "钝器软兵", description: "锤棍鞭锏等钝器之术" },
  defense: { name: "防御绝技", description: "肉盾/反弹流，以守为攻" },
  archery: { name: "神射星术", description: "弓弩暗器，百步穿杨" },
  hidden_weapon: { name: "万化暗渡", description: "暗器机关，出其不意" },
  unarmed: { name: "赤手空拳", description: "无兵之术，拳掌腿法" },
  elemental: { name: "五行真炁", description: "操纵元素，水火风雷" },
  illusion: { name: "太虚幻象", description: "神魂幻术，迷人心智" },
  curse: { name: "幽冥蛊咒", description: "蛊毒诅咒，诡异莫测" },
  beast_taming: { name: "万灵契法", description: "御兽召唤，万兽为仆" },
  array: { name: "天音阵图", description: "阵法音律，困敌杀敌" },
};

export const HEART_TRAITS: string[] = ["刚毅", "狡黠", "仁厚", "无情", "谨慎", "勇猛", "聪慧", "执着"];

export const ELEMENT_COUNTER: Record<string, string> = {
  "金": "木",
  "木": "土",
  "土": "水",
  "水": "火",
  "火": "金",
};

export const ELEMENT_GENERATE: Record<string, string> = {
  "金": "水",
  "木": "火",
  "土": "金",
  "水": "木",
  "火": "土",
};

export const initialPlayer: Player = {
  name: "",
  title: "",
  gender: "male",
  sectName: "",
  position: "",
  realmIndex: 0,
  realmStage: 0,
  cultivation: 0,
  lifespanCurrent: 100,
  lifespanMax: 100,
  hp: 100,
  hpMax: 100,
  mp: 50,
  mpMax: 50,
  spirit: 100,
  spiritMax: 100,
  spiritRoots: [],
  stats: {
    vitality: 0,
    soul: 0,
    wisdom: 0,
    agility: 0,
    heartScores: [],
  },
  meridians: [],
  body: "",
  fortune: "",
  karma: 0,
  background: "",
  description: "",
  personality: "",
  timeline: [],
  buffs: [],
  shields: [],
  activeHeartTechnique: null,
};

export const HEART_STAT_DISPLAY: Record<string, string> = {
  vitality: "体魄", soul: "神魂", wisdom: "悟性", agility: "身法",
  cultivation: "修炼速度", damage: "伤害", action: "行动力", karma: "机缘",
  attack: "攻击力", defense: "防御", dodge: "闪避", speed: "速度",
  critRate: "暴击率", critDamage: "暴击伤害", breakthrough: "突破几率",
  comprehension: "领悟速度", meridianRepair: "经脉恢复", trading: "交易折扣",
};

export function generateHeartModifiers(trait: string, score: number): HeartModifier[] {
  if (!trait) return [];
  const allStats: BuffTargetStat[] = [
    "vitality", "soul", "wisdom", "agility", "cultivation",
    "damage", "action", "karma", "attack", "defense",
    "dodge", "speed", "critRate", "critDamage", "breakthrough",
    "comprehension", "meridianRepair", "trading",
  ];

  // 线性同余，每次调用都推进种子并取高位，保证同一性格能掷出不同属性
  let seed = trait.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) || 1;
  const rng = (n: number): number => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return (seed >>> 16) % n;
  };

  const count = 2 + rng(3);
  const modifiers: HeartModifier[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    let statIndex = rng(allStats.length);
    let attempts = 0;
    while (used.has(allStats[statIndex]) && attempts < 20) {
      statIndex = rng(allStats.length);
      attempts++;
    }
    const stat = allStats[statIndex];
    used.add(stat);

    // 心性只带来正向加成，强弱由评分决定；不匹配造成的减益在功法与修炼效率里单独结算
    const value = Math.max(1, Math.round((score / 100) * (2 + rng(12))));
    const displayName = HEART_STAT_DISPLAY[stat] || stat;
    modifiers.push({
      stat,
      value,
      description: `${displayName}加成`,
    });
  }

  return modifiers;
}
