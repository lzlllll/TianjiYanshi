/**
 * 宗门日常：开讲、经阁、讲经堂与门派任务。
 *
 * 这里是「交互层」的三桩事，都落在宗门系统内，数值与文案一并写在这儿，
 * store 只按此结算，界面只按此显示：
 *   1. 主殿每日固定时辰开讲，掌门开讲不耗自身修为，弟子听讲的进益看掌门修为；
 *   2. 经阁可用贡献换功法，能学什么由身份等级定；讲经堂可主动讲经换贡献；
 *   3. 门派任务仿牙行生成目标的去处与要用的人，须实际前往、交差才算成。
 *
 * 任务去处只从本门附近真有的城池街区、以及你认下的人里挑，
 * 不凭空编一个走不到的地名——这一条与牙行同一套规矩。
 */

import { getCityMarkers, getDistricts, getMarker } from "@/data/map";
import { REALM_NAMES } from "@/data/mockData";
import { normalizeHour } from "@/lib/gameTime";
import type { BrokerTargets } from "@/data/broker";
import type { FacilityKindId, ItemGrade, JobCastRole, JobTarget, Relation, SectActivity, SectHall, SectTask } from "@/data/types";

// ---------------- 一、主殿开讲 ----------------

/** 宗门数据没写开讲时辰时，按巳时开讲 */
export const DEFAULT_LECTURE_HOUR = 5;

/** 连着这些日子不来听讲，开讲时便扣一笔贡献；半月之数 */
export const LECTURE_ABSENT_DAYS = 15;

/** 半月不至，每次开讲扣的贡献，数额不大，只是个提醒 */
export const LECTURE_ABSENT_PENALTY = 5;

/** 掌门当坛开讲，弟子听讲一次涨的底子；再乘掌门修为与宗门等级 */
const LECTURE_BASE_GAIN = 12;

interface LectureSect {
  lectureHour?: number;
  leader?: string;
  level?: number;
}

/** 这处宗门每日开讲的时辰，0-11 见 SHICHEN_NAMES */
export function lectureHour(sect: LectureSect | undefined): number {
  return normalizeHour(sect?.lectureHour, DEFAULT_LECTURE_HOUR);
}

/** 当坛开讲的掌门，修为算到几重境界；玩家自己就是掌门便按玩家的算 */
export function leaderRealmIndex(args: {
  sect: LectureSect | undefined;
  playerName?: string;
  playerPosition?: string;
  playerRealmIndex?: number;
  relations?: Relation[];
}): number {
  const { sect, playerName, playerPosition, playerRealmIndex, relations } = args;
  // 玩家自己坐掌门之位，讲的就是自家的修为
  const isLeader = !!playerPosition && /掌门/.test(playerPosition);
  const isLeaderByName = !!sect?.leader && !!playerName && sect.leader === playerName;
  if (isLeader || isLeaderByName) return Math.max(0, Number(playerRealmIndex) || 0);

  // 掌门是尘缘里认得的人，就照他的境界算；认不得则按宗门等级估一个
  const found = (Array.isArray(relations) ? relations : []).find((r) => r?.name && r.name === sect?.leader);
  if (found) {
    const idx = REALM_NAMES.indexOf(String(found.realm ?? ""));
    if (idx >= 0) return idx;
  }
  return Math.max(0, (Number(sect?.level) || 1) + 2);
}

/** 弟子听一场开讲涨多少修为：掌门境界越高、宗门越盛，涨得越多 */
export function lectureGain(leaderRealmIdx: number, sectLevel: number): number {
  return LECTURE_BASE_GAIN + Math.max(0, leaderRealmIdx) * 6 + Math.max(1, sectLevel) * 4;
}

// ---------------- 二、经阁换功法 / 讲经换贡献 ----------------

/** 各品阶传承要求的身份等级：凡品人人可参，仙品非掌门不可 */
const HERITAGE_REQUIREMENT: Record<ItemGrade, number> = {
  凡品: 1,
  灵品: 1,
  玄品: 2,
  天品: 3,
  仙品: 4,
};

/** 各品阶传承的兑换价，以贡献计 */
const HERITAGE_COST: Record<ItemGrade, number> = {
  凡品: 60,
  灵品: 160,
  玄品: 400,
  天品: 900,
  仙品: 1800,
};

/** 学这一门传承要求的身份等级 */
export function heritageRequirement(grade: ItemGrade): number {
  return HERITAGE_REQUIREMENT[grade] ?? 1;
}

/** 学这一门传承要花的贡献 */
export function heritageCost(grade: ItemGrade): number {
  return HERITAGE_COST[grade] ?? 60;
}

/** 眼下这位身份在第几级：没有在任职位便按最低一级算 */
export function positionLevel(positions: { isCurrent?: boolean; level?: number }[] | undefined): number {
  const current = (Array.isArray(positions) ? positions : []).find((p) => p?.isCurrent);
  return Math.max(1, Number(current?.level) || 1);
}

/**
 * 眼下这位是不是长老以上：够得着执掌门中营造的身份。
 * 名目里点明长老、掌门一类的直接算数；否则以职位树里「长老」那一级的职级为准，
 * 树里连长老都排不出，便退到最上一两级。
 */
export function isElderOrAbove(
  positions: { isCurrent?: boolean; name?: string; level?: number }[] | undefined,
): boolean {
  const list = Array.isArray(positions) ? positions : [];
  const current = list.find((p) => p?.isCurrent);
  if (!current) return false;
  if (/长老|掌门|宗主|门主|首席|大长老|副掌门|供奉|护法/.test(current.name || "")) return true;
  const maxLevel = list.reduce((m, p) => Math.max(m, Number(p.level) || 1), 1);
  const elder = list.find((p) => /长老|掌门|宗主|门主|首席/.test(p.name || ""));
  const bar = elder ? Number(elder.level) || 1 : Math.max(1, maxLevel - 1);
  return (Number(current.level) || 1) >= bar;
}

/** 在讲经堂讲一场经，换得的贡献：身份越高、宗门越盛，换得越多 */
export function preachReward(positionLv: number, sectLevel: number): number {
  return 6 + Math.max(1, positionLv) * 4 + Math.max(1, sectLevel) * 2;
}

// ---------------- 贡献与赏赐的兑换 ----------------

/** 上交灵石换贡献：每这些下品灵石折 1 点贡献 */
export const STONES_PER_CONTRIBUTION_IN = 10;
/** 以贡献兑换灵石：1 点贡献折这些下品灵石（低于上交价，来回一换是亏的） */
export const STONES_PER_CONTRIBUTION_OUT = 8;

/** 各品阶物品上交可折的贡献 */
export const CONTRIBUTION_BY_GRADE: Record<string, number> = {
  凡品: 5,
  灵品: 15,
  玄品: 40,
  天品: 100,
  仙品: 250,
};

/** 一样物品上交能折多少贡献 */
export function contributionForItem(grade: string | undefined): number {
  return CONTRIBUTION_BY_GRADE[grade ?? "凡品"] ?? CONTRIBUTION_BY_GRADE.凡品;
}

/**
 * 眼下这位够不够得上「内门弟子以上」：够得着以贡献兑换灵石的身份。
 * 先认名目，名目对不上再退回职级——职位树里内门那一级起。
 */
export function isInnerDiscipleOrAbove(
  position: string | undefined,
  positions: { isCurrent?: boolean; name?: string; level?: number }[] | undefined,
): boolean {
  const name = position || "";
  if (/内门|长老|掌门|宗主|门主|首席|大长老|副掌门|供奉|护法/.test(name)) return true;
  if (/外门|杂役|记名|散修/.test(name)) return false;
  return positionLevel(positions) >= 2;
}

// ---------------- 三、门派任务 ----------------

interface SectTaskTemplate {
  name: string;
  /** 事情的原委；{at} 填去处，{who} 填要找的人 */
  desc: string;
  /** 交差的条件 */
  condition: string;
  /** 限期几日 */
  days: number;
  /** 奔地方去、奔人去、奔本门某座建筑、奔舆图上一处奇遇，还是奔坊市里一间铺子去 */
  toward: "place" | "person" | "building" | "adventure" | "shop";
  /**
   * 奔建筑去时，限用哪几类建筑；不填则本门任意一座皆可。
   * 如「送药材」只指丹房一类，门中没有丹房便不派这桩事。
   */
  buildingKinds?: FacilityKindId[];
  /** 奔铺子去时那间铺子的名目；街上本没有，接取后会在坊市里临时摆出这一家 */
  shopName?: string;
  /**
   * 奔舆图上本没有的去处去时，就地现开一处：给个名目、类别与一句光景。
   * 舆图上一处奇遇都没有，或想就此另开一处新的，都照这个开。
   */
  wild?: { name: string; kind: string; summary: string; danger: number };
  /** 贡献的数额区间 */
  contribution: [number, number];
  /** 下品灵石的数额区间 */
  stone: [number, number];
  /** 办到目标地块上要打交道的人 */
  cast: JobCastRole[];
}

const SECT_TASK_TEMPLATES: SectTaskTemplate[] = [
  {
    name: "采办一批药材",
    desc: "丹房里的药材将尽，几位师弟还等着开炉。掌事托你往{at}的药行走一趟，把缺的几味收齐。",
    condition: "在{at}采齐药材，带回山门交丹房",
    days: 5,
    toward: "place",
    contribution: [30, 60],
    stone: [20, 60],
    cast: [
      {
        title: "药行的东家",
        persona: "在本地收了几十年的药材，认得好坏也认得好价。见是宗门来的人，先客客气气，验货时却一分不让。",
      },
    ],
  },
  {
    name: "巡查山门外围",
    desc: "近来山门外不太平，偶有生面孔在{at}一带逗留。长老吩咐去走一圈，看看有什么动静。",
    condition: "在{at}巡过一圈，把看到的回禀长老",
    days: 4,
    toward: "place",
    contribution: [25, 50],
    stone: [10, 40],
    cast: [
      {
        title: "被探问的本地人",
        persona: "在本地住惯了的人，见宗门弟子来问，先是有些防备，问得客气了便肯说几句闲话。",
      },
    ],
  },
  {
    name: "押送一批物资",
    desc: "宗门往{at}送一批灵石与丹药，路上怕有劫道的，执事托你随车走这一趟。",
    condition: "把物资护送到{at}，一件不少",
    days: 6,
    toward: "place",
    contribution: [40, 80],
    stone: [40, 110],
    cast: [
      {
        title: "接货的执事",
        gender: "男",
        persona: "在本地替宗门经手钱物的执事，账目记得极清。当面点数，多一件不要、少一件不依。",
      },
    ],
  },
  {
    name: "替宗门捎一封信",
    desc: "掌门与{who}有旧，一封手书不便托外人送，寻个稳妥的弟子走一趟。人眼下在{at}。",
    condition: "把信当面交到{who}手上，不拆不丢",
    days: 4,
    toward: "person",
    contribution: [30, 55],
    stone: [20, 50],
    cast: [
      {
        title: "接信的一方",
        persona: "与宗门有旧交的人，见信必亲启。待人客气却自有分寸，问几句来历才肯收下。",
      },
    ],
  },
  {
    name: "打探仇家的动向",
    desc: "前番结下的梁子还没了，听说那伙人近来在{at}一带露过面。长老要你悄悄去看个究竟。",
    condition: "弄清那伙人的落脚处，回山门细说",
    days: 6,
    toward: "place",
    contribution: [45, 85],
    stone: [30, 80],
    cast: [
      {
        title: "知情的当地人",
        persona: "在本地混得熟络的人，晓得些不该晓得的事。肯不肯说，全看你出不出得起价钱、给不给得了保证。",
      },
      {
        title: "仇家的眼线",
        side: "antagonist",
        persona: "替那伙人放风盯梢的闲汉，鬼祟而多疑。见有人打听便反过来盯着你，一句话不对就往回报。",
      },
    ],
  },
  {
    name: "除去一窝山匪",
    desc: "{at}外的一窝山匪连劫了两趟过路的商旅，官府力有不逮。门中商议着替这一方除去这桩祸患。",
    condition: "在{at}把那窝山匪打散，不留后患",
    days: 7,
    toward: "place",
    contribution: [60, 120],
    stone: [50, 130],
    cast: [
      {
        title: "山匪的头目",
        gender: "男",
        side: "antagonist",
        persona: "占山为王的匪首，悍勇而粗豪，手下有十几号人。见了硬茬先试探，试探不过才肯认栽。",
      },
    ],
  },
  {
    name: "寻回走失的同门",
    desc: "一位师弟下山办事，到了日子还没回，最后有人见他在{at}一带。掌事托你去把人找回来。",
    condition: "在{at}寻到那位同门，带他回山门",
    days: 8,
    toward: "person",
    contribution: [50, 95],
    stone: [30, 80],
    cast: [
      {
        title: "见过那位同门的店家",
        persona: "本地开着小铺子的店家，记性好、话也多。你问起一个生面孔，他能从衣着说到去向。",
      },
    ],
  },
  {
    name: "采买一批典籍",
    desc: "藏经阁里缺几卷稀见的书，坊间偶有流转。掌事托你往{at}的书坊去看看，价钱合宜便收下。",
    condition: "在{at}收齐那几卷书，带回藏经阁",
    days: 5,
    toward: "place",
    contribution: [35, 70],
    stone: [40, 100],
    cast: [
      {
        title: "书坊的掌柜",
        persona: "守着几架子旧书的掌柜，识货而不急着出手。见你识得书里的门道，价钱才好商量。",
      },
    ],
  },
  {
    name: "讨回欠缴的供奉",
    desc: "{who}前些年受了宗门的好处，说定的供奉却一直拖着。执事拉不下脸，托你上门去讨。人眼下在{at}。",
    condition: "把供奉讨回来，或说定一个还的日子",
    days: 7,
    toward: "person",
    contribution: [45, 90],
    stone: [20, 60],
    cast: [
      {
        title: "欠着供奉的一家之主",
        persona: "受过宗门恩惠却把供奉一拖再拖的人，见了本门弟子先诉苦、后讨价，最怕来人把话挑明。",
      },
    ],
  },
  {
    name: "为丹房寻一味药引",
    desc: "丹房要炼一炉要紧的丹，独独缺一味药引，寻常铺子没有。听说{at}那一带有门路。",
    condition: "在{at}寻到那味药引，带回丹房",
    days: 6,
    toward: "place",
    contribution: [55, 100],
    stone: [40, 100],
    cast: [
      {
        title: "藏货的行商",
        persona: "手上有门路、有存货的行商，什么东西都敢经手。见人先盘价，验过你的来历与诚意，才肯把货亮出来。",
      },
    ],
  },
  {
    name: "往丹房送一味药引",
    desc: "丹房要炼一炉要紧的药，独缺一味药引，掌事托你送到{at}，当面交到管事手上。",
    condition: "把药引送到{at}，交到管事手上",
    days: 4,
    toward: "building",
    buildingKinds: ["alchemy"],
    contribution: [30, 55],
    stone: [20, 50],
    cast: [
      {
        title: "丹房的管事",
        persona: "在本门丹房料理炉火药材的执事，性子仔细、算得极清。收药材先看年份成色，一味不对便要退回。",
      },
    ],
  },
  {
    name: "往经阁送一批纸墨",
    desc: "经阁里抄录经卷的纸墨将尽，采买回来的这一批托你送到{at}，交到管事的书吏手上。",
    condition: "把纸墨送到{at}，交到管事手上",
    days: 4,
    toward: "building",
    buildingKinds: ["scripture"],
    contribution: [28, 52],
    stone: [20, 50],
    cast: [
      {
        title: "经阁的管事",
        persona: "替本门掌管经卷书册的老执事，识书也识人。收东西先点数、再验成色，最恨以次充好。",
      },
    ],
  },
  {
    name: "往铸器炉送一批精铁",
    desc: "门中匠人接了一桩活计，正等着精铁开炉。掌事托你把这批料送到{at}，交到匠人手上。",
    condition: "把精铁送到{at}，交到匠人手上",
    days: 5,
    toward: "building",
    buildingKinds: ["forge"],
    contribution: [35, 65],
    stone: [25, 60],
    cast: [
      {
        title: "锻造的匠人",
        persona: "本门守着炉火的匠人，臂力过人、寡言少语。看铁只看火色与纹理，好料便点头，次料便一言不发地推回来。",
      },
    ],
  },
  {
    name: "往灵田送一批灵种",
    desc: "百艺堂采买了一批灵种，须赶在节气前种下。掌事托你送到{at}，交到管田的人手上。",
    condition: "把灵种送到{at}，交到管田的人手上",
    days: 5,
    toward: "building",
    buildingKinds: ["farm"],
    contribution: [25, 50],
    stone: [15, 45],
    cast: [
      {
        title: "管田的执事",
        persona: "在本门料理灵田的执事，一身泥气、手脚麻利。接种子先问节气、再问来路，最看重是否误了农时。",
      },
    ],
  },
  {
    name: "往{at}采办一批用度",
    desc: "门中近日开销大，库房里的常备用度见了底。掌事托你往{at}走一趟，照单子上的名目采买齐了。",
    condition: "在{at}采齐用度，带回山门交库房",
    days: 4,
    toward: "shop",
    shopName: "杂货铺",
    contribution: [25, 50],
    stone: [15, 45],
    cast: [
      {
        title: "铺面的掌柜",
        persona: "在坊市里开着一间杂货铺的掌柜，货物杂、记性更好。见宗门来人，先报个虚价，见你懂行才肯让到实处。",
      },
    ],
  },
  {
    name: "往{at}探个究竟",
    desc: "近来门中弟子多提{at}一带有些异样：去的默不作声，回来的也只说「莫再去了」。长老要你亲走一趟，看看到底是什么。",
    condition: "在{at}探明情形，回山门照实回禀",
    days: 6,
    toward: "adventure",
    wild: {
      name: "城西三十里的废祠",
      kind: "遗迹",
      summary: "一座荒废多年的祠堂，梁木半塌，近来夜里偶有灯火与人语，去过的都说回来便病了一场。",
      danger: 2,
    },
    contribution: [40, 80],
    stone: [25, 70],
    cast: [
      {
        title: "一道去的同门",
        persona: "常在门中走动的一位同门，胆子不大、眼睛却尖。路上话多，真遇着事便往你身后站。",
      },
    ],
  },
];

const pickIndex = (len: number) => Math.floor(Math.random() * len);

const amountIn = ([lo, hi]: [number, number]) => lo + Math.floor(Math.random() * (hi - lo + 1));

const difficultyOf = (contribution: number): SectTask["difficulty"] =>
  contribution <= 40 ? "易" : contribution <= 80 ? "中" : contribution <= 120 ? "难" : "险";

/** 把去处与要找的人填进字面里 */
function fill(text: string, at: string, who: string | undefined): string {
  return text.replace(/\{at\}/g, at).replace(/\{who\}/g, who ?? "那人");
}

/** 本门一座可当任务去处的建筑 */
export interface SectTaskBuilding {
  /** 建筑名，如「炼丹房」 */
  name: string;
  kindId: FacilityKindId;
  /** 哪一处山门 */
  sectId: string;
  /** 写给人看的去处，如「青云宗·炼丹房」 */
  label: string;
}

/** 舆图上一处可当任务去处的奇遇 */
export interface SectTaskAdventure {
  id: string;
  name: string;
  kind?: string;
  cityId?: string;
}

/**
 * 从本门的建筑里挑一座当去处。
 * 限了类别的便只在那一类里挑：门中没这一类的建筑，这桩事便派不下去——
 * 从前退而取任意一座，「往灵田送一批灵种」会被指到传法大殿，名目与去处两不相干。
 */
function pickBuilding(sites: SectTaskBuilding[], kinds?: FacilityKindId[]): SectTaskBuilding | undefined {
  if (sites.length === 0) return undefined;
  const pool = kinds && kinds.length > 0 ? sites.filter((s) => kinds.includes(s.kindId)) : sites;
  if (pool.length === 0) return undefined;
  return pool[pickIndex(pool.length)];
}

/**
 * 照常例现掷一批门派任务：名目不重样，去处与要用的人只从眼下真有的东西里挑。
 * 去处可以是本门附近真有的城池街区、你认下的人，也可以是自己山门里的某座建筑——
 * 落在建筑上的，人便在那一座里等着，进山门到那处才交得了差。
 * 去处为空的（本城还没画过街区、门中也没有建筑），也只当这桩事办不成，不编一个走不到的地方。
 */
export function rollSectTasks(
  targets: BrokerTargets | undefined,
  buildings: SectTaskBuilding[] = [],
  count = 4,
  adventures: SectTaskAdventure[] = [],
): SectTask[] {
  const places = Array.isArray(targets?.places) ? targets.places : [];
  const people = Array.isArray(targets?.people) ? targets.people : [];
  const sites = Array.isArray(buildings) ? buildings : [];
  const spots = (Array.isArray(adventures) ? adventures : []).filter((a) => a && a.id && a.name);
  if (places.length === 0 && people.length === 0 && sites.length === 0 && spots.length === 0) return [];

  // 坊市里的街区：采办一类的事落在铺面上；街上本没有那一家，接取后自会临时摆出来
  const taskCityId = targets?.cityId ?? "";
  const marketIds = new Set(
    taskCityId ? getDistricts(taskCityId).filter((d) => d.nature === "坊市").map((d) => d.id) : [],
  );
  const shopPlaces = places.filter((p) => marketIds.has(p.districtId));

  const usable = SECT_TASK_TEMPLATES.filter((t) => {
    if (t.toward === "person") return people.length > 0;
    if (t.toward === "building") return sites.length > 0;
    if (t.toward === "adventure") return spots.length > 0 || !!t.wild;
    if (t.toward === "shop") return shopPlaces.length > 0;
    return places.length > 0;
  });
  const pool = usable.slice();
  const want = Math.max(2, Math.min(5, Math.trunc(count) || 4));
  const tasks: SectTask[] = [];

  for (let i = 0; i < want && pool.length > 0; i++) {
    // 门中既然立着建筑，头一桩便派一桩送到门里某一处去：
    // 交付点与山门挂钩，要交差的人就在那一座里候着
    const idx =
      i === 0 && sites.length > 0
        ? Math.max(0, pool.findIndex((t) => t.toward === "building"))
        : pickIndex(pool.length);
    const [tpl] = pool.splice(idx, 1);

    // 奔本门建筑去的：拿一座建筑当去处，人在那一座里等着
    if (tpl.toward === "building") {
      const spot = pickBuilding(sites, tpl.buildingKinds);
      if (!spot) continue;
      const contribution = amountIn(tpl.contribution);
      const stone = amountIn(tpl.stone);
      const target: JobTarget = {
        cityId: targets?.cityId ?? "",
        label: spot.label,
        sectId: spot.sectId,
        building: spot.name,
      };
      tasks.push({
        id: `secttask-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
        title: tpl.name,
        difficulty: difficultyOf(contribution),
        contribution,
        spiritStone: stone,
        desc: fill(tpl.desc, spot.label, undefined),
        accepted: false,
        place: spot.label,
        condition: fill(tpl.condition, spot.label, undefined),
        days: tpl.days,
        target,
        cast: tpl.cast,
      });
      continue;
    }

    // 奔舆图上一处奇遇去的：到了那一带才算到了地头，星标也钉在那一处。
    // 现成奇遇与就地现开各有一半机会——门中也会听说一桩从没人探过的异样
    if (tpl.toward === "adventure") {
      const useExisting = spots.length > 0 && (!tpl.wild || Math.random() < 0.5);
      const spot = useExisting ? spots[pickIndex(spots.length)] : undefined;
      const wild = spot ? undefined : tpl.wild;
      if (!spot && !wild) continue;
      const contribution = amountIn(tpl.contribution);
      const stone = amountIn(tpl.stone);
      const cityName = getMarker(taskCityId)?.name ?? "";
      // 现开的那一处，去处写明城名与方位；奇遇本身只叫它自己的名目
      const label = spot
        ? `${spot.name}（${spot.kind || "去处"}）`
        : `${cityName}${wild!.name}`;
      const target: JobTarget = spot
        ? { cityId: spot.cityId ?? targets?.cityId ?? "", label, adventureId: spot.id }
        : { cityId: targets?.cityId ?? "", label };
      tasks.push({
        id: `secttask-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
        title: fill(tpl.name, label, undefined),
        difficulty: difficultyOf(contribution),
        contribution,
        spiritStone: stone,
        desc: fill(tpl.desc, label, undefined),
        accepted: false,
        place: label,
        condition: fill(tpl.condition, label, undefined),
        days: tpl.days,
        target,
        ...(wild ? { spawnAdventure: { ...wild } } : {}),
        cast: tpl.cast,
      });
      continue;
    }

    // 奔坊市里一间铺子去的：这间铺子街面上本没有，接取后在集市里临时摆出来
    if (tpl.toward === "shop") {
      const place = shopPlaces[pickIndex(shopPlaces.length)];
      if (!place || place.districtId === undefined) continue;
      const shopName = tpl.shopName || "杂货铺";
      const contribution = amountIn(tpl.contribution);
      const stone = amountIn(tpl.stone);
      const label = `${place.label}·${shopName}`;
      const target: JobTarget = {
        cityId: targets!.cityId,
        districtId: place.districtId,
        label,
        shop: shopName,
      };
      tasks.push({
        id: `secttask-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
        title: fill(tpl.name, label, undefined),
        difficulty: difficultyOf(contribution),
        contribution,
        spiritStone: stone,
        desc: fill(tpl.desc, label, undefined),
        accepted: false,
        place: label,
        condition: fill(tpl.condition, label, undefined),
        days: tpl.days,
        target,
        cast: tpl.cast,
      });
      continue;
    }

    const person = tpl.toward === "person" ? people[pickIndex(people.length)] : undefined;
    const place = person
      ? places.length > 0
        ? places[pickIndex(places.length)]
        : { districtId: person.districtId, label: person.label }
      : places[pickIndex(places.length)];
    if (!place || place.districtId === undefined) continue;

    const contribution = amountIn(tpl.contribution);
    const stone = amountIn(tpl.stone);
    const target: JobTarget = {
      cityId: targets!.cityId,
      districtId: place.districtId,
      label: place.label,
      person: person?.name,
    };

    tasks.push({
      id: `secttask-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
      title: tpl.name,
      difficulty: difficultyOf(contribution),
      contribution,
      spiritStone: stone,
      desc: fill(tpl.desc, place.label, person?.name),
      accepted: false,
      place: place.label,
      condition: fill(tpl.condition, place.label, person?.name),
      days: tpl.days,
      target,
      cast: tpl.cast,
    });
  }
  return tasks;
}

/** 离这座山门最近的一座城；只说得出坐标便按远近挑，说不出来便取头一座 */
export function nearestCityIdFor(x?: number, y?: number): string | undefined {
  const cities = getCityMarkers();
  if (cities.length === 0) return undefined;
  if (typeof x !== "number" || typeof y !== "number") return cities[0].id;
  let best = cities[0];
  let bestDist = Infinity;
  for (const city of cities) {
    const dist = (city.x - x) ** 2 + (city.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  return best.id;
}

// ---------------- 四、各堂编制 ----------------

/** 这一堂平日做的是什么；写在堂口卡上，也当作 NPC 的差事 */
const HALL_DUTY: Record<FacilityKindId, string> = {
  hall: "总领庶务，收发掌门号令",
  scripture: "整理经卷，督促弟子课业",
  martial: "领操练，排比试的场次",
  alchemy: "看炉火，清点药材",
  forge: "守着炉砧，修补门中兵刃",
  spirit: "巡灵脉，引灵入渠",
  farm: "催农时，收灵谷蔬菜",
  beast: "喂栏中禽兽，调驯坐骑",
  array: "检阵眼，补符钉",
  housing: "管宿处与斋堂，迎送来客",
};

/**
 * 本门眼下该编出哪几堂。
 *
 * 门中立着哪一类的建筑，便编哪一堂；堂主从门中认得的人里挑，
 * 挑不出来便空着——空着的堂口，它辖下的建筑产出照折，这是实打实的一笔。
 */
export function rollSectHalls(args: {
  kinds: FacilityKindId[];
  roster: { kindId: FacilityKindId; name: string; desc: string }[];
  disciples: number;
  elders?: number;
  level?: number;
  /** 门中可当堂主的人，按名与境界给 */
  peers?: { name: string; realm?: string }[];
}): SectHall[] {
  const { kinds, roster, peers } = args;
  const have = new Set(kinds);
  const list = roster.filter((h) => have.has(h.kindId));
  if (list.length === 0) return [];

  const disciples = Math.max(0, Number(args.disciples) || 0);
  const elders = Math.max(0, Number(args.elders) || 0);
  const level = Math.max(1, Number(args.level) || 1);
  // 弟子按堂均分，余下的落在头一堂上；长老各堂分一位坐镇
  const base = Math.floor(disciples / list.length);
  const rest = disciples - base * list.length;
  const elderShare = Math.floor(elders / list.length);
  const maxMembers = Math.max(4, 8 + level * 4);
  const pool = Array.isArray(peers) ? peers.filter((p) => p?.name) : [];

  return list.map((h, i) => {
    const master = pool[i];
    return {
      id: `hall-${h.kindId}`,
      name: h.name,
      master: master?.name ?? "空缺",
      masterRealm: master?.realm || (master ? "修为不明" : "—"),
      currentTask: HALL_DUTY[h.kindId] ?? "料理堂中杂事",
      memberCount: Math.min(maxMembers, base + elderShare + (i < rest ? 1 : 0) + (master ? 1 : 0)),
      maxMembers,
      description: h.desc,
      kindIds: [h.kindId],
    };
  });
}

// ---------------- 五、宗门活动 ----------------

/** 一场活动要筹备几日，筹备期内可以参与 */
export const ACTIVITY_DAYS = 3;

/** 发起一场活动从宝库支的灵石；不同名目花销不同 */
export const ACTIVITY_COST: Record<SectActivity["type"], number> = {
  大比: 300,
  试炼: 220,
  庆典: 400,
  祭祀: 180,
  远征: 600,
};

/** 各活动的名目、彩头与一句说明 */
export const ACTIVITY_SPECS: Record<
  SectActivity["type"],
  { name: string; target: string; desc: string; reward: string }
> = {
  大比: {
    name: "门中大比",
    target: "门中弟子较技，胜者记功",
    desc: "设擂台于演武场，门中弟子两两相较，决出名次。",
    reward: "贡献与修为",
  },
  试炼: {
    name: "后山试炼",
    target: "入后山历练，活着出来的算过",
    desc: "开后山禁地，弟子入内历练，各凭本事。",
    reward: "修为与悟性",
  },
  庆典: {
    name: "开山庆典",
    target: "宴请四方同道，广结善缘",
    desc: "大开山门设宴，遍请左近同道与士绅。",
    reward: "声望与贡献",
  },
  祭祀: {
    name: "山门祭祀",
    target: "祭山川先祖，安定门中人心",
    desc: "设案于阵前，祭山川与历代先人。",
    reward: "声望与心安",
  },
  远征: {
    name: "外出远征",
    target: "领队出山，扫荡左近祸患",
    desc: "点齐门人出山，清剿左近的山匪与水匪。",
    reward: "灵石与贡献",
  },
};

/** 一场活动在今日是否还能参与 */
export function activityOpen(act: SectActivity | undefined, today: number): boolean {
  if (!act || act.status !== "进行中") return false;
  if (typeof act.endDay === "number" && today > act.endDay) return false;
  if (act.lastJoinDay === today) return false;
  return true;
}

/** 参与一场活动所得的彩头：照身份与宗门品级折算 */
export function activityPayout(
  type: SectActivity["type"],
  args: { positionLv: number; sectLevel: number },
): { contribution: number; cultivation: number; reputation: number; stones: number } {
  const lv = Math.max(1, Number(args.positionLv) || 1);
  const sectLv = Math.max(1, Number(args.sectLevel) || 1);
  switch (type) {
    case "大比":
      return { contribution: 10 + lv * 6 + sectLv * 2, cultivation: 6 + lv * 3, reputation: 1, stones: 0 };
    case "试炼":
      return { contribution: 6 + lv * 4 + sectLv * 2, cultivation: 12 + lv * 5, reputation: 0, stones: 0 };
    case "庆典":
      return { contribution: 8 + lv * 4, cultivation: 0, reputation: 4 + sectLv * 2, stones: 0 };
    case "祭祀":
      return { contribution: 5 + lv * 3, cultivation: 0, reputation: 6 + sectLv * 2, stones: 0 };
    case "远征":
      return { contribution: 12 + lv * 8 + sectLv * 3, cultivation: 4 + lv * 2, reputation: 1, stones: 40 + sectLv * 30 };
    default:
      return { contribution: 5, cultivation: 0, reputation: 0, stones: 0 };
  }
}