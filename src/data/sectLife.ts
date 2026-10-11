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

import { getCityMarkers } from "@/data/map";
import { REALM_NAMES } from "@/data/mockData";
import { normalizeHour } from "@/lib/gameTime";
import type { BrokerTargets } from "@/data/broker";
import type { FacilityKindId, ItemGrade, JobCastRole, JobTarget, Relation, SectTask } from "@/data/types";

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
  /** 奔地方去、奔人去，还是奔本门某座建筑去 */
  toward: "place" | "person" | "building";
  /**
   * 奔建筑去时，限用哪几类建筑；不填则本门任意一座皆可。
   * 如「送药材」只指丹房一类，门中没有丹房便不派这桩事。
   */
  buildingKinds?: FacilityKindId[];
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

/** 从本门的建筑里挑一座当去处；限了类别的便只在那一类里挑，没有便退而取任意一座 */
function pickBuilding(sites: SectTaskBuilding[], kinds?: FacilityKindId[]): SectTaskBuilding | undefined {
  if (sites.length === 0) return undefined;
  const matched = kinds && kinds.length > 0 ? sites.filter((s) => kinds.includes(s.kindId)) : [];
  const pool = matched.length > 0 ? matched : sites;
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
): SectTask[] {
  const places = Array.isArray(targets?.places) ? targets.places : [];
  const people = Array.isArray(targets?.people) ? targets.people : [];
  const sites = Array.isArray(buildings) ? buildings : [];
  if (places.length === 0 && people.length === 0 && sites.length === 0) return [];

  const usable = SECT_TASK_TEMPLATES.filter((t) => {
    if (t.toward === "person") return people.length > 0;
    if (t.toward === "building") return sites.length > 0;
    return places.length > 0;
  });
  const pool = usable.slice();
  const want = Math.max(2, Math.min(5, Math.trunc(count) || 4));
  const tasks: SectTask[] = [];

  for (let i = 0; i < want && pool.length > 0; i++) {
    const [tpl] = pool.splice(pickIndex(pool.length), 1);

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