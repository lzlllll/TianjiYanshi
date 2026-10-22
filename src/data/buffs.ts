/**
 * 增益与减益的名录。
 *
 * 叙事里落下的状态一律从这里挑：模型只报「哪一条」与「顶多久」，
 * 名目、类别、图标与效力都由这张表说了算。
 * 表外的名目一概不认——模型可以现编一段故事，却编不出一条程序算不出的状态。
 *
 * 效力里的 stat 必须落在 BuffTargetStat 之内，value 为数值，
 * 这样界面、战斗与往后的结算都读得懂。
 */

import type { Buff, BuffCategory, BuffTargetStat, BuffValueType } from "@/data/types";

export interface BuffTemplate {
  id: string;
  name: string;
  category: BuffCategory;
  icon: string;
  isDebuff: boolean;
  /** 效力：stat 取 BuffTargetStat 之一，valueType 与 value 决定怎么算 */
  effects: { stat: BuffTargetStat; valueType: BuffValueType; value: number }[];
  /** 平日的默认时长，几个时辰 */
  hours: number;
  /** 最多叠几层 */
  maxStacks: number;
  desc: string;
}

const t = (
  id: string,
  name: string,
  icon: string,
  isDebuff: boolean,
  category: BuffCategory,
  stat: BuffTargetStat,
  value: number,
  hours: number,
  desc: string,
  maxStacks = 1,
): BuffTemplate => ({
  id,
  name,
  icon,
  isDebuff,
  category,
  effects: [{ stat, valueType: "fixed", value }],
  hours,
  maxStacks,
  desc,
});

/** 名录：增益在前，减益在后；行医用药、起誓下咒都从这里挑 */
export const BUFF_TEMPLATES: BuffTemplate[] = [
  // ===== 增益 =====
  t("buff-vigor", "勇力", "勇", false, "attribute", "attack", 6, 6, "气血鼓荡，出手比平日重了几分"),
  t("buff-ironbone", "铁骨", "铁", false, "defense", "defense", 6, 6, "皮肉绷紧如铁，硬受几下也不见伤"),
  t("buff-lightbody", "身轻", "轻", false, "action", "speed", 5, 4, "脚下发飘，进退都比人快半拍"),
  t("buff-clear-mind", "清明", "明", false, "attribute", "wisdom", 5, 6, "心思澄澈，看事看物都比平日分明"),
  t("buff-gather-qi", "聚灵", "灵", false, "cultivation", "cultivation", 30, 6, "灵气自行往身上汇，修行快过寻常"),
  t("buff-spirit-flow", "通脉", "脉", false, "cultivation", "meridianRepair", 10, 12, "经络舒展开来，旧伤也在悄悄弥合"),
  t("buff-insight", "顿悟", "悟", false, "cultivation", "comprehension", 10, 4, "心头一亮，往日想不通的一下就透了"),
  t("buff-fortune", "财运", "财", false, "special", "trading", 10, 12, "谈买卖时话头顺，价钱也好商量"),
  t("buff-keen-eye", "眼神", "目", false, "attack", "critRate", 5, 4, "目力凝聚，出手专挑对方的空当"),
  t("buff-qi-surge", "灵息", "息", false, "resource", "mp", 20, 4, "丹田里灵力充盈，一时用不尽"),
  t("buff-calm-spirit", "定神", "定", false, "attribute", "soul", 5, 6, "神魂安定了下来，外物扰不动"),
  // 伤后调养最常见的酬谢：气血回得快些
  t("buff-mend", "疗伤", "愈", false, "attribute", "hp", 30, 6, "伤处收了口，气血一程程补回来"),
  t("buff-warding", "护体", "护", false, "defense", "defense", 10, 2, "一层薄光罩住周身，急切间不好破", 1),

  // ===== 减益 =====
  t("debuff-cold", "风寒", "寒", true, "attribute", "vitality", -5, 12, "寒气入体，四肢发沉，做事提不起劲", 3),
  t("debuff-poison", "中毒", "毒", true, "dot", "hp", -8, 6, "毒在血里走，过一阵便要疼上一回", 3),
  t("debuff-internal-injury", "内伤", "伤", true, "defense", "maxHp", -20, 24, "脏腑受了暗创，能扛的伤底子薄了一层"),
  t("debuff-exhausted", "力竭", "竭", true, "attribute", "attack", -6, 6, "手脚发软，用不出平日的力气", 2),
  t("debuff-sluggish", "迟缓", "滞", true, "action", "speed", -5, 6, "举手投足都像陷在泥里，慢了一拍"),
  t("debuff-dizzy", "目眩", "眩", true, "attack", "critRate", -8, 4, "眼前发花，出手全无准头"),
  t("debuff-weak", "虚弱", "弱", true, "attribute", "vitality", -6, 12, "身上没劲，做事比平日慢一分"),
  t("debuff-meridian-hurt", "经脉受损", "损", true, "cultivation", "meridianRepair", -12, 24, "经络涩滞，运气行功处处不顺"),
  t("debuff-demon", "心魔", "魔", true, "status", "wisdom", -8, 24, "心头翻涌着说不清的念头，静不下来"),
  t("debuff-karma", "业力缠身", "业", true, "special", "karma", 5, 24, "做过的事压在身上，走到哪儿都沉"),
  t("debuff-dry-qi", "灵力枯竭", "涸", true, "resource", "mp", -20, 6, "丹田空空，一时半会儿补不回来", 2),
  t("debuff-hunger", "饥寒", "饥", true, "attribute", "vitality", -4, 3, "肚子里空着，冷风一吹就抖"),
  t("debuff-fright", "惊惧", "惧", true, "attribute", "soul", -5, 4, "方才那一幕还压在心上，神魂不定"),
  // 门中光景不好时落在弟子头上的一条；由宗门日结自己加上，不由叙事挑
  t("debuff-sect-broke", "拮据", "窘", true, "cultivation", "cultivation", -25, 36, "门中银钱不继，连修行也受了牵累", 2),
];

/** 名录里按 id 或名字找一条；两头包含也算认得出 */
export function findBuffTemplate(asked: unknown): BuffTemplate | undefined {
  const key = String(asked ?? "").trim();
  if (!key) return undefined;
  return (
    BUFF_TEMPLATES.find((x) => x.id === key) ??
    BUFF_TEMPLATES.find((x) => x.name === key) ??
    BUFF_TEMPLATES.find((x) => key.includes(x.name) || x.name.includes(key))
  );
}

/** 照名录里那一条立起一份状态；顶多久由调用方给 */
export function buffFromTemplate(
  tpl: BuffTemplate,
  patch: Partial<Buff> = {},
): Buff {
  return {
    id: tpl.id,
    name: tpl.name,
    category: tpl.category,
    icon: tpl.icon,
    durationType: "until",
    stacks: 1,
    maxStacks: tpl.maxStacks,
    effects: tpl.effects.map((e) => ({ ...e })),
    isDebuff: tpl.isDebuff,
    description: tpl.desc,
    ...patch,
  };
}

/**
 * 名录的简报，供提示词里下发。
 * 模型据此挑名目，不再自己编状态。
 */
export function buffCatalogBrief(): string {
  const line = (x: BuffTemplate) => {
    const effect = x.effects
      .map((e) => `${e.value > 0 ? "+" : ""}${e.value} ${e.stat}`)
      .join("、");
    return `${x.id} ${x.name}（${x.isDebuff ? "减益" : "增益"}·${x.category}·${effect}·默认${x.hours}个时辰）`;
  };
  return BUFF_TEMPLATES.map(line).join("\n");
}
