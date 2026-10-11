/**
 * 宗门建筑的养成与日常：等级、产出、维护、管事、可做的事。
 *
 * 宗门地图上立起来的每一座建筑，都在这里有一份账：
 *   - 日产什么、耗多少灵石，按等级折算；
 *   - 能做什么事，按地块类别给一套事项；
 *   - 谁管事，由各堂的堂主对上来，对不上便是无主，产出打折。
 *
 * 一桩事项都不许「点一下就完事」：总要先说清做什么、练多久、挑哪一门，
 * 再由 store 按所选参数结算，另交一段叙事去写。凡是能一按即成的勾当，
 * 这里一概不列。
 *
 * 建筑名与地块类别同 src/data/map/sectBuildings.ts 的名录一一对应，
 * 名录里添了新建筑，这里补一条即可；缺一条便按所属类别的通用账面算。
 */

import { getSectTileKind, sectTileCode } from "./map/sectTiles";
import { allSectBuildings, sectMapLayout } from "./map/sectBuildings";
import type {
  CustomFacility,
  FacilityKindId,
  MapScene,
  SectFacilityState,
  SectHall,
  SectHeritage,
} from "./types";

/** 建筑等级上限 */
export const FACILITY_LEVEL_CAP = 5;

/** 无主建筑的产出折扣 */
export const STEWARD_MISSING_FACTOR = 0.6;

/** 修缮中的产出折扣 */
export const REPAIRING_FACTOR = 0.5;

/** 建筑状态；停用则产出归零 */
export type FacilityStatus = SectFacilityState["status"];

/** 一日的产出：材料按名目计，另有灵石与声望两笔 */
export interface FacilityYield {
  materials: { name: string; amount: number }[];
  stone: number;
  reputation: number;
}

/** 一桩事项的落地方式：交叙事推演、开百艺、开战 */
export type FacilityActionMode = "narrative" | "craft" | "battle";

/** 选项从哪儿来：写死的看 options，现算的看 optionSource */
export type FacilityOptionSource = "heritage" | "heritageAll" | "peers";

export interface FacilityOption {
  label: string;
  /** 结算与叙事都照这个值走；时长类的值就是时辰数 */
  value: string;
  hint?: string;
}

/** 建筑可做的一件事；每件都要先挑一项参数，才谈得上动手 */
export interface FacilityAction {
  id: string;
  name: string;
  desc: string;
  /** 要求身份等级，缺省为 1，人人可做 */
  need?: number;
  /** 一日只许做一回 */
  daily?: boolean;
  mode: FacilityActionMode;
  /** 要挑的那一项叫什么，如「练多久」「参哪一门」 */
  optionLabel: string;
  options?: FacilityOption[];
  /** 选项由本门情形现算（如可参的传承、能约的同门） */
  optionSource?: FacilityOptionSource;
  /** craft 用哪一页 */
  craft?: "alchemy" | "talisman";
  /** battle 打谁：random 随机来敌，peer 同门比试 */
  battle?: "random" | "peer";
}

/** 时长选项：一个时辰、三个时辰、半日 */
const HOURS: FacilityOption[] = [
  { label: "一个时辰", value: "1" },
  { label: "三个时辰", value: "3" },
  { label: "半日", value: "6" },
];

/** 各类地块默认的几件事；个别建筑另有安排，见 ACTIONS_OVERRIDE */
const ACTIONS_BY_KIND: Record<FacilityKindId, FacilityAction[]> = {
  hall: [
    {
      id: "lecture",
      name: "登坛开讲",
      desc: "于殿上讲一场法，门人环坐而听。进益看当坛那位修为的高低。",
      daily: true,
      mode: "narrative",
      optionLabel: "讲什么",
      options: [
        { label: "讲本门心法", value: "心法" },
        { label: "讲处世之道", value: "处世" },
        { label: "讲门规戒律", value: "戒律" },
      ],
    },
    {
      id: "council",
      name: "聚众议事",
      desc: "与长老执事议一议门中事务，议完心中自有丘壑。",
      need: 2,
      daily: true,
      mode: "narrative",
      optionLabel: "议什么",
      options: [
        { label: "钱粮出入", value: "钱粮" },
        { label: "弟子去留", value: "人事" },
        { label: "外事往来", value: "外事" },
      ],
    },
  ],
  scripture: [
    {
      id: "study",
      name: "参悟传承",
      desc: "挑一门传承静参，能否参得，看你的身份与贡献。",
      daily: true,
      mode: "narrative",
      optionLabel: "参哪一门",
      optionSource: "heritage",
    },
    {
      id: "copy",
      name: "抄录典籍",
      desc: "伏案抄书，抄出来的东西入宗门宝库。",
      daily: true,
      mode: "narrative",
      optionLabel: "抄什么",
      options: [
        { label: "抄经卷", value: "经卷" },
        { label: "抄符纸", value: "符纸" },
        { label: "抄曲谱", value: "曲谱" },
      ],
    },
    {
      id: "preach",
      name: "登座讲经",
      desc: "登座讲一场经，宗门记你一功。",
      daily: true,
      mode: "narrative",
      optionLabel: "讲什么",
      options: [
        { label: "讲养生之道", value: "养生" },
        { label: "讲丹道火候", value: "丹道" },
        { label: "讲剑理刀法", value: "剑理" },
      ],
    },
  ],
  martial: [
    {
      id: "drill",
      name: "下场操练",
      desc: "在场上实打实练一场。",
      daily: true,
      mode: "narrative",
      optionLabel: "练什么",
      options: [
        { label: "练拳脚", value: "拳脚" },
        { label: "练兵刃", value: "兵刃" },
        { label: "练身法", value: "身法" },
      ],
    },
    {
      id: "peer",
      name: "约同门比试",
      desc: "挑一位同门过招，点到为止；真刀真枪打一场。",
      daily: true,
      mode: "battle",
      battle: "peer",
      optionLabel: "挑谁",
      optionSource: "peers",
    },
    {
      id: "challenge",
      name: "迎战来敌",
      desc: "山门外常有不服气的寻上门来，正好试手。",
      daily: true,
      mode: "battle",
      battle: "random",
      optionLabel: "怎么迎",
      options: [
        { label: "独自迎战", value: "solo" },
        { label: "与同行者并肩", value: "together" },
      ],
    },
  ],
  alchemy: [
    {
      id: "brew",
      name: "开炉炼丹",
      desc: "支起丹炉，选药材、看火候，实打实炼一炉。",
      daily: true,
      mode: "craft",
      craft: "alchemy",
      optionLabel: "做什么",
      options: [{ label: "开炉炼丹", value: "brew" }],
    },
    {
      id: "soak",
      name: "浸体练功",
      desc: "以药力浸体，泡得越久，筋骨越经得起折腾。",
      daily: true,
      mode: "narrative",
      optionLabel: "浸多久",
      options: HOURS,
    },
  ],
  forge: [
    {
      id: "forgework",
      name: "升火锻造",
      desc: "生炉打铁，出一件实打实的东西。",
      daily: true,
      mode: "narrative",
      optionLabel: "打什么",
      options: [
        { label: "打兵刃", value: "兵刃" },
        { label: "打器物", value: "器物" },
        { label: "打农具", value: "农具" },
      ],
    },
    {
      id: "mine",
      name: "采石挖矿",
      desc: "下到矿坑里，挖多久算多久。",
      daily: true,
      mode: "narrative",
      optionLabel: "挖多久",
      options: HOURS,
    },
  ],
  spirit: [
    {
      id: "meditate",
      name: "临脉打坐",
      desc: "就着灵脉行功，坐多久，涨多少。",
      daily: true,
      mode: "narrative",
      optionLabel: "坐多久",
      options: HOURS,
    },
    {
      id: "labor",
      name: "就脉劳作",
      desc: "引灵入渠、修池砌堰，为宗门出一份力。",
      daily: true,
      mode: "narrative",
      optionLabel: "做多久",
      options: HOURS,
    },
  ],
  farm: [
    {
      id: "labor",
      name: "下田劳作",
      desc: "锄地、浇水、除草，做多久收多少。",
      daily: true,
      mode: "narrative",
      optionLabel: "做多久",
      options: HOURS,
    },
    {
      id: "meditate",
      name: "田头静坐",
      desc: "借这一方地气行功，也能涨些修为。",
      daily: true,
      mode: "narrative",
      optionLabel: "坐多久",
      options: HOURS,
    },
  ],
  beast: [
    {
      id: "feed",
      name: "喂兽",
      desc: "亲手喂一回，兽与人更近一层。",
      daily: true,
      mode: "narrative",
      optionLabel: "喂哪一头",
      options: [
        { label: "喂灵兽", value: "灵兽" },
        { label: "喂坐骑", value: "坐骑" },
        { label: "喂守山犬", value: "守山犬" },
      ],
    },
    {
      id: "tame",
      name: "牵兽出栏",
      desc: "牵一头出来遛一遛，试试脚力与心性。",
      daily: true,
      mode: "narrative",
      optionLabel: "牵哪一头",
      options: [
        { label: "牵坐骑", value: "坐骑" },
        { label: "牵猎兽", value: "猎兽" },
      ],
    },
  ],
  array: [
    {
      id: "ward",
      name: "巡查阵眼",
      desc: "把阵势逐处理一遍，护山才稳。",
      daily: true,
      mode: "narrative",
      optionLabel: "查哪一处",
      options: [
        { label: "查外围", value: "外围" },
        { label: "查内院", value: "内院" },
        { label: "查后山", value: "后山" },
      ],
    },
    {
      id: "divine",
      name: "占卜吉凶",
      desc: "就着阵势推一卦，问什么算什么。",
      daily: true,
      mode: "narrative",
      optionLabel: "问什么",
      options: [
        { label: "问吉凶", value: "吉凶" },
        { label: "问行止", value: "行止" },
        { label: "问人事", value: "人事" },
      ],
    },
  ],
  housing: [
    {
      id: "visit",
      name: "走访门人",
      desc: "各处走一走，听些门中的闲话。",
      daily: true,
      mode: "narrative",
      optionLabel: "去哪儿",
      options: [
        { label: "去弟子住处", value: "弟子住处" },
        { label: "去斋堂", value: "斋堂" },
        { label: "去山门", value: "山门" },
      ],
    },
  ],
};

/** 个别建筑另有安排；有它便不再用所属地块的那一套 */
const ACTIONS_OVERRIDE: Record<string, FacilityAction[]> = {
  // 主殿
  传法大殿: ACTIONS_BY_KIND.hall,

  // 经阁
  藏书楼: [ACTIONS_BY_KIND.scripture[0], ACTIONS_BY_KIND.scripture[1]],
  藏经阁: [ACTIONS_BY_KIND.scripture[0], ACTIONS_BY_KIND.scripture[1]],
  曲谱库: [
    ACTIONS_BY_KIND.scripture[0],
    {
      id: "copy",
      name: "听曲清心",
      desc: "在谱库里听一曲，心神为之一清。",
      daily: true,
      mode: "narrative",
      optionLabel: "听哪一路",
      options: [
        { label: "听琴曲", value: "琴曲" },
        { label: "听笛曲", value: "笛曲" },
      ],
    },
  ],
  碑林: [
    {
      id: "rubbing",
      name: "拓碑",
      desc: "把碑上的字拓下来，拓的是门规与前人心得。",
      daily: true,
      mode: "narrative",
      optionLabel: "拓哪一块",
      options: [
        { label: "拓门规碑", value: "门规碑" },
        { label: "拓心得碑", value: "心得碑" },
      ],
    },
  ],
  讲经堂: [ACTIONS_BY_KIND.scripture[2]],
  和纸窖: [
    {
      id: "craftTalisman",
      name: "画符",
      desc: "窖里有的是纸与朱砂，正可实打实画一道。",
      daily: true,
      mode: "craft",
      craft: "talisman",
      optionLabel: "做什么",
      options: [{ label: "开符案", value: "talisman" }],
    },
    {
      id: "copy",
      name: "抄符纸",
      desc: "把纸裁好、晒好，抄出来入宝库。",
      daily: true,
      mode: "narrative",
      optionLabel: "做什么",
      options: [
        { label: "裁纸", value: "符纸" },
        { label: "晒纸", value: "符纸" },
      ],
    },
  ],

  // 演武
  剑冢: [
    {
      id: "drill",
      name: "受剑意洗礼",
      desc: "在冢前静立，任那一身寒的剑意过体。",
      daily: true,
      mode: "narrative",
      optionLabel: "立多久",
      options: HOURS,
    },
  ],
  试剑石: [ACTIONS_BY_KIND.martial[0], ACTIONS_BY_KIND.martial[1]],
  木人巷: [ACTIONS_BY_KIND.martial[0]],
  演武场: ACTIONS_BY_KIND.martial,
  擂台: [
    {
      id: "peer",
      name: "登台约战",
      desc: "当众约一位同门上台，赢的人有脸面。",
      daily: true,
      mode: "battle",
      battle: "peer",
      optionLabel: "约谁",
      optionSource: "peers",
    },
    {
      id: "challenge",
      name: "应战来客",
      desc: "四方来的好手都会上台比一场。",
      daily: true,
      mode: "battle",
      battle: "random",
      optionLabel: "怎么应",
      options: [
        { label: "独自应战", value: "solo" },
        { label: "与同行者并肩", value: "together" },
      ],
    },
  ],

  // 丹房
  炼丹房: [ACTIONS_BY_KIND.alchemy[0]],
  药王谷: [ACTIONS_BY_KIND.alchemy[0], ACTIONS_BY_KIND.alchemy[1]],
  药庐: [
    {
      id: "brew",
      name: "开炉炼丹",
      desc: "小庐里也支得起炉子，炼一炉基础丹药。",
      daily: true,
      mode: "craft",
      craft: "alchemy",
      optionLabel: "做什么",
      options: [{ label: "开炉炼丹", value: "brew" }],
    },
  ],
  丹库: [
    {
      id: "ration",
      name: "清点配给",
      desc: "盘点库中的丹药，按贡献配给门人。",
      daily: true,
      mode: "narrative",
      optionLabel: "配给谁",
      options: [
        { label: "配给弟子", value: "弟子" },
        { label: "配给执事", value: "执事" },
        { label: "留作门中备用", value: "备用" },
      ],
    },
  ],
  万毒潭: [ACTIONS_BY_KIND.alchemy[1]],
  蛊窟: [
    {
      id: "raise",
      name: "养蛊",
      desc: "照看窟里的蛊虫，喂什么、怎么喂都有讲究。",
      daily: true,
      mode: "narrative",
      optionLabel: "喂什么",
      options: [
        { label: "喂药草", value: "药草" },
        { label: "喂血肉", value: "血肉" },
        { label: "以自身血气养", value: "血气" },
      ],
    },
  ],

  // 锻器
  铸器炉: [ACTIONS_BY_KIND.forge[0]],
  锻刀场: [ACTIONS_BY_KIND.forge[0]],
  锻铁铺: [ACTIONS_BY_KIND.forge[0]],
  镔铁矿: [ACTIONS_BY_KIND.forge[1]],
  寒铁矿: [ACTIONS_BY_KIND.forge[1]],
  料场: [ACTIONS_BY_KIND.forge[1]],

  // 灵脉
  活灵脉: ACTIONS_BY_KIND.spirit,
  引灵泉: ACTIONS_BY_KIND.spirit,
  水脉泉眼: ACTIONS_BY_KIND.spirit,
  绿洲泉: ACTIONS_BY_KIND.spirit,
  灵鲤池: [
    {
      id: "feed",
      name: "喂鲤",
      desc: "池里的灵鲤认人，喂熟了可替你下水探路。",
      daily: true,
      mode: "narrative",
      optionLabel: "喂什么",
      options: [
        { label: "撒鱼食", value: "鱼食" },
        { label: "喂丹药碎屑", value: "丹屑" },
      ],
    },
  ],

  // 灵田
  百亩药圃: ACTIONS_BY_KIND.farm,
  灵田: ACTIONS_BY_KIND.farm,
  菜圃: ACTIONS_BY_KIND.farm,
  香料园: ACTIONS_BY_KIND.farm,

  // 灵苑
  白鹿苑: ACTIONS_BY_KIND.beast,
  雪狐谷: ACTIONS_BY_KIND.beast,
  狼群: [
    {
      id: "feed",
      name: "喂狼",
      desc: "狼认头狼，喂得熟了号角一响便随你冲阵。",
      daily: true,
      mode: "narrative",
      optionLabel: "喂什么",
      options: [
        { label: "喂生肉", value: "生肉" },
        { label: "亲自喂", value: "亲喂" },
      ],
    },
    ACTIONS_BY_KIND.beast[1],
  ],
  兽栏: ACTIONS_BY_KIND.beast,

  // 阵法
  护山大阵: [ACTIONS_BY_KIND.array[0]],
  律令碑: [ACTIONS_BY_KIND.array[0]],
  阵基: [ACTIONS_BY_KIND.array[0], ACTIONS_BY_KIND.array[1]],
  星图台: [ACTIONS_BY_KIND.array[1]],
  铜鼓台: [
    {
      id: "rite",
      name: "击鼓祭祀",
      desc: "鼓响召集全寨，祭的什么、求的什么，都由你定。",
      daily: true,
      mode: "narrative",
      optionLabel: "祭什么",
      options: [
        { label: "祭山神", value: "山神" },
        { label: "祭先祖", value: "先祖" },
        { label: "为门人祈福", value: "祈福" },
      ],
    },
  ],
  传功台: [
    {
      id: "transmit",
      name: "登台传功",
      desc: "长老在此批量传功，一次可点醒多名弟子。",
      daily: true,
      mode: "narrative",
      optionLabel: "传哪一门",
      optionSource: "heritageAll",
    },
  ],

  // 居所
  弟子厢房: [
    {
      id: "rest",
      name: "回房歇息",
      desc: "在房里睡过去一段时辰，醒来日子已往前走了。",
      daily: true,
      mode: "narrative",
      optionLabel: "歇多久",
      options: HOURS,
    },
  ],
  斋堂: [
    {
      id: "feast",
      name: "用饭",
      desc: "与门人同席吃一顿，吃的是灵谷与蔬菜。",
      daily: true,
      mode: "narrative",
      optionLabel: "吃什么",
      options: [
        { label: "随众吃", value: "随众" },
        { label: "添些荤腥", value: "荤腥" },
      ],
    },
  ],
  客舍: [
    {
      id: "receive",
      name: "接待来客",
      desc: "客舍里常有来投之人，见与不见、留与不留，都在你。",
      daily: true,
      mode: "narrative",
      optionLabel: "怎么待",
      options: [
        { label: "设席款待", value: "设席" },
        { label: "先去探探底细", value: "探底" },
      ],
    },
  ],
  画舫: [
    {
      id: "feast",
      name: "湖心宴客",
      desc: "就着湖水摆一席，请的是他门来人。",
      daily: true,
      mode: "narrative",
      optionLabel: "请谁",
      options: [
        { label: "请往来的同道", value: "同道" },
        { label: "请本地士绅", value: "士绅" },
      ],
    },
  ],
  汤泉: [
    {
      id: "soak",
      name: "入汤疗伤",
      desc: "泡在汤里养气，泡得越久，旧伤去得越净。",
      daily: true,
      mode: "narrative",
      optionLabel: "泡多久",
      options: HOURS,
    },
  ],
  温泉: [
    {
      id: "soak",
      name: "入泉疗伤",
      desc: "雪窝里的热泉，伤病理疗最快。",
      daily: true,
      mode: "narrative",
      optionLabel: "泡多久",
      options: HOURS,
    },
  ],
};

/** 逐座建筑的账；与 sectBuildings.ts 的 49 座一一对应 */
export interface FacilityInfo {
  kind: FacilityKindId;
  /** 门里的说法，界面上一句注 */
  note: string;
  /**
   * 这一处的场景提示词：写它是什么样子、有什么物什气味声响。
   * 各建筑各写各的，叙事照它落笔，不同去处才不会写成同一个调子。
   */
  scene: string;
  /** 日产，Lv.1 的数，按等级折算 */
  produce?: { name: string; base: number }[];
  /** 日产灵石 */
  stone?: number;
  /** 日产声望 */
  reputation?: number;
  /** 每日维护，下品灵石 */
  upkeep: number;
}

const FACILITIES: Record<string, FacilityInfo> = {
  // 主殿
  传法大殿: {
    kind: "hall",
    note: "宗门中枢，掌门讲法的坛也在这里。",
    scene: "殿高数丈，梁上悬着历代掌门的画像，蒲团一列列铺到阶下，说话时回音绕梁。",
    stone: 40,
    reputation: 2,
    upkeep: 30,
  },

  // 经阁
  藏书楼: {
    kind: "scripture",
    note: "正统典籍藏于此，参悟功法最快。",
    scene: "楼分三层，架上抄本按经史子集排开，翻页声、墨香与樟木味混在一处。",
    produce: [{ name: "书卷", base: 3 }],
    upkeep: 10,
  },
  曲谱库: {
    kind: "scripture",
    note: "音修传承，听曲可清心神。",
    scene: "屋里挂着琴与笛，谱册摊在案上，偶有人试音，一声清越透窗而出。",
    produce: [{ name: "书卷", base: 2 }],
    reputation: 1,
    upkeep: 10,
  },
  和纸窖: {
    kind: "scripture",
    note: "符修的材料库，黄纸朱砂皆出于此。",
    scene: "窖里阴凉，墙上晾着黄纸，朱砂在石臼里研着，纸边被风吹得沙沙响。",
    produce: [{ name: "符纸", base: 4 }],
    upkeep: 8,
  },
  藏经阁: {
    kind: "scripture",
    note: "综合传承，各家皆可参，只是不如专门处快。",
    scene: "楼里各家的抄本都有，代抄的弟子伏案抄书，笔尖沙沙不歇。",
    produce: [{ name: "书卷", base: 4 }],
    upkeep: 12,
  },
  讲经堂: {
    kind: "scripture",
    note: "聚众听讲之地，一次可带多名弟子。",
    scene: "堂中蒲团成行，正中一张讲席，木鱼与铜磬搁在手边，人多却极静。",
    produce: [{ name: "书卷", base: 2 }],
    reputation: 1,
    upkeep: 8,
  },
  碑林: {
    kind: "scripture",
    note: "石刻门规与心得，拓碑可得威望。",
    scene: "松树间立着几十方石碑，碑面磨得发亮，拓包的墨迹还留在石缝里。",
    produce: [{ name: "书卷", base: 2 }],
    reputation: 1,
    upkeep: 6,
  },

  // 演武
  演武场: {
    kind: "martial",
    note: "日常操练之地，弟子战力在此长进。",
    scene: "青石铺的大场子，木桩、石锁、兵器架靠着墙，尘土被脚步踏得浮起来。",
    reputation: 1,
    upkeep: 12,
  },
  剑冢: {
    kind: "martial",
    note: "供着历代断剑，剑修常来挨那一身寒。",
    scene: "土坡上插满了断剑，风过时铮铮作响，剑身上凝着一层薄霜。",
    upkeep: 10,
  },
  试剑石: {
    kind: "martial",
    note: "劈石测战力，达标者授称号。",
    scene: "庭中一块青石，石面上横着几道深浅不一的剑痕。",
    reputation: 1,
    upkeep: 8,
  },
  木人巷: {
    kind: "martial",
    note: "机关训练，练身法与反应。",
    scene: "窄巷两侧排着木人桩，机括绳结缠得密，进去便无处不挨打。",
    upkeep: 8,
  },
  擂台: {
    kind: "martial",
    note: "公开比试之地，赢可得贡献与声望。",
    scene: "四角立着柱子，台面被踩得发白，台下站着看热闹的门人与来客。",
    stone: 20,
    reputation: 1,
    upkeep: 14,
  },

  // 丹房
  炼丹房: {
    kind: "alchemy",
    note: "通用丹炉，昼夜不熄。",
    scene: "丹炉七座，地火从炉底引上来，炉口泛着暗红，药味冲得人眼睛发涩。",
    produce: [{ name: "丹药", base: 3 }],
    upkeep: 15,
  },
  药王谷: {
    kind: "alchemy",
    note: "药圃与丹房合一，药材产量极高。",
    scene: "半谷的药圃沿坡铺开，丹房搭在圃边，晒药架上一片青黄。",
    produce: [{ name: "药材", base: 6 }, { name: "丹药", base: 2 }],
    upkeep: 18,
  },
  万毒潭: {
    kind: "alchemy",
    note: "浸体练毒之处，毒修涨功体。",
    scene: "潭水泛着青黑，潭边摆着陶瓮与竹篓，空气里有股腥甜的冷气。",
    produce: [{ name: "蛊虫", base: 2 }],
    upkeep: 12,
  },
  蛊窟: {
    kind: "alchemy",
    note: "养蛊之地，蛊兼作战力与探路之用。",
    scene: "洞里潮暗，一排陶罐架在石台上，罐口封着布，偶尔传出细碎的爬动声。",
    produce: [{ name: "蛊虫", base: 3 }],
    upkeep: 12,
  },
  药庐: {
    kind: "alchemy",
    note: "小型丹房，供基础丹药与疗伤。",
    scene: "小屋一间，药柜顶到梁上，药碾子、药筛与瓦罐摆得随手可取。",
    produce: [{ name: "丹药", base: 1 }],
    upkeep: 6,
  },
  丹库: {
    kind: "alchemy",
    note: "丹药的存储与配给处。",
    scene: "架上分格码着丹瓶，瓶口贴着签子，账册摊在案头，进出一笔笔都记着。",
    produce: [{ name: "丹药", base: 1 }],
    upkeep: 5,
  },

  // 锻器
  铸器炉: {
    kind: "forge",
    note: "地火引上来的老炉，出品格外利。",
    scene: "老炉半嵌在土里，风箱一拉，火光从炉口扑出来，铁砧上溅着火星。",
    produce: [{ name: "兵器", base: 2 }, { name: "矿石", base: 2 }],
    upkeep: 15,
  },
  锻刀场: {
    kind: "forge",
    note: "名刀产地，刀修专属。",
    scene: "长条形的工棚，炉子一字排开，淬火的水槽蒸着白气，刀坯挂在梁上。",
    produce: [{ name: "兵器", base: 3 }],
    upkeep: 16,
  },
  镔铁矿: {
    kind: "forge",
    note: "产镔铁，打出的刀能削人兵刃。",
    scene: "矿洞开在半山，洞口堆着带暗纹的矿石，矿车沿窄轨进出，石头敲得当当响。",
    produce: [{ name: "镔铁", base: 4 }],
    upkeep: 14,
  },
  寒铁矿: {
    kind: "forge",
    note: "产寒铁，兵刃附寒气。",
    scene: "矿脉生在阴处岩缝里，触手冰凉，取出的矿石上结着一层白霜。",
    produce: [{ name: "寒铁", base: 4 }],
    upkeep: 14,
  },
  锻铁铺: {
    kind: "forge",
    note: "基础修补与低阶兵器。",
    scene: "铺面不大，炉子、砧子、钳子各在其位，墙角堆着待修的旧兵器。",
    produce: [{ name: "兵器", base: 1 }, { name: "熟铁", base: 3 }],
    upkeep: 8,
  },
  料场: {
    kind: "forge",
    note: "矿木堆场，存着门中的料。",
    scene: "露天的场子，矿石、木料、炭堆各占一角，账房在棚下称料记数。",
    produce: [{ name: "矿石", base: 5 }],
    upkeep: 6,
  },

  // 灵脉
  活灵脉: {
    kind: "spirit",
    note: "山底一条活脉，打坐比别家快三分。",
    scene: "石壁下涌出一线灵泉，泉边蒲团摆得端正，静得能听见水滴落石的声音。",
    stone: 25,
    upkeep: 10,
  },
  水脉泉眼: {
    kind: "spirit",
    note: "水气养人，兼可疗伤。",
    scene: "泉水从岩缝里渗出来，汇成一小汪清池，水面常年浮着薄雾。",
    produce: [{ name: "药材", base: 2 }],
    stone: 10,
    upkeep: 10,
  },
  灵鲤池: {
    kind: "spirit",
    note: "养灵鲤，喂熟可替人下水探路。",
    scene: "石砌的方池，锦鲤色的灵鲤在水下游动，撒一把食便涌到岸边。",
    produce: [{ name: "药材", base: 1 }],
    stone: 8,
    upkeep: 8,
  },
  绿洲泉: {
    kind: "spirit",
    note: "商道唯一活水，供全门消耗。",
    scene: "沙地当中一汪活水，四周种着耐旱的草木，水桶与陶缸排在泉边。",
    produce: [{ name: "蔬菜", base: 2 }],
    stone: 10,
    upkeep: 10,
  },
  引灵泉: {
    kind: "spirit",
    note: "引灵入体，低阶弟子修炼用。",
    scene: "泉眼被石栏围着，栏上刻着引灵的纹路，低阶弟子排队候在栏外。",
    stone: 15,
    upkeep: 8,
  },

  // 灵田
  百亩药圃: {
    kind: "farm",
    note: "药材主产地。",
    scene: "药圃一垄垄排开，田头插着写药名的木牌，锄头与竹筐搁在地边。",
    produce: [{ name: "药材", base: 6 }],
    upkeep: 8,
  },
  香料园: {
    kind: "farm",
    note: "产香料，作丹药辅料与贸易品。",
    scene: "园里种着各式香料，风一过便是辛香，晒架上一片碎金似的颜色。",
    produce: [{ name: "香料", base: 5 }],
    upkeep: 8,
  },
  灵田: {
    kind: "farm",
    note: "产灵谷，供全门伙食。",
    scene: "水田平铺到坡下，灵谷将熟，穗子压得低低的，田埂上立着稻草人。",
    produce: [{ name: "灵谷", base: 8 }],
    upkeep: 6,
  },
  菜圃: {
    kind: "farm",
    note: "产蔬菜，低成本养弟子。",
    scene: "菜畦整齐，萝卜白菜都精神，篱上爬着藤，浇水的桶放在井边。",
    produce: [{ name: "蔬菜", base: 6 }],
    upkeep: 4,
  },

  // 灵苑
  白鹿苑: {
    kind: "beast",
    note: "养白鹿，产鹿茸入药。",
    scene: "围栏圈着草坡，白鹿散在其间，见人来了也不惊，只抬一抬头。",
    produce: [{ name: "鹿茸", base: 3 }],
    upkeep: 10,
  },
  雪狐谷: {
    kind: "beast",
    note: "养雪狐，毛皮御寒、血入药。",
    scene: "谷里积着雪，雪狐从洞里探出头来，尾巴一甩又缩了回去。",
    produce: [{ name: "皮毛", base: 3 }],
    upkeep: 10,
  },
  狼群: {
    kind: "beast",
    note: "养狼群，号角一响随之冲阵。",
    scene: "栅栏里是一群狼，眼睛在暗处亮着，喂食时低低地吼。",
    produce: [{ name: "兽材", base: 3 }],
    upkeep: 12,
  },
  兽栏: {
    kind: "beast",
    note: "通用兽栏，养常兽与坐骑。",
    scene: "棚舍与围栏相连，常兽与坐骑各占一格，草料堆在栏外。",
    produce: [{ name: "兽材", base: 2 }],
    upkeep: 8,
  },

  // 阵法
  护山大阵: {
    kind: "array",
    note: "宗门防御核心，外敌来犯时生效。",
    scene: "阵眼凿在山门后的石台上，符文一圈圈刻出去，风过时纹路微微发亮。",
    reputation: 1,
    upkeep: 20,
  },
  律令碑: {
    kind: "array",
    note: "刻门规，提门规权威。",
    scene: "一人高的石碑立在庭中，碑面刻着门规，字口里填着朱砂。",
    reputation: 1,
    upkeep: 8,
  },
  星图台: {
    kind: "array",
    note: "观星占卜，预判事件。",
    scene: "高台无顶，台面刻着星图与盘针，夜里可仰观，白日留着测影的木杆。",
    stone: 15,
    upkeep: 12,
  },
  铜鼓台: {
    kind: "array",
    note: "鼓响召集全寨，提士气。",
    scene: "台上一面铜鼓，鼓面泛着铜绿，鼓槌悬在架上，边上是祭祀用的案。",
    reputation: 1,
    upkeep: 10,
  },
  阵基: {
    kind: "array",
    note: "通用阵眼，布小阵作基础防护。",
    scene: "石砌的阵基埋在半地下，锁链与符钉连着四方，草从缝里钻出来。",
    upkeep: 6,
  },
  传功台: {
    kind: "array",
    note: "长老在此批量传功给弟子。",
    scene: "台子不高，四周围着蒲团，长老立于台中，手指虚点便能引气入体。",
    upkeep: 10,
  },

  // 居所
  画舫: {
    kind: "housing",
    note: "湖心宴客论道，涨声望。",
    scene: "一艘画舫泊在湖心，舱里摆着矮几与酒器，船娘撑篙，水声拍着船板。",
    stone: 10,
    reputation: 2,
    upkeep: 12,
  },
  汤泉: {
    kind: "housing",
    note: "疗伤养气静心。",
    scene: "石砌的汤池冒着热气，池边放着木屐与竹舀，水面上浮着几片花瓣。",
    upkeep: 10,
  },
  温泉: {
    kind: "housing",
    note: "雪窝热泉，伤病理疗恢复快。",
    scene: "雪窝里一汪热泉，热气腾腾，池边结着霜，池内却暖得人骨头都松了。",
    upkeep: 10,
  },
  弟子厢房: {
    kind: "housing",
    note: "基础住宿，决定弟子容量。",
    scene: "一排厢房连着通铺，被褥叠得整齐，墙上挂着各自的佩剑与行囊。",
    upkeep: 5,
  },
  斋堂: {
    kind: "housing",
    note: "伙食与集会之地。",
    scene: "长条桌凳摆了十几张，灶上蒸着灵谷饭，碗筷与木勺摞在案上。",
    produce: [{ name: "灵谷", base: 1 }],
    upkeep: 6,
  },
  客舍: {
    kind: "housing",
    note: "招待来客，接引来投之人。",
    scene: "客舍十几间，廊下挂着灯笼，来客的行囊堆在门边，伙计穿梭其间。",
    stone: 8,
    reputation: 1,
    upkeep: 8,
  },
};

/** 一座建筑立在哪一格、属哪一类 */
export interface FacilityInstance {
  cellIndex: number;
  kindId: FacilityKindId;
  kindName: string;
  name: string;
}

/**
 * 取一座建筑的账；名录里没有的按类别通用账面算。
 * 自建的那几座另存一份账在宗门点位上，给了就照它自己的算。
 */
export function facilityInfo(name: string, kindId?: FacilityKindId, custom?: CustomFacility): FacilityInfo {
  if (custom) return { kind: custom.kindId, ...custom.info };
  const found = FACILITIES[name];
  if (found) return found;
  const kind = kindId ?? "housing";
  return {
    kind,
    note: "门中一处寻常建筑。",
    scene: `门中一处寻常屋舍，叫「${name}」，门扉半掩，里头有人走动。`,
    upkeep: 6,
  };
}

/** 这座建筑能做的几件事 */
export function facilityActions(
  name: string,
  kindId?: FacilityKindId,
  custom?: CustomFacility,
): FacilityAction[] {
  const override = ACTIONS_OVERRIDE[name];
  if (override) return override;
  const info = facilityInfo(name, kindId, custom);
  return ACTIONS_BY_KIND[info.kind] ?? [];
}

/** 建筑等级折出来的倍数：Lv.1 为一倍，每升一级加半倍，满级三倍 */
export function levelFactor(level: number): number {
  return 1 + (Math.max(1, Math.min(FACILITY_LEVEL_CAP, level)) - 1) * 0.5;
}

/** 宗门性质偏重哪几类建筑：这些类的产出与升级都占便宜 */
const NATURE_KIND_BONUS: Record<string, FacilityKindId[]> = {
  sword: ["martial", "forge"],
  blade: ["martial", "forge"],
  kendo: ["martial", "forge"],
  body: ["martial"],
  wrestle: ["martial"],
  archer: ["martial"],
  kyudo: ["martial"],
  law: ["array", "scripture"],
  array: ["array"],
  onmyo: ["array", "scripture"],
  rite: ["hall", "scripture"],
  talisman: ["scripture"],
  lettering: ["scripture"],
  music: ["scripture", "housing"],
  alchemy: ["alchemy", "farm"],
  herbal: ["alchemy", "farm"],
  healer: ["alchemy", "farm"],
  gu: ["alchemy", "beast"],
  poison: ["alchemy", "beast"],
  artifact: ["forge"],
  forge: ["forge"],
  beast: ["beast"],
  shaman: ["beast", "array"],
  frost: ["forge", "beast", "housing"],
  star: ["array"],
};

/** 这一类建筑吃不吃本门性质的偏重 */
export function natureFavours(nature: string | undefined, kindId: FacilityKindId): boolean {
  return !!nature && (NATURE_KIND_BONUS[nature] ?? []).includes(kindId);
}

/** 性质偏重的产出加成 */
const NATURE_YIELD_BONUS = 0.25;
/** 性质偏重的升级折扣 */
const NATURE_UPGRADE_DISCOUNT = 0.8;
/** 镇门之宝的产出加成 */
const FEATURE_YIELD_BONUS = 1;

/** 一处建筑日产的账：材料、灵石、声望 */
export function facilityYield(args: {
  name: string;
  kindId: FacilityKindId;
  level: number;
  status: FacilityStatus;
  hasSteward: boolean;
  nature?: string;
  /** 这一座是不是本门的镇门之宝 */
  isFeature?: boolean;
  /** 自建的建筑另存的那一份账 */
  custom?: CustomFacility;
}): FacilityYield {
  const { name, kindId, level, status, hasSteward, nature, isFeature, custom } = args;
  if (status === "停用") return { materials: [], stone: 0, reputation: 0 };

  const info = facilityInfo(name, kindId, custom);
  let factor = levelFactor(level);
  if (status === "修缮中") factor *= REPAIRING_FACTOR;
  if (!hasSteward) factor *= STEWARD_MISSING_FACTOR;
  if (natureFavours(nature, kindId)) factor *= 1 + NATURE_YIELD_BONUS;
  if (isFeature) factor *= 1 + FEATURE_YIELD_BONUS;

  return {
    materials: (info.produce ?? []).map((p) => ({ name: p.name, amount: Math.max(1, Math.round(p.base * factor)) })),
    stone: Math.round((info.stone ?? 0) * factor),
    reputation: Math.round((info.reputation ?? 0) * factor),
  };
}

/** 升级到下一级要的灵石与材料 */
export function upgradeCost(args: {
  name: string;
  kindId: FacilityKindId;
  level: number;
  nature?: string;
  custom?: CustomFacility;
}): { stones: number; materials: { name: string; amount: number }[] } {
  const { name, kindId, level, nature, custom } = args;
  const info = facilityInfo(name, kindId, custom);
  const discount = natureFavours(nature, kindId) ? NATURE_UPGRADE_DISCOUNT : 1;
  const stones = Math.round((200 * level + 100) * discount);
  const main = info.produce?.[0]?.name;
  const materials = main ? [{ name: main, amount: Math.max(2, level * 3) }] : [];
  return { stones, materials };
}

/** 每日维护费 */
export function facilityUpkeep(
  name: string,
  kindId: FacilityKindId,
  level: number,
  custom?: CustomFacility,
): number {
  const info = facilityInfo(name, kindId, custom);
  return Math.round(info.upkeep * (1 + (Math.max(1, level) - 1) * 0.3));
}

// ---------------- 营造：在荒地上新立一座 ----------------

/**
 * 各类建筑的营造层级：层级越高，越壮大的门户才撑得起。
 * 居所、灵田、灵脉、经阁是过日子的底子，一级门户便能起；
 * 演武、锻器、丹房要二级；灵苑、阵法、主殿最费，须三级。
 */
const KIND_BUILD_TIER: Record<FacilityKindId, number> = {
  housing: 1,
  farm: 1,
  spirit: 1,
  scripture: 1,
  martial: 2,
  forge: 2,
  alchemy: 2,
  beast: 3,
  array: 3,
  hall: 3,
};

/** 营造用料的底子：砖石木料一类的常料，各门都囤得下 */
const BUILD_MATERIAL = "矿石";

/** 营造层级 → 要求的宗门品级 */
export function buildSectLevelNeed(tier: number): number {
  return Math.max(1, Math.trunc(tier) || 1);
}

/** 自建建筑的账目上下限：数目一概夹住，免得拟出离谱的数 */
const CUSTOM_COST_MAX = 20000;
const CUSTOM_STONE_MAX = 2000;
const CUSTOM_REPUTATION_MAX = 200;
const CUSTOM_UPKEEP_MAX = 500;
const CUSTOM_PRODUCE_MAX = 6;
const CUSTOM_MATERIAL_MAX = 4;

const clampNum = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * 把拟出来的一份自建建筑账理一理。
 * 类别认不出、说明为空的一律作废，返回 null 由调用方丢开；
 * 名目与数目都夹在自己的区间里，效力落在程序认得的几项上。
 */
export function clampCustomFacility(raw: unknown, name?: string): CustomFacility | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const readStr = (v: unknown) => String(v ?? "").trim();
  const readNum = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
  const asObj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {};

  const kindId = readStr(r.kindId) as FacilityKindId;
  if (!(kindId in KIND_BUILD_TIER)) return null;

  const info = asObj(r.info);
  const note = readStr(info.note).slice(0, 60);
  if (!note) return null;

  const produce = (Array.isArray(info.produce) ? info.produce : [])
    .map((p) => {
      const o = asObj(p);
      return { name: readStr(o.name).slice(0, 12), base: clampNum(readNum(o.base), 1, 200) };
    })
    .filter((p) => !!p.name)
    .slice(0, CUSTOM_PRODUCE_MAX);

  const costObj = asObj(r.cost);
  const materials = (Array.isArray(costObj.materials) ? costObj.materials : [])
    .map((m) => {
      const o = asObj(m);
      return { name: readStr(o.name).slice(0, 12), amount: clampNum(readNum(o.amount), 1, 999) };
    })
    .filter((m) => !!m.name)
    .slice(0, CUSTOM_MATERIAL_MAX);

  return {
    kindId,
    cost: {
      stones: clampNum(readNum(costObj.stones), 0, CUSTOM_COST_MAX),
      materials,
    },
    effect: readStr(r.effect).slice(0, 60) || undefined,
    info: {
      note,
      scene: readStr(info.scene).slice(0, 120) || `门中一处新起的屋舍，叫「${readStr(name) || "此处"}」。`,
      produce: produce.length > 0 ? produce : undefined,
      stone: clampNum(readNum(info.stone), 0, CUSTOM_STONE_MAX),
      reputation: clampNum(readNum(info.reputation), 0, CUSTOM_REPUTATION_MAX),
      upkeep: clampNum(readNum(info.upkeep), 0, CUSTOM_UPKEEP_MAX),
    },
  };
}

/** 新立一座要的灵石与材料；比修缮头一级略贵，毕竟是平地起楼 */
export function buildCost(args: {
  name: string;
  kindId: FacilityKindId;
  nature?: string;
}): { stones: number; materials: { name: string; amount: number }[] } {
  const { kindId, nature } = args;
  const tier = KIND_BUILD_TIER[kindId] ?? 1;
  const discount = natureFavours(nature, kindId) ? NATURE_UPGRADE_DISCOUNT : 1;
  const stones = Math.round((300 + tier * 400) * discount);
  const materials = [{ name: BUILD_MATERIAL, amount: 4 + tier * 4 }];
  return { stones, materials };
}

/** 营造时列在案上的一座建筑：名目、类别、耗费与解锁条件 */
export interface SectBuildOption {
  name: string;
  culture: string;
  kindId: FacilityKindId;
  kindName: string;
  cost: { stones: number; materials: { name: string; amount: number }[] };
  /** 要求的宗门品级 */
  minSectLevel: number;
  /** 眼下宗门品级够不够 */
  unlocked: boolean;
}

/**
 * 眼下能在荒地上新立哪些建筑。
 * 按类别分档：门户品级不够的先立在案上，标记未解锁，好让人知道该往哪儿使劲。
 */
export function buildOptions(args: { sectLevel: number; nature?: string }): SectBuildOption[] {
  const level = Math.max(1, Number(args.sectLevel) || 1);
  return allSectBuildings().map((b) => {
    const tier = KIND_BUILD_TIER[b.kind] ?? 1;
    const minSectLevel = buildSectLevelNeed(tier);
    return {
      name: b.name,
      culture: b.culture,
      kindId: b.kind,
      kindName: getSectTileKind(sectTileCode(b.kind)).name,
      cost: buildCost({ name: b.name, kindId: b.kind, nature: args.nature }),
      minSectLevel,
      unlocked: level >= minSectLevel,
    };
  });
}

/**
 * 一座建筑由哪一堂管事。
 * 各堂的名号里带上这一类地块的字眼便算对上，堂主即是管事的；
 * 对不上便算无主，产出照折。
 */
const KIND_HALL_WORDS: Record<FacilityKindId, string[]> = {
  hall: ["主殿", "议事", "掌"],
  scripture: ["经", "书", "文"],
  martial: ["武", "演武", "战"],
  alchemy: ["丹", "药"],
  forge: ["器", "铸", "锻", "铁"],
  spirit: ["灵脉", "静", "修"],
  farm: ["田", "农", "圃"],
  beast: ["兽", "苑", "灵兽"],
  array: ["阵", "符", "律"],
  housing: ["客", "居", "斋", "礼"],
};

export function facilitySteward(halls: SectHall[] | undefined, kindId: FacilityKindId): string | undefined {
  const list = Array.isArray(halls) ? halls : [];
  const words = KIND_HALL_WORDS[kindId] ?? [];
  const hit = list.find((h) => h && h.name && words.some((w) => h.name.includes(w)));
  const master = hit && typeof hit.master === "string" ? hit.master.trim() : "";
  return master || undefined;
}

/**
 * 由一张宗门图算出院里立着哪些建筑，与地图渲染同一套排布。
 * 返回按格序排开的一串，非建筑格略去。
 */
export function facilityRoster(scene: MapScene | undefined): FacilityInstance[] {
  if (!scene || (scene.tiles?.length ?? 0) === 0) return [];
  const { layout, buildings } = sectMapLayout(scene);
  const roster: FacilityInstance[] = [];
  buildings.forEach((b, cellIndex) => {
    if (!b) return;
    const kind = getSectTileKind(layout[cellIndex]);
    roster.push({
      cellIndex,
      kindId: kind.id as FacilityKindId,
      kindName: kind.name,
      name: b.name,
    });
  });
  return roster;
}

/** 建筑当前状态；存档里没有便按新立的一座算 */
export function facilityStateOf(
  saved: Record<string, SectFacilityState> | undefined,
  name: string,
): SectFacilityState {
  const entry = saved?.[name];
  return {
    level: Math.max(1, Math.min(FACILITY_LEVEL_CAP, Number(entry?.level) || 1)),
    status: entry?.status ?? "正常",
  };
}

// ---------------- 叙事与对局要用的一点现算 ----------------

/** 拼一句交给叙事的行止；建筑、事项与所选参数都写进去，好让叙事接着演 */
export function facilityDecision(args: {
  building: string;
  kindName: string;
  action: FacilityAction;
  optionLabel?: string;
  playerName?: string;
  playerPosition?: string;
  sectName?: string;
}): string {
  const { building, kindName, action, optionLabel, playerName, playerPosition, sectName } = args;
  const seat = playerPosition ? `门中${playerPosition}` : "门中弟子";
  const where = sectName ? `${sectName}的` : "";
  const how = optionLabel ? `，${action.optionLabel}是「${optionLabel}」` : "";
  return `我以${seat}的身份，在${where}${building}（属${kindName}）做一件事：${action.name}${how}。`;
}

/** 门中一位可约的同门 */
export interface FacilityOpponent {
  name: string;
  /** 交给决战的一段写照 */
  note: string;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  attack: number;
  defense: number;
  speed: number;
}

const RANDOM_FOES: { name: string; note: string }[] = [
  { name: "游方剑客", note: "背一柄旧剑，自称走遍九州，见谁都想试一试。" },
  { name: "外门散修", note: "无门无派，一身本事全靠自己摸出来的。" },
  { name: "山下来客", note: "风尘仆仆，说是路过，眼睛却总往演武场瞟。" },
  { name: "镖行好手", note: "押镖多年的练家子，手上有些真功夫。" },
  { name: "同道的弟子", note: "别家山门打发来的后生，奉命来讨教一场。" },
  { name: "山匪余党", note: "前番被打散的那伙人里漏网的一个，寻上门来。" },
];

const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * 现掷一位对手。
 * random 是山门外来的不速之客，peer 是门里的同门——同门若在尘缘里记着，
 * 就照他的底细来，不然照你的身手估一个。
 */
export function rollSectOpponent(args: {
  kind: "random" | "peer";
  realmIndex: number;
  peers?: { name: string; note?: string }[];
}): FacilityOpponent {
  const { kind, realmIndex, peers } = args;
  const base = 60 + Math.max(0, realmIndex) * 22;
  const peer = kind === "peer" && peers && peers.length > 0 ? pickOne(peers) : undefined;
  const fallback = pickOne(RANDOM_FOES);
  const name = peer?.name ?? fallback.name;
  const note = peer?.note ?? fallback.note;
  const scale = peer ? 1 : 0.9 + Math.random() * 0.4;
  const hpMax = Math.round(base * scale);
  return {
    name,
    note,
    hp: hpMax,
    hpMax,
    mp: 40,
    mpMax: 40,
    attack: Math.round((10 + Math.max(0, realmIndex) * 4) * scale),
    defense: Math.round((6 + Math.max(0, realmIndex) * 3) * scale),
    speed: Math.round((8 + Math.max(0, realmIndex) * 2) * scale),
  };
}

/** 还没参过的传承；经阁里挑的便是这几门 */
export function studyableHeritage(heritage: SectHeritage[] | undefined): SectHeritage[] {
  return (Array.isArray(heritage) ? heritage : []).filter((h) => h && h.name && h.status !== "已习");
}

// ---------------- 宗门的进项与家底 ----------------

/** 各料的行价：一件换几枚下品灵石；表外的按底价走 */
const MATERIAL_PRICE: Record<string, number> = {
  药材: 2,
  灵谷: 1,
  蔬菜: 1,
  矿石: 3,
  熟铁: 2,
  镔铁: 6,
  寒铁: 6,
  兵器: 14,
  丹药: 12,
  符纸: 3,
  书卷: 4,
  香料: 5,
  蛊虫: 6,
  鹿茸: 8,
  皮毛: 5,
  兽材: 6,
};

/** 表外的料按这个价算 */
const DEFAULT_MATERIAL_PRICE = 2;

/** 一件料值几枚下品灵石 */
export function materialPrice(name: string): number {
  return MATERIAL_PRICE[name] ?? DEFAULT_MATERIAL_PRICE;
}

/**
 * 各料留存的底数。超出的算多余，日结时自行发卖换灵石——
 * 门里囤着用不上的东西，不如换些现钱。
 */
export const MATERIAL_SURPLUS_KEEP = 80;

/**
 * 开局给宗门备下的家底：一笔灵石与几样过日子的料。
 * 数额照门中品级与人数来定，免得新立的门户一开门便无钱可用。
 */
export function initialEndowment(args: {
  level: number;
  disciples: number;
  elders: number;
}): { stones: number; materials: { name: string; amount: number }[] } {
  const level = Math.max(1, Number(args.level) || 1);
  const disciples = Math.max(0, Number(args.disciples) || 0);
  const elders = Math.max(0, Number(args.elders) || 0);
  return {
    stones: 1200 + level * 600 + disciples * 40 + elders * 120,
    materials: [
      { name: "灵谷", amount: 40 + disciples * 2 },
      { name: "蔬菜", amount: 20 + disciples },
      { name: "药材", amount: 20 },
      { name: "矿石", amount: 20 },
    ],
  };
}
