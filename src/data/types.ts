import type { District } from "./map/tiles";

/** 左侧六项的侧拉面板 id；问道与百艺各自走独立窗口，不在此列 */
export type PanelId =
  | "profile"
  | "technique"
  | "treasure"
  | "sect"
  | "social"
  | "skill"
  | "status"
  | "fate"
  | "news"
  | "estate"
  | "tokens";

export interface BrewResult {
  success: boolean;
  message: string;
  pillName?: string;
  pillGrade?: ItemGrade;
  pillDesc?: string;
  pillElements?: Record<string, number>;
  outputCount?: number;
}

export type CraftingTab = "talisman" | "alchemy";

export type RelationType = "dao_companion" | "master" | "disciple" | "friend" | "enemy";

/** 街头卖艺的一轮考教 */
export interface BuskRound {
  index: number;
  dc: number;
  roll: number;
  level: number;
  total: number;
  success: boolean;
  /** 这一轮所得，下品灵石 */
  reward: number;
  /** 这一轮之前累计的失手惩罚 */
  penalty: number;
}

/** 一次卖艺的总账 */
export interface BuskResult {
  skill: string;
  rounds: BuskRound[];
  passed: number;
  /** 合计所得，下品灵石 */
  reward: number;
  /** 平民名声的变动 */
  folkDelta: number;
  /** 收场时累计的失手惩罚 */
  penalty: number;
}

export type LocationType =
  | "home"
  | "alchemy_room"
  | "forge_room"
  | "meditation_room"
  | "market"
  | "library"
  | "training_ground"
  | "outdoor";

export interface Location {
  id: LocationType;
  name: string;
  description: string;
  icon: string;
  allowedActions: string[];
}

/** 地图场景种类；城镇内部地图、宗门驻地、秘境洞府都走同一套渲染管线 */
export type MapSceneKind = "world" | "town" | "sect" | "manor" | "dungeon";

/** 一张可渲染的地图。世界地图是根场景，其余场景通过 parentId 挂回上位地图 */
export interface MapScene {
  id: string;
  name: string;
  kind: MapSceneKind;
  /** 主图路径，相对项目根目录；瓦片地图没有主图，留空 */
  image: string;
  /** 上位地图 id；世界地图为 null */
  parentId: string | null;
  /** 坐标系基准尺寸，标点坐标与此同一坐标系 */
  width: number;
  height: number;
  /** 瓦片地图的格子编号，按行铺开；有它就渲染格子而不是图片 */
  tiles?: number[];
  /** 背景底图类型，取自 image_assets/城市背景 的文件名；只有瓦片地图用得上 */
  bg?: string;
  /** 该城所属的文化背景，用来挑同地域的建筑与地形贴图 */
  culture?: string;
  /** 建筑街区的明细，与 tiles 里编号 5 的格子一一对应，按行优先顺序排列 */
  districts?: District[];
  /** 宗门场景专用：该宗门的性质编号（见 src/data/sects.ts 的 nature.id），用来挑贴合的建筑 */
  sectNature?: string;
  /** 宗门场景专用：该宗门的词条名（见 src/data/sects.ts 的 feature.name），用来调建筑配比 */
  sectFeature?: string;
  /** 宗门场景专用：本门已毁的建筑名，注册山门时从点位抄来，排布时按名抹去 */
  sectDestroyed?: string[];
  /** 宅邸场景专用：这一张图对应哪一处宅地 */
  manorPlotId?: string;
}

/** 地图标点种类；新增种类时在此扩展，渲染侧按种类取样式 */
export type MapMarkerKind = "city" | "landmark" | "portal" | "npc";

export interface MapMarker {
  /** 编号，与瓦片地图同号，改名不影响对应 */
  id: string;
  name: string;
  kind: MapMarkerKind;
  /** 文化背景，取地域名（中原／江南／苗疆／西域／漠北／日韩）；地标通常不填 */
  culture?: string;
  /** 所属地图场景 id */
  sceneId: string;
  /** 与所属场景同一坐标系的像素坐标，原点左上 */
  x: number;
  y: number;
  desc?: string;
}

/**
 * 预设点位：只记一处位置——落在哪张图上、哪个坐标。
 * 名目、种类都留到真要开出来时再定，眼下只管把地方圈下，
 * 省得日后要添宗门或秘境时，对着舆图重新找地方。
 */
export interface PresetPoint {
  /** 所属地图场景 id；坐标与所属场景同一坐标系，原点左上 */
  sceneId: string;
  x: number;
  y: number;
  /** 这一处打哪儿来：随游戏发的还是开发者现点的。只给界面看，导出时抹掉 */
  source?: "file" | "local";
}

/**
 * 一张宗门地图模板。宗门不跟城那样一城一份、以编号对应，只作布局底子：
 * 备下几张，日后立宗门时挑一张来用。格子按 15×15 行优先铺开，编号见 src/data/map/sectTiles.ts。
 */
export interface SectMapTemplate {
  id: string;
  name: string;
  tiles: number[];
  /** 这一张依的是什么地势，如「山谷」「海岛」；编号见 src/data/sects.ts 的 SECT_MAP_TYPES。不填便是不限 */
  mapType?: string;
}

/** 一处宗门的词条：记下编号与名目，说明按编号现查；查过的说明顺手记一份，写提示词时不必再翻表 */
export interface SectSiteTerm {
  id: string;
  name: string;
  note?: string;
}

/** 一处山门的宝库：灵石与常料，另记日结算到哪一日 */
export interface SectTreasury {
  spiritStones: number;
  materials: { name: string; amount: number }[];
  /** 上一次日结算到哪一日，免得同日重算 */
  settledDay?: number;
}

/** 两处宗门之间怎么相处 */
export type SectStance = "结盟" | "友好" | "中立" | "敌对" | "附庸";

/**
 * 两处宗门之间的交情。
 * 关系是对称的，一处只记一条：a/b 两个点位编号按字典序排定，免得同一桩事记两遍。
 * 起初一张白纸，由叙事与新闻往里添改；附庸这一档另在附庸一方的点位上记 vassalOf。
 */
export interface SectRelation {
  /** 归一名目：两个点位编号排序后以「|」相连 */
  id: string;
  a: string;
  b: string;
  stance: SectStance;
  /** 交情深浅，-100 至 100 */
  relation: number;
  note?: string;
  /** 结下这一笔的时日，按天序记 */
  sinceDay?: number;
}

/** 被占的是城还是村 */
export type OccupationKind = "city" | "village";

/**
 * 一处归了某宗门所有的城或村。
 * 城与村本身是随地图发的死数据，改不得，故「拥有者」另记在这里一条，
 * 由它来标记这一处城池归哪个宗门；占了便按月收贡金。
 */
export interface Occupation {
  /** 城取标点编号，村取点位 key，合上 kind 便是名下目 */
  targetId: string;
  /** 被占之地的名号，界面上备用 */
  targetName: string;
  kind: OccupationKind;
  /** 占领者的宗门点位编号；本门即 mine 那一处的编号 */
  ownerSectId: string;
  /** 占领者的宗门名号 */
  ownerName: string;
  /** 占下于第几日 */
  sinceDay?: number;
  /** 上一次收贡金是哪个月，按「年-月」记，免得同月重算 */
  settledMonth?: string;
}

/** 城村的归一名目：城 city:2、村 village:world:100,200 */
export function occupationKey(kind: OccupationKind, targetId: string): string {
  return `${kind}:${targetId}`;
}

/**
 * 地图上的一处宗门。
 * 开局照六处文化圈各掷三到五处，落在九州舆图上；名号、四类词条与那一副底子都是现拼的。
 * 玩家自己报过宗门名号的，会在本地的几处里认下一处，标上 mine。
 */
export interface SectSite {
  id: string;
  /** 落在哪张图上 */
  sceneId: string;
  x: number;
  y: number;
  /** 文化圈 */
  culture: string;
  name: string;
  /** 驻地写法，如「长安西南的山谷」 */
  seat: string;
  /** 地图类型编号，见 src/data/sects.ts 的 SECT_MAP_TYPES */
  mapType: string;
  /** 依地势配的那张宗门图模板；没配上的为空 */
  templateId?: string;
  /** 是不是玩家自己的宗门 */
  mine?: boolean;
  /** 这一处若是别家的附庸，记下宗主的点位编号；自主之身没有这一项 */
  vassalOf?: string;
  nature: SectSiteTerm;
  climate: SectSiteTerm;
  feature: SectSiteTerm;
  start: SectSiteTerm;
  level: number;
  reputation: number;
  elders: number;
  disciples: number;
  /** 山门气象 */
  appearance: string;
  /** 江湖风评 */
  reputationDesc: string;
  /** 当前境况 */
  surroundings: string;
  /** 门中宝库：各处山门各有一本账，平日进项与发卖都记在这里 */
  treasury?: SectTreasury;
  /**
   * 玩家在荒地上一手营造的建筑：地块序号 → 建筑名。
   * 山门图本身是死的，自建的这几座另记一笔，渲染与结算时并到图上去。
   */
  built?: Record<string, string>;
  /**
   * 玩家口述、由 AI 拟出账目的自建建筑：建筑名 → 那一份账。
   * 名录里没有的名目，靠这一笔认得出、算得出，也铺得起图。
   */
  custom?: Record<string, CustomFacility>;
  /**
   * 已毁的建筑名：战火、天灾或掌门下令拆毁的，都记在这里。
   * 山门图每次注册都现算，废墟不能只落在图上，故存下名目，铺图时按名抹去。
   * 主殿不在此列，永远不毁。
   */
  destroyed?: string[];
}

/**
 * 玩家自拟的一座宗门建筑。
 * 与名录里那一本账同一个形状——消耗、日产与维护都由 AI 照玩家的说法拟出，
 * 效力仍落在程序认得的几项上，故能照常入账、照常铺图。
 */
export interface CustomFacility {
  /** 归入哪一类地块：定贴图、定这一处能做的几件事 */
  kindId: FacilityKindId;
  /** 营造的消耗 */
  cost: { stones: number; materials: { name: string; amount: number }[] };
  /** 加成：这一处给门中添的好处，一句说明 */
  effect?: string;
  /** 账目：日产与维护 */
  info: {
    note: string;
    scene: string;
    produce?: { name: string; base: number }[];
    stone?: number;
    reputation?: number;
    upkeep: number;
  };
}

/** 一座城市或地标的瓦片地图；id 与标点编号同号 */
export interface TileMapEntry {
  id: string;
  /** 背景底图类型；不填则为纯色底 */
  bg?: string;
  /** 10×10 的格子编号，长度 100，按行铺开 */
  tiles: number[];
  /** 建筑街区的明细，与地图上编号 5 的格子一一对应，按行优先顺序排列 */
  districts?: District[];
}

export type ItemGrade = "凡品" | "灵品" | "玄品" | "天品" | "仙品";

export type TechniqueCategory = "心法" | "炼体" | "神通" | "身法" | "秘术";

export type DaoPath =
  | "sword"
  | "sharp_weapon"
  | "blunt_weapon"
  | "defense"
  | "archery"
  | "hidden_weapon"
  | "unarmed"
  | "elemental"
  | "illusion"
  | "curse"
  | "beast_taming"
  | "array";

export type HeartTrait = string;

export interface HeartModifier {
  stat: BuffTargetStat;
  value: number;
  description: string;
}

export interface HeartScore {
  trait: HeartTrait;
  score: number;
  modifiers: HeartModifier[];
}

export interface RealmTier {
  name: string;
  stage: string;
  cultivationNeeded: number;
}

export type BuffCategory =
  | "attribute"
  | "attack"
  | "defense"
  | "action"
  | "cultivation"
  | "resource"
  | "status"
  | "dot"
  | "penetration"
  | "special";

/**
 * 状态的计时方式。
 * 非战斗的一律按游戏时辰算（until），战斗里的临时状态按柱香算（incense）；
 * 另有永久、条件式与瞬时三种，都不计时。
 */
export type BuffDurationType = "until" | "incense" | "permanent" | "conditional" | "instant";

export type BuffTargetStat =
  | "vitality"
  | "soul"
  | "wisdom"
  | "agility"
  | "hp"
  | "mp"
  | "spirit"
  | "cultivation"
  | "maxHp"
  | "maxMp"
  | "maxSpirit"
  | "action"
  | "karma"
  | "damage"
  | "attack"
  | "defense"
  | "dodge"
  | "speed"
  | "critRate"
  | "critDamage"
  | "breakthrough"
  | "comprehension"
  | "meridianRepair"
  | "trading";

export type BuffValueType = "percentage" | "fixed" | "multiplier";

export interface BuffEffect {
  stat?: BuffTargetStat;
  valueType: BuffValueType;
  value: number;
  condition?: string;
  description?: string;
}

export interface Buff {
  id: string;
  name: string;
  category: BuffCategory;
  icon: string;
  durationType: BuffDurationType;
  /**
   * 还能顶几柱香；durationType 为 "incense" 时有效。
   * 战斗里每烧满一柱便减一，减到零就散了。
   */
  duration?: number;
  /**
   * 按游戏时间算的失效时刻；durationType 为 "until" 时有效。
   * 到了这个时辰就不再算数，界面写作「持续到……」。
   */
  until?: GameTime;
  stacks: number;
  maxStacks: number;
  effects: BuffEffect[];
  isDebuff: boolean;
  source?: string;
  description?: string;
  condition?: string;
}

export interface ShieldData {
  id: string;
  name: string;
  value: number;
  maxValue: number;
  source?: string;
}

export interface DamageResult {
  baseDamage: number;
  finalDamage: number;
  absorbedByShield: number;
  shieldRemaining: number;
  modifiers: {
    attackBonus: number;
    damageBonus: number;
    critMultiplier: number;
    specialBonus: number;
    armorReduction: number;
    directReduction: number;
    penetration: number;
  };
}

export interface HealingResult {
  baseHeal: number;
  finalHeal: number;
  modifiers: {
    healingBonus: number;
  };
}

export interface AttributeModifiers {
  vitality: number;
  soul: number;
  wisdom: number;
  agility: number;
  hp: number;
  mp: number;
  spirit: number;
  cultivation: number;
}

export interface CombatModifiers {
  attackPower: number;
  damageIncrease: number;
  damageReduction: number;
  critRate: number;
  critDamage: number;
  armor: number;
  directDamageReduction: number;
  dodgeRate: number;
  hitRate: number;
  cooldownReduction: number;
}

export interface CultivationModifiers {
  speedBonus: number;
  speedPenalty: number;
  qualityBonus: number;
  successRateBonus: number;
}

export interface ResourceModifiers {
  mpCostReduction: number;
  hpCostReduction: number;
  lifespanCostReduction: number;
}

export interface PenetrationModifiers {
  armorPenetration: number;
  resistancePenetration: number;
  absolutePenetration: boolean;
}

export interface RealmTier {
  name: string;
  stage: string;
  cultivationNeeded: number;
}

export interface SpiritRoot {
  element: ElementType;
  value: number;
  isVariant?: boolean;
}

export type MeridianZone = "head" | "chest" | "abdomen" | "arm_left" | "arm_right" | "leg_left" | "leg_right";

export interface Meridian {
  id: string;
  name: string;
  clarity: number;
  maxClarity: number;
  damage: boolean;
  zone: MeridianZone;
}

export interface PlayerStats {
  vitality: number;
  soul: number;
  wisdom: number;
  agility: number;
  heartScores: HeartScore[];
}

export interface TimelineEvent {
  year: string;
  title: string;
  detail: string;
}

export interface Player {
  name: string;
  title: string;
  gender: "male" | "female";
  sectName: string;
  position: string;
  realmIndex: number;
  realmStage: number;
  cultivation: number;
  /** 年岁：开局自述里报的那个岁数；余寿由它和上限算出来 */
  age?: number;
  /** 余寿：还剩几年 */
  lifespanCurrent: number;
  /** 寿元上限 */
  lifespanMax: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  spirit: number;
  spiritMax: number;
  spiritRoots: SpiritRoot[];
  stats: PlayerStats;
  meridians: Meridian[];
  body: string;
  fortune: string;
  karma: number;
  timeline: TimelineEvent[];
  background: string;
  description: string;
  personality: string;
  buffs: Buff[];
  shields: ShieldData[];
  activeHeartTechnique: string | null;
}

export type ElementType = "金" | "木" | "水" | "火" | "土" | "风" | "雷" | "冰" | "暗";

export type TechniqueNature = "刚" | "柔" | "奇" | "毒" | "速" | "稳" | "幻" | "霸";

export interface TechniqueLevel {
  level: number;
  name: string;
  proficiencyNeeded: number;
  stats: Record<string, number>;
  skillUnlocked?: string;
}

export interface TechniqueSkill {
  id: string;
  name: string;
  description: string;
  levelRequired: number;
  mpCost: number;
  damage: number;
  cooldown: number;
  effects: BuffEffect[];
  /** 命中后负面效果维持几柱香；缺省按 3 柱算 */
  debuffDuration?: number;
  /**
   * 心法催运：不耗灵力，改为耗气血，并把灵力补回来。
   * 两项皆为正数才算数；只有 category 为 心法 的功法能用这一路。
   */
  hpCost?: number;
  /** 这一招运转之后回复多少灵力；与 hpCost 成对出现 */
  mpRestore?: number;
}

export interface TechniquePrerequisite {
  type: "realm" | "cultivation" | "technique" | "spiritRoot" | "heartTrait";
  value: string | number;
  minLevel?: number;
}

export interface HeartCompatibility {
  trait: HeartTrait;
  bonus: number;
}

export interface Technique {
  id: string;
  name: string;
  grade: ItemGrade;
  category: TechniqueCategory;
  daoPath: DaoPath;
  element: ElementType;
  nature: TechniqueNature;
  proficiency: number;
  proficiencyMax: number;
  insight: string;
  description: string;
  heartMatch: HeartTrait[];
  heartCompatibility: HeartCompatibility[];
  levels: TechniqueLevel[];
  skills: TechniqueSkill[];
  prerequisites: TechniquePrerequisite[];
  attributes: Record<string, number>;
  basePracticeSpeed: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: "材料" | "丹药" | "符箓" | "法宝" | "杂物" | "灵兽";
  grade: ItemGrade;
  count: number;
  icon: string;
  desc: string;
  equipped?: boolean;
  slot?: "命" | "护" | "辅";
  elements?: Partial<Record<ElementType, number>>;
  /** 收来的旧物，还没看出究竟是什么；留待日后鉴宝 */
  mystery?: boolean;
}

export interface SpiritStones {
  low: number;
  mid: number;
  high: number;
  supreme: number;
}

/**
 * 随身灵兽：一身只带一头。
 * 灵兽栏里买下的兽，收作随身之后便跟着你上路，遇斗时替你出手。
 * 亲疏靠相处攒，攒得厚了出手也肯出力。
 */
export interface SpiritBeast {
  /** 兽名，如「灵秀雪狐」 */
  name: string;
  /** 说明：通人语、善寻物之类 */
  desc: string;
  /** 脾性一两句，叙事与战斗里由它来演 */
  temper: string;
  /** 界面上的一个汉字 */
  icon: string;
  hp: number;
  hpMax: number;
  attack: number;
  defense: number;
  speed: number;
  /** 亲疏，0 到 100 */
  bond: number;
}

export type TalismanElement = "金" | "木" | "水" | "火" | "土" | "风" | "雷" | "冰" | "暗";

export type TalismanAction = "引" | "保" | "封" | "助" | "破" | "灭" | "惑" | "愈" | "遁";

export interface TalismanModifier {
  id: string;
  name: string;
  type: "range" | "trigger" | "duration" | "strength" | "target" | "cost";
  effect: string;
  mpCost: number;
  paperCost: number;
}

export interface TalismanRecipe {
  id: string;
  name: string;
  grade: ItemGrade;
  paperCost: number;
  cinnabarCost: number;
  successRate: number;
  mpCost: number;
  desc: string;
  element: TalismanElement;
  action: TalismanAction;
  modifiers: string[];
}

export interface TalismanCraftState {
  element: TalismanElement | null;
  action: TalismanAction | null;
  modifiers: string[];
}

export interface AlchemyRecipe {
  id: string;
  name: string;
  grade: ItemGrade;
  herbs: { name: string; count: number }[];
  fireRange: [number, number];
  durationRange: [number, number];
  successRate: number;
  mpCost: number;
  output: string;
  desc: string;
  furnaceElements?: Partial<Record<ElementType, number>>;
}

export interface SectPosition {
  id: string;
  name: string;
  level: number;
  contributionNeeded: number;
  privilege: string;
  isCurrent?: boolean;
  unlocked?: boolean;
}

export interface SectTask {
  id: string;
  title: string;
  difficulty: "易" | "中" | "难" | "险";
  contribution: number;
  spiritStone: number;
  desc: string;
  accepted?: boolean;
  /** 交差的条件，写在字面上给人看 */
  condition?: string;
  /** 去处的地名 */
  place?: string;
  /** 限期几日 */
  days?: number;
  /** 交差的期限日序，接下时钉死 */
  dueDay?: number;
  /** 要办到哪儿去；有了它便在城图上星标出来 */
  target?: JobTarget;
  /** 办到目标地块上要打交道的人 */
  cast?: JobCastRole[];
  /** 这事儿已经了结——交差或误期，不再挂在板上 */
  settled?: boolean;
  /** 接取后挂在机缘上的那一桩的编号 */
  questId?: string;
}

export interface SectShopItem {
  id: string;
  name: string;
  cost: number;
  type: string;
  desc: string;
}

export interface SectHeritage {
  name: string;
  type: "功法" | "秘术" | "阵法" | "丹方" | "符箓";
  grade: ItemGrade;
  status: "已习" | "可习" | "未达";
}

export interface SectResource {
  name: string;
  amount: number;
  unit: string;
}

export interface SectIndustry {
  id: string;
  name: string;
  production: string;
  investment: number;
  description: string;
  level: number;
}

/** 建筑按地块用场分的十类；与 src/data/map/sectTiles.ts 的建筑地块一一对应 */
export type FacilityKindId =
  | "hall"
  | "scripture"
  | "martial"
  | "alchemy"
  | "forge"
  | "spirit"
  | "farm"
  | "beast"
  | "array"
  | "housing";

/** 一座宗门建筑的养成状态；存档里缺项便按 Lv.1、正常算 */
export interface SectFacilityState {
  /** 等级 Lv.1-5 */
  level: number;
  status: "正常" | "修缮中" | "停用";
}

export interface SectActivity {
  id: string;
  name: string;
  type: "大比" | "试炼" | "庆典" | "祭祀" | "远征";
  status: "筹备中" | "进行中" | "已结束";
  target: string;
  description: string;
}

export interface SectHall {
  id: string;
  name: string;
  master: string;
  masterRealm: string;
  currentTask: string;
  memberCount: number;
  maxMembers: number;
  description: string;
}

export interface SectManagement {
  industries: SectIndustry[];
  activities: SectActivity[];
  halls: SectHall[];
  treasury: SectTreasury;
  consumption: {
    dailyCost: number;
    recentConsumption: { date: string; cost: number }[];
  };
}

export type NewsCategory = "官府公告" | "宗门布告" | "市井传言";

export interface NewsItem {
  id: string;
  category: NewsCategory;
  title: string;
  content: string;
  date: string;
  source: string;
}

export interface NewsState {
  items: NewsItem[];
  lastUpdate: string;
}

/**
 * 最近听来的一耳朵话：打尖时邻桌的议论、旁人漏出来的口风。
 * 只留一个月，过期的不再算数。
 */
export interface Rumor {
  id: string;
  text: string;
  /** 从哪儿听来的，如「杏花楼·邻桌」 */
  source: string;
  /** 在哪座城听来的，如「长安」；旧存档里没有这一项 */
  city?: string;
  /** 听到那天的日序，用于判过期 */
  day: number;
}

/** 瓦舍听戏的场次记录：一日之内最多听两场 */
export interface WaseShows {
  /** 记的是哪一天，日序对不上就当日次从头算 */
  day: number;
  count: number;
}

/**
 * 押在当铺里的一张当票。
 * 东西当场交出去，换回七成价钱的灵石；到期不来赎，那件东西就归了当铺。
 */
export interface PawnTicket {
  id: string;
  /** 押出去的那件东西，赎回来还是原样 */
  item: InventoryItem;
  /** 在哪家当铺押的；赎只能回这一家 */
  shopId: string;
  shopName: string;
  cityId: string;
  districtId: number;
  /** 当得的灵石，也是赎回要付的数目 */
  price: number;
  /** 当出去那天的日序 */
  day: number;
  /** 到这天打烊还不见人来赎，就成了死当 */
  dueDay: number;
}

/**
 * 一身本事：不是功法，也不是武艺，而是市井里讨生活的手艺与见识。
 * 开局由叙事立下几门，往后靠判定成功一点点磨上去，十级为满。
 */
export type SkillKind = "学识" | "手艺" | "阅历";

export interface Skill {
  id: string;
  name: string;
  kind: SkillKind;
  /** 当前等级，0 到 10 */
  level: number;
  /** 本级的进度，满 progressMax 升一级 */
  progress: number;
  progressMax: number;
  desc: string;
}

/**
 * 一次 D20 判定：掷骰加上技能等级，够上难度便算过。
 * 学识类的头一回失手会留一线（pending），可以再争一争，也可以就此认栽。
 */
export interface SkillCheck {
  id: string;
  /** 考的是哪一门技能 */
  skill: string;
  /** 难度，越高越难 */
  dc: number;
  /** 为什么考这一门 */
  context: string;
  /** D20 掷出的点数 */
  roll: number;
  /** 判定时的技能等级 */
  level: number;
  /** roll + level */
  total: number;
  success: boolean;
  /** 学识类头一回失手：还留着转圜的余地 */
  pending?: boolean;
  /** 已经认栽，不再改口 */
  admitted?: boolean;
  /** 判定发生在哪一日 */
  day: number;
}

/**
 * 一桩机缘：有人托你办的事。
 * 办成了由对方（叙事里的 NPC）点头才算数，过了期限没办便按说好的罚。
 */
export type QuestStatus = "open" | "done" | "failed";

/**
 * 名声的四条：正道、魔道、平民、官府。
 * 这是旁人嘴里的你，与你自认的人品未必相干，故各走各的、互不相抵。
 * 四条各自 0 到 100，默认从 0 起——起初谁也不认得你。
 */
export interface Reputation {
  /** 正道名声：名门正派怎么看你 */
  righteous: number;
  /** 魔道名声：邪门外道怎么看你 */
  demonic: number;
  /** 平民名声：街坊百姓怎么看你 */
  folk: number;
  /** 官府名声：衙门官面上怎么看你 */
  official: number;
}

export type ReputationAxis = keyof Reputation;

/** 交差后能兑现的酬谢，只在这几样里选；名声与状态也在其中 */
export type QuestRewardKind = "灵石" | "修为" | "物品" | "人情" | "状态" | "正道名声" | "魔道名声" | "平民名声" | "官府名声";

/** 误期要挨的罚，只在这几样里选；罚的是实打实的东西，不是一时的状态 */
export type QuestPenaltyKind = "灵石" | "修为" | "业力" | "状态" | "正道名声" | "魔道名声" | "平民名声" | "官府名声";

/**
 * 一桩机缘给下的状态：赏的助益、罚的负累都照它立。
 * 先照状态名录挑——给了 template 便照名录那一条立起；名录里没有的，
 * 才照 name 与效力自编一条，效力须落在程序认得的字段上，立不起来便作罢。
 */
export interface QuestBuffSpec {
  /** 状态名录里的 id 或名目 */
  template?: string;
  /** 名录外自编的名目，不超过 10 字 */
  name?: string;
  icon?: string;
  isDebuff?: boolean;
  /** 自编时的效力：落在 BuffTargetStat 里的一项上 */
  stat?: BuffTargetStat;
  value?: number;
  /** 顶几个时辰 */
  hours?: number;
  desc?: string;
}

/**
 * 机缘的四类：
 * 事件——当场起落的一桩事，未必有固定的去处与人；
 * 地点——奔着某一处地方去的，必有具体去处，事就在那一处办、不另钉人；
 * 人物——奔着某个人去的，必有那人的落脚处与要找的那个人；
 * 修为——修到某一层境界便算办到，不必有去处与人。
 * 地点与人物两类由系统钉下真去处，走上城图寻得着；人物类连同要找的人一并钉下。
 */
export type QuestKind = "事件" | "地点" | "人物" | "修为";

export interface Quest {
  id: string;
  name: string;
  /** 事情的来龙去脉 */
  desc: string;
  /** 何处去办，如「长安·醉仙楼」 */
  place: string;
  /** 期限日序；不写便是不限时 */
  dueDay?: number;
  /** 谁交办的 */
  giver: string;
  /** 完成条件：玩家要做到什么才算数 */
  condition: string;
  /** 酬谢，写在字面上给人看 */
  reward: string;
  /** 兑现方式；两个字段齐全才自动落账 */
  rewardKind?: QuestRewardKind;
  rewardAmount?: number;
  /** 赏的是状态时照这份说明立一条；仅 rewardKind 为「状态」时用得上 */
  rewardBuff?: QuestBuffSpec;
  /** 误期的罚，写在字面上给人看 */
  penalty?: string;
  penaltyKind?: QuestPenaltyKind;
  penaltyAmount?: number;
  /** 罚的是状态时照这份说明立一条；仅 penaltyKind 为「状态」时用得上 */
  penaltyBuff?: QuestBuffSpec;
  status: QuestStatus;
  /** 交办的日子 */
  day: number;
  /** 了结的日子 */
  settledDay?: number;
  /** 了结时留下的一笔：成了得什么、误期罚了什么 */
  outcome?: string;
  /**
   * 牙行揽下的差事：非空则赏钱押在这家柜上，
   * 事办成之后得回那处走一趟，领了才算到手。
   */
  broker?: QuestBroker;
  /** 押在柜上的赏领过了没有；非牙行的事无所谓这一笔 */
  claimed?: boolean;
  /** 哪一类机缘：事件、地点、人物、修为。事件类可以没有去处与人；地点类必有去处；人物类两样都有 */
  kind?: QuestKind;
  /**
   * 修为类机缘的目标：REALMS 里的境界序号（如「炼气后期」）。
   * 玩家修到这一层，这桩事便自行办成。
   */
  realmGoal?: number;
  /** 差事要办到哪儿去；有了它便在城图上星标出来 */
  target?: JobTarget;
  /** 这一桩办到目标地块上要用到的人；生成时照这份说明现掷，钉在那一处 */
  cast?: JobCastRole[];
  /**
   * 捎信、捎物一类的事，行囊里真放着的那一件东西的 id。
   * 托付时给到手上，事了结时一并销去。
   */
  carryItemId?: string;
  /**
   * 门派任务的赏：交差了才算贡献与下品灵石，误期则倒扣贡献。
   * 与牙行那一套并行——赏不押柜上，由宗门当场落账。
   */
  sectTask?: { taskId: string; contribution: number; spiritStone: number };
}

/** 赏钱押在哪一家牙行 */
export interface QuestBroker {
  cityId: string;
  districtId: number;
  shopId: string;
  shopName: string;
}

/** 一桩奇遇了结了没有；keeper 是留在此处待日后再来的那种 */
export type AdventureStatus = "open" | "done";

/**
 * 舆图上预设点位上开出的一桩奇遇。
 * 或由叙事牵出，或由天意（随机）现掷，都只落在开发者先圈下的预设点位上；
 * 于玩家而言照「只由叙事推动位置」的规矩——人到了它所在的那一带，才寻得着、进得去。
 */
export interface Adventure {
  id: string;
  /** 落在哪张舆图上 */
  sceneId: string;
  /** 占的是哪一处预设点位（坐标与舆图同系） */
  x: number;
  y: number;
  /** 就近归到哪座城的一带；人在那一城，才算到了地头 */
  cityId: string;
  name: string;
  /** 一句话说清这是个什么地方、有什么可图 */
  summary: string;
  /** 类别，如 秘境、遗迹、机缘、凶险、异象 */
  kind: string;
  /** 凶险程度 1 至 5，越高越可能动起手来 */
  danger: number;
  /** 可图的酬谢，写在字面上 */
  reward?: string;
  rewardKind?: QuestRewardKind;
  rewardAmount?: number;
  /** 可能遭的罚 */
  penalty?: string;
  penaltyKind?: QuestPenaltyKind;
  penaltyAmount?: number;
  status: AdventureStatus;
  /** 了结之后仍留在此处、日后再来还有戏的，记它一笔 */
  persistent?: boolean;
  /** 开出来的日子 */
  day: number;
  /** 打哪儿来：剧情牵出的，还是天意现掷的 */
  origin?: "story" | "random";
  /**
   * 为某桩机缘临时开出来的去处；那桩事一了，这一处便随之撤去。
   * 原本就在舆图上的去处没有这一项，不因机缘了结而消失。
   */
  questId?: string;
}

/** 约定的两种来路，误了期的算法各不相同 */
export type PactKind =
  /** 定制取货：说定日子去取，误了期也不罚，只是要等日子到了才取得走 */
  | "pickup"
  /** 口头约定：说定的事误过宽限的日子，人情上要落点亏 */
  | "word";

export type PactStatus = "open" | "done" | "failed";

/**
 * 一桩约定：与谁说定的、什么时候在哪儿了结、误了怎么算。
 * 取货的约定到期才取得走；口头的约定误过宽限，情谊上要折一点。
 */
export interface Pact {
  id: string;
  kind: PactKind;
  /** 约定的事，如「定制 · 青锋剑」 */
  name: string;
  desc: string;
  /** 跟谁说定的 */
  giver: string;
  /** 那人在尘缘里的 id；逾期折情谊时照这个扣 */
  giverId?: string;
  /** 在哪儿了结 */
  place: string;
  cityId?: string;
  districtId?: number;
  /** 说定的日子 */
  madeDay: number;
  /** 说定哪天了结 */
  dueDay: number;
  /** 口头约定宽限几日；过了这几日才落账 */
  graceDays?: number;
  /** 取货时该拿到的东西 */
  item?: InventoryItem;
  status: PactStatus;
  settledDay?: number;
  /** 了结时留下的一笔 */
  outcome?: string;
}

export interface Sect {
  name: string;
  level: number;
  reputation: number;
  leader: string;
  elders: number;
  disciples: number;
  territory: string;
  contribution: number;
  /** 宗门外观描述 */
  appearance: string;
  /** 江湖风评 */
  reputationDesc: string;
  /** 周围环境/地理信息 */
  surroundings: string;
  positions: SectPosition[];
  tasks: SectTask[];
  shop: SectShopItem[];
  heritage: SectHeritage[];
  resources: SectResource[];
  management: SectManagement;
  /**
   * 本门的四类词条：性质、风气、特色与开局状态。
   * 认下山门时从那一处抄来，叙事里提到本门便照这几条落笔。
   */
  nature?: SectSiteTerm;
  climate?: SectSiteTerm;
  feature?: SectSiteTerm;
  start?: SectSiteTerm;
  /** 主殿每日开讲的时辰，0-11 见 SHICHEN_NAMES；缺则按巳时 */
  lectureHour?: number;
  /** 上一次参加开讲的日序；0 表示入门以来还没听过 */
  lastLectureDay?: number;
  /** 开讲缺勤的账算到哪一日，免得同一天重复扣 */
  lectureCheckedDay?: number;
  /** 上一次在讲经堂讲经的日序，一日只讲一场 */
  lastPreachDay?: number;
  /** 各座建筑的养成状态，键为建筑名；缺项按 Lv.1、正常算 */
  facilities?: Record<string, SectFacilityState>;
  /** 建筑日常的产出入库结算到哪一日，免得同日重复算 */
  facilitySettledDay?: number;
  /** 各建筑当日已做过的动作，键为「建筑名:动作编号」，值为那一日的日序 */
  facilityDaily?: Record<string, number>;
  /** 开局那笔家底已经给过了；只给一回，免得国库空了又凭空长出来 */
  endowed?: boolean;
  /** 附庸进贡结算到哪一日，免得同日重复算 */
  tributeSettledDay?: number;
  /** 眼下生效的宗门修正（政策、态势一类的时效）；到期由日结抹去 */
  modifiers?: SectModifier[];
}

/**
 * 一处宗门修正：由叙事添上、带有效期的政策或态势。
 * 名目只能从 src/data/sectModifiers.ts 的硬编码名录里挑，不得自编。
 */
export interface SectModifier {
  /** 名录里的 id */
  id: string;
  name: string;
  desc?: string;
  /** 生效到哪一日（日序）；到日子自动抹去 */
  until: number;
}

export interface Relation {
  id: string;
  name: string;
  /** 身份称号，如「城南铁匠」「游方郎中」 */
  title: string;
  type: RelationType;
  /**
   * 关系：-100 到 100 的整数，0 为平交，负为交恶。
   * 旧档只存了情谊 affinity，载入时由它折算而来。
   */
  relation?: number;
  /** 信任：1 到 5 五档，各有名目；陌生人起于第 2 档 */
  trust?: number;
  /** 旧档的情谊，0 到 100；新档不再写它，只作折算之用 */
  affinity?: number;
  affinityMax?: number;
  realm: string;
  note: string;
  /** 下面几项是后补的人设细目，旧存档与模型不写时留空即可 */
  /** 性别 */
  gender?: string;
  /** 年岁 */
  age?: number;
  /** 出身来历 */
  origin?: string;
  /** 性情 */
  personality?: string;
  /** 形貌 */
  appearance?: string;
  /** 所属：门派、帮口、作坊、家族 */
  affiliation?: string;
  /** 在城内哪一处结识的；只有从地块上认下的人才有 */
  cityId?: string;
  districtId?: number;
  /** 在城内何处结识，写到字面上，便于直接展示 */
  metAt?: string;
  /**
   * 这人眼下在哪儿，写地名，如「扬州」「云栖山脉」。
   * 记下城池街区的那类人可以不写它；开局叙事里认下的人只有这个。
   */
  location?: string;
  /**
   * 叙事直接写定的人设提示词。有它就照它演，不必再让模型现编一份。
   */
  persona?: string;
  /** 这人把你的事记在心里：近日交谈的摘要，一笔一笔攒着 */
  memory?: string;
  /**
   * 固定出没的截止日序：到这一日之前都守在 cityId/districtId 那一处，
   * 过了这日便不再钉在原地，往后随缘在别处露面。
   */
  fixedUntilDay?: number;
  /** NPC战斗属性，可选，用于战斗推演 */
  stats?: {
    hp: number;
    hpMax: number;
    mp: number;
    mpMax: number;
    attack: number;
    defense: number;
    speed: number;
  };
  /** NPC掌握的功法ID列表 */
  techniqueIds?: string[];
  /** 正与你同行：遇上打斗时他会作为队友出手 */
  traveling?: boolean;
  /** 花钱雇来的镖师：雇到这一日为止，过后自行告辞 */
  hireUntilDay?: number;
  /** 雇这一趟花出去的佣金，下品灵石 */
  hireFee?: number;
}

/** 门房通禀的三种结果：不肯传话、传了话主家不见、主家愿见 */
export type GateOutcome = "refused" | "master_absent" | "admitted";

/**
 * 城里一座大户人家的宅邸。
 * 姓氏、门第、门房与宅内人员都从候选池里掷一次便写进存档，一局之内不再变，
 * 免得每次推门进去都换一户人家。
 */
export interface Manor {
  /** 姓氏，宅邸称「某府」 */
  surname: string;
  /** 门第，如「城中数得着的粮商」 */
  standing: string;
  /** 门房，认过一次就固定 */
  gatekeeper: Relation;
  /** 宅内人员，生成后固定；不少于十口，同姓的本家占一半以上，姓名按字辈排 */
  members: Relation[];
  /** 向街坊打听来的家世，问过一次就不必再问 */
  background?: string;
  /** 是否已得主家允准入内 */
  admitted?: boolean;
}

/**
 * 城里一处匠人区。
 * 作坊里有哪几门工匠、各自什么脾气，掷一次便写进存档，一局之内不再换人。
 */
export interface Workshop {
  /** 向街坊听来的这一带的名声，问过一次就不必再问 */
  background?: string;
  /** 作坊里的工匠，行当各一，不少于两位 */
  craftsmen: Relation[];
}

/**
 * 商铺种类；各地的铺子按文化背景各有轻重，见 src/data/shops.ts。
 * 酒肆早先单列，如今并入客栈——客栈里本也供酒，一并管着便是。
 */
export type ShopKind =
  | "茶棚"
  | "客栈"
  | "浴堂"
  | "丹药铺/医馆"
  | "瓦舍"
  | "灵兽栏"
  | "符箓铺"
  | "炼器坊"
  | "宝物阁"
  | "旧货铺"
  | "当铺"
  // | "钱庄"   // 暂不开张：铺面、权重与名号一并封存，要恢复的话把这几处注释放开即可
  | "镖局"
  | "牙行"
  | "书铺"
  | "乐器坊"
  | "武馆"
  | "杂货铺";

/** 杂货铺里的一样货 */
export interface Good {
  /** 货名，与 src/data/goods.ts 的预设表同一个名字，或由词条拼出来的名号 */
  name: string;
  /** 底价，单位下品灵石；当日卖价由它折出来 */
  base: number;
  /** 铺面上的存量，0 便是断货 */
  stock: number;
  /** 词条组合：名号与说明都由这些词条拼成，界面上摊开给人看 */
  entries?: string[];
  /** 说明；杂货铺按预设表查出来，其余由词条串成 */
  desc?: string;
  /** 神秘物品：名目只是个破旧的样子货，看不出究竟是什么，留待日后鉴宝 */
  mystery?: boolean;
}

/**
 * 一桩差事要办到哪儿去。
 * 去处可以是城内某条街区、某座山门里的一座建筑、舆图上的一处奇遇，或野外的一座村庄；
 * 要找人的，那人也是眼下确实记在尘缘里的。
 */
export interface JobTarget {
  cityId: string;
  /** 本城街区编号；只说得出城池时省去 */
  districtId?: number;
  /** 写给人看的去处，如「长安·西市」 */
  label: string;
  /** 要找的人；没有便是只跑一趟地方 */
  person?: string;
  /**
   * 去处是本门某座山门里的建筑时记下这两项：哪一处山门、哪座建筑。
   * 记了建筑的，districtId 省去，人在那座建筑里等着，进山门到那处才寻得着。
   */
  sectId?: string;
  building?: string;
  /**
   * 去处是舆图上的某一处奇遇时记下它的编号；人到了那一带才算到了地头。
   * 记了奇遇的，districtId 与 sectId 都省去。
   */
  adventureId?: string;
  /** 去处是野外的某一座村庄时记下它的点位身份 */
  villageKey?: string;
}

/**
 * 一桩差事办到目标地块上要用到的人。
 * 走镖、吓人这类事本没有现成的人，接取时照这份说明现掷一个，
 * 钉在目标地块上，玩家去到那儿才寻得着。人设写给叙事照演。
 */
export interface JobCastRole {
  /** 称谓，如「收货的商家」 */
  title: string;
  /** 演这人的一段人设 */
  persona: string;
  /** 通常性别，可省 */
  gender?: string;
  /** 站哪一边：接头的人，还是对着干的人 */
  side?: "contact" | "antagonist";
}

/**
 * 牙行柜上挂着的一桩差事。
 * 谁都能接，赏钱由牙行先押在柜上，办成了回来领。
 */
export interface BrokerJob {
  id: string;
  name: string;
  /** 事情的来龙去脉 */
  desc: string;
  /** 何处去办 */
  place: string;
  /** 去处的实处：地图上哪个街区，找的是谁 */
  target?: JobTarget;
  /**
   * 接取后在目标地块上要现生成的人。空则表示这桩事奔着已在尘缘里的人去，
   * 接取时只把那个人钉到目标地块上，不另掷人。
   */
  cast?: JobCastRole[];
  /** 交差条件 */
  condition: string;
  /** 限期几日，从接下的那天算起 */
  days: number;
  /** 酬谢，写在字面上给人看 */
  reward: string;
  rewardKind?: QuestRewardKind;
  rewardAmount?: number;
  /** 误期的罚 */
  penalty?: string;
  penaltyKind?: QuestPenaltyKind;
  penaltyAmount?: number;
  /** 已经被玩家接下的，不再挂出来 */
  taken?: boolean;
}

/** 客栈茶棚里的一副座头 */
export interface Seat {
  id: string;
  /** 第几桌，从 1 起 */
  table: number;
  /** 桌内第几位，从 1 起 */
  index: number;
  /** 坐着的人；空位则没有 */
  guest?: Relation;
}

/** 坊市里的一家铺子；进了门做什么还没做，先在门前驻足看个大概 */
export interface Shop {
  id: string;
  kind: ShopKind;
  name: string;
  /** 驻足看过之后记下的铺面见闻，看过一次就不必再看 */
  info?: string;
  /** 杂货铺的货架；别的铺子没有 */
  goods?: Good[];
  /** 掌柜，开市时定下就不再换 */
  keeper?: Relation;
  /** 上回备了多少样货；隔日按这个规模重新上货 */
  stockScale?: number;
  /** 堂里的座头；只有客栈与茶棚有 */
  seats?: Seat[];
  /** 柜上挂着的差事；只有牙行有，隔日换一拨 */
  jobs?: BrokerJob[];
}

/**
 * 叙事给某种货物下的时效价格修正。
 * 例如「近来漕路不通，盐价贵了三成」，三日之内按这个数乘上去。
 */
export interface PriceAdjust {
  /** 货物名，须是预设货物表里有的 */
  good: string;
  /** 乘数：1.3 即涨三成，0.7 即跌三成 */
  factor: number;
  /** 失效的日序，由 daySerial 算出来；到这个日子之后不再算数 */
  untilDay: number;
}

/** 一处坊市的铺面；开市时掷一次便写进存档，一局之内不再变 */
export interface Market {
  shops: Shop[];
  /** 上回开市的日序；同日再进不动货架，隔日才按旧规模重新上货 */
  day?: number;
}

/** 自设铺子里的一样货 */
export interface ShopGood {
  name: string;
  /** 单价，下品灵石 */
  price: number;
  /** 存货数 */
  stock: number;
  /** 说明 */
  desc?: string;
}

/** 自设铺子里的一处设施 */
export interface ShopFacility {
  name: string;
  /** 这处设施每月要花的银子，计入月开支 */
  upkeep: number;
  /** 管什么用 */
  effect?: string;
}

/**
 * 玩家在坊市里自设的一间铺面。
 * 货物、设施与月收支由「经营」面板里以文字与 AI 往来改动；
 * 铺子赚的钱先进资金池，要花得回铺子取。
 */
export interface PlayerShop {
  id: string;
  name: string;
  kind: ShopKind;
  cityId: string;
  districtId: number;
  /** 展示用的所在地，如「长安·坊市」 */
  place: string;
  /** 文化背景，议货议价时给模型作参照 */
  culture?: string;
  /** 玩家给这门营生起的说法，如「酒楼」「药铺」；AI 由它推演具体数据 */
  typeLabel?: string;
  /** 是否启用库存一项：启用则记存量，不启用则只记货与价 */
  useStock?: boolean;
  /** 资金池，下品灵石；铺子的进出都走这里 */
  cash: number;
  goods: ShopGood[];
  facilities: ShopFacility[];
  /** 每月进项 */
  monthlyIncome: number;
  /** 铺面自身的月开支；各处设施的维持另计 */
  monthlyExpense: number;
  /** 上次按月结算的月份，如「514-2」 */
  lastSettledMonth?: string;
  /** 连欠的月数；欠满三月便被债主收走 */
  arrears: number;
}

/** 村里只可能有的三样营生 */
export type VillageBuildingKind = "茶棚" | "杂货铺" | "客栈";

export interface VillageBuilding {
  kind: VillageBuildingKind;
  name: string;
  /** 合成的那一家铺子，交给既有的杂货铺／客栈弹窗使用 */
  shop: Shop;
}

/** 野外一处村庄：没有舆图，落在预设点位上，打听一回便掷定人与营生 */
export interface Village {
  key: string;
  sceneId: string;
  x: number;
  y: number;
  name: string;
  culture?: string;
  buildings: VillageBuilding[];
  npcs: Relation[];
  /** 打听过没有；未打听则人与营生都空着 */
  inquired: boolean;
  /** 是否已在问道中动身前往过；未曾前往则不能打听、不能与村里的人与营生往来 */
  visited?: boolean;
  /** 村里是否有一处待售的屋舍；打听时掷定 */
  estateOffer?: EstateOffer;
}

/** 一处待售的屋舍：报价由基础效率折算，可讲价 */
export interface EstateOffer {
  /** 待售屋舍的临时编号 */
  id: string;
  name: string;
  /** 展示用的所在地，如「长安·平民住宅」或村名 */
  place: string;
  cityId?: string;
  districtId?: number;
  /** 若在村内，记下点位身份 */
  villageKey?: string;
  /** 基础效率，掷定后不再变，上限 0.7 */
  baseEfficiency: number;
  /** 报价，下品灵石 */
  price: number;
}

/** 一处产业的出租：租客与月租由叙事议定，按月自动入账 */
export interface Rental {
  /** 租与何人；名号由叙事定 */
  tenant: string;
  /** 每月下品灵石 */
  monthly: number;
  /** 上一次收租的月份「年-月」；挂租当月记下，自次月起逐月入账 */
  lastPaidMonth?: string;
}

/** 玩家名下的一处房产 */
export interface Estate {
  id: string;
  name: string;
  place: string;
  cityId?: string;
  districtId?: number;
  villageKey?: string;
  /** 基础效率：生成时掷定，不可增，上限 0.7 */
  baseEfficiency: number;
  /** 完好度 0 到 100，随日子缓慢下降；为 0 时效率归零，须重建 */
  condition: number;
  /** 购入价 */
  price: number;
  /** 上一次结算到哪一日，按日序记 */
  settledDay: number;
  /** 屋里存着的东西 */
  storage: InventoryItem[];
  /** 租出去了没有；租着便按月收租、不可自住 */
  rent?: Rental;
}

/** 宅邸里能盖的建筑形体：盖的时候只管样式，功能另配 */
export type ManorShape = "亭" | "正房" | "厢房" | "工坊" | "水榭" | "高阁" | "花园" | "水域";

/** 一间屋子可分配的功能：分派之后才谈得上加成与各自的用场 */
export type ManorFunction =
  | "聚灵"
  | "丹房"
  | "锻坊"
  | "经阁"
  | "演武"
  | "仓廪"
  | "客舍"
  | "园圃"
  | "茶室"
  | "书房"
  | "兽栏";

/** 宅邸里的一格：空地为 null */
export interface ManorCell {
  shape: ManorShape;
  /** 等级；效率随级数长 */
  level: number;
  /** 分配的功能；未分配则只作屋子用 */
  fn?: ManorFunction;
  /**
   * 摆放朝向：0 正置，1 调转。
   * 等距立绘只有一张，调转时把立绘左右镜像，看上去便是另一种朝向。
   */
  facing?: 0 | 1;
  /** 灵田里种的是什么；只有灵田有 */
  crop?: string;
  /** 上一次收获落在哪个季度，记「年-Q季」，免得一季里反复入库 */
  lastHarvest?: string;
  /** 这一间租出去了没有；租着便按月收租，自家人用不得，功能加成也不计 */
  rent?: Rental;
}

/** 一处宅邸：7×7 空地，盖满与否全看玩家 */
export interface ManorPlot {
  id: string;
  /** 展示用的所在地 */
  place: string;
  cityId?: string;
  districtId?: number;
  /** 7×7 格，null 为荒地 */
  cells: (ManorCell | null)[];
  /** 整座宅邸租出去了没有；租着便按月收租、不可歇息自用 */
  rent?: Rental;
  /** 仓廪里存着的东西；只有配了仓廪才用得上 */
  storage?: InventoryItem[];
}

/** 宅邸的边长 */
export const MANOR_GRID = 7;

/** 宅邸里能亲手做的事 */
export type ManorActionId =
  | "打坐"
  | "参悟"
  | "演练"
  | "研读"
  | "会客"
  | "驯兽"
  | "熔炼"
  | "存物"
  | "取物";

/** 一次宅邸互动要选的参数 */
export interface ManorActArgs {
  plotId: string;
  /** 在哪一格上做 */
  index: number;
  action: ManorActionId;
  /** 打坐、参悟、演练、研读所耗时辰 */
  hours?: number;
  /** 参悟、演练挑的功法 */
  techniqueId?: string;
  /** 研读挑的本事 */
  skillName?: string;
  /** 会客请的人 */
  relationId?: string;
  /** 熔炼、存物取物挑的东西 */
  itemId?: string;
  count?: number;
}

/** 一次宅邸互动的结果，文字给界面显示 */
export interface ManorActResult {
  ok: boolean;
  text: string;
  /** 这一回长了多少进度 */
  gain?: number;
}

/** 交给模型写一段「在铺子门前驻足所见」的素材 */
export interface ShopProbeArgs {
  /** 铺号，如「铁旗镖局」 */
  name: string;
  /** 营生，如「镖局」 */
  kind: ShopKind;
  /** 所在的坊市，如「长安·坊市」 */
  market: string;
  /** 城池的文化背景，用来定铺子的气象 */
  culture?: string;
}

/** 交给模型写一段「在客栈茶棚打尖」的素材 */
export interface DineArgs {
  /** 铺号，如「悦来客栈」 */
  shop: string;
  /** 营生：客栈还是茶棚 */
  kind: ShopKind;
  /** 所在的坊市 */
  market: string;
  /** 城池的文化背景，用来定菜色与口音 */
  culture?: string;
  /** 点的那道菜，连同增益一并报给模型 */
  dish: string;
  dishDesc: string;
  /** 同桌与邻桌坐着的人 */
  guests: string[];
}

/** 打尖回来的一段叙事，附带吃食间听到的零碎消息 */
export interface DineResult {
  narration: string;
  rumors: { text: string; source: string }[];
}

/** 交给模型写一段「在瓦舍听戏」的素材 */
export interface PlayArgs {
  /** 铺号，如「百戏瓦舍」 */
  shop: string;
  /** 所在的坊市 */
  market: string;
  /** 城池的文化背景，用来定戏路与唱腔 */
  culture?: string;
  /** 这一场听下来落在哪门本事上，好让叙事接得上 */
  skill?: string;
}

/** 交给模型写一段「请人看旧物」的素材 */
export interface AppraiseArgs {
  /** 铺号，如「珍珑阁」 */
  shop: string;
  /** 所在的坊市 */
  market: string;
  /** 城池的文化背景 */
  culture?: string;
  /** 那件旧物的名目与样子 */
  itemName: string;
  itemDesc: string;
  /** 铺子肯出多少灵石看这一件，多少能说明它值不值钱 */
  fee: number;
}

/** 鉴宝出来的结果：一段叙事，加上这东西究竟是什么 */
export interface AppraiseResult {
  narration: string;
  /** 看出来的物件：名目、类别、品阶、说明与五行；照表归一化后才落进行囊 */
  reading: {
    name: string;
    type: string;
    grade: string;
    desc: string;
    icon?: string;
    elements?: Record<string, number>;
  };
}

export interface EscortArgs {
  /** 镖局名号 */
  shop: string;
  /** 坊市抬头，如「长安·坊市」 */
  market: string;
  culture?: string;
  /** 雇主眼下的境界，用来定镖师的身手与要价 */
  realm?: string;
  /** 雇主身上有多少灵石，要价别离谱 */
  stones?: number;
}

/** 镖局里寻来的一位镖师 */
export interface EscortOffer {
  name: string;
  title: string;
  realm: string;
  gender?: string;
  age?: number;
  origin?: string;
  personality?: string;
  appearance?: string;
  affiliation?: string;
  /** 底细：走过什么镖、什么名声 */
  note: string;
  /** 人设提示词，往后照它演 */
  persona: string;
  stats: {
    hp: number;
    hpMax: number;
    mp: number;
    mpMax: number;
    attack: number;
    defense: number;
    speed: number;
  };
  /** 走这一趟的佣金，下品灵石 */
  fee: number;
  /** 雇到第几日为止，自今日算起 */
  days: number;
}

export interface EscortResult {
  narration: string;
  /** 柜上肯接这趟的镖师；说不出人来便是 null */
  escort: EscortOffer | null;
}

/** 匠人报出的一桩定做：做成什么、什么品相、几时来取、要多少钱 */
export interface CraftOffer {
  name: string;
  type: string;
  grade: string;
  desc: string;
  icon?: string;
  elements?: Record<string, number>;
  /** 料钱与工钱，下品灵石 */
  price: number;
  /** 说定几日后来取 */
  days: number;
}

/** 交给模型写一段「在客栈住下歇息」的素材 */
export interface LodgeArgs {
  /** 铺号，如「悦来客栈」 */
  shop: string;
  /** 所在的坊市 */
  market: string;
  /** 城池的文化背景 */
  culture?: string;
  /** 住的什么房 */
  room: string;
  roomDesc: string;
  /** 租了几日 */
  days: number;
  /** 睡下之前，玩家自己说了句什么 */
  words?: string;
}

/** 讲价时交给模型的口风与账目 */
export interface HaggleArgs {
  /** 掌柜 */
  keeper: Relation;
  /** 铺号 */
  shop: string;
  /** 玩家在买还是在卖 */
  mode: "buy" | "sell";
  /** 议的是什么东西 */
  subject: string;
  /** 件数 */
  count: number;
  /** 基准价，即原价；买卖都以此为尺 */
  basePrice: number;
  /** 眼下议到的幅度，-1 到 1；买入时越低越便宜，卖出时越高越好 */
  factor: number;
  /** 掌柜还剩的耐心，0 到 100 */
  patience: number;
  /** 之前的往来，按先后排 */
  history: { role: "player" | "keeper"; text: string }[];
  /** 玩家这一句 */
  words: string;
  /** 玩家还没说要卖什么时，把身上的家当报给掌柜，他好问价 */
  available?: string;
  /** 议的是柜底那件收来的旧物，掌柜自己也不知道是什么 */
  mystery?: boolean;
}

/** 交给模型写一段「向街坊打听这户人家」的素材 */
export interface ManorProbeArgs {
  /** 宅邸称呼，如「长安·赵府」 */
  label: string;
  surname: string;
  standing: string;
  members: Relation[];
}

/**
 * 交给模型写一段「在宗门某处做一桩事」的素材。
 * 与问道那一路各走各的：这儿的提示词按建筑、按事项现拼，
 * 每处建筑自带一份场景写照，写出来的东西才不至于千篇一律。
 */
export interface FacilityNarrativeArgs {
  /** 宗门名号 */
  sect: string;
  /** 山门坐落与周遭，取宗门数据里的现成句子 */
  surroundings?: string;
  /** 山门气象 */
  appearance?: string;
  /** 文化圈 */
  culture?: string;
  /** 本门的宗门性质，名目加一句说明 */
  nature?: string;
  /** 本门的宗门风气，名目加一句说明；门人言行都照它落笔 */
  climate?: string;
  /** 本门的特色资源名，如「灵鲤池」 */
  feature?: string;
  /** 建筑名与所属地块类别 */
  building: string;
  kindName: string;
  /** 这一处建筑专有的场景写照 */
  scene: string;
  /** 这一桩是什么行止，一句 */
  deed: string;
  /** 刚刚落了什么账，一句 */
  outcome: string;
  playerName: string;
  playerPosition: string;
  realmIndex: number;
  /** 眼下的时辰 */
  hour: string;
}

/** 交给模型扮演门房的素材 */
export interface GateAskArgs {
  label: string;
  surname: string;
  standing: string;
  gatekeeper: Relation;
  members: Relation[];
  /** 玩家在门外说的话 */
  words: string;
}

export interface PillCacheEntry {
  name: string;
  grade: ItemGrade;
  desc: string;
  elements: Record<string, number>;
  outputCount: number;
}

export interface GameTime {
  /** 修真历纪年，开局为 514 年 */
  year: number;
  month: number;
  day: number;
  /** 十二时辰序号：0=子时，1=丑时，……，11=亥时；只由叙事结算回写，不自动流逝 */
  hour: number;
}

export interface GameState {
  player: Player;
  techniques: Technique[];
  inventory: InventoryItem[];
  spiritStones: SpiritStones;
  /** 世人对你的四种看法；牙行差事与路上的行止都在这上头加减 */
  reputation: Reputation;
  /** 随身带着的那头灵兽；没收作随身时为空 */
  beast: SpiritBeast | null;
  talismanRecipes: TalismanRecipe[];
  alchemyRecipes: AlchemyRecipe[];
  sect: Sect;
  relations: Relation[];
  /** 野外村庄，按点位身份存 */
  villages: Record<string, Village>;
  /** 玩家名下的房产 */
  estates: Estate[];
  /** 玩家名下的宅邸地块 */
  manorPlots: ManorPlot[];
  /** 玩家在坊市里自设的铺面 */
  playerShops: PlayerShop[];
  /** 宗门之间的交情；起初一张白纸，由叙事与新闻添改 */
  sectRelations: SectRelation[];
  /** 被各宗门占下的城与村；由它标出城池的拥有者，占了便按月收贡金 */
  occupations: Occupation[];
  /**
   * 上一次掷「别家宗门主动开战」是哪一日（日序）。
   * 一日只掷一回，免得同一天走几个时辰便连连开战。
   */
  lastSectWarDay?: number;
  /** 当前打开的侧拉面板；null 表示没有面板打开 */
  currentPanel: PanelId | null;
  craftingTab: CraftingTab;
  /** 玩家当前查看的地图场景 id；只影响视角，不改变所在位置 */
  mapSceneId: string;
  /** 玩家当前所在的地点 id，对应地图标点；决定大地图上的光标位置 */
  currentPlaceId: string;
  /**
   * 玩家眼下驻在哪一处宗门（宗门点位编号）；不在宗门时为 undefined。
   * 与 currentPlaceId 各表一头：身在宗门时以它为准，cityId 那一套只作来处。
   */
  currentSectId?: string;
  /** 玩家眼下驻足的奇遇点位编号；不在任何奇遇点位时为 undefined。 */
  currentAdventureId?: string;
  /** 玩家在当前地点内部的具体场所 */
  currentLocation: LocationType;
  log: string[];
  pillCache: Record<string, PillCacheEntry>;
  news: NewsState;
  currentTime: GameTime;
  /**
   * 叙事给城里某处街区起的独有名字，键为「城市编号:街区编号」，值为名字。
   * 城图文件里的街区只带性质，名字由叙事随缘补上，所以单独存在存档里。
   */
  districtNames: Record<string, string>;
  /**
   * 城里的大户人家，键为「城市编号:街区编号」。
   * 一局之内每座宅子只掷一次人，掷出来的就固定下来，不再随点击变化。
   */
  manors: Record<string, Manor>;
  /**
   * 城里的坊市铺面，键同 manors。
   * 头一回进坊市才开市，开出来的铺子就固定下来，不再随点击变化。
   */
  markets: Record<string, Market>;
  /**
   * 叙事给货物下的时效价格修正，如战乱时盐价腾贵。
   * 过了 untilDay 就不再算数，取值时自行略过即可。
   */
  priceAdjusts: PriceAdjust[];
  /** 最近一个月听来的零碎消息；过了一个月自行略过 */
  rumors: Rumor[];
  /** 身上几门市井本事：不在功法之列，也不是拳脚 */
  skills: Skill[];
  /** 最近的判定记录，留着给叙事接着往下写 */
  checks: SkillCheck[];
  /** 手里的机缘：谁托你办的事，什么时候交差，误了期罚什么 */
  quests: Quest[];
  /** 瓦舍听戏的账：今天已听过几场；隔日照新的一天重算 */
  waseShows: WaseShows;
  /** 押在各家当铺里的东西：到期不赎就归了当铺 */
  pawns: PawnTicket[];
  /** 各处匠人区里的作坊：工匠一局之内固定，掷一次便不再换人 */
  workshops: Record<string, Workshop>;
  /** 说定的那些事：定制取货、口头之约，都是要自己去了一结的 */
  pacts: Pact[];
  /** 地图上的宗门：开局照六处文化圈各掷三到五处，一处一个名号与一套词条 */
  sectSites: SectSite[];
  /** 舆图预设点位上开出的奇遇：或由叙事牵出，或由天意现掷 */
  adventures: Adventure[];
}

// ===== AI 叙事系统类型 =====

export type DataOp =
  | { kind: "modify"; path: string; op: "=" | "+" | "-"; value: string }
  | { kind: "add"; collection: string; payload: string | Record<string, unknown> }
  | { kind: "delete"; collection: string; id: string }
  /**
   * 叙事里当场买成的一笔：钱货同结，不另写 modify spiritStones 与 add inventory。
   * 系统先按四等灵石一比一百兑开再付；付不出便不成交易。
   */
  | {
      kind: "buy";
      /** 买的是寻常物件还是宅地 */
      what: "item" | "manor";
      name: string;
      price: number;
      count?: number;
      type?: string;
      grade?: string;
      desc?: string;
      place?: string;
    };

/**
 * 某档模型是不是带思维链的推理模型。
 * auto 由模型名与运行时表现自行判断；on/off 是玩家手动定死。
 */
export type ModelReasoningMode = "auto" | "on" | "off";

/**
 * 思考参数按哪一家的写法发。
 *
 * 各家对「开思考／关思考」的叫法并不一样：
 * OpenAI 认 reasoning_effort，通义认 enable_thinking，智谱与豆包认 thinking.type，
 * OpenRouter 认 reasoning，vLLM 一类要经 chat_template_kwargs 转进去。
 * auto 由接口地址与模型名自认；认不出便照 OpenAI 那一套发，仍不被认再退回不带参数。
 */
export type ThinkingParamStyle =
  | "auto"
  | "openai"
  | "qwen"
  | "glm"
  | "deepseek"
  | "moonshot"
  | "openrouter"
  | "vllm"
  | "none";

export interface AISettings {
  /**
   * 自定义接口。两项都填齐时，推演直接走玩家自己的接口；
   * 留空则一律走后端转发（后端持密钥）。
   */
  baseUrl: string;
  apiKey: string;
  flashModel: string;
  proModel: string;
  /**
   * 带思维链的推理模型另有一套：思维链与正文共用输出额度，
   * 且多半不认 response_format。标出来才好照推理档办。
   * 缺省按 auto 算，老存档不会因此失效。
   */
  flashReasoning?: ModelReasoningMode;
  proReasoning?: ModelReasoningMode;
  /**
   * 思考参数按哪一家的写法发；缺省 auto。
   * 换到别家的模型后思考停不下来（一口气想上万字），多半是这一项没对上，
   * 可在此手动指一家，或干脆选「不发」。
   */
  thinkingStyle?: ThinkingParamStyle;
  temperature: number;
  /** 玩家自定义提示词，追加到系统提示词末尾 */
  customPrompt: string;
  /**
   * 保留全程叙事正文。推演照旧只带压缩摘要与近几轮，这一项只决定是否另存全文，
   * 供日后回看与导出；不开便随压缩一并丢弃。
   */
  keepFullNarrative?: boolean;
  /** 背景音乐音量，0 到 1；未调过时默认关闭 */
  bgmVolume?: number;
  /** 界面字号缩放，1 为原字号；未调过时按 1 算 */
  fontScale?: number;
}

export type GenStage =
  | "idle"
  | "flash"
  | "crafting_wait"
  | "pro"
  | "done"
  | "error";

/** 炼丹/画符制作结果，用于传给Pro生成叙事 */
export interface CraftingResult {
  type: "alchemy" | "talisman";
  success: boolean;
  /** 简要描述：丹药名/符箓名 + 数量 + 结果 */
  summary: string;
  /** 详细信息（名称、品级、效果、元素等） */
  details?: string;
}

/** 暂停推演等待百艺制作时的上下文 */
export interface CraftingContext {
  decision: string;
  flashPaths: string[];
  flashRaw: string;
  relevantData: string;
  recentTurns: { input: string; narrative: string }[];
  chatSummary?: string;
  craftingType: "alchemy" | "talisman";
}

export interface BattlePosition {
  x: number;
  y: number;
}

export type BattleEntityType = "player" | "ally" | "enemy" | "obstacle";

export interface BattleEntity {
  id: string;
  name: string;
  type: BattleEntityType;
  position: BattlePosition;
  hp?: number;
  maxHp?: number;
  mp?: number;
  maxMp?: number;
  icon?: string;
  isDead?: boolean;
}

export interface BattleMap {
  width: number;
  height: number;
  entities: BattleEntity[];
}

/** 战斗里的计时：stick 是第几柱香（从 1 数起），progress 是这一柱已烧到的进度 */
export interface BattleIncense {
  stick: number;
  progress: number;
}

/** 一份战利品 */
export interface BattleLootItem {
  name: string;
  qty: number;
  desc?: string;
  taken?: boolean;
}

/** 战斗结束后的收尾：逃/追、战利品、败者对话 */
export interface BattleAftermath {
  role: "chase" | "flee";
  pursuit: number; // 0-100
  retreat: number; // 0-100
  stage: "escape" | "loot" | "surrender" | "done";
  narrative: string;
  loot: BattleLootItem[];
  patience: number; // 0-100，仅 surrender 阶段用
  resolving: boolean;
  outcome?: string;
}

export interface BattleState {
  isActive: boolean;
  map: BattleMap;
  round: number;
  turn: "player" | "enemy";
  narrative: string;
  isResolving: boolean;
  errorMsg: string;
  context: string[];
  /** 战斗里的临时状态按柱香计时，这里记香烧到哪儿了 */
  incense: BattleIncense;
  /** 分出胜负后的收尾（逃/追、战利品、败者对话）；战斗未结束时为空 */
  aftermath?: BattleAftermath | null;
  /** 这一战若是宗门战，记下对手是谁、我方攻守；寻常厮杀没有这一项 */
  sectWar?: BattleSectWar | null;
}

/** 叙事挑起的宗门战：对手是谁、打的是什么，以及我方是攻是守 */
export interface SectWarBrief {
  /** 对手的名号：宗门、城池或村庄 */
  opponentName: string;
  /** 打的是哪一路：宗门、城、村 */
  targetKind: "sect" | "city" | "village";
  /** 我方是攻方还是守方 */
  role: "attacker" | "defender";
}

/**
 * 叙事里挑起的一场讲价。
 * 与商铺里那套讲价同源，只是由叙事点出：对方须是尘缘里认得的人，
 * 谈定之后照商铺那一套落账——买的扣下品灵石、把物收入行囊，卖的出行囊、得灵石。
 */
export interface HaggleBrief {
  /** 买还是卖 */
  mode: "buy" | "sell";
  /** 议的标的：买的是什么货，或卖的是哪一样 */
  subject: string;
  /** 件数 */
  count: number;
  /** 原价：铺面标价，或对方起初的出价 */
  basePrice: number;
  /** 对方的名号，须是尘缘里认得的人 */
  keeper: string;
  /** 铺子或去处，写给人看 */
  shop: string;
  /** 买入时这东西归哪一格行囊；缺省作杂物 */
  itemType?: InventoryItem["type"];
}

/**
 * 叙事里牵出的一桩买卖：玩家动身去某家铺子买或卖。
 * 正文到此为止——买卖的经过与得失交由铺面界面，由玩家自己经手，免得与正文重复记账。
 */
export interface ShopBrief {
  /** 铺子名，须是眼下城里真有的铺子 */
  shop: string;
}

/** 已落到实处的宗门战：对手点位编号、名号与所打的路数 */
export interface BattleSectWar {
  opponentId: string;
  opponentName: string;
  targetKind: "sect" | "city" | "village";
  role: "attacker" | "defender";
}

export interface Turn {
  id: string;
  playerInput: string;
  flashPaths: string[];
  flashRaw: string;
  proRequest: {
    summary: string;
    recentTurns: { input: string; narrative: string }[];
    decision: string;
    relevantData: string;
  };
  narrative: string;
  ops: DataOp[];
  opsRaw: string;
  applied: boolean;
  snapshot: GameSnapshot | null;
  timestamp: number;
  error?: string;
  mode?: string;
  /** 这一轮由叙事挑起的宗门战：对手是谁、我方是攻是守 */
  sectWar?: SectWarBrief;
  /** 这一轮由叙事挑起的讲价：与谁、买还是卖、标的与价码 */
  haggle?: HaggleBrief;
  /** 这一轮叙事把玩家引到某家铺子买卖：铺面界面由玩家自己开 */
  shop?: ShopBrief;
  /** 是不是开局头一段：这一轮只立人物、铺世界，不给它列数据变化 */
  opening?: boolean;
}

export interface GameSnapshot {
  player: Player;
  techniques: Technique[];
  inventory: InventoryItem[];
  spiritStones: SpiritStones;
  /** 野外村庄；旧存档没有这一项 */
  villages?: Record<string, Village>;
  /** 名下房产；旧存档没有这一项 */
  estates?: Estate[];
  /** 名下宅邸地块；旧存档没有这一项 */
  manorPlots?: ManorPlot[];
  /** 坊市里自设的铺面；撤销回合时要一并还原 */
  playerShops?: PlayerShop[];
  /** 宗门之间的交情；撤销回合时要一并还原 */
  sectRelations?: SectRelation[];
  /** 城村的归属；撤销回合时要一并还原 */
  occupations?: Occupation[];
  /** 上一次掷「别家宗门主动开战」的日序；撤销回合时要一并还原 */
  lastSectWarDay?: number;
  /** 名声；撤销回合时要一并还原 */
  reputation?: Reputation;
  /** 随身灵兽；撤销回合时要一并还原 */
  beast?: SpiritBeast | null;
  sect: Sect;
  relations: Relation[];
  log: string[];
  /** 玩家所在地点；旧存档没有此字段，恢复时落回默认城池 */
  currentPlaceId?: string;
  /** 玩家所在宗门；不在宗门时缺省 */
  currentSectId?: string;
  /** 玩家眼下驻足的奇遇点位编号；不在任何奇遇点位时为 undefined */
  currentAdventureId?: string;
  /** 玩家所在场所；与地点一同变化，撤销回合时要一并还原 */
  currentLocation?: LocationType;
  pillCache?: Record<string, PillCacheEntry>;
  news?: NewsState;
  currentTime?: GameTime;
  /** 街区名字；撤销回合时要一并还原 */
  districtNames?: Record<string, string>;
  /** 货物的时效价格修正；撤销回合时要一并还原 */
  priceAdjusts?: PriceAdjust[];
  /** 最近听到的流言；撤销回合时要一并还原 */
  rumors?: Rumor[];
  /** 身上的市井本事；撤销回合时要一并还原 */
  skills?: Skill[];
  /** 最近的判定；撤销回合时要一并还原 */
  checks?: SkillCheck[];
  /** 手里的机缘；撤销回合时要一并还原 */
  quests?: Quest[];
  /** 听戏的场次；撤销回合时要一并还原 */
  waseShows?: WaseShows;
  /** 押在当铺里的东西；撤销回合时要一并还原 */
  pawns?: PawnTicket[];
  /** 各处作坊里的工匠；撤销回合时要一并还原 */
  workshops?: Record<string, Workshop>;
  /** 说定的那些事；撤销回合时要一并还原 */
  pacts?: Pact[];
  /** 舆图上的奇遇；撤销回合时要一并还原 */
  adventures?: Adventure[];
  /** 已学的符箓配方；旧存档没有这一项 */
  talismanRecipes?: TalismanRecipe[];
  /** 已学的丹方；旧存档没有这一项 */
  alchemyRecipes?: AlchemyRecipe[];
  /** 各城大户人家，键为「城市编号:街区编号」；旧存档没有这一项 */
  manors?: Record<string, Manor>;
  /** 各城坊市铺面，键同 manors；旧存档没有这一项 */
  markets?: Record<string, Market>;
  /** 舆图上的宗门；旧存档没有这一项 */
  sectSites?: SectSite[];
}

/**
 * 全程叙事里的一回。
 * 推演仍旧只带压缩摘要与近几轮，这一份只是另存的原样正文，供回看与导出；
 * 是否留存由设置里的「保留全程叙事」开关定。
 */
export interface NarrativeEntry {
  /** 对应 turns 里那一轮的 id：同一轮重演时照它替换，不另起一条 */
  id: string;
  /** 这一回在游戏里的时刻，如「修真历514年3月2日 辰时」 */
  timeLabel: string;
  /** 这一回所在之处 */
  place: string;
  /** 玩家这一回写下的行动 */
  input: string;
  /** 叙事正文 */
  narrative: string;
  timestamp: number;
}

export interface ConversationState {
  turns: Turn[];
  summary: string;
  /** 开了「保留全程叙事」之后逐回攒下的正文；不参与推演，只作留存与导出 */
  narrativeLog?: NarrativeEntry[];
  stage: GenStage;
  errorMsg: string;
  lastFlashDuration: number;
  lastProDuration: number;
  lastRawOutput: string;
  quickDecisions: string[];
  /** 上次与NPC交谈的摘要，在下回合推演时发送给AI并清空 */
  pendingChatSummary: string;
  /** 暂停推演等待百艺制作时的上下文，制作完成后恢复推演 */
  pendingCrafting?: CraftingContext | null;
  /** Pro 阶段流式输出的实时叙事文本，用于打字机效果展示 */
  streamingNarrative: string;
  /**
   * Pro 阶段流式收到的思维链。
   * 推理模型先长一段思考才落笔，这一段不并入正文，只用来在界面上显示「正在思考」。
   */
  streamingReasoning: string;
  /**
   * 开局建档这一局落到哪一步了：每跑完一门便记一笔，等待页照它报进度。
   * ok 为假表示那一门几遍都没写全，留待后续回合补。
   */
  openingFiled: { id: string; ok: boolean }[];
  /**
   * 开局建档的动态流水：每门「开始返回」与「落定」各记一笔，等待页取最新一笔报话。
   * 八门并发，光记落定便得等第一门跑完才有话可说；把起始也记下，正文一收尾便能报出正在办的那一门。
   * phase 为 doing 表示这一门此刻在途，done 表示已落定，ok 为假即没写全。
   */
  openingFeed: { id: string; phase: "doing" | "done"; ok: boolean }[];
  /**
   * 开局建档有哪一门没写全时留下的一句提示；
   * 进了主界面再由提示窗报给玩家，说过便清空。
   */
  openingWarning?: string;
}

/** 单谈里的三种话：玩家说的、对方说的，以及系统的一句旁注（判定未过之类） */
export type NPCChatRole = "player" | "npc" | "system";

export interface NPCMessage {
  id: string;
  role: NPCChatRole;
  content: string;
  timestamp: number;
}

/** 在客栈茶棚的桌边搭上话时，记下这一席的场面 */
export interface NPCScene {
  /** 铺号，如「悦来客栈」；匠人区里便是作坊的名号 */
  shop: string;
  /** 营生：客栈、茶棚，或是牙行；匠人区不在铺子之列，故可缺 */
  kind?: ShopKind;
  /** 匠人区里的行当，如「铁匠」「炼丹师」；有它便是能在作坊里定做东西的场面 */
  craft?: string;
  /** 这门手艺惯出的活计，如「法宝」；报单子时归到这一类 */
  craftHint?: string;
  /** 城池的文化背景，请客时按这儿的菜色上 */
  culture?: string;
  /** 牙行所在的城池与街区；在这处托付的差事，赏押在这家柜上 */
  cityId?: string;
  districtId?: number;
  shopId?: string;
}

export interface NPCProfile {
  npcId: string;
  name: string;
  title: string;
  persona: string;
  initialPrompt: string;
  messages: NPCMessage[];
  lastUpdated: number;
  /** 非空表示是在桌边遇上的，谈话可以吃到人家请的一顿 */
  scene?: NPCScene;
}

/** 多人同席时的对话记录：一句话得记下是谁说的 */
export interface NPCGroupMessage extends NPCMessage {
  /** 说话的人；玩家自己写 "player" */
  speakerId: string;
  /** 说话人的名号，界面直接显示 */
  speakerName: string;
}

export interface NPCChatState {
  profiles: NPCProfile[];
  activeNpcId: string | null;
  isTyping: boolean;
  errorMsg: string;
  /** 刚在桌边点开的那个人要用的场面；人设生成时一并写进 profile */
  pendingScene?: NPCScene | null;
  /** 眼下同席的几个人，头一位是最先开口的那位；只有一个人时便是单谈 */
  partyIds: string[];
  /** 多人同席的对话记录；人散了就作废 */
  partyMessages: NPCGroupMessage[];
  /** 这一轮是否有人在斟酌回话 */
  isPartyTyping: boolean;
  /** 作坊里刚报下的价：等玩家点头付钱才作数 */
  pendingCraft?:
    | {
        npcId: string;
        /** 报这份单子的工匠 */
        giver: string;
        offer: CraftOffer;
        /** 作坊名号，取货便去这儿 */
        place: string;
        cityId?: string;
        districtId?: number;
      }
    | null;
}
