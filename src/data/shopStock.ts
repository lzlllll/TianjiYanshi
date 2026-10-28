/**
 * 有词条的铺货。
 *
 * 符箓、丹药、灵兽、法器、宝物、书籍、乐器这七类铺子不卖寻常什物，
 * 货是拿词条拼出来的：名号由各栏词条接成，说明由词条串成一句，
 * 界面上也把词条摊开给人看。另有小概率混进一件「神秘物品」：
 * 只报个破旧的样子货名目，看不出究竟是什么，买回去留待日后细究。
 */

import type { Good, InventoryItem, ShopKind } from "@/data/types";

interface StockSpec {
  /** 名号词条：每一栏取一条，按顺序接成名字 */
  nameParts: string[][];
  /** 说明词条：取一条缀进说明 */
  qualifiers: string[];
  /** 底价区间，单位下品灵石 */
  price: [number, number];
  /** 说明句式：{p0}{p1}… 依序填名号词条，{q} 填说明词条 */
  desc: string;
  /** 名号的缀尾，如符箓末尾那个「符」 */
  suffix?: string;
}

const STOCK_SPECS: Partial<Record<ShopKind, StockSpec>> = {
  // 符箓照符箓体系来：元素为引、功用作途、时效为限
  符箓铺: {
    nameParts: [
      ["金锋", "青木", "玄水", "赤火", "厚土", "罡风", "五雷", "玄冰", "冥暗"],
      ["破煞", "引灵", "守护", "封魂", "助运", "灭邪", "惑心", "愈伤", "遁形"],
    ],
    qualifiers: ["三息之内", "半个时辰", "一炷香", "一昼夜", "三日"],
    price: [12, 90],
    desc: "以{p0}为引，专司{p1}，{q}见效。",
    suffix: "符",
  },
  // 丹药讲的是药效与形制，怎么送服另算
  "丹药铺/医馆": {
    nameParts: [
      ["回血", "养元", "凝神", "固本", "辟毒", "生肌", "明目", "强筋"],
      ["丹", "丸", "散", "膏", "露"],
    ],
    qualifiers: ["温酒送下", "清水送服", "含化", "外敷", "晨起空腹服"],
    price: [8, 70],
    desc: "管{p0}的{p1}，{q}，一服即知。",
  },
  // 灵兽看品相与禀赋
  灵兽栏: {
    nameParts: [
      ["灵秀", "雄壮", "凶悍", "温驯", "机警", "憨拙", "矫健"],
      ["雪狐", "苍鹰", "青猿", "铁背熊", "赤练蛇", "夜枭", "白鹿", "玄龟", "花豹", "灵猫"],
    ],
    qualifiers: ["通人语", "善寻物", "夜能视物", "不畏寒暑", "识得草药", "能驮重物", "极恋主"],
    price: [40, 500],
    desc: "一头{p0}的{p1}，{q}。",
  },
  // 法器讲材质与器形，附带着什么另说
  炼器坊: {
    nameParts: [
      ["玄铁", "精钢", "寒铜", "赤铜", "陨铁", "青玉", "雷击木"],
      ["长剑", "短刀", "长枪", "软鞭", "护腕", "重甲", "圆盾", "短匕"],
    ],
    qualifiers: ["刻着雷纹", "淬过毒", "镶一枚残玉", "缠着鲛皮", "铸有云纹", "开了血槽"],
    price: [60, 900],
    desc: "{p0}锻的{p1}，{q}。",
  },
  // 宝物讲来历与名目
  宝物阁: {
    nameParts: [
      ["上古", "宗门遗物", "海外得来", "山中所得", "前朝", "不知来处"],
      ["残玉", "古镜", "铜铃", "玉印", "石珠", "木匣", "金锁", "旧鼎"],
    ],
    qualifiers: ["夜里自己会响", "见血则亮", "贴身则暖", "遇险先觉", "能照见人心", "入水不沉"],
    price: [100, 1800],
    desc: "一件{p0}的{p1}，{q}。",
  },
  // 书讲内容与卷帙
  书铺: {
    nameParts: [
      ["剑诀", "丹方", "符法", "阵法", "游记", "图鉴", "刀谱", "心法"],
      ["残卷", "全本", "手抄", "拓本", "孤本"],
    ],
    qualifiers: ["墨迹如新", "边角虫蛀", "有前人批注", "纸已发黄"],
    price: [10, 100],
    desc: "一册{p0}{p1}，{q}。",
  },
  // 乐器讲材质与形制
  乐器坊: {
    nameParts: [
      ["焦尾桐", "紫檀", "青玉", "黄铜", "湘竹", "陶土"],
      ["古琴", "长笛", "琵琶", "胡琴", "编钟", "洞箫", "羯鼓"],
    ],
    qualifiers: ["声清越", "声沉厚", "音色苍凉", "余音悠长", "能引百鸟"],
    price: [15, 160],
    desc: "{p0}制的{p1}，{q}。",
  },
};

/** 这七类铺子的货由词条拼出来 */
export function hasStockSpec(kind: ShopKind): boolean {
  return !!STOCK_SPECS[kind];
}

/** 铺货对应的行囊类别；不在表里的当杂物 */
const ITEM_TYPE: Partial<Record<ShopKind, InventoryItem["type"]>> = {
  符箓铺: "符箓",
  "丹药铺/医馆": "丹药",
  炼器坊: "法宝",
  宝物阁: "法宝",
  // 灵兽栏买下的是一头活的，单独归一类：收作随身时才认得出它
  灵兽栏: "灵兽",
};

/** 按价钱定品阶：贵的自然品阶高，几档之间留出大台阶 */
export function gradeForPrice(price: number): InventoryItem["grade"] {
  if (price >= 1800) return "仙品";
  if (price >= 500) return "天品";
  if (price >= 120) return "玄品";
  if (price >= 20) return "灵品";
  return "凡品";
}

/** 买下来的东西该进哪一格行囊 */
export function itemTypeFor(kind: ShopKind): InventoryItem["type"] {
  return ITEM_TYPE[kind] ?? "杂物";
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** 把词条填进句式 */
function fill(template: string, parts: string[], qualifier: string): string {
  return template
    .replace(/\{p(\d)\}/g, (_, i) => parts[Number(i)] ?? "")
    .replace(/\{q\}/g, qualifier);
}

const priceIn = ([lo, hi]: [number, number]) =>
  lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * 拼一件货：名号由各栏词条接成，说明由全部词条串成一句。
 * 词条一并留在货上，界面上摊开给人看。
 */
function craftOne(kind: ShopKind, spec: StockSpec): Good {
  const parts = spec.nameParts.map((slot) => pick(slot));
  const qualifier = pick(spec.qualifiers);
  return {
    name: parts.join("") + (spec.suffix ?? ""),
    base: priceIn(spec.price),
    stock: 1 + Math.floor(Math.random() * 8),
    entries: [...parts, qualifier],
    desc: fill(spec.desc, parts, qualifier),
  };
}

/** 开一批铺货：名号不重样 */
export function rollStock(kind: ShopKind, count: number): Good[] {
  const spec = STOCK_SPECS[kind];
  if (!spec) return [];

  const taken = new Set<string>();
  const goods: Good[] = [];
  for (let i = 0; i < count * 12 && goods.length < count; i++) {
    const good = craftOne(kind, spec);
    if (taken.has(good.name)) continue;
    taken.add(good.name);
    goods.push(good);
  }
  return goods;
}

/**
 * 柜底旧物的名目：不点破是什么，只按这行当常见的样子报个名。
 * 眼下谁也认不出，等日后有了鉴宝的门道再说。
 */
const MYSTERY_NAMES: Partial<Record<ShopKind, string[]>> = {
  符箓铺: ["泛黄的旧符纸", "残破的朱砂符", "虫蛀的旧符囊", "字迹漫漶的黄纸卷"],
  "丹药铺/医馆": ["无签的旧瓷瓶", "半旧的药囊", "封泥开裂的药匣", "字迹模糊的药罐"],
  灵兽栏: ["蒙着布的旧笼", "笼中不明小兽", "看不出种属的旧蛋", "半死不活的旧虫"],
  炼器坊: ["破旧的青铜宝剑", "锈迹斑斑的旧刀", "缺了口的古镜", "缠着旧布的长匣"],
  宝物阁: ["沾灰的旧铜器", "看不清纹路的旧玉", "无从辨识的古物", "落了尘的旧木匣"],
  书铺: ["虫蛀的缺页旧册", "无题名的旧卷", "字迹漫漶的手抄", "散了页的旧书"],
  乐器坊: ["断了弦的旧琴", "缺了角的旧笛", "蒙尘的陌生乐器", "裂了缝的旧鼓"],
  杂货铺: ["说不清的旧物件", "落灰的旧匣子", "来路不明的旧囊", "沉甸甸的旧布包"],
  旧货铺: [
    "缺了盖的旧铜炉",
    "看不出纹路的旧佩",
    "沉手的旧铁牌",
    "磨得发亮的旧骨环",
    "断了半截的旧镇纸",
    "裹着旧布的沉物",
    "生了绿锈的旧印",
    "半旧的木胎漆盒",
  ],
};

const MYSTERY_FALLBACK = ["说不清的旧物件", "落灰的旧匣子", "来路不明的旧囊"];

/** 旧物没行情可依，掌柜随口开的价从贱价到天价都可能 */
const MYSTERY_PRICE_SPREAD: [number, number] = [0.5, 5];

/** 旧货铺专做这一路：柜上的旧物一律贱价，底价就在几枚到二十几枚之间 */
const JUNK_ANCHOR: [number, number] = [5, 24];
const JUNK_PRICE_SPREAD: [number, number] = [0.6, 1.2];

/** 一件没看出门道的旧物：名目只报个样子，价钱由底价大幅随出来 */
export function craftMystery(kind: ShopKind): Good {
  const spec = STOCK_SPECS[kind];
  const isJunk = kind === "旧货铺";
  const anchor = isJunk ? priceIn(JUNK_ANCHOR) : spec ? priceIn(spec.price) : priceIn([10, 60]);
  const [lo, hi] = isJunk ? JUNK_PRICE_SPREAD : MYSTERY_PRICE_SPREAD;
  return {
    name: pick(MYSTERY_NAMES[kind] ?? MYSTERY_FALLBACK),
    base: Math.max(3, Math.round(anchor * (lo + Math.random() * (hi - lo)))),
    stock: 1,
    desc: "来路不明，掌柜也只说是一并收来的旧物。看不出名堂，买回去或能细究。",
    mystery: true,
  };
}

/** 一连摆几件没看出门道的旧物，名目不重样 */
export function rollMysteries(kind: ShopKind, count: number): Good[] {
  const goods: Good[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < count * 12 && goods.length < count; i++) {
    const good = craftMystery(kind);
    if (taken.has(good.name)) continue;
    taken.add(good.name);
    goods.push(good);
  }
  return goods;
}

/** 每四家铺子里约有一家，柜底压着一件没人认得出的旧物 */
export function maybeHideMystery(goods: Good[], kind: ShopKind): Good[] {
  if (goods.length === 0 || Math.random() >= 0.25) return goods;
  const at = Math.floor(Math.random() * goods.length);
  const next = goods.slice();
  next[at] = craftMystery(kind);
  return next;
}
