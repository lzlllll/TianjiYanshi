/**
 * 机缘：叙事里有人托付的事。
 *
 * 一桩机缘由叙事或对话当场立下，写清来龙去脉、去哪儿办、什么期限、
 * 交差得什么、误期罚什么。办没办成由叙事里的那人点头，系统只照单落账。
 *
 * 酬谢与责罚都只在这几样里选——模型给出的名目若不在表内，一律作废，
 * 免得凭空冒出一笔账目系统兑现不了。
 */

import type {
  Buff,
  BuffTargetStat,
  GameTime,
  InventoryItem,
  JobTarget,
  Quest,
  QuestBroker,
  QuestBuffSpec,
  QuestKind,
  QuestPenaltyKind,
  QuestRewardKind,
  QuestStatus,
  Reputation,
} from "@/data/types";
import { EMPTY_REPUTATION, REPUTATION_BY_KIND, REPUTATION_LABELS, shiftReputation } from "@/data/reputation";
import { BUFF_TARGET_STATS, buffFromTemplate, findBuffTemplate } from "@/data/buffs";
import { REALMS, REALM_NAMES } from "@/data/mockData";
import { shiftGameTime } from "@/lib/gameTime";

/** 交差后能兑现的酬谢 */
export const QUEST_REWARD_KINDS: QuestRewardKind[] = [
  "灵石",
  "修为",
  "物品",
  "人情",
  "状态",
  "正道名声",
  "魔道名声",
  "平民名声",
  "官府名声",
];

/** 误期要挨的罚；罚的是实在东西，状态那一类会后落在身上 */
export const QUEST_PENALTY_KINDS: QuestPenaltyKind[] = [
  "灵石",
  "修为",
  "业力",
  "状态",
  "正道名声",
  "魔道名声",
  "平民名声",
  "官府名声",
];

/**
 * 早先的差事只写「声望」两个字，那时折的是门派声望；
 * 如今声望归到人身上分成四条，旧账一律算在平民头上——那本是街坊口中的议论。
 */
const LEGACY_KIND_ALIAS: Record<string, QuestPenaltyKind> = { 声望: "平民名声" };

export const QUEST_STATUSES: QuestStatus[] = ["open", "done", "failed"];

/** 机缘的四类；地点与人物这两类必有具体去处与接头的人，修为类只看境界 */
export const QUEST_KINDS: QuestKind[] = ["事件", "地点", "人物", "修为"];

/** 这一类是不是必有具体去处：事件类可以没有，地点类与人物类必有 */
export const questKindNeedsPlace = (kind: QuestKind | undefined): boolean =>
  kind === "地点" || kind === "人物";

/**
 * 认一认模型写的类别。认得「事件」「事件类」这两种写法；
 * 认不出（或干脆没写）返回 undefined，由调用方按事件类从宽处置。
 */
export function parseQuestKind(raw: unknown): QuestKind | undefined {
  const text = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!text) return undefined;
  for (const kind of QUEST_KINDS) {
    if (text === kind || text === `${kind}类`) return kind;
  }
  return undefined;
}

/** 酬谢与责罚的数额夹在这个区间；再大就离了市井的分寸 */
const AMOUNT_MIN = 1;
const AMOUNT_MAX = 5000;

const clampAmount = (raw: unknown): number | undefined => {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.max(AMOUNT_MIN, Math.min(AMOUNT_MAX, n));
};

const clean = (raw: unknown, max: number) => String(raw ?? "").trim().slice(0, max);

/**
 * 修为类目标的境界序号：认「炼气后期」这样的全称，也认 REALMS 里的序号；
 * 只写了「炼气」「筑基」的，认作这一境的初期。
 */
function normalizeRealmGoal(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber)) {
    const idx = Math.trunc(asNumber);
    if (idx >= 0 && idx < REALMS.length) return idx;
  }
  const text = String(raw).trim().replace(/\s+/g, "");
  if (!text) return undefined;
  const exact = REALM_NAMES.indexOf(text);
  if (exact >= 0) return exact;
  const byName = REALMS.findIndex((r) => r.name === text);
  if (byName >= 0) return byName;
  const byPrefix = REALMS.findIndex((r) => text.startsWith(r.name));
  return byPrefix >= 0 ? byPrefix : undefined;
}

/** 把差事的去处理出来；缺了名目就当没这一笔，地图上也就无从星标 */
function normalizeTarget(raw: any): JobTarget | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const label = clean(raw.label, 30);
  if (!label) return undefined;
  const districtId = Math.trunc(Number(raw.districtId));
  return {
    cityId: clean(raw.cityId, 20),
    districtId: Number.isFinite(districtId) && districtId >= 0 ? districtId : undefined,
    label,
    person: clean(raw.person, 20) || undefined,
  };
}

/** 把押赏的牙行理出来；缺了柜号就当没这回事，赏照常当场兑现 */
function normalizeBroker(raw: any): QuestBroker | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const shopId = clean(raw.shopId, 60);
  const shopName = clean(raw.shopName, 30);
  if (!shopId || !shopName) return undefined;
  return {
    cityId: clean(raw.cityId, 20),
    districtId: Number.isFinite(Number(raw.districtId)) ? Math.trunc(Number(raw.districtId)) : 0,
    shopId,
    shopName,
  };
}

/** 门派任务的赏：缺了名目就当没这一笔，赏照常按字面记 */
function normalizeSectTask(raw: any): Quest["sectTask"] {
  if (!raw || typeof raw !== "object") return undefined;
  const taskId = clean(raw.taskId, 60);
  if (!taskId) return undefined;
  return {
    taskId,
    contribution: Math.max(0, Math.round(Number(raw.contribution)) || 0),
    spiritStone: Math.max(0, Math.round(Number(raw.spiritStone)) || 0),
  };
}

/**
 * 把机缘给下的状态理一理。
 * 名录里的 id 或名目、或是自编的名目与效力，二者有其一才立得起来；
 * 都认不出便作罢——赏罚只留字面上的话。
 */
function normalizeQuestBuff(raw: any): QuestBuffSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const template = clean(raw.template, 40) || undefined;
  const name = clean(raw.name, 10) || undefined;
  if (!template && !name) return undefined;

  const rawStat = String(raw.stat ?? "").trim() as BuffTargetStat;
  const rawValue = Math.trunc(Number(raw.value));
  const hours = Math.trunc(Number(raw.hours));

  return {
    template,
    name,
    icon: clean(raw.icon, 1) || undefined,
    isDebuff: raw.isDebuff === true,
    stat: BUFF_TARGET_STATS.includes(rawStat) ? rawStat : undefined,
    value: Number.isFinite(rawValue) ? rawValue : undefined,
    hours: Number.isFinite(hours) && hours > 0 ? Math.min(720, hours) : undefined,
    desc: clean(raw.desc, 60) || undefined,
  };
}

/**
 * 照一份说明立起一条状态。
 * 名录里找得到就照名录那一条，名目、类别、图标与效力都以名录为准；
 * 名录外才照给的效力自编——效力落不到程序认得的字段上，便立不起来。
 * 顶多久以 hours 为准，没写就照名录上的常例，自编的一律算十二个时辰。
 */
export function buildQuestBuff(spec: QuestBuffSpec, now: GameTime): Buff | null {
  const tpl = findBuffTemplate(spec.template ?? spec.name);
  if (tpl) {
    return buffFromTemplate(tpl, {
      until: shiftGameTime(now, spec.hours ?? tpl.hours),
      source: "机缘",
    });
  }

  const name = String(spec.name ?? "").trim().slice(0, 10);
  const stat = spec.stat;
  const value = Number(spec.value);
  // 效力落不到程序认得的字段上，就立不起来——宁可只留字面上的话
  if (!name || !stat || !BUFF_TARGET_STATS.includes(stat) || !Number.isFinite(value) || value === 0) {
    return null;
  }

  return {
    id: `quest-buff-${stat}-${Math.round(value)}`,
    name,
    category: "status",
    icon: (spec.icon || name.slice(0, 1) || "机").slice(0, 1),
    durationType: "until",
    until: shiftGameTime(now, spec.hours ?? 12),
    stacks: 1,
    maxStacks: 1,
    effects: [{ stat, valueType: "fixed", value: Math.round(value) }],
    isDebuff: spec.isDebuff === true,
    source: "机缘",
    description: spec.desc || "",
  };
}

/**
 * 把叙事给的一桩机缘理成能用的样子。
 * 名字为空就当没这桩事，返回 null 由调用方丢弃。
 */
export function normalizeQuest(raw: any, index = 0): Quest | null {
  if (!raw || typeof raw !== "object") return null;

  const name = clean(raw.name ?? raw.title, 20);
  if (!name) return null;

  const rewardKind = QUEST_REWARD_KINDS.includes(raw.rewardKind) ? raw.rewardKind : undefined;
  const penaltyKind = QUEST_PENALTY_KINDS.includes(raw.penaltyKind)
    ? raw.penaltyKind
    : LEGACY_KIND_ALIAS[raw.penaltyKind];
  const status: QuestStatus = QUEST_STATUSES.includes(raw.status) ? raw.status : "open";

  return {
    id: clean(raw.id, 40) || `quest-${Date.now().toString(36)}-${index}`,
    name,
    desc: clean(raw.desc ?? raw.description, 200),
    place: clean(raw.place ?? raw.where, 24),
    // 类别认不出便当事件类：它不逼着要有去处与人，最不容易被数据卡住
    kind: parseQuestKind(raw.kind ?? raw.type ?? raw.category) ?? "事件",
    // 日序从第一日起算，零与负数都不是期限，宁可当作不限时，也别让新立的机缘一落地就误期
    dueDay:
      Number.isFinite(Number(raw.dueDay)) && Number(raw.dueDay) > 0
        ? Math.trunc(Number(raw.dueDay))
        : undefined,
    giver: clean(raw.giver ?? raw.from, 16),
    condition: clean(raw.condition ?? raw.how, 120),
    reward: clean(raw.reward, 60),
    // 名目不在表内，连数额一块作废：宁可只留字面，也不认一笔说不清的账
    rewardKind,
    rewardAmount: rewardKind ? clampAmount(raw.rewardAmount) : undefined,
    // 赏的是状态才收这份说明；名目对不上便不收，免得多存一份死数据
    rewardBuff: rewardKind === "状态" ? normalizeQuestBuff(raw.rewardBuff) : undefined,
    penalty: clean(raw.penalty, 60),
    penaltyKind,
    penaltyAmount: penaltyKind ? clampAmount(raw.penaltyAmount) : undefined,
    penaltyBuff: penaltyKind === "状态" ? normalizeQuestBuff(raw.penaltyBuff) : undefined,
    status,
    day: Number.isFinite(Number(raw.day)) ? Math.trunc(Number(raw.day)) : 0,
    settledDay: Number.isFinite(Number(raw.settledDay)) ? Math.trunc(Number(raw.settledDay)) : undefined,
    outcome: clean(raw.outcome, 80) || undefined,
    broker: normalizeBroker(raw.broker),
    claimed: raw.claimed === true,
    target: normalizeTarget(raw.target),
    realmGoal: normalizeRealmGoal(raw.realmGoal ?? raw.realm ?? raw.targetRealm),
    carryItemId: clean(raw.carryItemId, 60) || undefined,
    sectTask: normalizeSectTask(raw.sectTask),
  };
}

/**
 * 捎信、捎物一类的事，手里得真有一封书信或一件东西，
 * 才谈得上走到人前递过去。
 */
export function questCarryItem(quest: Quest): InventoryItem | null {
  const text = `${quest.name} ${quest.condition} ${quest.desc}`;
  const letter =
    /捎信|送信|带信|传信|捎个?口信|带个?口信|带话|捎话|书信|信件|一封.{0,6}信|信一封|信物/.test(text);
  const parcel = /捎带|捎去|捎件|带件|捎一样|带一样|送物|送东西|包裹|匣子|礼盒|物什|物件/.test(text);
  if (!letter && !parcel) return null;

  const name = letter ? (/信物/.test(text) ? "信物" : "书信") : "包裹";
  return {
    id: `quest-item-${quest.id}`,
    name,
    type: "杂物",
    grade: "凡品",
    count: 1,
    icon: name.slice(0, 1),
    desc: `受托「${quest.name}」${quest.target?.person ? `，须交到${quest.target.person}手上` : ""}。`,
  };
}

/**
 * 托付时把该带的东西放进行囊，记在机缘名下；
 * 已经给过一次的不再给第二件。
 */
export function attachQuestCarryItem(quest: Quest, inventory: InventoryItem[]): void {
  if (quest.carryItemId && inventory.some((i) => i?.id === quest.carryItemId)) return;
  const item = questCarryItem(quest);
  if (!item) return;
  quest.carryItemId = item.id;
  if (!inventory.some((i) => i?.id === item.id)) inventory.push(item);
}

/** 修为类机缘的目标名目，如「炼气后期」；没写目标的返回空串 */
export function questRealmGoalLabel(quest: Quest): string {
  const idx = quest.realmGoal;
  if (idx === undefined || !Number.isFinite(idx)) return "";
  const at = Math.max(0, Math.min(REALM_NAMES.length - 1, Math.trunc(idx)));
  return REALM_NAMES[at] ?? "";
}

/** 这一桩修到目标那一层了没有 */
export function questRealmGoalMet(quest: Quest, realmIndex: number): boolean {
  return quest.status === "open" && quest.realmGoal !== undefined && realmIndex >= quest.realmGoal;
}

/** 这桩事是不是已经误了期（还没了结的那种） */
export function isQuestOverdue(quest: Quest, today: number): boolean {
  // 零与负数不是期限：旧档里若留下这样的值，当作不限时，别一读档就判成误期
  if (quest.status !== "open") return false;
  if (quest.dueDay === undefined || !Number.isFinite(quest.dueDay) || quest.dueDay <= 0) return false;
  return today > quest.dueDay;
}

/**
 * 从在办的机缘里按名字认一桩。
 *
 * 先认一模一样的；认不出再认互相包含的，从中取名字最长的那一桩——
 * 「送信」与「替师父送信」都在办时，才不会因为谁记在后面就认错。
 */
export function pickOpenQuest<T extends { id?: string; name: string; status?: string }>(
  quests: T[],
  asked: string,
): T | undefined {
  const want = String(asked ?? "").trim();
  if (!want) return undefined;
  const open = (Array.isArray(quests) ? quests : []).filter(
    (q) => q && (q.status === undefined || q.status === "open"),
  );

  for (let i = open.length - 1; i >= 0; i--) {
    if (open[i].name === want) return open[i];
  }
  // 摘要里写作 quests[id] = 名称：模型偶尔照 id 写，也认
  for (let i = open.length - 1; i >= 0; i--) {
    if (open[i].id && open[i].id === want) return open[i];
  }

  let best: T | undefined;
  for (let i = open.length - 1; i >= 0; i--) {
    const q = open[i];
    if (!q.name) continue;
    // 只认两个字以上的包含关系：单字太容易撞上不相干的一桩
    if (Math.min(want.length, q.name.length) < 2) continue;
    if (want.includes(q.name) || q.name.includes(want)) {
      if (!best || q.name.length > best.name.length) best = q;
    }
  }
  return best;
}

/**
 * 认 AI 给出的那一个状态。
 *
 * 成与不成由 AI 照剧情定，本地只照单落账，不再从「未办完」「无误」这类话里猜——
 * 猜来猜去，反把没到日子的机缘判黄了。只认说得明白的状态词：
 * done / failed，兼容 成功、完成、了 与 失败、误、黄。
 */
export function parseQuestOutcome(value: unknown): "done" | "failed" | null {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[「『（(“"']+/, "")
    .replace(/[」』）)”"']+$/, "");
  // 只取头一个词：模型偶尔在状态后头缀一句说明，别让那句说明误了事
  const token = (cleaned.split(/[\s，。；;、|（）()【】\[\].,!?！？]+/)[0] ?? "").trim();
  if (!token) return null;
  if (/^(done|complete|completed|success|succeeded|成功|完成|了)$/.test(token)) return "done";
  if (/^(failed|fail|failure|失败|误|黄)$/.test(token)) return "failed";
  return null;
}

/**
 * 事已办成、赏还押在牙行柜上没领。
 * 这样的也得算在「未了」里——钱没到手，这桩事就还没完。
 */
export function isRewardHeld(quest: Quest): boolean {
  return !!quest.broker && quest.status === "done" && !quest.claimed;
}

/**
 * 这桩事误了期要不要挨罚。
 * 写了名目与数额、或是写了一条状态说明的，都算真有罚；
 * 只写了字面一句「误期便如何」而没有名目的，也算——界面既已写出那一行，玩家就当成有罚
 */
export function questHasPenalty(quest: Quest): boolean {
  if (quest.penaltyKind) return true;
  return !!String(quest.penalty ?? "").trim();
}

/** 还在办、或是赏还没领的摆在前头，真了结过的沉到底下 */
export function questRank(quest: Quest): number {
  return quest.status === "open" || isRewardHeld(quest) ? 0 : 1;
}

/** 交上牙行的差事后押在柜上的那一笔，等他自己回去领 */
export function holdRewardOutcome(quest: Quest): string {
  const shop = quest.broker?.shopName || "牙行";
  return `差事交上了，赏还押在「${shop}」柜上，回去领了才算到手。`;
}

/** 落账要用到的那几样东西；dataOps 与存档两边各给一份自己的 */
export interface QuestLedgerTarget {
  player: { cultivation: number; karma: number; buffs?: Buff[] };
  spiritStones: { low: number };
  reputation: Reputation;
  sect?: { reputation?: number; contribution?: number };
  relations?: { name: string; relation?: number; trust?: number; affinity?: number; affinityMax?: number }[];
  /** 眼下是什么时辰：赏罚是一条状态时，要照它算顶到几时 */
  now?: GameTime;
}

/**
 * 照单落账：交差了给酬谢，误了期按说好的罚。
 * 罚的是实在东西，不留作一时的状态；酬谢与责罚的名目都来自上面两张表，
 * 表外的名目在归一化时就已经作废，这里只管兑现。
 * 返回一句记账的话，写进日志与这桩机缘的结果里。
 */
export function applyQuestLedger(
  target: QuestLedgerTarget,
  quest: Quest,
  status: "done" | "failed",
): string {
  const amount = status === "done" ? quest.rewardAmount : quest.penaltyAmount;
  const kind = status === "done" ? quest.rewardKind : quest.penaltyKind;

  const head = status === "done" ? "交差了" : "误了期";
  const parts: string[] = [];

  // 门派任务的赏不走牙行：交差记贡献与下品灵石，误期倒扣一半贡献，当场落在宗门上
  if (quest.sectTask && target.sect) {
    if (status === "done") {
      const gainContribution = Math.max(0, Math.round(quest.sectTask.contribution));
      const gainStone = Math.max(0, Math.round(quest.sectTask.spiritStone));
      if (gainContribution) {
        target.sect.contribution = (Number(target.sect.contribution) || 0) + gainContribution;
        parts.push(`为宗门立下一功，得贡献 ${gainContribution}`);
      }
      if (gainStone) {
        target.spiritStones.low = (Number(target.spiritStones.low) || 0) + gainStone;
        parts.push(`另赏下品灵石 ${gainStone}`);
      }
    } else {
      const lost = Math.max(1, Math.round(quest.sectTask.contribution / 2));
      const before = Number(target.sect.contribution) || 0;
      target.sect.contribution = Math.max(0, before - lost);
      parts.push(`误了宗门交办的事，扣贡献 ${before - (target.sect.contribution ?? 0)}`);
    }
  }

  // 赏罚的是一条状态：照说明立起来落在身上，不看数额。
  // 名录里挑得出、或效力落得在程序认得的字段上，才立得起来；立不起来便只留字面
  if (kind === "状态") {
    const spec = status === "done" ? quest.rewardBuff : quest.penaltyBuff;
    const buff = spec && target.now ? buildQuestBuff(spec, target.now) : null;
    if (buff) {
      target.player.buffs = [...(target.player.buffs ?? []), buff];
      parts.push(`身上${buff.isDebuff ? "落了一层" : "添了一层"}「${buff.name}」`);
    } else {
      parts.push(status === "done" ? quest.reward || "得了一场虚名" : quest.penalty || "折了些元气");
    }
    return `${head}：${parts.join("，")}。`;
  }

  if (!kind || !amount) {
    if (parts.length > 0) return `${head}：${parts.join("，")}。`;
    return status === "done" ? (quest.reward ? `得了：${quest.reward}` : "这桩事算是了了。") : (quest.penalty ? `罚了：${quest.penalty}` : "这桩事就此黄了。");
  }

  const sign = status === "done" ? 1 : -1;

  if (kind === "灵石") {
    const stones = target.spiritStones;
    const delta = amount * sign;
    // 罚款扣不到负数，酬谢也只进下品灵石这一格
    const before = Number(stones.low) || 0;
    stones.low = Math.max(0, before + delta);
    parts.push(`${delta > 0 ? "得" : "失"} ${Math.abs(before - stones.low)} 下品灵石`);
  } else if (kind === "修为") {
    const delta = amount * sign;
    const before = Number(target.player.cultivation) || 0;
    target.player.cultivation = Math.max(0, before + delta);
    parts.push(`${delta > 0 ? "得" : "损"}修为 ${Math.abs(before - target.player.cultivation)}`);
  } else if (status === "done" && kind === "人情") {
    const friend = (target.relations ?? []).find((r) => r.name === quest.giver);
    if (friend) {
      const before = typeof friend.relation === "number" ? friend.relation : (friend.affinity ?? 50) * 2 - 100;
      const after = Math.max(-100, Math.min(100, before + amount * 2));
      friend.relation = after;
      parts.push(`与${friend.name}又近了一层（关系 ${after}）`);
    } else {
      parts.push("欠下的人情记在账上");
    }
  } else if (REPUTATION_BY_KIND[kind]) {
    // 名声的四条：添或折一笔，记在世人怎么看你这上头
    const axis = REPUTATION_BY_KIND[kind];
    const rep = target.reputation ?? EMPTY_REPUTATION;
    const before = Number(rep[axis]) || 0;
    const after = shiftReputation(rep, axis, amount * sign);
    target.reputation = after;
    parts.push(`${REPUTATION_LABELS[axis]}${sign > 0 ? "添" : "折"}了 ${Math.abs((after[axis] ?? 0) - before)}，现下 ${after[axis]}`);
  } else if (kind === "业力") {
    target.player.karma = (Number(target.player.karma) || 0) + amount;
    parts.push(`添了 ${amount} 分业力`);
  } else if (status === "done") {
    // 「物品」这类没法凭空造出来，只记在字面上，由叙事往后兑现
    parts.push(quest.reward || "得了几样东西");
  }

  return `${head}：${parts.join("，")}。`;
}
