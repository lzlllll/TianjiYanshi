/**
 * 城内街区上现认的人。
 *
 * 姓名与营生都是从下面几张表里现拼的——街市上一面之缘的人不必惊动模型，
 * 谈过一次之后由 meetNpc 固定进尘缘，此后就一直是这个人。
 */

import { getDistricts, getMarker } from "@/data/map";
import type { JobCastRole, Manor, Relation } from "@/data/types";

/** 姓氏库 */
const SURNAMES = [
  "赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈",
  "蒋", "沈", "韩", "杨", "朱", "秦", "许", "何", "吕", "施",
  "孔", "曹", "严", "华", "金", "魏", "陶", "姜", "谢", "邹",
  "柏", "窦", "章", "云", "苏", "潘", "葛", "范", "彭", "鲁",
  "韦", "马", "苗", "花", "方", "俞", "任", "袁", "柳", "鲍",
  "史", "唐", "廉", "岑", "薛", "雷", "贺", "倪", "汤", "殷",
  "罗", "郝", "安", "常", "乐", "于", "傅", "卞", "齐", "康",
  "余", "顾", "孟", "黄", "穆", "萧", "尹", "姚", "汪", "毛",
  "米", "明", "成", "戴", "宋", "庞", "熊", "舒", "项", "祝",
  "董", "梁", "杜", "阮", "蓝", "季", "贾", "路", "江", "郭",
  "林", "钟", "徐", "邱", "骆", "高", "夏", "蔡", "田", "樊",
  "胡", "凌", "虞", "万", "柯", "管", "卢", "莫", "房", "缪",
  "解", "应", "宗", "丁", "邓", "单", "洪", "包", "石", "崔",
];

/** 名字库：单字与双字混在一起，随机取一个接在姓后 */
const GIVEN_NAMES = [
  "云", "山", "川", "河", "松", "柏", "石", "岩", "江", "湖",
  "风", "雨", "霜", "雪", "月", "星", "竹", "梅", "兰", "菊",
  "槐", "柳", "荷", "生", "财", "旺", "福", "禄", "寿", "喜",
  "安", "平", "康", "泰", "春", "夏", "秋", "冬", "明", "亮",
  "铁", "牛", "虎", "豹", "龙", "凤", "燕", "莺", "巧", "灵",
  "秀", "英", "华", "芳", "香", "玉", "珠", "翠", "碧", "元",
  "仁", "义", "礼", "智", "信", "忠", "孝", "勇", "刚", "毅",
  "远", "志", "清", "白", "素", "简", "平儿", "小宝", "二狗", "大牛",
  "三娘", "四郎", "阿七", "阿宝", "阿福", "阿贵", "阿兴", "阿旺", "小翠", "小环",
  "小满", "小寒", "立春", "谷雨", "白露", "霜降", "端午", "中秋", "长庚", "启明",
  "青禾", "秋实", "知秋", "望山", "归舟", "渡江", "守拙", "抱朴", "怀安", "念慈",
  "思远", "慕白", "疏影", "暗香", "惊鸿", "一苇", "半城", "拾光", "听雪", "问水",
];

/** 平民百姓的营生、所属与通常的性别 */
const CALLINGS: [string, string, string][] = [
  ["铁匠", "城西铁铺", "男"],
  ["绣娘", "家中", "女"],
  ["货郎", "走街串巷", "男"],
  ["更夫", "城防", "男"],
  ["酒保", "街口酒肆", "男"],
  ["药铺伙计", "回春堂", "男"],
  ["私塾先生", "街坊私塾", "男"],
  ["樵夫", "城外", "男"],
  ["渔翁", "河下", "男"],
  ["磨刀匠", "无", "男"],
  ["说书人", "街角茶棚", "男"],
  ["卦师", "城隍庙前", "男"],
  ["屠户", "东市", "男"],
  ["裁缝", "家中", "女"],
  ["船娘", "渡口", "女"],
  ["担水人", "水铺", "男"],
  ["面摊老板", "街角", "女"],
  ["木匠", "鲁班行", "男"],
  ["泥瓦匠", "营造行", "男"],
  ["卖花婆", "花市", "女"],
  ["看门人", "大户人家", "男"],
  ["厨娘", "大户人家", "女"],
  ["乳母", "大户人家", "女"],
  ["挑夫", "码头", "男"],
  ["走方郎中", "无", "男"],
  ["打更人", "城防", "男"],
  ["皮匠", "西巷", "男"],
  ["剃头匠", "街口", "男"],
  ["纸马匠", "丧仪铺", "男"],
  ["扎灯匠", "上元铺", "男"],
  ["染工", "染坊", "男"],
  ["织工", "织坊", "女"],
];

const PERSONALITIES = [
  "沉默寡言", "心直口快", "精于算计", "热心肠", "胆小怕事",
  "好打听事", "爱占小便宜", "谨小慎微", "倔强执拗", "和善健谈",
  "冷面热心", "懒散随性", "勤恳本分", "爱说笑", "嘴碎",
  "稳重老成", "泼辣爽利", "憨厚老实", "精明世故", "话里总带三分怨气",
];

const APPEARANCES = [
  "身形瘦削", "面有风霜", "手脚粗大", "眉眼温和", "面色黝黑",
  "腰背微驼", "指节生茧", "一双手总是湿的", "眼角有道旧疤", "眉眼里有几分英气",
  "穿一身洗得发白的粗布", "鬓角已白", "满面笑纹", "目光游移不定", "走路带着一点跛",
];

const ORIGINS = [
  "祖上三代都在城里", "逃荒来的", "原是城外农户", "早年跑过船",
  "曾在镖局做过杂役", "从军回来的", "小时候被卖到城里", "家里开过铺子，败了",
  "外乡迁来", "是本城的老户", "曾在道观里做过杂役", "说不清自己从哪里来",
];

const REALMS = ["凡人", "凡人", "凡人", "炼气初期", "炼气初期", "炼气中期", "炼气后期", "筑基初期"];

/**
 * 六地的姓氏与名号各成一套，上面那两张表是中原的底子。
 * 名里混着单字与双字，单字的那几个还要给大户人家的字辈名留位置。
 * 认不出的文化背景按中原算，故新添地域只是往这里加一栏。
 */
const CULTURE_NAMES: Record<string, { surnames: string[]; given: string[] }> = {
  中原: { surnames: SURNAMES, given: GIVEN_NAMES },
  江南: {
    surnames: [
      "沈", "陆", "顾", "徐", "朱", "钱", "郁", "翁", "褚", "范",
      "华", "倪", "虞", "包", "盛", "柳", "严", "邬", "章", "萧",
      "鲍", "费", "蒋", "宣", "蒲", "劳", "柏", "阮", "水", "邢",
    ],
    given: [
      "婉", "淑", "兰", "舟", "汀", "蘅", "苹", "菱", "砚", "卿",
      "蕴", "毓", "澜", "潮", "昀", "昙", "溟", "纨", "蕙", "泠",
      "汀兰", "疏影", "听雨", "问渠", "望舒", "素秋", "青鸾", "子夜", "枕流", "漱玉",
      "云舫", "霁月", "小满", "长庚", "清商", "烟舟", "佩兰", "扶苏", "越绫", "芷若",
    ],
  },
  日韩: {
    surnames: [
      "藤原", "源", "平", "橘", "织田", "武田", "上杉", "北条", "足利", "毛利",
      "岛津", "真田", "伊达", "前田", "菅原", "大江", "李", "金", "朴", "崔",
      "郑", "姜", "尹", "韩", "申", "具", "闵", "柳", "林", "宋",
    ],
    given: [
      "信", "谦", "政", "宗", "吉", "康", "秀", "义", "赖", "时",
      "盛", "隆", "元", "准", "度", "翊", "寅", "奭",
      "义经", "赖朝", "时赖", "政宗", "信玄", "谦信", "元就", "宗茂", "秀吉", "家康",
      "直家", "隆景", "道雪", "庆次", "成桂", "芳远", "世宗", "文宗", "舜臣", "光海",
    ],
  },
  西域: {
    surnames: [
      "安", "康", "曹", "石", "米", "何", "史", "穆", "萨", "尉迟",
      "白", "裴", "苏", "伽", "檀", "都", "乌", "支", "毕", "单",
      "屈", "罗", "贺", "黎", "库", "伊", "阿", "竺",
    ],
    given: [
      "沙", "月", "檀", "伽", "裴", "塞", "尔", "法", "里", "木",
      "拉", "乌", "苏", "和",
      "萨保", "和卓", "阿里", "玉素", "阿卜", "库尔", "苏禄", "马尔", "哈桑", "伊本",
      "苏尔", "阿里木", "玉素甫", "阿不都", "萨都", "木萨", "和世", "伽罗", "檀奴", "都尔",
    ],
  },
  漠北: {
    surnames: [
      "拓跋", "慕容", "独孤", "呼延", "贺兰", "斛律", "纥骨", "乞失", "回纥", "耶律",
      "述律", "阿史德", "叱列", "药罗葛", "仆骨", "拔也", "乌", "纥", "莫", "贺",
      "突", "骨", "叱", "伊", "拔", "乞", "兰", "斛",
    ],
    given: [
      "铁", "巴", "乌", "苏", "格", "萨", "塔", "恩", "德", "图",
      "宝", "哈", "青", "兰",
      "铁木", "巴图", "乌兰", "苏和", "巴特", "阿古拉", "朝鲁", "格日", "其其格", "萨仁",
      "塔娜", "呼斯", "恩和", "德力", "阿木", "斯琴", "乌日", "娜仁", "浩毕", "满都",
      "哈斯", "图门", "宝音", "察干", "格桑",
    ],
  },
  苗疆: {
    surnames: [
      "龙", "麻", "石", "梁", "覃", "冉", "田", "向", "蓝", "雷",
      "钟", "兰", "蒙", "莫", "岑", "谭", "潘", "凤", "韦", "吴",
      "罗", "白", "杨", "陆", "黄", "彭", "邝", "陀",
    ],
    given: [
      "桑", "朵", "岩", "石", "花", "银", "香", "山", "月", "水",
      "龙", "木", "刀", "火", "田",
      "阿朵", "阿妹", "阿岩", "阿七", "岩生", "刀妹", "银花", "云妹", "岩妹", "木香",
      "六月", "三月", "水生", "石生", "阿榜", "阿香", "龙妹", "九妹", "朵邦", "岩朵",
    ],
  },
};

function namesFor(culture: string | undefined) {
  return (culture && CULTURE_NAMES[culture]) || CULTURE_NAMES.中原;
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** 名库里「郎」「娘」这类字带性别，挑名时避开，免得娘子叫了「四郎」 */
function pickGivenName(gender: string, culture: string | undefined): string {
  const pool = namesFor(culture).given;
  const banned = gender === "女" ? "郎" : "娘";
  for (let i = 0; i < 20; i++) {
    const name = pick(pool);
    if (!name.includes(banned)) return name;
  }
  return pick(pool);
}

/**
 * 大户人家本家孩子的第三个字：从当地名池里取一个单字。
 * 池子里若尽是双字，就退回中原的单字名，总不至于拼出四个字的名字。
 */
function pickKinChar(gender: string, culture: string | undefined): string {
  const singles = namesFor(culture).given.filter((n) => n.length === 1);
  if (singles.length === 0) return pick(GIVEN_NAMES.filter((n) => n.length === 1));
  const banned = gender === "女" ? "郎" : "娘";
  const usable = singles.filter((n) => !n.includes(banned));
  return pick(usable.length > 0 ? usable : singles);
}

let counter = 0;

/**
 * 现拼一个街上的人。
 * 姓名是姓与名直接拼起来的，姓与名都按当地的名池取，人设细目从各库里各取一条。
 */
export function rollDistrictNpc(
  metAt: string,
  cityId: string,
  districtId: number,
  culture?: string,
): Relation {
  const [title, affiliation, gender] = pick(CALLINGS);
  const appearance = pick(APPEARANCES);
  const personality = pick(PERSONALITIES);
  const origin = pick(ORIGINS);

  counter += 1;

  return {
    id: `npc-${cityId}-${districtId}-${Date.now().toString(36)}-${counter}`,
    name: pick(namesFor(culture).surnames) + pickGivenName(gender, culture),
    title,
    type: "friend",
    affinity: 20 + Math.floor(Math.random() * 20),
    affinityMax: 100,
    realm: pick(REALMS),
    note: `在${metAt}撞见的人：${title}。${appearance}，${personality}，${origin}。`,
    gender,
    age: 16 + Math.floor(Math.random() * 52),
    origin,
    personality,
    appearance,
    affiliation,
    cityId,
    districtId,
    metAt,
  };
}

/**
 * 照一桩差事要用的角色现掷一个人：姓名、形貌、性情从各库里取，
 * 称谓与人设照角色说明写死，好让叙事一照面就认得这人是来做什么的。
 * 接取时钉进目标地块，玩家长住此地，办完事期限一到便自行归常。
 */
export function rollQuestNpc(
  role: JobCastRole,
  metAt: string,
  cityId: string,
  districtId: number | undefined,
  culture?: string,
  location?: string,
): Relation {
  const gender = role.gender === "男" || role.gender === "女"
    ? role.gender
    : Math.random() < 0.5
      ? "男"
      : "女";
  const appearance = pick(APPEARANCES);
  const personality = pick(PERSONALITIES);
  const origin = pick(ORIGINS);
  const antagonist = role.side === "antagonist";

  counter += 1;

  return {
    id: `questnpc-${cityId}-${districtId ?? "sect"}-${Date.now().toString(36)}-${counter}`,
    name: pick(namesFor(culture).surnames) + pickGivenName(gender, culture),
    title: role.title,
    type: antagonist ? "enemy" : "friend",
    affinity: antagonist ? 8 + Math.floor(Math.random() * 10) : 24 + Math.floor(Math.random() * 16),
    affinityMax: 100,
    realm: pick(REALMS),
    note: `${metAt}的${role.title}。${appearance}，${personality}，${origin}。`,
    gender,
    age: 20 + Math.floor(Math.random() * 48),
    origin,
    personality,
    appearance,
    affiliation: "无",
    persona: role.persona,
    cityId,
    ...(typeof districtId === "number" ? { districtId } : {}),
    metAt,
    ...(location ? { location } : {}),
  };
}

/**
 * 这人眼下是不是钉在这座城里：叙事给他定下的期限还没过。
 * 期限一过便不再钉着，往后随缘在别处露面。
 */
export function isPinnedInCity(r: Relation, cityId: string, today: number): boolean {
  return r.fixedUntilDay !== undefined && r.fixedUntilDay >= today && r.cityId === cityId;
}

/** 是不是正钉在这一处街区上：城池与街区都对得上，且期限还没过 */
export function isPinnedAt(r: Relation, cityId: string, districtId: number, today: number): boolean {
  return isPinnedInCity(r, cityId, today) && r.districtId === districtId;
}

/**
 * 这人眼下在哪儿，写到字面上。
 * 城池认得出就报「城名·街区」；只说得出城名的，就写「城名一带」；
 * 从来没定下行踪的，只好说行踪不定。
 */
export function relationWhereabout(
  r: Relation,
  districtNames?: Record<string, string>,
): string {
  // 开局叙事里认下的人只有一句地名，照它写
  if (r.location) return r.location;
  const city = r.cityId ? getMarker(r.cityId) : undefined;
  if (!city) return "行踪不定";
  if (typeof r.districtId !== "number") return `${city.name}一带`;
  const named = districtNames?.[`${city.id}:${r.districtId}`];
  const nature = getDistricts(city.id).find((d) => d.id === r.districtId)?.nature;
  const spot = named || nature;
  return spot ? `${city.name}·${spot}` : city.name;
}

/** 这人眼下是不是就在这一处：街区对得上，或只知道在这座城里 */
export function isAroundHere(r: Relation, cityId: string, districtId: number): boolean {
  if (r.cityId !== cityId) return false;
  return typeof r.districtId !== "number" || r.districtId === districtId;
}

/**
 * 两个地名是不是指同一处。
 * 模型与人各写各的，往往多个「城」「山门」之类的尾巴，故去掉这些字再互相看，
 * 如「扬州城」对「扬州」、「青云宗山门」对「青云宗」，都算一处。
 */
function samePlaceName(a?: string, b?: string): boolean {
  const norm = (s?: string) =>
    String(s || "")
      .replace(/[城池镇府县郡州市一带门宗派观寺庙庄谷峰岭山]/g, "")
      .trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * 这人眼下是不是与你在一处。
 * 同行的人自然在一处；写明了所在地的比地名；
 * 只记下城池的比城池；从没定下行踪的，便不算在一处。
 */
export function isNpcAround(
  r: Relation | undefined,
  here: { placeId?: string; placeName?: string },
): boolean {
  if (!r) return false;
  if (r.traveling) return true;
  if (r.location) return samePlaceName(r.location, here.placeName);
  if (r.cityId) return r.cityId === here.placeId;
  return false;
}

/** 这人的行踪是否有据可查：同行、写明了地点，或至少知道在哪座城 */
export function isNpcLocationKnown(r: Relation | undefined): boolean {
  if (!r) return false;
  if (r.traveling) return true;
  if (r.location && r.location.trim()) return true;
  return !!(r.cityId && r.cityId.trim());
}

/** 至多带几个人同行；再多，一路上不像话，打起来也顾不过来 */
export const MAX_TRAVEL_COMPANIONS = 3;

/** 眼下与你同行的有几位 */
export function travelingCount(relations: Relation[] | undefined): number {
  return (Array.isArray(relations) ? relations : []).filter((r) => r?.traveling).length;
}

/** 一处街区上现认几个生面孔 */
export function rollDistrictNpcs(
  metAt: string,
  cityId: string,
  districtId: number,
  culture?: string,
  count = 3,
  excludeNames: string[] = [],
): Relation[] {
  const taken = new Set(excludeNames);
  const list: Relation[] = [];
  // 名字撞了就重掷，掷不出来也不硬凑，少一个人便是
  for (let i = 0; i < count * 12 && list.length < count; i++) {
    const npc = rollDistrictNpc(metAt, cityId, districtId, culture);
    if (taken.has(npc.name)) continue;
    taken.add(npc.name);
    list.push(npc);
  }
  return list;
}

// ===== 大户人家 =====

/** 门第：这家的家业从哪儿来 */
const MANOR_STANDINGS = [
  "城中数得着的粮商",
  "开着三间绸缎庄",
  "告老还乡的四品京官",
  "祖上出过两榜进士的书香门第",
  "掌着半城漕运的船行东家",
  "城西有名的药材行东家",
  "世袭的武官人家",
  "铸过兵器的匠户大户",
  "城外有千顷良田的地主",
  "放印子钱起家的富户",
];

/**
 * 宅里的亲眷：辈分、称谓、通常性别、年岁区间。
 * 辈分 0 为尊辈、1 为父辈、2 为子辈，同辈共用一个字辈；西域一脉不排字辈。
 */
const KIN_TITLES: { gen: number; title: string; gender: string; ageLo: number; ageHi: number }[] = [
  { gen: 0, title: "老太爷", gender: "男", ageLo: 62, ageHi: 82 },
  { gen: 0, title: "老夫人", gender: "女", ageLo: 58, ageHi: 78 },
  { gen: 1, title: "家主", gender: "男", ageLo: 38, ageHi: 58 },
  { gen: 1, title: "主母", gender: "女", ageLo: 34, ageHi: 56 },
  { gen: 1, title: "三房姨娘", gender: "女", ageLo: 24, ageHi: 42 },
  { gen: 2, title: "大公子", gender: "男", ageLo: 16, ageHi: 30 },
  { gen: 2, title: "大小姐", gender: "女", ageLo: 14, ageHi: 28 },
  { gen: 2, title: "二公子", gender: "男", ageLo: 13, ageHi: 26 },
  { gen: 2, title: "二小姐", gender: "女", ageLo: 10, ageHi: 24 },
];

/** 宅里的执事仆役：称谓、通常性别、年岁区间 */
const MANOR_SERVANTS: [string, string, number, number][] = [
  ["管事", "男", 40, 60],
  ["账房先生", "男", 45, 66],
  ["护院", "男", 25, 45],
  ["塾师", "男", 40, 65],
  ["小厮", "男", 14, 22],
  ["厨娘", "女", 35, 55],
  ["乳母", "女", 40, 58],
  ["丫鬟", "女", 15, 24],
  ["绣娘", "女", 18, 30],
  ["侍女", "女", 16, 26],
];

/** 字辈用的字，从这部「辈谱」里按辈分取，同辈第二个字都相同；西域一脉不排字辈，用不着它 */
const GENERATION_CHARS = [
  "德", "文", "承", "宗", "永", "昌", "世", "泽",
  "毓", "秀", "钟", "灵", "光", "裕", "延", "绍",
];

let manorCounter = 0;

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++manorCounter}`;

/** 宅邸的称呼，如「长安·赵府」 */
export function manorTitle(cityName: string, manor: Manor): string {
  return `${cityName}·${manor.surname}府`;
}

/** 宅号，如「赵府」；城图上地方窄，只挂这一截 */
export function manorHouseName(manor: Manor): string {
  return `${manor.surname}府`;
}

/** 宅邸在存档里的键 */
export function manorKey(cityId: string, districtId: number): string {
  return `${cityId}:${districtId}`;
}

/**
 * 尘缘里的标签。
 * 道侣、师父、仇敌，以及情谊过线的徒弟与好友，都算「重要NPC」——
 * 他们会随日子自行行动、留下记忆。情谊太浅的好友只是「点头之交」。
 */
/** 信任的五档名目，下标即档位；0 不用 */
export const TRUST_NAMES = ["", "不可信任", "尚存嫌隙", "相交莫逆", "推心置腹", "同生共死"] as const;

/** 新结识的人：关系平交，信任起于第 2 档 */
export const STRANGER_TRUST = 2;

/** 信任落在哪一档的名字 */
export function trustName(trust: number | undefined): string {
  const t = Math.max(1, Math.min(5, Math.round(Number(trust) || STRANGER_TRUST)));
  return TRUST_NAMES[t];
}

/**
 * 旧档的情谊折算成「关系」与「信任」；已有新值的原样返回。
 * 情谊 0~100 折成关系 -100~100，信任按情谊分档。
 */
export function migrateRelation(r: Relation): Relation & { relation: number; trust: number } {
  if (typeof r.relation === "number" && typeof r.trust === "number") {
    return r as Relation & { relation: number; trust: number };
  }
  const a = Number(r.affinity);
  const legacy = Number.isFinite(a) ? Math.max(0, Math.min(100, a)) : 50;
  const relation = Math.round(legacy * 2 - 100);
  const trust = legacy >= 90 ? 5 : legacy >= 70 ? 4 : legacy >= 45 ? 3 : legacy >= 20 ? 2 : 1;
  return { ...r, relation, trust };
}

export function relationTags(r: Relation): string[] {
  const m = migrateRelation(r);
  const rel = Number(m.relation) || 0;
  const important =
    m.type === "dao_companion" ||
    m.type === "master" ||
    m.type === "enemy" ||
    (m.type === "disciple" && rel > 0) ||
    (m.type === "friend" && rel > 40);
  const tags: string[] = [];
  if (important) tags.push("重要NPC");
  if (m.type === "friend" && rel < -80) tags.push("点头之交");
  return tags;
}

/**
 * 一位铺子掌柜：开市时一并定下来，往后进这家铺子都是同一个人。
 * 女掌柜按「老板娘」称呼，别处一律叫「掌柜」。
 */
export function rollShopkeeper(
  cityId: string,
  districtId: number,
  shopName: string,
  culture?: string,
): Relation {
  const gender = Math.random() < 0.75 ? "男" : "女";
  const appearance = pick(APPEARANCES);
  const personality = pick(PERSONALITIES);
  const origin = pick(ORIGINS);

  return {
    id: makeId(`keeper-${cityId}-${districtId}`),
    name: pick(namesFor(culture).surnames) + pickGivenName(gender, culture),
    title: gender === "女" ? "老板娘" : "掌柜",
    type: "friend",
    affinity: 20 + Math.floor(Math.random() * 20),
    affinityMax: 100,
    realm: pick(REALMS),
    note: `${shopName}的掌柜。${appearance}，${personality}，${origin}。`,
    gender,
    age: 26 + Math.floor(Math.random() * 38),
    origin,
    personality,
    appearance,
    affiliation: shopName,
    cityId,
    districtId,
    metAt: shopName,
  };
}

/**
 * 掷一户大户人家：姓、门第、门房、字辈与宅中人口都从上面的池子里现取，
 * 掷完就写进存档，往后每次推门进去都还是这户人家。
 *
 * 人口合计不少于十人：本家占去一半以上，同姓的按字辈排辈谱，同辈第二个字相同；
 * 西域一脉不排字辈，姓后直接缀名，同辈不共字。余下是执事仆役，另姓。
 */
export function rollManor(
  cityId: string,
  districtId: number,
  cityName: string,
  culture?: string,
): Manor {
  const surname = pick(namesFor(culture).surnames);
  const standing = pick(MANOR_STANDINGS);
  const label = `${cityName}·${surname}府`;

  // 三个辈分各取一个辈字，尊辈、父辈、子辈各不同；西域不排字辈，辈字一律留空
  const usesGeneration = culture !== "西域";
  const charPool = GENERATION_CHARS.slice();
  const genChars = usesGeneration
    ? [0, 1, 2].map(() => charPool.splice(Math.floor(Math.random() * charPool.length), 1)[0])
    : ["", "", ""];

  // 尊辈两人、父辈三人固定，子辈二至四人：本家合计七到九人
  const pool = KIN_TITLES.slice();
  const take = (titles: typeof KIN_TITLES) =>
    titles.map((t) => {
      const at = pool.findIndex((p) => p.title === t.title);
      return pool.splice(at, 1)[0];
    });

  const kinTitles = [
    ...take(pool.filter((t) => t.gen === 0)),
    ...take(pool.filter((t) => t.gen === 1)),
    ...take(pool.filter((t) => t.gen === 2).slice(0, 2 + Math.floor(Math.random() * 3))),
  ];

  const usedNames = new Set<string>();
  const kin: Relation[] = kinTitles.map(({ gen, title, gender, ageLo, ageHi }) => {
    const appearance = pick(APPEARANCES);
    const personality = pick(PERSONALITIES);
    const origin = `${surname}家本支`;
    // 姓 + 辈字 + 名；同辈的第二个字一律相同，第三个字各取一个不重样的。
    // 西域不排字辈，辈字是空串，姓后直接缀名。
    const mid = genChars[gen];
    let given = pickKinChar(gender, culture);
    for (let i = 0; i < 12 && usedNames.has(surname + mid + given); i++) {
      given = pickKinChar(gender, culture);
    }
    const name = surname + mid + given;
    usedNames.add(name);

    return {
      id: makeId(`manor-${cityId}-${districtId}`),
      name,
      title,
      type: "friend" as const,
      affinity: 20 + Math.floor(Math.random() * 20),
      affinityMax: 100,
      realm: pick(REALMS),
      note: `${label}的${title}。${appearance}，${personality}，${origin}。`,
      gender,
      age: ageLo + Math.floor(Math.random() * (ageHi - ageLo + 1)),
      origin,
      personality,
      appearance,
      affiliation: `${surname}府`,
      cityId,
      districtId,
      metAt: label,
    };
  });

  // 仆役另姓，撞上东家的姓就再掷一次
  const servantPool = MANOR_SERVANTS.slice();
  const servants: Relation[] = [];
  const servantCount = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < servantCount && servantPool.length > 0; i++) {
    const [title, gender, ageLo, ageHi] = servantPool.splice(Math.floor(Math.random() * servantPool.length), 1)[0];
    const appearance = pick(APPEARANCES);
    const personality = pick(PERSONALITIES);
    const origin = pick(ORIGINS);
    let name = pick(namesFor(culture).surnames) + pickGivenName(gender, culture);
    for (let k = 0; k < 8 && (name.startsWith(surname) || usedNames.has(name)); k++) {
      name = pick(namesFor(culture).surnames) + pickGivenName(gender, culture);
    }
    usedNames.add(name);

    servants.push({
      id: makeId(`manor-${cityId}-${districtId}`),
      name,
      title,
      type: "friend",
      affinity: 20 + Math.floor(Math.random() * 20),
      affinityMax: 100,
      realm: pick(REALMS),
      note: `${label}的${title}。${appearance}，${personality}，${origin}。`,
      gender,
      age: ageLo + Math.floor(Math.random() * (ageHi - ageLo + 1)),
      origin,
      personality,
      appearance,
      affiliation: `${surname}府`,
      cityId,
      districtId,
      metAt: label,
    });
  }

  // 门房多半不姓东家的姓，撞了就换一个
  let gateName = pick(namesFor(culture).surnames) + pickGivenName("男", culture);
  for (let i = 0; i < 8 && (gateName.startsWith(surname) || usedNames.has(gateName)); i++) {
    gateName = pick(namesFor(culture).surnames) + pickGivenName("男", culture);
  }

  const gatekeeper: Relation = {
    id: makeId(`gate-${cityId}-${districtId}`),
    name: gateName,
    title: "门房",
    type: "friend",
    affinity: 20 + Math.floor(Math.random() * 20),
    affinityMax: 100,
    realm: pick(REALMS),
    note: `${label}的门房。${pick(APPEARANCES)}，${pick(PERSONALITIES)}，${pick(ORIGINS)}。`,
    gender: "男",
    age: 35 + Math.floor(Math.random() * 30),
    origin: pick(ORIGINS),
    personality: pick(PERSONALITIES),
    appearance: pick(APPEARANCES),
    affiliation: `${surname}府`,
    cityId,
    districtId,
    metAt: label,
  };

  return { surname, standing, gatekeeper, members: [...kin, ...servants] };
}
