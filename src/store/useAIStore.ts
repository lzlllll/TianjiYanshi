import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AISettings,
  ConversationState,
  GenStage,
  Turn,
  NPCChatState,
  NPCGroupMessage,
  NPCProfile,
  NPCMessage,
  Relation,
  BattleState,
  BattleMap,
  BattleEntity,
  BattleEntityBuff,
  BattleAftermath,
  BattleLootItem,
  CraftingResult,
  CraftingContext,
  ManorProbeArgs,
  GateAskArgs,
  GateOutcome,
  ShopProbeArgs,
  FacilityNarrativeArgs,
  HaggleArgs,
  DineArgs,
  DineResult,
  LodgeArgs,
  LodgeResult,
  PlayArgs,
  AppraiseArgs,
  AppraiseResult,
  EscortArgs,
  EscortResult,
  CraftOffer,
  NPCScene,
  QuestBroker,
  Adventure,
  AdventureChoice,
  Auction,
  AdventureLine,
  Technique,
  SectSite,
  SectWarBrief,
  BattleFoeBrief,
  HaggleBrief,
  ShopBrief,
  NarrativeEntry,
  SkillCheck,
} from "@/data/types";
import { useGameStore } from "@/store/useGameStore";
import { dishBuff, randomDish } from "@/data/dishes";
import { attachQuestCarryItem, normalizeQuest, parseQuestKind, parseQuestOutcome, questItemGoalLabel, questRealmGoalLabel, questStoneGoalLabel } from "@/data/quests";
import { buffCatalogBrief, buffFromTemplate, findBuffTemplate } from "@/data/buffs";
import { effectiveHpMax } from "@/lib/buffUtils";
import {
  battleStaminaMax,
  effectiveAttributes,
  movementLimit,
  MOVE_STAMINA_COST,
  staminaRegen,
} from "@/lib/attributes";
import { LOCATIONS } from "@/data/locations";
import { findFirstMarkerInText, getCityMarkers, getDistricts, getMarker } from "@/data/map";
import { ESCORT_DAYS_RANGE, ESCORT_FEE_RANGE, clampEscort } from "@/data/escort";
import { clampCraftOffer, CRAFT_DAYS_RANGE, CRAFT_PRICE_RANGE } from "@/data/craftsmen";
import { normalizePact } from "@/data/pacts";
import { reputationBrief } from "@/data/reputation";
import { beastBrief } from "@/data/beast";
import { PLAYER_SHOP_KINDS, shopMonthlyExpense, shopMonthlyIncome } from "@/data/playerShops";
import { lodgeDurationLabel } from "@/data/rooms";
import type { CustomFacility, ShopBusiness, ShopFacility, ShopGood, ShopKind } from "@/data/types";
import { clampCustomFacility } from "@/data/sectFacilities";
import { pinNarrativeQuest } from "@/data/broker";
import { sectNameCore } from "@/data/sectSites";
import { OPENING_GAME_TIME, daySerial, formatGameTime, gameDateKey, timeSerial } from "@/lib/gameTime";
import { advanceIncense } from "@/lib/battleTime";
import { chatWithModel, chatWithModelStream, isReasoningSlot } from "@/lib/aiClient";
import type { DataOp, GameState } from "@/data/types";
import {
  buildDataSchema,
  buildFlashPrompt,
  buildOpsExtractionPrompt,
  OPS_REPAIR_INSTRUCTION,
  buildOpeningDomainPrompt,
  buildOpeningPlacePrompt,
  buildProPrompt,
  buildCompressionPrompt,
  parseFlashDecision,
  resolveRelevantData,
  opBelongsToDomain,
  canonicalCollection,
  OPENING_DOMAINS,
  buildNewsReportPrompt,
  buildMartialArtsPrompt,
  buildNpcTickPrompt,
  buildBuskingPrompt,
  buildEstateDealPrompt,
  buildCropPrompt,
  buildRentOutPrompt,
  buildShopManagePrompt,
  buildShopSetupPrompt,
  buildSectBuildPrompt,
  buildEndingAppraisalPrompt,
  buildEscapePrompt,
  buildFatePrompt,
  buildSurrenderPrompt,
  buildBattleIntentPrompt,
  buildForestExplorePrompt,
  buildClosedPlacePrompt,
  bondLabel,
  type NewsReportParams,
  type BuskBrief,
  type EstateDealBrief,
  type RentOutBrief,
  type ShopManageBrief,
  type ShopSetupBrief,
  type SectBuildBrief,
  type EscapeBrief,
  type FateBrief,
  type SurrenderBrief,
} from "@/lib/promptBuilder";
import { parseJsonOps, parseJsonPayload, parseModelOutput, summarizeOps } from "@/lib/dataOps";
import { buildCatalogText } from "@/data/dataCatalog";
import { applyBattleCast, computeSkillCast, computableSkills, findSkillByName, findSkillMentionedIn, isHeartConversion, resolveBattleTarget, techniqueLevelOf, type CombatActor } from "@/lib/skillCalc";
import { enemiesInRange, rangeLabel, skillRange } from "@/data/battleRange";
import { facingOf, strikeAngle } from "@/lib/battleFacing";
import { styleMatchup, techniqueStyleOf } from "@/data/combatStyles";
import { isNpcAround, isNpcLocationKnown, migrateRelation, relationTags } from "@/data/npcGen";
import { REALMS, REALM_NAMES, canTalkTo } from "@/data/mockData";
import {
  EVENT_END_MARK,
  EVENT_QUICK_MARK,
  ADVENTURE_DONE_MARK,
  ADVENTURE_KEEP_MARK,
  ADVENTURE_CHOICE_MARK,
  FOREST_EVENT_MARK,
  buildRandomEventPrompt,
  buildRandomEventReplyPrompt,
  buildAdventureOpeningPrompt,
  buildAdventureReplyPrompt,
  buildAdventureSpawnPrompt,
  buildTaskNpcPrompt,
  buildAuctionOpenPrompt,
  buildAuctionClosePrompt,
  PROSE_STYLE,
  type AdventureBrief,
  type EventPlayerBrief,
} from "@/lib/promptBuilder";
import {
  ADVENTURE_OPEN_MAX,
  adventureWhere,
  isPresetFree,
  nearestCityIdOf,
  normalizeAdventure,
  openAdventures,
  pickAdventureSpot,
  pickAdventureSpotNear,
} from "@/data/adventures";
import {
  AUCTION_MAX_OPEN,
  AUCTION_NOTICE_DAYS,
  applyPlayerBid,
  applyPlayerPass,
  auctionHammered,
  auctionLeaderName,
  auctionNextBid,
  findTreasureShop,
  lotItemType,
  normalizeAuctionBidders,
  normalizeAuctionLot,
  rollAuctionReason,
} from "@/data/auction";
import { lowStonesWorth, spendLowStones } from "@/data/spiritStones";
import {
  RECENT_WINDOW,
  clampSummary,
  needsCompression,
  recentForPrompt,
  splitForCompression,
} from "@/lib/contextCompressor";
import { recordNarrative } from "@/lib/narrativeLog";
import { reviewNarrative, scanNarrativeRisk } from "@/lib/contentSafety";
import { DEFAULT_BGM_VOLUME } from "@/lib/bgm";
import { aiReady, hasCustomApi } from "@/data/backend";
import { FREE_MODEL } from "@/data/aiQuota";

const DEFAULT_SETTINGS: AISettings = {
  // 自定义接口默认留空，一律走后端；模型名默认即免费模型
  baseUrl: "",
  apiKey: "",
  flashModel: FREE_MODEL.model,
  proModel: FREE_MODEL.model,
  // 是不是带思维链的推理模型，默认由模型名与运行时表现自行判断
  flashReasoning: "auto",
  proReasoning: "auto",
  // 思考参数默认自动认：换模型后思考停不下来时，可在设置里手动指一家
  thinkingStyle: "auto",
  temperature: 1,
  customPrompt: "",
  // 默认不留全程正文：省些体积，要回看或导出时再开
  keepFullNarrative: false,
  // 背景音乐默认关闭，可在设置里再开
  bgmVolume: DEFAULT_BGM_VOLUME,
  // 界面字号默认原大
  fontScale: 1,
};

/** 叙事那一档的总时限：非推理档两分钟够用，推理档先长一段思考才落笔，留宽一档 */
const PRO_TIMEOUT_MS = 120000;
const PRO_TIMEOUT_REASONING_MS = 300000;

function proTimeoutMs(settings: AISettings): number {
  return isReasoningSlot(settings, "pro") ? PRO_TIMEOUT_REASONING_MS : PRO_TIMEOUT_MS;
}

const INITIAL_CONVERSATION: ConversationState = {
  turns: [],
  summary: "",
  narrativeLog: [],
  stage: "idle",
  errorMsg: "",
  lastFlashDuration: 0,
  lastProDuration: 0,
  lastRawOutput: "",
  quickDecisions: [],
  pendingChatSummary: "",
  pendingCrafting: null,
  streamingNarrative: "",
  streamingReasoning: "",
  openingFiled: [],
  openingFeed: [],
  openingWarning: "",
};

const INITIAL_NPC_CHAT: NPCChatState = {
  profiles: [],
  activeNpcId: null,
  isTyping: false,
  errorMsg: "",
  pendingScene: null,
  partyIds: [],
  partyMessages: [],
  isPartyTyping: false,
  pendingCraft: null,
};

/**
 * 路上变故的那扇窗。
 * 开着的时候关不上——只能就着眼前这一桩应付过去，
 * 直到模型认了它已了结，或是开发者模式里强行收场。
 */
export interface RandomEventTurn {
  id: string;
  role: "event" | "player";
  content: string;
  /** 这一段落到账上的数据变化，末尾列一笔给人看 */
  ops?: DataOp[];
}

export interface RandomEventState {
  /** 窗开着没有 */
  active: boolean;
  /** 正在写、正在答，界面据此禁住输入 */
  busy: boolean;
  title: string;
  /** 开头那一段 */
  opening: string;
  /** 开头那一段落到账上的变化 */
  openingOps: DataOp[];
  /** 其后的往来 */
  turns: RandomEventTurn[];
  /** 模型给的几条应对选项，供玩家一键取用 */
  options: string[];
  /** 模型认了这桩已了，窗才准关 */
  resolved: boolean;
  /** 事由，续写时一并交回模型 */
  reason: string;
  errorMsg: string;
  /** 上一回开局的日子，用来定冷却 */
  openedDay: number;
}

const INITIAL_RANDOM_EVENT: RandomEventState = {
  active: false,
  busy: false,
  title: "",
  opening: "",
  openingOps: [],
  turns: [],
  options: [],
  resolved: false,
  reason: "",
  errorMsg: "",
  openedDay: 0,
};

/**
 * 奇遇那扇窗。
 * 与变故不同，它关得上——玩家可以随时抽身离去，那一处仍留在舆图上；
 * 只在了结（模型点了记号）时才分出去留：撤去，或留在此处日后再来。
 */
export interface AdventureState {
  active: boolean;
  busy: boolean;
  /** 眼下在哪一处奇遇里 */
  id: string;
  title: string;
  opening: string;
  /** 开头那一段落到账上的变化 */
  openingOps: DataOp[];
  turns: RandomEventTurn[];
  /** 模型认了这一处已了结 */
  resolved: boolean;
  /** 了结之后是留是撤 */
  keepAfter: boolean;
  /** 这一回模型备下的几个选择；没有便退回那三个老手段 */
  choices: AdventureChoice[];
  /** 只是翻看旧话，不作应对：从机缘面板点开已了结的那一处时用 */
  reading: boolean;
  errorMsg: string;
}

const INITIAL_ADVENTURE: AdventureState = {
  active: false,
  busy: false,
  id: "",
  title: "",
  opening: "",
  openingOps: [],
  turns: [],
  resolved: false,
  keepAfter: false,
  choices: [],
  reading: false,
  errorMsg: "",
};

/** 一席最多请几位；人再多，话就散了 */
export const MAX_PARTY_SIZE = 4;

/**
 * 宝物阁拍卖那一窗。
 * 拍品与来客是开场现写的，叫价由本地按来客的预算与性子推演，
 * 故这一扇窗只需记下开场那段光景与忙闲。
 */
export interface AuctionState {
  active: boolean;
  busy: boolean;
  /** 眼下在哪一场 */
  id: string;
  /** 开场那段光景：阁内陈设、来客落座、拍品抬上来 */
  opening: string;
  errorMsg: string;
}

const INITIAL_AUCTION: AuctionState = {
  active: false,
  busy: false,
  id: "",
  opening: "",
  errorMsg: "",
};

/**
 * 铺面里与人的往来正在写的那一段。
 * 各处窗口自行认 key，只认自己那一处；写完便收回，不留在存档里。
 */
export interface ShopStream {
  /** 哪一处在写：haggle、manageShop、dine、lodge、appraise、npc、party */
  key: string;
  /** 已经写出来的正文 */
  text: string;
  /** 思维链，只作「正在想」的提示 */
  reasoning: string;
}

const INITIAL_SHOP_STREAM: ShopStream = { key: "", text: "", reasoning: "" };

/**
 * 从还在写的那段 JSON 里抠出某个字符串字段的已写部分。
 * 店里的回话多半裹在 {"reply":"…"} 里，直接把 JSON 摆给玩家看不成样子。
 */
function partialStringField(raw: string, field: string): string {
  const at = raw.indexOf(`"${field}"`);
  if (at < 0) return "";
  const colon = raw.indexOf(":", at + field.length + 2);
  if (colon < 0) return "";
  const open = raw.indexOf('"', colon);
  if (open < 0) return "";
  let out = "";
  for (let i = open + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) break;
      out += next === "n" ? "\n" : next === "t" ? "\t" : next;
      i += 1;
      continue;
    }
    if (ch === '"') break;
    out += ch;
  }
  return out;
}

/**
 * 照奇遇名下记着的那一卷，把这扇窗摆回先前的样子。
 * reading 为真时只作翻看：不发新话、不列选择。
 */
function restoreAdventureState(adv: Adventure, reading: boolean): AdventureState {
  const journal: AdventureLine[] = Array.isArray(adv.journal) ? adv.journal : [];
  const head = journal[0]?.role === "event" ? journal[0] : undefined;
  const rest = head ? journal.slice(1) : journal;
  return {
    ...INITIAL_ADVENTURE,
    active: true,
    id: adv.id,
    title: adv.name,
    opening: head?.content || "",
    openingOps: head?.ops || [],
    turns: rest.map((line, i) => ({
      id: `adv-${adv.id}-${i}`,
      role: line.role,
      content: line.content,
      ops: line.ops,
    })),
    // 了结之后仍留在舆图上的那一处，日后还能再进；只有已经撤去的心思才不再续写
    resolved: adv.status === "done" && !adv.persistent,
    keepAfter: !!adv.persistent,
    choices: reading ? [] : Array.isArray(adv.choices) ? adv.choices : [],
    reading,
    errorMsg: "",
  };
}

/** 物件按要紧程度排：法宝、符箓、丹药在前，材料与杂物殿后 */
const ITEM_TYPE_RANK: Record<string, number> = { 法宝: 0, 符箓: 1, 丹药: 2, 灵兽: 3, 材料: 4, 杂物: 5 };
/** 同样的物件里，品阶高的先说 */
const ITEM_GRADE_RANK: Record<string, number> = { 仙品: 0, 天品: 1, 玄品: 2, 灵品: 3, 凡品: 4 };

/**
 * 最近几回的叙事，摘成一段话。
 * 战斗一开，问道里的正文便被战斗界面挡住了；推进战斗时把前因带上几段，
 * 模型才不至于忘了这一战是为着什么打起来的、对手是什么来历。
 */
function recentStoryBrief(turns: Turn[] | undefined, limit = 2, chars = 420): string {
  const list = (Array.isArray(turns) ? turns : []).filter((t) => t?.narrative);
  return list
    .slice(-limit)
    .map((t) => {
      const body = String(t.narrative).replace(/\s+/g, " ").trim();
      const cut = body.length > chars ? `${body.slice(0, chars)}……` : body;
      const input = String(t.playerInput ?? "").trim();
      return input ? `（你当时说：${input}）\n${cut}` : cut;
    })
    .join("\n\n");
}

/**
 * 变故提示词里的「玩家简要状况」。
 * 只报与拿捏分寸有关的几样：境界、身份、气血、伤势、身上的钱物与物件、
 * 所修功法、江湖上的名声、同行的人——写得粗，但够模型掂量这一趟的分量。
 */
function buildEventBrief(gs: GameState, place: string): EventPlayerBrief {
  const p = gs.player;
  const buffs = (Array.isArray(p.buffs) ? p.buffs : [])
    .filter((b) => b?.name)
    .map((b) => `${b.name}${Number(b.stacks) > 1 ? `·${b.stacks}重` : ""}`);
  const mates = (Array.isArray(gs.relations) ? gs.relations : [])
    .filter((r) => r?.traveling)
    .map((r) => r.name);

  // 内伤一类状态压低了此刻的气血上限，照实时报出去
  const hpMax = effectiveHpMax(p);

  // 灵石按品阶分开报：中品与下品不是一回事，混成一堆，模型落笔的数目便会失准
  const stones = gs.spiritStones ?? { low: 0, mid: 0, high: 0, supreme: 0 };
  const stoneText =
    [
      Number(stones.low) > 0 ? `下品 ${stones.low} 枚` : "",
      Number(stones.mid) > 0 ? `中品 ${stones.mid} 枚` : "",
      Number(stones.high) > 0 ? `上品 ${stones.high} 枚` : "",
      Number(stones.supreme) > 0 ? `极品 ${stones.supreme} 枚` : "",
    ]
      .filter(Boolean)
      .join("、") || "囊中无灵石";

  // 随身物件只取要紧的几件：材料与杂物往后排，能不列就不列
  const belongings = (Array.isArray(gs.inventory) ? gs.inventory : [])
    .filter((it) => it && it.name)
    .sort(
      (a, b) =>
        (ITEM_TYPE_RANK[a.type] ?? 9) - (ITEM_TYPE_RANK[b.type] ?? 9) ||
        (ITEM_GRADE_RANK[a.grade] ?? 9) - (ITEM_GRADE_RANK[b.grade] ?? 9),
    )
    .slice(0, 4)
    .map((it) => `${it.name}${Number(it.count) > 1 ? `×${it.count}` : ""}（${it.grade}${it.type}）`)
    .join("、");

  // 所修功法取最得力的三门，另点出眼下正催运的那一部心法
  const techniques = Array.isArray(gs.techniques) ? gs.techniques : [];
  const heart = techniques.find((t) => t && t.id === p.activeHeartTechnique);
  const arts = [
    heart ? `${heart.name}（心法·正在催运）` : "",
    ...techniques
      .filter((t) => t && t.name && t.id !== p.activeHeartTechnique)
      .sort((a, b) => (Number(b.proficiency) || 0) - (Number(a.proficiency) || 0))
      .slice(0, 3)
      .map((t) => `${t.name}（${t.category}）`),
  ]
    .filter(Boolean)
    .join("、");

  const rep = gs.reputation ?? { righteous: 0, demonic: 0, folk: 0, official: 0 };
  const renown =
    [
      Number(rep.righteous) > 0 ? `正道 ${rep.righteous}` : "",
      Number(rep.demonic) > 0 ? `魔道 ${rep.demonic}` : "",
      Number(rep.folk) > 0 ? `民间 ${rep.folk}` : "",
      Number(rep.official) > 0 ? `官府 ${rep.official}` : "",
    ]
      .filter(Boolean)
      .join("、") || "无名之辈";

  const hpRatio = hpMax > 0 ? Math.min(p.hp, hpMax) / hpMax : 1;
  const injury =
    [
      buffs.length > 0 ? buffs.join("、") : "",
      hpRatio < 0.9 ? `气血只余${Math.max(1, Math.round(hpRatio * 10))}成` : "",
    ]
      .filter(Boolean)
      .join("；") || "身上无碍";

  return {
    name: p.name || "无名",
    title: p.title || "",
    realm: REALM_NAMES[p.realmIndex] ?? "未知",
    position: p.position || "",
    sect: gs.sect?.name || p.sectName || "",
    condition: [
      `气血 ${Math.min(p.hp, hpMax)}/${hpMax}`,
      `灵力 ${p.mp}/${p.mpMax}`,
      `灵石 ${stoneText}`,
      gs.beast ? `随身灵兽「${gs.beast.name}」` : "",
    ]
      .filter(Boolean)
      .join("；"),
    injury,
    belongings: belongings || "身无长物",
    arts: arts || undefined,
    renown,
    companions: mates.length > 0 ? mates.join("、") : "无人同行",
    place: place || "途中",
    time: formatGameTime(gs.currentTime),
  };
}

/** 掌柜或旁人在桌边做东时，回话末尾缀上这个标记，摘下它便是请了一顿 */
const TREAT_MARK = "<<<请客>>>";
/** 谈话里要考较一门本事时，回话末尾缀这一行，摘下它便去掷一次骰子 */
const CHECK_MARK = "<<<判定>>>";
/** 话说到该转场的地方（起身出门、上船启程、同去某处）时缀这一行，摘下它便收交谈、转叙事 */
const STORY_MARK = "<<<转叙事>>>";

/**
 * 报上玩家身上几门市井本事与最近的判定。
 * 对话里的人据此知道该考较什么，也知道上一回考得怎么样。
 */
function skillBrief(): { skills: string; checks: string } {
  const { skills, checks } = useGameStore.getState();
  const list = Array.isArray(skills) ? skills : [];
  const recent = Array.isArray(checks) ? checks.slice(-3) : [];

  return {
    skills: list.length ? list.map((s) => `${s.name}（${s.kind} Lv.${s.level}）`).join("、") : "（无）",
    checks: recent.length
      ? recent
          .map((c) => `${c.skill} 难度${c.dc} ${c.success ? "成" : c.pending ? "不成，还悬着" : "不成"}`)
          .join("；")
      : "（无）",
  };
}

/**
 * 提示词里那段「要考较本事就缀标记」的交代。
 * 所有对话共用这一份，标记的写法与后头摘取的口径才不会走样。
 */
function checkInstruction(): string {
  return `【判定｜硬规矩】只要这一句考较到了玩家的眼力、见识或手艺——辨物、鉴宝、识药材、看旧物、认路、听口音、看天时、解典籍掌故、修器物之类——就必须在回话的最后另起一行只写 ${CHECK_MARK} 技能名 | 难度 | 缘由。凡涉及考校见识与鉴识之处，一律交系统掷骰定夺，你不可自己判定成败，也不可在话里把结果写死（莫写「他一眼认出」「他没看出什么」这类定论），该留的余地留到系统掷完再说；能说的是你能说的那部分，拿不准的那部分点到为止。技能名优先用上面「玩家的市井本事」里最贴近的那一门；确无对应的，就照实写一门最贴切的（那便按零级算）。难度取 8、12、16、20 之一，视这桩事难易而定。口才、说服、谈判、寒暄一类不必考较，把话直接接下去就是。同一件事只考一次，别翻来覆去地考；确实不涉考校，就不写这一行。`;
}

/**
 * 对话的文风：与各处叙事的《文风准则》同一路，只是落到嘴上。
 * 各扇交谈窗共用这一份，人物的口吻才不至于此处一个调、彼处一个调。
 */
const DIALOGUE_STYLE = `【对话文风】口吻随身份而变：前辈高人言简意赅、话里带机锋，同辈之间有试探也有交心，小辈弟子恭敬虚心。用古风白话，像人说的话，短些无妨，不必句句文绉绉；修仙术语入话要自然，点到为止，不可堆砌。忌网络语、洋文与现代化的比方。心境与算计都不直说，借语气、称呼、停顿与旁敲侧击带出。
【对话边界】不写未成年人性内容；不写现实违法操作指南；玩家越界时不顺从、不复述其要求，借话头、旁人打岔或情境变化把话拉回；正常的虚构冲突、阴谋与阴暗面照写，不作过度审查。`;

/**
 * 摘下末尾的判定标记，掷一次骰子，返回本该说出口的那句话。
 * 骰子与成败由系统定，模型只管点出考的是哪一门。
 */
const settleCheckMark = (
  text: string,
  fallbackContext: string,
  onCheck?: (check: SkillCheck) => void,
): string => {
  const asked = new RegExp(`${CHECK_MARK}\\s*([^\\n|]+)\\|([^\\n|]+)\\|?([^\\n]*)`).exec(text);
  if (!asked) return text;

  const dc = Number(String(asked[2]).replace(/[^\d]/g, "")) || 12;
  const check = useGameStore.getState().checkSkill({
    skill: String(asked[1]).trim(),
    dc,
    context: String(asked[3] ?? "").trim() || fallbackContext,
  });
  if (check && onCheck) onCheck(check);
  return text.replace(asked[0], "");
};

/** 对话里托付一桩事时，回话末尾缀这一行；摘下它便立一桩机缘 */
const QUEST_MARK = "<<<机缘>>>";
/** 托付的事有了结果时缀这一行：点头认下写「了」，黄了写「误」 */
const SETTLE_MARK = "<<<了事>>>";

/** 赏罚的名目只认这几样，与 data/quests 的两张表同源 */
const QUEST_MARK_REWARDS = ["灵石", "修为", "物品", "人情", "正道名声", "魔道名声", "平民名声", "官府名声"];
const QUEST_MARK_PENALTIES = ["灵石", "修为", "业力", "正道名声", "魔道名声", "平民名声", "官府名声"];

/** 从「灵石 200」这样的字面里取名目与数额；名目不在表内就当没写 */
function parseAward(raw: string, kinds: string[]): { kind?: string; amount?: number } {
  const text = (raw || "").trim();
  if (!text || /^(无|没有|不必|免)$/.test(text)) return {};
  const kind = kinds.find((k) => text.includes(k));
  if (!kind) return {};
  const num = Number((text.replace(kind, "").match(/\d+/) || [""])[0]);
  if (!Number.isFinite(num) || num <= 0) return { kind };
  return { kind, amount: Math.max(1, Math.min(5000, Math.round(num))) };
}

/**
 * 在牙行托付的差事：赏钱押在这家柜上，办成之后回柜上领。
 * 别处托付的事没有这一笔，说罢就当场兑现。
 */
function brokerFromScene(scene: NPCScene | undefined): QuestBroker | undefined {
  if (!scene || scene.kind !== "牙行" || !scene.shopId) return undefined;
  return {
    cityId: scene.cityId ?? "",
    districtId: scene.districtId ?? 0,
    shopId: scene.shopId,
    shopName: scene.shop,
  };
}

/**
 * 摘下末尾的机缘标记，替说话的人立一桩事。
 * 名目与数额只认玩法名录，表外的连数额一块作废。
 */
function settleQuestMark(text: string, giver: string, broker?: QuestBroker): string {
  const found = new RegExp(`${QUEST_MARK}\\s*([^\\n]+)`).exec(text);
  if (!found) return text;

  const parts = found[1].split("|").map((p) => p.trim());
  // 类别写在最前：认得出便摘掉，认不出（或干脆没写）就照旧的几段解，别把名称错当成类别
  const kind = parseQuestKind(parts[0]);
  if (kind) parts.shift();
  const days = Number((parts[2] || "").replace(/[^\d]/g, ""));
  const reward = parseAward(parts[4] || "", QUEST_MARK_REWARDS);
  const penalty = parseAward(parts[5] || "", QUEST_MARK_PENALTIES);
  const today = daySerial(useGameStore.getState().currentTime);

  const quest = normalizeQuest(
    {
      name: parts[0] || "",
      kind,
      desc: parts[3] || "",
      // 修为、物品、灵石三类没有去处：那一栏分别填境界名、物名件数、灵石数目
      place: kind === "修为" || kind === "物品" || kind === "灵石" ? "" : parts[1] || "",
      realmGoal: kind === "修为" ? parts[1] || "" : undefined,
      itemGoal: kind === "物品" ? parts[1] || "" : undefined,
      stoneGoal: kind === "灵石" ? parts[1] || "" : undefined,
      dueDay: Number.isFinite(days) && days > 0 ? today + days : undefined,
      giver,
      condition: parts[3] || "",
      reward: parts[4] || "",
      rewardKind: reward.kind,
      rewardAmount: reward.amount,
      penalty: parts[5] || "",
      penaltyKind: penalty.kind,
      penaltyAmount: penalty.amount,
      day: today,
    },
    Date.now() % 1000,
  );

  if (quest) {
    if (broker) {
      // 牙行揽下的：赏钱先押在柜上，办成之后回来领
      quest.broker = broker;
      quest.claimed = false;
    }
    // 去处与要见的人一并定下：对得上本城或别城的街区便钉在那儿，人现掷一个钉在目标地块上，
    // 玩家走到那一处方能寻着、交得了差
    const gs = useGameStore.getState();
    const pinned = pinNarrativeQuest({
      quest,
      currentPlaceId: gs.currentPlaceId,
      districtNames: gs.districtNames,
      culture: getMarker(gs.currentPlaceId)?.culture,
      today,
      adventures: Array.isArray(gs.adventures) ? gs.adventures : [],
      villages: Object.values(gs.villages ?? {}),
      sectSites: Array.isArray(gs.sectSites) ? gs.sectSites : [],
      known: Array.isArray(gs.relations) ? gs.relations : [],
      // 牙行柜上揽的事只落在真有的地方：认不出便退到城里街区，不在舆图上另开一处
      noSpawn: !!broker,
    });
    // 捎信捎物一类的事：托付时把该带的东西真放进他的行囊
    const inventory = [...(Array.isArray(gs.inventory) ? gs.inventory : [])];
    attachQuestCarryItem(pinned.quest, inventory);
    useGameStore.setState((s) => ({
      quests: [...s.quests, pinned.quest],
      inventory,
      // 点名的地方舆图上没有、现开了一处：这一处也得落进舆图，不然这桩事走过去是一片空白
      adventures: pinned.adventure
        ? [...(Array.isArray(s.adventures) ? s.adventures : []), pinned.adventure]
        : s.adventures,
      relations:
        pinned.people.length > 0
          ? [...s.relations, ...pinned.people.filter((p) => !s.relations.some((r) => r.id === p.id))]
          : s.relations,
      log: [
        ...(pinned.adventure ? [`舆图上添了一处去处：${pinned.adventure.name}。`] : []),
        broker
          ? `「${giver}」在「${broker.shopName}」给你记下一桩差事：${quest.name}，赏押在柜上。`
          : `「${giver}」托付下一桩事：${quest.name}。`,
        ...s.log,
      ].slice(0, 30),
    }));
  }

  return text.replace(found[0], "");
}

/** 鉴宝那块结果的起头；叙事与结果分作两处，说出口的只有叙事 */
const READING_MARK = "<<<READING>>>";

/** 摘下鉴宝那一块 JSON：认不出名目就算没看明白，那件旧物原样留着 */
function parseAppraisalReading(raw: string): AppraiseResult["reading"] {
  const blank = { name: "", type: "", grade: "", desc: "" };
  const start = raw.indexOf(READING_MARK);
  if (start === -1) return blank;

  const after = raw.slice(start + READING_MARK.length);
  const end = after.indexOf("<<<END>>>");
  const block = end === -1 ? after : after.slice(0, end);
  const braceStart = block.indexOf("{");
  const braceEnd = block.lastIndexOf("}");
  if (braceStart === -1 || braceEnd <= braceStart) return blank;

  try {
    const parsed = JSON.parse(block.slice(braceStart, braceEnd + 1));
    return {
      name: String(parsed?.name ?? "").trim(),
      type: String(parsed?.type ?? "").trim(),
      grade: String(parsed?.grade ?? "").trim(),
      desc: String(parsed?.desc ?? "").trim(),
      icon: parsed?.icon ? String(parsed.icon) : undefined,
      elements: parsed?.elements && typeof parsed.elements === "object" ? parsed.elements : undefined,
    };
  } catch {
    return blank;
  }
}

/** 说出口的只有叙事正文，那一块 JSON 不该让人看见 */
function stripAppraisalReading(raw: string): string {
  const start = raw.indexOf(READING_MARK);
  return (start === -1 ? raw : raw.slice(0, start)).trim();
}

/** 镖局那一块聘书的起头；叙事与聘书分作两处，说出口的只有叙事 */
const ESCORT_MARK = "<<<ESCORT>>>";

/** 摘下镖局那一块 JSON，认不出就返回 null，当作柜上没寻着人 */
function parseEscortOffer(raw: string): unknown {
  const start = raw.indexOf(ESCORT_MARK);
  if (start === -1) return null;
  const after = raw.slice(start + ESCORT_MARK.length);
  const end = after.indexOf("<<<END>>>");
  const block = end === -1 ? after : after.slice(0, end);
  const braceStart = block.indexOf("{");
  const braceEnd = block.lastIndexOf("}");
  if (braceStart === -1 || braceEnd <= braceStart) return null;
  try {
    return JSON.parse(block.slice(braceStart, braceEnd + 1));
  } catch {
    return null;
  }
}

/** 说出口的只有叙事正文，那一块 JSON 不该让人看见 */
function stripEscortOffer(raw: string): string {
  const start = raw.indexOf(ESCORT_MARK);
  return (start === -1 ? raw : raw.slice(0, start)).trim();
}

/** 作坊里报下的那块单子；另起一块，等玩家点头才付钱 */
const CRAFT_MARK = "<<<定制>>>";

/** 摘下作坊那一块 JSON，认不出便当作还没谈拢 */
function parseCraftOffer(raw: string): CraftOffer | null {
  const start = raw.indexOf(CRAFT_MARK);
  if (start === -1) return null;
  const after = raw.slice(start + CRAFT_MARK.length);
  const end = after.indexOf("<<<END>>>");
  const block = end === -1 ? after : after.slice(0, end);
  const braceStart = block.indexOf("{");
  const braceEnd = block.lastIndexOf("}");
  if (braceStart === -1 || braceEnd <= braceStart) return null;
  try {
    return clampCraftOffer(JSON.parse(block.slice(braceStart, braceEnd + 1)));
  } catch {
    return null;
  }
}

/** 说出口的只有叙事正文，那一块单子不该让人看见 */
function stripCraftOffer(raw: string): string {
  const start = raw.indexOf(CRAFT_MARK);
  return (start === -1 ? raw : raw.slice(0, start)).trim();
}

/** 说定的一桩口头之约：另起一行 */
const PACT_MARK = "<<<约定>>>";

/**
 * 摘下末尾的约定标记，替说话的人记一桩口头之约。
 * 说不出名目的就当没说定；地点与日子说得含糊，便只记名目。
 */
function settlePactMark(text: string, profile: NPCProfile): string {
  const found = new RegExp(`${PACT_MARK}\\s*([^\\n]+)`).exec(text);
  if (!found) return text;

  const parts = found[1].split("|").map((p) => p.trim());
  const days = Number((parts[2] || "").replace(/[^\d]/g, ""));
  const gs = useGameStore.getState();

  const pact = normalizePact(
    { name: parts[0], place: parts[1], days, desc: parts[3] },
    { id: profile.npcId, name: profile.name },
    { cityId: gs.currentPlaceId, districtId: profile.scene?.districtId },
    daySerial(gs.currentTime),
  );

  if (pact) {
    useGameStore.setState((s) => ({
      pacts: [...s.pacts, pact],
      log: [
        `你与「${profile.name}」说定：${pact.name}${pact.place ? `，在${pact.place}` : ""}，第 ${pact.dueDay} 日前了结。`,
        ...s.log,
      ].slice(0, 30),
    }));
  }

  return text.replace(found[0], "");
}

/**
 * 摘下末尾的了事标记：托付的人当面点头认下，或是这桩事黄了。
 * 成与不成由说话的人说了算，这里只照单落账。
 */
function settleDoneMark(text: string): string {
  // 一回话里可能同时认下几桩事，逐条都认，不能只摘头一条
  const pattern = new RegExp(`${SETTLE_MARK}\\s*([^\\n]+)`, "g");
  return text.replace(pattern, (_full, body: string) => {
    const parts = String(body).split("|").map((p) => p.trim());
    const name = parts[0] || "";
    if (name) {
      // 判词只认说得明白的成与败：「未」「还没」只是没办完，不作误期
      const outcome = parseQuestOutcome(parts[1] || "");
      if (outcome) useGameStore.getState().settleQuest({ name, status: outcome });
    }
    return "";
  });
}

/**
 * 在办的机缘清单，附一句了事标记的写法。
 * 卖艺、酒楼、客栈、瓦舍、宝物阁、镖局、自家铺面这些叙事都带上一份，
 * 玩家在哪儿把事办成了，都认得了。
 */
function questSettleHint(field?: string): string {
  const quests = (useGameStore.getState().quests ?? [])
    .filter((q) => q?.status === "open")
    .slice(0, 12);
  if (quests.length === 0) return "";
  const list = quests.map((q) => `「${q.name}」〔${q.id}〕`).join("、");
  const where = field ? `「${field}」字段之末另起一行` : "正文之末另起一行";
  return `【在办的机缘】${list}\n若这一段叙事里确把其中某一桩办成了、或确已黄了，就在${where}只写 ${SETTLE_MARK} 名称或编号 | done（办成）或 failed（黄了）；没有就一个字也不写。`;
}

/**
 * 席间、店中打探来的机缘与奇遇：与问道走同一套落账，
 * 去处、接头的人、舆图点位都由系统现钉，这里只把模型写的那一笔记下。
 */
function applyScuttle(payload: any): { questName?: string; adventureName?: string } {
  const quest = payload?.quest;
  const adventure = payload?.adventure;
  const questName =
    quest && typeof quest === "object" ? String(quest.name ?? "").trim().slice(0, 20) : "";
  const adventureName =
    adventure && typeof adventure === "object" ? String(adventure.name ?? "").trim().slice(0, 12) : "";

  const ops: DataOp[] = [];
  if (questName) ops.push({ kind: "add", collection: "quests", payload: quest });
  if (adventureName) ops.push({ kind: "add", collection: "adventures", payload: adventure });
  if (ops.length === 0) return {};

  // 落账前先数一数：立不起来的那几笔，不要回头跟玩家说已经记下了
  const before = useGameStore.getState();
  const hadQuests = (before.quests ?? []).filter((q) => q.name === questName).length;
  const hadAdventures = (before.adventures ?? []).filter((a) => a.name === adventureName).length;
  before.applyOps(ops);

  const after = useGameStore.getState();
  return {
    questName:
      questName && (after.quests ?? []).filter((q) => q.name === questName).length > hadQuests
        ? questName
        : undefined,
    adventureName:
      adventureName && (after.adventures ?? []).filter((a) => a.name === adventureName).length > hadAdventures
        ? adventureName
        : undefined,
  };
}

/**
 * 摘下回话末尾那些标记：判定掷一次骰子，请客记一笔账，机缘立一桩事。
 * 单谈与多人同席都走这一处，免得两头各写一套。返回要说出口的那句话。
 */
function settleNPCMarks(
  text: string,
  profile: NPCProfile,
  onCheck?: (check: SkillCheck) => void,
): string {
  const scene = profile.scene;
  // 只有坐在客栈茶棚的堂里才谈得上做东叫菜；牙行柜前没有这一说
  const isDining = scene?.kind === "客栈" || scene?.kind === "茶棚";
  // 作坊里的场面才谈得上定做东西
  const offer = scene?.craft ? parseCraftOffer(text) : null;

  let spoken = settleCheckMark(text, `${profile.name}问起的一桩事`, onCheck);
  spoken = settleQuestMark(spoken, profile.name, brokerFromScene(scene));
  spoken = settleDoneMark(spoken);
  // 说定的事记成一桩口头之约
  spoken = settlePactMark(spoken, profile);

  if (offer && scene) {
    // 价只是报下，得等玩家点头付钱才作数
    useAIStore.setState((st) => ({
      npcChat: {
        ...st.npcChat,
        pendingCraft: {
          npcId: profile.npcId,
          giver: profile.name,
          offer,
          place: scene.shop,
          cityId: scene.cityId,
          districtId: scene.districtId,
        },
      },
    }));
    spoken = stripCraftOffer(spoken);
  }

  if (isDining && scene && spoken.includes(TREAT_MARK)) {
    const dish = randomDish(scene.culture);
    const gs = useGameStore.getState();
    // 同一道菜重吃一回，时辰从头算起
    gs.removeBuff(`dish-${dish.name}`);
    gs.addBuff(dishBuff(dish, `${profile.name}做东`, gs.currentTime));
    gs.addLog(`${profile.name}做东，替你叫了${dish.name}。${dish.desc}`);
  }
  spoken = spoken.split(TREAT_MARK).join("");

  return spoken.replace(/^\s+|\s+$/g, "") || text.trim();
}

/**
 * 摘下末尾的转叙事标记：话说到起身出门、上船启程、同去某处这类非一段叙事接不住的事，
 * 说话的人便缀上这一行，写明玩家接下来做什么、往哪里去。
 * 摘掉它，余下的照旧是这一句回话；没有这一行便是照常谈下去。
 */
function takeStoryCue(text: string): { text: string; cue: string } {
  const idx = text.indexOf(STORY_MARK);
  if (idx === -1) return { text: text.trim(), cue: "" };

  const after = text.slice(idx + STORY_MARK.length);
  const lineEnd = after.indexOf("\n");
  const cue = (lineEnd === -1 ? after : after.slice(0, lineEnd)).replace(/^[\s|｜:：]+/, "").trim();
  const head = text.slice(0, idx);
  const tail = lineEnd === -1 ? "" : after.slice(lineEnd);
  return { text: (head + tail).trim(), cue };
}

/**
 * 话说到该转场的地方：收起这一席交谈，摊开问道窗，由叙事接着往下写。
 * 单谈与多人同席共用这一处，走的是与「问道」同一条推演，不另起一套。
 */
function handOffChatToNarration(who: string, cue: string): void {
  const store = useAIStore.getState();
  // 先照常收席：这一席的摘要与这人的记性都要落下来
  store.closeNPCChat();
  useAIStore.setState({ isStoryOpen: true });
  const trimmed = cue.replace(/[。;；,，]\s*$/, "").trim();
  void store.runTurn(`与${who}话毕，${trimmed || "起身离去"}`);
}

/**
 * 叙事里的人先开了口：记下这一席，等玩家看完正文再点头进去。
 * 只认尘缘里真有的那一位，且须就在近前；认不出、或人不在跟前，就不留这个入口。
 */
function openChatFromNarrative(converse: { npc: string } | null): void {
  if (!converse?.npc) return;
  const gs = useGameStore.getState();
  const rel = (gs.relations || []).find((r) => r.name === converse.npc);
  if (!rel) return;
  if (!isNpcAround(rel, { placeId: gs.currentPlaceId, placeName: gs.hereLabel() })) return;
  // 不替玩家转场：先摆一个入口，待他点过头才叫开交谈窗
  useAIStore.setState({ pendingChat: { npc: rel.id, name: rel.name } });
}

/**
 * 判定没过时，在对话里留一句旁注：考的是哪一门、掷了多少、差在哪儿。
 * 对方的回话照旧把话头收住，玩家得知道自己这一考没接住。
 */
function checkFailNote(check: SkillCheck): string {
  const tail = check.pending ? "这一句还悬着，往后或能再看。" : "话头便停在这里。";
  return `〔判定未过 · ${check.skill}〕掷 ${check.roll} + Lv.${check.level} = ${check.total}，难度 ${check.dc}。${tail}`;
}

/**
 * 判定掷过之后，NPC 方才那半句话还悬着。
 * 这一句把结果交回给模型，请它顺着话头把该给的答案、该认的事说下去。
 */
function checkPassedInstruction(profile: NPCProfile, check: SkillCheck): string {
  return `【系统判定】玩家方才就「${check.context}」考较「${check.skill}」：掷 ${check.roll} + Lv.${check.level} = ${check.total}，难度 ${check.dc}，判定已通过。
你方才话到关键处停住了。请以「${profile.name}」的身份顺着刚才的话头接着说下去，把通过之后该给的答案、该认的事、该交的底交出来。
不要重复已经说过的话，不要再考较同一件事，也不要输出任何判定、机缘、了事或约定标记。50 到 200 字，古风白话，只输出你要说的这段话。`;
}

const INITIAL_BATTLE: BattleState = {
  isActive: false,
  map: {
    width: 10,
    height: 10,
    entities: [],
  },
  round: 1,
  turn: "player",
  narrative: "",
  isResolving: false,
  errorMsg: "",
  context: [],
  incense: { stick: 1, progress: 0 },
  stamina: 80,
  staminaMax: 80,
  aftermath: null,
  sectWar: null,
  options: [],
};

/**
 * 照一处宗门的实力摆出它的守方阵列：护山大阵一座，门中长老与弟子各几名。
 * 数目与气血都由代码定，不假手模型；名号缀上门名，好认。
 */
function buildSectUnits(
  name: string,
  site: SectSite | undefined,
): { units: BattleEntity[]; arrayHp: number } {
  const lv = Math.max(1, Number(site?.level) || 1);
  const elders = Math.max(0, Number(site?.elders) || 0);
  const disciples = Math.max(0, Number(site?.disciples) || 0);
  const baseHp = 60 + lv * 40;
  const maxMp = 30 + lv * 20;
  const elderCount = Math.min(3, Math.max(1, elders));
  const discipleCount = Math.min(4, Math.max(1, Math.round(disciples / 15) + 1));
  const arrayHp = Math.round(140 + lv * 100);

  const units: BattleEntity[] = [
    {
      id: "foe-array",
      name: "护山大阵",
      type: "enemy",
      position: { x: 9, y: 4 },
      hp: arrayHp,
      maxHp: arrayHp,
      icon: "阵",
    },
  ];
  for (let i = 0; i < elderCount; i++) {
    const hp = Math.round(baseHp * 1.8);
    units.push({
      id: `foe-elder-${i}`,
      name: `${name}长老`,
      type: "enemy",
      position: { x: 8, y: 3 + i },
      hp,
      maxHp: hp,
      mp: maxMp,
      maxMp,
      icon: "长",
    });
  }
  for (let i = 0; i < discipleCount; i++) {
    units.push({
      id: `foe-disciple-${i}`,
      name: `${name}弟子`,
      type: "enemy",
      position: { x: 7, y: 5 + (i % 3) },
      hp: baseHp,
      maxHp: baseHp,
      mp: Math.round(maxMp * 0.6),
      maxMp,
      icon: "弟",
    });
  }
  return { units, arrayHp };
}

/** 照名目定个数：同一处每次算来一样，不掷骰 */
function unitCountFrom(seed: string, base: number, span: number): number {
  const h = [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return base + (h % span);
}

/** 在宗门点位里点名找一处；先照全名，再照包含 */
function findSectByName(sites: SectSite[], name: string): SectSite | undefined {
  const list = Array.isArray(sites) ? sites : [];
  const exact = list.find((s) => !s.mine && s.name === name);
  if (exact) return exact;
  const loose = String(name ?? "").trim();
  if (!loose) return undefined;
  const byPart = list.find((s) => !s.mine && (s.name.includes(loose) || loose.includes(s.name)));
  if (byPart) return byPart;
  // 名号只差末尾一个字（白鹿涧与白鹿院）的，也认作同一处山门
  const core = sectNameCore(loose);
  return list.find((s) => !s.mine && !!s.name && sectNameCore(s.name) === core);
}

/** 城的守方：守城大阵一座，另有守将与守卒 */
function buildCityUnits(name: string, size: number): { units: BattleEntity[]; arrayHp: number } {
  const lv = Math.max(1, Number(size) || 1);
  const baseHp = 70 + lv * 12;
  const maxMp = 20 + lv * 4;
  const soldiers = Math.min(5, Math.max(2, Math.round(lv / 8) + 2));
  const guardHp = Math.round(baseHp * 1.6);
  const arrayHp = Math.round(180 + lv * 18);
  const units: BattleEntity[] = [
    {
      id: "foe-cityarray",
      name: "守城大阵",
      type: "enemy",
      position: { x: 9, y: 4 },
      hp: arrayHp,
      maxHp: arrayHp,
      icon: "阵",
    },
    {
      id: "foe-guardmaster",
      name: `${name}守将`,
      type: "enemy",
      position: { x: 8, y: 3 },
      hp: guardHp,
      maxHp: guardHp,
      mp: maxMp,
      maxMp,
      icon: "将",
    },
  ];
  for (let i = 0; i < soldiers; i++) {
    units.push({
      id: `foe-soldier-${i}`,
      name: `${name}守卒`,
      type: "enemy",
      position: { x: 7, y: 5 + (i % 3) },
      hp: baseHp,
      maxHp: baseHp,
      mp: Math.round(maxMp * 0.5),
      maxMp,
      icon: "卒",
    });
  }
  return { units, arrayHp };
}

/** 村的守方：只有乡勇村民，没有大阵 */
function buildVillageUnits(name: string, size: number): { units: BattleEntity[]; arrayHp: number } {
  const lv = Math.max(1, Number(size) || 1);
  const hp = 50 + lv * 6;
  const count = Math.min(4, Math.max(2, Math.round(lv / 10) + 2));
  const units: BattleEntity[] = [];
  for (let i = 0; i < count; i++) {
    units.push({
      id: `foe-villager-${i}`,
      name: `${name}乡勇`,
      type: "enemy",
      position: { x: 7 + (i % 2), y: 4 + i },
      hp,
      maxHp: hp,
      mp: 10,
      maxMp: 10,
      icon: "勇",
    });
  }
  return { units, arrayHp: 0 };
}

/** 战斗分出胜负后立起的收尾：我方胜则提气追敌，我方败则且战且退 */
function makeAftermath(allEnemiesDead: boolean): BattleAftermath {
  return {
    role: allEnemiesDead ? "chase" : "flee",
    pursuit: 20,
    retreat: 25,
    stage: "escape",
    narrative: allEnemiesDead ? "敌人转身欲走，你提气追了上去——" : "你伤重难支，且战且退——",
    loot: [],
    patience: 65,
    resolving: false,
  };
}

/**
 * 从落败的敌人身上派生出战利品：名目由敌人名号与一个定数决定，
 * 数目定在二到四样，全由代码结账，不假手模型。
 */
function makeLoot(enemies: BattleEntity[]): BattleLootItem[] {
  const names = enemies
    .filter((e) => e.type === "enemy")
    .map((e) => e.name)
    .filter((n) => !!n && n.trim().length > 0);
  if (names.length === 0) names.push("无名之敌");
  const seed = names.join("").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const kinds = ["兵刃", "储物袋", "丹药", "符箓", "灵石", "护身法宝", "随身札记"];
  const total = 2 + (seed % 3);
  const loot: BattleLootItem[] = [];
  for (let i = 0; i < total; i++) {
    const base = names[i % names.length];
    const kind = kinds[(seed + i * 3) % kinds.length];
    const qty = 1 + ((seed + i * 7) % 3);
    loot.push({
      name: `${base}的${kind}`,
      qty,
      desc: `从${base}身上搜得的${kind}，共 ${qty} 件。`,
    });
  }
  return loot;
}

interface AIStore {
  settings: AISettings;
  conversation: ConversationState;
  npcChat: NPCChatState;
  battle: BattleState;
  isDeveloperMode: boolean;
  /** 开发者模式下可关掉随机事件：关掉之后时间再往前走也不再生变故 */
  randomEventDisabled: boolean;
  /** 开局的玩法介绍看过没有；玩家勾了「以后不再打开」便记下，往后不再自动弹 */
  introSeen: boolean;
  isCraftingOpen: boolean;
  /**
   * 叙事里挑起的一场讲价。
   * 非空则那扇讲价窗开着；由 StoryPanel 读到回合上的标记后叫开，与商铺里那套讲价同源。
   */
  narrativeHaggle: HaggleBrief | null;
  openNarrativeHaggle: (brief: HaggleBrief) => void;
  closeNarrativeHaggle: () => void;
  /**
   * 叙事里把玩家引到某家铺子买卖。
   * 非空则那扇铺面窗开着；由 StoryPanel 读到回合上的标记后叫开，
   * 买卖的经过与得失全由玩家在窗里经手，正文不与它重复。
   */
  narrativeShop: ShopBrief | null;
  openNarrativeShop: (brief: ShopBrief) => void;
  closeNarrativeShop: () => void;
  /**
   * 问道窗口开着没有。
   * 摆在 store 里是因为开战之后战斗面板就在问道窗口内，
   * 从别处挑起的战斗得能把窗口自己叫开，不然非刷新看不见。
   */
  isStoryOpen: boolean;
  setStoryOpen: (open: boolean) => void;
  /**
   * 存档管理窗口开着没有。
   * 主菜单与游戏内共用同一扇窗：列档、存档、读档、删档都在游戏内完成，不弹系统文件框。
   */
  isSaveManagerOpen: boolean;
  setSaveManagerOpen: (open: boolean) => void;
  updateSettings: (patch: Partial<AISettings>) => void;
  runTurn: (decision: string, opts?: { travelToAdventureId?: string }) => Promise<void>;
  regenerate: () => Promise<void>;
  compressNow: () => Promise<void>;
  clearConversation: () => void;
  restoreConversation: (conv: ConversationState) => void;
  /** 读档时把尘缘里的交谈记录一并换回；存档里没有这一项便清空，免得留着上一局的话 */
  restoreNPCChat: (chat?: Partial<NPCChatState> | null) => void;
  /**
   * 叙事里有人当面搭话，先记一笔，等玩家点过头才叫开交谈窗。
   * 不能替玩家直接转场——正文还没看完，先收起来只留一个入口。
   */
  pendingChat: { npc: string; name: string } | null;
  confirmPendingChat: () => void;
  dismissPendingChat: () => void;
  /**
   * 交谈窗暂时收起去看叙事。人还坐在席上，话也没散，
   * 点回来仍是方才那一席，不必重新开口。
   */
  chatHidden: boolean;
  hideNPCChat: () => void;
  showNPCChat: () => void;
  /**
   * 重开一局：把推演账与各扇临时窗口一并归零。
   * 起手开新游戏前必须叫一次，免得新局接着上一局的话头往下走。
   */
  resetLedger: () => void;
  cancel: () => void;
  setStage: (stage: GenStage, msg?: string) => void;
  /** 关掉开局那句「部分数据未生成」的提示 */
  dismissOpeningWarning: () => void;

  setDeveloperMode: (enabled: boolean) => void;
  /** 开关随机事件；只在开发者模式下给用，退出开发者模式便自动恢复 */
  setRandomEventDisabled: (disabled: boolean) => void;
  /** 记下开局介绍看过了；往后不再自动弹 */
  markIntroSeen: () => void;
  openCrafting: () => void;
  closeCrafting: () => void;
  resumeTurnAfterCrafting: (result: CraftingResult) => Promise<void>;

  /** 路上变故：开着的时候关不上，只能就着它应付过去 */
  randomEvent: RandomEventState;
  /** 时间往前走过一段，掷一掷路上有没有变故 */
  maybeTriggerRandomEvent: (hours: number) => void;
  /** 起一桩变故：先写下这一段，再把这一段里的数据变动结出来 */
  triggerRandomEvent: (reason: string) => Promise<void>;
  /** 就着眼前这一桩回一句话 */
  replyRandomEvent: (text: string) => Promise<void>;
  /** 收场：模型认了、或是开发者模式，才关得掉 */
  closeRandomEvent: (force?: boolean) => boolean;

  /** 奇遇：踏进一处野外去处之后的那扇窗，可随时抽身，了结时分出留撤 */
  adventure: AdventureState;
  /** 时间往前走过一段，掷一掷有没有新开一处奇遇 */
  maybeSpawnAdventure: (hours: number) => void;
  /**
   * 每月至少开一处非任务奇遇。
   * 当月已有一处（没有 questId 的）便不再添；未配接口时不生，免得空转。
   */
  ensureMonthlyAdventure: () => void;
  /** 现掷一处奇遇；给了 spot 便落在指定点位（开发者现点），否则落在玩家所在的那一带 */
  spawnAdventure: (
    reason?: string,
    spot?: { sceneId: string; x: number; y: number },
    /** force：按月保底的那一处，不受开着的数目所限，近处没有空位便另择一处 */
    opts?: { force?: boolean },
  ) => Promise<void>;
  /** 踏进一处奇遇 */
  openAdventure: (id: string) => Promise<void>;
  /** 只翻看某一处留下的旧话：不必亲至，也不往下写 */
  readAdventure: (id: string) => void;
  /** 前往舆图上某处奇遇的点位；行路一事交给问道推演 */
  travelToAdventure: (id: string) => Promise<void>;
  /** 在奇遇里回一句话 */
  replyAdventure: (text: string) => Promise<void>;
  /** 在奇遇里使一个手段：探索、交涉、出手、抽身 */
  actAdventure: (action: "explore" | "parley" | "fight" | "leave") => Promise<void>;
  /** 照模型现拟的那一条选择行事 */
  chooseAdventure: (choice: AdventureChoice) => Promise<void>;
  /** 收起奇遇那扇窗；那一处仍留在舆图上 */
  closeAdventure: () => void;

  /** 宝物阁的拍卖：到日子进铺子才开的那一扇窗 */
  auction: AuctionState;
  /** 铺面与对话里正在写的那一段：各处窗口认 key，只取自己那一份 */
  shopStream: ShopStream;
  /** 时间往前走过一段，掷一掷有没有哪家宝物阁放出拍卖的消息 */
  maybeSpawnAuction: (hours: number) => void;
  /** 定下一场拍卖：本地挑宝物阁、定日子，拍品与来客等开场再写 */
  spawnAuction: (reason?: string, shopName?: string, opts?: { day?: number; hour?: number }) => void;
  /** 走进这一场：头一回进来便请模型写拍品与来客 */
  openAuction: (id: string) => Promise<void>;
  /** 玩家加一口价，随后客人应一轮 */
  bidAuction: () => Promise<void>;
  /** 玩家看着不动，客人照旧应一轮 */
  passAuction: () => Promise<void>;
  /** 收起拍卖那一窗 */
  closeAuction: () => void;

  /**
   * 请模型照这桩差事给钉下的任务人物立一份小传：
   * 姓名、性别、年岁、出身、性情、形貌、修为都由它拟定，替掉先前现拼的那些，
   * 免得出现与身份对不上的接头人。接不上接口或识不出，便沿用原样，不碍事。
   */
  generateTaskNpcs: (args: {
    questName: string;
    questDesc?: string;
    npcs: { id: string; title: string; gender?: string; persona?: string }[];
  }) => Promise<void>;

  getOrCreateNPCProfile: (npcId: string, name: string, title: string) => Promise<NPCProfile>;
  sendNPCMessage: (npcId: string, content: string) => Promise<void>;
  openNPCChat: (npcId: string, scene?: NPCScene) => void;
  closeNPCChat: () => void;
  clearNPCChat: (npcId: string) => void;
  /** 请同席的另一个人也一并开口：多人同席，轮番说话 */
  inviteToParty: (npcId: string) => boolean;
  /** 请某人先行离席；走空了便散席 */
  removeFromParty: (npcId: string) => void;
  /** 说一句，或略过这一回；在座的几位依次回话 */
  sendPartyMessage: (content: string | null) => Promise<void>;
  /** 作坊报下的价，看过便收起来：要么付钱定下，要么改口再议 */
  dismissCraftOffer: () => void;

  /** 向街坊打听一户大户人家的底细，返回一段家世叙事 */
  probeManor: (args: ManorProbeArgs) => Promise<string>;
  /** 在一家铺子门前驻足，返回一段铺面见闻 */
  probeShop: (args: ShopProbeArgs) => Promise<string>;
  /**
   * 在宗门某处做了一桩事之后写一段叙事。
   * 提示词按建筑与事项现拼，另有该处建筑自带的场景写照，
   * 与问道那一路各自独立，不共用一份提示词。
   */
  narrateFacility: (args: FacilityNarrativeArgs) => Promise<string>;
  /**
   * 在城中林地里探索一趟：时长由玩家选定，得失交模型裁定；
   * 得着的物照旧落账，探出的动静另开一桩变故。返回正文与这一段的变化。
   */
  exploreForest: (brief: { place: string; culture?: string; hours: number }) => Promise<{
    text: string;
    ops: DataOp[];
    eventReason: string;
  }>;
  /**
   * 官署、寺观这两处还没做成常设界面，却仍可能被差事点名。
   * 玩家自述要做什么，就照这一处的规矩写一段；交差、见人、了结照旧走同一条结算。
   */
  visitClosedPlace: (args: {
    place: string;
    nature: string;
    culture?: string;
    action: string;
    history?: { role: "player" | "narrator"; text: string }[];
  }) => Promise<{ text: string; ops: DataOp[] }>;
  /** 请武馆教习现列一份低阶武学名录 */
  listMartialArts: (args: { culture?: string }) => Promise<MartialArtOption[]>;
  /** 为一场街头卖艺写一段叙事；成败已由代码定下 */
  narrateBusking: (brief: BuskBrief) => Promise<string>;
  /** 为经手一处屋舍写一段叙事；名号与价钱已由代码定下 */
  narrateEstateDeal: (brief: EstateDealBrief) => Promise<string>;
  /** 推演灵田要种的作物在此地成不成 */
  judgeCrop: (args: { crop: string; culture?: string }) => Promise<{ feasible: boolean; reason: string }>;
  /** 为出租一处产业写一段叙事，并议定租客与月租 */
  narrateRentOut: (brief: RentOutBrief) => Promise<{ tenant: string; monthly: number; text: string }>;
  /** 经营铺面：照玩家一句话把货物、设施与月收支改一改，并写一段叙事 */
  manageShop: (args: { shopId: string; instruction: string }) => Promise<{
    text: string;
    goods?: ShopGood[];
    facilities?: ShopFacility[];
    businesses?: ShopBusiness[];
    monthlyIncome?: number;
    monthlyExpense?: number;
  }>;
  /** 开张一户：照玩家说的营生推演底子（营生、货物、设施、月收支、是否记库存） */
  setupNewShop: (brief: ShopSetupBrief) => Promise<{
    text: string;
    kind?: ShopKind;
    useStock?: boolean;
    goods?: ShopGood[];
    facilities?: ShopFacility[];
    monthlyIncome?: number;
    monthlyExpense?: number;
  }>;
  /** 宗门自拟建筑：照玩家的口述推出一座的耗费、进项与好处，交付一份夹好的账 */
  designSectBuilding: (brief: SectBuildBrief) => Promise<{
    text: string;
    name: string;
    custom: CustomFacility | null;
  }>;
  /** 终局：把这一世的叙事交给说书人，写一段盖棺定论 */
  appraiseEnding: (narrative: string) => Promise<string>;
  /** 在客栈茶棚坐下吃口东西，返回一段叙事与席间听来的闲话 */
  dineAt: (args: DineArgs) => Promise<DineResult>;
  /** 在客栈住下歇息，返回一段睡过去之后外界变化的叙事，以及店中听来的事 */
  lodgeAt: (args: LodgeArgs) => Promise<LodgeResult>;
  /** 在瓦舍听一场戏，返回一段戏文与座间的叙事 */
  listenToPlay: (args: PlayArgs) => Promise<string>;
  /** 请宝物阁的行家看一件旧物，返回一段叙事与这东西究竟是什么 */
  appraiseItem: (args: AppraiseArgs) => Promise<AppraiseResult>;
  /** 在镖局柜上问一声，寻一位肯走这趟的镖师 */
  findEscort: (args: EscortArgs) => Promise<EscortResult>;
  /** 和掌柜讲价：回一句话，并给出谈成的价码与剩下的耐心 */
  haggleWithShopkeeper: (args: HaggleArgs) => Promise<{
    reply: string;
    factor: number;
    patience: number;
  }>;
  /** 站在门外求门房通禀，返回门房的应对与结局 */
  askGatekeeper: (args: GateAskArgs) => Promise<{ outcome: GateOutcome; reply: string }>;

  startBattle: (map?: BattleMap) => void;
  /**
   * 由叙事挑起的宗门战：照对手宗门摆开阵势，攻方另要破它的护山大阵。
   * 我方为守时，护山大阵立在自己阵中。
   */
  startSectWar: (brief: SectWarBrief) => void;
  endBattle: () => void;
  setBattleNarrative: (narrative: string) => void;
  updateBattleMap: (entities: BattleEntity[]) => void;
  runBattleTurn: (action: string) => Promise<void>;
  /** 收尾之逃跑阶段：玩家以一次追或逃的行动，推进两条进度 */
  runEscapeTurn: (text: string) => Promise<void>;
  /** 战利品阶段：把一样（或全部）战利品收入行囊 */
  claimLoot: (index: number | "all") => void;
  /** 战利品阶段：说一句如何发落落败之敌，了结这一场 */
  speakFate: (text: string) => Promise<void>;
  /** 败者对话：开口求饶，按话术增减敌方耐心 */
  surrenderBeg: (text: string) => Promise<void>;
  /** 败者对话：缴纳赎身，按身上灵石结算 */
  surrenderPay: () => void;
  /** 败者对话：束手等死，立即终局 */
  surrenderGiveUp: () => void;
}

let abortController: AbortController | null = null;

function emptyExtraction() {
  return { ops: [] as DataOp[], opsRaw: "", quickDecisions: [] as string[], salvaged: false };
}


/**
 * 收尾时把两边的战场对上：走位与别处的增减听模型的，但凡由本地判定定下的那几位，
 * 气血、生死与位次一律以本地为准，免得算好的数又被模型改回去。
 */
function mergeBattleEntities(
  local: BattleEntity[],
  fromModel: BattleEntity[] | null,
  owned: string[],
): BattleEntity[] {
  if (!Array.isArray(fromModel) || fromModel.length === 0) return local;
  const ownedSet = new Set(owned);
  const merged = fromModel.map((e) => {
    const mine = local.find((l) => l.id === e.id);
    if (!mine) return e;
    // 本地判定的状态不随模型的回报丢掉：0 伤害的纯负面招式也靠这一笔留下
    const base: BattleEntity = {
      ...e,
      facing: e.facing ?? mine.facing,
      style: e.style ?? mine.style,
      buffs: Array.isArray(mine.buffs) ? mine.buffs : e.buffs,
    };
    if (!ownedSet.has(e.id)) return base;
    return {
      ...base,
      hp: mine.hp,
      maxHp: mine.maxHp,
      isDead: mine.isDead,
      position: mine.position,
    };
  });
  // 模型漏报的人照旧留在场上，免得凭空少了一位
  for (const l of local) {
    if (!merged.some((e) => e.id === l.id)) merged.push(l);
  }
  return merged;
}

/**
 * 这一手已由本地当场扣过（或补过）的账，模型若在 OPS 里再写一遍便是重复。
 * 灵力：扣灵力的减法、心法催运补灵力的加法，一并剔去。
 * 气血：只剔与系统所扣数目相等的减法——敌人打来的伤害是另一笔，须留着。
 */
function withoutDuplicateVitals(
  ops: DataOp[],
  settled: { mpSpent: number; mpRestored: number; hpSpent: number },
): DataOp[] {
  const { mpSpent, mpRestored, hpSpent } = settled;
  if (mpSpent <= 0 && mpRestored <= 0 && hpSpent <= 0) return ops;
  return ops.filter((op) => {
    if (op.kind !== "modify") return true;
    const path = String(op.path || "").replace(/\s+/g, "");
    const isMp = path === "player.mp" || path === "mp";
    if (mpSpent > 0 && op.op === "-" && isMp) return false;
    if (mpRestored > 0 && op.op === "+" && isMp) return false;
    const amount = Math.abs(Number(op.value));
    if (hpSpent > 0 && op.op === "-" && path === "player.hp" && amount === hpSpent) return false;
    return true;
  });
}

/**
 * 守势抵掉的固定伤害：先从 OPS 里减 player.hp 的那几笔里扣，扣完为止。
 * 只抵正面来的伤，方位由叙事那一步判过，这里只管照数减。
 */
function applyGuardToOps(ops: DataOp[], guard: number): DataOp[] {
  const total = Math.max(0, Math.round(Number(guard) || 0));
  if (total <= 0) return ops;
  let left = total;
  const out: DataOp[] = [];
  for (const op of ops) {
    if (op.kind !== "modify") {
      out.push(op);
      continue;
    }
    const path = String(op.path || "").replace(/\s+/g, "");
    if (path !== "player.hp" || op.op !== "-") {
      out.push(op);
      continue;
    }
    const amount = Math.abs(Number(op.value) || 0);
    const cut = Math.min(left, amount);
    left -= cut;
    const rest = amount - cut;
    if (rest > 0) out.push({ ...op, value: String(rest) });
  }
  return out;
}

/**
 * 一合交手说完，把这段话里的实事照账落下：拾来的东西、结下的仇、损了的法器、
 * 提到的人与去处，凡经路由认得的都写进去。
 * 气血与灵力另有本地的判定和战阵上的数值管着，这里一概不碰，免得一笔账记两回。
 */
async function settleBattleNarrative(
  settings: AISettings,
  narrative: string,
  settled: { mpSpent: number; mpRestored: number; hpSpent: number },
): Promise<void> {
  if (!narrative.trim()) return;
  try {
    const state = useGameStore.getState().getSnapshot() as unknown as GameState;
    const extraction = await runOpsExtraction(settings, state, narrative, new AbortController().signal, {
      source: "battle",
    });
    const ops = withoutDuplicateVitals(extraction.ops, settled).filter((op) => {
      if (op.kind !== "modify") return true;
      const path = String(op.path || "").replace(/\s+/g, "");
      return path !== "player.hp" && path !== "player.mp" && path !== "hp" && path !== "mp";
    });
    if (ops.length === 0) return;
    useGameStore.getState().applyOps(ops);
    console.debug("[battle] 这一合落账", ops.length, "条");
  } catch (e) {
    console.warn("[battle] 这一合的数据结算未成:", e);
  }
}

/**
 * 开了「保留全程叙事」才把这一回的正文另存一份。
 * 推演那边照旧只带压缩摘要与近几轮，这份全文不参与任何提示词。
 */
function keepNarrativeOf(
  st: { settings: AISettings; conversation: ConversationState },
  turn: Turn,
): NarrativeEntry[] | undefined {
  if (!st.settings.keepFullNarrative) return st.conversation.narrativeLog;
  const game = useGameStore.getState();
  return recordNarrative(st.conversation.narrativeLog, {
    id: turn.id,
    timeLabel: formatGameTime(game.currentTime),
    place: game.hereLabel(),
    input: turn.playerInput,
    narrative: turn.narrative,
    timestamp: turn.timestamp,
  });
}

/**
 * 判定战斗是否已分出胜负。
 * 注意：不能写成 entities.every(...)，实体解析失败时是空数组，而空数组的 every 恒为 true，
 * 会让战斗在第一个行动后立刻结束；因此要求敌方数量大于 0。
 */
function resolveBattleOutcome(entities: BattleEntity[] | null): { allEnemiesDead: boolean; playerDead: boolean } {
  const list = Array.isArray(entities) ? entities : [];
  const isDown = (e: BattleEntity) => Boolean(e.isDead) || (typeof e.hp === "number" && e.hp <= 0);
  const enemies = list.filter((e) => e.type === "enemy");
  return {
    allEnemiesDead: enemies.length > 0 && enemies.every(isDown),
    playerDead: list.some((e) => e.type === "player" && isDown(e)),
  };
}

/**
 * 模型对玩家这一句行动的解析：使哪一招、打谁、往哪儿挪、用什么东西。
 * 只带这些参数，数值一概不在此处，随后由本地照招式与自身根基算定。
 */
interface BattleIntent {
  skill: string;
  technique: string;
  target: string;
  move: { x: number; y: number } | null;
  item: string;
  note: string;
}

/** 解析上一步的 JSON；认不出的字段一律留空，绝不因此拦住这一回合 */
function parseBattleIntent(raw: string): BattleIntent {
  const payload = parseJsonPayload(raw) as Record<string, unknown> | null;
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const empty: BattleIntent = { skill: "", technique: "", target: "", move: null, item: "", note: "" };
  if (!payload || typeof payload !== "object") return empty;

  const move = payload.move as Record<string, unknown> | null | undefined;
  const x = typeof move?.x === "number" && Number.isFinite(move.x) ? Math.trunc(move.x) : null;
  const y = typeof move?.y === "number" && Number.isFinite(move.y) ? Math.trunc(move.y) : null;

  return {
    skill: str(payload.skill),
    technique: str(payload.technique),
    target: str(payload.target),
    move: x !== null && y !== null ? { x, y } : null,
    item: str(payload.item),
    note: str(payload.note),
  };
}

/**
 * 后处理：用 Flash 模型读取 Pro 生成的叙事正文，识别本轮实际发生的数据变动。
 * 模型以 JSON 输出，解析失败时返回空结果，不阻断推演。
 */
async function runOpsExtraction(
  settings: AISettings,
  state: GameState,
  narrative: string,
  signal: AbortSignal,
  opts: {
    crafting?: { type: "alchemy" | "talisman"; summary: string };
    /** 本回合路由圈定的可写数据，只作引导 */
    writable?: string[];
    /** 这一段叙事从哪儿来，便于模型判断该记什么 */
    source?: "turn" | "npc" | "event" | "battle" | "crafting" | "opening";
  } = {},
): Promise<{ ops: DataOp[]; opsRaw: string; quickDecisions: string[]; salvaged: boolean }> {
  if (!narrative.trim()) return emptyExtraction();

  const messages = buildOpsExtractionPrompt({
    // 与回合里存下的正文同一上限：截得比正文短，正文后半段写到的随身之物等就会被漏掉
    narrative: narrative.slice(0, 20000),
    state,
    craftingType: opts.crafting?.type,
    craftingSummary: opts.crafting?.summary,
    writable: opts.writable,
    source: opts.source,
  });

  // 上一次原始输出，留给补跳时原样贴回去
  let firstRaw = "";
  try {
    firstRaw = await chatWithModel(settings, settings.flashModel, messages, {
      timeoutMs: 60000,
      signal,
      jsonMode: true,
      retries: 1,
    });
    const parsed = parseJsonOps(firstRaw);
    // opsRaw 为空是「整段读不成 JSON」的记号；本轮确实没有变动时它会是 "[]"，两回事
    if (parsed.opsRaw || parsed.quickDecisions.length > 0) {
      console.debug("[opsExtraction] 识别到", parsed.ops.length, "条数据操作");
      return parsed;
    }
    if (!signal.aborted) console.warn("[opsExtraction] 首次结算没能读成 JSON，原样回问一次");
  } catch (e) {
    if (signal.aborted) return emptyExtraction();
    console.warn("[opsExtraction] 首次结算请求失败，原样回问一次:", e);
  }

  if (signal.aborted) return emptyExtraction();

  // 补一跳：把上一次的输出原样贴回去，只求一个合法 JSON，不重写对叙事的理解。
  // 少了这一跳，整轮的账便静默丢掉——挨的伤、得的物、结下的仇，全都当没发生
  try {
    const second = await chatWithModel(
      settings,
      settings.flashModel,
      firstRaw.trim()
        ? [
            ...messages,
            { role: "assistant" as const, content: firstRaw.slice(0, 12000) },
            { role: "user" as const, content: OPS_REPAIR_INSTRUCTION },
          ]
        : messages,
      { timeoutMs: 60000, signal, jsonMode: true, retries: 1 },
    );
    const parsed = parseJsonOps(second);
    if (parsed.opsRaw || parsed.quickDecisions.length > 0) {
      console.info("[opsExtraction] 补一跳读回，识别到", parsed.ops.length, "条数据操作");
      return parsed;
    }
  } catch (e) {
    if (!signal.aborted) console.warn("[opsExtraction] 补一跳也失败了:", e);
  }

  if (!signal.aborted) console.warn("[opsExtraction] 两次都没读成 JSON，本轮不产生数据变动");
  return emptyExtraction();
}

/**
 * 变故里的数据变动照旧落账：与常规回合走同一条结算，
 * 所以窗口里写下的伤、得的物、结下的人也认数。
 * 落账的那几条一并交回，好在这一段末尾列一笔变化。
 */
async function extractEventOps(settings: AISettings, narrative: string, signal: AbortSignal): Promise<DataOp[]> {
  if (!narrative.trim()) return [];
  try {
    const state = useGameStore.getState().getSnapshot() as unknown as GameState;
    const extraction = await runOpsExtraction(settings, state, narrative, signal, { source: "event" });
    if (signal.aborted || extraction.ops.length === 0) return [];
    useGameStore.getState().applyOps(extraction.ops);
    console.debug("[randomEvent] 这一段落账", extraction.ops.length, "条");
    return extraction.ops;
  } catch (e) {
    if (!signal.aborted) console.warn("[randomEvent] 这一段的数据结算未成:", e);
    return [];
  }
}

/**
 * 从变故那一段里摘下「应对选项」那一块：模型给的三到四条，供玩家一键取用。
 * 摘掉之后余下的便是正文；模型没写这一块也不碍事，只是没有现成的选项可点。
 */
export function takeEventOptions(raw: string): { text: string; options: string[] } {
  const start = raw.indexOf(EVENT_QUICK_MARK);
  if (start === -1) return { text: raw.trim(), options: [] };

  const after = raw.slice(start + EVENT_QUICK_MARK.length);
  const endIdx = after.indexOf("<<<END>>>");
  const block = endIdx === -1 ? after : after.slice(0, endIdx);
  const text =
    endIdx === -1
      ? raw.slice(0, start)
      : raw.slice(0, start) + after.slice(endIdx + "<<<END>>>".length);

  const options = block
    .split("\n")
    // 模型爱写成「1. 」「- 」这类条目，行首的序号与符号一并摘掉
    .map((line) => line.replace(/^\s*(?:[-—*•·]|\d+\s*[.、)）])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);

  return { text: text.trim(), options };
}

/**
 * 从林地探索那一段里摘下「有动静」那块：模型若探出了要玩家当场拿主意的由头，
 * 会另起一行缀上记号，摘掉它余下的便是正文，另把那句由头交给变故那扇窗。
 * 没写这一块也不碍事，只当是平顺的一趟。
 */
function takeForestEvent(raw: string): { text: string; reason: string } {
  const start = raw.indexOf(FOREST_EVENT_MARK);
  if (start === -1) return { text: raw.trim(), reason: "" };

  const after = raw.slice(start + FOREST_EVENT_MARK.length);
  const endIdx = after.indexOf("<<<END>>>");
  const block = endIdx === -1 ? after : after.slice(0, endIdx);
  const text =
    endIdx === -1
      ? raw.slice(0, start)
      : raw.slice(0, start) + after.slice(endIdx + "<<<END>>>".length);

  return { text: text.trim(), reason: block.trim() };
}

/** 一处奇遇写成提示词里那段写照 */
function toAdventureBrief(a: Adventure): AdventureBrief {
  const reward = a.rewardKind && a.rewardAmount ? `${a.rewardKind}${a.rewardAmount}` : a.reward;
  const penalty = a.penaltyKind && a.penaltyAmount ? `${a.penaltyKind}${a.penaltyAmount}` : a.penalty;
  return {
    name: a.name,
    kind: a.kind,
    danger: a.danger,
    summary: a.summary,
    where: adventureWhere(a),
    reward: reward || undefined,
    penalty: penalty || undefined,
    persistent: a.persistent,
  };
}

const escapeMark = (m: string) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 摘下奇遇收场的记号：了结与否、以及是留是撤 */
function parseAdventureEnd(raw: string): { passage: string; resolved: boolean; keep: boolean } {
  const keep = new RegExp(escapeMark(ADVENTURE_KEEP_MARK)).test(raw);
  const resolved = keep || new RegExp(escapeMark(ADVENTURE_DONE_MARK)).test(raw);
  const passage = raw
    .replace(new RegExp(escapeMark(ADVENTURE_DONE_MARK), "g"), "")
    .replace(new RegExp(escapeMark(ADVENTURE_KEEP_MARK), "g"), "")
    .trim();
  return { passage, resolved, keep };
}

const ADVENTURE_ACTS: Record<string, AdventureChoice["act"]> = {
  探查: "explore",
  查探: "explore",
  搜寻: "explore",
  交涉: "parley",
  交谈: "parley",
  问话: "parley",
  出手: "fight",
  动手: "fight",
  拔剑: "fight",
  离去: "leave",
  抽身: "leave",
  离开: "leave",
};

/**
 * 摘下正文之后那一段选择：一行一条，照「动作|一句话」。
 * 摘下之后正文只剩余下的情景；没有这一块，便退回原先那三个老手段。
 */
function parseAdventureChoices(raw: string): { body: string; choices: AdventureChoice[] } {
  const idx = raw.indexOf(ADVENTURE_CHOICE_MARK);
  if (idx === -1) return { body: raw.trim(), choices: [] };
  const body = raw.slice(0, idx).trim();
  const block = raw.slice(idx + ADVENTURE_CHOICE_MARK.length);
  const choices: AdventureChoice[] = [];
  for (const line of block.split(/\r?\n/)) {
    const t = line.replace(/^[\s\-*·•\d.、）)]+/, "").trim();
    if (!t || t.includes("<<<")) continue;
    const cut = t.split(/[|｜]/);
    if (cut.length < 2) continue;
    const text = cut.slice(1).join("|").trim().replace(/^["「『]|["」』]$/g, "");
    if (!text) continue;
    if (choices.some((c) => c.text === text)) continue;
    choices.push({ act: ADVENTURE_ACTS[cut[0].trim()] ?? "other", text });
    if (choices.length >= 3) break;
  }
  return { body, choices };
}

/** 把这一窗里说过的那些话收拢成一卷，记到奇遇名下：收起窗后仍留着，下回接着看 */
function adventureJournalOf(s: {
  opening: string;
  openingOps: DataOp[];
  turns: RandomEventTurn[];
}): AdventureLine[] {
  const lines: AdventureLine[] = [];
  if (s.opening) lines.push({ role: "event", content: s.opening, ops: s.openingOps });
  for (const t of s.turns) lines.push({ role: t.role, content: t.content, ops: t.ops });
  return lines;
}

/** 一处奇遇里现掷的对手：凶险越高，身手越硬 */
function adventureFoe(danger: number, realmIndex: number) {
  const d = Math.max(1, Math.min(5, Math.trunc(Number(danger)) || 1));
  const realm = Math.max(0, realmIndex);
  const base = 60 + realm * 22 + d * 16;
  const names = ["", "山野散人", "拦路的强人", "守物的凶兽", "盘踞的妖物", "深藏的劲敌"];
  const notes = [
    "",
    "守在道旁的闲人，见你有意便要让路。",
    "占着这一处要道的强人，不给就抢。",
    "守着这一处物什的凶兽，未近其身便已低吼。",
    "盘踞这一处的妖物，气势压人。",
    "藏在这一处深处的劲敌，一身煞气。",
  ];
  return {
    name: names[d],
    note: notes[d],
    hp: base,
    hpMax: base,
    mp: 30,
    mpMax: 30,
    attack: Math.round(8 + realm * 3 + d * 2),
    defense: Math.round(4 + Math.floor(realm / 2) + d),
    speed: 8 + d,
  };
}

/** 上次现掷奇遇是哪一日；免得一日之内接连生事 */
let lastAdventureSpawnDay = 0;
/** 按月保底那处奇遇，这一日试过了没有；试过便不再一个时辰接一个时辰地空转 */
let lastMonthlyAdventureTry = "";
/** 上回宝物阁放出拍卖消息是哪一日；一日至多一桩 */
let lastAuctionSpawnDay = 0;

/**
 * 开局建档：把同一份开篇叙事并发交给多个领域助手，各自只写自己那一块。
 * 拆分的理由是单次调用要一次写完灵根、经脉、功法、物品、宗门、人脉，
 * 输出容易被 token 上限截断而变得笼统。
 * 单个领域失败不影响其余领域，失败部分留待后续回合补全。
 */
/** 补档前歇一口气，免得连着打过去；头一遍已是齐发，这里只稍作间隔 */
const OPENING_PAUSE_MS = 300;

/**
 * 开局建档的总时限。八门虽并发，模型一慢便没有尽头——
 * 到点便不再补档，先把已落的收下，缺的那几门留待后续回合补全
 * （回合提示词里有「身外补全」，见 buildOpsPrompt）。
 */
const OPENING_BUDGET_MS = 180000;

/** 单门单遍的时限。慢在这一步的多半是首字迟迟不来，给足两分半，胜过掐断后重打一遍 */
const OPENING_CALL_TIMEOUT_MS = 150000;

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 把外头的取消信号与一个时限并作一根：到点即断。
 * 只用来束住开局建档那几趟，别让它把整局开局一直吊着。
 */
function withinDeadline(signal: AbortSignal, ms: number): AbortSignal {
  const ctrl = new AbortController();
  if (signal.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), Math.max(0, ms));
  ctrl.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
    { once: true },
  );
  return ctrl.signal;
}

/**
 * 开局的修为由所选境界定档，不该由推演随手填。
 * 模型偶尔会写出远超本境界的数（如引气初期给 350），玩家一开局就能连破两境，早期养成便没了；
 * 这里把开局的修为压在本境界的门槛之内——门槛即「跨进这一境所耗」，刚入此境者不该比它更多。
 */
function clampOpeningCultivation(ops: DataOp[], realmIndex: number, baseCultivation: number): DataOp[] {
  const ceiling = Number(REALMS[realmIndex]?.cultivationNeeded);
  if (!Number.isFinite(ceiling)) return ops;

  const cap = Math.max(0, ceiling);
  let carried = Number.isFinite(baseCultivation) ? baseCultivation : 0;
  return ops.map((op) => {
    if (op.kind !== "modify" || op.path !== "player.cultivation") return op;
    const raw = Number(op.value);
    if (!Number.isFinite(raw)) return op;
    const next = op.op === "+" ? carried + raw : op.op === "-" ? carried - raw : raw;
    carried = Math.max(0, Math.min(next, cap));
    return { ...op, op: "=" as const, value: String(carried) };
  });
}

async function runOpeningExtraction(
  settings: AISettings,
  state: GameState,
  narrative: string,
  signal: AbortSignal,
  /** 每落完一门报一声，等待页照它显示进度 */
  onFiled?: (domainId: string, ok: boolean) => void,
  /** 每门开始返回来报一声，等待页不必等一门跑完便能报出正在办的那一门 */
  onDomainStart?: (domainId: string) => void,
): Promise<{ ops: DataOp[]; opsRaw: string; quickDecisions: string[]; missing: string[] }> {
  if (!narrative.trim()) {
    return { ...emptyExtraction(), missing: OPENING_DOMAINS.map((d) => d.label) };
  }

  const ask = async (
    domain: (typeof OPENING_DOMAINS)[number],
    model = settings.flashModel,
    terse = false,
    budgetMs = OPENING_CALL_TIMEOUT_MS,
  ) => {
    // 走流式：这一门的 JSON 动辄上千字，等它整段写完再回，往往先撞上转发层百秒的时限；
    // 边写边收既不会半路被掐，撞上 length 时还会自动接着续写，截断的 JSON 也就少了
    const raw = await chatWithModelStream(
      settings,
      model,
      buildOpeningDomainPrompt({
        domain: domain.id,
        // 开局正文可能很长，财宝等项常写在靠后处；截得太短会整门漏掉，故放到与存档同一上限
        narrative: narrative.slice(0, 20000),
        state,
        terse,
      }),
      {
        timeoutMs: budgetMs,
        // 单遍的时限之外还压着开局总时限：到点便断，别让这一门拖住整局
        signal: withinDeadline(signal, budgetMs),
        // 建档要的是合法 JSON，不是文采，温度压低些，少出岔子
        temperature: 0.25,
        // 八门建档在后台跑，429 不必弹窗惊动玩家；哪一门没写全由开局的提示统一说明
        muteRateLimitNotice: true,
      },
    );
    const parsed = parseJsonOps(raw);
    // 输出长而不成篇的，多半是被截断；记一笔，好与日志对照
    if (parsed.ops.length === 0) {
      console.warn(`[openingExtraction] ${domain.label} 这一遍没解出操作，原始输出 ${raw.length} 字`);
    }
    return parsed;
  };

  const byDomain = new Map<string, DataOp[]>();
  // 哪几门的这一遍是「整段 JSON 没成篇、只从残文里捡回几条」的：这类多半还漏着条目，
  // 不能当它已齐，得让后面的补档再跑一遍
  const salvagedDomains = new Set<string>();
  // 各门各留一份原始输出与各遍耗时，末了照领域次序拼回去——
  // 并发之下完成先后不定，若随完成次序堆叠，日志与原始输出都会乱掉
  const rawsByDomain = new Map<string, string[]>();
  const timingsByDomain = new Map<string, number[]>();
  const openingStart = Date.now();
  let quickDecisions: string[] = [];
  let dropped = 0;

  const noteSalvage = (domain: (typeof OPENING_DOMAINS)[number], salvaged: boolean) => {
    if (salvaged) salvagedDomains.add(domain.id);
    else salvagedDomains.delete(domain.id);
  };

  const take = (domain: (typeof OPENING_DOMAINS)[number], parsed: { ops: DataOp[]; opsRaw: string; quickDecisions: string[] }) => {
    const ownRaws = rawsByDomain.get(domain.id) ?? [];
    ownRaws.push(`【${domain.label}】\n${parsed.opsRaw}`);
    rawsByDomain.set(domain.id, ownRaws);
    const kept: DataOp[] = [];
    let domainDropped = 0;
    for (const op of parsed.ops) {
      if (!opBelongsToDomain(op, domain.id)) {
        dropped++;
        domainDropped++;
        continue;
      }
      // 模型偶尔把集合写成别称（technique、items、npcs 之类），
      // 认是认了，收下前得归一到正名，否则写回时仍会被丢掉
      if (op.kind === "add") {
        const canon = canonicalCollection(domain.id, op.collection);
        kept.push(canon && canon !== op.collection ? { ...op, collection: canon } : op);
      } else {
        kept.push(op);
      }
    }
    // 补档回来时，前一回已落下的（如财宝那一门的灵石）不能丢，故是并而非替；
    // 同一路径的 modify、同一集合同 id 的 add 以新的一遍为准
    const merged = [...(byDomain.get(domain.id) ?? []), ...kept];
    const seen = new Map<string, DataOp>();
    for (const op of merged) {
      const payloadId =
        op.kind === "add" && typeof op.payload === "object" && op.payload
          ? String((op.payload as Record<string, unknown>).id ?? "")
          : "";
      const key =
        op.kind === "modify"
          ? `m:${op.path}`
          : op.kind === "delete"
            ? `d:${op.collection}:${op.id}`
            : op.kind === "buy"
              ? `b:${op.name}:${op.price}`
              : `a:${op.collection}:${payloadId || seen.size}`;
      seen.set(key, op);
    }
    byDomain.set(domain.id, Array.from(seen.values()));
    if (parsed.quickDecisions.length > 0 && quickDecisions.length === 0) quickDecisions = parsed.quickDecisions;
    console.debug(`[openingExtraction] ${domain.label} 产出 ${kept.length} 条`);
    // 财宝这一门最容易「看着有产出、背包却空着」，单独把来龙去脉记清楚：
    // 解出几条、收下几条、随身之物与灵石各几件、越界丢弃几条，
    // 以及没写出随身之物时，模型到底把物件塞进了哪个集合名
    if (domain.id === "treasure") {
      const invAdds = kept.filter((op) => op.kind === "add" && op.collection === "inventory").length;
      const stoneMods = kept.filter((op) => op.kind === "modify" && op.path.startsWith("spiritStones.")).length;
      console.info(
        `[openingExtraction][treasure] 解出 ${parsed.ops.length} 条，收下 ${kept.length} 条（随身之物 ${invAdds}、灵石 ${stoneMods}），越界丢弃 ${domainDropped} 条`,
      );
      if (invAdds === 0) {
        const addColls = parsed.ops
          .filter((op): op is Extract<DataOp, { kind: "add" }> => op.kind === "add")
          .map((op) => op.collection);
        console.warn(
          `[openingExtraction][treasure] 未收下任何随身之物。原始输出里的 add 集合名：${
            addColls.length > 0 ? Array.from(new Set(addColls)).join("、") : "（无 add）"
          }；原始输出 ${parsed.opsRaw.length} 字，开头 400 字：${parsed.opsRaw.slice(0, 400)}`,
        );
      }
    }
    return kept.length;
  };

  // 判定一门是否真落了档。财宝这一门另有「灵石」这类 modify，若只写了灵石、
  // 没写随身之物，算它没成——否则这一门看着有产出、背包却始终是空的，
  // 后两遍便都不会再来补
  const domainSatisfied = (domain: (typeof OPENING_DOMAINS)[number]) => {
    // 这一门若只是从残文里救回来的，条目多半不全，仍算没齐，交给下一遍补
    if (salvagedDomains.has(domain.id)) return false;
    const ops = byDomain.get(domain.id) ?? [];
    if (domain.id === "treasure") {
      return ops.some((op) => op.kind === "add" && op.collection === "inventory");
    }
    return ops.length > 0;
  };

  const proModel =
    settings.proModel && settings.proModel !== settings.flashModel ? settings.proModel : settings.flashModel;

  /**
   * 一门的重试梯子：先快模型，未写齐便歇一口气换强模型再试，仍不齐则改「减负」版再试一遍。
   * 各门各跑各的梯子、互不等待——哪一门没写齐便是哪一门自己接着补，不必等最慢的那一门先落定，
   * 故整段耗时由「最慢的一门」而非「各遍之和」决定；落空得早的门也能更早开始补档。
   * 一门之内始终只有一次调用在途，故同时在途的请求数不会超过门数，接口不至于被一轮轰满。
   */
  // 八门共用一个到点时刻：到点便不再补档，先落定的不受影响
  const deadline = Date.now() + OPENING_BUDGET_MS;

  const runDomain = async (domain: (typeof OPENING_DOMAINS)[number]) => {
    const ladder = [
      { model: settings.flashModel, terse: false, note: "首遍" },
      { model: proModel, terse: false, note: "补档" },
      { model: proModel, terse: true, note: "减负补档" },
    ];
    for (let i = 0; i < ladder.length; i++) {
      if (signal.aborted) return;
      // 前一遍刚打过去，歇一口气再续
      if (i > 0) await waitMs(OPENING_PAUSE_MS);
      const remaining = deadline - Date.now();
      // 到点便收手：这一门已落下的照收，缺的留待后续回合补全
      if (signal.aborted || remaining < 5000) return;
      const step = ladder[i];
      const startedAt = Date.now();
      // 这一遍开始打过去了：先报一声，等待页好立刻报出正在办的那一门
      onDomainStart?.(domain.id);
      try {
        const parsed = await ask(domain, step.model, step.terse, Math.min(OPENING_CALL_TIMEOUT_MS, remaining));
        noteSalvage(domain, parsed.salvaged);
        const count = take(domain, parsed);
        if (i > 0) console.info(`[openingExtraction] ${domain.label} ${step.note}得 ${count} 条`);
        if (domainSatisfied(domain)) return;
      } catch (e) {
        if (!signal.aborted) console.warn(`[openingExtraction] ${domain.label} ${step.note}未成：`, e);
      } finally {
        const ownTimes = timingsByDomain.get(domain.id) ?? [];
        ownTimes.push(Date.now() - startedAt);
        timingsByDomain.set(domain.id, ownTimes);
      }
    }
  };

  /**
   * 开局落脚之处：先照正文自己认出落脚之城，认得出便不走模型。
   * 开局提示词本就要求起笔写清身在何处，正文里最先提到的那座城便是落脚地，
   * 由代码认领又快又准；只有正文一处城池也没写时，才花一趟调用去问模型。
   */
  const recognizePlace = async (): Promise<DataOp[]> => {
    if (signal.aborted) return [];
    const own: DataOp[] = [];

    const guess = findFirstMarkerInText(narrative);
    if (guess) {
      // 认得出就省下这一趟：一趟调用就是一段完整的思考，开局能省则省
      console.info(`[openingExtraction] 落脚之地认作正文首见之地：${guess.name}（不另走一趟模型）`);
      own.push({ kind: "modify", path: "currentPlaceId", op: "=", value: guess.id });
      return own;
    }

    let modelPlace = "";
    let location = "";
    try {
      const raw = await chatWithModel(settings, settings.flashModel, buildOpeningPlacePrompt(narrative), {
        timeoutMs: 45000,
        signal,
        jsonMode: true,
        retries: 1,
        temperature: 0.1,
        muteRateLimitNotice: true,
      });
      const parsed = (parseJsonPayload(raw) ?? {}) as { place?: unknown; location?: unknown };
      modelPlace = String(parsed.place ?? "").trim();
      location = String(parsed.location ?? "").trim();
    } catch (e) {
      if (!signal.aborted) console.warn("[openingExtraction] 场所识别未成：", e);
    }

    if (!modelPlace) {
      console.warn("[openingExtraction] 开篇里没认出落脚之地，暂留默认城池");
      return own;
    }
    console.info(`[openingExtraction] 落脚之地取自模型所认：${modelPlace}`);
    own.push({ kind: "modify", path: "currentPlaceId", op: "=", value: modelPlace });
    // 场所只认表里有的，认不出这一条自会被丢掉
    if (location) own.push({ kind: "modify", path: "currentLocation", op: "=", value: location });
    return own;
  };

  // 八门建档与落脚识别一并铺开：这一批便是开局并发的上限（门数 + 1）。
  // 各门自跑梯子、先落定的不再等后来的；落脚识别只跑一趟，随第一批同起。
  const placePromise = recognizePlace();
  await Promise.allSettled(
    OPENING_DOMAINS.map(async (domain) => {
      await runDomain(domain);
      // 这一门跑完了（成与不成都要报），等待页照它报进度
      onFiled?.(domain.id, domainSatisfied(domain));
    }),
  );
  const placeOps = await placePromise;

  const ops = [...OPENING_DOMAINS.flatMap((d) => byDomain.get(d.id) ?? []), ...placeOps];
  const opsRaw = OPENING_DOMAINS.flatMap((d) => rawsByDomain.get(d.id) ?? []).join("\n\n");
  const stillEmpty = OPENING_DOMAINS.filter((d) => !domainSatisfied(d)).map((d) => d.label);

  // 开局背包是不是空的，一眼能从日志看出来；空着时把各遍分别解出多少一并附上
  const invFinal = ops.filter((op) => op.kind === "add" && op.collection === "inventory").length;
  const stoneFinal = ops.filter((op) => op.kind === "modify" && op.path.startsWith("spiritStones.")).length;
  console.info(
    `[openingExtraction] 财宝定档：随身之物 ${invFinal} 件、灵石条目 ${stoneFinal} 条${
      invFinal === 0 ? "——各遍都没写出随身之物，开局背包会是空的" : ""
    }`,
  );

  if (dropped > 0) {
    console.warn(`[openingExtraction] 已丢弃 ${dropped} 条越界操作`);
  }
  if (stillEmpty.length > 0) {
    console.warn(`[openingExtraction] 以下领域几遍都没建档，数据留待后续回合补全：${stillEmpty.join("、")}`);
  }

  // 建档耗时分布：逐门报出各遍各耗多久，一眼看出这一局卡在哪一门、哪一遍
  const timingText = OPENING_DOMAINS.map((d) => {
    const list = timingsByDomain.get(d.id) ?? [];
    return `${d.label}[${list.length > 0 ? list.map((ms) => `${(ms / 1000).toFixed(1)}s`).join("+") : "未发"}]`;
  }).join(" ");
  console.info(
    `[openingExtraction] 建档总耗时 ${((Date.now() - openingStart) / 1000).toFixed(1)}s（八门并发，含落脚识别），逐门各遍：${timingText}`,
  );
  console.debug(`[openingExtraction] 合计 ${ops.length} 条数据操作`);

  // 开局的修为照所选境界压一道，免得推演把数值抬到与本境界不相称的地步
  const finalOps = clampOpeningCultivation(ops, state.player.realmIndex ?? 0, Number(state.player.cultivation) || 0);

  return { ops: finalOps, opsRaw, quickDecisions, missing: stillEmpty };
}

/**
 * 跨天是否更新快报：只由日期决定，与其它状态无关。
 * 对日期键取一个稳定的散列，落在阈值内便更新，故同一日的结果可复现。
 */
function shouldUpdateNewsOnDay(dayKey: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i++) {
    h ^= dayKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const roll = ((h >>> 0) % 1000) / 1000;
  return roll < 0.4;
}

/** 从模型输出里读回那段叙事；读不到就留空 */
function extractNewsNarrative(raw: string): string {
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const obj = JSON.parse(cleaned);
    return typeof obj?.narrative === "string" ? obj.narrative.trim() : "";
  } catch {
    return "";
  }
}

/**
 * 辑录一期快报：模型产出快报条目与天下变动，条目录入快报，
 * 变动由 applyOps 确定性写回世界与人物数据。返回本期叙事与变动摘要。
 */
async function runNewsReport(
  settings: AISettings,
  params: NewsReportParams,
  signal: AbortSignal,
): Promise<{ narrative: string; changes: string[]; newsCount: number }> {
  const state = useGameStore.getState().getSnapshot() as unknown as GameState;
  const raw = await chatWithModel(settings, settings.flashModel, buildNewsReportPrompt({ state, params }), {
    timeoutMs: 90000,
    signal,
    jsonMode: true,
    retries: 1,
    // 辑录要的是可读的条目与自洽的变动，温度略高些，但不出格
    temperature: 0.7,
  });

  const parsed = parseJsonOps(raw);
  const newsPayloads: { category: string; title: string; content: string; source: string }[] = [];
  const worldOps: DataOp[] = [];
  for (const op of parsed.ops) {
    if (op.kind === "add" && op.collection === "news.items") {
      const p: any = op.payload;
      if (p && p.title) {
        newsPayloads.push({
          category: String(p.category ?? "市井传言"),
          title: String(p.title),
          content: String(p.content ?? ""),
          source: String(p.source ?? "江湖传闻"),
        });
      }
    } else {
      worldOps.push(op);
    }
  }

  if (newsPayloads.length > 0) useGameStore.getState().updateNews(newsPayloads);
  if (worldOps.length > 0) useGameStore.getState().applyOps(worldOps);

  const changes = summarizeOps(worldOps).filter(Boolean);
  return { narrative: extractNewsNarrative(raw), changes, newsCount: newsPayloads.length };
}

/** 武馆挂出的一门低阶武学 */
export interface MartialArtOption {
  id: string;
  name: string;
  category: string;
  grade: string;
  element: string;
  proficiency: number;
  proficiencyMax: number;
  description: string;
  insight: string;
  /** 拜师学艺的束脩，下品灵石 */
  price: number;
}

/** 按品阶定的束脩 */
function martialPrice(grade: string): number {
  return grade === "灵品" ? 160 : 80;
}

/** 请武馆教习现列一份低阶武学名录；只出凡品、灵品，供来客花钱学 */
async function listMartialArts(
  settings: AISettings,
  culture: string | undefined,
  signal?: AbortSignal,
): Promise<MartialArtOption[]> {
  const state = useGameStore.getState().getSnapshot() as unknown as GameState;
  const raw = await chatWithModel(settings, settings.flashModel, buildMartialArtsPrompt({ state, culture }), {
    timeoutMs: 90000,
    signal,
    jsonMode: true,
    retries: 1,
    temperature: 0.85,
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
  } catch {
    parsed = null;
  }
  const list = Array.isArray(parsed?.techniques) ? parsed.techniques : [];
  return list.slice(0, 4).map((t: any, i: number) => {
    const grade = String(t?.grade ?? "凡品");
    return {
      id: `martial-${Date.now()}-${i}`,
      name: String(t?.name ?? "无名武学"),
      category: String(t?.category ?? "身法"),
      grade,
      element: String(t?.element ?? "金"),
      proficiency: 0,
      proficiencyMax: Math.max(60, Math.min(120, Number(t?.proficiencyMax) || 100)),
      description: String(t?.description ?? ""),
      insight: String(t?.insight ?? ""),
      price: martialPrice(grade),
    };
  });
}

/** 上一次推演重要人物行动是哪一日，免得同一日里重推 */
let lastNpcTickKey = "";

/**
 * 每逢初一、十五，为带「重要NPC」标签的人推演一段自主行动与数据概要，
 * 写进他们的记忆；同时把情谊低于 10 的人从尘缘里清掉。
 */
async function runNpcMonthlyTick(settings: AISettings, dayLabel: string, signal: AbortSignal): Promise<void> {
  const g = useGameStore.getState();
  // 关系低于 10 的，不再留在尘缘
  const lowIds = g.relations.filter((r) => migrateRelation(r).relation < 10).map((r) => r.id);
  if (lowIds.length > 0) {
    useGameStore.getState().removeRelations(lowIds);
    console.debug("[npcTick] 情谊太浅，已从尘缘抹去", lowIds.length, "人");
  }

  const important = g.relations.filter((r) => !lowIds.includes(r.id) && relationTags(r).includes("重要NPC"));
  if (important.length === 0) return;

  const raw = await chatWithModel(
    settings,
    settings.flashModel,
    buildNpcTickPrompt({
      state: g.getSnapshot() as unknown as GameState,
      day: dayLabel,
      npcs: important.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        realm: r.realm,
        note: r.note,
        memory: r.memory,
      })),
    }),
    { timeoutMs: 120000, signal, jsonMode: true, retries: 1, temperature: 0.85 },
  );

  let parsed: any = null;
  try {
    parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
  } catch {
    parsed = null;
  }
  const entries = Array.isArray(parsed?.npcs) ? parsed.npcs : [];
  for (const e of entries) {
    const id = String(e?.id ?? "");
    if (!id) continue;
    const parts: string[] = [];
    if (e.action) parts.push(`【${dayLabel}·行止】${String(e.action).trim()}`);
    if (e.summary) parts.push(`【${dayLabel}·概要】${String(e.summary).trim()}`);
    if (parts.length > 0) useGameStore.getState().appendRelationMemory(id, parts.join("\n"));
  }
  console.debug("[npcTick] 已为", entries.length, "位重要人物留下行动与概要");
}

/**
 * 流式调用的一套手钩：写出来的字先进 shopStream，再由各处窗口取用。
 * field 给了便只从 JSON 里抠那一个字段，省得把花括号摆给玩家看。
 */
function shopStreamHooks(
  set: (partial: Partial<AIStore> | ((state: AIStore) => Partial<AIStore>)) => void,
  key: string,
  field?: string,
  /** 写到这一串便打住：末尾那些记号不必给玩家看 */
  cutAt?: string,
) {
  return {
    onDelta: (_delta: string, full: string) => {
      const body = cutAt && full.includes(cutAt) ? full.slice(0, full.indexOf(cutAt)) : full;
      const text = field ? partialStringField(body, field) : body;
      set((s) => ({
        shopStream: { key, text, reasoning: s.shopStream?.key === key ? s.shopStream.reasoning : "" },
      }));
    },
    onReasoning: (_delta: string, fullReasoning: string) => {
      set((s) => ({
        shopStream: {
          key,
          text: s.shopStream?.key === key ? s.shopStream.text : "",
          reasoning: fullReasoning,
        },
      }));
    },
  };
}

/**
 * 拍卖落槌：定下谁得了，钱货两清，再请叙事写一段收场。
 * 玩家执牌便从囊中扣灵石、把东西收进行囊；客人执牌则只记一句。
 */
async function hammerAuction(auc: Auction, settings: AISettings): Promise<void> {
  const gs = useGameStore.getState();
  const price = Math.max(0, Math.trunc(auc.highBid ?? 0));
  const winner = price > 0 ? auctionLeaderName(auc) : "无人";
  const playerWins = price > 0 && auc.leaderId === "player";
  let won = false;
  let note = "";

  if (playerWins) {
    const lot = auc.lot;
    const paid = lot ? spendLowStones(gs.spiritStones, price) : null;
    if (lot && paid) {
      won = true;
      const type = lotItemType(lot);
      useGameStore.setState((s) => ({
        spiritStones: paid,
        inventory: [
          ...s.inventory,
          {
            id: `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
            name: lot.name,
            type,
            grade: lot.grade,
            count: 1,
            // 花的这一笔记在物件上：日后转手照它折价
            value: price,
            icon: lot.name.charAt(0),
            desc: [lot.story, lot.use].filter(Boolean).join(" ") || "在拍卖会上得的。",
          },
        ],
        log: [`你在「${auc.shopName}」的拍卖上以 ${price} 枚下品灵石得了「${lot.name}」。`, ...s.log].slice(0, 30),
      }));
    } else {
      note = "掌槌三声，囊中却凑不出这些灵石，这一件终究没能到手。";
    }
  }

  let closing = "";
  if (aiReady(settings)) {
    try {
      const now = useGameStore.getState();
      const brief = buildEventBrief(now as unknown as GameState, now.hereLabel());
      closing = String(
        (await chatWithModel(
          settings,
          settings.proModel,
          buildAuctionClosePrompt({
            brief,
            shop: auc.shopName,
            lotName: auc.lot?.name ?? "那件东西",
            lotStory: auc.lot?.story ?? "",
            price,
            winner,
            playerWon: won,
            rounds: Math.max(1, Math.trunc(auc.round ?? 1)),
          }),
          { timeoutMs: 120000, retries: 1 },
        )) ?? "",
      ).trim();
    } catch {
      closing = "";
    }
  }

  const fallback = price > 0 ? `掌槌三声，这一件归了${winner}。` : "三声槌响，无人应价，这一件流了。";
  useGameStore.getState().patchAuction(auc.id, {
    status: "done",
    winnerName: winner,
    won,
    result: note || closing || fallback,
  });
}

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      conversation: INITIAL_CONVERSATION,
      npcChat: INITIAL_NPC_CHAT,
      randomEvent: INITIAL_RANDOM_EVENT,
      adventure: INITIAL_ADVENTURE,
      auction: INITIAL_AUCTION,
      shopStream: INITIAL_SHOP_STREAM,
      battle: INITIAL_BATTLE,
      isDeveloperMode: false,
      randomEventDisabled: false,
      introSeen: false,
      isCraftingOpen: false,
      narrativeHaggle: null,
      narrativeShop: null,
      pendingChat: null,
      chatHidden: false,
      isStoryOpen: true,
      isSaveManagerOpen: false,

      setStoryOpen: (open) => set({ isStoryOpen: open }),
      setSaveManagerOpen: (open) => set({ isSaveManagerOpen: open }),
      openNarrativeHaggle: (brief) => set({ narrativeHaggle: brief }),
      closeNarrativeHaggle: () => set({ narrativeHaggle: null }),
      openNarrativeShop: (brief) => set({ narrativeShop: brief }),
      closeNarrativeShop: () => set({ narrativeShop: null }),
      confirmPendingChat: () => {
        const pending = get().pendingChat;
        if (!pending) return;
        set({ pendingChat: null });
        get().openNPCChat(pending.npc);
      },
      dismissPendingChat: () => set({ pendingChat: null }),
      hideNPCChat: () => set({ chatHidden: true, isStoryOpen: true }),
      showNPCChat: () => set({ chatHidden: false }),

      updateSettings: (patch) =>
        set((st) => {
          const next = { ...st.settings, ...patch };
          // 免费预设只认那一个模型名：没填自定义接口时一律钉死，
          // 免得旧存档或手改的模型名把请求发到不相干的上游
          if (!hasCustomApi(next)) {
            next.flashModel = FREE_MODEL.model;
            next.proModel = FREE_MODEL.model;
          }
          return { settings: next };
        }),

      setStage: (stage, msg = "") =>
        set((st) => ({
          conversation: { ...st.conversation, stage, errorMsg: msg },
        })),

      dismissOpeningWarning: () =>
        set((st) => ({
          conversation: { ...st.conversation, openingWarning: "" },
        })),

      cancel: () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        set((st) => ({
          conversation: {
            ...st.conversation,
            stage: "idle",
            errorMsg: "已取消生成。",
            pendingCrafting: null,
            streamingNarrative: "",
            streamingReasoning: "",
          },
          isCraftingOpen: false,
          npcChat: {
            ...st.npcChat,
            isTyping: false,
            errorMsg: "已取消生成。",
          },
        }));
      },

      setDeveloperMode: (enabled) =>
        // 退出开发者模式时把「关闭随机事件」一并收回：这个开关只在开发者模式下给用，
        // 若留着，路上便再没地方把它打开
        set({ isDeveloperMode: enabled, ...(enabled ? {} : { randomEventDisabled: false }) }),

      setRandomEventDisabled: (disabled) => {
        if (!get().isDeveloperMode) return;
        set({ randomEventDisabled: disabled });
      },

      markIntroSeen: () => set({ introSeen: true }),

      listMartialArts: async ({ culture }) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        return listMartialArts(settings, culture);
      },

      narrateBusking: async (brief) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        const text = await chatWithModel(settings, settings.proModel, buildBuskingPrompt(brief, questSettleHint()), {
          timeoutMs: 90000,
          retries: 1,
          temperature: 0.9,
        });
        return settleDoneMark(text);
      },

      narrateEstateDeal: async (brief) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        const text = await chatWithModel(
          settings,
          settings.proModel,
          buildEstateDealPrompt(brief, questSettleHint()),
          {
            timeoutMs: 90000,
            retries: 1,
            temperature: 0.9,
          },
        );
        return settleDoneMark(text);
      },

      judgeCrop: async ({ crop, culture }) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        const raw = await chatWithModel(settings, settings.flashModel, buildCropPrompt({ crop, culture }), {
          timeoutMs: 60000,
          jsonMode: true,
          retries: 1,
          temperature: 0.7,
        });
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
        } catch {
          parsed = null;
        }
        return { feasible: !!parsed?.feasible, reason: String(parsed?.reason ?? "") };
      },

      narrateRentOut: async (brief) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        const raw = await chatWithModel(settings, settings.flashModel, buildRentOutPrompt(brief), {
          timeoutMs: 60000,
          jsonMode: true,
          retries: 1,
          temperature: 0.8,
        });
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
        } catch {
          parsed = null;
        }
        return {
          tenant: String(parsed?.tenant ?? "").trim() || "租客",
          monthly: Math.max(0, Math.round(Number(parsed?.monthly) || 0)),
          text: String(parsed?.text ?? "").trim(),
        };
      },

      manageShop: async ({ shopId, instruction }) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        const shop = (useGameStore.getState().playerShops ?? []).find((s) => s.id === shopId);
        if (!shop) throw new Error("这间铺子已经不在了。");
        const brief: ShopManageBrief = {
          name: shop.name,
          kind: shop.kind,
          place: shop.place,
          culture: shop.culture,
          cash: shop.cash,
          monthlyIncome: shopMonthlyIncome(shop),
          monthlyExpenseTotal: shopMonthlyExpense(shop),
          goods: shop.goods,
          facilities: shop.facilities,
          businesses: shop.businesses ?? [],
          instruction: instruction.trim(),
        };
        const stream = shopStreamHooks(set, "manageShop", "text");
        let raw = "";
        try {
          raw = await chatWithModelStream(settings, settings.flashModel, buildShopManagePrompt(brief, questSettleHint("text")), {
            timeoutMs: 60000,
            temperature: 0.8,
            ...stream,
          });
        } finally {
          set({ shopStream: INITIAL_SHOP_STREAM });
        }
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
        } catch {
          parsed = null;
        }
        const finite = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);
        return {
          text: settleDoneMark(String(parsed?.text ?? "").trim()),
          goods: Array.isArray(parsed?.goods) ? (parsed.goods as ShopGood[]) : undefined,
          facilities: Array.isArray(parsed?.facilities) ? (parsed.facilities as ShopFacility[]) : undefined,
          businesses: Array.isArray(parsed?.businesses) ? (parsed.businesses as ShopBusiness[]) : undefined,
          monthlyIncome: finite(parsed?.monthlyIncome),
          monthlyExpense: finite(parsed?.monthlyExpense),
        };
      },

      setupNewShop: async (brief) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        const raw = await chatWithModel(settings, settings.flashModel, buildShopSetupPrompt(brief), {
          timeoutMs: 60000,
          jsonMode: true,
          retries: 1,
          temperature: 0.8,
        });
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
        } catch {
          parsed = null;
        }
        const kind = PLAYER_SHOP_KINDS.includes(parsed?.kind) ? (parsed.kind as ShopKind) : undefined;
        const finite = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);
        return {
          text: String(parsed?.text ?? "").trim(),
          kind,
          useStock: typeof parsed?.useStock === "boolean" ? parsed.useStock : undefined,
          goods: Array.isArray(parsed?.goods) ? (parsed.goods as ShopGood[]) : undefined,
          facilities: Array.isArray(parsed?.facilities) ? (parsed.facilities as ShopFacility[]) : undefined,
          monthlyIncome: finite(parsed?.monthlyIncome),
          monthlyExpense: finite(parsed?.monthlyExpense),
        };
      },

      designSectBuilding: async (brief) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        const raw = await chatWithModel(settings, settings.flashModel, buildSectBuildPrompt(brief), {
          timeoutMs: 60000,
          jsonMode: true,
          retries: 1,
          temperature: 0.8,
        });
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
        } catch {
          parsed = null;
        }
        // 账目一律夹在自己的区间里；理不出的一概作废，由界面拦住
        const custom = clampCustomFacility(parsed, brief.name);
        return {
          text: String(parsed?.text ?? "").trim(),
          name: brief.name,
          custom,
        };
      },

      appraiseEnding: async (narrative) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        return chatWithModel(settings, settings.proModel, buildEndingAppraisalPrompt(narrative), {
          timeoutMs: 90000,
          retries: 1,
          temperature: 0.9,
        });
      },

      openCrafting: () =>
        set({ isCraftingOpen: true }),

      closeCrafting: () => {
        const { pendingCrafting } = get().conversation;
        if (pendingCrafting) {
          set((st) => ({
            isCraftingOpen: false,
            conversation: {
              ...st.conversation,
              stage: "idle",
              pendingCrafting: null,
              errorMsg: "",
            },
          }));
        } else {
          set({ isCraftingOpen: false });
        }
      },

      resumeTurnAfterCrafting: async (result) => {
        const { settings, conversation } = get();
        const ctx = conversation.pendingCrafting;
        if (!ctx) return;
        if (!aiReady(settings)) {
          set((st) => ({
            conversation: { ...st.conversation, stage: "error", errorMsg: "推演接口尚未接通。" },
          }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        // 新的一回起笔，上一回摆着的入口便撤下
        set({ pendingChat: null });

        const gameState = useGameStore.getState().getSnapshot() as any;
        const summary = conversation.summary;

        set((st) => ({
          conversation: { ...st.conversation, stage: "pro", errorMsg: "" },
          isCraftingOpen: false,
        }));

        let narrative = "";
        let narrativeMode: string | null = null;
        let narrativeFoes: BattleFoeBrief[] | null = null;
        let narrativeSectWar: SectWarBrief | null = null;
        let narrativeHaggle: HaggleBrief | null = null;
        let narrativeShop: ShopBrief | null = null;
        // 叙事里有人当面搭话时，这一轮收束后把交谈窗叫起来
        let narrativeConverse: { npc: string } | null = null;
        let extraction = emptyExtraction();

        // Pro 只生成叙事正文
        const generateNarrative = async (model: string): Promise<string> => {
          const proStart = Date.now();
          let streamBlocked = false;
          set((st) => ({
            conversation: { ...st.conversation, streamingNarrative: "", streamingReasoning: "" },
          }));
          const proRaw = await chatWithModelStream(
            settings,
            model,
            buildProPrompt({
              state: gameState,
              summary,
              recentTurns: ctx.recentTurns,
              decision: ctx.decision,
              relevantData: ctx.relevantData,
              chatSummary: ctx.chatSummary,
              craftingResult: result,
              customPrompt: settings.customPrompt,
            }),
            {
              timeoutMs: 300000,
              signal,
              onDelta: (_delta, full) => {
                if (signal.aborted) return;
                // 高风险文字不上屏：一旦扫到，就把画面停在上一段干净的文字上
                if (!streamBlocked && scanNarrativeRisk(full)) streamBlocked = true;
                if (streamBlocked) return;
                set((st) => ({ conversation: { ...st.conversation, streamingNarrative: full } }));
              },
              onReasoning: (_delta, fullReasoning) => {
                if (signal.aborted) return;
                set((st) => ({ conversation: { ...st.conversation, streamingReasoning: fullReasoning } }));
              },
            },
          );
          const parsed = parseModelOutput(proRaw);
          narrativeMode = parsed.mode;
          narrativeFoes = parsed.battleFoes;
          narrativeSectWar = parsed.sectWar;
          narrativeHaggle = parsed.haggle;
          narrativeShop = parsed.shop;
          narrativeConverse = parsed.converse;
          const reviewed = await reviewNarrative(settings, parsed.narrative, signal);
          if ((streamBlocked || reviewed !== parsed.narrative) && !signal.aborted) {
            set((st) => ({ conversation: { ...st.conversation, streamingNarrative: reviewed } }));
          }
          set((st) => ({
            conversation: {
              ...st.conversation,
              lastProDuration: Date.now() - proStart,
              lastRawOutput: reviewed === parsed.narrative ? proRaw : reviewed,
            },
          }));
          return reviewed;
        };

        try {
          narrative = await generateNarrative(settings.proModel);
          if (signal.aborted) return;
        } catch (e) {
          if (signal.aborted) return;
          const errorMsg = (e as Error).message;
          const isNetworkError = errorMsg.includes("网络") || errorMsg.includes("CORS") ||
            errorMsg.includes("请求超时") || errorMsg.includes("不可达") || errorMsg.includes("重试");

          if (isNetworkError && settings.proModel !== settings.flashModel) {
            console.warn("[resumeCrafting] Pro模型失败，降级Flash...");
            try {
              narrative = await generateNarrative(settings.flashModel);
              if (signal.aborted) return;
            } catch (fallbackErr) {
              set((st) => ({
                conversation: {
                  ...st.conversation,
                  stage: "error",
                  pendingCrafting: null,
                  errorMsg: `叙事生成失败：${(fallbackErr as Error).message}`,
                },
              }));
              abortController = null;
              return;
            }
          } else {
            set((st) => ({
              conversation: {
                ...st.conversation,
                stage: "error",
                pendingCrafting: null,
                errorMsg: `叙事生成失败：${errorMsg}`,
              },
            }));
            abortController = null;
            return;
          }
        }

        // 后处理 Flash：从正文中识别数据变动
        extraction = await runOpsExtraction(settings, gameState, narrative, signal, {
          crafting: { type: ctx.craftingType, summary: result.summary },
          source: "crafting",
        });
        if (signal.aborted) return;

        set((st) => ({
          conversation: { ...st.conversation, quickDecisions: extraction.quickDecisions },
        }));

        const ops = extraction.ops;
        const opsRaw = extraction.opsRaw;

        // 结算里没能做成的买卖，回一句缀在正文末尾，让玩家看见「钱不够，没买成」
        const settleNotes = useGameStore.getState().applyOps(ops);
        if (settleNotes.length > 0) {
          narrative = `${narrative}\n\n${settleNotes.join("\n")}`;
        }

        const turn: Turn = {
          id: `turn-${Date.now()}`,
          playerInput: ctx.decision,
          mode: narrativeMode ?? undefined,
          battleFoes: narrativeFoes ?? undefined,
          sectWar: narrativeSectWar ?? undefined,
          haggle: narrativeHaggle ?? undefined,
          shop: narrativeShop ?? undefined,
          flashPaths: ctx.flashPaths,
          flashRaw: ctx.flashRaw,
          proRequest: {
            summary,
            recentTurns: ctx.recentTurns,
            decision: ctx.decision,
            relevantData: ctx.relevantData.slice(0, 3000),
          },
          narrative: narrative.slice(0, 20000),
          ops: ops.slice(0, 100),
          opsRaw: opsRaw.slice(0, 5000),
          applied: true,
          snapshot: gameState,
          timestamp: Date.now(),
        };

        await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

        set((st) => ({
          conversation: {
            ...st.conversation,
            turns: [...st.conversation.turns, turn],
            narrativeLog: keepNarrativeOf(st, turn),
            stage: "done",
            errorMsg: "",
            pendingChatSummary: "",
            pendingCrafting: null,
            streamingNarrative: "",
            streamingReasoning: "",
          },
        }));
        abortController = null;

        // 这一回有人当面搭话，便把交谈窗叫起来，让玩家自己接
        openChatFromNarrative(narrativeConverse);

        await get().compressNow();
        // 这个月还空着，便照月例补一处非任务奇遇
        get().ensureMonthlyAdventure();
      },

      runTurn: async (decision, opts) => {
        const trimmed = decision.trim();
        if (!trimmed) return;
        const { settings } = get();
        if (!aiReady(settings)) {
          set((st) => ({
            conversation: {
              ...st.conversation,
              stage: "error",
              errorMsg: "推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。",
            },
          }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        const game = useGameStore.getState();
        const gameState: import("@/data/types").GameState = {
          player: game.player,
          techniques: game.techniques,
          inventory: game.inventory,
          spiritStones: game.spiritStones,
          reputation: game.reputation,
          beast: game.beast,
          sectSites: game.sectSites,
          sectRelations: game.sectRelations,
          occupations: game.occupations ?? [],
          talismanRecipes: game.talismanRecipes,
          alchemyRecipes: game.alchemyRecipes,
          sect: game.sect,
          relations: game.relations,
          villages: game.villages ?? {},
          estates: game.estates ?? [],
          manorPlots: game.manorPlots ?? [],
          playerShops: game.playerShops ?? [],
          currentPanel: game.currentPanel,
          craftingTab: game.craftingTab,
          currentPlaceId: game.currentPlaceId,
          mapSceneId: game.mapSceneId,
          currentLocation: game.currentLocation,
          log: game.log,
          news: game.news,
          pillCache: game.pillCache,
          currentTime: game.currentTime,
          districtNames: game.districtNames,
          manors: game.manors,
          markets: game.markets,
          priceAdjusts: game.priceAdjusts,
          rumors: game.rumors,
          skills: game.skills,
          checks: game.checks,
          quests: game.quests,
          waseShows: game.waseShows,
          pawns: game.pawns,
          workshops: game.workshops,
          pacts: game.pacts,
          adventures: game.adventures,
          auctions: game.auctions ?? [],
        };

        const snapshot = game.getSnapshot();
        const conv = get().conversation;

        // ===== Stage 1: flash 判断相关数据 =====
        // 开局这一轮，玩家身上还没有数据，相关数据本就是整份档案——
        // 这一趟 flash 判断省去，直接进正文，少一个来回。
        const isFirstTurn = conv.turns.length === 0;
        let flashPaths: string[] = [];
        let flashWritable: string[] = [];
        let flashRaw = "";
        if (!isFirstTurn) {
          set((st) => ({
            conversation: { ...st.conversation, stage: "flash", errorMsg: "" },
          }));
          try {
            const schema = buildDataSchema(gameState);
            const flashStart = Date.now();
            flashRaw = await chatWithModel(
              settings,
              settings.flashModel,
              buildFlashPrompt(trimmed, schema, buildCatalogText()),
              { timeoutMs: 30000, signal, retries: 1, jsonMode: true },
            );
            const flashDecision = parseFlashDecision(flashRaw);
            flashPaths = flashDecision.paths;
            flashWritable = flashDecision.writable;
            const craftingType = flashDecision.crafting;
            console.debug("[route] 读", flashPaths.length, "条 / 可写", flashWritable.length, "条:", flashWritable.join("、"));

            set((st) => ({
              conversation: {
                ...st.conversation,
                lastFlashDuration: Date.now() - flashStart,
              },
            }));

            // 检测到炼丹/画符制作意图，暂停推演等待玩家操作
            if (craftingType) {
              const relevantDataForCrafting = resolveRelevantData(gameState, flashPaths);
              const recentTurnsForCrafting = recentForPrompt(conv.turns);
              const chatSummaryForCrafting = conv.pendingChatSummary || undefined;

              const craftingContext: CraftingContext = {
                decision: trimmed,
                flashPaths,
                flashRaw: flashRaw.slice(0, 2000),
                relevantData: relevantDataForCrafting,
                recentTurns: recentTurnsForCrafting,
                chatSummary: chatSummaryForCrafting,
                craftingType,
              };

              set((st) => ({
                conversation: {
                  ...st.conversation,
                  stage: "crafting_wait",
                  pendingCrafting: craftingContext,
                },
                isCraftingOpen: true,
              }));
              useGameStore.getState().setCraftingTab(craftingType);
              return;
            }
          } catch (e) {
            if (signal.aborted) return;
            const errorMsg = (e as Error).message;
            const isNetworkError = errorMsg.includes("网络") || errorMsg.includes("CORS") ||
              errorMsg.includes("请求超时") || errorMsg.includes("不可达") || errorMsg.includes("重试");
            set((st) => ({
              conversation: {
                ...st.conversation,
                stage: "error",
                errorMsg: isNetworkError
                  ? `网络连接失败：${errorMsg}\n请检查网络连接或在设置中更换Base URL。`
                  : `数据判断失败：${errorMsg}`,
              },
            }));
            abortController = null;
            return;
          }
        }

        const relevantData = isFirstTurn
          ? buildDataSchema(gameState)
          : resolveRelevantData(gameState, flashPaths);
        const recentTurns = recentForPrompt(conv.turns);
        const chatSummary = conv.pendingChatSummary || undefined;
        const proRequest = {
          summary: conv.summary,
          recentTurns,
          decision: trimmed,
          relevantData,
          chatSummary,
        };

        // ===== Stage 2: pro 生成叙事正文 =====
        set((st) => ({
          conversation: { ...st.conversation, stage: "pro", openingFiled: [], openingFeed: [], openingWarning: "" },
        }));

        let narrative = "";
        let narrativeMode: string | null = null;
        let narrativeFoes: BattleFoeBrief[] | null = null;
        let narrativeSectWar: SectWarBrief | null = null;
        let narrativeHaggle: HaggleBrief | null = null;
        let narrativeShop: ShopBrief | null = null;
        // 叙事里有人当面搭话时，这一轮收束后把交谈窗叫起来
        let narrativeConverse: { npc: string } | null = null;

        const generateNarrative = async (model: string): Promise<string> => {
          const proStart = Date.now();
          let streamBlocked = false;
          set((st) => ({
            conversation: { ...st.conversation, streamingNarrative: "", streamingReasoning: "" },
          }));
          const proRaw = await chatWithModelStream(
            settings,
            model,
            buildProPrompt({
              state: gameState,
              summary: conv.summary,
              recentTurns,
              decision: trimmed,
              relevantData,
              chatSummary,
              customPrompt: settings.customPrompt,
              opening: isFirstTurn,
            }),
            {
              timeoutMs: proTimeoutMs(settings),
              signal,
              onDelta: (_delta, full) => {
                if (signal.aborted) return;
                // 高风险文字不上屏：一旦扫到，就把画面停在上一段干净的文字上
                if (!streamBlocked && scanNarrativeRisk(full)) streamBlocked = true;
                if (streamBlocked) return;
                set((st) => ({ conversation: { ...st.conversation, streamingNarrative: full } }));
              },
              onReasoning: (_delta, fullReasoning) => {
                if (signal.aborted) return;
                set((st) => ({ conversation: { ...st.conversation, streamingReasoning: fullReasoning } }));
              },
            },
          );
          const parsed = parseModelOutput(proRaw);
          narrativeMode = parsed.mode;
          narrativeFoes = parsed.battleFoes;
          narrativeSectWar = parsed.sectWar;
          narrativeHaggle = parsed.haggle;
          narrativeShop = parsed.shop;
          narrativeConverse = parsed.converse;
          const reviewed = await reviewNarrative(settings, parsed.narrative, signal);
          if ((streamBlocked || reviewed !== parsed.narrative) && !signal.aborted) {
            set((st) => ({ conversation: { ...st.conversation, streamingNarrative: reviewed } }));
          }
          set((st) => ({
            conversation: {
              ...st.conversation,
              lastProDuration: Date.now() - proStart,
              lastRawOutput: reviewed === parsed.narrative ? proRaw : reviewed,
            },
          }));
          return reviewed;
        };

        try {
          narrative = await generateNarrative(settings.proModel);
          if (signal.aborted) return;
        } catch (e) {
          if (signal.aborted) return;
          const errorMsg = (e as Error).message;
          const isNetworkError = errorMsg.includes("网络") || errorMsg.includes("CORS") ||
            errorMsg.includes("请求超时") || errorMsg.includes("不可达") || errorMsg.includes("重试") ||
            errorMsg.includes("空内容");

          if (isNetworkError && settings.proModel !== settings.flashModel) {
            console.warn("[runTurn] Pro模型网络请求失败，尝试降级到Flash模型...");
            try {
              narrative = await generateNarrative(settings.flashModel);
              if (signal.aborted) return;
            } catch (fallbackErr) {
              console.error("[runTurn] Flash模型降级也失败:", fallbackErr);
              set((st) => ({
                conversation: {
                  ...st.conversation,
                  stage: "error",
                  errorMsg: `Pro模型网络请求失败，Flash模型降级也失败：${(fallbackErr as Error).message}\n请检查网络连接或在设置中更换Base URL。`,
                },
              }));
              abortController = null;
              return;
            }
          } else {
            set((st) => ({
              conversation: {
                ...st.conversation,
                stage: "error",
                errorMsg: isNetworkError
                  ? `网络连接失败：${errorMsg}\n请检查网络连接或在设置中更换Base URL。\n如果问题持续，可尝试切换为其他模型或降低温度设置。`
                  : `叙事生成失败：${errorMsg}`,
              },
            }));
            abortController = null;
            return;
          }
        }

        // ===== Stage 3: 后处理 flash 读取正文，识别数据变动 =====
        // 首回合要一次性建立整套角色档案，改走按领域并发建档；其余回合仍是增量结算
        const extraction =
          conv.turns.length === 0
            ? await runOpeningExtraction(
                settings,
                gameState,
                narrative,
                signal,
                // 一门落定：进已落之数，流水里也补一笔落定
                (id, ok) =>
                  set((st) => ({
                    conversation: {
                      ...st.conversation,
                      openingFiled: [...st.conversation.openingFiled, { id, ok }],
                      openingFeed: [...st.conversation.openingFeed, { id, phase: "done", ok }],
                    },
                  })),
                // 一门开始返回：流水里记一笔，等待页不等它跑完便能报出正在办的那一门
                (id) =>
                  set((st) => ({
                    conversation: {
                      ...st.conversation,
                      openingFeed: [...st.conversation.openingFeed, { id, phase: "doing", ok: false }],
                    },
                  })),
              )
            : await runOpsExtraction(settings, gameState, narrative, signal, {
                writable: flashWritable,
                source: "turn",
              });
        if (signal.aborted) return;

        // 开局八门若有没写全的，记一句，进主界面时提示；
        // 自带接口的玩家不套用这句「免费模型」的话
        if (
          conv.turns.length === 0 &&
          "missing" in extraction &&
          extraction.missing.length > 0 &&
          !hasCustomApi(settings)
        ) {
          set((st) => ({
            conversation: {
              ...st.conversation,
              openingWarning: "免费ai模型出现错误，部分数据未生成，不保证游玩可靠性。",
            },
          }));
        }

        set((st) => ({
          conversation: { ...st.conversation, quickDecisions: extraction.quickDecisions },
        }));

        const ops = extraction.ops;
        const opsRaw = extraction.opsRaw;

        // 回合推进时结算按回合计的增益与减益
        useGameStore.getState().updateBuffDuration();
        // 落账之前先记下时辰：结算有时会照叙事挪动时间，挪过的便不再补
        const timeBefore = useGameStore.getState().currentTime || OPENING_GAME_TIME;
        // 结算里没能做成的买卖，回一句缀在正文末尾，让玩家看见「钱不够，没买成」
        // 路由圈定的可写数据一并递下去，只作诊断，圈不着也照落账
        const settleNotes = useGameStore.getState().applyOps(ops, { writable: flashWritable });
        if (settleNotes.length > 0) {
          narrative = `${narrative}\n\n${settleNotes.join("\n")}`;
        }

        // 时间兜底：每过一轮，剧情至少走一个时辰。
        // 叙事模型未必肯照规矩回写 currentTime，若任它漏写，钟表便一直停在开篇那一刻，
        // 机缘误期、铺面月结、灵田收成全都无从谈起——故这里补上这一笔。
        // 开篇建档那一轮不算，那时故事还没开始走。
        if (conv.turns.length > 0) {
          const timeAfter = useGameStore.getState().currentTime || OPENING_GAME_TIME;
          if (timeSerial(timeAfter) === timeSerial(timeBefore)) {
            useGameStore.getState().advanceTime(1);
          }
        }

        // 前往奇遇的那一轮，结算之后由代码把位置钉到该点位，叙事只负责行路的经过
        if (opts?.travelToAdventureId) {
          useGameStore.getState().arriveAtAdventure(opts.travelToAdventureId);
        }

        // 开篇建档：寿元若被写成等同上限、或几近于 0，就地扶正，免得开局即因寿元耗尽终局
        if (conv.turns.length === 0) {
          useGameStore.getState().sanitizeOpeningLifespan();
        }

        const afterState = useGameStore.getState();

        // 建档落账之后，几样底子若仍空着，点一笔出来：
        // 这几处一空，玩家开局就没有功法、没有随身之物，也没有可说话的人
        const blankBasics = [
          Array.isArray(afterState.techniques) && afterState.techniques.length > 0 ? "" : "功法",
          Array.isArray(afterState.inventory) && afterState.inventory.length > 0 ? "" : "财宝",
          Array.isArray(afterState.relations) && afterState.relations.length > 0 ? "" : "尘缘",
          Array.isArray(afterState.skills) && afterState.skills.length > 0 ? "" : "本事",
        ].filter(Boolean);
        if (blankBasics.length > 0) {
          console.warn(
            `[runTurn] 结算之后仍空着的是：${blankBasics.join("、")}。下一轮推演会按空白档就地补齐。`,
          );
        }

        const hasNewsOp = ops.some((o) => o.kind === "add" && o.collection === "news.items");
        const hasNewsUpdate = afterState.news?.lastUpdate;

        const now = afterState.currentTime || OPENING_GAME_TIME;
        const todayKey = `${now.year}-${now.month}-${now.day}`;

        // 跨天更新快报：本轮既没写出新闻、又已跨到新的一天时，
        // 再由日期决定这天更不更新——同一日的结果可复现，不受其它状态影响
        const crossedDay = !hasNewsOp && (!hasNewsUpdate || hasNewsUpdate !== todayKey);
        if (crossedDay && shouldUpdateNewsOnDay(todayKey)) {
          try {
            await runNewsReport(settings, { scope: "天下", focus: "综合", count: 3 }, signal);
            console.debug("[runTurn] 跨天快报已按日期辑录");
          } catch (e) {
            if (!signal.aborted) {
              // 接口没接上等情形，退回一份按日期取的默认快报，至少别让这一天空着
              const defaultNews = generateDefaultNews(now);
              useGameStore.getState().updateNews(defaultNews);
              console.warn("[runTurn] 跨天快报辑录未成，改用默认快报:", e);
            }
          }
        }

        // 初一、十五：为带「重要NPC」标签的人推演一段自主行动与数据概要，并清掉情谊太浅的人
        if ((now.day === 1 || now.day === 15) && lastNpcTickKey !== todayKey) {
          lastNpcTickKey = todayKey;
          const dayLabel = now.day === 1 ? "初一" : "十五";
          try {
            await runNpcMonthlyTick(settings, dayLabel, signal);
          } catch (e) {
            if (!signal.aborted) console.warn("[runTurn] 重要人物推演未成:", e);
          }
        }

        const turn: Turn = {
          id: `turn-${Date.now()}`,
          playerInput: trimmed,
          // 开篇只立人物、铺世界，不该一上来就逐回合交锋：即便模型写了战斗标记也不认，
          // 免得开局便浮起一座没有敌人的空战场
          mode: isFirstTurn ? undefined : narrativeMode ?? undefined,
          battleFoes: isFirstTurn ? undefined : narrativeFoes ?? undefined,
          sectWar: isFirstTurn ? undefined : narrativeSectWar ?? undefined,
          haggle: isFirstTurn ? undefined : narrativeHaggle ?? undefined,
          shop: isFirstTurn ? undefined : narrativeShop ?? undefined,
          // 开局头一段另作记号：末尾不列数据变化，路上也先不生变故
          opening: isFirstTurn,
          flashPaths,
          flashRaw: flashRaw.slice(0, 2000),
          proRequest: {
            summary: proRequest.summary,
            recentTurns: proRequest.recentTurns,
            decision: proRequest.decision,
            relevantData: proRequest.relevantData.slice(0, 3000),
          },
          narrative: narrative.slice(0, 20000),
          ops: ops.slice(0, 100),
          opsRaw: opsRaw.slice(0, 5000),
          applied: true,
          snapshot,
          timestamp: Date.now(),
        };

        await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

        set((st) => ({
          conversation: {
            ...st.conversation,
            turns: [...st.conversation.turns, turn],
            narrativeLog: keepNarrativeOf(st, turn),
            stage: "done",
            errorMsg: "",
            pendingChatSummary: "",
            streamingNarrative: "",
            streamingReasoning: "",
          },
        }));
        abortController = null;

        // 这一回有人当面搭话，便把交谈窗叫起来，让玩家自己接
        openChatFromNarrative(narrativeConverse);

        await get().compressNow();
        // 这个月还空着，便照月例补一处非任务奇遇
        get().ensureMonthlyAdventure();
      },

      regenerate: async () => {
        const { conversation, settings } = get();
        if (conversation.stage === "flash" || conversation.stage === "pro") return;
        // 重演即重来：先前摆着的入口一并撤下，等这一回写完再摆
        set({ pendingChat: null });
        const lastTurn = conversation.turns[conversation.turns.length - 1];
        if (!lastTurn) return;
        if (!aiReady(settings)) {
          set((st) => ({
            conversation: {
              ...st.conversation,
              stage: "error",
              errorMsg: "推演接口尚未接通。",
            },
          }));
          return;
        }
        if (!lastTurn.snapshot) {
          set((st) => ({
            conversation: {
              ...st.conversation,
              stage: "error",
              errorMsg: "缺少回合快照，无法回滚后重新生成。",
            },
          }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        useGameStore.getState().restoreSnapshot(lastTurn.snapshot);

        await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

        set((st) => ({
          conversation: { ...st.conversation, stage: "pro", errorMsg: "" },
        }));

        // Pro 只重新生成叙事正文
        let narrative = "";
        let proRaw = "";
        let rawNarrative = "";
        let streamBlocked = false;
        let narrativeMode: string | null = null;
        let narrativeFoes: BattleFoeBrief[] | null = null;
        let narrativeSectWar: SectWarBrief | null = null;
        let narrativeHaggle: HaggleBrief | null = null;
        let narrativeShop: ShopBrief | null = null;
        // 重演这一回若有人当面搭话，收束后同样把交谈窗叫起来
        let narrativeConverse: { npc: string } | null = null;
        try {
          set((st) => ({
            conversation: {
              ...st.conversation,
              streamingNarrative: "",
              streamingReasoning: "",
              openingFiled: [],
              openingFeed: [],
              openingWarning: "",
            },
          }));
          proRaw = await chatWithModelStream(
            settings,
            settings.proModel,
            buildProPrompt({
              state: useGameStore.getState().getSnapshot() as any,
              summary: lastTurn.proRequest.summary,
              recentTurns: lastTurn.proRequest.recentTurns,
              decision: lastTurn.proRequest.decision,
              relevantData: lastTurn.proRequest.relevantData,
              customPrompt: settings.customPrompt,
            }),
            {
              timeoutMs: proTimeoutMs(settings),
              signal,
              onDelta: (_delta, full) => {
                if (signal.aborted) return;
                // 高风险文字不上屏：一旦扫到，就把画面停在上一段干净的文字上
                if (!streamBlocked && scanNarrativeRisk(full)) streamBlocked = true;
                if (streamBlocked) return;
                set((st) => ({ conversation: { ...st.conversation, streamingNarrative: full } }));
              },
              onReasoning: (_delta, fullReasoning) => {
                if (signal.aborted) return;
                set((st) => ({ conversation: { ...st.conversation, streamingReasoning: fullReasoning } }));
              },
            },
          );
          if (signal.aborted) return;
          const parsedRetry = parseModelOutput(proRaw);
          narrativeMode = parsedRetry.mode;
          narrativeFoes = parsedRetry.battleFoes;
          narrativeSectWar = parsedRetry.sectWar;
          narrativeHaggle = parsedRetry.haggle;
          narrativeShop = parsedRetry.shop;
          narrativeConverse = parsedRetry.converse;
          rawNarrative = parsedRetry.narrative;
          narrative = await reviewNarrative(settings, rawNarrative, signal);
          if ((streamBlocked || narrative !== rawNarrative) && !signal.aborted) {
            set((st) => ({ conversation: { ...st.conversation, streamingNarrative: narrative } }));
          }
        } catch (e) {
          if (signal.aborted) return;
          set((st) => ({
            conversation: {
              ...st.conversation,
              stage: "error",
              errorMsg: `重新生成失败：${(e as Error).message}`,
            },
          }));
          abortController = null;
          return;
        }

        // 后处理 flash 读取正文，识别数据变动；重演开局时同样走按领域并发建档
        const retryState = useGameStore.getState().getSnapshot() as any;
        const extraction =
          conversation.turns.length === 1
            ? await runOpeningExtraction(
                settings,
                retryState,
                narrative,
                signal,
                // 一门落定：进已落之数，流水里也补一笔落定
                (id, ok) =>
                  set((st) => ({
                    conversation: {
                      ...st.conversation,
                      openingFiled: [...st.conversation.openingFiled, { id, ok }],
                      openingFeed: [...st.conversation.openingFeed, { id, phase: "done", ok }],
                    },
                  })),
                // 一门开始返回：流水里记一笔，等待页不等它跑完便能报出正在办的那一门
                (id) =>
                  set((st) => ({
                    conversation: {
                      ...st.conversation,
                      openingFeed: [...st.conversation.openingFeed, { id, phase: "doing", ok: false }],
                    },
                  })),
              )
            : await runOpsExtraction(settings, retryState, narrative, signal, { source: "opening" });
        if (signal.aborted) return;

        // 重演开篇也照同一把尺：哪一门没写全，进主界面时提示
        if (
          conversation.turns.length === 1 &&
          "missing" in extraction &&
          extraction.missing.length > 0 &&
          !hasCustomApi(settings)
        ) {
          set((st) => ({
            conversation: {
              ...st.conversation,
              openingWarning: "免费ai模型出现错误，部分数据未生成，不保证游玩可靠性。",
            },
          }));
        }

        useGameStore.getState().applyOps(extraction.ops);

        await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

        set((st) => {
          const turns = [...st.conversation.turns];
          const regenerated: Turn = {
            ...lastTurn,
            // 重演开篇那一轮同样不认战斗标记：开篇不该开打
            mode: conversation.turns.length === 1 ? undefined : narrativeMode ?? undefined,
            battleFoes: conversation.turns.length === 1 ? undefined : narrativeFoes ?? undefined,
            sectWar: conversation.turns.length === 1 ? undefined : narrativeSectWar ?? undefined,
            haggle: conversation.turns.length === 1 ? undefined : narrativeHaggle ?? undefined,
            shop: conversation.turns.length === 1 ? undefined : narrativeShop ?? undefined,
            narrative: narrative.slice(0, 20000),
            ops: extraction.ops.slice(0, 100),
            opsRaw: extraction.opsRaw.slice(0, 5000),
            applied: true,
            timestamp: Date.now(),
          };
          turns[turns.length - 1] = regenerated;
          return {
            conversation: {
              ...st.conversation,
              turns,
              // 同一轮重演：照 id 换掉先前存下的那一回，不另起一条
              narrativeLog: keepNarrativeOf(st, regenerated),
              quickDecisions: extraction.quickDecisions,
              stage: "done",
              lastRawOutput: narrative === rawNarrative ? proRaw : narrative,
              streamingNarrative: "",
              streamingReasoning: "",
            },
          };
        });
        abortController = null;

        // 重演这一回若有人当面搭话，同样把交谈窗叫起来
        openChatFromNarrative(narrativeConverse);
      },

      compressNow: async () => {
        const { conversation, settings } = get();
        if (!needsCompression(conversation.turns)) return;
        const { oldTurns, recentTurns } = splitForCompression(conversation.turns);
        if (oldTurns.length === 0) return;

        try {
          const oldSummary = conversation.summary;
          const turnsData = oldTurns.map((t) => ({
            input: t.playerInput,
            narrative: t.narrative,
          }));
          const compressed = await chatWithModel(
            settings,
            settings.flashModel,
            buildCompressionPrompt(oldSummary, turnsData),
            { timeoutMs: 30000, retries: 1 },
          );
          set((st) => ({
            conversation: {
              ...st.conversation,
              turns: recentTurns,
              summary: clampSummary(compressed.trim()),
            },
          }));
        } catch (e) {
          console.warn("[compress] 压缩失败，保留原状:", e);
        }
      },

      clearConversation: () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        set({ conversation: INITIAL_CONVERSATION });
      },

      resetLedger: () => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        // 推演账与几扇临时窗口（交谈、战斗、变故、奇遇）都归零；
        // 接口设置保留，重开一局不必再填一次密钥
        set({
          conversation: INITIAL_CONVERSATION,
          npcChat: INITIAL_NPC_CHAT,
          battle: INITIAL_BATTLE,
          randomEvent: INITIAL_RANDOM_EVENT,
          adventure: INITIAL_ADVENTURE,
          narrativeHaggle: null,
          narrativeShop: null,
          pendingChat: null,
          chatHidden: false,
        });
      },

      restoreConversation: (conv: ConversationState) => {
        if (abortController) {
          abortController.abort();
          abortController = null;
        }
        const turns = Array.isArray(conv.turns)
          ? conv.turns.slice(-4).map((t) => ({
            ...t,
            snapshot: null,
            flashRaw: "",
            opsRaw: "",
            proRequest: {
              summary: t.proRequest?.summary || "",
              recentTurns: [],
              decision: t.proRequest?.decision || "",
              relevantData: "",
            },
          }))
          : [];
        set({
          conversation: {
            turns,
            summary: conv.summary || "",
            narrativeLog: Array.isArray(conv.narrativeLog) ? conv.narrativeLog : [],
            stage: turns.length > 0 ? "done" : "idle",
            errorMsg: "",
            lastFlashDuration: 0,
            lastProDuration: 0,
            lastRawOutput: "",
            // 推荐选项随存档一并带回：读档之后仍可照着上一回的提示往下走
            quickDecisions: Array.isArray(conv.quickDecisions)
              ? conv.quickDecisions.map((d) => String(d ?? "").trim()).filter(Boolean).slice(0, 8)
              : [],
            pendingChatSummary: "",
            pendingCrafting: null,
            streamingNarrative: "",
            streamingReasoning: "",
            openingFiled: [],
            openingFeed: [],
          },
        });
      },

      restoreNPCChat: (chat) => {
        // 只把人与话接回来；眼前开着的那一席、正打着字的那些，都是上一局的事，不随存档醒来
        const profiles = Array.isArray(chat?.profiles) ? chat!.profiles : [];
        set({
          npcChat: {
            ...INITIAL_NPC_CHAT,
            profiles: profiles.map((p) => ({
              ...p,
              messages: Array.isArray(p.messages) ? p.messages : [],
            })),
          },
        });
      },

      maybeTriggerRandomEvent: (hours) => {
        const st = get();
        if (st.randomEvent.active || st.randomEvent.busy) return;
        // 开发者模式里把关掉随机事件的开关拨上了，路上便不再生变故
        if (st.randomEventDisabled) return;
        // 正在推演、还没有接口、开局那一笔尚未落定，都不必生事
        if (st.conversation.stage === "flash" || st.conversation.stage === "pro") return;
        if (!aiReady(st.settings)) return;
        // 开局头一段只立人物、铺世界，路上先不生变故：
        // 末一轮正是那一段时按住不掷，等玩家真走过一轮再说
        const lastTurn = st.conversation.turns[st.conversation.turns.length - 1];
        if (!lastTurn || lastTurn.opening) return;

        const h = Math.max(0, Number(hours) || 0);
        // 一两个时辰的琐碎走动不生变故
        if (h < 2) return;

        const gs = useGameStore.getState();
        const today = daySerial(gs.currentTime);
        // 一日之内至多一桩，免得连着来
        if (today - (Number(st.randomEvent.openedDay) || 0) < 1) return;

        // 走得越久，路上碰见事的可能越大，至多四成半
        const chance = Math.min(0.45, 0.08 + h * 0.02);
        if (Math.random() > chance) return;

        void get().triggerRandomEvent(`往前走了约 ${h} 个时辰`);
      },

      triggerRandomEvent: async (reason) => {
        const { settings } = get();
        const gs = useGameStore.getState();
        const today = daySerial(gs.currentTime);

        if (!aiReady(settings)) {
          set((s) => ({
            randomEvent: {
              ...INITIAL_RANDOM_EVENT,
              active: true,
              title: "途中有变",
              reason,
              openedDay: today,
              errorMsg: "尚未配置通灵接口，路上的变故写不出来；接上接口再来，或到开发者模式里直接收场。",
            },
          }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        set((s) => ({
          randomEvent: {
            ...INITIAL_RANDOM_EVENT,
            active: true,
            busy: true,
            title: "途中有变",
            reason,
            openedDay: today,
          },
        }));

        const brief = buildEventBrief(gs as unknown as GameState, gs.hereLabel());

        try {
          const raw = await chatWithModel(settings, settings.proModel, buildRandomEventPrompt({ reason, brief }), {
            timeoutMs: 120000,
            signal,
            retries: 1,
          });
          if (signal.aborted) return;

          const { text: opening, options } = takeEventOptions(raw);
          if (!opening) throw new Error("这一段没写出来。");

          set((s) => ({ randomEvent: { ...s.randomEvent, busy: false, opening, options, errorMsg: "" } }));
          // 这一段里生出的数据变动照旧落账，落完把变化挂到这一段上
          const ops = await extractEventOps(settings, opening, signal);
          if (ops.length > 0) set((s) => ({ randomEvent: { ...s.randomEvent, openingOps: ops } }));
        } catch (e) {
          if (signal.aborted) return;
          set((s) => ({
            randomEvent: { ...s.randomEvent, busy: false, errorMsg: (e as Error)?.message || "这一段没写出来。" },
          }));
        }
      },

      replyRandomEvent: async (text) => {
        const { settings, randomEvent } = get();
        const content = String(text || "").trim();
        if (!content || randomEvent.busy) return;

        if (!aiReady(settings)) {
          set((s) => ({ randomEvent: { ...s.randomEvent, errorMsg: "尚未配置通灵接口。" } }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        const mine: RandomEventTurn = { id: `ev-${Date.now()}`, role: "player", content };
        set((s) => ({
          // 玩家既已出手，先前那几条选项便作废，等这一段的后果落定再给新的
          randomEvent: { ...s.randomEvent, busy: true, errorMsg: "", options: [], turns: [...s.randomEvent.turns, mine] },
        }));

        const gs = useGameStore.getState();
        const brief = buildEventBrief(gs as unknown as GameState, gs.hereLabel());
        const history = [...randomEvent.turns, mine]
          .map((t) => `${t.role === "player" ? "玩家" : "其中"}：${t.content}`)
          .join("\n");

        try {
          const raw = await chatWithModel(
            settings,
            settings.proModel,
            buildRandomEventReplyPrompt({
              reason: randomEvent.reason,
              brief,
              opening: randomEvent.opening,
              history,
              playerInput: content,
            }),
            { timeoutMs: 120000, signal, retries: 1 },
          );
          if (signal.aborted) return;

          // 先摘下应对选项那一块，余下的才是正文，收场记号也在正文里认
          const { text: body, options } = takeEventOptions(raw);
          // 收场记号摘下，另起一行的整行才算数
          const ended = new RegExp(`^\\s*${EVENT_END_MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(body);
          const passage = body.replace(new RegExp(EVENT_END_MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").trim();
          if (!passage) throw new Error("这一段没写出来。");

          const theirs: RandomEventTurn = { id: `ev-${Date.now()}-a`, role: "event", content: passage };
          set((s) => ({
            randomEvent: {
              ...s.randomEvent,
              busy: false,
              errorMsg: "",
              options,
              resolved: s.randomEvent.resolved || ended,
              turns: [...s.randomEvent.turns, theirs],
            },
          }));

          // 这一段落完账，把变化挂回这一段，末尾好列一笔
          const ops = await extractEventOps(settings, passage, signal);
          if (ops.length > 0) {
            set((s) => ({
              randomEvent: {
                ...s.randomEvent,
                turns: s.randomEvent.turns.map((t) => (t.id === theirs.id ? { ...t, ops } : t)),
              },
            }));
          }
        } catch (e) {
          if (signal.aborted) return;
          set((s) => ({
            randomEvent: { ...s.randomEvent, busy: false, errorMsg: (e as Error)?.message || "这一段没写出来。" },
          }));
        }
      },

      closeRandomEvent: (force) => {
        const st = get();
        if (!st.randomEvent.active) return true;
        // 只有模型认了了结，或开发者模式里强行收场，这扇窗才关得掉
        if (!st.randomEvent.resolved && !st.isDeveloperMode && !force) return false;
        abortController?.abort();
        abortController = null;
        set({
          randomEvent: { ...INITIAL_RANDOM_EVENT, openedDay: st.randomEvent.openedDay },
        });
        return true;
      },

      maybeSpawnAdventure: (hours) => {
        const st = get();
        if (!aiReady(st.settings)) return;
        if (st.adventure.active || st.adventure.busy) return;
        if (st.conversation.stage === "flash" || st.conversation.stage === "pro") return;
        if (st.conversation.turns.length === 0) return;

        const h = Math.max(0, Number(hours) || 0);
        if (h < 3) return;

        const gs = useGameStore.getState();
        const today = daySerial(gs.currentTime);
        // 一日至多现掷一处，免得连着来
        if (today - lastAdventureSpawnDay < 1) return;
        // 已经开着的够多了，就不再添
        if (openAdventures(gs).length >= ADVENTURE_OPEN_MAX) return;
        // 玩家所在那一带还有空位才生；没有便等日后再掷
        if (!pickAdventureSpotNear(gs, gs.currentPlaceId)) return;

        const chance = Math.min(0.3, 0.05 + h * 0.015);
        if (Math.random() > chance) return;
        void get().spawnAdventure(`往前走了约 ${h} 个时辰`);
      },

      ensureMonthlyAdventure: () => {
        const st = get();
        const gs = useGameStore.getState();
        const now = gs.currentTime;
        const today = daySerial(now);
        // 本月头一日到眼下：已开出一处非任务奇遇便算数了
        const monthStart = daySerial({ ...now, day: 1 });
        const hasThisMonth = (Array.isArray(gs.adventures) ? gs.adventures : []).some(
          (a) => !a?.questId && Number(a?.day) >= monthStart && Number(a?.day) <= today,
        );
        if (hasThisMonth) return;
        // 没有通灵接口便编不出奇遇；等配好接口，下一天再试
        if (!aiReady(st.settings)) return;
        if (st.adventure.active || st.adventure.busy) return;
        if (st.conversation.stage === "flash" || st.conversation.stage === "pro") return;
        // 开局那一轮还没落定，先不动，免得与开局那一处撞在一起
        if (st.conversation.turns.length === 0) return;
        // 一日至多试一回，免得一个时辰接一个时辰地白等
        const dayKey = gameDateKey(now);
        if (lastMonthlyAdventureTry === dayKey) return;
        lastMonthlyAdventureTry = dayKey;
        void get().spawnAdventure("按月例行的一处奇遇", undefined, { force: true });
      },

      spawnAdventure: async (reason, spotInput, opts) => {
        const { settings } = get();
        const gs = useGameStore.getState();
        const today = daySerial(gs.currentTime);
        lastAdventureSpawnDay = today;

        if (!aiReady(settings)) {
          useGameStore.getState().addLog("尚未配置通灵接口，奇遇现掷不出来。");
          return;
        }

        const explicit = !!spotInput;
        // 现点的那一处不再受数目上限约束；按月保底的那一处也不受此限，随手掷的仍守着上限
        if (!explicit && !opts?.force && openAdventures(gs).length >= ADVENTURE_OPEN_MAX) return;

        // 近处没有空位时，保底的那一处退而任取舆图上一处空位，不叫这一月空着
        const spot =
          spotInput ??
          pickAdventureSpotNear(gs, gs.currentPlaceId) ??
          (opts?.force ? pickAdventureSpot(gs) : undefined);
        if (!spot) {
          if (explicit) useGameStore.getState().addLog("这一处点位不在舆图上。");
          return;
        }
        // 现点的这一处得空着：宗门或别的奇遇没占着
        if (spotInput && !isPresetFree(gs, spot)) {
          useGameStore.getState().addLog("这一处已立着宗门或别的奇遇，另择一处。");
          return;
        }

        const cityId = nearestCityIdOf(spot) ?? gs.currentPlaceId;
        const city = getMarker(cityId);
        const where = city?.name || gs.hereLabel();

        abortController = new AbortController();
        const signal = abortController.signal;
        const brief = buildEventBrief(gs as unknown as GameState, gs.hereLabel());

        try {
          const raw = await chatWithModel(
            settings,
            settings.flashModel,
            buildAdventureSpawnPrompt({ brief, where, culture: city?.culture }),
            { timeoutMs: 60000, signal, jsonMode: true, retries: 1, temperature: 0.9 },
          );
          if (signal.aborted) return;
          const payload = parseJsonPayload(raw);
          if (!payload) {
            if (explicit) useGameStore.getState().addLog("这一处没编出来，再掷一回试试。");
            return;
          }
          const adv = normalizeAdventure(payload, {
            state: gs,
            spot,
            cityId,
            day: today,
            origin: "random",
          });
          if (!adv) return;
          useGameStore.getState().addAdventure(adv);
          console.debug(`[adventure] 现掷一处：${adv.name}（${adv.kind}·凶险${adv.danger}）于 ${where} 一带${reason ? `｜${reason}` : ""}`);
        } catch (e) {
          if (!signal.aborted) console.warn("[spawnAdventure] 这一处没生出来:", e);
        }
      },

      travelToAdventure: async (id) => {
        const gs = useGameStore.getState();
        const adv = (gs.adventures || []).find((a) => a.id === id);
        if (!adv) return;
        // 已经驻在这一处了，不必再走一趟
        if (gs.currentAdventureId === id) return;
        // 上一轮还在推演中，先不另起一趟行路
        const stage = get().conversation.stage;
        if (stage === "flash" || stage === "pro") return;
        await get().runTurn(`前往舆图上的「${adv.name}」（${adventureWhere(adv)}）一探究竟`, {
          travelToAdventureId: id,
        });
      },

      openAdventure: async (id) => {
        const { settings } = get();
        const gs = useGameStore.getState();
        const adv = (gs.adventures || []).find((a) => a.id === id);
        if (!adv) return;

        // 亲至该处才进得去：玩家眼下得正驻在这一处奇遇点位上
        if (gs.currentAdventureId !== adv.id) {
          set({ adventure: { ...INITIAL_ADVENTURE, errorMsg: "" } });
          useGameStore.getState().addLog(`「${adv.name}」尚在${adventureWhere(adv)}的野地里，须先前往那一处方可入内。`);
          return;
        }

        // 这一处先前进过：把说过的话原样摆回来，不再重写一遍
        const journal: AdventureLine[] = Array.isArray(adv.journal) ? adv.journal : [];
        if (journal.length > 0) {
          set({ adventure: restoreAdventureState(adv, false) });
          return;
        }

        set(() => ({
          adventure: {
            ...INITIAL_ADVENTURE,
            active: true,
            busy: !!aiReady(settings),
            id: adv.id,
            title: adv.name,
          },
        }));

        if (!aiReady(settings)) {
          set((s) => ({
            adventure: {
              ...s.adventure,
              busy: false,
              errorMsg: "尚未配置通灵接口，这一处写不出来；接上接口再来。",
            },
          }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;
        const brief = buildEventBrief(gs as unknown as GameState, gs.hereLabel());

        const persist = (lines: AdventureLine[], choices: AdventureChoice[]) => {
          useGameStore.getState().patchAdventure(adv.id, { journal: lines, choices });
        };

        try {
          const raw = await chatWithModel(
            settings,
            settings.proModel,
            buildAdventureOpeningPrompt({ adventure: toAdventureBrief(adv), brief }),
            { timeoutMs: 120000, signal, retries: 1 },
          );
          if (signal.aborted) return;
          const split = parseAdventureChoices(raw);
          const opening = split.body;
          if (!opening) throw new Error("这一段没写出来。");
          set((s) => ({ adventure: { ...s.adventure, busy: false, opening, choices: split.choices, errorMsg: "" } }));
          // 先落一版：万一下头取账被截断，收起窗后这一写仍在
          persist([{ role: "event", content: opening }], split.choices);
          // 这一处生出的数据变动照旧落账，落完把变化挂到开头那一段上
          const ops = await extractEventOps(settings, opening, signal);
          if (signal.aborted) return;
          if (ops.length > 0) {
            set((s) => ({ adventure: { ...s.adventure, openingOps: ops } }));
            persist([{ role: "event", content: opening, ops }], split.choices);
          }
        } catch (e) {
          if (signal.aborted) return;
          set((s) => ({
            adventure: { ...s.adventure, busy: false, errorMsg: (e as Error)?.message || "这一段没写出来。" },
          }));
        }
      },

      readAdventure: (id) => {
        const gs = useGameStore.getState();
        const adv = (gs.adventures || []).find((a) => a.id === id);
        if (!adv) return;
        const journal: AdventureLine[] = Array.isArray(adv.journal) ? adv.journal : [];
        if (journal.length === 0) {
          gs.addLog(`「${adv.name}」那处没留下什么话，无可回看。`);
          return;
        }
        abortController?.abort();
        abortController = null;
        set({ adventure: restoreAdventureState(adv, true) });
      },

      replyAdventure: async (text) => {
        const { settings, adventure } = get();
        const content = String(text || "").trim();
        if (!content || adventure.busy || !adventure.opening) return;

        if (!aiReady(settings)) {
          set((s) => ({ adventure: { ...s.adventure, errorMsg: "尚未配置通灵接口。" } }));
          return;
        }

        const gs = useGameStore.getState();
        const adv = (gs.adventures || []).find((a) => a.id === adventure.id);
        if (!adv) {
          set((s) => ({ adventure: { ...s.adventure, busy: false, errorMsg: "这一处已不在舆图上了。" } }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        const mine: RandomEventTurn = { id: `adv-${Date.now()}`, role: "player", content };
        set((s) => ({ adventure: { ...s.adventure, busy: true, errorMsg: "", turns: [...s.adventure.turns, mine] } }));

        const brief = buildEventBrief(gs as unknown as GameState, gs.hereLabel());
        const history = [...adventure.turns, mine]
          .map((t) => `${t.role === "player" ? "玩家" : "这一处"}：${t.content}`)
          .join("\n");

        try {
          const raw = await chatWithModel(
            settings,
            settings.proModel,
            buildAdventureReplyPrompt({
              adventure: toAdventureBrief(adv),
              brief,
              opening: adventure.opening,
              history,
              playerInput: content,
            }),
            { timeoutMs: 120000, signal, retries: 1 },
          );
          if (signal.aborted) return;

          // 先摘下正文之后那一段选择，再摘收场记号
          const split = parseAdventureChoices(raw);
          const { passage, resolved, keep } = parseAdventureEnd(split.body);
          if (!passage) throw new Error("这一段没写出来。");

          const theirs: RandomEventTurn = { id: `adv-${Date.now()}-a`, role: "event", content: passage };
          // 已了结的那一处不再列选择
          const nextChoices = resolved ? [] : split.choices;
          set((s) => ({
            adventure: {
              ...s.adventure,
              busy: false,
              errorMsg: "",
              resolved: s.adventure.resolved || resolved,
              keepAfter: keep || s.adventure.keepAfter,
              turns: [...s.adventure.turns, theirs],
              choices: nextChoices,
            },
          }));
          if (resolved) useGameStore.getState().settleAdventure(adventure.id, keep);
          // 把这一窗里说过的话收拢成一卷记到奇遇名下：收起窗后仍留着
          const persist = () => {
            const cur = get().adventure;
            if (cur.id !== adventure.id) return;
            useGameStore.getState().patchAdventure(adventure.id, {
              journal: adventureJournalOf(cur),
              choices: cur.choices,
            });
          };
          persist();
          // 这一段落完账，把变化挂回这一段，末尾好列一笔
          const ops = await extractEventOps(settings, passage, signal);
          if (ops.length > 0 && !signal.aborted) {
            set((s) => ({
              adventure: {
                ...s.adventure,
                turns: s.adventure.turns.map((t) => (t.id === theirs.id ? { ...t, ops } : t)),
              },
            }));
            persist();
          }
        } catch (e) {
          if (signal.aborted) return;
          set((s) => ({
            adventure: { ...s.adventure, busy: false, errorMsg: (e as Error)?.message || "这一段没写出来。" },
          }));
        }
      },

      actAdventure: async (action) => {
        const { adventure } = get();
        if (!adventure.active) return;
        if (action === "leave") {
          // 抽身离去：这一处仍留在舆图上，日后再来
          abortController?.abort();
          abortController = null;
          set({ adventure: INITIAL_ADVENTURE });
          return;
        }
        if (adventure.busy) return;

        if (action === "fight") {
          const gs = useGameStore.getState();
          const adv = (gs.adventures || []).find((a) => a.id === adventure.id);
          const foe = adventureFoe(adv?.danger ?? 2, gs.player?.realmIndex ?? 0);
          const companions = (Array.isArray(gs.relations) ? gs.relations : []).filter((r) => r.traveling);
          // 带伤上阵时，内伤一类状态压低了这一刻的气血上限
          const playerMaxHp = effectiveHpMax(gs.player);
          // 收起这一窗，好让战场浮上来；这一处仍留在舆图上，打完可再来
          abortController?.abort();
          abortController = null;
          set({ adventure: INITIAL_ADVENTURE });
          get().startBattle({
            width: 10,
            height: 10,
            entities: [
              {
                id: "player",
                name: gs.player?.name || "玩家",
                type: "player",
                position: { x: 5, y: 5 },
                hp: Math.min(Number(gs.player?.hp) || 0, playerMaxHp),
                maxHp: playerMaxHp,
                mp: gs.player?.mp,
                maxMp: gs.player?.mpMax,
              },
              ...companions.map((c, i) => ({
                id: `ally-${c.id}`,
                name: c.name,
                type: "ally" as const,
                position: { x: 4, y: 4 + i },
                hp: c.stats?.hp,
                maxHp: c.stats?.hpMax,
                mp: c.stats?.mp,
                maxMp: c.stats?.mpMax,
              })),
              {
                id: "enemy",
                name: foe.name,
                type: "enemy",
                position: { x: 7, y: 5 },
                hp: foe.hp,
                maxHp: foe.hpMax,
                mp: foe.mp,
                maxMp: foe.mpMax,
              },
            ],
          });
          return;
        }

        const picked = adventure.choices.find((c) => c.act === action);
        const canned =
          picked?.text ||
          (action === "explore"
            ? "我谨慎地四下查探，辨一辨这一处有什么门道、有什么凶险。"
            : "我试着与这一处的人或物交涉，先问明根由，再作计较。");
        await get().replyAdventure(canned);
      },

      chooseAdventure: async (choice) => {
        const { adventure } = get();
        if (!adventure.active || adventure.busy || adventure.reading) return;
        const act = choice?.act ?? "other";
        // 抽身与出手仍走原来的路子：一个收窗、一个摆开战场
        if (act === "leave") return get().actAdventure("leave");
        if (act === "fight") return get().actAdventure("fight");
        const text = String(choice?.text || "").trim();
        if (!text) return;
        await get().replyAdventure(text);
      },

      closeAdventure: () => {
        abortController?.abort();
        abortController = null;
        set({ adventure: INITIAL_ADVENTURE });
      },

      maybeSpawnAuction: (hours) => {
        const st = get();
        if (st.auction.active || st.auction.busy) return;
        if (st.conversation.stage === "flash" || st.conversation.stage === "pro") return;
        const h = Math.max(0, Number(hours) || 0);
        if (h < 2) return;
        const gs = useGameStore.getState();
        const today = daySerial(gs.currentTime);
        // 一日至多放出桩消息，免得一天里几家阁子一起拍
        if (today - lastAuctionSpawnDay < 1) return;
        if ((gs.auctions ?? []).filter((a) => a.status === "open").length >= AUCTION_MAX_OPEN) return;
        // 只有进过的坊市里才有宝物阁可挂；一间都没开过便先搁着
        if (!findTreasureShop(gs.markets, { preferCityId: gs.currentPlaceId })) return;
        const chance = Math.min(0.16, 0.03 + h * 0.008);
        if (Math.random() > chance) return;
        lastAuctionSpawnDay = today;
        get().spawnAuction();
      },

      spawnAuction: (reason, shopName, opts) => {
        const gs = useGameStore.getState();
        const today = daySerial(gs.currentTime);
        const found = findTreasureShop(gs.markets, { shopName, preferCityId: gs.currentPlaceId });
        if (!found) return;
        const gap = AUCTION_NOTICE_DAYS;
        const wantedDay = Math.trunc(Number(opts?.day));
        const day = Number.isFinite(wantedDay) && wantedDay > 0
          ? wantedDay
          : today + gap[0] + Math.floor(Math.random() * (gap[1] - gap[0] + 1));
        const wantedHour = Math.trunc(Number(opts?.hour));
        const auction: Auction = {
          id: `auction-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          shopId: found.shop.id,
          shopName: found.shop.name,
          cityId: found.cityId,
          districtId: found.districtId,
          day: Math.max(today, day),
          hour: Number.isFinite(wantedHour) ? Math.min(11, Math.max(0, wantedHour)) : 6,
          reason: String(reason ?? "").trim() || rollAuctionReason(),
          status: "open",
        };
        const before = (gs.auctions ?? []).length;
        useGameStore.getState().addAuction(auction);
        // 挂了没挂上（同日同铺已有一场）便不再多嘴
        if ((useGameStore.getState().auctions ?? []).length === before) return;
        // 街口也传开了：传闻面板里看得见，日子一到好去
        const cityName = getMarker(found.cityId)?.name ?? "";
        const when = auction.day <= today ? "今日" : `${auction.day - today} 日后`;
        useGameStore.getState().addRumors([
          {
            text: `${cityName ? `${cityName}的` : ""}「${found.shop.name}」${auction.reason}，定在${when}开拍，去晚了便只剩空场。`,
            source: "街口闲话",
            auctionId: auction.id,
          },
        ]);
      },

      openAuction: async (id) => {
        const { settings } = get();
        const gs = useGameStore.getState();
        const auc = (gs.auctions ?? []).find((a) => a.id === id);
        if (!auc) return;
        const today = daySerial(gs.currentTime);
        if (auc.status !== "open") {
          gs.addLog(`「${auc.shopName}」那一场已经散了。`);
          return;
        }
        // 拍卖就开在那家阁子里：人不在那一城，进不去
        if (gs.currentPlaceId !== auc.cityId) {
          gs.addLog(`「${auc.shopName}」在${getMarker(auc.cityId)?.name ?? "别处"}，须亲往那一城才进得去。`);
          return;
        }
        if (auc.day > today) {
          gs.addLog(`「${auc.shopName}」的拍卖定在 ${auc.day - today} 日后，眼下还没开场。`);
          return;
        }

        // 先前进来过：拍品与来客都还在，接着拍便是
        if (auc.lot && (auc.bidders ?? []).length > 0) {
          set({ auction: { ...INITIAL_AUCTION, active: true, id: auc.id, opening: auc.opening ?? "" } });
          return;
        }

        set({ auction: { ...INITIAL_AUCTION, active: true, busy: !!aiReady(settings), id: auc.id } });
        if (!aiReady(settings)) {
          set((s) => ({
            auction: { ...s.auction, busy: false, errorMsg: "尚未配置通灵接口，这一场写不出来；接上接口再来。" },
          }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;
        const brief = buildEventBrief(gs as unknown as GameState, gs.hereLabel());
        // 来客里可有一位是旧识：把这几位报给模型，由它挑
        const known = (Array.isArray(gs.relations) ? gs.relations : [])
          .filter((r) => r?.name)
          .slice(0, 12)
          .map((r) => `${r.name}（${r.title || "旧识"}）`);
        const culture = getMarker(gs.currentPlaceId)?.culture;

        try {
          const raw = await chatWithModel(
            settings,
            settings.proModel,
            buildAuctionOpenPrompt({
              brief,
              shop: auc.shopName,
              city: getMarker(auc.cityId)?.name,
              culture,
              reason: auc.reason,
              known,
            }),
            { timeoutMs: 120000, signal, retries: 1 },
          );
          if (signal.aborted) return;
          const payload = parseJsonPayload(raw) as Record<string, unknown> | null;
          const lot = normalizeAuctionLot(payload?.lot);
          if (!lot) throw new Error("这一场的拍品没写出来。");
          const bidders = normalizeAuctionBidders(payload?.bidders, lot.basePrice);
          // 一位客人都没写出来，便请一位城里的富户来撑个场面，免得无人抬价
          if (bidders.length === 0) {
            bidders.push({
              id: "bidder-1",
              name: "城中富户",
              identity: "过路客商",
              persona: "看着不声不响，出价倒稳",
              budget: Math.max(lot.basePrice, Math.round(lot.basePrice * 2)),
              keen: 0.5,
            });
          }
          const opening = String(payload?.opening ?? "").trim();
          useGameStore.getState().patchAuction(auc.id, {
            lot,
            bidders,
            highBid: 0,
            leaderId: "",
            round: 0,
            silent: 0,
            lines: [],
            opening,
          });
          set((s) => ({
            auction: {
              ...s.auction,
              busy: false,
              opening: opening || "掌槌的清了清嗓子，抬手示意众人安静。",
              errorMsg: "",
            },
          }));
        } catch (e) {
          if (signal.aborted) return;
          set((s) => ({
            auction: { ...s.auction, busy: false, errorMsg: (e as Error)?.message || "这一场没能开起来。" },
          }));
        }
      },

      bidAuction: async () => {
        const { auction, settings } = get();
        if (!auction.active || auction.busy) return;
        const gs = useGameStore.getState();
        const auc = (gs.auctions ?? []).find((a) => a.id === auction.id);
        if (!auc || auc.status !== "open" || !auc.lot) return;
        if (auctionHammered(auc)) return;
        // 已经是你执牌，再叫便是替自己抬价，没有这个道理
        if (auc.leaderId === "player" && (auc.highBid ?? 0) > 0) {
          set((s) => ({ auction: { ...s.auction, errorMsg: "眼下已是你执牌，等着看还有谁跟。" } }));
          return;
        }
        const next = auctionNextBid(auc);
        if (lowStonesWorth(gs.spiritStones) < next) {
          set((s) => ({
            auction: { ...s.auction, errorMsg: `囊中折尽也不够 ${next} 枚下品灵石，叫不上去了。` },
          }));
          return;
        }
        const updated = applyPlayerBid(auc);
        useGameStore.getState().patchAuction(auc.id, updated);
        set((s) => ({ auction: { ...s.auction, errorMsg: "" } }));
        if (auctionHammered(updated)) await hammerAuction(updated, settings);
      },

      passAuction: async () => {
        const { auction, settings } = get();
        if (!auction.active || auction.busy) return;
        const gs = useGameStore.getState();
        const auc = (gs.auctions ?? []).find((a) => a.id === auction.id);
        if (!auc || auc.status !== "open" || !auc.lot) return;
        if (auctionHammered(auc)) return;
        const updated = applyPlayerPass(auc);
        useGameStore.getState().patchAuction(auc.id, updated);
        set((s) => ({ auction: { ...s.auction, errorMsg: "" } }));
        if (auctionHammered(updated)) await hammerAuction(updated, settings);
      },

      closeAuction: () => {
        set({ auction: INITIAL_AUCTION });
      },

      generateTaskNpcs: async (args) => {
        const { settings } = get();
        if (!aiReady(settings) || args.npcs.length === 0) return;
        const gs = useGameStore.getState();
        const avoid = (Array.isArray(gs.relations) ? gs.relations : []).map((r) => r?.name).filter(Boolean) as string[];

        try {
          const raw = await chatWithModel(
            settings,
            settings.flashModel,
            buildTaskNpcPrompt({
              questName: args.questName,
              questDesc: args.questDesc,
              npcs: args.npcs.map((n) => ({ title: n.title, gender: n.gender, persona: n.persona })),
              avoid,
            }),
            { timeoutMs: 40000, jsonMode: true, retries: 1, temperature: 0.95 },
          );
          const parsed = parseJsonPayload(raw);
          const list: any[] = Array.isArray(parsed?.npcs)
            ? parsed.npcs
            : Array.isArray(parsed?.names)
              ? parsed.names
              : [];
          if (list.length === 0) return;

          // 修为只认这一档次，认得别的便不动，免得给接头人配上不相称的身手
          const REALM_POOL = ["凡人", "炼气初期", "炼气中期", "炼气后期", "筑基初期"];
          const clean = (v: unknown, max: number) =>
            String(v ?? "").trim().replace(/[「」『』\s]/g, "").slice(0, max);

          type NpcPatch = {
            name?: string;
            gender?: string;
            age?: number;
            origin?: string;
            personality?: string;
            appearance?: string;
            realm?: string;
          };
          const updates: { id: string; patch: NpcPatch }[] = [];

          args.npcs.forEach((n, i) => {
            const rawItem = list[i];
            const item = typeof rawItem === "string" ? { name: rawItem } : rawItem;
            if (!item || typeof item !== "object") return;

            const patch: NpcPatch = {};
            const name = clean(item.name, 12);
            if (name && name !== n.title) patch.name = name;
            if (item.gender === "男" || item.gender === "女") patch.gender = item.gender;
            const age = Math.trunc(Number(item.age));
            if (Number.isFinite(age) && age >= 8 && age <= 200) patch.age = age;
            const origin = clean(item.origin, 20);
            if (origin) patch.origin = origin;
            const personality = clean(item.personality, 20);
            if (personality) patch.personality = personality;
            const appearance = clean(item.appearance, 20);
            if (appearance) patch.appearance = appearance;
            const realm = clean(item.realm, 8);
            if (REALM_POOL.includes(realm)) patch.realm = realm;

            if (Object.keys(patch).length > 0) updates.push({ id: n.id, patch });
          });

          if (updates.length > 0) useGameStore.getState().patchRelations(updates);
        } catch (e) {
          // 立传这一步失败就沿用原样，不影响差事本身
          console.warn("[generateTaskNpcs] 立传未成，沿用原样:", e);
        }
      },

      getOrCreateNPCProfile: async (npcId, name, title) => {
        const { npcChat, settings } = get();
        const existing = npcChat.profiles.find((p) => p.npcId === npcId);
        if (existing) return existing;

        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通。");
        }

        try {
          const player = useGameStore.getState().player;
          const relation = useGameStore.getState().relations.find((r) => r.id === npcId);
          // 关系（-100~100）与信任（1~5 档）；念给模型时把关系折算回 0~100 的好感度
          const bond = relation ? migrateRelation(relation) : { relation: 0, trust: 2 };
          const affinity = Math.round((bond.relation + 100) / 2);

          const statsStr = relation?.stats
            ? `[战斗属性] HP:${relation.stats.hp}/${relation.stats.hpMax} MP:${relation.stats.mp}/${relation.stats.mpMax} 攻击:${relation.stats.attack} 防御:${relation.stats.defense} 速度:${relation.stats.speed}`
            : "";
          const techStr = relation?.techniqueIds?.length
            ? `[掌握功法] ${relation.techniqueIds.join(", ")}`
            : "";

          const personaStr = relation
            ? [
                relation.gender && relation.gender !== "不详" ? `性别：${relation.gender}` : "",
                relation.age ? `年岁：${relation.age}` : "",
                relation.realm ? `境界：${relation.realm}` : "",
                relation.origin ? `出身：${relation.origin}` : "",
                relation.personality ? `性情：${relation.personality}` : "",
                relation.appearance ? `形貌：${relation.appearance}` : "",
                relation.affiliation && relation.affiliation !== "无" ? `所属：${relation.affiliation}` : "",
                relation.metAt ? `相遇处：${relation.metAt}` : "",
                relation.location ? `眼下所在：${relation.location}` : "",
              ]
                .filter(Boolean)
                .join("\n")
            : "";

          const prompt = [
            {
              role: "system" as const,
              content: `你是一位修真界的人物设定专家。请为以下 NPC 生成详细的人设提示词。

NPC 信息：
姓名：${name}
称号：${title}
与玩家关系：${relation?.note || "暂无"}
好感度：${affinity}/100（关系 ${bond.relation}，信任第 ${bond.trust} 档）
${personaStr ? `已定下的人设（必须照此写，不要另起炉灶）：\n${personaStr}\n` : ""}${statsStr ? `${statsStr}\n` : ""}${techStr ? `${techStr}\n` : ""}

玩家信息：
姓名：${player.name}
道号：${player.title}
境界：${player.realmIndex === 0 ? "炼气初期" : player.realmIndex === 1 ? "筑基期" : "金丹期"}
宗门：${player.sectName}

请生成：
1. 性格特点（50字以内）——描述NPC的性格、处事方式
2. 说话风格（30字以内）——描述NPC的语气、用词习惯
3. 背景故事（100字以内）——描述NPC的来历、修为境界、宗门归属、与玩家的过往交集
4. 立场态度（30字以内）——描述NPC对玩家的态度、立场、可能的帮助或阻碍

格式要求：
PERSONA: [性格特点]
STYLE: [说话风格]
BACKGROUND: [背景故事]
ATTITUDE: [立场态度]`,
            },
          ];

          // 叙事当初就给这人写定了人设，照它演便是，不必再让模型现编一份
          if (relation?.persona?.trim()) {
            const initialPrompt = `你是「${name}」，称号「${title}」。
${personaStr ? `${personaStr}\n` : ""}${statsStr ? `${statsStr}\n` : ""}${techStr ? `${techStr}\n` : ""}
【人设】${relation.persona}${relation.note ? `\n【与玩家的渊源】${relation.note}` : ""}
${relation.memory ? `【你心里记着的事】${relation.memory}\n` : ""}【对玩家态度】关系 ${bond.relation}，信任第 ${bond.trust} 档（好感约 ${affinity}/100）
你正在与「${player.name}」（${player.title}）交谈。请以你的身份回复对方的话语，保持角色一致性，前后一致，不要另起炉灶。
${DIALOGUE_STYLE}`;

            const profile: NPCProfile = {
              npcId,
              name,
              title,
              persona: relation.persona.slice(0, 60),
              initialPrompt,
              messages: [],
              lastUpdated: Date.now(),
              scene: get().npcChat.pendingScene ?? undefined,
            };

            set((st) => ({
              npcChat: {
                ...st.npcChat,
                profiles: [...st.npcChat.profiles, profile],
              },
            }));

            return profile;
          }

          const raw = await chatWithModel(settings, settings.flashModel, prompt, {
            timeoutMs: 30000,
          });

          let persona = "";
          let style = "";
          let background = "";
          let attitude = "";

          const personaMatch = raw.match(/PERSONA:\s*(.+)/);
          const styleMatch = raw.match(/STYLE:\s*(.+)/);
          const backgroundMatch = raw.match(/BACKGROUND:\s*(.+)/);
          const attitudeMatch = raw.match(/ATTITUDE:\s*(.+)/);

          if (personaMatch) persona = personaMatch[1].trim();
          if (styleMatch) style = styleMatch[1].trim();
          if (backgroundMatch) background = backgroundMatch[1].trim();
          if (attitudeMatch) attitude = attitudeMatch[1].trim();

          if (!persona) {
            persona = `${title}，性格沉稳，处事有度。`;
          }
          if (!style) {
            style = "语气平和，言辞简练，偶尔引经据典。";
          }
          if (!attitude) {
            attitude = affinity >= 70 ? "对玩家友善，愿意提供帮助" :
              affinity >= 40 ? "与玩家保持中立，态度礼貌" :
                "对玩家冷淡或敌对";
          }

          // 街市上结识的可能是凡人，统称「修真者」会串味，这里只报姓名与称号
          const initialPrompt = `你是「${name}」，称号「${title}」。
${personaStr ? `${personaStr}\n` : ""}${statsStr ? `${statsStr}\n` : ""}${techStr ? `${techStr}\n` : ""}
【性格】${persona}
【说话风格】${style}
${background ? `【背景】${background}\n` : ""}
【对玩家态度】${attitude}
你正在与「${player.name}」（${player.title}）交谈。请以你的身份回复对方的话语，保持角色一致性。
${DIALOGUE_STYLE}`;

          const profile: NPCProfile = {
            npcId,
            name,
            title,
            persona,
            initialPrompt,
            messages: [],
            lastUpdated: Date.now(),
            scene: get().npcChat.pendingScene ?? undefined,
          };

          set((st) => ({
            npcChat: {
              ...st.npcChat,
              profiles: [...st.npcChat.profiles, profile],
            },
          }));

          return profile;
        } catch (e) {
          throw new Error(`生成人设失败：${(e as Error).message}`);
        }
      },

      sendNPCMessage: async (npcId, content) => {
        const { npcChat, conversation, settings } = get();
        if (!aiReady(settings)) {
          set((st) => ({
            npcChat: { ...st.npcChat, errorMsg: "推演接口尚未接通。" },
          }));
          return;
        }

        const profile = npcChat.profiles.find((p) => p.npcId === npcId);
        if (!profile) {
          set((st) => ({
            npcChat: { ...st.npcChat, errorMsg: "未找到该 NPC 的人设信息。" },
          }));
          return;
        }

        abortController = new AbortController();
        const signal = abortController.signal;

        set((st) => ({
          npcChat: { ...st.npcChat, isTyping: true, errorMsg: "" },
        }));

        const playerMsg: NPCMessage = {
          id: `msg-${Date.now()}`,
          role: "player",
          content: content.trim(),
          timestamp: Date.now(),
        };

        set((st) => ({
          npcChat: {
            ...st.npcChat,
            profiles: (Array.isArray(st.npcChat.profiles) ? st.npcChat.profiles : []).map((p) =>
              p.npcId === npcId
                ? { ...p, messages: [...(Array.isArray(p.messages) ? p.messages : []), playerMsg], lastUpdated: Date.now() }
                : p,
            ),
          },
        }));

        const recentStoryTurns = recentForPrompt(conversation.turns);
        const storyContext = recentStoryTurns
          .map((t) => `玩家：${t.input}\n叙述：${t.narrative.slice(0, 300)}`)
          .join("\n---\n");

        // 旁注不进上文：那是给玩家看的，别让模型当成对方说过的话
        const recentMessages = (Array.isArray(profile.messages) ? profile.messages : [])
          .filter((m) => m.role !== "system")
          .slice(-10);
        const chatHistory = recentMessages
          .map((m) => `${m.role === "player" ? "玩家" : profile.name}：${m.content}`)
          .join("\n");

        const gameState = useGameStore.getState();
        const location = gameState.currentLocation;
        const cityName = getMarker(gameState.currentPlaceId)?.name ?? "未知之地";
        const locationName = LOCATIONS.find((l) => l.id === location)?.name ?? location;

        const time = gameState.currentTime;
        const timeStr = formatGameTime(time);

        const relation = gameState.relations.find((r) => r.id === npcId);
        const relationType = relation?.type || "friend";
        const relationLabels: Record<string, string> = {
          dao_companion: "道侣",
          master: "师父",
          disciple: "弟子",
          friend: "好友",
          enemy: "仇敌",
        };

        // 报上身上几门本事与最近的判定，谈话里才好考较，也才好接着上次的话头
        const brief = skillBrief();
        const isBroker = profile.scene?.kind === "牙行";
        // 只有坐在客栈茶棚的堂里才谈得上做东叫菜；牙行柜前没有这一说
        const isDining = profile.scene?.kind === "客栈" || profile.scene?.kind === "茶棚";
        // 匠人区里那位工匠的场面：上门是来定做东西的
        const craft = profile.scene?.craft;
        // 牙行柜上交代的差事，去处只能落在本城真有的地方与认得的人身上
        const brokerPlaces = isBroker
          ? getDistricts(gameState.currentPlaceId).map(
              (d) => gameState.districtNames?.[`${gameState.currentPlaceId}:${d.id}`] || d.nature,
            )
          : [];
        const brokerPeople = isBroker
          ? gameState.relations
              .filter((r) => r.cityId === gameState.currentPlaceId && r.type !== "enemy")
              .map((r) => r.name)
          : [];
        // 把玩家身上在办的事摊给这一位：认下哪一桩时，名称照抄，别另编
        const todaySerial = daySerial(gameState.currentTime);
        const openQuests = (Array.isArray(gameState.quests) ? gameState.quests : []).filter(
          (q) => q?.status === "open",
        );
        // 与这位相干的排前头：他托付的、或要找他交差的，别被十桩以外的挤掉
        const relatedQuests = openQuests.filter(
          (q) => q.giver === profile.name || q.target?.person === profile.name,
        );
        const listedQuests = [
          ...relatedQuests,
          ...openQuests.filter((q) => !relatedQuests.includes(q)),
        ].slice(0, 12);
        const questBrief = listedQuests.length
          ? listedQuests
              .map((q) => {
                const realm = questRealmGoalLabel(q);
                const item = questItemGoalLabel(q);
                const stone = questStoneGoalLabel(q);
                const where = realm
                  ? `修到${realm}`
                  : item
                    ? `寻得${item}`
                    : stone
                      ? `凑足${stone}`
                      : q.target?.label || q.place || "去处未定";
                const due =
                  q.dueDay === undefined
                    ? "不限时"
                    : q.dueDay < todaySerial
                      ? `已误期${todaySerial - q.dueDay}日`
                      : `第${q.dueDay}日止`;
                return `「${q.name}」〔编号 ${q.id}〕｜托自${q.giver || "某人"}｜${where}｜交差：${q.condition || "未写明"}｜${due}`;
              })
              .join("\n")
          : "（眼下没有在办的事）";

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `${profile.initialPrompt}

【游戏背景】
这是一个古风修真世界，存在宗门、功法、丹药、符箓等元素。境界分为炼气、筑基、金丹、元婴等。

【当前时间】：${timeStr}
【玩家当前所在】：${cityName} · ${locationName}
【与玩家关系】：${relationLabels[relationType]}（${bondLabel(relation ?? {})}）
【旁人眼里的他】：${reputationBrief(gameState.reputation)}
${profile.scene && !craft ? `【这一席】：你们正在「${profile.scene.shop}」的堂里同席，桌上摊着吃食酒水。\n` : ""}${craft ? `【这一处】：你正在「${profile.scene!.shop}」的作坊里，手边是${craft}的家什。玩家找上门，多半是要定做一件东西——你先掂量料钱与工钱，问他用途与分量，嫌麻烦也好、说这料不好凑也好，都由着你的性子；掂量完了再报一个价与取货的日子。价钱落在 ${CRAFT_PRICE_RANGE[0]} 到 ${CRAFT_PRICE_RANGE[1]} 枚下品灵石之间，取货的日子落在 ${CRAFT_DAYS_RANGE[0]} 到 ${CRAFT_DAYS_RANGE[1]} 日之内。价钱只是报下，须得他当面付了钱才算定下；他若出不起，你只管把话说死，或干脆说不接这活。\n` : ""}${isBroker ? `【这一处】：你正在「${profile.scene!.shop}」的柜上主事。牙行替四方牵线揽差事，柜上常年挂着几桩等人来接。玩家问起有什么可做的，你就拣一桩交代下去——去处、限期、交差的条件、赏多少，都要说清楚；赏钱由柜上先押着，事办成了要他回柜上领才算到手，别在话里把赏当场给了他。\n【去处只许这几处】：${brokerPlaces.join("、") || "（眼下没有）"}；【能托付的人只许这几位】：${brokerPeople.join("、") || "（眼下没有，就只交代跑地方的事）"}。去处与人名都要照抄这几个，一个字都不要另编。\n` : ""}
【玩家的市井本事】：${brief.skills}
【最近的判定】：${brief.checks}
【玩家身上在办的事】（认下时只认与你相干的：你托付的，或该交到你手上的）：
${questBrief}

【当前剧情上下文】：
${conversation.summary || "暂无"}
${storyContext || "暂无"}

【本次对话记录】：
${chatHistory || "暂无"}

${DIALOGUE_STYLE}

【回复要求】：
1. 以「${profile.name}」的身份和口吻回复，保持角色一致性
2. 照上面那段「对话文风」落笔
3. 回复要符合你的性格、背景和对玩家的态度
4. 根据剧情上下文和对话历史，做出合理的回应
5. 回复长度适中，不要太长也不要太短（50-200字）
6. ${checkInstruction()}
7. 若你话语间把一桩事托付给了玩家（请他替你跑一趟、捎个口信、寻一样东西，或与他约定期限修到某一层境界），就在回话的最后另起一行只写 ${QUEST_MARK} 类别 | 名称 | 去处 | 几日后到期 | 交差条件 | 赏 名目 数额 | 罚 名目 数额。类别只写 事件、地点、人物、修为、物品、灵石 之一：事件是当场起落、未必有固定去处的事，去处可留空；地点是奔着某一处去的、人物是奔着某个人去的，这两类去处须写具体；修为是修到某一层境界便算办到的长期目标，去处一栏改填境界全称（如「炼气后期」），不必有去处与人；物品是寻某一样东西，去处一栏改填「物名×件数」（如「青玉佩×2」）；灵石是凑某数灵石，去处一栏改填数目（如「300」），四等灵石按一比一百折成下品算。物品与灵石两类都不必有去处与人。名称不超过 10 字；去处写去哪儿办，如「城南药铺」，事件类、修为类、物品类与灵石类之外都要写；到期只写数字，如 3，表示三日之内，不限时可留空；赏的名目只取 灵石、修为、物品、人情、正道名声、魔道名声、平民名声、官府名声 之一，罚的名目只取 灵石、修为、业力、正道名声、魔道名声、平民名声、官府名声 之一，名目不在其内的就留空；不托付就不写这一行。${isBroker ? "你替柜上交代的差事，同样照这个格式写在末尾，去处与限期要写实在。" : ""}
8. 成与不成由你照剧情判，系统只照单落账。若玩家当真办成了你先前托付的那件事，就在回话的最后另起一行只写 ${SETTLE_MARK} 编号或名称 | done；若这桩事黄了、误了期，写 ${SETTLE_MARK} 编号或名称 | failed。编号或名称须照【玩家身上在办的事】里的一桩抄，有编号优先抄编号，认不出是哪一桩就不写。事没到那一步也不写。${isBroker ? "你柜上记下的差事也照此认下；认得之后就让他回柜上来领赏，赏钱此刻还在柜上押着。" : ""}
9. 若你与玩家当面说定了一桩口头的约定（约他改日再来、替他留一样东西、应下替他办件事），就在回话的最后另起一行只写 ${PACT_MARK} 名目 | 地点 | 几日后 | 说明。名目不超过 10 字；地点写去哪儿了结，说不清可留空；几日后只写数字，如 3，表示三日之内。没跟他说定就不写这一行。${craft ? `\n10. 你若把这件定做的活计应下了、并把价钱与取货的日子也说定了，就在回话的最后另起一块，只输出下面这一块：
${CRAFT_MARK}
{"name":"做成的东西叫什么，不超过 20 字","type":"${profile.scene!.craftHint || "材料/丹药/符箓/法宝/杂物 之一"}","grade":"凡品/灵品/玄品/天品/仙品 之一","desc":"一句 20 到 40 字的说明","icon":"一个汉字","elements":{"金":60,"水":30},"price":200,"days":5}
<<<END>>>
价钱只取 ${CRAFT_PRICE_RANGE[0]} 到 ${CRAFT_PRICE_RANGE[1]}，日子只取 ${CRAFT_DAYS_RANGE[0]} 到 ${CRAFT_DAYS_RANGE[1]}；他还没说要做什么、你还没应下、或价钱没说定时，这一块就不写。这一块若写，便放在全篇最末。` : ""}
${craft ? 11 : 10}. 若话说到这里，接下来已不是席上几句能了结的——他要随你起身出门、上船启程、同去某处，或当场动起手来——就在回话的最后另起一行只写 ${STORY_MARK} 一句话写明玩家接下来做什么、往哪里去，如「随他起身往城南码头，登船离岸」。只是随口提及去处、人还没动身，就不要写这一行。
${craft ? 12 : 11}. ${isDining
                ? `你若要替他叫一道菜做东，就在回话的最后另起一行只写 ${TREAT_MARK}。`
                : ""}上面点名的 ${CHECK_MARK}、${QUEST_MARK}、${SETTLE_MARK}、${PACT_MARK}、${STORY_MARK}${craft ? `、${CRAFT_MARK}` : ""}${isDining ? `、${TREAT_MARK}` : ""} 这几行，格式须照要求写，别写岔了，也别另起别的记号。除此之外，这一席话里当真谈定了什么、给了他什么、受了伤、许下多少钱财货物、传了什么功法消息，只管照实说出口去，不必因为不在上面那几行之内就绕着不说——话里如实发生的事，系统自会照看落账。`,
          },
          {
            role: "user" as const,
            content: content.trim(),
          },
        ];

        /** 把一句 NPC 回话添进这一席 */
        const appendNpcLine = (msg: NPCMessage, typing: boolean) => {
          set((st) => ({
            npcChat: {
              ...st.npcChat,
              isTyping: typing,
              profiles: (Array.isArray(st.npcChat.profiles) ? st.npcChat.profiles : []).map((p) =>
                p.npcId === npcId
                  ? { ...p, messages: [...(Array.isArray(p.messages) ? p.messages : []), msg], lastUpdated: Date.now() }
                  : p,
              ),
            },
          }));
        };

        /**
         * 一席话散了，把这一段里的实事照账落下：给出去的东西、许下的钱、动过的手，
         * 都按分类表由路由认一遍，认得什么便落什么，不再因为「这是私聊」就一概不记。
         */
        const settleTalk = async (npcLine: string) => {
          const text = `玩家：${content.trim()}\n${profile.name}：${npcLine}`;
          if (!text.trim() || signal.aborted) return;
          try {
            const state = useGameStore.getState().getSnapshot() as unknown as GameState;
            const extraction = await runOpsExtraction(settings, state, text, signal, { source: "npc" });
            if (signal.aborted || extraction.ops.length === 0) return;
            useGameStore.getState().applyOps(extraction.ops);
            console.debug("[npcChat] 这一席落账", extraction.ops.length, "条");
          } catch (e) {
            if (!signal.aborted) console.warn("[npcChat] 这一席的数据结算未成:", e);
          }
        };

        /**
         * 判定过了，NPC 方才那半句话还悬着：把结果交回模型，
         * 让它顺着话头再开一次口，把该给的答案交出来。
         */
        const deliverReply = async (raw: string, model: string) => {
          const checkBox: { check: SkillCheck | null; failed: SkillCheck | null } = { check: null, failed: null };
          const spoken = await reviewNarrative(
            settings,
            settleNPCMarks(raw, profile, (check) => {
              if (check.success) checkBox.check = check;
              else checkBox.failed = check;
            }),
            signal,
          );
          if (signal.aborted) return;

          // 话里带了转场的意思：这一句照旧入席，随后收窗转叙事
          const { text: shown, cue } = takeStoryCue(spoken);

          appendNpcLine(
            { id: `msg-${Date.now()}`, role: "npc", content: shown, timestamp: Date.now() },
            !!checkBox.check,
          );

          await settleTalk(shown);

          if (cue) {
            handOffChatToNarration(profile.name, cue);
            return;
          }

          // 判定没过：当面留一句旁注，玩家得知道自己这一考没接住
          if (checkBox.failed) {
            appendNpcLine(
              {
                id: `msg-${Date.now()}-check`,
                role: "system",
                content: checkFailNote(checkBox.failed),
                timestamp: Date.now(),
              },
              false,
            );
          }

          if (!checkBox.check) return;
          const passed = checkBox.check;
          try {
            const stream = shopStreamHooks(set, "npc", undefined, "<<<");
            let followRaw = "";
            try {
              followRaw = await chatWithModelStream(
                settings,
                model,
                [
                  ...prompt,
                  { role: "assistant" as const, content: spoken },
                  { role: "system" as const, content: checkPassedInstruction(profile, passed) },
                ],
                { timeoutMs: 120000, signal, ...stream },
              );
            } finally {
              set({ shopStream: INITIAL_SHOP_STREAM });
            }
            if (signal.aborted) return;

            const followSpoken = await reviewNarrative(
              settings,
              settleNPCMarks(followRaw, profile),
              signal,
            );
            if (signal.aborted || !followSpoken.trim()) return;

            const follow = takeStoryCue(followSpoken);
            appendNpcLine(
              {
                id: `msg-${Date.now()}-cont`,
                role: "npc",
                content: follow.text,
                timestamp: Date.now(),
              },
              false,
            );
            await settleTalk(follow.text);
            if (follow.cue) handOffChatToNarration(profile.name, follow.cue);
          } catch (e) {
            if (!signal.aborted) console.warn("[sendNPCMessage] 判定通过后的续话未成:", e);
          } finally {
            if (!signal.aborted) {
              set((st) => ({ npcChat: { ...st.npcChat, isTyping: false } }));
            }
          }
        };

        try {
          const stream = shopStreamHooks(set, "npc", undefined, "<<<");
          let raw = "";
          try {
            raw = await chatWithModelStream(settings, settings.proModel, prompt, {
              timeoutMs: 120000,
              signal,
              ...stream,
            });
          } finally {
            set({ shopStream: INITIAL_SHOP_STREAM });
          }

          if (signal.aborted) return;

          await deliverReply(raw, settings.proModel);
        } catch (e) {
          if (signal.aborted) return;
          const errorMsg = (e as Error).message;
          const isNetworkError = errorMsg.includes("网络") || errorMsg.includes("CORS") ||
            errorMsg.includes("请求超时") || errorMsg.includes("不可达") || errorMsg.includes("重试");

          if (isNetworkError && settings.proModel !== settings.flashModel) {
            console.warn("[sendNPCMessage] Pro模型网络请求失败，尝试降级到Flash模型...");
            try {
              const stream = shopStreamHooks(set, "npc", undefined, "<<<");
              let raw = "";
              try {
                raw = await chatWithModelStream(settings, settings.flashModel, prompt, {
                  timeoutMs: 120000,
                  signal,
                  ...stream,
                });
              } finally {
                set({ shopStream: INITIAL_SHOP_STREAM });
              }

              if (signal.aborted) return;

              await deliverReply(raw, settings.flashModel);
            } catch (fallbackErr) {
              console.error("[sendNPCMessage] Flash模型降级也失败:", fallbackErr);
              set((st) => ({
                npcChat: {
                  ...st.npcChat,
                  isTyping: false,
                  errorMsg: `Pro模型网络请求失败，Flash模型降级也失败：${(fallbackErr as Error).message}\n请检查网络连接或在设置中更换Base URL。`,
                },
              }));
            }
          } else {
            set((st) => ({
              npcChat: {
                ...st.npcChat,
                isTyping: false,
                errorMsg: isNetworkError
                  ? `网络连接失败：${errorMsg}\n请检查网络连接或在设置中更换Base URL。`
                  : `发送失败：${errorMsg}`,
              },
            }));
          }
        }
        abortController = null;
      },

      openNPCChat: (npcId, scene) => {
        // 眼前就近的人（同席、柜上、坊里、街坊）带着 scene 或就在本城，照旧可以开口；
        // 其余的人须得在一处，未到金丹不能远隔千里交谈
        if (!scene) {
          const gs = useGameStore.getState();
          const rel = (gs.relations || []).find((r) => r.id === npcId);
          // 行踪不定的人，神念也无处可寻：修为再高也开不了口
          if (!isNpcLocationKnown(rel)) {
            set((st) => ({
              npcChat: {
                ...st.npcChat,
                errorMsg: `「${rel?.name || "此人"}」行踪不定，纵有神念也寻不着，无从开口。`,
              },
            }));
            return;
          }
          const samePlace = isNpcAround(rel, {
            placeId: gs.currentPlaceId,
            placeName: useGameStore.getState().hereLabel(),
          });
          if (!canTalkTo(gs.player?.realmIndex, samePlace)) {
            set((st) => ({
              npcChat: {
                ...st.npcChat,
                errorMsg: `「${rel?.name || "此人"}」眼下不在近前，未到金丹，还传不出这一声神念。`,
              },
            }));
            return;
          }
        }
        set((st) => {
          const party = Array.isArray(st.npcChat.partyIds) ? st.npcChat.partyIds : [];
          // 还是这一席（原先开口的那位没换）便接着谈；换了人另起一席，上一席的人与话都作废
          const sameSeat = party[0] === npcId;
          return {
            // 人到了跟前，先前收起的交谈窗也该再露出来
            chatHidden: false,
            pendingChat: null,
            npcChat: {
              ...st.npcChat,
              activeNpcId: npcId,
              pendingScene: scene ?? null,
              partyIds: sameSeat && party.length > 0 ? party : [npcId],
              partyMessages: sameSeat && Array.isArray(st.npcChat.partyMessages) ? st.npcChat.partyMessages : [],
              isPartyTyping: false,
              pendingCraft: sameSeat ? (st.npcChat.pendingCraft ?? null) : null,
              // 换个地方搭话，上一席的场面就作废，免得在别处也能吃到人家请的一顿
              profiles: (Array.isArray(st.npcChat.profiles) ? st.npcChat.profiles : []).map((p) =>
                p.npcId === npcId ? { ...p, scene } : p,
              ),
            },
          };
        });
      },

      closeNPCChat: () => {
        const state = get();
        // 生成对话摘要
        const activeProfile = state.npcChat.profiles.find((p) => p.npcId === state.npcChat.activeNpcId);
        let chatSummary = "";
        // 判定的旁注不必攒进记性里：那只是给玩家看的一句话
        const spokenMessages = (activeProfile?.messages ?? []).filter((m) => m.role !== "system");
        if (activeProfile && spokenMessages.length >= 2) {
          const recentMsgs = spokenMessages.slice(-8);
          const lines: string[] = [];
          lines.push(`与「${activeProfile.name}」(${activeProfile.title})近期的交谈：`);
          for (const msg of recentMsgs) {
            const speaker = msg.role === "player" ? "你" : activeProfile.name;
            lines.push(`[${speaker}]: ${msg.content.slice(0, 120)}`);
          }
          chatSummary = lines.join("\n");
        }

        // 这人把你说过的话记在心里：压成一句攒进尘缘，往后照面时他带得上
        if (activeProfile && activeProfile.messages.length >= 2) {
          const asked = activeProfile.messages
            .filter((m) => m.role === "player")
            .slice(-3)
            .map((m) => m.content.replace(/\s+/g, " ").trim().slice(0, 40))
            .filter(Boolean)
            .join("；");
          if (asked) {
            const day = daySerial(useGameStore.getState().currentTime);
            const memo = `第${day}日：${asked}`;
            useGameStore.setState((s) => ({
              relations: s.relations.map((r) =>
                r.id === activeProfile.npcId
                  ? { ...r, memory: `${r.memory ? `${r.memory}\n` : ""}${memo}`.slice(-600) }
                  : r,
              ),
            }));
          }
        }

        set((st) => ({
          // 收席之后，先前藏起的窗与待点的入口都一并作废
          chatHidden: false,
          pendingChat: null,
          npcChat: { ...st.npcChat, activeNpcId: null, isTyping: false, errorMsg: "" },
          conversation: {
            ...st.conversation,
            pendingChatSummary: chatSummary || st.conversation.pendingChatSummary,
          },
        }));
      },

      clearNPCChat: (npcId) => {
        set((st) => ({
          npcChat: {
            ...st.npcChat,
            profiles: (Array.isArray(st.npcChat.profiles) ? st.npcChat.profiles : []).map((p) =>
              p.npcId === npcId ? { ...p, messages: [], lastUpdated: Date.now() } : p,
            ),
          },
        }));
      },

      dismissCraftOffer: () => {
        set((st) => ({ npcChat: { ...st.npcChat, pendingCraft: null } }));
      },

      inviteToParty: (npcId) => {
        const st = get();
        const party = Array.isArray(st.npcChat.partyIds) ? st.npcChat.partyIds : [];
        if (party.includes(npcId) || party.length >= MAX_PARTY_SIZE) return false;

        const primary = party[0] ?? st.npcChat.activeNpcId;
        if (!primary) return false;

        // 从单谈变成同席：把先前那一席的话接过来，谈话才连得上
        const primaryProfile = st.npcChat.profiles.find((p) => p.npcId === primary);
        const seeded: NPCGroupMessage[] =
          party.length === 1
            ? (Array.isArray(primaryProfile?.messages) ? primaryProfile.messages : []).map((m) => ({
                ...m,
                speakerId: m.role === "player" ? "player" : primary,
                speakerName: m.role === "player" ? "你" : primaryProfile?.name ?? "他",
              }))
            : Array.isArray(st.npcChat.partyMessages) ? st.npcChat.partyMessages : [];

        set((s) => ({
          npcChat: { ...s.npcChat, partyIds: [...party, npcId], partyMessages: seeded },
        }));
        return true;
      },

      removeFromParty: (npcId) => {
        set((st) => {
          const party = Array.isArray(st.npcChat.partyIds) ? st.npcChat.partyIds : [];
          // 最先开口的那位是这一席的主，请不走；请走旁人便是
          if (npcId === party[0]) return st;
          const next = party.filter((id) => id !== npcId);
          return {
            npcChat: {
              ...st.npcChat,
              partyIds: next,
              // 只剩一个人便回到单谈，同席那份话作废
              partyMessages: next.length > 1 ? st.npcChat.partyMessages : [],
            },
          };
        });
      },

      sendPartyMessage: async (content) => {
        const { settings } = get();
        const party = (Array.isArray(get().npcChat.partyIds) ? get().npcChat.partyIds : []).filter(Boolean);
        if (party.length === 0) return;
        if (!aiReady(settings)) {
          set((st) => ({
            npcChat: { ...st.npcChat, errorMsg: "推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。" },
          }));
          return;
        }

        const gs = useGameStore.getState();
        const members = party
          .map((id) => gs.relations.find((r) => r.id === id))
          .filter((r): r is Relation => !!r);
        if (members.length === 0) return;

        const text = (content ?? "").trim();
        const stamp = Date.now();
        const playerLine: NPCGroupMessage = {
          id: `gmsg-${stamp}-player`,
          role: "player",
          speakerId: "player",
          speakerName: "你",
          // 略过这一回也留一句在场的话，旁人接得上
          content: text || "（这一回你没开口，只在一旁听着）",
          timestamp: stamp,
        };

        /** 各人自己那本账上也记一笔，日后单谈时还接得上话 */
        const noteDown = (ids: string[], line: NPCMessage) => {
          set((st) => ({
            npcChat: {
              ...st.npcChat,
              profiles: st.npcChat.profiles.map((p) =>
                ids.includes(p.npcId)
                  ? { ...p, messages: [...(Array.isArray(p.messages) ? p.messages : []), line], lastUpdated: Date.now() }
                  : p,
              ),
            },
          }));
        };

        let transcript = [
          ...(Array.isArray(get().npcChat.partyMessages) ? get().npcChat.partyMessages : []),
          playerLine,
        ];
        set((st) => ({
          npcChat: { ...st.npcChat, partyMessages: transcript, isPartyTyping: true, errorMsg: "" },
        }));
        noteDown(party, { id: playerLine.id, role: "player", content: playerLine.content, timestamp: stamp });

        /**
         * 席间的实事照账落下：递出去的、许下的、说定的、恼了的，凡路由认得的都记。
         * 一轮里只结这一回，各人说过的话一并递过去，免得一句一算。
         */
        let settledTo = transcript.length;
        const settleRound = async () => {
          const fresh = transcript.slice(settledTo).filter((m) => m.role !== "system");
          settledTo = transcript.length;
          const spokenRound = fresh.map((m) => `${m.speakerName}：${m.content}`).join("\n");
          if (!spokenRound.trim()) return;
          try {
            const state = useGameStore.getState().getSnapshot() as unknown as GameState;
            const extraction = await runOpsExtraction(settings, state, spokenRound, new AbortController().signal, {
              source: "npc",
            });
            if (extraction.ops.length === 0) return;
            useGameStore.getState().applyOps(extraction.ops);
            console.debug("[npcChat] 这一席落账", extraction.ops.length, "条");
          } catch (e) {
            console.warn("[npcChat] 这一席的数据结算未成:", e);
          }
        };

        const cityName = getMarker(gs.currentPlaceId)?.name ?? "未知之地";
        const locationName = LOCATIONS.find((l) => l.id === gs.currentLocation)?.name ?? gs.currentLocation;
        const timeStr = formatGameTime(gs.currentTime);
        const brief = skillBrief();
        // 同席的几位也该知道玩家身上在办什么，认下时名称照抄
        const todaySerial = daySerial(gs.currentTime);
        const openQuests = (Array.isArray(gs.quests) ? gs.quests : []).filter((q) => q?.status === "open");
        // 在座几位托付的、或要交给他们的，排前头，免得被挤到十桩以外
        const relatedQuests = openQuests.filter((q) =>
          members.some((m) => q.giver === m.name || q.target?.person === m.name),
        );
        const listedQuests = [
          ...relatedQuests,
          ...openQuests.filter((q) => !relatedQuests.includes(q)),
        ].slice(0, 12);
        const questBrief = listedQuests.length
          ? listedQuests
              .map((q) => {
                const realm = questRealmGoalLabel(q);
                const item = questItemGoalLabel(q);
                const stone = questStoneGoalLabel(q);
                const where = realm
                  ? `修到${realm}`
                  : item
                    ? `寻得${item}`
                    : stone
                      ? `凑足${stone}`
                      : q.target?.label || q.place || "去处未定";
                const due =
                  q.dueDay === undefined
                    ? "不限时"
                    : q.dueDay < todaySerial
                      ? `已误期${todaySerial - q.dueDay}日`
                      : `第${q.dueDay}日止`;
                return `「${q.name}」〔编号 ${q.id}〕｜托自${q.giver || "某人"}｜${where}｜交差：${q.condition || "未写明"}｜${due}`;
              })
              .join("\n")
          : "（眼下没有在办的事）";
        const roster = members.map((m) => `- ${m.name}（${m.title}）`).join("\n");
        const briefs = members
          .map((m) => `- ${m.name}（${m.title}）：${m.persona || m.note || "说不上底细"}`)
          .join("\n");

        try {
          for (const member of members) {
            const profile = await get().getOrCreateNPCProfile(member.id, member.name, member.title);
            const heard = transcript
              // 旁注不进上文：那是给玩家看的，别让模型当成谁说过的话
              .filter((m) => m.speakerId !== "system")
              .slice(-16)
              .map((m) => `${m.speakerName}：${m.content}`)
              .join("\n");

            const prompt: import("@/lib/aiClient").ChatMessage[] = [
              {
                role: "system" as const,
                content: `${profile.initialPrompt}

【游戏背景】
这是一个古风修真世界，存在宗门、功法、丹药、符箓等元素。境界分为炼气、筑基、金丹、元婴等。

【当前时间】：${timeStr}
【玩家当前所在】：${cityName} · ${locationName}
【这一席】：几个熟人凑在一处说话，在座的有：
${roster}
【在场各人的底细】
${briefs}
${profile.scene?.craft ? `【这一处】：你正在「${profile.scene.shop}」的作坊里，手边是${profile.scene.craft}的家什。玩家若开口要定做东西，你先掂量料钱与工钱，再报一个价与取货的日子；价钱落在 ${CRAFT_PRICE_RANGE[0]} 到 ${CRAFT_PRICE_RANGE[1]} 枚下品灵石之间，日子落在 ${CRAFT_DAYS_RANGE[0]} 到 ${CRAFT_DAYS_RANGE[1]} 日之内。\n` : ""}${profile.scene?.kind === "牙行" ? `【柜上的规矩】：你在牙行的柜上主事，交代差事时，去处只许从这几处里挑：${getDistricts(gs.currentPlaceId).map((d) => gs.districtNames?.[`${gs.currentPlaceId}:${d.id}`] || d.nature).join("、") || "（眼下没有）"}；不许另编地名。\n` : ""}【玩家的市井本事】：${brief.skills}
【最近的判定】：${brief.checks}
【玩家身上在办的事】（认下时只认与你相干的）：
${questBrief}

【这一席的对话记录】：
${heard || "（刚坐下，还没人开口）"}

【回复要求】：
1. 你只演「${profile.name}」一个人，绝不要替别人说话，也不要替玩家说话
2. 用古风白话，合乎你的性情与在场各人与你的干系；可以接旁人的话、驳他、帮腔，也可以只应一声
3. 50 到 150 字，说话之外可以带一两笔神态动作
4. ${checkInstruction()}
5. 若你把一桩事托付给了玩家，末行只写 ${QUEST_MARK} 类别 | 名称 | 去处 | 几日后到期 | 交差条件 | 赏 名目 数额 | 罚 名目 数额；类别只写 事件、地点、人物、修为、物品、灵石 之一：事件是当场起落、未必有固定去处的事，去处可留空；地点是奔着某一处去的、人物是奔着某个人去的，这两类去处须写明本城或别城真有的地方；修为是修到某一层境界便算办到的长期目标，去处一栏改填境界全称（如「炼气后期」），不必有去处与人；物品是寻某一样东西，去处一栏改填「物名×件数」（如「青玉佩×2」）；灵石是凑某数灵石，去处一栏改填数目（如「300」），四等灵石按一比一百折成下品算。物品与灵石两类都不必有去处与人。成与不成由你照剧情判：若玩家办成了你先前托付的那件事，末行只写 ${SETTLE_MARK} 编号或名称 | done，黄了则写 ${SETTLE_MARK} 编号或名称 | failed；编号或名称须照【玩家身上在办的事】里的一桩抄，有编号优先抄编号，认不出就不写。两样都没有就不写。
6. 若你与玩家当面说定了一桩口头的约定，末行只写 ${PACT_MARK} 名目 | 地点 | 几日后 | 说明；没跟他说定就不写。${profile.scene?.craft ? `若他把定做的活计说定了、你也报过了价与取货的日子，末行之后另起一块只写：
${CRAFT_MARK}
{"name":"做成的东西叫什么，不超过 20 字","type":"${profile.scene.craftHint || "材料/丹药/符箓/法宝/杂物 之一"}","grade":"凡品/灵品/玄品/天品/仙品 之一","desc":"一句 20 到 40 字的说明","icon":"一个汉字","elements":{"金":60,"水":30},"price":200,"days":5}
<<<END>>>
` : ""}
7. 若话说到这里，接下来已不是席上几句能了结的——众人要起身出门、上船启程、同去某处——就在回话的最后另起一行只写 ${STORY_MARK} 一句话写明接下来做什么、往哪里去。只是随口提及去处、人还没动身，就不要写这一行。
8. 上面点名的 ${CHECK_MARK}、${QUEST_MARK}、${SETTLE_MARK}、${PACT_MARK}、${STORY_MARK}${profile.scene?.craft ? `、${CRAFT_MARK}` : ""} 这几行，格式须照要求写，别写岔了，也别另起别的记号。除此之外，席间当真说定了什么、递了什么东西、动了气伤了谁、许下多少钱财货物，只管照实说出口去，不必绕着不说——话里如实发生的事，系统自会照看落账`,
              },
            ];

            const stream = shopStreamHooks(set, "party", undefined, "<<<");
            let raw = "";
            try {
              raw = await chatWithModelStream(settings, settings.proModel, prompt, {
                timeoutMs: 120000,
                ...stream,
              });
            } finally {
              set({ shopStream: INITIAL_SHOP_STREAM });
            }
            const checkBox: { check: SkillCheck | null; failed: SkillCheck | null } = { check: null, failed: null };
            const spoken = await reviewNarrative(
              settings,
              settleNPCMarks(raw, profile, (check) => {
                if (check.success) checkBox.check = check;
                else checkBox.failed = check;
              }),
            );
            // 席间有人把话引到了该转场的地方：这一句照旧入席，随后收窗转叙事
            const { text: shown, cue } = takeStoryCue(spoken);
            const line: NPCGroupMessage = {
              id: `gmsg-${Date.now()}-${member.id}`,
              role: "npc",
              speakerId: member.id,
              speakerName: profile.name,
              content: shown,
              timestamp: Date.now(),
            };
            transcript = [...transcript, line];
            set((st) => ({ npcChat: { ...st.npcChat, partyMessages: transcript } }));
            noteDown([member.id], { id: line.id, role: "npc", content: shown, timestamp: line.timestamp });

            if (cue) {
              await settleRound();
              handOffChatToNarration(profile.name, cue);
              return;
            }

            // 判定没过：在席上留一句旁注，省得玩家以为对方只是不肯说
            if (checkBox.failed) {
              const note: NPCGroupMessage = {
                id: `gmsg-${Date.now()}-${member.id}-check`,
                role: "system",
                speakerId: "system",
                speakerName: "",
                content: checkFailNote(checkBox.failed),
                timestamp: Date.now(),
              };
              transcript = [...transcript, note];
              set((st) => ({ npcChat: { ...st.npcChat, partyMessages: transcript } }));
              noteDown([member.id], { id: note.id, role: "system", content: note.content, timestamp: note.timestamp });
            }

            // 同席里判定过了，也让这一位顺着话头把该交的底交出来
            if (checkBox.check) {
              try {
                const followRaw = await chatWithModel(
                  settings,
                  settings.proModel,
                  [
                    ...prompt,
                    { role: "assistant" as const, content: spoken },
                    { role: "system" as const, content: checkPassedInstruction(profile, checkBox.check) },
                  ],
                  { timeoutMs: 120000, retries: 1 },
                );
                const followSpoken = await reviewNarrative(
                  settings,
                  settleNPCMarks(followRaw, profile),
                );
                if (followSpoken.trim()) {
                  const follow = takeStoryCue(followSpoken);
                  const followLine: NPCGroupMessage = {
                    id: `gmsg-${Date.now()}-${member.id}-cont`,
                    role: "npc",
                    speakerId: member.id,
                    speakerName: profile.name,
                    content: follow.text,
                    timestamp: Date.now(),
                  };
                  transcript = [...transcript, followLine];
                  set((st) => ({ npcChat: { ...st.npcChat, partyMessages: transcript } }));
                  noteDown([member.id], {
                    id: followLine.id,
                    role: "npc",
                    content: follow.text,
                    timestamp: followLine.timestamp,
                  });
                  if (follow.cue) {
                    await settleRound();
                    handOffChatToNarration(profile.name, follow.cue);
                    return;
                  }
                }
              } catch (e) {
                console.warn("[sendPartyMessage] 判定通过后的续话未成:", e);
              }
            }
          }
          // 这一席说完了，把席间散落的事照账落下
          await settleRound();
        } catch (e) {
          set((st) => ({ npcChat: { ...st.npcChat, errorMsg: (e as Error).message } }));
        } finally {
          set((st) => ({ npcChat: { ...st.npcChat, isPartyTyping: false } }));
        }
      },

      probeManor: async ({ label, standing, members }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const roster = members
          .map((m) => `${m.title}：${m.name}（${m.gender}，${m.age} 岁）`)
          .join("\n");
        // 街坊闲谈里也会考较见识
        const brief = skillBrief();

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个古风世界写市井见闻。

【宅邸】${label}
【门第】${standing}
【宅中人口】
${roster}
【来客的市井本事】${brief.skills}
【最近的判定】${brief.checks}

来客「${player.name}」在街坊间打听这户人家的底细，邻居们七嘴八舌，把知道的事零碎地说了出来。

请写一段 200~350 字的叙事：由街坊零碎的话拼出这户人家的家世来历、家业营生、眼下境况，以及一两件坊间传闻或隐情。用第三人称古风白话，语气家常，不要写成条目清单，不要出现「系统」「数据」「玩家」这类出戏的字眼。只输出叙事正文，不要标题。
${checkInstruction()}
${questSettleHint()}`,
          },
        ];

        const raw = await chatWithModel(settings, settings.proModel, prompt, {
          timeoutMs: 90000,
          retries: 1,
        });
        return settleDoneMark(settleCheckMark(raw.trim(), "街坊话里考较的一句"));
      },

      probeShop: async ({ name, kind, market, culture }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        // 门口与伙计搭话，也可能考较到眼力耳力
        const brief = skillBrief();

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个古风世界写市井见闻。

【城池风土】${culture ? `${culture}一带` : "中原一带"}
【坊市】${market}
【铺子】${name}（${kind}）
【路人的市井本事】${brief.skills}
【最近的判定】${brief.checks}

路人「${player.name}」在这家铺子门前驻足，没有进门，只在门外打量。

请写一段 150~300 字的门外见闻，只写站在门外能看见、能听见、能问到的：幌子招牌与门面的样子、门前停着的东西、出入的客人、从门里飘出来的气味与声响、与伙计在门口搭的几句话、街坊对这家的零碎议论。

只守在门外：不要写跨进门去，也不要写店内的陈设、后堂的情景、与掌柜对面叙谈这类进门之后才看得见的场面。
用第三人称古风白话，贴着这一路营生落笔，不要写成条目清单，不要出现「系统」「数据」「玩家」这类出戏的字眼。只输出正文，不要标题。
${checkInstruction()}
${questSettleHint()}`,
          },
        ];

        const raw = await chatWithModel(settings, settings.proModel, prompt, {
          timeoutMs: 90000,
          retries: 1,
        });
        return settleDoneMark(settleCheckMark(raw.trim(), "门外伙计考较的一句"));
      },

      narrateFacility: async (args) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const {
          sect,
          surroundings,
          appearance,
          culture,
          nature,
          climate,
          feature,
          building,
          kindName,
          scene,
          deed,
          outcome,
          playerName,
          playerPosition,
          realmIndex,
          hour,
        } = args;

        // 这一处的场景写照、这一桩做了什么、刚落了什么账，都摆在提示词里，
        // 写出来的东西便贴着这一座建筑，不至于与别处一个调子
        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个武侠宗门经营游戏写一段短叙事。

${PROSE_STYLE}

【山门】${sect}${culture ? `（${culture}一带）` : ""}
【坐落周遭】${surroundings || "山门自有一方地势，不必细说"}
【山门气象】${appearance || "气象照常"}
${nature ? `【宗门性质】${nature}\n` : ""}${climate ? `【宗门风气】${climate}\n` : ""}${feature ? `【镇门之物】${feature}\n` : ""}【此时】${hour}
【来人】${playerName}，门中${playerPosition || "弟子"}，修为第 ${realmIndex} 重

【所在之处】${building}（属${kindName}）
【此处的样子】${scene}
【这一桩】${deed}
【落下的结果】${outcome}

请写一段 150~300 字的叙事：写此人在这里做这一桩事的经过，眼前所见、手上所做、一两个人的言语动作、这一桩了结时的光景。落笔要贴着「此处的样子」，让读者认得出这是${building}而不是别处；提到本门或门中人物时，行事口吻都要合【宗门风气】与【宗门性质】那两条。

用第三人称古风白话，只写这一段情景，不要写成条目清单，不要复述数值与规则，不要出现「系统」「数据」「玩家」这类出戏的字眼。只输出正文，不要标题。`,
          },
        ];

        const raw = await chatWithModel(settings, settings.proModel, prompt, {
          timeoutMs: 90000,
          retries: 1,
        });
        return raw.trim();
      },

      exploreForest: async ({ place, culture, hours }) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：请确认后端服务已启动，且已在后端配好模型密钥。");
        }
        // 时长是玩家选的参数：最短一个时辰，最长一整日十二个时辰
        const h = Math.min(12, Math.max(1, Math.round(Number(hours) || 1)));

        const gs = useGameStore.getState();
        const brief = buildEventBrief(gs as unknown as GameState, place);

        const raw = await chatWithModel(
          settings,
          settings.proModel,
          buildForestExplorePrompt({ place, culture, hours: h, brief }),
          { timeoutMs: 120000, retries: 1, temperature: 0.9 },
        );

        const { text, reason } = takeForestEvent(raw);
        if (!text) throw new Error("这一趟没写出来，再试一回。");

        // 探了多久，时辰便走多久：这一笔由所选参数定下，先落账
        useGameStore.getState().advanceTime(h);

        // 这一趟得的物、结的缘，照旧走同一条结算落账
        const controller = new AbortController();
        const ops = await extractEventOps(settings, text, controller.signal);

        // 林中有动静引出一桩变故的，另开那扇窗
        if (reason) void get().triggerRandomEvent(`在${place}探索时：${reason}`);

        return { text, ops, eventReason: reason };
      },

      visitClosedPlace: async ({ place, nature, culture, action, history }) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          throw new Error("推演接口尚未接通：先在设置里接上模型，再来此处办事。");
        }
        const ask = String(action ?? "").trim();
        if (!ask) throw new Error("先写下你打算做什么。");

        const gs = useGameStore.getState();
        const brief = buildEventBrief(gs as unknown as GameState, place);
        const raw = await chatWithModel(
          settings,
          settings.proModel,
          buildClosedPlacePrompt({ place, nature, culture, action: ask, brief, history }),
          { timeoutMs: 120000, retries: 1, temperature: 0.9 },
        );
        const text = String(raw ?? "").trim();
        if (!text) throw new Error("这一处没写出什么，再试一回。");

        // 这一段里交的差、见的人、了的事，照旧走同一条结算落账
        const controller = new AbortController();
        const ops = await extractEventOps(settings, text, controller.signal);
        return { text, ops };
      },

      dineAt: async ({ shop, kind, market, culture, dish, dishDesc, guests }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const seats = guests.length > 0 ? guests.join("、") : "堂里没什么人";
        // 同席与邻桌的话里也可能考较见识
        const brief = skillBrief();

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个古风世界写市井见闻。

【城池风土】${culture ? `${culture}一带` : "中原一带"}
【坊市】${market}
【铺子】${shop}（${kind}）
【叫的吃食】${dish}——${dishDesc}
【堂内的人】${seats}
【食客的市井本事】${brief.skills}
【最近的判定】${brief.checks}
${questSettleHint("narration")}

「${player.name}」在${shop}拣了副座头坐下，叫了这一道，慢慢吃完。

请写一段 200~350 字的叙事：先写这一口吃食端上来的样子与入口的滋味，再写堂内的动静——伙计往来招呼、邻桌与同席的人在说什么、门外的街声与风色。
把席间听进耳朵的一两句闲话原样夹在叙事里，不要写成旁白总结。
用第三人称古风白话，不要写成条目清单，不要出现「系统」「数据」「玩家」这类出戏的字眼。

以 JSON 输出，不要有别的东西：
{"narration":"上面那段叙事正文","rumors":[{"text":"席间听到的一句闲话","source":"${shop}·邻桌"}]}
需要时另在同级加 "quest" 与 "adventure" 两项，用不上就整项省去。
关于 rumors：给 1 到 3 条，每条 15 到 40 字，要像市井口风，是这一顿里真听来的零碎消息——谁家出了事、哪条路上不太平、什么货要涨价、谁跟谁有了嫌隙之类，可以含糊、可以只是风闻，但不要空话。source 写清是打哪儿听来的，如「${shop}·邻桌」「堂中行商」。
关于 quest：只有席间确有人托你办一件事时才写，寻常客套、空口许诺不要写成机缘。字段与问道里的机缘相同：name、kind（事件、地点、人物、修为、物品、灵石 之一）、desc、place、dueDay、giver、condition、reward、rewardKind、rewardAmount、penalty、penaltyKind、penaltyAmount；地点类与人物类才写 place，且须是本城或别城真有的去处；没有托付就整项省去。
关于 adventure：只有有人说起城外某处值得一去的野地方时才写，字段为 {"name","summary","kind","danger","reward","rewardKind","rewardAmount","penalty","penaltyKind","penaltyAmount","persistent"}：name 不超过 12 字，summary 不超过 60 字，kind 只取 秘境、遗迹、机缘、凶险、异象 之一，danger 取 1 至 5，集市洞天这类常设的去处 persistent 写 true；没有这样的去处就整项省去。
十顿里不过一两回有这些，寻常吃食不要硬凑。
${checkInstruction()}这一行缀在 narration 的末尾，narration 之外不要有别的东西。`,
          },
        ];

        const stream = shopStreamHooks(set, "dine", "narration");
        let raw = "";
        try {
          raw = await chatWithModelStream(settings, settings.proModel, prompt, {
            timeoutMs: 90000,
            ...stream,
          });
        } finally {
          set({ shopStream: INITIAL_SHOP_STREAM });
        }

        const parsed = parseJsonPayload(raw);
        const narration = settleDoneMark(
          settleCheckMark(String(parsed?.narration ?? "").trim() || raw.trim(), "席间考较的一句"),
        );
        const rumorList = Array.isArray(parsed?.rumors) ? parsed.rumors : [];
        const rumors = rumorList
          .map((r: any) => ({
            text: String(r?.text ?? "").trim().slice(0, 120),
            source: String(r?.source ?? "").trim().slice(0, 40),
          }))
          .filter((r: { text: string }) => r.text)
          .slice(0, 3);

        // 席间若有人托了事、或说起一处野外去处，照问道那一套落账
        const scuttled = applyScuttle(parsed);

        return { narration, rumors, ...scuttled };
      },

      lodgeAt: async ({ shop, market, culture, room, roomDesc, hours, words }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const spent = lodgeDurationLabel(hours);

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个古风世界写市井见闻。

【城池风土】${culture ? `${culture}一带` : "中原一带"}
【坊市】${market}
【客栈】${shop}
【住的房】${room}——${roomDesc}
【住了多久】${hours} 个时辰，合 ${spent}
${words ? `【睡前撂下的话】${words}\n` : ""}
「${player.name}」在${shop}租下${room}，一住 ${spent}。这段时辰他多半睡过去了，醒醒睡睡，偶尔睁眼看一看天光。

请写一段 200~350 字的叙事，写这一觉睡到底之后醒来的光景：
- 睡下之前外头是什么样，如今又是什么样——天色、街声、铺子开合、行人的疏密、气味与冷热的变化
- 这一段里外头发生了些什么：谁家办事、市面上的东西涨了还是落了、路上多了什么人、客栈里换过几拨客人；住得短便写细微的变化，住得久才写得出人事更迭
- 身子歇过来的那点松快：乏解了、气顺了，或是伤处仍不济事

用第三人称古风白话，落笔要落在「世事自己往前走了，他错过去了一段」这层意味上，不要写成条目清单，不要出现「系统」「数据」「玩家」这类出戏的字眼。

以 JSON 输出，不要有别的东西：
{"narration":"这一觉的叙事正文"}
需要时另在同级加 "quest" 与 "adventure" 两项，用不上就整项省去。
关于 quest：只有店中确有人托你办一件事时才写，字段与问道里的机缘相同：name、kind（事件、地点、人物、修为、物品、灵石 之一）、desc、place、dueDay、giver、condition、reward、rewardKind、rewardAmount、penalty、penaltyKind、penaltyAmount；地点类与人物类才写 place，且须是真有的去处；没有就整项省去。
关于 adventure：只有听人说起城外某处值得一去的野地方时才写，字段为 {"name","summary","kind","danger","reward","rewardKind","rewardAmount","penalty","penaltyKind","penaltyAmount","persistent"}：kind 只取 秘境、遗迹、机缘、凶险、异象 之一，danger 取 1 至 5；没有就整项省去。
十回里不过一两回有这些，寻常一觉不要硬凑。
${questSettleHint("narration")}`,
          },
        ];

        const stream = shopStreamHooks(set, "lodge", "narration");
        let raw = "";
        try {
          raw = await chatWithModelStream(settings, settings.proModel, prompt, {
            timeoutMs: 90000,
            ...stream,
          });
        } finally {
          set({ shopStream: INITIAL_SHOP_STREAM });
        }
        const parsed = parseJsonPayload(raw);
        const text = settleDoneMark(String(parsed?.narration ?? "").trim() || raw.trim());
        // 店中若打听到一桩事、或一处野外去处，照问道那一套落账
        const scuttled = applyScuttle(parsed);
        return { text, ...scuttled };
      },

      listenToPlay: async ({ shop, market, culture, skill }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const brief = skillBrief();

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个古风世界写市井见闻。

【城池风土】${culture ? `${culture}一带` : "中原一带"}
【坊市】${market}
【瓦舍】${shop}
【食客的市井本事】${brief.skills}
${skill ? `【这一场听下来的门道】${skill}\n` : ""}
「${player.name}」在${shop}门口撂下几枚戏钱，挤进人堆里听了一场戏。

请写一段 200~350 字的叙事：
- 先写台上的戏——唱的什么角儿、什么折子，唱腔与身段如何，鼓板锣钹怎么起落
- 再写台下的人——挤着的看客、卖零嘴的小贩、叫好的与打瞌睡的、身边人随口搭的话
- 最后落在${skill ? `「${skill}」上：戏文里的一处细节竟与这门本事相通，他心里忽然透亮了一点` : "他身上那点不易察觉的长进"}，写得含蓄些，别点破这是「涨了进度」

用第三人称古风白话，不要写成条目清单，不要出现「系统」「数据」「玩家」这类出戏的字眼。只输出正文，不要标题；除末尾的了事标记外，不要任何标记。

${questSettleHint()}`,
          },
        ];

        const raw = await chatWithModel(settings, settings.proModel, prompt, {
          timeoutMs: 90000,
          retries: 1,
        });
        return settleDoneMark(raw.trim());
      },

      appraiseItem: async ({ shop, market, culture, itemName, itemDesc, fee }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const brief = skillBrief();

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个古风世界写鉴宝的场面。

【城池风土】${culture ? `${culture}一带` : "中原一带"}
【坊市】${market}
【宝物阁】${shop}
【玩家的市井本事】${brief.skills}
【请人看的那件东西】${itemName}——${itemDesc}
【看这一件的价钱】${fee} 枚下品灵石

「${player.name}」把一件收来的旧物搁在${shop}的柜上，请柜上的行家过眼。

请判断这件东西究竟是什么，并写一段 200~350 字的叙事：
- 行家怎么看：上手掂分量、就着光看纹路与款识、敲一敲听声、拿布擦出一角本色
- 看的时候要照玩家身上的本事来定眼力：他若本就有相玉、辨药、看旧物这类手艺，两人能说上来几句，看得也更准；他若没这眼力，行家说什么他多半听不懂，只看个热闹
- 名声越是贵重的铺子，行家越不肯把话说死；说得含糊、留三分余地，也是常有的事
- 东西的成色要跟着行情与这铺子的身价走，别一概都是宝贝

用第三人称古风白话，不要写成条目清单，不要出现「系统」「数据」「玩家」这类出戏的字眼。

${questSettleHint()}

最后另起一块，以 JSON 写出看明白了的结果，不要有别的东西：
<<<READING>>>
{"name":"这东西究竟是什么，如「寒潭玄铁剑」","type":"材料/丹药/符箓/法宝/杂物 之一","grade":"凡品/灵品/玄品/天品/仙品 之一","desc":"一句 20 到 40 字的说明","icon":"一个汉字","elements":{"金":60,"水":30}}
<<<END>>>
关于 json：type 与 grade 只能取上面列出的那几样；elements 的键只取 金、木、水、火、土、风、雷、冰、暗，取值 -100 到 100，说不准就留空对象；name 不超过 20 字；grade 要与叙事里行家的口气相合，他若说不值钱就别写成天品。`,
          },
        ];

        const stream = shopStreamHooks(set, "appraise", undefined, "<<<READING>>>");
        let raw = "";
        try {
          raw = await chatWithModelStream(settings, settings.proModel, prompt, {
            timeoutMs: 90000,
            ...stream,
          });
        } finally {
          set({ shopStream: INITIAL_SHOP_STREAM });
        }

        const reading = parseAppraisalReading(raw);
        return { narration: settleDoneMark(stripAppraisalReading(raw)), reading };
      },

      findEscort: async ({ shop, market, culture, realm, stones }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const brief = skillBrief();
        const myRealm = realm || "炼气初期";

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在为一个古风修真世界写镖局里的一段问答。

【镖局】${shop}（${market}${culture ? `，${culture}地界` : ""}）
【雇主】${player.name}，境界${myRealm}，身上约有 ${Math.max(0, Math.trunc(stones ?? 0))} 枚下品灵石
【雇主的市井本事】${brief.skills}${brief.checks ? `\n【最近的判定】${brief.checks}` : ""}

镖局里坐着几位候活的镖师。雇主上门问一声有没有人肯走一趟，柜上或推举一位，或由人自荐。
请写一段 150~300 字的叙事：把这位镖师的模样、口风、来历、肯走的时日与要的价钱一并带出来，
用第三人称古风白话，不要写成条目清单，不要出现「系统」「数据」「玩家」这类出戏的字眼。

${questSettleHint()}

写完之后，另起一行只输出下面这一块，供程序取用：
${ESCORT_MARK}
{"name":"姓名，2到3字","title":"称号，如 镖师/趟子手/老镖头","realm":"境界，取 引气/炼气/筑基/金丹/元婴/化神 之一加 初期/中期/后期/圆满 之一","gender":"男或女","age":35,"origin":"出身来历","personality":"性情","appearance":"形貌","affiliation":"所属镖局，散人写 无","note":"一两句底细，走过什么镖、什么名声","persona":"人设提示词，一段话，交代脾气口风来历，往后每回都照它演","stats":{"hp":120,"hpMax":120,"mp":40,"mpMax":40,"attack":22,"defense":16,"speed":18},"fee":150,"days":7}
<<<END>>>

【规矩】境界与要价要相称，身手越高要价越贵，但高不过雇主太多，须是他雇得起的；雇期只取 ${ESCORT_DAYS_RANGE[0]} 到 ${ESCORT_DAYS_RANGE[1]} 日；佣金只取 ${ESCORT_FEE_RANGE[0]} 到 ${ESCORT_FEE_RANGE[1]} 枚下品灵石；姓名不许与雇主同名。若非柜上实在无人接活，不要写入 null 之类的空话。`,
          },
        ];

        const raw = await chatWithModel(settings, settings.proModel, prompt, {
          timeoutMs: 90000,
          retries: 1,
        });

        return {
          narration: settleDoneMark(stripEscortOffer(raw)),
          escort: clampEscort(parseEscortOffer(raw), myRealm),
        };
      },

      haggleWithShopkeeper: async ({
        keeper,
        shop,
        mode,
        subject,
        count,
        basePrice,
        factor,
        patience,
        history,
        words,
        available,
        mystery,
      }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const buying = mode === "buy";
        // 客人还没说要卖什么时，只当招呼生意，不议价
        const openTalk = !subject;
        const nowFactor = Math.round(factor * 100);
        const exchanges = history
          .slice(-10)
          .map((h) => `${h.role === "player" ? player.name : keeper.name}：${h.text}`)
          .join("\n");
        // 掌柜也会拿眼力考较客人：报上本事与最近的判定
        const brief = skillBrief();

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在一场古风文字游戏里扮演一家铺子的掌柜。

【铺子】${shop}
【你】${keeper.name}，${keeper.title}${keeper.personality ? `，${keeper.personality}` : ""}${keeper.appearance ? `，${keeper.appearance}` : ""}
【客人】${player.name}（${player.title}）
【这一笔】${openTalk
              ? `客人还没说要卖什么，身上带着：${available || "空着手"}`
              : mystery
                ? `客人看上了柜底那件收来的旧物「${subject}」，你开的价是 ${basePrice} 下品灵石。这东西你自己也没认出来，说不上是什么、打哪儿来、能派什么用场`
                : buying
                  ? `客人要买「${subject}」${count} 件，铺面标价 ${basePrice} 下品灵石`
                  : `客人要卖「${subject}」${count} 件，你起初只出价 ${basePrice} 下品灵石`}
【眼下议到】原价的 ${100 + nowFactor}%
【你的耐心】${patience}/100${exchanges ? `\n\n【之前的往来】\n${exchanges}` : ""}
【玩家的市井本事】${brief.skills}
【最近的判定】${brief.checks}

【你的性子】你是吃这行饭的买卖人，利字当头，一厘一毫都要计较：
- 嘴上绝不先露怯。「这价已经是赔本」「再低我这铺子就不必开了」这样的话常挂在嘴边，其实还有多少赚头，只有你自己知道。
- 客人不开口，你绝不主动降价：只一味夸货、抬身价、说行情、说独此一件，把话头绕回去。
- 可你心里其实怕这笔买卖跑了，更怕货砸在自己手里。客人挑得在理、抬脚要走、许了下回还来、或一次多买，你才舍得一点一点往外挤——每回至多让一成，还要让得像割肉。
- 让价总要替自己留个台阶：「看你是个爽快人」「就当交个朋友」「这一回不挣你的」，绝不承认先前开价虚高。
- 客人一味硬压、贬损你的货色、出言不逊，你宁可买卖不做也不再松口，甚至把价往回抬。
- 「怕卖不出去」只许从语气里透出来，绝不许说出口——那是买卖人的底，亮出来就完了。

客人新说了一句，你要以掌柜的身份回话${openTalk ? "" : "，并给出这一轮之后谈成的价码与剩下的耐心"}。
${checkInstruction()}这一行也要缀在 reply 的末尾，reply 之外不要有别的东西。

${questSettleHint("reply")}

以 JSON 输出，不要有别的东西：
{"reply":"掌柜的原话，40~120 字，古风白话，带着做买卖的精明与生意人的客气","factor":0,"patience":60}
${openTalk
              ? `客人还没点明要卖什么，你只当招呼生意：寒暄一句，问他要出手什么、要买什么，别自己先报价。此时 factor 照旧写 ${nowFactor}，patience 照旧写 ${patience}。`
              : `关于 factor：写成「相对原价的百分比整数」，-20 即便宜两成、15 即多要一成半。
${buying
                  ? "客人在压价，故 factor 不能为正；你不肯先让，多半写 0，真被说动了也只肯一点一点往外挤，范围通常落在 -20 到 0。"
                  : "客人在抬价，故 factor 不能为负；你多半咬住原价不放，先挑东西的毛病、说行情不好，范围通常落在 0 到 20；真看上眼又怕被人截走时，才露出几分急色往小处添。"}
让价的步子只看客人这一句话：报了体面的身份、说得客气在理、许了下回还来或一次多买，才松一点；一味硬压、出言不逊，一分也不让。无论松紧，都要演得像是亏了本才答应的。

关于 patience：你被磨过这一轮之后还剩多少耐心，0 到 100 的整数。
碰上有礼有节的还价，掉个三五点；胡搅蛮缠、开口就要一半、翻来覆去抬杠，掉十几二十点。掉到 0 就是谈崩了，你不再听他说下去。`}
${mystery
              ? `另有一节，务必照办：这是你收来的一件旧物，你自己也不认得它，所以客人怎么问，你都只能说不知道——不许替它编名目、编来历、编用处，也不许暗示它日后能派什么用场，更不许说「这怕是件好东西」之类点破的话。你能说的只有：一并收来的、看着像什么、当初花了多少本钱、今日想不想做这笔买卖。
价钱本就是你随口开的，让与不让全看你的性子与客人这一句话说得漂不漂亮。`
              : ""}`,
          },
          { role: "user" as const, content: words },
        ];

        const stream = shopStreamHooks(set, "haggle", "reply");
        let raw = "";
        try {
          raw = await chatWithModelStream(settings, settings.proModel, prompt, {
            timeoutMs: 60000,
            ...stream,
          });
        } finally {
          set({ shopStream: INITIAL_SHOP_STREAM });
        }

        const parsed = parseJsonPayload(raw);
        const reply = settleDoneMark(
          settleCheckMark(String(parsed?.reply ?? "").trim(), `${keeper.name}考较你的眼力`) ||
            "掌柜捋了捋袖子，不接话。",
        );

        const rawFactor = Number(parsed?.factor);
        const pct = Number.isFinite(rawFactor) ? Math.min(100, Math.max(-100, rawFactor)) : 0;
        // 方向由买卖定：买只许往下压，卖只许往上抬
        const bounded = buying ? Math.min(0, pct) : Math.max(0, pct);

        const rawPatience = Number(parsed?.patience);
        const nextPatience = Number.isFinite(rawPatience)
          ? Math.min(100, Math.max(0, Math.round(rawPatience)))
          : Math.max(0, patience - 10);

        return { reply, factor: bounded / 100, patience: nextPatience };
      },

      askGatekeeper: async ({ label, standing, gatekeeper, members, words }) => {
        const { settings } = get();
        if (!aiReady(settings)) throw new Error("推演接口尚未接通。");

        const player = useGameStore.getState().player;
        const roster = members.map((m) => `${m.title}：${m.name}`).join("、");
        // 门房也认得出人的门道，会当面考较一句
        const brief = skillBrief();

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你在一场古风文字游戏里扮演大户人家的门房。

【宅邸】${label}
【门第】${standing}
【宅中人口】${roster}
【你】${gatekeeper.name}，门房${gatekeeper.personality ? `，${gatekeeper.personality}` : ""}${gatekeeper.appearance ? `，${gatekeeper.appearance}` : ""}
【来客】${player.name}（${player.title}），${player.sectName}的${player.position}
【来客的市井本事】${brief.skills}
【最近的判定】${brief.checks}

来客在门外开口，求你通报主家。请判断这一遭是个什么结果，并写出门房的回话。

结果只有三种，取其一：
- refused：门房不肯通禀，把人挡在门外
- master_absent：门房应下去传话，回来却报说主家不见客
- admitted：门房传了话，主家愿意见客

判定要点：多半是不成的。要进门得有过得去的由头——来客名头体面、话说得客气有礼、许了门房好处，成事的可能才大；言语无礼、来路不明、身无凭据的，多半被挡在门外。
${checkInstruction()}这一行也要缀在 reply 的末尾，reply 之外不要有别的东西。

以 JSON 输出，不要输出别的东西：
{"outcome":"refused 或 master_absent 或 admitted","reply":"门房的原话与神态，60~150 字，古风"}`,
          },
          { role: "user" as const, content: words },
        ];

        const raw = await chatWithModel(settings, settings.proModel, prompt, {
          timeoutMs: 60000,
          retries: 1,
          jsonMode: true,
        });

        const parsed = parseJsonPayload(raw);
        const rawOutcome = String(parsed?.outcome ?? "").trim().toLowerCase();
        const outcome: GateOutcome =
          rawOutcome === "admitted" || rawOutcome === "master_absent" || rawOutcome === "refused"
            ? rawOutcome
            : "refused";
        const reply =
          settleCheckMark(String(parsed?.reply ?? "").trim(), `${gatekeeper.name}考较你的来路`) ||
          "门房摆摆手，不肯替你传话。";

        return { outcome, reply };
      },

      startBattle: (map) => {
        // 体力上限照开战这一刻的体力（vitality）算，buff 压过的也算在内
        const staminaMax = battleStaminaMax(effectiveAttributes(useGameStore.getState().player).vitality);
        // 阵上诸位先各站定朝向：自己人朝南，敌人朝北
        const seedFacing = (list: BattleEntity[]) =>
          list.map((e) => ({ ...e, facing: e.facing ?? (e.type === "enemy" ? "北" : "南") }));
        set((st) => ({
          // 战斗面板就在问道窗口里，窗口没开着便先把它叫开，
          // 不然从宗门建筑里挑起的这一场非刷新看不见
          isStoryOpen: true,
          battle: {
            ...st.battle,
            isActive: true,
            map: map
              ? { ...map, entities: seedFacing(map.entities) }
              : {
                  width: 10,
                  height: 10,
                  entities: [],
                },
            round: 1,
            turn: "player",
            narrative: "",
            isResolving: false,
            errorMsg: "",
            context: [],
            incense: { stick: 1, progress: 0 },
            stamina: staminaMax,
            staminaMax,
            // 新起的一场，不带着上一场的收尾与宗门战的影子
            aftermath: null,
            sectWar: null,
          },
        }));
      },

      startSectWar: (brief) => {
        const game = useGameStore.getState();
        const role = brief.role;
        // 守宗时来犯的必是一处宗门；攻伐时才分打的是宗门、城还是村
        const kind: "sect" | "city" | "village" =
          role === "defender" ? "sect" : brief.targetKind ?? "sect";
        const player = game.player;
        // 内伤一类状态压低了此刻的气血上限，山门战里也照这个数排阵
        const playerMaxHp = effectiveHpMax(player);
        const companions = game.relations.filter((r) => r.traveling);
        const beast = game.beast;

        let opponentId = "";
        let foeName = brief.opponentName || "来犯之敌";
        let foe: { units: BattleEntity[]; arrayHp: number };

        if (kind === "city") {
          const city = getCityMarkers().find((m) => m.name === brief.opponentName);
          opponentId = city?.id ?? "";
          if (city) foeName = city.name;
          foe = buildCityUnits(foeName, unitCountFrom(opponentId || foeName, 8, 6));
        } else if (kind === "village") {
          const village = Object.values(game.villages ?? {}).find(
            (v) => v?.name === brief.opponentName,
          );
          opponentId = village?.key ?? "";
          if (village) foeName = village.name;
          foe = buildVillageUnits(foeName, unitCountFrom(opponentId || foeName, 4, 6));
        } else {
          const opponent = findSectByName(game.sectSites, brief.opponentName);
          opponentId = opponent?.id ?? "";
          if (opponent) foeName = opponent.name;
          foe = buildSectUnits(foeName, opponent);
        }

        const ourSide: BattleEntity[] = [
          {
            id: "player",
            name: player.name || "玩家",
            type: "player",
            position: { x: 5, y: 5 },
            hp: Math.min(player.hp, playerMaxHp),
            maxHp: playerMaxHp,
            mp: player.mp,
            maxMp: player.mpMax,
          },
          ...(beast
            ? [
                {
                  id: "beast",
                  name: beast.name,
                  type: "ally" as const,
                  position: { x: 6, y: 6 },
                  hp: beast.hp,
                  maxHp: beast.hpMax,
                },
              ]
            : []),
          ...companions.map((c, i) => ({
            id: `ally-${c.id}`,
            name: c.name,
            type: "ally" as const,
            position: { x: 4, y: 4 + i },
            hp: c.stats?.hp,
            maxHp: c.stats?.hpMax,
            mp: c.stats?.mp,
            maxMp: c.stats?.mpMax,
          })),
        ];

        // 我方守宗时，护山大阵立在自己阵中；阵的厚薄照本门品级来
        const mineSite = game.sectSites.find((s) => s.mine);
        const ourArrayHp = Math.round(140 + Math.max(1, Number(mineSite?.level) || 1) * 100);
        const ourArray: BattleEntity | null =
          role === "defender"
            ? {
                id: "our-array",
                name: "护山大阵",
                type: "ally",
                position: { x: 3, y: 5 },
                hp: ourArrayHp,
                maxHp: ourArrayHp,
                icon: "阵",
              }
            : null;

        const entities =
          role === "attacker"
            ? [...ourSide, ...foe.units]
            : [...ourSide, ...(ourArray ? [ourArray] : []), ...foe.units];
        const staminaMax = battleStaminaMax(effectiveAttributes(player).vitality);

        set((st) => ({
          isStoryOpen: true,
          battle: {
            ...st.battle,
            isActive: true,
            map: {
              width: 10,
              height: 10,
              entities: entities.map((e) => ({
                ...e,
                facing: e.facing ?? (e.type === "enemy" ? "北" : "南"),
              })),
            },
            round: 1,
            turn: "player",
            narrative: "",
            isResolving: false,
            errorMsg: "",
            context: [],
            incense: { stick: 1, progress: 0 },
            stamina: staminaMax,
            staminaMax,
            aftermath: null,
            options: [],
            // 认得出对手才记这一战是要发落的宗门战；认不出便只当寻常厮杀
            sectWar: opponentId
              ? { opponentId, opponentName: foeName, targetKind: kind, role }
              : null,
          },
        }));
      },

      endBattle: () => {
        set(() => ({
          battle: {
            ...INITIAL_BATTLE,
            isActive: false,
          },
        }));
      },

      setBattleNarrative: (narrative) => {
        set((st) => ({
          battle: {
            ...st.battle,
            narrative,
          },
        }));
      },

      updateBattleMap: (entities) => {
        set((st) => ({
          battle: {
            ...st.battle,
            map: {
              ...st.battle.map,
              entities,
            },
          },
        }));
      },

      runBattleTurn: async (action) => {
        const { settings } = get();
        if (!aiReady(settings)) {
          set((st) => ({
            battle: {
              ...st.battle,
              errorMsg: "推演接口尚未接通。",
            },
          }));
          return;
        }

        set((st) => ({
          battle: {
            ...st.battle,
            isResolving: true,
            errorMsg: "",
          },
        }));

        const player = useGameStore.getState().player;
        const battleState = get().battle;
        // 最近两回的叙事：这一战的前因与对手的来历都在里头，战斗里也要读得到
        const storyBrief = recentStoryBrief(get().conversation.turns);
        const inventory = Array.isArray(useGameStore.getState().inventory) ? useGameStore.getState().inventory : [];
        const techniques = Array.isArray(useGameStore.getState().techniques) ? useGameStore.getState().techniques : [];
        const relations = Array.isArray(useGameStore.getState().relations) ? useGameStore.getState().relations : [];
        // 随身的灵兽也在阵中：它在图上是个 ally，却不在尘缘之列，单报一声
        const beast = useGameStore.getState().beast;
        const playerWeapons = inventory.filter((i) => i.type === "法宝");
        const playerTalismans = inventory.filter((i) => i.type === "符箓");
        const playerPills = inventory.filter((i) => i.type === "丹药");
        // 同行的几位也在这张图上，类型是 ally；推演时他们每回合都要出手
        const allies = Array.isArray(battleState.map.entities)
          ? battleState.map.entities.filter((e) => e.type === "ally")
          : [];
        const allyBrief = allies
          .map((a) => {
            const rel = relations.find((r) => `ally-${r.id}` === a.id);
            const hp = typeof a.hp === "number" && typeof a.maxHp === "number" ? `气血${a.hp}/${a.maxHp}` : "气血不详";
            return `${a.name}（${rel?.realm ?? "境界不详"}，${hp}）`;
          })
          .join("、");

        // 玩家此刻修到第几重：与功法界面同一套算法，圆满了便算十重皆过
        const currentLevelOf = (t: Technique): number => techniqueLevelOf(t);

        // 已解锁的招式，列给解析那一步，供其认招
        const unlockedSkills = computableSkills(techniques, currentLevelOf);
        const skillPalette = unlockedSkills.map(({ technique, skill }) => ({
          techniqueName: technique.name,
          skillName: skill.name,
          style: techniqueStyleOf(technique),
          mpCost: Math.max(0, Math.round(skill.mpCost || 0)),
          hpCost: Math.max(0, Math.round(skill.hpCost || 0)),
          mpRestore: Math.max(0, Math.round(skill.mpRestore || 0)),
          damage: Math.max(0, Math.round(skill.damage || 0)),
          cooldown: Math.max(0, Math.round(skill.cooldown || 0)),
          guard: Math.max(0, Math.round(Number(skill.guard) || 0)),
          effect: (skill.effects || [])
            .map((e) => e.description || `${e.stat || "属性"}${e.value ?? ""}`)
            .join("、"),
          range: rangeLabel(skillRange(skill, technique.category)),
          buffs: (Array.isArray(skill.buffs) ? skill.buffs : [])
            .map((b) => {
              const tpl = findBuffTemplate(b.id);
              return tpl ? `${tpl.name}（${b.target === "self" ? "自身" : "敌方"}）` : "";
            })
            .filter(Boolean)
            .join("、"),
        }));
        const skillBrief =
          skillPalette
            .map((s) => {
              // 心法催运那一招不耗灵力，改写耗气血与回灵力
              const cost =
                s.hpCost > 0 && s.mpRestore > 0
                  ? `耗气血 ${s.hpCost}·回灵力 ${s.mpRestore}`
                  : `耗灵 ${s.mpCost}`;
              return `${s.techniqueName}·${s.skillName}（${cost}，威力 ${s.damage}，冷却 ${s.cooldown}，效果：${s.effect || "无"}）`;
            })
            .join("；") || "无";

        // 守势招式单列一份：被动触发时照最高那一招的一半减伤
        const guardBrief =
          unlockedSkills
            .filter(({ skill }) => Number(skill.guard) > 0)
            .map(
              ({ technique, skill }) =>
                `${technique.name}·${skill.name}（减伤 ${Math.round(Number(skill.guard) || 0)}，耗灵 ${Math.max(
                  0,
                  Math.round(Number(skill.mpCost) || 0),
                )}）`,
            )
            .join("；") || "无";

        const playerId =
          battleState.map.entities.find((e) => e.type === "player")?.id ?? "player";
        const playerEntity = battleState.map.entities.find((e) => e.id === playerId);
        // 气血上限照开战那一刻算：内伤一类状态已压过一道，战斗里再散也不中途反弹
        const battleMaxHp = Math.max(
          1,
          Math.trunc(Number(playerEntity?.maxHp) || effectiveHpMax(player)),
        );

        // 四条根基先过一道临时状态：buff 压过的那一截也算数，且不受潜力所限
        const attrs = effectiveAttributes(player);
        const moveLimit = movementLimit(attrs.agility);

        // 第一步：请模型把这一句行动读懂——使哪一招、打谁、往哪儿挪。只解析参数，不碰数值
        let intent: BattleIntent = {
          skill: "",
          technique: "",
          target: "",
          move: null,
          item: "",
          note: "",
        };
        try {
          const intentRaw = await chatWithModel(
            settings,
            settings.flashModel,
            buildBattleIntentPrompt({
              action,
              skills: skillPalette,
              player: {
                name: player.name,
                x: playerEntity?.position.x ?? 0,
                y: playerEntity?.position.y ?? 0,
                hp: Math.min(player.hp, battleMaxHp),
                maxHp: battleMaxHp,
                mp: player.mp,
                maxMp: player.mpMax,
              },
              entities: battleState.map.entities.map((e) => ({
                id: e.id,
                name: e.name,
                type: e.type,
                x: e.position.x,
                y: e.position.y,
                hp: e.hp,
                maxHp: e.maxHp,
                isDead: e.isDead,
                facing: facingOf(e),
                style: e.style,
                buffs: (Array.isArray(e.buffs) ? e.buffs : [])
                  .map((b) => `${b.name}（余 ${b.duration} 柱）`)
                  .join("、"),
              })),
              width: battleState.map.width,
              height: battleState.map.height,
              moveLimit,
              stamina: battleState.stamina,
              staminaMax: battleState.staminaMax,
              // 随身物件也报一份：丹药、符箓、材料都算，法宝是兵器不在此列
              items: inventory
                .filter((i) => i.type !== "法宝" && Number(i.count) > 0)
                .slice(0, 30)
                .map((i) => ({ name: i.name, type: i.type, count: Number(i.count) || 0, desc: i.desc })),
              recent: battleState.context.slice(-4),
              story: storyBrief,
            }),
            { timeoutMs: 30000, retries: 1, jsonMode: true },
          );
          intent = parseBattleIntent(intentRaw);
        } catch (e) {
          // 解析不成便照没出招走，绝不因此拦住这一回合
          console.warn("[runBattleTurn] 招式解析失败，本回合按未出招处理:", e);
        }

        // 第二步：本地判定。伤害、耗灵与负面效果一律照招式与自身根基算定，取整不随机。
        // 认招要认得宽：模型常把招式写成「功法·招式」，也可能只把招式名写在行动原文里
        const matchedSkill =
          (intent.skill ? findSkillByName(techniques, intent.skill) : null) ??
          (intent.skill ? findSkillMentionedIn(unlockedSkills, intent.skill) : null) ??
          findSkillMentionedIn(unlockedSkills, action);

        const actor: CombatActor = {
          realmIndex: player.realmIndex,
          cultivation: player.cultivation,
          hp: Math.min(player.hp, battleMaxHp),
          maxHp: battleMaxHp,
          mp: player.mp,
          maxMp: player.mpMax,
          stats: {
            vitality: attrs.vitality,
            soul: attrs.soul,
            wisdom: attrs.wisdom,
            agility: attrs.agility,
          },
          heartScores: player.stats.heartScores,
          meridians: player.meridians,
        };
        const cast = matchedSkill
          ? computeSkillCast({
              actor,
              technique: matchedSkill.technique,
              skill: matchedSkill.skill,
            })
          : null;

        // 守势：主动施展且灵力够，便得全额减免；这一回合力有不逮，攻击一概忽略
        const guardSkillValue = matchedSkill
          ? Math.max(0, Math.round(Number(matchedSkill.skill.guard) || 0))
          : 0;
        const activeGuard = guardSkillValue > 0 && cast?.usable ? guardSkillValue : 0;

        // 这一回合能挪多远，先由身法定一个上限，再看体力够不够付这一步
        const myPos = {
          x: playerEntity?.position.x ?? 0,
          y: playerEntity?.position.y ?? 0,
        };
        let moveTo =
          intent.move && Number.isFinite(intent.move.x) && Number.isFinite(intent.move.y)
            ? intent.move
            : null;
        let moveNote = "";
        let staminaLeft = Math.max(0, Number(battleState.stamina) || 0);
        if (moveTo) {
          const dist = Math.max(Math.abs(moveTo.x - myPos.x), Math.abs(moveTo.y - myPos.y));
          const occupied = battleState.map.entities.some(
            (o) =>
              o.id !== playerId &&
              !o.isDead &&
              o.position.x === moveTo!.x &&
              o.position.y === moveTo!.y,
          );
          if (dist <= 0) {
            moveTo = null;
          } else if (dist > moveLimit) {
            moveNote = `身法只够一回合挪 ${moveLimit} 格，这一步要挪 ${dist} 格，挪不到，仍站在原地。`;
            moveTo = null;
          } else if (occupied) {
            moveNote = "那一格已经有人站着，挪不过去，仍站在原地。";
            moveTo = null;
          } else if (staminaLeft < dist * MOVE_STAMINA_COST) {
            moveNote = `体力只剩 ${staminaLeft}，挪这 ${dist} 格不够，仍站在原地。`;
            moveTo = null;
          } else {
            staminaLeft -= dist * MOVE_STAMINA_COST;
          }
        }

        // 招式范围：以出手那一刻脚下为心，先把谁在范围之内判清楚。
        // 说了要挪窝的，若那一格空着、也还挪得动，便照挪过去之后的位置算。
        const origin = moveTo ?? myPos;
        const convertCast = matchedSkill
          ? isHeartConversion(matchedSkill.technique, matchedSkill.skill)
          : false;
        // 只对自己使的功夫（护体、聚气之类）不冲人去，也就不必论远近；
        // 伤害、负面效果与挂在敌方身上的状态，都算冲人去的
        const hasFoeBuff = matchedSkill
          ? (Array.isArray(matchedSkill.skill.buffs) ? matchedSkill.skill.buffs : []).some(
              (b) => b.target === "enemy",
            )
          : false;
        const aimsAtFoe =
          !activeGuard && cast !== null && (cast.damage > 0 || cast.debuffs.length > 0 || hasFoeBuff);
        const castRange =
          matchedSkill && !convertCast && aimsAtFoe
            ? skillRange(matchedSkill.skill, matchedSkill.technique.category)
            : null;
        const reachable = castRange
          ? enemiesInRange(
              battleState.map.entities,
              origin,
              castRange,
              battleState.map.width,
              battleState.map.height,
            )
          : [];
        // 这一招落在谁头上：点名的人够得着便打他；够不着便落空，不自动改打旁人
        let targetId: string | null = null;
        let rangeNote = "";
        if (cast && castRange) {
          const asked = (intent.target || "").trim();
          const foe = asked
            ? battleState.map.entities.find(
                (e) =>
                  e.type === "enemy" &&
                  !e.isDead &&
                  (e.id === asked || e.name === asked || asked.includes(e.name) || e.name.includes(asked)),
              )
            : undefined;
          if (foe) {
            if (reachable.some((e) => e.id === foe.id)) {
              targetId = foe.id;
            } else {
              rangeNote = `范围：这一招及于${rangeLabel(castRange)}，${foe.name}却在范围之外，够不着，这一招落了空。`;
            }
          } else if (reachable.length > 0) {
            targetId = resolveBattleTarget(reachable, playerId, "");
          } else {
            rangeNote = `范围：这一招及于${rangeLabel(castRange)}，此刻范围之内没有敌人，这一招无处可落。`;
          }
        }

        // 从哪一侧攻入、两式如何相克：背后与侧方更见便宜，样式相克另给一倍率，皆由本地算定
        const targetEntity = targetId
          ? battleState.map.entities.find((e) => e.id === targetId)
          : undefined;
        const angle =
          cast && targetEntity && cast.damage > 0 ? strikeAngle(origin, targetEntity) : null;
        const styleMatch =
          cast && targetEntity && cast.damage > 0
            ? styleMatchup(
                matchedSkill ? techniqueStyleOf(matchedSkill.technique) : null,
                targetEntity.style,
              )
            : null;
        let appliedCast = cast;
        if (appliedCast && cast && cast.damage > 0) {
          const angleFactor = angle?.factor ?? 1;
          const styleFactor = styleMatch?.factor ?? 1;
          if (angleFactor !== 1 || styleFactor !== 1) {
            const damage = Math.max(1, Math.round(cast.damage * angleFactor * styleFactor));
            appliedCast = {
              ...cast,
              damage,
              breakdown: [
                ...cast.breakdown,
                ...(angle && angleFactor !== 1 ? [`${angle.label}出手 ×${angleFactor}`] : []),
                ...(styleMatch && styleFactor !== 1
                  ? [`样式：${styleMatch.label} ×${styleFactor}`]
                  : []),
              ],
              summary: cast.summary.replace(/造成 \d+ 点伤害/, `造成 ${damage} 点伤害`),
            };
          }
        }

        const local = applyBattleCast({
          entities: battleState.map.entities,
          playerId,
          cast: appliedCast,
          targetId,
          moveTo,
        });

        // 招式使成之后，照招式上写定的那几条状态落到己方或对手头上
        const skillBuffDuration = matchedSkill
          ? Math.min(12, Math.max(1, Math.round(Number(matchedSkill.skill.debuffDuration) || 3)))
          : 3;
        const skillBuffSource = matchedSkill ? `招式「${matchedSkill.skill.name}」` : "招式";
        const selfBuffLines: string[] = [];
        const enemyBuffs: BattleEntityBuff[] = [];
        if (cast?.usable && matchedSkill) {
          for (const ref of Array.isArray(matchedSkill.skill.buffs) ? matchedSkill.skill.buffs : []) {
            const tpl = findBuffTemplate(ref.id);
            if (!tpl) continue;
            if (ref.target === "self") {
              if (tpl.isDebuff) continue;
              // 同名状态已在身上便续上柱数，不另添一条重样的
              const gs = useGameStore.getState();
              const current = Array.isArray(gs.player.buffs) ? gs.player.buffs : [];
              const existing = current.find((b) => b.id === tpl.id && b.durationType === "incense");
              if (existing) {
                gs.setPlayer({
                  ...gs.player,
                  buffs: current.map((b) =>
                    b.id === tpl.id
                      ? {
                          ...b,
                          duration: Math.max(Number(b.duration) || 0, skillBuffDuration),
                          stacks: Math.min(b.maxStacks, (Number(b.stacks) || 1) + 1),
                        }
                      : b,
                  ),
                });
              } else {
                gs.setPlayer({
                  ...gs.player,
                  buffs: [
                    ...current,
                    buffFromTemplate(tpl, {
                      durationType: "incense",
                      duration: skillBuffDuration,
                      source: skillBuffSource,
                    }),
                  ],
                });
              }
              selfBuffLines.push(`${tpl.name}（余 ${skillBuffDuration} 柱）`);
            } else if (tpl.isDebuff && targetId) {
              enemyBuffs.push({
                id: tpl.id,
                name: tpl.name,
                duration: skillBuffDuration,
                isDebuff: true,
              });
            }
          }
        }
        // 这一招落在对手身上的状态，记在那一位名下，随香递减
        let battleEntities = local.entities;
        if (enemyBuffs.length > 0 && targetId) {
          battleEntities = battleEntities.map((e) =>
            e.id === targetId
              ? { ...e, buffs: [...(Array.isArray(e.buffs) ? e.buffs : []), ...enemyBuffs] }
              : e,
          );
        }

        // 灵力照判定的数当场扣掉，不让模型再算一遍
        if (local.mpSpent > 0) {
          useGameStore.getState().applyOps([
            { kind: "modify", path: "player.mp", op: "-", value: String(local.mpSpent) },
          ]);
        }
        // 心法催运：气血扣、灵力补，也当场落定
        if (local.hpSpent > 0) {
          useGameStore.getState().applyOps([
            { kind: "modify", path: "player.hp", op: "-", value: String(local.hpSpent) },
          ]);
        }
        if (local.mpRestored > 0) {
          useGameStore.getState().applyOps([
            { kind: "modify", path: "player.mp", op: "+", value: String(local.mpRestored) },
          ]);
        }

        // 第三步：把判定结果与各项参数一并交给叙事那一步照写
        const settledTarget = targetId
          ? local.entities.find((e) => e.id === targetId)
          : undefined;
        const settleLines: string[] = [];
        if (appliedCast) {
          settleLines.push(`招式：《${appliedCast.techniqueName}》·${appliedCast.skillName}`);
          settleLines.push(`判定依据：${appliedCast.breakdown.join("、")}`);
          settleLines.push(`结算：${appliedCast.summary}`);
          if (angle) settleLines.push(`出手方位：自${angle.label}攻入（伤害 ×${angle.factor}）`);
          if (styleMatch) settleLines.push(`样式：${styleMatch.label}（伤害 ×${styleMatch.factor}）`);
          // 心法催运不冲着谁去，便不报目标
          if (targetId && appliedCast.hpCost <= 0) settleLines.push(`目标：${settledTarget?.name ?? targetId}`);
          if (appliedCast.damage > 0 && settledTarget && typeof settledTarget.hp === "number") {
            settleLines.push(
              `目标气血：已由系统扣至 ${settledTarget.hp}${
                typeof settledTarget.maxHp === "number" ? `/${settledTarget.maxHp}` : ""
              }${settledTarget.isDead ? "，气绝倒地" : ""}`,
            );
          }
        }
        if (castRange) {
          settleLines.push(`招式范围：${rangeLabel(castRange)}`);
          if (rangeNote) {
            settleLines.push(`${rangeNote}叙事须写成落空，不得写成打中，也不要再扣目标气血。`);
          } else {
            settleLines.push(`范围内敌人：${reachable.map((e) => e.name).join("、") || "无"}`);
          }
        }
        if (activeGuard > 0) {
          settleLines.push(
            `守势：你以「${matchedSkill?.skill.name ?? "守势"}」护住周身，这一合可抵 ${activeGuard} 点伤害（已由系统算定）。`,
          );
          settleLines.push("这一回合你全力守御，力有不逮，任何攻击都无从谈起——叙事里不得写成你打中敌人。");
        }
        if (local.mpSpent > 0) {
          settleLines.push(`你的灵力：已由系统扣至 ${Math.max(0, player.mp - local.mpSpent)}`);
        }
        if (local.hpSpent > 0) {
          settleLines.push(
            `你的气血：因这一门心法已由系统扣至 ${Math.max(1, player.hp - local.hpSpent)}（这一笔不要再写进 OPS）`,
          );
        }
        if (local.mpRestored > 0) {
          settleLines.push(
            `你的灵力：因这一门心法已由系统回至 ${Math.min(player.mpMax, player.mp + local.mpRestored)}（这一笔不要再写进 OPS）`,
          );
        }
        if (moveTo && local.owned.includes(playerId)) {
          settleLines.push(`走位：你已移步至 (${moveTo.x}, ${moveTo.y})`);
        }
        if (moveNote) settleLines.push(`走位未能成行：${moveNote}`);
        if (selfBuffLines.length > 0) {
          settleLines.push(`己方状态：已由系统落下 ${selfBuffLines.join("、")}（不要重复写进 OPS）`);
        }
        if (enemyBuffs.length > 0 && settledTarget) {
          settleLines.push(
            `敌方状态：${settledTarget.name} 身上落下 ${enemyBuffs.map((b) => `「${b.name}」`).join("、")}，各余 ${skillBuffDuration} 柱`,
          );
        }
        settleLines.push(
          `体力：这一合用去 ${Math.max(0, battleState.stamina - staminaLeft)}，尚余 ${staminaLeft}/${battleState.staminaMax}（一回合至多挪 ${moveLimit} 格，每格耗 ${MOVE_STAMINA_COST}）。`,
        );
        if (intent.item) settleLines.push(`用物：${intent.item}`);
        if (intent.note) settleLines.push(`其余要点：${intent.note}`);

        const settleBlock =
          settleLines.length > 0
            ? `\n\n【本回合判定·已由系统算定，照此改写，数值不得再改】\n${settleLines.join(
                "\n",
              )}\n请在叙事中如实体现这次判定：上述伤害与耗灵都已落定，不必也不要再在 OPS 里重复增减。这一回合敌人的还手、你身上落下的状态，仍照你的叙述写进 OPS。`
            : "";

        const prompt: import("@/lib/aiClient").ChatMessage[] = [
          {
            role: "system" as const,
            content: `你是一个仙侠战斗模拟器。当前处于战斗模式，地图为10x10瓦片。

${PROSE_STYLE}

当前战斗状态：
- 回合：${battleState.round}
- 当前行动方：${battleState.turn}
- 玩家状态：气血=${Math.min(player.hp, battleMaxHp)}/${battleMaxHp}，灵力=${player.mp}/${player.mpMax}
- 玩家属性：体魄=${attrs.vitality}，神魂=${attrs.soul}，悟性=${attrs.wisdom}，身法=${attrs.agility}
- 体力：${staminaLeft}/${battleState.staminaMax}（挪一格耗 ${MOVE_STAMINA_COST} 点，一回合至多挪 ${moveLimit} 格；体力不够便挪不动）
- 玩家境界：${player.cultivation}
- 玩家法宝：${playerWeapons.map((w) => `${w.name}(${w.grade})`).join(", ") || "无"}
- 当前功法：${techniques.map((t) => `${t.name}(${t.grade})：${t.description}`).join("；") || "无"}
- 已解锁的招式：${skillBrief}
- 守势招式：${guardBrief}
- 当前心法：${player.activeHeartTechnique ? techniques.find((t) => t.id === player.activeHeartTechnique)?.name || player.activeHeartTechnique : "无"}
- 玩家符箓：${playerTalismans.map((t) => `${t.name}(${t.count}张)`).join(", ") || "无"}
- 玩家丹药：${playerPills.map((p) => `${p.name}(${p.count}颗)`).join(", ") || "无"}
- 随身物件（法宝为兵器，不当消耗品用）：${inventory.filter((i) => Number(i.count) > 0).map((i) => `${i.name}×${i.count}(${i.type})`).join("，") || "无"}
- 香：第 ${battleState.incense.stick} 柱，已烧到 ${battleState.incense.progress}%
${beast ? `- 随身灵兽：${beastBrief(beast)}（图上 id 为 beast，type 为 ally，是你这一边的）\n` : ""}${allyBrief ? `- 同行队友（图上 type 为 ally，是你这一边的人）：${allyBrief}\n` : ""}- 地图实体：${JSON.stringify(battleEntities)}
${storyBrief ? `\n【这一战之前的近几回】（前因、对手的来历与所在之处都在这几段里，叙事须与之相合）\n${storyBrief}\n` : ""}
战斗上下文：
${battleState.context.join("\n")}

玩家行动：${action}${settleBlock}

请根据这份已算定的判定、玩家的属性、法宝、功法、符箓和丹药，写出这一回合的战斗叙事，并返回：
1. 战斗叙事文本
2. 数据操作（增减气血、灵力、buff等）
3. 更新后的实体位置
4. 这一柱香此刻烧到了几成

【香与时序】战斗中的时辰以香计，一柱香从 0% 烧到 100% 为一柱。兵刃交错的快攻，一柱香烧得慢；
倾力对拼、施放大术、久战缠斗，一柱香烧得快。你每回合都要报出这一柱香烧到了多少：
比上一回合多烧三到六成是常情，一招定生死时可以一次烧满。烧满 100% 即换下一柱，
换柱时照实报 100（或更高的数），不要直接写下一柱的小数字。
【朝向】entities 里每位都带 facing（东、南、西、北），写明面朝哪一方，你照叙事把它更新；从背后攻入伤害更重（×1.3）、侧方 ×1.15、正面不增。这一笔由系统照站位算定，你只照实写「绕到背后」「侧身递剑」这类经过，不必自己报倍数。
【样式】entities 的 style 是这一位的出手样式（长兵、挥砍短兵、刺击短兵、软兵、拳脚、射术、音律、御兽、符阵、术法）；两式相克由系统算定，你只照实写「一寸长一寸强」「横刀封住直刺」这类经过，不必自己报倍率，也不要改写 style 掩人耳目。
【守势】若敌方这一合从正面攻在你身上，且【守势招式】里有你使得出的，可在 BATTLE 块里报 -- guard: true：系统照最高那一招的一半减伤。背后、侧方来的伤不算；这一合没被打中、或没有守势招式，报 false。玩家主动施展守势的那一回合由系统全额减伤，此处不必再报。
${beast ? `【随身灵兽】图上的 beast 是你随身带着的${beast.name}，也是你这一边的。它${beast.temper || "自有性子"}，这一场里你每一段叙事都要写出它做了什么——扑咬、示警、绕到敌后、护在你身前、被打退，都行；招式要像一头兽，别让它说人话。它只受敌人所伤，你的招式不要伤及它，照实更新它的位置与气血，倒下了标 isDead 即可。亲疏越厚，它越肯为你搏命；亲疏还浅，就许它畏缩、走神、抢食。\n` : ""}${allies.length > 0 ? `【同行队友】图上的 ally 是同行的自己人，与你并肩，不是敌人。你的每一条叙事里都要写出他们这一回合做了什么（出招、护你、喝骂、吃亏都行），并照实更新他们的位置与气血；他们若是倒下，标 isDead 即可，不要写成敌人。他们只受敌人所伤，你的招式不要伤及他们。\n` : ""}【战斗中的持续状态】战斗里留下的临时状态一律按柱香计：用 ADD player.buffs 写入，
payload 写 {"id":"名录里的id","durationType":"incense","duration":柱数}，柱数取 1 到 12；
名目、类别、图标与效力都照下面这张名录来，不许自编。它由烧过的柱数自行递减，
你不要在 OPS 里手工去扣它的柱数。
【状态名录】
${buffCatalogBrief()}

【这一合的进言】叙事的末尾另备三条下一回合可取的出手，各 8 至 20 字，写清使哪一招、冲着谁，或往哪儿挪一步；
三条各走一路（抢攻、守势、走位调息之类），不要三条都是一个意思。这几条只填进玩家的输入栏，成不成仍由下一回合照规矩走。

输出格式：
<<<BATTLE>>>
-- narrative: 战斗叙事文本
-- incense: 45
-- guard: false
-- entities: [{"id":"player","name":"玩家","type":"player","position":{"x":5,"y":5},"hp":100,"maxHp":100,"facing":"南","style":"拳脚"},{"id":"enemy1","name":"妖兽","type":"enemy","position":{"x":7,"y":5},"hp":80,"maxHp":100,"facing":"北","style":"刺击短兵"}]
<<<END>>>
<<<OPS>>>
MODIFY player.hp - 20
MODIFY player.mp - 10
<<<END>>>
<<<QUICK>>>
欺身半步，以「……」直取那使刀的
敛势护住左肋，退开两步，再运功回气
挺剑斜刺，逼他让开中路，再顺势挪到左翼
<<<END>>>

注意：OPS 块必须写在 BATTLE 块的 <<<END>>> 之后，不要嵌在 BATTLE 块内部；
进言另起一块 <<<QUICK>>>，写在 OPS 之后，每条占一行，不编号、不加点号。`,
          },
          {
            role: "user" as const,
            content: action,
          },
        ];

        try {
          const raw = await chatWithModel(
            settings,
            settings.proModel,
            prompt,
            { timeoutMs: 60000, retries: 2 },
          );

          const parsed = parseModelOutput(raw);

          const modelOps = withoutDuplicateVitals(parsed.ops, {
            mpSpent: local.mpSpent,
            mpRestored: local.mpRestored,
            hpSpent: local.hpSpent,
          });
          // 守势：主动施展得全额；被动由叙事报 guard: true，只抵一半，且只认正面来攻
          const passiveGuard =
            activeGuard > 0 || !parsed.battleGuard
              ? 0
              : Math.round(
                  unlockedSkills.reduce(
                    (max, e) => Math.max(max, Math.round(Number(e.skill.guard) || 0)),
                    0,
                  ) * 0.5,
                );
          const guardCut = activeGuard > 0 ? activeGuard : passiveGuard;
          const guardedOps = applyGuardToOps(modelOps, guardCut);
          if (guardedOps.length > 0) {
            useGameStore.getState().applyOps(guardedOps);
          }

          // OPS 块之外，叙事里另有的实事也经路由认一遍：得的东西、结的仇、损的法器
          await settleBattleNarrative(settings, parsed.narrative, {
            mpSpent: local.mpSpent,
            mpRestored: local.mpRestored,
            hpSpent: local.hpSpent,
          });

          // 走位、别处的增减听模型的；凡本地判定定下的那几位，气血与位次以本地为准
          const mergedEntities = mergeBattleEntities(
            battleEntities,
            parsed.battleEntities,
            local.owned,
          );
          const { allEnemiesDead, playerDead } = resolveBattleOutcome(mergedEntities);

          // 香烧满一柱便换下一柱；烧过几柱，身上的临时状态便减几柱
          const incense = advanceIncense(battleState.incense, parsed.battleIncense);
          if (incense.burned > 0) useGameStore.getState().burnIncense(incense.burned);

          // 敌人身上的状态随香递减，烧完的自行散去；这一合刚落的先不算这一柱
          const freshBuffIds = new Set(enemyBuffs.map((b) => b.id));
          const entitiesAfterBurn =
            incense.burned > 0
              ? mergedEntities.map((e) => {
                  if (!Array.isArray(e.buffs) || e.buffs.length === 0) return e;
                  return {
                    ...e,
                    buffs: e.buffs
                      .map((b) =>
                        freshBuffIds.has(b.id)
                          ? b
                          : { ...b, duration: b.duration - incense.burned },
                      )
                      .filter((b) => b.duration > 0),
                  };
                })
              : mergedEntities;
          // 挪过步便扣体力，这一合下来再缓一口气
          const staminaNext = Math.min(
            battleState.staminaMax,
            Math.max(0, staminaLeft) + staminaRegen(battleState.staminaMax),
          );

          const actionContext = `回合${battleState.round} 玩家行动：${action}`;
          const resultContext = parsed.narrative
            ? `结果：${parsed.narrative}${guardCut > 0 ? `（守势减伤 ${guardCut}）` : ""}`
            : "";

          set((st) => {
            const newContext = [...st.battle.context, actionContext, resultContext].slice(-20);
            return {
              battle: {
                ...st.battle,
                isResolving: false,
                // 一次推演就把交手双方的这一合走完（灵兽与队友也在同一段叙事里出手），
                // 走完即交回玩家；不再停在「敌方行动」上等一个永远不会来的回合
                turn: "player",
                round: st.battle.round + 1,
                narrative: parsed.narrative || st.battle.narrative,
                map: { ...st.battle.map, entities: entitiesAfterBurn },
                isActive: !(allEnemiesDead || playerDead),
                stamina: staminaNext,
                staminaMax: battleState.staminaMax,
                // 分出胜负便立起收尾；未分胜负时保持原样（多为 null）
                aftermath: allEnemiesDead || playerDead
                  ? makeAftermath(allEnemiesDead)
                  : st.battle.aftermath ?? null,
                context: newContext,
                incense: { stick: incense.stick, progress: incense.progress },
                // 模型照这一合的战况备下的几条出手，摆在界面上供玩家取用
                options: parsed.quickDecisions.slice(0, 3),
              },
            };
          });
        } catch (e) {
          const errorMsg = (e as Error).message;
          const isNetworkError = errorMsg.includes("网络") || errorMsg.includes("CORS") ||
            errorMsg.includes("请求超时") || errorMsg.includes("不可达") || errorMsg.includes("重试");

          if (isNetworkError && settings.proModel !== settings.flashModel) {
            console.warn("[runBattleTurn] Pro模型网络请求失败，尝试降级到Flash模型...");
            try {
              const raw = await chatWithModel(
                settings,
                settings.flashModel,
                prompt,
                { timeoutMs: 60000, retries: 2 },
              );

              const parsed = parseModelOutput(raw);

              const modelOps = withoutDuplicateVitals(parsed.ops, {
                mpSpent: local.mpSpent,
                mpRestored: local.mpRestored,
                hpSpent: local.hpSpent,
              });
              // 同主力模型那条路：守势照减
              const passiveGuard =
                activeGuard > 0 || !parsed.battleGuard
                  ? 0
                  : Math.round(
                      unlockedSkills.reduce(
                        (max, e) => Math.max(max, Math.round(Number(e.skill.guard) || 0)),
                        0,
                      ) * 0.5,
                    );
              const guardCut = activeGuard > 0 ? activeGuard : passiveGuard;
              const guardedOps = applyGuardToOps(modelOps, guardCut);
              if (guardedOps.length > 0) {
                useGameStore.getState().applyOps(guardedOps);
              }

              // 同主力模型那条路：叙事里另有的实事也经路由认一遍
              await settleBattleNarrative(settings, parsed.narrative, {
                mpSpent: local.mpSpent,
                mpRestored: local.mpRestored,
                hpSpent: local.hpSpent,
              });

              // 同主力模型那条路：本地判定定下的那几位，气血与位次以本地为准
              const mergedEntities = mergeBattleEntities(
                battleEntities,
                parsed.battleEntities,
                local.owned,
              );
              const { allEnemiesDead, playerDead } = resolveBattleOutcome(mergedEntities);

              const incense = advanceIncense(battleState.incense, parsed.battleIncense);
              if (incense.burned > 0) useGameStore.getState().burnIncense(incense.burned);

              // 同主力模型那条路：敌人身上的状态随香递减，刚落的先不算这一柱
              const freshBuffIds = new Set(enemyBuffs.map((b) => b.id));
              const entitiesAfterBurn =
                incense.burned > 0
                  ? mergedEntities.map((e) => {
                      if (!Array.isArray(e.buffs) || e.buffs.length === 0) return e;
                      return {
                        ...e,
                        buffs: e.buffs
                          .map((b) =>
                            freshBuffIds.has(b.id)
                              ? b
                              : { ...b, duration: b.duration - incense.burned },
                          )
                          .filter((b) => b.duration > 0),
                      };
                    })
                  : mergedEntities;
              const staminaNext = Math.min(
                battleState.staminaMax,
                Math.max(0, staminaLeft) + staminaRegen(battleState.staminaMax),
              );

              const actionContext = `回合${battleState.round} 玩家行动：${action}`;
              const resultContext = parsed.narrative
                ? `结果：${parsed.narrative}${guardCut > 0 ? `（守势减伤 ${guardCut}）` : ""}`
                : "";

              set((st) => {
                const newContext = [...st.battle.context, actionContext, resultContext].slice(-20);
                return {
                  battle: {
                    ...st.battle,
                    isResolving: false,
                    // 同主力模型那条路：这一合走完便交回玩家
                    turn: "player",
                    round: st.battle.round + 1,
                    narrative: parsed.narrative || st.battle.narrative,
                    map: { ...st.battle.map, entities: entitiesAfterBurn },
                    isActive: !(allEnemiesDead || playerDead),
                    stamina: staminaNext,
                    staminaMax: battleState.staminaMax,
                    // 同主力模型那条路：分出胜负便立起收尾
                    aftermath: allEnemiesDead || playerDead
                      ? makeAftermath(allEnemiesDead)
                      : st.battle.aftermath ?? null,
                    context: newContext,
                    incense: { stick: incense.stick, progress: incense.progress },
                    // 同主力模型那条路：进言也一并收下
                    options: parsed.quickDecisions.slice(0, 3),
                  },
                };
              });
            } catch (fallbackErr) {
              console.error("[runBattleTurn] Flash模型降级也失败:", fallbackErr);
              set((st) => ({
                battle: {
                  ...st.battle,
                  isResolving: false,
                  errorMsg: `Pro模型网络请求失败，Flash模型降级也失败：${(fallbackErr as Error).message}\n请检查网络连接或在设置中更换Base URL。`,
                },
              }));
            }
          } else {
            set((st) => ({
              battle: {
                ...st.battle,
                isResolving: false,
                errorMsg: isNetworkError
                  ? `网络连接失败：${errorMsg}\n请检查网络连接或在设置中更换Base URL。`
                  : errorMsg,
              },
            }));
          }
        }
      },

      runEscapeTurn: async (text) => {
        const aft = get().battle.aftermath;
        if (!aft || aft.stage !== "escape") return;
        const body = text.trim();
        if (!body) return;

        const { settings } = get();
        if (!aiReady(settings)) {
          set((st) => ({ battle: { ...st.battle, errorMsg: "推演接口尚未接通。" } }));
          return;
        }

        set((st) =>
          st.battle.aftermath
            ? {
                battle: {
                  ...st.battle,
                  errorMsg: "",
                  aftermath: { ...st.battle.aftermath, resolving: true },
                },
              }
            : {},
        );

        const place = getMarker(useGameStore.getState().currentPlaceId)?.name ?? "此处";

        try {
          const brief: EscapeBrief = {
            role: aft.role,
            pursuit: aft.pursuit,
            retreat: aft.retreat,
            place,
            text: body,
            story: recentStoryBrief(get().conversation.turns),
          };
          const raw = await chatWithModel(settings, settings.flashModel, buildEscapePrompt(brief), {
            timeoutMs: 60000,
            jsonMode: true,
            retries: 1,
            temperature: 0.8,
          });
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
          } catch {
            parsed = null;
          }

          const narrative = String(parsed?.narrative ?? "").trim();
          const clampDelta = (v: unknown) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 0;
            return Math.max(-30, Math.min(30, Math.round(n)));
          };
          const clampPct = (v: number) => Math.max(0, Math.min(100, v));
          const pursuit = clampPct(aft.pursuit + clampDelta(parsed?.pursuitDelta));
          const retreat = clampPct(aft.retreat + clampDelta(parsed?.retreatDelta));

          // 结算：先看有没有逃掉，再看有没有被追上，都没有就继续逃
          let stage: BattleAftermath["stage"] = "escape";
          let outcome: string | undefined;
          let loot: BattleLootItem[] = aft.loot;
          if (retreat >= 100 && pursuit <= retreat) {
            stage = "done";
            outcome =
              aft.role === "chase"
                ? "敌人趁隙脱身，你追之不及，只能罢手。"
                : "你舍命奔逃，终于把追兵甩在了身后。";
          } else if (pursuit >= 100 || pursuit > retreat) {
            if (aft.role === "chase") {
              stage = "loot";
              loot = makeLoot(get().battle.map.entities);
            } else {
              stage = "surrender";
            }
          }

          set((st) =>
            st.battle.aftermath
              ? {
                  battle: {
                    ...st.battle,
                    errorMsg: "",
                    aftermath: {
                      ...st.battle.aftermath,
                      resolving: false,
                      narrative: narrative || st.battle.aftermath.narrative,
                      pursuit,
                      retreat,
                      stage,
                      loot,
                      outcome: outcome ?? st.battle.aftermath.outcome,
                    },
                  },
                }
              : {},
          );

          const gs = useGameStore.getState();
          if (narrative) gs.addLog(`【收尾】${narrative}`);
          if (stage === "done" && outcome) gs.addLog(`【收尾】${outcome}`);
          if (stage === "loot") gs.addLog("【收尾】你追上了敌人，可搜检战利品了。");
          if (stage === "surrender") gs.addLog("【收尾】你被追上，落入了敌手。");
        } catch (e) {
          set((st) => ({
            battle: {
              ...st.battle,
              errorMsg: `收尾推演失败：${(e as Error).message}`,
              aftermath: st.battle.aftermath
                ? { ...st.battle.aftermath, resolving: false }
                : st.battle.aftermath,
            },
          }));
        }
      },

      claimLoot: (index) => {
        const aft = get().battle.aftermath;
        if (!aft || aft.stage !== "loot") return;
        const ops: DataOp[] = [];
        const claimed = new Set<number>();
        aft.loot.forEach((item, i) => {
          if (item.taken) return;
          if (index !== "all" && i !== index) return;
          ops.push({
            kind: "add",
            collection: "inventory",
            payload: {
              id: `loot-${Date.now().toString(36)}-${i}`,
              name: item.name,
              type: "杂物",
              grade: "凡品",
              count: Math.max(1, item.qty),
              icon: item.name.charAt(0),
              desc: item.desc ?? "自战阵中收得之物。",
            },
          });
          claimed.add(i);
        });
        if (ops.length === 0) return;
        useGameStore.getState().applyOps(ops);
        set((st) =>
          st.battle.aftermath
            ? {
                battle: {
                  ...st.battle,
                  aftermath: {
                    ...st.battle.aftermath,
                    loot: st.battle.aftermath.loot.map((it, i) =>
                      claimed.has(i) ? { ...it, taken: true } : it,
                    ),
                  },
                },
              }
            : {},
        );
        useGameStore.getState().addLog(`【战利品】收下 ${ops.length} 样，收入行囊。`);
      },

      speakFate: async (text) => {
        const aft = get().battle.aftermath;
        if (!aft || aft.stage !== "loot") return;
        const body = text.trim();
        if (!body) return;

        const { settings } = get();
        if (!aiReady(settings)) {
          set((st) => ({ battle: { ...st.battle, errorMsg: "推演接口尚未接通。" } }));
          return;
        }

        set((st) =>
          st.battle.aftermath
            ? {
                battle: {
                  ...st.battle,
                  errorMsg: "",
                  aftermath: { ...st.battle.aftermath, resolving: true },
                },
              }
            : {},
        );

        const enemies = get()
          .battle.map.entities.filter((e) => e.type === "enemy")
          .map((e) => e.name);

        try {
          const brief: FateBrief = {
            enemies,
            text: body,
            story: recentStoryBrief(get().conversation.turns),
          };
          const raw = await chatWithModel(settings, settings.flashModel, buildFatePrompt(brief), {
            timeoutMs: 60000,
            jsonMode: true,
            retries: 1,
            temperature: 0.8,
          });
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
          } catch {
            parsed = null;
          }
          const narrative = String(parsed?.narrative ?? "").trim();

          set((st) =>
            st.battle.aftermath
              ? {
                  battle: {
                    ...st.battle,
                    errorMsg: "",
                    narrative: narrative
                      ? st.battle.narrative
                        ? `${st.battle.narrative}\n${narrative}`
                        : narrative
                      : st.battle.narrative,
                    aftermath: {
                      ...st.battle.aftermath,
                      resolving: false,
                      stage: "done",
                      outcome: narrative || st.battle.aftermath.outcome,
                    },
                  },
                }
              : {},
          );

          if (narrative) useGameStore.getState().addLog(`【收尾】${narrative}`);
        } catch (e) {
          set((st) => ({
            battle: {
              ...st.battle,
              errorMsg: `收尾推演失败：${(e as Error).message}`,
              aftermath: st.battle.aftermath
                ? { ...st.battle.aftermath, resolving: false }
                : st.battle.aftermath,
            },
          }));
        }
      },

      surrenderBeg: async (text) => {
        const aft = get().battle.aftermath;
        if (!aft || aft.stage !== "surrender") return;
        const body = text.trim();
        if (!body) return;

        const { settings } = get();
        if (!aiReady(settings)) {
          set((st) => ({ battle: { ...st.battle, errorMsg: "推演接口尚未接通。" } }));
          return;
        }

        set((st) =>
          st.battle.aftermath
            ? {
                battle: {
                  ...st.battle,
                  errorMsg: "",
                  aftermath: { ...st.battle.aftermath, resolving: true },
                },
              }
            : {},
        );

        try {
          const brief: SurrenderBrief = {
            patience: aft.patience,
            text: body,
            story: recentStoryBrief(get().conversation.turns),
          };
          const raw = await chatWithModel(settings, settings.flashModel, buildSurrenderPrompt(brief), {
            timeoutMs: 60000,
            jsonMode: true,
            retries: 1,
            temperature: 0.8,
          });
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw.replace(/```json/gi, "").replace(/```/g, "").trim());
          } catch {
            parsed = null;
          }
          const narrative = String(parsed?.narrative ?? "").trim();
          const delta = (() => {
            const n = Number(parsed?.patienceDelta);
            if (!Number.isFinite(n)) return 0;
            return Math.max(-30, Math.min(30, Math.round(n)));
          })();
          const patience = Math.max(0, Math.min(100, aft.patience + delta));

          set((st) =>
            st.battle.aftermath
              ? {
                  battle: {
                    ...st.battle,
                    errorMsg: "",
                    aftermath: {
                      ...st.battle.aftermath,
                      resolving: false,
                      narrative: narrative || st.battle.aftermath.narrative,
                      patience,
                    },
                  },
                }
              : {},
          );

          if (narrative) useGameStore.getState().addLog(`【收尾】${narrative}`);
          if (patience <= 0) useGameStore.getState().raiseEnding("未能脱身，死于敌手。");
        } catch (e) {
          set((st) => ({
            battle: {
              ...st.battle,
              errorMsg: `收尾推演失败：${(e as Error).message}`,
              aftermath: st.battle.aftermath
                ? { ...st.battle.aftermath, resolving: false }
                : st.battle.aftermath,
            },
          }));
        }
      },

      surrenderPay: () => {
        const aft = get().battle.aftermath;
        if (!aft || aft.stage !== "surrender") return;
        const gs = useGameStore.getState();
        const ransom = 60;
        // 下品不够时，payStones 会自个儿从上级按一比一百兑下来
        const paid = gs.payStones(ransom);

        if (paid) {
          // 赎金付得出：敌方耐心见长
          const patience = Math.min(100, aft.patience + 25);
          set((st) =>
            st.battle.aftermath
              ? {
                  battle: {
                    ...st.battle,
                    aftermath: {
                      ...st.battle.aftermath,
                      patience,
                      narrative: `你奉上 ${ransom} 块下品灵石，敌方掂了掂，神色稍缓。`,
                    },
                  },
                }
              : {},
          );
          useGameStore.getState().addLog(`【赎身】你奉上 ${ransom} 块下品灵石，敌方耐心稍缓。`);
        } else {
          // 掏不出赎金：反惹其恼
          const patience = Math.max(0, aft.patience - 15);
          set((st) =>
            st.battle.aftermath
              ? {
                  battle: {
                    ...st.battle,
                    aftermath: {
                      ...st.battle.aftermath,
                      patience,
                      narrative: "你翻遍全身也凑不出赎金，敌方脸色一沉。",
                    },
                  },
                }
              : {},
          );
          useGameStore.getState().addLog("【赎身】你身上灵石不足，凑不出赎金，敌方失了耐性。");
          if (patience <= 0) useGameStore.getState().raiseEnding("未能脱身，死于敌手。");
        }
      },

      surrenderGiveUp: () => {
        const aft = get().battle.aftermath;
        if (!aft || aft.stage !== "surrender") return;
        useGameStore.getState().addLog("【收尾】你束手不斗，任其处置。");
        useGameStore.getState().raiseEnding("束手就死，命绝于此。");
      },
    }),
    {
      name: "xiuxian-ai",
      version: 6,
      migrate: (state: any, version: number) => {
        if (version < 1) {
          if (state.conversation && !Array.isArray(state.conversation.turns)) {
            state.conversation.turns = [];
          }
          if (state.npcChat && state.npcChat.profiles) {
            if (!Array.isArray(state.npcChat.profiles)) {
              state.npcChat.profiles = [];
            } else {
              state.npcChat.profiles.forEach((p: any) => {
                if (!Array.isArray(p.messages)) {
                  p.messages = [];
                }
              });
            }
          }
          if (state.battle && state.battle.map && !Array.isArray(state.battle.map.entities)) {
            state.battle.map.entities = [];
          }
          if (state.battle && !Array.isArray(state.battle.context)) {
            state.battle.context = [];
          }
        }
        if (version < 2) {
          if (state.conversation && Array.isArray(state.conversation.turns)) {
            state.conversation.turns = state.conversation.turns
              .slice(-4)
              .map((t: any) => ({
                ...t,
                snapshot: null,
                flashRaw: "",
                opsRaw: "",
                proRequest: {
                  summary: t.proRequest?.summary || "",
                  recentTurns: [],
                  decision: t.proRequest?.decision || "",
                  relevantData: "",
                },
              }));
          }
          if (state.npcChat && Array.isArray(state.npcChat.profiles)) {
            state.npcChat.profiles = state.npcChat.profiles
              .slice(-5)
              .map((p: any) => ({
                ...p,
                messages: Array.isArray(p.messages) ? p.messages.slice(-20) : [],
              }));
          }
          if (state.battle) {
            state.battle.context = [];
          }
        }
        if (version < 3) {
          if (state.settings && !state.settings.customPrompt) {
            state.settings.customPrompt = "";
          }
        }
        if (version < 4) {
          // 战斗里的时序改用香来算，旧档没有这一项
          if (state.battle) {
            state.battle.incense = { stick: 1, progress: 0 };
          }
        }
        if (version < 5) {
          // 多人同席是后加的，旧档里只有单谈
          if (state.npcChat) {
            state.npcChat.partyIds = [];
            state.npcChat.partyMessages = [];
            state.npcChat.isPartyTyping = false;
          }
        }
        if (version < 6) {
          // 战斗是眼前这一场的事，不该随存档醒来。
          // 旧档里存着「正在打」的，读档时一律收摊，免得一刷新便自己开打
          state.battle = { ...INITIAL_BATTLE, context: [] };
        }
        return state;
      },
      /**
       * 读档时把上一回合留下的战斗标记抹掉。
       * 战斗是眼前这一场的事，不随存档醒来；战场本身早已收摊，
       * 若还照旧回合的标记开战，只会浮起一座没有敌人的空场。
       */
      merge: (persisted, current) => {
        const merged = { ...current, ...((persisted as Partial<AIStore>) || {}) } as AIStore;
        // 旧档里的模型名可能被手改过（如 gpt-oss-20b）：没填自定义接口时一律收回免费预设
        if (merged.settings && !hasCustomApi(merged.settings)) {
          merged.settings = {
            ...merged.settings,
            flashModel: FREE_MODEL.model,
            proModel: FREE_MODEL.model,
          };
        }
        // 讲价与铺面都是眼前这一场的事，不随存档醒来：读档时把窗关掉，免得一进来又弹出早先那一扇
        merged.narrativeHaggle = null;
        merged.narrativeShop = null;
        const conv = merged.conversation;
        if (conv && Array.isArray(conv.turns) && conv.turns.some((t) => t.mode === "battle" || t.haggle || t.shop)) {
          merged.conversation = {
            ...conv,
            turns: conv.turns.map((t) => {
              if (!t.mode && !t.haggle && !t.shop) return t;
              return { ...t, mode: t.mode === "battle" ? undefined : t.mode, battleFoes: t.mode === "battle" ? undefined : t.battleFoes, haggle: undefined, shop: undefined };
            }),
          };
        }
        return merged;
      },
      partialize: (s) => ({
        settings: s.settings,
        conversation: {
          ...s.conversation,
          turns: (Array.isArray(s.conversation.turns) ? s.conversation.turns : [])
            .slice(-4)
            .map((t) => ({
              ...t,
              snapshot: null,
              flashRaw: "",
              opsRaw: "",
              proRequest: {
                summary: t.proRequest?.summary || "",
                recentTurns: [],
                decision: t.proRequest?.decision || "",
                relevantData: "",
              },
            })),
        },
        npcChat: {
          ...s.npcChat,
          profiles: (Array.isArray(s.npcChat.profiles) ? s.npcChat.profiles : [])
            .slice(-5)
            .map((p) => ({
              ...p,
              messages: (Array.isArray(p.messages) ? p.messages : []).slice(-20),
            })),
        },
        // 战斗不随存档走：存下去的一律是「未开打」的那一份，
        // 否则刷新之后会照着上次的阵势自己开一场
        battle: { ...INITIAL_BATTLE, context: [] },
        isDeveloperMode: s.isDeveloperMode,
        randomEventDisabled: s.randomEventDisabled,
        introSeen: s.introSeen,
      }),
    },
  ),
);

function generateDefaultNews(time: { year: number; month: number; day: number }): any[] {
  const season = time.month >= 3 && time.month <= 5 ? "春" :
    time.month >= 6 && time.month <= 8 ? "夏" :
      time.month >= 9 && time.month <= 11 ? "秋" : "冬";

  const newsTemplates = [
    {
      category: "官府公告",
      titles: [
        `${season}季赋税减免告示`,
        "京城举行修仙大会",
        "边境妖兽异动警示",
        "科举放榜通知",
        "皇家赐婚消息",
        "禁宵令解除",
        "赈灾物资发放",
        "新科状元册封",
      ],
      contents: [
        `朝廷体恤民情，${season}季赋税减半，各州县务必遵照执行，不得苛捐杂税。`,
        `京城将在三日后举行盛大修仙大会，各方修士可前往观摩交流，切磋技艺。`,
        `边境传来急报，妖兽活动频繁，各宗门需加强警戒，保护周边百姓安全。`,
        `今科科举放榜，共录取进士三百名，榜首为江南才子李慕白。`,
        `皇家传来消息，太子殿下将与清河郡主赐婚，婚期定在下月初八。`,
        `京城禁宵令已解除，百姓可自由出入，但需注意夜间安全。`,
        `近日各地灾情得到控制，朝廷已调拨赈灾物资，灾民安置有序。`,
        `新科状元张鸿渐已受册封，将赴翰林院任职。`,
      ],
      sources: ["京城快报", "官府文告", "御书房传讯"],
    },
    {
      category: "宗门布告",
      titles: [
        "宗门大比即将举行",
        "新弟子入门考核",
        "长老闭关出关",
        "资源分配调整",
        "秘境开放通知",
        "宗门巡视安排",
        "功法借阅新规",
        "外门晋升公告",
      ],
      contents: [
        `宗门大比将于下月初一举行，各峰弟子需积极备战，展现宗门风采。`,
        `新弟子入门考核即将开始，凡年满十六岁、灵根合格者均可报名参加。`,
        `闭关三年的玄清长老今日出关，修为更上一层，可喜可贺。`,
        `经宗门商议，下月起资源分配将向有功弟子倾斜，望各位努力修炼。`,
        `宗门秘境将于三日后开放，每位弟子可进入一次，机遇与危险并存。`,
        `本月宗门巡视由执法堂负责，各峰需配合检查，遵守宗门规矩。`,
        `藏经阁功法借阅新规出台，弟子需达到相应修为方可借阅高阶功法。`,
        `外门弟子晋升考核结果已出，共有十二人晋升内门，望继续努力。`,
      ],
      sources: ["宗门传讯", "布告栏", "执事堂通知"],
    },
    {
      category: "市井传言",
      titles: [
        "神秘修士现身茶馆",
        "天价丹药交易",
        "灵异事件频发",
        "失踪人口传闻",
        "宝藏传说兴起",
        "黑市交易猖獗",
        "奇人异事",
        "酒馆趣闻",
      ],
      contents: [
        `城南茶馆来了一位神秘修士，气质非凡，出手阔绰，无人知其来历。`,
        `据说有人在黑市以天价购得一枚九转金丹，不知是真是假。`,
        `近日城郊频发灵异事件，夜晚常有鬼火出现，百姓人心惶惶。`,
        `城中已有三人离奇失踪，坊间传言与邪修有关。`,
        `江湖上兴起一则宝藏传说，据说藏宝图已落入神秘人手中。`,
        `黑市交易愈发猖獗，各种违禁物品琳琅满目，官府束手无策。`,
        `有人亲眼目睹一位白发老者在空中飞行，疑似隐世高人。`,
        `酒馆中有人吹嘘曾在秘境中获得上古传承，引来众人哄笑。`,
      ],
      sources: ["茶馆闲谈", "街头巷议", "酒肆传闻"],
    },
  ];

  return newsTemplates.map((template) => {
    const titleIdx = (time.day + time.month * 10) % template.titles.length;
    const contentIdx = (time.day + time.year * 5) % template.contents.length;
    const sourceIdx = (time.day) % template.sources.length;
    return {
      category: template.category,
      title: template.titles[titleIdx],
      content: template.contents[contentIdx],
      source: template.sources[sourceIdx],
    };
  });
}

export { RECENT_WINDOW };
