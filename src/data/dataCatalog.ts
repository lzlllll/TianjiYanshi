/**
 * 可改数据的分类目录 —— 全项目唯一的一份清单。
 *
 * 从前这份清单散在三处：提示词里的一段白名单、dataOps 里的集合白名单、
 * normalizeModifyPath 里逐条的认与不认。三处各写各的，日子一长必然对不上。
 * 如今归拢到这里：路由（flash 判权）、抽取（提示词）、落账（dataOps）都照这一份走。
 */

export type DataDomainId =
  | "player"
  | "resource"
  | "martial"
  | "social"
  | "sect"
  | "geo"
  | "asset"
  | "event"
  | "time";

export interface DataDomain {
  id: DataDomainId;
  label: string;
  /** 这一域管的是什么事，给路由与抽取模型看的白话说明 */
  hint: string;
  /** 可写路径模板。<...> 表示由模型填实，[...] 表示数组下标 */
  paths: string[];
  /** 域内写不得的路径 */
  locked?: string[];
}

export const DATA_DOMAINS: DataDomain[] = [
  {
    id: "player",
    label: "玩家本体",
    hint: "自身的名号、修为、气血灵力神念、寿元、资质、经脉、心性、随身状态与履历",
    paths: [
      "player.name",
      "player.title",
      "player.background",
      "player.description",
      "player.personality",
      "player.sectName",
      "player.position",
      "player.realmIndex",
      "player.realmStage",
      "player.cultivation",
      "player.hp",
      "player.hpMax",
      "player.mp",
      "player.mpMax",
      "player.spirit",
      "player.spiritMax",
      "player.lifespanCurrent",
      "player.lifespanMax",
      "player.body",
      "player.fortune",
      "player.karma",
      "player.stats.vitality",
      "player.stats.soul",
      "player.stats.wisdom",
      "player.stats.agility",
      "player.stats.heart",
      "player.stats.heartScores",
      "player.spiritRoots.<元素>",
      "player.meridians",
      "player.timeline",
      "player.buffs",
      "player.shields",
      "player.activeHeartTechnique",
    ],
    locked: ["player.gender"],
  },
  {
    id: "resource",
    label: "资源",
    hint: "四等灵石、随身物品、灵兽",
    paths: [
      "spiritStones.low",
      "spiritStones.mid",
      "spiritStones.high",
      "spiritStones.supreme",
      "inventory",
      "beast",
    ],
  },
  {
    id: "martial",
    label: "武学技艺",
    hint: "功法、百艺等级、符方丹方、技艺判定",
    paths: [
      "techniques",
      "skills",
      "talismanRecipes",
      "alchemyRecipes",
      "checks",
    ],
  },
  {
    id: "social",
    label: "人物与声望",
    hint: "认得的人（行踪、交情、信任、人设、旧事）与各道上的名声",
    paths: [
      "relations",
      "relations[<id>].place",
      "relations[<id>].districtId",
      "relations[<id>].age",
      "relations[<id>].relation",
      "relations[<id>].trust",
      "relations[<id>].type",
      "relations[<id>].persona",
      "relations[<id>].memory",
      "relations[<id>].title",
      "relations[<id>].realm",
      "relations[<id>].fixedUntilDay",
      "relations[<id>].traveling",
      "reputation.<轴>",
    ],
  },
  {
    id: "sect",
    label: "宗门",
    hint: "自家山门的建制、职司、任务、传承、库房、政策，以及江湖上各门各派的存续与交情、城村归属",
    paths: [
      "sect.name",
      "sect.level",
      "sect.reputation",
      "sect.elders",
      "sect.disciples",
      "sect.contribution",
      "sect.leader",
      "sect.territory",
      "sect.appearance",
      "sect.reputationDesc",
      "sect.surroundings",
      "sect.nature",
      "sect.climate",
      "sect.feature",
      "sect.start",
      "sect.modifiers",
      "sect.positions",
      "sect.tasks",
      "sect.heritage",
      "sect.shop",
      "sect.resources",
      "sectSites",
      "sectRelations",
      "occupations",
      "demolish.<建筑名>",
    ],
    locked: ["demolish.主殿", "demolish.传法大殿"],
  },
  {
    id: "geo",
    label: "地理",
    hint: "身在何处、哪座城哪个场所哪条街、野外村庄、行市涨跌",
    paths: [
      "currentPlaceId",
      "currentLocation",
      "mapSceneId",
      "district.<编号>",
      "village.<村名>",
      "districtNames",
      "markets",
      "priceAdjusts.<货名>",
    ],
  },
  {
    id: "asset",
    label: "产业资产",
    hint: "名下产业、田庄、宅邸、工坊、铺面以及出租收租",
    paths: [
      "estates",
      "manorPlots",
      "manors",
      "workshops",
      "playerShops",
      "shop.goods",
      "rent.<产业名>",
    ],
  },
  {
    id: "event",
    label: "事件与记录",
    hint: "机缘、奇遇、约定、快报、流言、瓦舍、当票、编年史",
    paths: [
      "quests",
      "adventures",
      "pacts",
      "news.items",
      "rumors",
      "waseShows",
      "pawns",
      "log",
    ],
  },
  {
    id: "time",
    label: "时间",
    hint: "年、月、日、时辰。叙事里凡有耗时，都要推进它",
    paths: [
      "currentTime.year",
      "currentTime.month",
      "currentTime.day",
      "currentTime.hour",
    ],
  },
];

/** 写死了、路由判到也不许改的路径 */
export const HARD_LOCKED_PATHS = new Set<string>(["player.gender"]);

/** 四条不属于权限、只属于自洽的硬约束，给提示词与日志共用同一套说法 */
export const HARD_CONSTRAINTS: string[] = [
  "player.gender 是开局定下的，任何叙事都改不得",
  "player.realmIndex 只升不降，境界不得倒退",
  "本门主殿与传法大殿拆不得",
  "currentPlaceId 须是舆图上真有的城，priceAdjusts.<货名> 须是货表里真有的货，player.spiritRoots.<元素> 须是合法五行元素",
];

export function isHardLockedPath(path: string): boolean {
  const p = String(path ?? "").trim();
  if (!p) return false;
  if (HARD_LOCKED_PATHS.has(p)) return true;
  // demolish 走名字判定：主殿与传法大殿一律不毁
  if (p.startsWith("demolish.")) {
    const name = p.slice("demolish.".length);
    return /主殿|传法大殿/.test(name);
  }
  return false;
}

/** 把路径的数组下标与末尾实参剥掉，留下可比对的根 */
function rootOf(path: string): string {
  let p = String(path ?? "").trim().replace(/^[-+*•\s]+/, "");
  const bracket = p.indexOf("[");
  if (bracket >= 0) p = p.slice(0, bracket);
  return p;
}

/** 路径落在哪一域。取最长前缀，认不出则 null */
export function matchDomain(path: string): DataDomainId | null {
  const root = rootOf(path);
  if (!root) return null;
  let best: { id: DataDomainId; len: number } | null = null;
  for (const domain of DATA_DOMAINS) {
    for (const template of domain.paths) {
      const head = rootOf(template.replace(/<[^>]*>/g, ""));
      if (!head) continue;
      const hit = root === head || root.startsWith(`${head}.`);
      if (!hit) continue;
      if (!best || head.length > best.len) best = { id: domain.id, len: head.length };
    }
  }
  return best?.id ?? null;
}

/** 纯分类表：不带任何当前值，供路由判权与抽取模型认路 */
export function buildCatalogText(): string {
  const seq = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const lines: string[] = ["【可改数据分类表】"];
  DATA_DOMAINS.forEach((domain, idx) => {
    lines.push(`${seq[idx] ?? idx + 1}、${domain.label}（${domain.id}）—— ${domain.hint}`);
    lines.push(`  可写：${domain.paths.join("、")}`);
    if (domain.locked?.length) lines.push(`  不可写：${domain.locked.join("、")}`);
  });
  lines.push("");
  lines.push("【不许越过的硬约束】");
  HARD_CONSTRAINTS.forEach((rule) => lines.push(`- ${rule}`));
  return lines.join("\n");
}

/** 本回合路由判定结果转成一段提示语，做引导而非禁令 */
export function buildWritableHint(writable?: string[]): string {
  const list = (writable ?? []).map((w) => String(w ?? "").trim()).filter(Boolean);
  if (list.length === 0) {
    return "【本回合路由判定】路由未圈定具体数据。凡正文里确已发生的事实，照分类表照样落账，不必因为不在圈定之内就缩手。";
  }
  const domains = new Set<DataDomainId>();
  for (const path of list) {
    const d = matchDomain(path);
    if (d) domains.add(d);
  }
  const domainLabels = DATA_DOMAINS.filter((d) => domains.has(d.id)).map((d) => d.label);
  return [
    `【本回合路由判定】这一段叙事被路由判定为涉及：${list.join("、")}`,
    domainLabels.length ? `所属分类：${domainLabels.join("、")}` : "",
    "路由的圈定是提示，不是禁令。正文里若还写了别的数据变动，同样照分类表落账。",
  ]
    .filter(Boolean)
    .join("\n");
}
