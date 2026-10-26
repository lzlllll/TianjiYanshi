/**
 * 牙行。
 *
 * 牙行替人递话、牵线、揽差事：谁家要押一趟货、寻一味药、打听一桩事，
 * 都先到这儿挂上一笔。柜上常年挂着几桩，谁都能接。
 *
 * 去处不凭空编：只从本城城图上真有的街区、以及你确实认下的人里挑，
 * 接下之后那个街区便在城图上星标出来，去那儿才寻得着。
 * 赏钱由牙行先押在柜上，办成了回来领；误了期的罚也照柜上写好的算。
 */

import { getCityMarkers, getDistricts, getMarker } from "@/data/map";
import { normalizeAdventure, pickOrNudgeSpotNear } from "@/data/adventures";
import { composeShopkeeper, relationWhereabout, rollQuestNpc } from "@/data/npcGen";
import { questKindNeedsPlace } from "@/data/quests";
import type {
  Adventure,
  BrokerJob,
  JobCastRole,
  JobTarget,
  Quest,
  QuestAnchor,
  QuestAnchorPerson,
  QuestPenaltyKind,
  QuestRewardKind,
  Relation,
  SectSite,
  ShopKind,
  Village,
} from "@/data/types";

/** 柜上至少挂着几桩 */
export const BROKER_JOB_MIN = 3;

/** 至多挂几桩 */
export const BROKER_JOB_MAX = 5;

/** 一桩差事的常例：名目、去处与赏罚都写在这儿，数额现掷 */
interface JobTemplate {
  name: string;
  /** 事情的来龙去脉；{at} 处填去处，{who} 处填要找的人 */
  desc: string;
  /** 交差条件，同样认 {at} 与 {who} */
  condition: string;
  /** 限期几日 */
  days: number;
  /** 这桩事是奔着地方去的、奔着人去的，还是奔城外一处本地预置的野地去的 */
  toward: "place" | "person" | "wild";
  rewardKind: QuestRewardKind;
  /** 灵石、修为这类赏的数额区间；物品、人情这类没有数额 */
  rewardRange?: [number, number];
  /** 赏的书面写法，{n} 处填数额 */
  rewardText: string;
  penaltyKind: QuestPenaltyKind;
  penaltyRange: [number, number];
  /** 罚的书面写法，{n} 处填数额 */
  penaltyText: string;
}

/**
 * 柜上偶尔派到城外去的几处常例。
 * 这几处是本地预置的：名目、类别与光景都写死在这儿，接取时才在舆图上开出来，
 * 不劳叙事另编一处走不到的地方。
 */
const BROKER_WILD_SPOTS: { name: string; kind: string; summary: string; danger: number }[] = [
  { name: "城西的破庙", kind: "遗迹", summary: "香火断了多年的小庙，梁上还挂着半幅褪色的旧幡。", danger: 1 },
  { name: "山道上的废驿", kind: "遗迹", summary: "官道改线后荒下的驿站，马厩塌了半边，檐下积着落叶。", danger: 2 },
  { name: "河滩旧渡口", kind: "去处", summary: "渡船早没了，只剩几根木桩立在浅水里，系船的石头还在。", danger: 1 },
  { name: "乱葬岗边的草棚", kind: "凶险", summary: "守夜人搭的草棚，如今只剩骨架，风过时呜呜作响。", danger: 3 },
];

const TEMPLATES: JobTemplate[] = [
  {
    name: "押一趟货",
    desc: "有商家要把一批货送到{at}，路上不太平，须得寻个镇得住场子的人跟着走一趟。货送到，人回来，这事就算完。",
    condition: "一路护送到{at}，货物不缺不损",
    days: 5,
    toward: "place",
    rewardKind: "灵石",
    rewardRange: [80, 220],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "灵石",
    penaltyRange: [40, 110],
    penaltyText: "误了期，赔 {n} 下品灵石",
  },
  {
    name: "寻一味药材",
    desc: "城里有位老人病着，方子上差一味药，几家药铺都断着货，听说{at}那一带有山货行。",
    condition: "在{at}寻到那味药，带回来交到人手上",
    days: 6,
    toward: "place",
    rewardKind: "灵石",
    rewardRange: [60, 150],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "灵石",
    penaltyRange: [20, 60],
    penaltyText: "误了期，赔 {n} 下品灵石",
  },
  {
    name: "替人看守宅院",
    desc: "{at}有户人家要出远门，宅子空着不放心，托人寻个稳妥的看上几日。",
    condition: "在{at}守满日子，宅中物什一件不少",
    days: 7,
    toward: "place",
    rewardKind: "灵石",
    rewardRange: [50, 130],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "灵石",
    penaltyRange: [30, 80],
    penaltyText: "宅中出了岔子，赔 {n} 下品灵石",
  },
  {
    name: "引一支商队入城",
    desc: "一支远来的商队认不得路，到了城外，须得有人从{at}那一头把他们领进城，再寻个落脚处。",
    condition: "把商队从{at}带进城，安顿妥当",
    days: 2,
    toward: "place",
    rewardKind: "灵石",
    rewardRange: [30, 80],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "平民名声",
    penaltyRange: [3, 10],
    penaltyText: "把人晾在城外，街坊要议论你",
  },
  {
    name: "替镖行走一趟暗镖",
    desc: "镖行有趟不便声张的买卖要送到{at}去，须得生面孔护送，路上不与人多话。",
    condition: "把东西送到{at}，路上不与人多话",
    days: 6,
    toward: "place",
    rewardKind: "修为",
    rewardRange: [15, 45],
    rewardText: "得一场历练",
    penaltyKind: "业力",
    penaltyRange: [5, 15],
    penaltyText: "东西失手，添 {n} 分业力",
  },
  {
    name: "打听一桩传闻的虚实",
    desc: "近来{at}那一带传着一桩怪事，真假不明。有人托牙行寻个机灵的人去探个究竟，别打草惊蛇。",
    condition: "弄清{at}那桩传闻是真是假，回来细说",
    days: 4,
    toward: "place",
    rewardKind: "物品",
    rewardText: "一件趁手的物什",
    penaltyKind: "平民名声",
    penaltyRange: [3, 10],
    penaltyText: "探得糊涂又张扬，街坊要议论你",
  },
  {
    name: "捎一封急信",
    desc: "有人在外头有桩急事，书信寄不得，须得托个脚程快、口风又紧的人把信当面递到{who}手上。",
    condition: "把信交到{who}手上，不拆不丢；他眼下在{at}",
    days: 3,
    toward: "person",
    rewardKind: "灵石",
    rewardRange: [40, 110],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "平民名声",
    penaltyRange: [5, 15],
    penaltyText: "误了人家的急事，街坊要议论你",
  },
  {
    name: "寻一个人的下落",
    desc: "有户人家托牙行打听一个人的下落，只记得些模糊的形貌，说近日在{at}一带见过。",
    condition: "打听到{who}的下落，回来交代清楚",
    days: 8,
    toward: "person",
    rewardKind: "灵石",
    rewardRange: [70, 180],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "平民名声",
    penaltyRange: [5, 15],
    penaltyText: "空口应承又办不成，街坊要议论你",
  },
  {
    name: "替人讨一笔旧账",
    desc: "{who}欠着一笔旧账不肯还，债主拉不下脸，托牙行寻个能说上话的人上门去讨。他眼下在{at}。",
    condition: "把这笔账讨回来，或是说定一个还账的日子",
    days: 7,
    toward: "person",
    rewardKind: "灵石",
    rewardRange: [90, 240],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "灵石",
    penaltyRange: [50, 130],
    penaltyText: "账没讨着，倒赔 {n} 下品灵石",
  },
  {
    name: "替善堂送一批口粮",
    desc: "城里的善堂要往{at}送一批口粮，几个老人都搬不动，托牙行寻个肯搭把手的人一路照看。",
    condition: "把口粮送到{at}，交到等着的那些人手上",
    days: 4,
    toward: "place",
    rewardKind: "正道名声",
    rewardRange: [5, 12],
    rewardText: "行善的事传出去，正道上也念你的好",
    penaltyKind: "平民名声",
    penaltyRange: [3, 8],
    penaltyText: "口粮没送到，街坊要说你虚应故事",
  },
  {
    name: "替人说合一场纠纷",
    desc: "两条街的人为一道地界闹了半年，谁也不肯先让，托牙行寻个两边都说得上话的人，请到{at}去说合。",
    condition: "把两边请到{at}，当面把这道地界说定",
    days: 5,
    toward: "place",
    rewardKind: "平民名声",
    rewardRange: [5, 12],
    rewardText: "一场纠纷平了，街坊都念你的好",
    penaltyKind: "平民名声",
    penaltyRange: [3, 8],
    penaltyText: "说不成，两头都怨你",
  },
  {
    name: "替衙门递一份文书",
    desc: "衙门里有份文书要递到{at}，公差都支使出去了，托牙行寻个脚程稳妥、口风紧的人跑这一趟。",
    condition: "把文书当面递到{at}，不拆不误",
    days: 3,
    toward: "place",
    rewardKind: "官府名声",
    rewardRange: [5, 12],
    rewardText: "官面上记你一功",
    penaltyKind: "官府名声",
    penaltyRange: [3, 8],
    penaltyText: "误了公文，官面上要记你一笔",
  },
  {
    name: "把纠缠的人吓走",
    desc: "有户人家的门口被人纠缠了半月，报官又嫌张扬，托牙行寻个面恶的人去{at}站一站，把人吓退便罢，出手别重。",
    condition: "到{at}把那伙人唬走，不留话柄",
    days: 3,
    toward: "place",
    rewardKind: "魔道名声",
    rewardRange: [5, 12],
    rewardText: "这一手传出去，江湖上多传你几分狠名",
    penaltyKind: "官府名声",
    penaltyRange: [3, 8],
    penaltyText: "动重了手，衙门里记你一笔",
  },
  {
    name: "替人到城外旧庙上炷香",
    desc: "有户人家许过一桩愿，如今不便出城，托牙行寻个人往{at}替他们上一炷香，替还了愿便算完。",
    condition: "到{at}上过香，替许愿的人还了愿",
    days: 3,
    toward: "wild",
    rewardKind: "灵石",
    rewardRange: [30, 70],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "平民名声",
    penaltyRange: [3, 8],
    penaltyText: "愿没还上，人家心里要嘀咕",
  },
  {
    name: "去城外取一件寄存的物什",
    desc: "有人早年在{at}寄存了一样东西，如今去取。那地方荒了多年，托牙行寻个胆大心细的人走一趟。",
    condition: "到{at}把寄存的物什取回来",
    days: 5,
    toward: "wild",
    rewardKind: "灵石",
    rewardRange: [60, 140],
    rewardText: "谢银 {n} 下品灵石",
    penaltyKind: "灵石",
    penaltyRange: [30, 80],
    penaltyText: "东西没取着，倒赔 {n} 下品灵石",
  },
];

/**
 * 各桩差事办到目标地块上要用到的人。
 * 走镖、吓人这类事本没有现成的人，接取时照这份说明现掷一个钉在原地；
 * 找人、送信、讨债这类奔着已在尘缘里的人去，此处不写，接取时改钉那个人。
 */
const JOB_CAST: Record<string, JobCastRole[]> = {
  押一趟货: [
    {
      title: "收货的商家",
      gender: "男",
      persona: "在本地有铺面、有库房的商家，雇了这趟货等着入库。为人重利而守信，货一到便验看斤两成色，脾气不算好，却也不会无故刁难肯办事的人。",
    },
  ],
  寻一味药材: [
    {
      title: "山货行的东家",
      persona: "守着山货行，专收各乡送来的药材土产。认得百草，也认得好坏的价钱，见人先掂量对方识不识货，同行里是出了名的精明。",
    },
  ],
  替人看守宅院: [
    {
      title: "托付看宅的邻家",
      persona: "与邻家相熟多年，受托照看空宅，自己脱不开身才托到牙行上来。嘴碎而热心，把宅里一桌一椅都看得很重，见人先交代得清清楚楚。",
    },
  ],
  引一支商队入城: [
    {
      title: "商队的领队",
      gender: "男",
      persona: "走南闯北的商队头领，风尘满面、行事爽快。不识本城路径，认路认人，领得进城门便千恩万谢，办不成则当场变脸。",
    },
  ],
  替镖行走一趟暗镖: [
    {
      title: "接暗镖的接头人",
      persona: "在本地有正经门面作幌子，暗里替人转手不便声张的物件。话少、眼利，交接只在无人处，验过暗记才认人。",
    },
  ],
  打听一桩传闻的虚实: [
    {
      title: "知情的老街坊",
      persona: "在本处住了几十年的老街坊，闲话里藏着真章。半信半疑地打量来探问的人，肯不肯说全看对方有没有分寸。",
    },
  ],
  替善堂送一批口粮: [
    {
      title: "善堂的管事",
      persona: "替善堂操持济贫的事，老成厚道。清点口粮最是仔细，多一袋不要、少一袋不放行，嘴上念叨着那些等着吃饭的人。",
    },
  ],
  替人说合一场纠纷: [
    {
      title: "相争的一家当家人",
      persona: "为一道地界与人争了半年，寸步不让，却也不是不听劝。见来了说合的人，先倒一肚子委屈，成与不成就看对方能不能给个台阶。",
    },
  ],
  替衙门递一份文书: [
    {
      title: "衙门接文的书吏",
      gender: "男",
      persona: "衙门里管收发的书吏，规矩多、架子足。文书要看封缄、看火漆、看限期，半点差错都要当面挑出来，是官面上最不好相与的一档。",
    },
  ],
  把纠缠的人吓走: [
    {
      title: "被纠缠的那户人家",
      persona: "被一伙泼皮堵门纠缠了半月的门户，又怕又恨却报不得官。见人肯出头，又感激又忐忑，只求把人撵走、别闹出人命。",
    },
    {
      title: "上门纠缠的泼皮",
      gender: "男",
      side: "antagonist",
      persona: "赖在这户门前讨便宜的地痞，欺软怕硬、色厉内荏。见着单薄的便撒横，遇着硬茬子立马皮笑肉不笑地找台阶。",
    },
  ],
  替人到城外旧庙上炷香: [
    {
      title: "守着香火的老人家",
      persona: "住在近处、隔三差五来照看这处旧庙的老人家，见有人来还愿，先是意外，随后絮絮地说起这庙当年的光景。",
    },
  ],
  去城外取一件寄存的物什: [
    {
      title: "寄存物什的主家",
      persona: "把东西寄存在这处荒地上的主家，多年不曾来取。见有人替他跑这一趟，既感激又有些不愿多说的隐情。",
    },
  ],
};

/** 柜上现挂的差事可用的去处与要找的人，都由眼下实际有的东西现攒 */
export interface BrokerTargets {
  cityId: string;
  /** 本城城图上真有的街区 */
  places: { districtId: number; label: string }[];
  /** 你认下、且眼下就在这座城里的人 */
  people: { name: string; districtId?: number; label: string }[];
}

const pickIndex = (len: number) => Math.floor(Math.random() * len);

const amountIn = ([lo, hi]: [number, number]) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** 把数额与去处填进字面里 */
function fill(text: string, at: string, who: string | undefined, n?: number): string {
  let out = text.replace(/\{at\}/g, at).replace(/\{who\}/g, who ?? "那个人");
  if (n !== undefined) out = out.replace(/\{n\}/g, String(n));
  return out;
}

/**
 * 本城能拿来当差事去处的那些地方与人。
 * 街区取自城图，人取自尘缘——叙事没写过的地名、没见过的人，不会凭空冒出来。
 */
export function brokerTargetsFor(
  cityId: string,
  districtNames: Record<string, string> | undefined,
  known: Relation[] | undefined,
): BrokerTargets {
  const cityName = getMarker(cityId)?.name ?? "此城";
  const places = getDistricts(cityId).map((d) => ({
    districtId: d.id,
    label: `${cityName}·${districtNames?.[`${cityId}:${d.id}`] || d.nature}`,
  }));
  const people = (Array.isArray(known) ? known : [])
    .filter((r) => r && r.cityId === cityId && r.type !== "enemy")
    .map((r) => ({
      name: r.name,
      districtId: typeof r.districtId === "number" ? r.districtId : undefined,
      label: relationWhereabout(r, districtNames),
    }));
  return { cityId, places, people };
}

/**
 * 柜上现挂的一批差事：名目不重样，赏罚的数额各掷各的。
 * 隔日再开市就换一拨，故不必记规模，每回按常例重掷即可。
 */
export function rollBrokerJobs(targets: BrokerTargets, count?: number): BrokerJob[] {
  const places = Array.isArray(targets?.places) ? targets.places : [];
  const people = Array.isArray(targets?.people) ? targets.people : [];
  // 没有真去处又没有人可找，就挂不出差事——总好过编一个走不到的地名
  if (places.length === 0 && people.length === 0) return [];

  const want = Math.max(
    BROKER_JOB_MIN,
    Math.min(BROKER_JOB_MAX, Math.trunc(Number(count)) || BROKER_JOB_MIN + Math.floor(Math.random() * 3)),
  );

  const usable = TEMPLATES.filter((t) => (t.toward === "person" ? people.length > 0 : places.length > 0));
  const pool = usable.slice();
  const jobs: BrokerJob[] = [];

  for (let i = 0; i < want && pool.length > 0; i++) {
    const [tpl] = pool.splice(pickIndex(pool.length), 1);

    // 奔城外一处本地预置的野地去的：这里只记名目，接取时才在舆图上开出来
    if (tpl.toward === "wild") {
      const spot = BROKER_WILD_SPOTS[pickIndex(BROKER_WILD_SPOTS.length)];
      const cityName = getMarker(targets.cityId)?.name ?? "此城";
      const label = `${cityName}${spot.name}`;
      const rewardAmount = tpl.rewardRange ? amountIn(tpl.rewardRange) : undefined;
      const penaltyAmount = amountIn(tpl.penaltyRange);
      jobs.push({
        id: `job-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
        name: tpl.name,
        desc: fill(tpl.desc, label, undefined),
        place: label,
        target: { cityId: targets.cityId, label },
        spawnAdventure: { ...spot },
        cast: JOB_CAST[tpl.name],
        condition: fill(tpl.condition, label, undefined),
        days: tpl.days,
        reward: fill(tpl.rewardText, label, undefined, rewardAmount),
        rewardKind: tpl.rewardKind,
        rewardAmount,
        penalty: fill(tpl.penaltyText, label, undefined, penaltyAmount),
        penaltyKind: tpl.penaltyKind,
        penaltyAmount,
      });
      continue;
    }

    const person = tpl.toward === "person" ? people[pickIndex(people.length)] : undefined;
    // 奔人去的差事也落在平民住宅上：接取时把那个人钉到这儿，玩家去这儿才寻得着
    const place = person
      ? places.length > 0
        ? places[pickIndex(places.length)]
        : { districtId: person.districtId, label: person.label }
      : places[pickIndex(places.length)];

    const rewardAmount = tpl.rewardRange ? amountIn(tpl.rewardRange) : undefined;
    const penaltyAmount = amountIn(tpl.penaltyRange);
    const target: JobTarget = {
      cityId: targets.cityId,
      districtId: place.districtId,
      label: place.label,
      person: person?.name,
    };

    jobs.push({
      id: `job-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
      name: tpl.name,
      desc: fill(tpl.desc, place.label, person?.name),
      place: place.label,
      target,
      cast: JOB_CAST[tpl.name],
      condition: fill(tpl.condition, place.label, person?.name),
      days: tpl.days,
      reward: fill(tpl.rewardText, place.label, undefined, rewardAmount),
      rewardKind: tpl.rewardKind,
      rewardAmount,
      penalty: fill(tpl.penaltyText, place.label, undefined, penaltyAmount),
      penaltyKind: tpl.penaltyKind,
      penaltyAmount,
    });
  }
  return jobs;
}

/**
 * 把叙事里写下的去处对回本城真有的街区。
 * 认得出便连同去处一并记下，往后星标得出；认不出就只当作一句空话。
 */
export function resolveJobTarget(
  place: string,
  cityId: string,
  districtNames: Record<string, string> | undefined,
): JobTarget | undefined {
  const text = String(place ?? "").trim();
  if (!text || !cityId) return undefined;

  const cityName = getMarker(cityId)?.name ?? "";
  // 明说了是别城的地方，就不该算到本城头上
  if (getCityMarkers().some((m) => m.name !== cityName && text.startsWith(m.name))) return undefined;
  const rest = cityName && text.startsWith(cityName) ? text.slice(cityName.length).replace(/^[·•.\s]+/, "") : text;

  for (const d of getDistricts(cityId)) {
    const named = districtNames?.[`${cityId}:${d.id}`];
    // 叙事写的去处多是「临安·坊市药铺」这样带修饰的写法，故认得宽些：
    // 街区名或街区性质只要出现在去处里便算数，不必正好落在末尾——
    // 否则一律认不出、退到「平民住宅」，任务上写的去处便与地图对不上了
    const hit =
      d.nature === rest ||
      (!!named && (named === rest || rest.includes(named))) ||
      rest.includes(d.nature);
    if (hit) {
      return {
        cityId,
        districtId: d.id,
        label: `${cityName || "此城"}·${named || d.nature}`,
      };
    }
  }
  return undefined;
}

/**
 * 把叙事里写的去处对回一处山门建筑。
 * 写法多是「山门名·建筑名」，故先认山门名号，余下的便是建筑名；
 * 只写了山门、没落到具体一座建筑的不算——那是奔着整座山门去的，本系统只认具体一处。
 */
function resolveSectBuildingTarget(text: string, sectSites: SectSite[]): JobTarget | undefined {
  const raw = String(text ?? "").trim();
  if (!raw) return undefined;
  for (const site of sectSites) {
    const name = String(site?.name ?? "").trim();
    if (!name || !raw.startsWith(name)) continue;
    const rest = raw.slice(name.length).replace(/^[·•.\s]+/, "").trim();
    if (!rest) return undefined;
    return { cityId: "", label: `${name}·${rest}`, sectId: site.id, building: rest };
  }
  return undefined;
}

/**
 * 把去处对回舆图上的一处奇遇：写明它名目的钉在那处点位上。
 * 只认「就是这一处」「写到这一处之下」的说法，不做见字就收——
 * 否则「长安·西市·回春堂」里恰好含着一处奇遇的名目，这桩买卖便被抢成野地去了。
 */
function resolveAdventureTarget(text: string, adventures: Adventure[]): JobTarget | undefined {
  const raw = String(text ?? "").trim();
  if (!raw) return undefined;
  const hit = adventures.find((a) => {
    const name = String(a?.name ?? "").trim();
    if (!name || a.status !== "open") return false;
    if (raw === name || raw.endsWith(`·${name}`) || raw.startsWith(`${name}（`)) return true;
    // 也认「城名+名目」的写法（如「成都城西三十里的废祠」）：前半截须正好是一座城的名字，
    // 这样「长安·西市·回春堂」便不会被一处叫「回春堂」的野地抢走
    if (!raw.endsWith(name)) return false;
    const prefix = raw.slice(0, raw.length - name.length);
    return getCityMarkers().some((m) => m.name === prefix);
  });
  if (!hit) return undefined;
  return { cityId: hit.cityId || "", label: `${hit.name}（${hit.kind}）`, adventureId: hit.id };
}

/** 把去处对回野外的一座村庄：写明村名的钉在那座村上 */
function resolveVillageTarget(text: string, villages: Village[]): JobTarget | undefined {
  const raw = String(text ?? "").trim();
  if (!raw) return undefined;
  const hit = villages.find((v) => {
    const name = String(v?.name ?? "").trim();
    return !!name && (raw === name || raw.includes(name));
  });
  if (!hit) return undefined;
  return { cityId: "", label: hit.name, villageKey: hit.key };
}

/**
 * 把去处对回舆图上的一整座山门。
 * 只写山门名号，或「某某宗山门」「某某宗门下」这类说法的，钉在那一处山门上；
 * 写到具体建筑的先由 resolveSectBuildingTarget 认下，不会落到这里。
 */
function resolveSectTarget(text: string, sectSites: SectSite[]): JobTarget | undefined {
  const raw = String(text ?? "").trim();
  if (!raw) return undefined;
  for (const site of sectSites) {
    const name = String(site?.name ?? "").trim();
    if (!name || !raw.startsWith(name)) continue;
    const rest = raw.slice(name.length).replace(/^[·•.\s]+/, "").trim();
    // 空着便是只说山门；余下的若还说着门墙内外，也算整座山门
    if (!rest || /^(山门|门外|门前|门口|门下|宗门|一派)$/.test(rest)) {
      return { cityId: "", label: `${name}山门`, sectId: site.id };
    }
  }
  return undefined;
}

/** 铺名里的字眼归到营生：认不出便当杂货铺 */
const SHOP_KIND_BY_WORD: [RegExp, ShopKind][] = [
  [/茶/, "茶棚"],
  [/酒|客栈|驿|楼/, "客栈"],
  [/浴|汤/, "浴堂"],
  [/药|医|丹|回春|济世|仁心|杏林/, "丹药铺/医馆"],
  [/瓦|戏|曲/, "瓦舍"],
  [/兽/, "灵兽栏"],
  [/符|箓/, "符箓铺"],
  [/器|铁|铸|锻/, "炼器坊"],
  [/宝|珍|古玩/, "宝物阁"],
  [/旧|故/, "旧货铺"],
  [/当|质/, "当铺"],
  [/镖/, "镖局"],
  [/牙|行/, "牙行"],
  [/书|墨|砚|纸/, "书铺"],
  [/琴|乐|笛|筝|鼓/, "乐器坊"],
  [/武|拳|剑|刀/, "武馆"],
];

function shopKindOfName(name: string): ShopKind {
  for (const [re, kind] of SHOP_KIND_BY_WORD) if (re.test(name)) return kind;
  return "杂货铺";
}

/** 末一段像不像一间铺面：带铺面后缀，或字面上点明了营生 */
const SHOP_TAIL = /(铺|坊|堂|斋|阁|楼|馆|局|栈|棚|号|肆|店)$/;
const SHOP_WORD = /(药|医|丹|茶|酒|当|镖|书|符|器|宝|杂货|绸缎|米|盐|铁|木)/;

function looksLikeShop(name: string): boolean {
  return SHOP_TAIL.test(name) || SHOP_WORD.test(name);
}

/**
 * 把去处对回坊市里的某一间铺子。
 * 写法是「城名·坊市名·铺名」（如「长安·西市·回春堂」）；只写了坊市、没写铺名的不算——
 * 那是奔着整条街去的，交给 resolveJobTarget 认。铺子未必真开着，事办完便不再露面。
 */
function resolveShopTarget(
  text: string,
  cityId: string,
  districtNames: Record<string, string> | undefined,
): JobTarget | undefined {
  const raw = String(text ?? "").trim();
  if (!raw || !cityId) return undefined;
  const cityName = getMarker(cityId)?.name ?? "";
  if (getCityMarkers().some((m) => m.name !== cityName && raw.startsWith(m.name))) return undefined;
  const rest = cityName && raw.startsWith(cityName) ? raw.slice(cityName.length).replace(/^[·•.\s]+/, "") : raw;

  for (const d of getDistricts(cityId)) {
    if (d.nature !== "坊市") continue;
    const named = districtNames?.[`${cityId}:${d.id}`];
    const hit = rest === d.nature || (!!named && (rest === named || rest.includes(named))) || rest.includes(d.nature);
    if (!hit) continue;

    // 铺名取最后一段；若街区名与铺名连写（如「西市药铺」），把街区那一截剥掉
    const segs = rest.split(/[·•.\s]+/).map((s) => s.trim()).filter(Boolean);
    let shop = segs[segs.length - 1] ?? "";
    for (const boundary of [named, d.nature]) {
      if (!boundary) continue;
      if (shop === boundary) shop = "";
      else if (shop.startsWith(boundary)) shop = shop.slice(boundary.length).replace(/^[·•.\s的]+/, "");
    }
    shop = shop.trim().slice(0, 20);
    if (!shop) return undefined;

    return {
      cityId,
      districtId: d.id,
      label: `${cityName || "此城"}·${named || d.nature}·${shop}`,
      shop,
      shopKind: shopKindOfName(shop),
    };
  }

  // 只写了「城名·铺名」、没点明是哪条坊市的，末一段像铺面便归到本城的坊市。
  // 少了这一条，「长安·回春堂」认不出来，会被当成一处没见过的野地现开在舆图上——
  // 一桩买药的差事，就这么长在了大地图上
  const segs = rest.split(/[·•.\s]+/).map((s) => s.trim()).filter(Boolean);
  const bareShop = (segs[segs.length - 1] ?? "").trim().slice(0, 20);
  if (looksLikeShop(bareShop)) {
    const market = getDistricts(cityId).find((d) => d.nature === "坊市") ?? getDistricts(cityId)[0];
    if (market) {
      const named = districtNames?.[`${cityId}:${market.id}`];
      return {
        cityId,
        districtId: market.id,
        label: `${cityName || "此城"}·${named || market.nature}·${bareShop}`,
        shop: bareShop,
        shopKind: shopKindOfName(bareShop),
      };
    }
  }
  return undefined;
}

/** 这一桩差事眼下还接不接得：柜上没撤、也还没被人接下 */
export function jobOpen(job: BrokerJob | undefined): boolean {
  return !!job && !job.taken;
}

/**
 * 由一桩机缘的字面，拟出办到那一处要见的人。
 * 只有奔人去的机缘才走到这里：等在那一处的便是要找的那个人；
 * 字里透着为难的，另添一个挡路的。
 */
function narrativeCastRoles(quest: Quest): JobCastRole[] {
  const title = String(quest.target?.person || "").trim();
  const who = String(quest.giver || "人").trim();
  const contact: JobCastRole = {
    title: title || "要找的人",
    side: "contact",
    persona: `受${who}所托，在这一处等着了结「${quest.name}」的人。${
      quest.desc ? `${quest.desc.slice(0, 80)}。` : ""
    }办事的人到了，他先问明来意、对过信物或暗号：肯下力气的便好说话，敷衍了事的便不肯认。`,
  };

  const text = `${quest.name}${quest.desc}${quest.condition}`;
  if (!/讨债|寻仇|夺回|教训|截住|打探|卧底|驱逐|围捕|缉拿|夺|抢|斗/.test(text)) return [contact];
  return [
    contact,
    {
      title: "挡路的人",
      side: "antagonist",
      persona: "这一桩上不愿让人办成的一方，横在那一处软磨硬顶。口风硬、手也不软，除非自知不敌，否则不肯让路。",
    },
  ];
}

/** 把叙事写明的去处翻成点位时，要用到的眼下实情 */
interface AnchorContext {
  currentPlaceId: string;
  districtNames?: Record<string, string>;
  today: number;
  adventures: Adventure[];
  villages: Village[];
  sectSites: SectSite[];
}

/**
 * 照叙事写明的去处翻成点位。
 * 这一步只做「名号对回真有的那一处」这件确定性的事，不再猜：
 * 对不上便交回 undefined，由调用方回落到照字面认——宁可退回老路，也不硬安一处。
 */
function anchorToTarget(
  anchor: QuestAnchor,
  quest: Quest,
  ctx: AnchorContext,
): { target?: JobTarget; born?: Adventure } | undefined {
  const cityId =
    getCityMarkers().find((m) => m.name === String(anchor.city ?? "").trim())?.id ?? ctx.currentPlaceId;
  const districts = getDistricts(cityId);
  const cityName = getMarker(cityId)?.name ?? "此城";
  const districtLabel = (id: number) => ctx.districtNames?.[`${cityId}:${id}`] ?? "";

  switch (anchor.kind) {
    case "district": {
      const want = String(anchor.district ?? "").trim();
      if (!want) return undefined;
      const hit =
        districts.find((d) => districtLabel(d.id) === want || d.nature === want) ??
        districts.find((d) => {
          const label = districtLabel(d.id);
          return (!!label && (label.includes(want) || want.includes(label))) || want.includes(d.nature);
        });
      if (!hit) return undefined;
      return {
        target: {
          cityId,
          districtId: hit.id,
          label: `${cityName}·${districtLabel(hit.id) || hit.nature}`,
        },
      };
    }
    case "shop": {
      const shopName = String(anchor.shop ?? "").trim();
      if (!shopName) return undefined;
      const want = String(anchor.district ?? "").trim();
      const markets = districts.filter((d) => d.nature === "坊市");
      const market =
        (want ? markets.find((d) => districtLabel(d.id) === want || d.nature === want) : undefined) ??
        markets[0] ??
        districts[0];
      if (!market) return undefined;
      return {
        target: {
          cityId,
          districtId: market.id,
          label: `${cityName}·${districtLabel(market.id) || market.nature}·${shopName}`,
          shop: shopName,
          shopKind: (anchor.shopKind as ShopKind) || shopKindOfName(shopName),
        },
      };
    }
    case "sect": {
      const site = ctx.sectSites.find((s) => s?.name === anchor.sect);
      if (!site) return undefined;
      return { target: { cityId: "", label: `${site.name}山门`, sectId: site.id } };
    }
    case "sectBuilding": {
      const site = ctx.sectSites.find((s) => s?.name === anchor.sect);
      const building = String(anchor.building ?? "").trim();
      if (!site || !building) return undefined;
      return {
        target: { cityId: "", label: `${site.name}·${building}`, sectId: site.id, building },
      };
    }
    case "village": {
      const village = ctx.villages.find((v) => v?.name === anchor.village);
      if (!village) return undefined;
      return { target: { cityId: "", label: village.name, villageKey: village.key } };
    }
    case "adventure": {
      const adv = ctx.adventures.find((a) => a?.name === anchor.adventure && a.status === "open");
      if (!adv) return undefined;
      return {
        target: {
          cityId: adv.cityId || cityId,
          label: `${adv.name}（${adv.kind}）`,
          adventureId: adv.id,
        },
      };
    }
    case "wild": {
      const wild = anchor.wild;
      if (!wild?.name) return undefined;
      const nearby = pickOrNudgeSpotNear(
        { sectSites: ctx.sectSites, adventures: ctx.adventures },
        cityId,
      );
      if (!nearby) return undefined;
      const born =
        normalizeAdventure(
          {
            name: wild.name,
            kind: wild.kind,
            summary: wild.summary,
            danger: wild.danger,
            // 事一了，这一处便随那桩机缘一并撤去
            questId: quest.id,
          },
          {
            state: { sectSites: ctx.sectSites, adventures: ctx.adventures },
            spot: nearby,
            cityId,
            day: ctx.today,
            origin: "story",
          },
        ) ?? undefined;
      if (!born) return undefined;
      return {
        target: { cityId: born.cityId, label: `${born.name}（${born.kind}）`, adventureId: born.id },
        born,
      };
    }
    default:
      return undefined;
  }
}

/** 照叙事点名的那一位立一条尘缘：姓名、身份与人设都用叙事写的那一份 */
function composeAnchorPerson(
  person: QuestAnchorPerson,
  target: JobTarget,
  cityId: string,
  culture?: string,
): Relation {
  const base = rollQuestNpc(
    {
      title: person.title || "接头的人",
      persona: person.persona || "",
      gender: person.gender,
    },
    target.label,
    target.cityId || cityId,
    target.districtId,
    culture,
    target.districtId === undefined ? target.label : undefined,
  );
  return {
    ...base,
    name: person.name,
    title: person.title || base.title,
    ...(person.age ? { age: person.age } : {}),
    ...(person.realm ? { realm: person.realm } : {}),
    ...(person.origin ? { origin: person.origin } : {}),
    ...(person.personality ? { personality: person.personality } : {}),
    ...(person.appearance ? { appearance: person.appearance } : {}),
    ...(person.persona ? { persona: person.persona, note: person.persona } : {}),
  };
}

/**
 * 给叙事里生成的机缘定下真去处与要见的人，照牙行那一套办。
 *
 * 去处由叙事自己说：它写明了是哪一类地方、叫什么名号（quest.anchor），
 * 这里只把那个名号对回真有的街区、山门建筑、村庄、奇遇或铺面，不再拿整行字去猜；
 * 没写明锚点的旧式机缘，才照字面依次认一遍。
 * 要找的人也由叙事点名（anchor.person）：尘缘里已有的照用，没有的便照它立传。
 * 什么都说不上来的，才在附近现开一处，或落到城里一处住人的街区。
 */
export function pinNarrativeQuest(args: {
  quest: Quest;
  currentPlaceId: string;
  districtNames?: Record<string, string>;
  culture?: string;
  /** 今日日序，用来定这人守在原处的期限 */
  today: number;
  /** 眼下舆图上开着的奇遇；去处写到它便可钉过去 */
  adventures?: Adventure[];
  /** 眼下舆图上的村庄 */
  villages?: Village[];
  /** 江湖上的各处山门；去处写到某座建筑便可钉过去 */
  sectSites?: SectSite[];
  /** 尘缘里已认得的人：叙事点名要找的人若在其中，便照那一位，不再另立 */
  known?: Relation[];
  /**
   * 不许就地现开新去处：牙行柜上揽的事只落在真有的地方，
   * 认不出便退到城里住人的街区，不在舆图上另长出一处。
   */
  noSpawn?: boolean;
}): { quest: Quest; people: Relation[]; adventure?: Adventure } {
  const { quest, currentPlaceId, districtNames, today } = args;
  if (!currentPlaceId) return { quest, people: [] };

  const text = String(quest.place || "").trim();
  // 去处落在哪座城：写明别城名号的认那一座，没写明的算本城
  const namedCity = getCityMarkers().find((m) => text.startsWith(m.name));
  const cityId = namedCity?.id ?? currentPlaceId;
  const culture = getMarker(cityId)?.culture ?? args.culture;

  let target = quest.target;
  // 若这一桩点名的地方舆图上没有，便现开一处去处；生出来的这一处要一并交回，好落进存档
  let born: Adventure | undefined;

  // 叙事写明了去哪一类地方的，先照它翻成点位
  if (!target && quest.anchor) {
    const anchored = anchorToTarget(quest.anchor, quest, {
      currentPlaceId,
      districtNames,
      today,
      adventures: args.adventures ?? [],
      villages: args.villages ?? [],
      sectSites: args.sectSites ?? [],
    });
    target = anchored?.target;
    born = anchored?.born;
  }

  if (!target) {
    // 去处可能是城内街区、某座山门里的建筑、舆图上的奇遇，或一座村庄，按写法依次认一遍
    target =
      // 山门建筑、整座山门与村名写得最死，先认
      resolveSectBuildingTarget(text, args.sectSites ?? []) ??
      resolveSectTarget(text, args.sectSites ?? []) ??
      resolveVillageTarget(text, args.villages ?? []) ??
      // 铺子写作「城名·坊市·铺名」，结构最清楚，排在奇遇之前：
      // 否则一处奇遇的名目恰好嵌在铺名里，这桩买卖便被抢成野地去了
      resolveShopTarget(text, cityId, districtNames) ??
      resolveAdventureTarget(text, args.adventures ?? []) ??
      resolveJobTarget(text, cityId, districtNames);
    // 事件类可以没有具体去处：认不出便不钉，由叙事随缘去办，不硬安一个星标
    if (!target && !questKindNeedsPlace(quest.kind)) return { quest, people: [] };
    if (!target && !args.noSpawn) {
      // 地点类与人物类须有具体去处：点名的地方城里没有，就在附近还空着的预设点位上现开一处。
      // 只挑这一带近处的空位，远处的不算「附近」；这一带都被人占满了，
      // 便在离城最近的那处点位旁另开一处，仍算在附近
      const nearby = pickOrNudgeSpotNear(
        { sectSites: args.sectSites ?? [], adventures: args.adventures ?? [] },
        cityId,
      );
      // 去处写了城名的，开出来的这一处只留地方本名，免得屏幕上叠成「临安·临安城西废寺」
      const cityName = getMarker(cityId)?.name ?? "";
      const placeName =
        (cityName && text.startsWith(cityName)
          ? text.slice(cityName.length).replace(/^[·•.\s]+/, "")
          : text) || quest.name;
      born = nearby
        ? normalizeAdventure(
            {
              name: placeName,
              kind: "去处",
              summary: quest.desc || quest.condition,
              danger: 1,
              // 这一处是替这桩事现开的；事一了，便照这个 id 一并撤去
              questId: quest.id,
            },
            {
              state: { sectSites: args.sectSites ?? [], adventures: args.adventures ?? [] },
              spot: nearby,
              cityId,
              day: today,
              origin: "story",
            },
          ) ?? undefined
        : undefined;
      if (born) {
        target = { cityId: born.cityId, label: `${born.name}（${born.kind}）`, adventureId: born.id };
      }
    }
    if (!target) {
      // 近处没有可开的地方：仍落在那座城一处住人的地方，好歹有人可寻
      const fallback =
        getDistricts(cityId).find((d) => d.nature === "平民住宅") ?? getDistricts(cityId)[0];
      if (!fallback) return { quest, people: [] };
      const cityName = getMarker(cityId)?.name ?? "此城";
      const named = districtNames?.[`${cityId}:${fallback.id}`];
      target = {
        cityId,
        districtId: fallback.id,
        label: `${cityName}·${named || fallback.nature}`,
      };
    }
  }

  // 差事办在某间铺子里的：铺子的营生、门面与掌柜都以叙事写定的那一份为准。
  // 叙事没写掌柜的，这一家照旧挂出来，人便暂且空着，不再由代码另掷一个。
  // 要找的人本就有的（人物、人物物品），掌柜便是那人
  const shopBrief = target?.shop ? quest.shopBrief : undefined;
  let shopKeeper: Relation | undefined;
  if (target?.shop) {
    if (shopBrief?.keeper) {
      shopKeeper = composeShopkeeper(
        shopBrief.keeper,
        target.cityId || cityId,
        target.districtId ?? 0,
        target.shop,
      );
    }
    target = {
      ...target,
      shopKind: shopBrief?.kind ?? target.shopKind ?? shopKindOfName(target.shop),
      shopDesc: shopBrief?.desc ?? target.shopDesc,
      ...(shopKeeper ? { person: shopKeeper.name } : {}),
    };
  }

  // 去处落了实、却本不是奔人去的：按落下的去处归到地点类，不另钉人——
  // 到了那一处怎么办，由叙事去写。奔人去的（含要当面交物的）照旧：去处连同要找的人一并钉下
  if (quest.kind !== "人物" && quest.kind !== "人物物品") {
    return {
      quest: { ...quest, kind: "地点", target },
      people: shopKeeper ? [shopKeeper] : [],
      ...(born ? { adventure: born } : {}),
    };
  }

  const roles = narrativeCastRoles(quest);
  const until = Number(quest.dueDay) > 0 ? Number(quest.dueDay) : today + 30;

  // 去处是城内街区，人便钉在那一格上；去处是山门建筑、奇遇或村庄，
  // 人便跟着那一处的名号走（location），玩家到了那一处才寻得着
  const people = roles.map((role) => ({
    ...rollQuestNpc(
      role,
      target!.label,
      target!.cityId,
      target!.districtId,
      culture,
      target!.districtId === undefined ? target!.label : undefined,
    ),
    fixedUntilDay: until,
  }));

  // 铺子里要找的人就是叙事写定的那位掌柜：照他立起，替掉现掷的那一个
  if (shopKeeper) people[0] = { ...shopKeeper, fixedUntilDay: until };

  // 叙事点名了要找的人：尘缘里已有的照用那一位，没有的便照它立传，
  // 替掉现掷的那一个——人是谁，由叙事说了算
  const wanted = quest.anchor?.person;
  if (wanted) {
    const knownPerson = (args.known ?? []).find((r) => r?.name === wanted.name);
    const picked = knownPerson
      ? { ...knownPerson, fixedUntilDay: until }
      : { ...composeAnchorPerson(wanted, target!, cityId, culture), fixedUntilDay: until };
    if (people.length === 0) people.push(picked);
    else people[0] = picked;
  }

  return {
    quest: {
      ...quest,
      target: { ...target, person: people[0]?.name ?? target.person },
      cast: roles,
    },
    people,
    ...(born ? { adventure: born } : {}),
  };
}
