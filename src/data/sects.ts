/**
 * 宗门的词条。
 *
 * 一处宗门由四样拼出来：
 *   宗门性质——这伙人修的是哪条路，剑、法、丹、符……
 *   宗门风气——上下怎么相处，是严整如军还是清谈问道
 *   特殊资源·特色——山门里最拿得出手的那一样
 *   开局状态——此刻是什么光景，新立、中兴、内乱方息还是风雨飘摇
 *
 * 每类词条都分两层：一层通用，六地都能用；一层是本文化圈独有的，
 * 出了这一片地界就不成话。
 *
 * 这里只攒词条，不写现成的山门。往后的宗门生成系统照文化圈把四类词条各挑一条，
 * 拼在一处便是一处宗门——名号与驻地不在这份素材里，由地图与叙事去定。
 * 取用一律走下面的几个函数，别处不要直接翻这两张表。
 */

import { CULTURE_SHOP_WEIGHTS } from "@/data/shops";

/** 六种文化背景；与坊市那套用的是同一批名字 */
export const SECT_CULTURES: string[] = Object.keys(CULTURE_SHOP_WEIGHTS);

/** 认不出的文化背景按中原来，与坊市的规矩一致 */
export function normalizeSectCulture(culture: string | undefined): string {
  return culture && SECT_CULTURES.includes(culture) ? culture : "中原";
}

export type SectTermKind = "nature" | "climate" | "feature" | "start";

export const SECT_TERM_KINDS: SectTermKind[] = ["nature", "climate", "feature", "start"];

/** 宗门等级的上限；开局状态里最盛的那一档便到 8 级 */
export const SECT_LEVEL_MAX = 8;

export const SECT_TERM_LABELS: Record<SectTermKind, string> = {
  nature: "宗门性质",
  climate: "宗门风气",
  feature: "特殊资源·特色",
  start: "开局状态",
};

export interface SectTerm {
  id: string;
  /** 词条叫什么，如「剑修」 */
  name: string;
  /** 一句说明；拼提示词、写界面小注都用它 */
  note: string;
}

/**
 * 开局状态另带一副底子：宗门的等级、声望、长老与弟子数。
 * 各处山门照这条词条把数字落下来，免得每一处都从同一个数起头。
 */
export interface SectStartTerm extends SectTerm {
  level: [number, number];
  reputation: [number, number];
  elders: [number, number];
  disciples: [number, number];
}

/** 四类词条各一小池 */
export interface SectTermPool {
  nature: SectTerm[];
  climate: SectTerm[];
  feature: SectTerm[];
  start: SectStartTerm[];
}

/* ===================== 通用词条 ===================== */

export const GENERIC_SECT_TERMS: SectTermPool = {
  nature: [
    { id: "sword", name: "剑修", note: "一门心思在剑上，别家法门只作旁参" },
    { id: "law", name: "法修", note: "以灵气驭法术，咒诀、雷火、罡风都来得" },
    { id: "alchemy", name: "丹修", note: "守着丹炉过日子，火候比境界更要紧" },
    { id: "talisman", name: "符修", note: "朱砂黄纸随身，一笔落下去便是一道法" },
    { id: "artifact", name: "器修", note: "铸剑炼宝，手上先有活计，再谈修行" },
    { id: "body", name: "体修", note: "把一身皮肉当炉子炼，拳脚硬过法宝" },
  ],
  climate: [
    { id: "strict", name: "严整如军", note: "晨钟暮鼓，号令一下无人敢慢" },
    { id: "chat", name: "清谈问道", note: "论道多于动手，殿上常吵到深夜" },
    { id: "protect", name: "护短", note: "自家人吃了亏，山门上下都要出头" },
    { id: "profit", name: "唯利是图", note: "人情往来先算账，灵石说话" },
    { id: "shut", name: "闭门自守", note: "不涉外事，山门三年不开一回" },
    { id: "aloof", name: "不问世事", note: "只顾自家修行，江湖恩怨一概不理" },
    { id: "sociable", name: "好结交", note: "四方来客都留饭，山门前常年有人" },
    { id: "pugnacious", name: "好勇斗狠", note: "几句话不对便要动手，赢了才算讲理" },
  ],
  feature: [
    { id: "vein", name: "活灵脉", note: "山底下一条活脉，弟子打坐比别家快三分" },
    { id: "garden", name: "百亩药圃", note: "四季都有药材出，炼丹不愁料" },
    { id: "swordtomb", name: "剑冢", note: "供着历代断剑，剑意还在，新人常去挨那一身寒" },
    { id: "library", name: "藏经阁", note: "楼里存着几百卷抄本，任人翻阅" },
    { id: "proving", name: "试剑石", note: "一块青石立在庭中，谁想露一手都去劈它" },
    { id: "alchemyhall", name: "炼丹房", note: "七座丹炉昼夜不熄，火候有人轮班看着" },
    { id: "furnace", name: "铸器炉", note: "地火引上来的一口老炉，淬过的兵刃格外利" },
    { id: "drill", name: "演武场", note: "青石铺的大场子，每日卯时都有人过招" },
  ],
  start: [
    {
      id: "new-door",
      name: "初立山门",
      note: "才立起门户，师徒不过十指之数，屋舍还是新的",
      level: [1, 2],
      reputation: [0, 15],
      elders: [0, 1],
      disciples: [3, 9],
    },
    {
      id: "revival",
      name: "中兴之势",
      note: "老辈凋零过一阵，新一辈刚顶上来，人心正齐",
      level: [3, 5],
      reputation: [30, 55],
      elders: [2, 4],
      disciples: [20, 60],
    },
    {
      id: "after-feud",
      name: "内乱方息",
      note: "上一场夺位之争刚按下，面上不问，心里都记着",
      level: [3, 5],
      reputation: [20, 45],
      elders: [1, 3],
      disciples: [15, 45],
    },
    {
      id: "thriving",
      name: "枝繁叶盛",
      note: "内外门数百口人，各处产业正旺",
      level: [6, 8],
      reputation: [60, 85],
      elders: [4, 7],
      disciples: [80, 300],
    },
    {
      id: "hidden",
      name: "隐世不出",
      note: "外头只当这一门早散了，山门其实年年有人",
      level: [4, 6],
      reputation: [5, 20],
      elders: [2, 4],
      disciples: [10, 40],
    },
    {
      id: "rising",
      name: "声名鹊起",
      note: "近来一桩事让江湖都盯着这处山门，来客一日多过一日",
      level: [4, 6],
      reputation: [55, 80],
      elders: [2, 5],
      disciples: [30, 90],
    },
    {
      id: "totter",
      name: "风雨飘摇",
      note: "仇家寻上门，屋舍塌了一角，账上也空了",
      level: [2, 4],
      reputation: [10, 35],
      elders: [1, 3],
      disciples: [5, 25],
    },
  ],
};

/* ===================== 各文化圈的词条 ===================== */

export const CULTURE_SECT_TERMS: Record<string, SectTermPool> = {
  中原: {
    nature: [
      { id: "array", name: "阵修", note: "以阵困人以阵护山，摆开一座便是半座城" },
      { id: "rite", name: "礼修", note: "讲的是规矩与名分，一举一动都有出处" },
      { id: "healer", name: "医者", note: "针石药理都通，救人也收钱" },
    ],
    climate: [
      { id: "rite-law", name: "重礼法", note: "见长辈先执礼，失仪要罚跪香" },
      { id: "faction", name: "门户之见深", note: "正邪分得死，跟旁门的人同桌都算失节" },
      { id: "seniority", name: "论资排辈", note: "本事再大也得先熬年头" },
    ],
    feature: [
      { id: "lecture", name: "传法大殿", note: "殿上一年三讲，讲的是根本大道" },
      { id: "stele", name: "律令碑", note: "碑上刻着历代门规，每一道都是血换的" },
      { id: "ward", name: "护山大阵", note: "阵眼压在四角，寻常修士进不来" },
      { id: "booktower", name: "藏书楼", note: "三层楼都是手抄的老卷，许多已绝了版" },
    ],
    start: [
      {
        id: "new-leader",
        name: "新掌门的头一年",
        note: "掌门刚接位，几位长老还端着架子，吩咐下去总要先打折扣",
        level: [3, 5],
        reputation: [30, 55],
        elders: [3, 5],
        disciples: [30, 80],
      },
      {
        id: "plaque",
        name: "朝廷新赐匾额",
        note: "官府刚送来一块匾，山门前香火正盛，也招来不少眼红",
        level: [5, 7],
        reputation: [60, 80],
        elders: [3, 5],
        disciples: [60, 150],
      },
    ],
  },
  江南: {
    nature: [
      { id: "music", name: "音修", note: "以音入道，一曲能安神也能乱人心神" },
      { id: "lettering", name: "书道", note: "一支笔写符也写道，字里有筋骨" },
    ],
    climate: [
      { id: "elegant", name: "风雅相尚", note: "比的是诗画琴棋，动手反倒落了下乘" },
      { id: "lineage", name: "讲究师承", note: "师出何门问得比境界还细" },
      { id: "letters", name: "文墨为重", note: "门中子弟先读书，再谈修行" },
    ],
    feature: [
      { id: "carp", name: "灵鲤池", note: "池里灵鲤通人性，喂熟了的能替人下水探路" },
      { id: "scores", name: "曲谱库", note: "收着一屋子的旧谱，几支已无人会弹" },
      { id: "barge", name: "画舫", note: "泊在湖心的两条画舫，论道宴客都在船上" },
      { id: "spring", name: "水脉泉眼", note: "泉眼连着地脉，水气养人，也养丹药" },
    ],
    start: [
      {
        id: "after-meet",
        name: "文会刚散",
        note: "一场文会刚散，几家宗门面上客气，彼此都记着谁压了谁一头",
        level: [4, 6],
        reputation: [45, 70],
        elders: [2, 4],
        disciples: [30, 90],
      },
      {
        id: "boat-talk",
        name: "舟中论道未决",
        note: "两位长辈在画舫上论道，吵了三日还没分出高下，门中都在观望",
        level: [4, 6],
        reputation: [40, 65],
        elders: [3, 5],
        disciples: [25, 70],
      },
    ],
  },
  苗疆: {
    nature: [
      { id: "gu", name: "蛊修", note: "养蛊用蛊，虫在人在，虫死人伤" },
      { id: "poison", name: "毒修", note: "百毒熬身，手指头都是药引子" },
      { id: "beast", name: "御兽", note: "与兽同食同宿，一声呼哨能唤来半山野兽" },
      { id: "herbal", name: "药师", note: "认得满山的草，也懂得怎么让草杀人" },
    ],
    climate: [
      { id: "mountain-god", name: "敬山鬼", note: "进山先祭，动土先问，规矩比门规还硬" },
      { id: "elder-rule", name: "寨老说了算", note: "辈分最长的坐着，其余人站着说话" },
      { id: "gu-rank", name: "以蛊论尊卑", note: "谁养的蛊凶，谁就坐上位" },
    ],
    feature: [
      { id: "gu-cave", name: "蛊窟", note: "洞里养着历代传下来的蛊，寻常人进不得" },
      { id: "poison-pool", name: "万毒潭", note: "潭水浑黑，泡过的人皮坚如革，泡不过的就没了" },
      { id: "herb-valley", name: "药王谷", note: "谷中草药四季不断，外头千金难求的这儿满地长" },
      { id: "bronze-drum", name: "铜鼓台", note: "一面老铜鼓架在台上，鼓响便是全寨的事" },
    ],
    start: [
      {
        id: "elder-dying",
        name: "寨老将逝",
        note: "寨老已在帐中躺了半月，几房人各自攒着劲，只等那口气落下去",
        level: [3, 5],
        reputation: [25, 50],
        elders: [2, 4],
        disciples: [20, 60],
      },
      {
        id: "gu-tour",
        name: "蛊神巡寨将启",
        note: "几年一度的蛊神巡寨就要开，各寨都在备蛊，暗里较劲",
        level: [4, 6],
        reputation: [40, 70],
        elders: [2, 4],
        disciples: [30, 80],
      },
    ],
  },
  西域: {
    nature: [
      { id: "star", name: "占卜", note: "夜观星象定行止，动手也先掐一遍星历" },
      { id: "blade", name: "刀修", note: "弯刀出鞘极快，讲究一刀了事" },
    ],
    climate: [
      { id: "free", name: "来去自由", note: "入伙容易退伙也容易，没人问你从哪儿来" },
      { id: "manygods", name: "各拜各的神", note: "供桌上摆着十来尊像，谁也不管谁" },
      { id: "merchant-first", name: "重商利", note: "凡事都可谈价钱，交情也是本钱" },
    ],
    feature: [
      { id: "starterrace", name: "星图台", note: "高台上一幅石刻星图，几百年的星象都记在上面" },
      { id: "ironmine", name: "镔铁矿", note: "山肚子里出镔铁，打出来的刀能削别家的兵刃" },
      { id: "spice", name: "香料园", note: "园里几十味香料，别处买不到的那几味只有这儿有" },
      { id: "oasis", name: "绿洲泉", note: "一眼泉养着一整片绿洲，是这条商道上唯一的活水" },
    ],
    start: [
      {
        id: "caravan",
        name: "商队刚走",
        note: "一支大商队刚出关，账上厚了一笔，也把风声带了出去",
        level: [4, 6],
        reputation: [40, 65],
        elders: [2, 4],
        disciples: [25, 70],
      },
      {
        id: "drought",
        name: "绿洲水源将枯",
        note: "泉眼一年比一年细，邻近几家都盯着这口井",
        level: [3, 5],
        reputation: [30, 55],
        elders: [2, 4],
        disciples: [20, 60],
      },
    ],
  },
  漠北: {
    nature: [
      { id: "shaman", name: "萨满", note: "跳神请灵，狼骨牛角都是法器" },
      { id: "frost", name: "冰寒", note: "在雪里练出来的路数，出手带着一层白霜" },
      { id: "archer", name: "弓骑", note: "马上开弓，走一路射一路" },
      { id: "wrestle", name: "角力", note: "先摔跤，摔赢了再讲道理" },
    ],
    climate: [
      { id: "valor", name: "尚勇", note: "敢不敢往前冲，比本事大小更要紧" },
      { id: "strongest", name: "强者为尊", note: "谁能把谁按在地上，谁就说了算" },
      { id: "oath", name: "轻生重诺", note: "应下的事，冻死在半路上也要办到" },
    ],
    feature: [
      { id: "coldiron", name: "寒铁矿", note: "冻土下的寒铁，锻出来的刀自带寒气" },
      { id: "foxvalley", name: "雪狐谷", note: "谷里养着雪狐，毛皮能御寒，血能入药" },
      { id: "hotspring", name: "温泉", note: "雪窝里的一眼热泉，伤了病了泡一回就见好" },
      { id: "wolves", name: "狼群", note: "养着一群狼，号角一响便与门人一同冲阵" },
    ],
    start: [
      {
        id: "blizzard",
        name: "白灾刚过",
        note: "一场白灾压死大半牲口，营里人人面黄，正四处寻活路",
        level: [3, 5],
        reputation: [25, 50],
        elders: [2, 4],
        disciples: [15, 50],
      },
      {
        id: "horses-raided",
        name: "马群被掠",
        note: "夜里被人掠走一群马，全营憋着这口气，只等查明是谁干的",
        level: [3, 5],
        reputation: [30, 55],
        elders: [2, 4],
        disciples: [20, 55],
      },
    ],
  },
  日韩: {
    nature: [
      { id: "onmyo", name: "阴阳道", note: "画符结印，役使式神，走的也是阴阳之数" },
      { id: "kendo", name: "剑道", note: "只练一刀，把这一刀练到极处" },
      { id: "kyudo", name: "弓道", note: "开弓先静心，一箭出去，心也跟着出去" },
      { id: "forge", name: "锻刀", note: "锻刀即修行，刀的品相便是人的境界" },
    ],
    climate: [
      { id: "ceremony", name: "重仪轨", note: "一举一动都有定式，错一步便要重来" },
      { id: "hierarchy", name: "等级森严", note: "座次、称谓、行礼的深浅，一样都错不得" },
      { id: "clean", name: "好洁成癖", note: "地要日日擦，刀要日日拭，蓬头垢面算失礼" },
    ],
    feature: [
      { id: "onsen", name: "汤泉", note: "山后一眼汤泉，疗伤养气，也用来静心" },
      { id: "deer", name: "白鹿苑", note: "苑里养着一群白鹿，被视为门中之灵" },
      { id: "papercellar", name: "和纸窖", note: "窖里存着几百年攒下的好纸，画符写卷都够用" },
      { id: "forge-yard", name: "锻刀场", note: "火与水的两间老屋，历代名刀都出自这儿" },
    ],
    start: [
      {
        id: "snowed-in",
        name: "一夜大雪封山",
        note: "一夜大雪把山门封死，外头进不来，里头也出不去",
        level: [3, 5],
        reputation: [35, 60],
        elders: [2, 4],
        disciples: [20, 60],
      },
      {
        id: "closed",
        name: "宗主闭门谢客",
        note: "宗主闭门半月不见人，外头传什么的都有",
        level: [4, 6],
        reputation: [40, 65],
        elders: [2, 4],
        disciples: [25, 70],
      },
    ],
  },
};

/* ===================== 地形与名号 ===================== */

/**
 * 宗门依着什么样的地势。地势定下两件事：
 * 一是名号的后缀——山谷出「谷」、海岛出「岛」；
 * 二是驻地怎么写——「长安西南的山谷」「大理北的林深处」。
 * 同一文化圈惯出哪几种地势，见下面的权重表。
 */
export interface SectMapType {
  id: string;
  name: string;
  note: string;
  /** 名号后缀候选 */
  suffixes: string[];
  /** 驻地里的地貌写法 */
  seatWord: string;
}

export const SECT_MAP_TYPES: SectMapType[] = [
  { id: "valley", name: "山谷", note: "两面山夹着一道缓坡，进出只有一条路", suffixes: ["谷", "坞", "涧"], seatWord: "山谷" },
  { id: "isle", name: "海岛", note: "四面皆水，往来全靠渡船", suffixes: ["岛", "洲", "屿"], seatWord: "海岛" },
  { id: "cave", name: "洞窟", note: "山腹里掏出来的一片地方，冬暖夏凉", suffixes: ["洞", "窟"], seatWord: "洞天" },
  { id: "plain", name: "平原", note: "一望无际，无险可守，只靠人手撑着", suffixes: ["庄", "坪"], seatWord: "平野" },
];

export function findSectMapType(id: string | undefined): SectMapType | undefined {
  return SECT_MAP_TYPES.find((t) => t.id === id);
}

/** 六地各惯出哪几种地势，数大者常见；没列的一概不掷 */
export const SECT_MAP_TYPE_WEIGHTS: Record<string, Record<string, number>> = {
  中原: { plain: 3, valley: 3, cave: 1 },
  江南: { isle: 3, valley: 2, plain: 2, cave: 1 },
  苗疆: { cave: 4, valley: 3, plain: 1 },
  西域: { plain: 3, cave: 3, valley: 1 },
  漠北: { plain: 4, valley: 2, cave: 1 },
  日韩: { isle: 4, valley: 3, plain: 1, cave: 1 },
};

/** 按文化圈掷一处地势 */
export function rollSectMapType(culture?: string, rand: () => number = Math.random): SectMapType {
  const c = normalizeSectCulture(culture);
  const weights = SECT_MAP_TYPE_WEIGHTS[c] ?? {};
  const total = SECT_MAP_TYPES.reduce((sum, t) => sum + (weights[t.id] || 0), 0);
  if (total <= 0) return SECT_MAP_TYPES[0];

  let roll = rand() * total;
  for (const type of SECT_MAP_TYPES) {
    roll -= weights[type.id] || 0;
    if (roll < 0) return type;
  }
  return SECT_MAP_TYPES[0];
}

/**
 * 各文化圈的名号前缀。后缀照地势取，故一处山门的名号是
 * 「前缀 + 地貌用字」拼出来的，如中原山谷出「太岳谷」、江南海岛出「听雨岛」。
 */
export const SECT_NAME_PREFIXES: Record<string, string[]> = {
  中原: ["太岳", "嵩阳", "洛水", "丹霞", "青云", "白鹿", "中州", "河洛", "铁律", "望岳"],
  江南: ["听雨", "画舫", "曲水", "杏林", "兰亭", "濯缨", "云锦", "烟雨", "垂虹", "竹隐"],
  苗疆: ["万蛊", "五毒", "铜鼓", "蛇骨", "药王", "百虫", "山鬼", "藤桥", "蛊楼", "雾岭"],
  西域: ["星历", "弯刀", "乳香", "琉璃", "驼铃", "沙洲", "胡姬", "高昌", "胡杨", "夜光"],
  漠北: ["狼旗", "苍狼", "雪狐", "萨满", "冻原", "马背", "白灾", "火塘", "狼牙", "风口"],
  日韩: ["鹤鸣", "樱枝", "白鹿", "御札", "松风", "玉钢", "汤泉", "石灯", "寒梅", "小町"],
};

/** 写驻地用的方位；山门在哪座城的哪一边，掷出来便是 */
const SECT_BEARINGS = ["东", "南", "西", "北", "东南", "西北", "东北", "西南"];

/* ===================== 取用 ===================== */

/** 某一类词条在某个文化圈下的全池：通用的在前，本地的在后，撞 id 的以本地为准 */
export function sectTermPool(kind: SectTermKind, culture?: string): SectTerm[] {
  const local = CULTURE_SECT_TERMS[normalizeSectCulture(culture)];
  const generic = GENERIC_SECT_TERMS[kind] as SectTerm[];
  const own = (local?.[kind] ?? []) as SectTerm[];
  const taken = new Set(own.map((t) => t.id));
  return [...generic.filter((t) => !taken.has(t.id)), ...own];
}

/** 按 id 找一条词条；本地没有就翻通用的 */
export function findSectTerm(kind: SectTermKind, id: string, culture?: string): SectTerm | undefined {
  return sectTermPool(kind, culture).find((t) => t.id === id);
}

/** 开局状态那一条，另带数字底子 */
export function sectStartTerm(id: string, culture?: string): SectStartTerm | undefined {
  return (sectTermPool("start", culture) as SectStartTerm[]).find((t) => t.id === id);
}

/** 一处宗门的四样，各自记的是词条 id */
export interface SectCombo {
  culture: string;
  nature: string;
  climate: string;
  feature: string;
  start: string;
}

const pickOne = (kind: SectTermKind, culture: string, rand: () => number) => {
  const pool = sectTermPool(kind, culture);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))].id;
};

/**
 * 从四类词条里各随手挑一条，凑成一处山门的底子。
 * 这就是往后「宗门生成系统」的起点：给了文化圈，一处宗门就拼出来了。
 */
export function rollSectCombo(culture?: string, rand: () => number = Math.random): SectCombo {
  const c = normalizeSectCulture(culture);
  return {
    culture: c,
    nature: pickOne("nature", c, rand),
    climate: pickOne("climate", c, rand),
    feature: pickOne("feature", c, rand),
    start: pickOne("start", c, rand),
  };
}

/** 一处宗门的底子：四类词条落到 sect 那几样字段上 */
export interface ComposedSect {
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
  /** 四类词条的名目，写提示词时一并报上 */
  terms: { nature: string; climate: string; feature: string; start: string };
}

/** 从区间里掷一个数，两端都算得着 */
const rollOf = (range: [number, number], rand: () => number): number => {
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  return Math.min(hi, Math.max(lo, Math.round(lo + rand() * (hi - lo))));
};

/**
 * 把一处词条组合摊成能填进存档的宗门字段。
 * 数字照开局状态给的那几个区间现掷——同为「初立山门」，各处深浅也不一样。
 */
export function composeSect(combo: SectCombo, rand: () => number = Math.random): ComposedSect {
  const culture = combo.culture || "中原";
  const nature = findSectTerm("nature", combo.nature, culture);
  const climate = findSectTerm("climate", combo.climate, culture);
  const feature = findSectTerm("feature", combo.feature, culture);
  const start = sectStartTerm(combo.start, culture);

  return {
    level: start ? rollOf(start.level, rand) : 1,
    reputation: start ? rollOf(start.reputation, rand) : 0,
    elders: start ? rollOf(start.elders, rand) : 0,
    disciples: start ? rollOf(start.disciples, rand) : 0,
    appearance:
      nature && feature
        ? `${nature.name}一脉，山门里最拿得出手的是${feature.name}——${feature.note}`
        : feature?.note ?? "",
    reputationDesc: climate ? `${climate.name}，${climate.note}` : "",
    surroundings: start ? `${start.name}——${start.note}` : "",
    terms: {
      nature: nature?.name ?? "",
      climate: climate?.name ?? "",
      feature: feature?.name ?? "",
      start: start?.name ?? "",
    },
  };
}

/** 现拼出来的一处山门：名号、驻地、地势，加四类词条与那一副底子 */
export interface SectDraft {
  name: string;
  /** 驻地写法，如「长安西南的山谷」 */
  seat: string;
  mapType: SectMapType;
  combo: SectCombo;
  composed: ComposedSect;
}

/**
 * 现拼一处山门：先照文化圈掷四类词条，再照地势取名号与驻地。
 * used 传的是这一局里已经用过的名号，能不撞就不撞。
 */
export function rollSectDraft(params: {
  culture: string;
  /** 山门落在哪座城附近，驻地照它写 */
  cityName: string;
  mapType: SectMapType;
  /** 这一局里已经用过的名号 */
  used?: Set<string>;
  rand?: () => number;
}): SectDraft {
  const rand = params.rand ?? Math.random;
  const culture = normalizeSectCulture(params.culture);
  const used = params.used ?? new Set<string>();
  const prefixes = SECT_NAME_PREFIXES[culture] ?? SECT_NAME_PREFIXES.中原;
  const suffixes = params.mapType.suffixes;
  const pickOne = <T>(list: T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];

  // 名号是「前缀 + 地貌用字」拼的，撞上一处便再拼一回
  let name = pickOne(prefixes) + pickOne(suffixes);
  for (let i = 0; i < 40 && used.has(name); i++) {
    name = pickOne(prefixes) + pickOne(suffixes);
  }
  // 前缀与地貌字都撞满了，缀一个次序，仍不与众家重号
  for (let n = 2; used.has(name); n++) {
    name = `${pickOne(prefixes)}${pickOne(suffixes)}${n}`;
  }

  const combo = rollSectCombo(culture, rand);
  return {
    name,
    seat: `${params.cityName}${pickOne(SECT_BEARINGS)}的${params.mapType.seatWord}`,
    mapType: params.mapType,
    combo,
    composed: composeSect(combo, rand),
  };
}

/**
 * 把六地的词条一并导成一份总表，给往后的宗门编辑器用。
 * 与坊市、宗门图那两处的导出是一个路数。
 */
export function sectMaterialExportJson(): string {
  return JSON.stringify(
    {
      cultures: SECT_CULTURES,
      generic: GENERIC_SECT_TERMS,
      cultureTerms: CULTURE_SECT_TERMS,
    },
    null,
    2,
  );
}
