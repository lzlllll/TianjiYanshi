import type {
  Adventure,
  Auction,
  DataOp,
  GameState,
  GameTime,
  BattleEntity,
  BattleFoeBrief,
  BuffDurationType,
  HaggleBrief,
  InventoryItem,
  MeridianZone,
  PriceAdjust,
  Quest,
  SectSite,
  SectWarBrief,
  ShopBrief,
  Skill,
  SkillCheck,
  TechniqueCategory,
  Village,
} from "@/data/types";
import { defaultRangeOf, RANGE_PATTERN_MAX, RANGE_SIZE_MAX, SKILL_RANGE_SHAPES } from "@/data/battleRange";
import { defaultStatGainOf } from "@/lib/attributes";
import { defaultStyleOf, normalizeCombatStyle } from "@/data/combatStyles";
import { REALM_NAMES } from "@/data/mockData";
import { assignManorCell, getCityMarkers, getDistricts, getMarker, getScene, registerSectScenes, resolveMarker, sectSceneId } from "@/data/map";
import { sectBuildingRoster } from "@/data/map/sectBuildings";
import { composeSectSite, sectNameCore } from "@/data/sectSites";
import { normalizeSectRelation } from "@/data/sectRelations";
import { normalizeOccupation } from "@/data/occupations";
import { resolveLocation } from "@/data/locations";
import { isKnownGood } from "@/data/goods";
import { findSkill, normalizeSkill, rollSkillCheck, trainOnceADay } from "@/data/skills";
import { normalizeReputation, reputationAxisByName } from "@/data/reputation";
import { isHardLockedPath } from "@/data/dataCatalog";
import { applyQuestLedger, attachQuestCarryItem, holdRewardOutcome, normalizeQuest, parseQuestOutcome, pickOpenQuest, takeItemsByName, type QuestLedgerTarget } from "@/data/quests";
import { pinNarrativeQuest } from "@/data/broker";
import { normalizePact } from "@/data/pacts";
import { normalizeAdventure } from "@/data/adventures";
import { findTreasureShop, rollAuctionReason } from "@/data/auction";
import { CULTIVATION_PER_HOUR, localCultivationFrom } from "@/data/cultivation";
import { spendLowStones } from "@/data/spiritStones";
import { emptyPlot, readyBuiltPlot } from "@/data/manors";
import { makeModifier } from "@/data/sectModifiers";
import { buffFromTemplate, findBuffTemplate } from "@/data/buffs";
import {
  OPENING_GAME_TIME,
  daySerial,
  formatGameTime,
  gameDateKey,
  gameMonthKey,
  normalizeGameTime,
  normalizeHour,
  shiftGameTime,
  timeSerial,
} from "@/lib/gameTime";

const START_MARKER = "<<<OPS>>>";
const END_MARKER = "<<<END>>>";
const BATTLE_START = "<<<BATTLE>>>";
const QUICK_START = "<<<QUICK>>>";
const SECTWAR_START = "<<<SECTWAR>>>";
const HAGGLE_START = "<<<HAGGLE>>>";
const SHOP_START = "<<<SHOP>>>";
const CONVERSE_START = "<<<CONVERSE>>>";

const MAX_TOTAL_OPS = 200;

/** 行囊能收的几格；叙事挑起的讲价买入时照这一列归一 */
const ITEM_TYPES: InventoryItem["type"][] = ["材料", "丹药", "符箓", "法宝", "杂物", "灵兽"];

/** 模型写出来的别称一律归到正名；认不出便当杂物 */
const ITEM_TYPE_ALIASES: Record<string, InventoryItem["type"]> = {
  药材: "材料", 矿石: "材料", 丹药: "丹药", 药: "丹药", 符: "符箓", 法器: "法宝",
  兵器: "法宝", 宝物: "法宝", 灵宝: "法宝", 物品: "杂物", 杂物: "杂物",
  // 活的灵兽模型常写成这些别称；归到灵兽，灵兽栏才认得出它
  灵宠: "灵兽", 妖兽: "灵兽", 兽宠: "灵兽", 宠物: "灵兽", 坐骑: "灵兽",
};

/** 物品类别归一：正名照收，别称照表转，认不出的当杂物 */
export function normalizeItemType(raw: unknown): InventoryItem["type"] {
  const text = String(raw ?? "").trim();
  if (ITEM_TYPES.includes(text as InventoryItem["type"])) return text as InventoryItem["type"];
  return ITEM_TYPE_ALIASES[text] ?? "杂物";
}

export interface ParsedTurn {
  narrative: string;
  ops: DataOp[];
  opsRaw: string;
  mode: string | null;
  /** 这一轮正面交锋的对手名录；旧写法只报一句 battle，便为空 */
  battleFoes: BattleFoeBrief[] | null;
  battleEntities: BattleEntity[] | null;
  /** 战斗里这一柱香烧到的进度；没报就是 null */
  battleIncense: number | null;
  /** 这一合敌人正面来攻，守势可否被动触发 */
  battleGuard: boolean;
  quickDecisions: string[];
  /** 这一轮由叙事挑起的宗门战；没挑起便是 null */
  sectWar: SectWarBrief | null;
  /** 这一轮由叙事挑起的讲价；没挑起便是 null */
  haggle: HaggleBrief | null;
  /** 这一轮叙事把玩家引到某家铺子买卖；没有便是 null */
  shop: ShopBrief | null;
  /** 这一轮叙事里有人当面与玩家搭话、该转为当面交谈；没有便是 null */
  converse: ConverseBrief | null;
}

/** 叙事里那位先开口的人 */
export interface ConverseBrief {
  /** 说话人的姓名，须是尘缘里认得的那一个 */
  npc: string;
}

const MODE_START = "<<<MODE>>>";
const MODE_END = "<<<END>>>";

/**
 * 战斗那一行里的对手名录。
 * 新写法是一整份 JSON：{"mode":"battle","enemies":[{"name":"…","realm":"…","count":1}]}；
 * 也认得只给名字的字串，认不出的条目一概丢开。
 */
function normalizeBattleFoes(raw: unknown): BattleFoeBrief[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: BattleFoeBrief[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      const name = item.trim().slice(0, 24);
      if (name) out.push({ name });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const name = String(src.name ?? src.title ?? "").trim().slice(0, 24);
    if (!name) continue;
    const count = Math.trunc(Number(src.count ?? src.amount));
    const realm = String(src.realm ?? src.grade ?? "").trim().slice(0, 20);
    const desc = String(src.desc ?? src.description ?? "").trim().slice(0, 60);
    const style = normalizeCombatStyle(src.style ?? src.combatStyle);
    out.push({
      name,
      count: Number.isFinite(count) && count > 0 ? Math.min(4, count) : undefined,
      realm: realm || undefined,
      desc: desc || undefined,
      style: style || undefined,
    });
    if (out.length >= 6) break;
  }
  return out;
}

export function parseModelOutput(raw: string): ParsedTurn {
  let text = raw.replace(/```[a-zA-Z]*\n?/g, "");

  let mode: string | null = null;
  let battleFoes: BattleFoeBrief[] | null = null;
  const modeStartIdx = text.indexOf(MODE_START);
  if (modeStartIdx !== -1) {
    const afterModeStart = text.slice(modeStartIdx + MODE_START.length);
    const modeEndIdx = afterModeStart.indexOf(MODE_END);
    if (modeEndIdx !== -1) {
      const content = afterModeStart.slice(0, modeEndIdx).trim();
      // 战斗那一行多写成一整份 JSON：除了认下 battle，还要把对手名录带出来
      const payload = content.startsWith("{") ? parseJsonPayload(content) : null;
      if (payload && typeof payload === "object") {
        const foes = normalizeBattleFoes((payload as any).enemies ?? (payload as any).foes);
        if (foes.length > 0) battleFoes = foes;
        mode = String((payload as any).mode ?? "").trim() || "battle";
      } else {
        mode = content;
      }
      text = text.slice(0, modeStartIdx) + afterModeStart.slice(modeEndIdx + MODE_END.length);
    }
  }

  let battleEntities: BattleEntity[] | null = null;
  let battleIncense: number | null = null;
  let battleGuard = false;
  let battleNarrative = "";
  const battleStartIdx = text.indexOf(BATTLE_START);
  if (battleStartIdx !== -1) {
    const afterBattleStart = text.slice(battleStartIdx + BATTLE_START.length);
    const battleEndIdx = afterBattleStart.indexOf(END_MARKER);
    if (battleEndIdx !== -1) {
      const battleContent = afterBattleStart.slice(0, battleEndIdx);
      battleEntities = parseBattleEntities(battleContent);
      battleIncense = parseBattleIncense(battleContent);
      battleGuard = parseBattleGuard(battleContent);
      battleNarrative = parseBattleNarrative(battleContent);
      text = text.slice(0, battleStartIdx) + afterBattleStart.slice(battleEndIdx + END_MARKER.length);
    }
  }

  let sectWar: SectWarBrief | null = null;
  const sectWarIdx = text.indexOf(SECTWAR_START);
  if (sectWarIdx !== -1) {
    const afterSectWar = text.slice(sectWarIdx + SECTWAR_START.length);
    const sectWarEndIdx = afterSectWar.indexOf(END_MARKER);
    const content = sectWarEndIdx !== -1 ? afterSectWar.slice(0, sectWarEndIdx) : afterSectWar;
    sectWar = parseSectWar(content);
    text = sectWarEndIdx !== -1
      ? text.slice(0, sectWarIdx) + afterSectWar.slice(sectWarEndIdx + END_MARKER.length)
      : text.slice(0, sectWarIdx);
  }

  let haggle: HaggleBrief | null = null;
  const haggleIdx = text.indexOf(HAGGLE_START);
  if (haggleIdx !== -1) {
    const afterHaggle = text.slice(haggleIdx + HAGGLE_START.length);
    const haggleEndIdx = afterHaggle.indexOf(END_MARKER);
    const content = haggleEndIdx !== -1 ? afterHaggle.slice(0, haggleEndIdx) : afterHaggle;
    haggle = parseHaggleBrief(content);
    text = haggleEndIdx !== -1
      ? text.slice(0, haggleIdx) + afterHaggle.slice(haggleEndIdx + END_MARKER.length)
      : text.slice(0, haggleIdx);
  }

  let shop: ShopBrief | null = null;
  const shopIdx = text.indexOf(SHOP_START);
  if (shopIdx !== -1) {
    const afterShop = text.slice(shopIdx + SHOP_START.length);
    const shopEndIdx = afterShop.indexOf(END_MARKER);
    const content = shopEndIdx !== -1 ? afterShop.slice(0, shopEndIdx) : afterShop;
    shop = parseShopBrief(content);
    text = shopEndIdx !== -1
      ? text.slice(0, shopIdx) + afterShop.slice(shopEndIdx + END_MARKER.length)
      : text.slice(0, shopIdx);
  }

  let converse: ConverseBrief | null = null;
  const converseIdx = text.indexOf(CONVERSE_START);
  if (converseIdx !== -1) {
    const afterConverse = text.slice(converseIdx + CONVERSE_START.length);
    const converseEndIdx = afterConverse.indexOf(END_MARKER);
    const content = converseEndIdx !== -1 ? afterConverse.slice(0, converseEndIdx) : afterConverse;
    const npc = String(parseJsonPayload(content)?.npc ?? "").trim();
    if (npc) converse = { npc };
    text = converseEndIdx !== -1
      ? text.slice(0, converseIdx) + afterConverse.slice(converseEndIdx + END_MARKER.length)
      : text.slice(0, converseIdx);
  }

  let quickDecisions: string[] = [];
  const quickStartIdx = text.indexOf(QUICK_START);
  if (quickStartIdx !== -1) {
    const afterQuickStart = text.slice(quickStartIdx + QUICK_START.length);
    const quickEndIdx = afterQuickStart.indexOf(END_MARKER);
    const quickContent = quickEndIdx !== -1 ? afterQuickStart.slice(0, quickEndIdx) : afterQuickStart;
    quickDecisions = quickContent
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .slice(0, 8);
    text = quickEndIdx !== -1
      ? text.slice(0, quickStartIdx) + afterQuickStart.slice(quickEndIdx + END_MARKER.length)
      : text.slice(0, quickStartIdx);
  }

  const startIdx = text.indexOf(START_MARKER);
  let opsRaw = "";
  let narrative = text;

  if (startIdx !== -1) {
    const afterStart = text.slice(startIdx + START_MARKER.length);
    const endIdx = afterStart.indexOf(END_MARKER);
    if (endIdx !== -1) {
      opsRaw = afterStart.slice(0, endIdx);
      narrative = text.slice(0, startIdx) + afterStart.slice(endIdx + END_MARKER.length);
    } else {
      opsRaw = afterStart;
      narrative = text.slice(0, startIdx);
    }
  }
  narrative = narrative.trim();
  // 战斗叙事写在 -- narrative: 字段里，需单独取出；块外的残留正文作为兜底
  if (battleNarrative) narrative = battleNarrative;
  const ops = parseOpLines(opsRaw);
  _debugOps(ops);
  return { narrative, ops, opsRaw: opsRaw.trim(), mode, battleFoes, battleEntities, battleIncense, battleGuard, quickDecisions, sectWar, haggle, shop, converse };
}

/**
 * 从宗门战块里认出对手是谁、我方攻守。
 * 写作 JSON 最好（{"opponentName":"青云宗","role":"attacker"}）；
 * 若只写了一行纯文本，便当作对手名号，我方认作攻方。
 */
function parseSectWar(content: string): SectWarBrief | null {
  const s = content.replace(/```[a-zA-Z]*\n?/g, "").trim();
  if (!s) return null;
  let obj: unknown = null;
  try {
    obj = JSON.parse(s);
  } catch {
    obj = null;
  }
  if (obj && typeof obj === "object") {
    const r = obj as Record<string, unknown>;
    const name = String(r.opponentName ?? r.target ?? r.sect ?? r.name ?? "").trim();
    if (!name) return null;
    const role = r.role === "defender" ? "defender" : "attacker";
    const kindRaw = String(r.targetKind ?? r.kind ?? "").trim();
    const targetKind = kindRaw === "city" ? "city" : kindRaw === "village" ? "village" : "sect";
    return { opponentName: name.slice(0, 20), targetKind, role };
  }
  const name = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? "";
  return name ? { opponentName: name.slice(0, 20), targetKind: "sect", role: "attacker" } : null;
}

/**
 * 从讲价块里认出与谁议价、买还是卖、标的与价码。
 * 写作 JSON 最好（{"mode":"buy","subject":"药材","count":1,"basePrice":80,"keeper":"王掌柜","shop":"西市药铺"}）；
 * 认不出、或缺了标的名与对方名号的，便当没有这一桩，不硬弹窗。
 */
function parseHaggleBrief(content: string): HaggleBrief | null {
  const s = content.replace(/```[a-zA-Z]*\n?/g, "").trim();
  if (!s) return null;
  let obj: unknown = null;
  try {
    obj = JSON.parse(s);
  } catch {
    obj = null;
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  const subject = String(r.subject ?? r.name ?? "").trim();
  const keeper = String(r.keeper ?? r.who ?? "").trim();
  if (!subject || !keeper) return null;

  const mode = r.mode === "sell" ? "sell" : "buy";
  const count = Math.max(1, Math.min(99, Math.trunc(Number(r.count)) || 1));
  const basePrice = Math.max(1, Math.min(999999, Math.round(Number(r.basePrice ?? r.price) || 1)));
  const shop = String(r.shop ?? r.place ?? "").trim() || "一处铺面";
  const rawType = String(r.itemType ?? r.type ?? "").trim();
  // 只写了类别才归一；没写便留空，落账时按寻常什物算
  const itemType = rawType ? normalizeItemType(rawType) : undefined;

  return { mode, subject: subject.slice(0, 20), count, basePrice, keeper: keeper.slice(0, 16), shop: shop.slice(0, 30), itemType };
}

/**
 * 从铺面块里认出去的是哪一家铺子。
 * 写作 JSON 最好（{"shop":"醉仙楼"}）；只写一行铺名也认。
 * 认不出铺名便当没有这一桩——界面上无处可去，宁可不弹。
 */
function parseShopBrief(content: string): ShopBrief | null {
  const s = content.replace(/```[a-zA-Z]*\n?/g, "").trim();
  if (!s) return null;
  let obj: unknown = null;
  try {
    obj = JSON.parse(s);
  } catch {
    obj = null;
  }
  let name = "";
  if (obj && typeof obj === "object") {
    const r = obj as Record<string, unknown>;
    name = String(r.shop ?? r.name ?? r.place ?? "").trim();
  } else {
    name = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? "";
  }
  if (!name) return null;
  return { shop: name.slice(0, 30) };
}

/** 从战斗块中取出 -- incense: 45 这一行，认作本柱香已烧到的进度 */
function parseBattleIncense(content: string): number | null {
  const match = content.match(/^--\s*incense:\s*(-?\d+(?:\.\d+)?)/m);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

/** 从战斗块里认出这一合守势可否被动触发：-- guard: true */
function parseBattleGuard(content: string): boolean {
  const m = content.match(/--\s*guard:\s*(.*)/);
  if (!m) return false;
  const v = m[1].trim().toLowerCase();
  return v === "true" || v === "1" || v === "是" || v === "可";
}

function parseBattleEntities(content: string): BattleEntity[] {
  const entities: BattleEntity[] = [];
  const lines = content.split("\n");
  const ENTITY_PREFIX = "-- entities: ";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(ENTITY_PREFIX)) {
      // 必须按前缀长度切，写死下标会把 JSON 的首字符吃掉，导致实体整体解析失败
      const jsonStr = trimmed.slice(ENTITY_PREFIX.length).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!item || typeof item !== "object") continue;
            const style = normalizeCombatStyle((item as any).style);
            if (style) (item as any).style = style;
            else delete (item as any).style;
          }
          entities.push(...parsed);
        }
      } catch {
        console.warn("Failed to parse battle entities:", jsonStr);
      }
    }
  }

  return entities;
}

/** 从战斗块中取出 -- narrative: 字段，支持跨行，遇到下一个 -- 字段即停止 */
function parseBattleNarrative(content: string): string {
  const lines = content.split("\n");
  const buf: string[] = [];
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^--\s*narrative:\s*(.*)$/);
    if (match) {
      capturing = true;
      if (match[1].trim()) buf.push(match[1].trim());
      continue;
    }
    if (!capturing) continue;
    if (/^--\s*[\w\u4e00-\u9fa5]+:/.test(trimmed)) break;
    if (trimmed) buf.push(trimmed);
  }

  return buf.join("\n").trim();
}

function parseOpLines(block: string): DataOp[] {
  const ops: DataOp[] = [];
  const lines = block.split("\n");
  let i = 0;
  const MAX_LINES_PER_OP = 100;
  const MAX_VALUE_LENGTH = 50000;

  while (i < lines.length) {
    if (ops.length >= MAX_TOTAL_OPS) {
      console.warn(`[parseOpLines] Too many ops, truncating at ${MAX_TOTAL_OPS}`);
      break;
    }
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith("#") || rawLine.startsWith("//")) {
      i++;
      continue;
    }

    if (/^MODIFY\b/i.test(rawLine)) {
      const rest = rawLine.replace(/^MODIFY\s+/i, "").trim();
      const m = rest.match(/^(\S+)\s*([+\-=])\s*(.+)$/);

      let path: string;
      let op: "=" | "+" | "-";
      let value: string;

      if (m) {
        path = m[1];
        op = m[2] as "=" | "+" | "-";
        value = m[3].trim();
      } else {
        const firstSpace = rest.indexOf(" ");
        if (firstSpace === -1) {
          i++;
          continue;
        }
        path = rest.slice(0, firstSpace).trim();
        op = "=";
        value = rest.slice(firstSpace + 1).trim();
      }

      let lineCount = 0;

      i++;
      while (i < lines.length && lineCount < MAX_LINES_PER_OP) {
        const nextLine = lines[i];
        const trimmedNext = nextLine.trim();
        if (!trimmedNext || trimmedNext.startsWith("#") || trimmedNext.startsWith("//")) {
          if (value.length < MAX_VALUE_LENGTH) {
            value += "\n" + nextLine;
          }
          i++;
          lineCount++;
          continue;
        }
        if (/^(MODIFY|ADD|DELETE)\b/i.test(trimmedNext)) break;
        if (value.length + nextLine.length > MAX_VALUE_LENGTH) {
          console.warn("[parseOpLines] Value too large, truncating");
          break;
        }
        value += "\n" + nextLine;
        i++;
        lineCount++;
      }

      ops.push({
        kind: "modify",
        path,
        op,
        value: value.trim(),
      });
    } else if (/^ADD\s+/i.test(rawLine)) {
      const rest = rawLine.replace(/^ADD\s+/i, "").trim();
      const collection = rest;
      let payload = "";
      let lineCount = 0;

      i++;
      while (i < lines.length && lineCount < MAX_LINES_PER_OP) {
        const nextLine = lines[i];
        const trimmedNext = nextLine.trim();
        if (!trimmedNext || trimmedNext.startsWith("#") || trimmedNext.startsWith("//")) {
          if (payload.length < MAX_VALUE_LENGTH) {
            payload += "\n" + nextLine;
          }
          i++;
          lineCount++;
          continue;
        }
        if (/^(MODIFY|ADD|DELETE)\b/i.test(trimmedNext)) break;
        if (payload.length + nextLine.length > MAX_VALUE_LENGTH) {
          console.warn("[parseOpLines] Payload too large, truncating");
          break;
        }
        payload += "\n" + nextLine;
        i++;
        lineCount++;
      }

      const trimmedPayload = payload.trim();
      if (trimmedPayload) {
        ops.push({
          kind: "add",
          collection,
          payload: trimmedPayload,
        });
      }
    } else if (/^DELETE\b/i.test(rawLine)) {
      const rest = rawLine.replace(/^DELETE\s+/i, "").trim();
      const firstSpace = rest.indexOf(" ");
      if (firstSpace !== -1) {
        ops.push({
          kind: "delete",
          collection: rest.slice(0, firstSpace).trim(),
          id: rest.slice(firstSpace + 1).trim(),
        });
      } else {
        // 兼容点号格式：DELETE inventory.i15 → collection=inventory, id=i15
        const lastDot = rest.lastIndexOf(".");
        if (lastDot !== -1) {
          ops.push({
            kind: "delete",
            collection: rest.slice(0, lastDot).trim(),
            id: rest.slice(lastDot + 1).trim(),
          });
        }
      }
      i++;
    } else {
      i++;
    }
  }
  return ops;
}

function _debugOps(ops: DataOp[]): void {
  const adds = ops.filter((o) => o.kind === "add");
  console.debug("[parseOpLines] Total ops:", ops.length, "ADD ops:", adds.length, adds.map((a) => ({ collection: a.collection, payloadLen: typeof a.payload === "string" ? a.payload.length : JSON.stringify(a.payload).length })));
}

// ===== JSON 数据识别 =====

/** 从模型输出中提取 JSON 值，容忍代码围栏、前后缀说明与尾随逗号 */
export function parseJsonPayload(raw: string): any | null {
  if (!raw) return null;

  const tryParse = (s: string): any | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  const repair = (s: string) => s.replace(/,\s*([}\]])/g, "$1");
  const firstValid = (candidates: string[]): any | null => {
    for (const c of candidates) {
      const v = tryParse(c);
      if (v !== null && v !== undefined) return v;
      const repaired = tryParse(repair(c));
      if (repaired !== null && repaired !== undefined) return repaired;
    }
    return null;
  };

  const text = raw.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  const bracketStart = text.indexOf("[");
  const bracketEnd = text.lastIndexOf("]");

  const candidates: string[] = [text];
  if (braceStart !== -1 && braceEnd > braceStart) candidates.push(text.slice(braceStart, braceEnd + 1));
  if (bracketStart !== -1 && bracketEnd > bracketStart) candidates.push(text.slice(bracketStart, bracketEnd + 1));
  // 描述性字段里偶尔夹着裸换行、制表这类控制字符，JSON.parse 会因此报错；
  // 把上面几份各转义一遍再试，合规的 JSON 本就没有裸控制字符，故对正常输出不改动分毫
  candidates.push(...candidates.slice().map(escapeRawControlChars));

  return firstValid(candidates);
}

/**
 * 把字符串字面量里的裸换行、回车、制表转义掉。
 * 引号外的换行是合法空白，原样保留；只处理字符串内部那些会让 JSON.parse 失败的控制字符。
 */
export function escapeRawControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (!inStr) {
      if (ch === '"') inStr = true;
      out += ch;
      continue;
    }
    if (esc) {
      out += ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      esc = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inStr = false;
      continue;
    }
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 输出被截断时，整段 JSON 已经解析不出来。
 * 这里退一步：从头扫描 ops 数组里一个个完整的对象，把已经闭合的那些捡回来，
 * 免得只因尾巴缺了一角，整门档案都白写。
 */
export function salvageOpObjects(text: string): any[] {
  const opsKey = text.indexOf('"ops"');
  const arrStart = opsKey === -1 ? -1 : text.indexOf("[", opsKey);
  const from = arrStart === -1 ? text.indexOf("{") : arrStart + 1;
  if (from === -1) return [];

  const found: any[] = [];
  let i = from;
  while (i < text.length) {
    const objStart = text.indexOf("{", i);
    if (objStart === -1) break;
    let depth = 0;
    let j = objStart;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    // 尾部那个对象没闭合，说明正是被截断处，丢弃
    if (end === -1) break;
    const chunk = text.slice(objStart, end + 1);
    try {
      found.push(JSON.parse(chunk));
    } catch {
      try {
        found.push(JSON.parse(escapeRawControlChars(chunk)));
      } catch {
        // 这一条本身坏了，跳过，不牵连其余
      }
    }
    i = end + 1;
  }
  return found;
}

type JsonOpKind = "modify" | "add" | "delete" | "buy";

/**
 * 每条 op 只许带提示词里点名的这几个字段。
 * 模型偶尔会另写 type、action、key、val、target 一类别名，或塞一句说明进来——
 * 这些都不是约定的写法，一律不收。
 */
const JSON_OP_KEYS: Record<JsonOpKind, string[]> = {
  modify: ["kind", "path", "op", "value"],
  add: ["kind", "collection", "payload"],
  delete: ["kind", "collection", "id"],
  buy: ["kind", "what", "name", "price", "count", "type", "grade", "desc", "place"],
};

/** 值只取数字或字符串；灵根是提示词里点明要写数组的那一处例外 */
function jsonOpValue(raw: unknown, path: string): string | null {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (path === "player.spiritRoots" && Array.isArray(raw)) return JSON.stringify(raw);
  // 四等灵石有时整块写成对象，如 {"low":120,"mid":2}；照字面收下，落账时再拆
  if ((path === "spiritStones" || path === "player.spiritStones") && raw && typeof raw === "object") {
    return JSON.stringify(raw);
  }
  return null;
}

/** 中文数字读成数：三十、一百二十、两千五百、三万 */
function cnToNumber(text: string): number | null {
  let total = 0;
  let section = 0;
  let digit: number | null = null;
  let seen = false;
  for (const ch of text) {
    const unit = ch === "十" ? 10 : ch === "百" ? 100 : ch === "千" ? 1000 : ch === "万" ? 10000 : 0;
    if (unit) {
      seen = true;
      if (unit === 10000) {
        total += (section + (digit ?? 0)) * 10000;
        section = 0;
      } else {
        section += (digit ?? 1) * unit;
      }
      digit = null;
      continue;
    }
    if (ch in CN_DIGITS) {
      digit = CN_DIGITS[ch];
      seen = true;
      continue;
    }
    return null;
  }
  return seen ? total + section + (digit ?? 0) : null;
}

/**
 * 宽松读数：模型常把价钱写成「30枚」「三十」或「30 下品灵石」，
 * 认得出便照数收下，认不出返回 null，由调用方决定丢不丢。
 */
function looseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const digits = text.match(/-?\d+(?:\.\d+)?/);
  if (digits) return Number(digits[0]);
  return cnToNumber(text.replace(/[^零〇一二两三四五六七八九十百千万]/g, ""));
}

/** 把单条 JSON 操作归一化为 DataOp；不合约定格式的整条丢掉 */
function normalizeJsonOp(item: any): DataOp | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const kind = item.kind;
  if (kind !== "modify" && kind !== "add" && kind !== "delete" && kind !== "buy") return null;
  // buy 允许带铺名、卖主一类说明字段：这些不影响钱货，整条丢掉反倒让买下的东西没进囊
  if (kind !== "buy") {
    const allowedKeys = JSON_OP_KEYS[kind];
    if (Object.keys(item).some((key) => !allowedKeys.includes(key))) return null;
  }

  if (kind === "buy") {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return null;
    const price = looseNumber(item.price);
    if (price === null || price < 0) return null;
    const count = looseNumber(item.count);
    return {
      kind,
      what: item.what === "manor" ? "manor" : "item",
      name,
      price: Math.round(price),
      count: count !== null && count > 0 ? Math.min(99, Math.trunc(count)) : undefined,
      type: typeof item.type === "string" ? item.type.trim() : undefined,
      grade: typeof item.grade === "string" ? item.grade.trim() : undefined,
      desc: typeof item.desc === "string" ? item.desc.trim() : undefined,
      place: typeof item.place === "string" ? item.place.trim() : undefined,
    };
  }

  if (kind === "modify") {
    const path = typeof item.path === "string" ? item.path.trim() : "";
    const operator = item.op;
    if (!path) return null;
    if (operator !== "=" && operator !== "+" && operator !== "-") return null;
    const value = jsonOpValue(item.value, path);
    if (value === null) return null;
    return { kind, path, op: operator, value };
  }

  if (kind === "add") {
    const collection = typeof item.collection === "string" ? item.collection.trim() : "";
    const payload = item.payload;
    if (!collection) return null;
    // 字串也收：模型偶尔把一件物、一段说明直接写成字面，落账时会再解析
    if (!payload || (typeof payload !== "object" && typeof payload !== "string") || Array.isArray(payload)) {
      return null;
    }
    return { kind, collection, payload: payload as string | Record<string, unknown> };
  }

  const collection = typeof item.collection === "string" ? item.collection.trim() : "";
  const id =
    typeof item.id === "string" ? item.id.trim() : typeof item.id === "number" ? String(item.id) : "";
  if (!collection || !id) return null;
  return { kind, collection, id };
}

export interface JsonOpsResult {
  ops: DataOp[];
  opsRaw: string;
  quickDecisions: string[];
  /** 整段 JSON 没能成篇、只从残文里救回若干条时为真；调用方可据此补一次更省字的问法 */
  salvaged: boolean;
}

/** 解析后处理模型的 JSON 输出，得到数据操作与快捷决断 */
export function parseJsonOps(raw: string): JsonOpsResult {
  let parsed = parseJsonPayload(raw);
  // 整段不成篇、走残文救回的多半是被截断或半途坏了字符，后面往往还漏着条目；
  // 记下一笔，让调用方能再补一次
  let salvaged = false;

  if (parsed === null) {
    // 整段解析不出来，多半是输出被截断（或是半途坏在某个字符上）；
    // 退而把 ops 数组里已经闭合的对象一条条捡回来，别让整门档案白写
    const recovered = salvageOpObjects(raw);
    if (recovered.length > 0) {
      salvaged = true;
      console.warn(`[parseJsonOps] 整段 JSON 不成篇，已从残文里救回 ${recovered.length} 条 op`);
      parsed = { ops: recovered };
    }
  }

  if (parsed === null) {
    console.warn("[parseJsonOps] JSON 解析失败，原始输出前 500 字：", raw.slice(0, 500));
    return { ops: [], opsRaw: "", quickDecisions: [], salvaged: false };
  }

  // 提示词只认一种顶层写法：{"ops": [...], "quickDecisions": [...]}。
  // 整段给成数组、或另写成 operations／changes 的，都不是约定的格式，不作数。
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("[parseJsonOps] 顶层不是约定的 ops 对象，本轮不作数");
    return { ops: [], opsRaw: "", quickDecisions: [], salvaged };
  }

  const container = parsed as Record<string, any>;
  if (!Array.isArray(container.ops)) {
    console.warn("[parseJsonOps] 缺少 ops 数组，本轮不作数");
    return { ops: [], opsRaw: "", quickDecisions: [], salvaged };
  }
  const rawOps: any[] = container.ops;

  const ops: DataOp[] = [];
  for (const item of rawOps.slice(0, MAX_TOTAL_OPS)) {
    const op = normalizeJsonOp(item);
    if (op) ops.push(op);
  }

  const rawQuick = container.quickDecisions;
  const quickDecisions = Array.isArray(rawQuick)
    ? rawQuick.map((q: any) => String(q ?? "").trim()).filter(Boolean).slice(0, 8)
    : [];

  console.debug("[parseJsonOps] ops:", ops.length, "quickDecisions:", quickDecisions.length);
  return { ops, opsRaw: JSON.stringify(rawOps).slice(0, 5000), quickDecisions, salvaged };
}

type PathSeg = string | { type: "array"; id: string };

function parsePath(path: string): PathSeg[] {
  const segs: PathSeg[] = [];
  let cur = "";
  for (const ch of path) {
    if (ch === ".") {
      if (cur) segs.push(cur);
      cur = "";
    } else if (ch === "[") {
      if (cur) segs.push(cur);
      cur = "";
    } else if (ch === "]") {
      if (cur) segs.push({ type: "array", id: cur });
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) segs.push(cur);
  return segs;
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();

  if (!trimmed) {
    return raw;
  }

  if (!isNaN(Number(trimmed))) {
    return Number(trimmed);
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        return JSON.parse(trimmed.replace(/'/g, '"'));
      } catch {
        return trimmed;
      }
    }
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        return JSON.parse(trimmed.replace(/'/g, '"'));
      } catch {
        return trimmed;
      }
    }
  }

  return trimmed;
}

/**
 * 模型能往里写条目的集合就这些，别的一律丢弃。
 * 提示词里虽已写明，但模型的输出不可尽信，这里再兜一道，免得它自造一个集合把存档写花。
 */
const WRITABLE_COLLECTIONS = new Set([
  "inventory",
  "log",
  "techniques",
  "relations",
  "quests",
  "adventures",
  "auctions",
  "rumors",
  "pacts",
  "manorPlots",
  "skills",
  "checks",
  "sectSites",
  "sectRelations",
  "occupations",
  "sect.tasks",
  "sect.heritage",
  "sect.shop",
  "sect.resources",
  "sect.positions",
  "sect.modifiers",
  "news.items",
  "player.meridians",
  "player.stats.heartScores",
  "player.timeline",
  "player.buffs",
  "player.shields",
]);

function resolveCollection(root: any, collection: string): any[] {
  // 表外的集合不认：既不新建，也拿不到数组，调用方自然就把这条 op 丢开了
  if (!WRITABLE_COLLECTIONS.has(collection)) return [];
  const segs = collection.split(".");
  let cur: any = root;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (cur == null) return [];
    if (cur[s] === undefined) {
      if (i === segs.length - 1) {
        cur[s] = [];
      } else {
        cur[s] = {};
      }
    } else if (typeof cur[s] !== "object" && i < segs.length - 1) {
      return [];
    }
    cur = cur[s];
  }
  return Array.isArray(cur) ? cur : [];
}

const BUY_ITEM_TYPES = ["材料", "丹药", "符箓", "法宝", "灵兽", "杂物"];
const BUY_GRADES = ["凡品", "灵品", "玄品", "天品", "仙品"];

/**
 * 叙事里当场买成的一笔：先按四等灵石一比一百兑开，再付钱交货。
 * 兑尽了仍不够便不作数，回一句「没能买下」，由叙事收尾。
 */
function applyBuyOp(root: any, op: Extract<DataOp, { kind: "buy" }>): string | null {
  const name = String(op.name ?? "").trim().slice(0, 30);
  if (!name) return null;
  const count = Math.max(1, Math.min(99, Math.trunc(Number(op.count) || 1)));
  const unit = Math.max(0, Math.round(Number(op.price) || 0));
  const cost = unit * count;
  const paid = spendLowStones(root?.spiritStones, cost);
  if (!paid) {
    return `（你摸了摸囊中，${cost} 枚下品灵石兑尽了也凑不出来，「${name}」终究没能买成。）`;
  }
  root.spiritStones = paid;

  if (op.what === "manor") {
    const place = String(op.place ?? "").trim() || name;
    const plots = Array.isArray(root.manorPlots) ? root.manorPlots : [];
    // 叙事里买下的是现成的宅院：院中已有正房与两间厢房，不是荒地
    const cell = assignManorCell({ place }, plots);
    plots.push(readyBuiltPlot({ place, cityId: cell.cityId, districtId: cell.districtId }));
    root.manorPlots = plots;
    root.log = [`你在${place}买下一处宅地，花 ${cost} 下品灵石。`, ...(Array.isArray(root.log) ? root.log : [])].slice(0, 30);
    return null;
  }

  const type = BUY_ITEM_TYPES.includes(String(op.type ?? "")) ? String(op.type) : "杂物";
  const grade = BUY_GRADES.includes(String(op.grade ?? "")) ? String(op.grade) : "凡品";
  const inv: any[] = Array.isArray(root.inventory) ? root.inventory : [];
  const stacked = inv.find((i) => i?.name === name && i?.type === type);
  if (stacked) {
    stacked.count = Math.max(0, Math.trunc(Number(stacked.count) || 0)) + count;
    stacked.value = Math.max(1, Math.round(((Number(stacked.value) || unit) * (stacked.count - count) + unit * count) / stacked.count));
  } else {
    inv.push({
      id: `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      name,
      type,
      grade,
      count,
      value: unit,
      icon: name.slice(0, 1),
      desc: String(op.desc ?? "").trim().slice(0, 120) || `在${String(op.place ?? "").trim() || "市上"}买下的。`,
    });
  }
  root.inventory = inv;
  root.log = [
    `你花 ${cost} 下品灵石买下「${name}」${count > 1 ? ` ${count} 件` : ""}。`,
    ...(Array.isArray(root.log) ? root.log : []),
  ].slice(0, 30);
  return null;
}

/** 灵石四等一律折成非负整数：旧档或模型给的「一百二十」也认得出 */
function stoneAmount(v: unknown): number {
  const n = typeof v === "string" ? looseNumber(v) : Number(v);
  return Math.max(0, Math.trunc(Number.isFinite(Number(n)) ? Number(n) : 0));
}

/**
 * 路由圈定的路子里，有没有盖住这一条。
 * 只作诊断用：圈不着也照落账，不借此拦人。
 */
function routeCovers(writable: string[], path: string): boolean {
  const headOf = (p: string) => String(p ?? "").trim().split("[")[0].replace(/<[^>]*>/g, "");
  const target = headOf(path);
  if (!target) return true;
  return writable.some((w) => {
    const head = headOf(w);
    return !!head && (target === head || target.startsWith(`${head}.`) || head.startsWith(`${target}.`));
  });
}

export function applyOpsToState(
  state: GameState,
  ops: DataOp[],
  hooks?: { onNote?: (text: string) => void; writable?: string[] },
): GameState {
  if (ops.length === 0) return state;
  const MAX_OPS = 200;
  const limitedOps = ops.slice(0, MAX_OPS);
  if (ops.length > MAX_OPS) {
    console.warn(`[dataOps] Too many ops (${ops.length}), truncating to ${MAX_OPS}`);
  }

  const clone = <T>(obj: T): T => {
    if (obj == null) return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch {
      return obj;
    }
  };

  const next: GameState = {
    ...state,
    player: clone(state.player),
    techniques: Array.isArray(state.techniques) ? state.techniques.map((t) => ({ ...t })) : [],
    inventory: Array.isArray(state.inventory) ? state.inventory.map((i) => ({ ...i })) : [],
    spiritStones: { ...state.spiritStones },
    // 另抄一份，免得改到上一回合的状态对象
    reputation: { ...normalizeReputation(state.reputation) },
    sect: clone(state.sect),
    relations: Array.isArray(state.relations) ? state.relations.map((r) => ({ ...r })) : [],
    log: Array.isArray(state.log) ? [...state.log] : [],
    pillCache: state.pillCache ? { ...state.pillCache } : {},
    news: state.news ? clone(state.news) : { items: [], lastUpdate: "" },
    currentTime: state.currentTime ? clone(state.currentTime) : { ...OPENING_GAME_TIME },
    // 街区名字要另起一份，否则下面直接往上写会改到上一回合的状态对象
    districtNames: state.districtNames ? { ...state.districtNames } : {},
    priceAdjusts: Array.isArray(state.priceAdjusts) ? state.priceAdjusts.map((a) => ({ ...a })) : [],
    // 本事、判定与机缘都要另起一份：掷骰、改口、落账都会往上写，不能改到上一回合那份
    skills: Array.isArray(state.skills) ? state.skills.map((s) => ({ ...s })) : [],
    checks: Array.isArray(state.checks) ? state.checks.map((c) => ({ ...c })) : [],
    quests: Array.isArray(state.quests) ? state.quests.map((q) => ({ ...q })) : [],
    adventures: Array.isArray(state.adventures) ? state.adventures.map((a) => ({ ...a })) : [],
    // 宗门点位要另起一份：叙事里提到本局没有的门派会往上添一处，不能改到上一回合那份
    sectSites: Array.isArray(state.sectSites) ? state.sectSites.map((s) => ({ ...s })) : [],
    // 村庄要另起一份：叙事里动身去了某一村会往上报「已前往」，不能改到上一回合那份
    villages: state.villages ? clone(state.villages) : {},
    // 产业要另起一份：叙事里把某处租出去会往上报租客与月租
    estates: Array.isArray(state.estates) ? state.estates.map((e) => ({ ...e })) : [],
    manorPlots: Array.isArray(state.manorPlots) ? state.manorPlots.map((p) => ({ ...p })) : [],
    // 约定要另起一份：叙事里说定的事往上添，不能改到上一回合那一份
    pacts: Array.isArray(state.pacts) ? state.pacts.map((p) => ({ ...p })) : [],
  };

  // 先收拾一遍灵石：旧档里若留着字面，后面的加减与付账都会算错
  next.spiritStones = {
    low: stoneAmount(next.spiritStones?.low),
    mid: stoneAmount(next.spiritStones?.mid),
    high: stoneAmount(next.spiritStones?.high),
    supreme: stoneAmount(next.spiritStones?.supreme),
  };

  const oldDateKey = state.currentTime ? gameDateKey(state.currentTime) : "";

  let addCount = 0, modifyCount = 0, deleteCount = 0, buyCount = 0;
  // 路由圈定的可写数据只用来留一笔诊断，圈不着的一概照落账
  const routed = (hooks?.writable ?? []).map((w) => String(w ?? "").trim()).filter(Boolean);
  for (const op of limitedOps) {
    try {
      // 当场买成的一笔走这一条：钱货同结，兑不出钱便回一句「没能买下」
      if (op.kind === "buy") {
        buyCount++;
        const note = applyBuyOp(next, op);
        if (note) hooks?.onNote?.(note);
        continue;
      }
      if (op.kind === "add") addCount++;
      else if (op.kind === "modify") modifyCount++;
      else if (op.kind === "delete") deleteCount++;
      if (op.kind === "modify" && routed.length > 0 && !routeCovers(routed, op.path)) {
        console.debug("[dataOps] 路由未圈定的改动，照常落账:", op.path);
      }
      applyOne(next, op);
    } catch (e) {
      console.warn("[dataOps] 操作失败，已跳过:", op, e);
    }
  }

  // 时间是模型给的值，写回前统一夹一遍：时辰认名也认数，月日夹在合法区间
  next.currentTime = normalizeGameTime(next.currentTime, state.currentTime ?? OPENING_GAME_TIME);

  // 四等灵石一律收拾成非负整数：模型偶尔写成「一百二十」「-5」，面板与付账都按数算
  next.spiritStones = {
    low: stoneAmount(next.spiritStones?.low),
    mid: stoneAmount(next.spiritStones?.mid),
    high: stoneAmount(next.spiritStones?.high),
    supreme: stoneAmount(next.spiritStones?.supreme),
  };

  /*
   * 叙事里打坐、闭关，功法进度照所耗时辰算，一夜不过几点。
   * 模型偶尔一笔写个满值，或把百分比当成进度写进去，一回合便把一门功法推到顶；
   * 这里按这一回真走过的时辰收一收，只收涨上去的那一截——掉下来的不拦。
   */
  const startTime = normalizeGameTime(state.currentTime ?? OPENING_GAME_TIME, OPENING_GAME_TIME);
  const elapsedHours = Math.max(0, timeSerial(next.currentTime) - timeSerial(startTime));
  const eff = localCultivationFrom({
    facilities: next.sect?.facilities,
    location: next.currentLocation,
  });
  // 这一回合最多能长多少：所耗时辰 × 每时辰进度 × 所在之处倍数；短回合留六点余量
  const profGainCap = Math.max(6, Math.round(elapsedHours * CULTIVATION_PER_HOUR * eff.mul));
  const beforeProf = new Map(
    (Array.isArray(state.techniques) ? state.techniques : []).map((t) => [t.id, Number(t.proficiency) || 0]),
  );
  next.techniques = (Array.isArray(next.techniques) ? next.techniques : []).map((t) => {
    const before = beforeProf.get(t.id);
    // 这一回合新得的功法没有旧进度可比，原样留着
    if (before === undefined) return t;
    const max = Math.max(1, Number(t.proficiencyMax) || 100);
    const raw = Number(t.proficiency) || 0;
    const gain = raw > before ? Math.min(profGainCap, raw - before) : raw - before;
    const after = Math.max(0, Math.min(max, before + gain));
    return after === raw ? t : { ...t, proficiency: after };
  });

  const newDateKey = next.currentTime ? gameDateKey(next.currentTime) : "";

  if (newDateKey && oldDateKey && newDateKey !== oldDateKey) {
    if (!next.news) next.news = { items: [], lastUpdate: "" };
    if (next.news.lastUpdate !== newDateKey) {
      next.news.items = [];
      next.news.lastUpdate = newDateKey;
      console.debug("[dataOps] 跨天检测：日期从", oldDateKey, "变为", newDateKey, "，已清空旧闻");
    }
  }

  console.debug("[dataOps] Ops applied — ADD:", addCount, "MODIFY:", modifyCount, "DELETE:", deleteCount, "BUY:", buyCount, "techniques.length:", next.techniques?.length);
  return next;
}

function parseMarkdownBlockToJson(block: string): any {
  const trimmedBlock = block.trim();
  // JSON 模式下的 payload 为 JSON 文本，直接解析
  if (trimmedBlock.startsWith("{") || trimmedBlock.startsWith("[")) {
    try {
      return JSON.parse(trimmedBlock);
    } catch {
      /* 解析失败则回退到 Markdown 文本解析 */
    }
  }

  const result: Record<string, unknown> = {};
  const lines = block.split("\n");

  for (const line of lines) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("-- ")) {
      trimmed = trimmed.slice(3).trim();
    } else if (trimmed.startsWith("--- ")) {
      trimmed = trimmed.slice(4).trim();
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      const rawValue = trimmed.slice(colonIdx + 1).trim();
      result[key] = parseValue(rawValue);
    } else {
      if (!result.text) {
        result.text = trimmed;
      } else {
        result.text += "\n" + trimmed;
      }
    }
  }

  if (result.text && !result.desc) {
    result.desc = result.text;
    delete result.text;
  }

  const CATEGORY_MAP: Record<string, string> = {
    heart: "心法",
    body: "炼体",
    divine: "神通",
    movement: "身法",
    secret: "秘术",
  };

  if (typeof result.category === "string") {
    result.category = CATEGORY_MAP[result.category] || result.category;
  }

  if (result.desc !== undefined && result.description === undefined) {
    result.description = result.desc;
    delete result.desc;
  }

  const TECHNIQUE_TYPES = new Set(["心法", "炼体", "神通", "身法", "秘术"]);
  if (typeof result.type === "string" && TECHNIQUE_TYPES.has(result.type)) {
    delete result.type;
  }

  return Object.keys(result).length > 0 ? result : block;
}

function normalizeNewsItem(item: any): any {
  if (!item || typeof item !== "object") return item;

  // 如果 AI 用了 text: "分类 | 内容" 格式，解析它
  if (item.text && typeof item.text === "string") {
    const pipeIdx = item.text.indexOf("|");
    if (pipeIdx > 0) {
      item.category = item.text.slice(0, pipeIdx).trim();
      item.content = item.text.slice(pipeIdx + 1).trim();
    } else {
      item.content = item.text.trim();
    }
    delete item.text;
  }

  // 规范化 category
  const validCategories = ["官府公告", "宗门布告", "市井传言"];
  if (!validCategories.includes(item.category)) {
    // 尝试匹配已知分类
    const matched = validCategories.find((c) => item.category?.includes(c));
    item.category = matched || item.category || "市井传言";
  }

  // 自动补全缺失字段
  if (!item.id) {
    item.id = `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  if (!item.date) {
    item.date = "今日";
  }
  if (!item.title) {
    // 取 content 前 15 字作为标题
    const raw = item.content || "";
    item.title = raw.length > 15 ? raw.slice(0, 15) + "..." : raw;
  }
  if (!item.source) {
    item.source = item.category || "江湖消息";
  }

  return item;
}

function normalizeTechnique(item: any): any {
  if (!item || typeof item !== "object") return item;

  if (item.type && !item.category) {
    item.category = item.type;
    delete item.type;
  }

  if (item.maxProficiency !== undefined && item.proficiencyMax === undefined) {
    item.proficiencyMax = item.maxProficiency;
    delete item.maxProficiency;
  }

  const validGrades = ["凡品", "灵品", "玄品", "天品", "仙品"];
  if (item.grade && !validGrades.includes(item.grade)) {
    const gradeMap: Record<string, string> = {
      "一品": "凡品", "二品": "凡品", "三品": "灵品", "四品": "灵品",
      "五品": "玄品", "六品": "玄品", "七品": "天品", "八品": "天品", "九品": "仙品",
      "地品": "天品", "地级": "天品",
      "人级": "凡品", "神级": "仙品",
    };
    item.grade = gradeMap[item.grade] || "凡品";
  }

  // 功法门类只认这几路，认不出就归到心法，免得属性派生与界面分支都落空
  const TECHNIQUE_CATEGORIES = ["心法", "炼体", "神通", "身法", "秘术"];
  if (!TECHNIQUE_CATEGORIES.includes(item.category)) {
    const categoryMap: Record<string, string> = {
      剑法: "神通", 刀法: "神通", 掌法: "神通", 拳法: "炼体", 功法: "心法",
      内功: "心法", 轻功: "身法", 法术: "神通", 秘法: "秘术",
    };
    item.category = categoryMap[item.category] || "心法";
  }

  if (!item.element && item.attributes && typeof item.attributes === "object") {
    const entries = Object.entries(item.attributes as Record<string, number>);
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      item.element = entries[0][0];
    }
  }
  if (!item.element) item.element = "无";

  if (!item.nature) {
    const natureMap: Record<string, string> = { 心法: "中性", 炼体: "刚猛", 神通: "凌厉", 身法: "灵动", 秘术: "诡秘" };
    item.nature = natureMap[item.category as string] || "中性";
  }

  if (!item.daoPath) {
    const daoMap: Record<string, string> = { 心法: "内功心法", 炼体: "炼体之术", 神通: "神通术法", 身法: "身法遁术", 秘术: "秘术禁法" };
    item.daoPath = daoMap[item.category as string] || "内功心法";
  }

  // 出手样式：认十式与常见别名，认不出便按功法门类补一个
  item.style = normalizeCombatStyle(item.style) ?? defaultStyleOf(item.category as string);

  // 每修成一重长哪一条根基：只认四条，每重 1 到 3；没写便照门类给一个常例
  const rawGain = item.statGain && typeof item.statGain === "object" ? item.statGain : null;
  const gainStat = ["vitality", "soul", "wisdom", "agility"].includes(rawGain?.stat)
    ? (rawGain.stat as "vitality" | "soul" | "wisdom" | "agility")
    : undefined;
  if (gainStat) {
    const rawPer = Number(rawGain?.perLevel);
    item.statGain = {
      stat: gainStat,
      perLevel: Math.min(3, Math.max(1, Math.round(Number.isFinite(rawPer) && rawPer > 0 ? rawPer : 1))),
    };
  } else {
    item.statGain = defaultStatGainOf(item.category as string);
  }

  if (!item.insight) {
    item.insight = `${item.name || "无名功法"}，${item.grade || ""}${item.category || ""}，修至深处可通天地玄妙。`;
  }

  if (!item.description && item.desc) {
    item.description = item.desc;
    delete item.desc;
  }
  if (!item.description) item.description = item.desc || `${item.name || "无名功法"}的修炼法门。`;

  if (!item.heartMatch) {
    item.heartMatch = (item.heartCompatibility && Array.isArray(item.heartCompatibility))
      ? item.heartCompatibility.map((hc: any) => hc.trait).filter(Boolean)
      : [];
  }

  if (!item.levels || !Array.isArray(item.levels) || item.levels.length === 0) {
    const rank = typeof item.rank === "number" ? item.rank : 1;
    const levelNames = [
      "初窥门径", "登堂入室", "融会贯通", "小有所成", "心领神会",
      "登峰造极", "炉火纯青", "出神入化", "返璞归真", "道成",
    ];
    item.levels = levelNames.map((name, i) => ({
      level: i + 1,
      name,
      proficiencyNeeded: Math.round((item.proficiencyMax || 100) * (i + 1) / 10 * 0.8),
      stats: i + 1 <= rank ? { cultivationSpeed: 5 + i * 3 } : {},
      skillUnlocked: (i === 2 || i === 5 || i === 9) && i + 1 <= rank ? `skill_${i}` : undefined,
    }));
  }

  if (item.skills && Array.isArray(item.skills)) {
    item.skills = item.skills.map((s: any, idx: number) => {
      // 负面效果维持的柱数：优先认 debuffDuration，兼容模型偶尔写出的 duration，夹到 1 到 12，缺省 3
      const rawDuration = typeof s.debuffDuration === "number" ? s.debuffDuration : s.duration;
      const debuffDuration = typeof rawDuration === "number" && Number.isFinite(rawDuration)
        ? Math.min(12, Math.max(1, Math.round(rawDuration)))
        : 3;
      // 心法催运：拿气血换灵力。只有心法能走这一路，且耗血与回灵都要写正数，少一样便当普通招式
      const rawHp = typeof s.hpCost === "number" && Number.isFinite(s.hpCost) ? s.hpCost : 0;
      const rawRestore = typeof s.mpRestore === "number" && Number.isFinite(s.mpRestore) ? s.mpRestore : 0;
      const convert = item.category === "心法" && rawHp > 0 && rawRestore > 0;
      const hpCost = convert ? Math.min(999, Math.max(1, Math.round(rawHp))) : 0;
      const mpRestore = convert ? Math.min(999, Math.max(1, Math.round(rawRestore))) : 0;
      // 守势：减免固定伤害，0 到 200 之间
      const rawGuard = Number(s.guard);
      const guard =
        Number.isFinite(rawGuard) && rawGuard > 0 ? Math.min(200, Math.round(rawGuard)) : 0;
      // 招式范围：只认这几种形制，认不出便照功法门类给一个常例
      const fallbackRange = defaultRangeOf(item.category as TechniqueCategory);
      const rangeShape = SKILL_RANGE_SHAPES.includes(s.rangeShape) ? s.rangeShape : fallbackRange.shape;
      const rawRangeSize = Number(s.rangeSize);
      const rangeSize =
        rangeShape === "近身"
          ? 1
          : Math.min(
              RANGE_SIZE_MAX,
              Math.max(
                1,
                Number.isFinite(rawRangeSize) && rawRangeSize > 0
                  ? Math.round(rawRangeSize)
                  : fallbackRange.size,
              ),
            );
      // 自拟阵图：最多 5×5，每行只留 0 与 1；一个 1 也没有便不算
      const rawPattern = Array.isArray(s.rangePattern) ? s.rangePattern : [];
      const rangePattern = rawPattern
        .map((r: any) => String(r ?? "").replace(/[^01]/g, "").slice(0, RANGE_PATTERN_MAX))
        .filter((r: string) => r.length > 0)
        .slice(0, RANGE_PATTERN_MAX);
      const hasPattern = rangePattern.some((r: string) => r.includes("1"));
      // 施展后落在谁身上的状态：只认名录里的，且增益落在自己、减益落在对手
      const seenBuffs = new Set<string>();
      const skillBuffs = (Array.isArray(s.buffs) ? s.buffs : [])
        .map((b: any) => {
          const tpl = findBuffTemplate(b?.id ?? b?.name);
          const target = b?.target === "self" ? "self" : b?.target === "enemy" ? "enemy" : null;
          if (!tpl || !target) return null;
          if (target === "enemy" && !tpl.isDebuff) return null;
          if (target === "self" && tpl.isDebuff) return null;
          const key = `${target}:${tpl.id}`;
          if (seenBuffs.has(key)) return null;
          seenBuffs.add(key);
          return { id: tpl.id, target };
        })
        .filter((b: { id: string; target: "self" | "enemy" } | null): b is { id: string; target: "self" | "enemy" } => Boolean(b))
        .slice(0, 2);
      return {
        id: s.id || `sk_${item.id}_${idx}`,
        name: s.name || `技能${idx + 1}`,
        description: s.description || s.desc || "",
        levelRequired: typeof s.rank === "number" ? s.rank : (idx === 0 ? 3 : idx === 1 ? 6 : 10),
        // 换灵力的那一招不耗灵力，反过来补灵力
        mpCost: convert ? 0 : (typeof s.mpCost === "number" ? s.mpCost : 20 + idx * 15),
        damage: typeof s.damage === "number" ? s.damage : 20 + idx * 25,
        cooldown: typeof s.cooldown === "number" ? s.cooldown : 3 + idx,
        effects: s.effects || [],
        debuffDuration,
        rangeShape,
        rangeSize,
        ...(hasPattern ? { rangePattern } : {}),
        ...(skillBuffs.length > 0 ? { buffs: skillBuffs } : {}),
        ...(guard > 0 ? { guard } : {}),
        ...(convert ? { hpCost, mpRestore } : {}),
      };
    });
  }

  // 修炼条件：只认这四类，条目不齐的丢掉；中文写法也顺带认下
  const PREREQ_TYPES: Record<string, string> = {
    realm: "realm",
    境界: "realm",
    technique: "technique",
    功法: "technique",
    spiritRoot: "spiritRoot",
    灵根: "spiritRoot",
    heartTrait: "heartTrait",
    心性: "heartTrait",
  };
  item.prerequisites = (Array.isArray(item.prerequisites) ? item.prerequisites : [])
    .map((r: any) => {
      const type = PREREQ_TYPES[String(r?.type ?? "").trim()];
      const value = String(r?.value ?? "").trim().slice(0, 24);
      if (!type || !value) return null;
      const rawMin = Number(r?.minLevel);
      const minLevel =
        Number.isFinite(rawMin) && rawMin > 0 ? Math.min(10, Math.round(rawMin)) : undefined;
      return { type, value, ...(minLevel ? { minLevel } : {}) };
    })
    .filter((r: { type: string; value: string } | null): r is { type: string; value: string } => Boolean(r))
    .slice(0, 3);

  if (!item.attributes || typeof item.attributes !== "object") {
    item.attributes = {};
  }

  // 修炼速度以 100 为基准，basePracticeSpeed / 100 即这门功法相对常例的快慢。
  // 模型偶尔会按 1~3 的比例给出，这里统一归一到 100 基准，否则数值会被压到千分之一。
  if (!item.basePracticeSpeed) {
    const gradeSpeed: Record<string, number> = { "凡品": 100, "灵品": 120, "玄品": 150, "天品": 200, "仙品": 300 };
    item.basePracticeSpeed = gradeSpeed[item.grade as string] || 100;
  } else if (typeof item.basePracticeSpeed === "number" && item.basePracticeSpeed > 0 && item.basePracticeSpeed < 10) {
    item.basePracticeSpeed = Math.round(item.basePracticeSpeed * 100);
  }

  return item;
}

function normalizeRelation(item: any): any {
  if (!item || typeof item !== "object") return item;

  if (item.closeness !== undefined) {
    if (typeof item.closeness === "string" && item.closeness.includes("/")) {
      const parts = item.closeness.split("/");
      item.affinity = parseInt(parts[0], 10) || 50;
      item.affinityMax = parseInt(parts[1], 10) || 100;
    } else {
      item.affinity = typeof item.closeness === "number" ? item.closeness : 50;
      item.affinityMax = 100;
    }
    delete item.closeness;
  }

  if (item.notes !== undefined) {
    item.note = item.notes;
    delete item.notes;
  }

  if (!item.id) {
    item.id = `npc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  if (!item.title) {
    item.title = "散修";
  }
  // 亲疏关系只认这几档，模型写的别称一律归到「好友」，免得意外的值把界面顶崩
  const RELATION_TYPES = ["dao_companion", "master", "disciple", "friend", "enemy"];
  const TYPE_ALIASES: Record<string, string> = {
    道侣: "dao_companion", 师父: "master", 师尊: "master", 弟子: "disciple",
    徒弟: "disciple", 好友: "friend", 朋友: "friend", 仇敌: "enemy", 仇人: "enemy",
  };
  item.type = RELATION_TYPES.includes(item.type) ? item.type : TYPE_ALIASES[item.type] || "friend";
  // 关系与信任是正主；模型若只给了旧的情谊，照同一口径折算过来
  if (item.relation === undefined || item.trust === undefined) {
    const a = typeof item.affinity === "number" ? Math.max(0, Math.min(100, item.affinity)) : 50;
    if (item.relation === undefined) item.relation = Math.round(a * 2 - 100);
    if (item.trust === undefined) item.trust = a >= 90 ? 5 : a >= 70 ? 4 : a >= 45 ? 3 : a >= 20 ? 2 : 1;
  }
  item.relation = Math.max(-100, Math.min(100, Math.round(Number(item.relation) || 0)));
  item.trust = Math.max(1, Math.min(5, Math.round(Number(item.trust) || 2)));
  delete item.affinity;
  delete item.affinityMax;
  if (!item.realm) {
    item.realm = "炼气初期";
  }
  if (!item.note) {
    item.note = "";
  }

  // 人设细目：模型给了就留着，年岁顺手取整，没给的字段不必硬填
  if (typeof item.gender === "string" && item.gender.trim()) {
    item.gender = item.gender.trim();
  } else {
    delete item.gender;
  }
  const age = Math.round(Number(item.age));
  if (Number.isFinite(age) && age > 0 && age < 300) {
    item.age = age;
  } else {
    delete item.age;
  }
  for (const key of ["origin", "personality", "appearance", "affiliation", "persona", "memory"] as const) {
    if (typeof item[key] === "string" && item[key].trim()) {
      item[key] = item[key].trim().slice(0, key === "persona" || key === "memory" ? 600 : 40);
    } else {
      delete item[key];
    }
  }

  // 所在城池：模型可能写地名，这里统一折成标点 id，免得后头对不上号
  const city = resolveMarker(item.cityId);
  if (city) {
    item.cityId = city.id;
  } else if (typeof item.cityId === "string" && !item.cityId.trim()) {
    delete item.cityId;
  }
  const districtId = Math.trunc(Number(item.districtId));
  if (Number.isFinite(districtId) && districtId >= 0) {
    item.districtId = districtId;
  } else {
    delete item.districtId;
  }

  // 固定出没的期限：到某日之前守在一处，过了这日随缘露面。
  // 没说清是哪座城的，就不必钉了；寻常人物本来就带着 cityId/districtId，不去动它。
  const fixedUntilDay = Math.trunc(Number(item.fixedUntilDay));
  if (Number.isFinite(fixedUntilDay) && fixedUntilDay > 0 && !!city) {
    item.fixedUntilDay = fixedUntilDay;
  } else {
    delete item.fixedUntilDay;
  }

  // 谁与你同行只由你在尘缘里定下，叙事说了不算
  delete item.traveling;

  return item;
}

const BUFF_DURATION_TYPES = ["until", "incense", "permanent", "conditional", "instant"];
/** 一炷香最多点十二柱，再多也烧不完 */
const INCENSE_STICK_MAX = 12;

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 归一化叙事写入的增益/减益。
 * 名目只能从 data/buffs 的名录里挑，模型只报「哪一条」与「顶多久」；
 * 名目、类别、图标与效力都照名录来，这样程序才读得懂、算得出。
 * 名录里没有的一律丢掉，返回 null 由调用方跳过。
 */
function normalizeBuff(item: any, root?: any): any | null {
  if (!item || typeof item !== "object") return null;

  const tpl = findBuffTemplate(item.id ?? item.name);
  if (!tpl) return null;

  const stacks = Math.min(tpl.maxStacks, Math.max(1, Math.round(toFiniteNumber(item.stacks, 1))));
  const rawType = String(item.durationType ?? "").trim();
  const durationType: BuffDurationType = BUFF_DURATION_TYPES.includes(rawType)
    ? (rawType as BuffDurationType)
    : "until";

  const now = normalizeGameTime(root?.currentTime, OPENING_GAME_TIME);
  const duration = durationType === "incense"
    ? Math.min(INCENSE_STICK_MAX, Math.max(1, Math.round(toFiniteNumber(item.duration, 1))))
    : undefined;

  return buffFromTemplate(tpl, {
    durationType,
    duration,
    stacks,
    // 按时辰算的时效：说得出就说，说不出就照名录上的常例顶一阵
    until:
      durationType === "until"
        ? item.until === undefined
          ? shiftGameTime(now, tpl.hours)
          : parseUntil(item.until, root)
        : undefined,
    source: typeof item.source === "string" ? item.source.slice(0, 40) : undefined,
  });
}

/** 归一化叙事写入的护盾 */
function normalizeShield(item: any): any {
  if (!item || typeof item !== "object") return item;

  const value = Math.max(0, Math.round(toFiniteNumber(item.value, 0)));
  const rawMax = Math.round(toFiniteNumber(item.maxValue, 0));
  const maxValue = rawMax > 0 ? rawMax : Math.max(value, 1);

  return {
    id: String(item.id || `shield-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: String(item.name || "护体灵光"),
    value: Math.min(value, maxValue),
    maxValue,
    source: typeof item.source === "string" ? item.source : undefined,
  };
}

/** AI字段名 → 实际字段名映射 */
const FIELD_ALIASES: Record<string, string> = {
  "maxHp": "hpMax",
  "maxMp": "mpMax",
  "maxSpirit": "spiritMax",
  "lifespan": "lifespanMax",
  "lifespanRemaining": "lifespanCurrent",
  "appearance": "description",
};

/** 统计属性别名 */
const STATS_ALIASES: Record<string, string> = {
  "spirit": "soul",
  "comprehension": "wisdom",
  "heart": "heartScores",
};

/** 灵根元素中文 → 英文映射 */
const ELEMENT_ALIASES: Record<string, string> = {
  "金": "金", "木": "木", "水": "水", "火": "火", "土": "土",
  "风": "风", "雷": "雷", "冰": "冰", "暗": "暗",
  "metal": "金", "wood": "木", "water": "水", "fire": "火", "earth": "土",
  "wind": "风", "thunder": "雷", "ice": "冰", "dark": "暗",
};

const VALID_ELEMENTS = ["金", "木", "水", "火", "土", "风", "雷", "冰", "暗"];

/** 常见材料与丹药的默认元素构成；仅用于补齐模型未给出的 elements，避免炼丹火候与元素体系整块失效 */
const DEFAULT_ITEM_ELEMENTS: Record<string, Record<string, number>> = {
  "百年灵芝": { 木: 80, 土: 20 },
  "寒潭水精": { 水: 90, 冰: 40 },
  "朱砂": { 火: 60, 土: 30 },
  "黄表符纸": { 木: 70, 火: 20 },
  "千年雪莲": { 冰: 85, 水: 50, 木: 20 },
  "妖兽内丹": { 火: 50, 雷: 30 },
  "山魈内丹": { 土: 40, 火: 30 },
  "聚气丹": { 水: 40, 木: 30 },
  "筑基丹": { 火: 40, 土: 30, 金: 20 },
  "回春丹": { 木: 50, 水: 30 },
  "雷火符": { 雷: 60, 火: 40 },
  "冰封符": { 冰: 70, 水: 30 },
  "寒潭玄铁剑": { 金: 80, 水: 30 },
  "云水佩": { 水: 60, 木: 20 },
};

/** 归一化物品的 elements：只保留合法元素、夹到 -100~100；缺失时按名称补默认值 */
export function normalizeItemElements(item: any): any {
  if (!item || typeof item !== "object") return item;

  // 行囊条目的类别与品阶只认这几样，模型写的别称一律归到正名
  const ITEM_GRADES = ["凡品", "灵品", "玄品", "天品", "仙品"];
  item.type = normalizeItemType(item.type);
  if (!ITEM_GRADES.includes(item.grade)) {
    item.grade = "凡品";
  }
  const count = Math.trunc(Number(item.count));
  item.count = Number.isFinite(count) && count > 0 ? Math.min(999, count) : 1;
  if (!item.id) item.id = `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  if (typeof item.name !== "string" || !item.name.trim()) item.name = "无名之物";
  if (typeof item.desc !== "string") item.desc = "";
  if (typeof item.icon !== "string" || !item.icon) item.icon = item.name.charAt(0);

  // 买价只留个正数：卖出时照它折价，写到离谱便不如不记
  const paid = Math.trunc(Number(item.value));
  if (Number.isFinite(paid) && paid > 0) item.value = Math.min(9_999_999, paid);
  else delete item.value;

  const cleaned: Record<string, number> = {};
  if (item.elements && typeof item.elements === "object") {
    for (const [rawKey, rawVal] of Object.entries(item.elements as Record<string, unknown>)) {
      const elem = ELEMENT_ALIASES[rawKey] || rawKey;
      if (!VALID_ELEMENTS.includes(elem)) continue;
      const num = Number(rawVal);
      if (!Number.isFinite(num) || num === 0) continue;
      cleaned[elem] = Math.max(-100, Math.min(100, Math.round(num)));
    }
  }

  if (Object.keys(cleaned).length === 0 && item.name && DEFAULT_ITEM_ELEMENTS[item.name]) {
    Object.assign(cleaned, DEFAULT_ITEM_ELEMENTS[item.name]);
  }
  if (Object.keys(cleaned).length > 0) item.elements = cleaned;

  return item;
}

/**
 * 鉴宝的结果：把叙事看出来的样子落回成行囊里的一件东西。
 * 名目、类别、品阶只认那几张表，表外的归到最普通的一档；
 * 说不出名目就当没看明白，返回 null，那件旧物原样留着。
 */
export function normalizeAppraisal(reading: unknown, fallback: InventoryItem): InventoryItem | null {
  const raw = reading as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return null;

  const name = String(raw.name ?? "").trim();
  if (!name) return null;

  // 走一遍行囊条目的归一化，类别品阶与元素一并夹进表内
  const item = normalizeItemElements({
    id: fallback.id,
    name: name.slice(0, 20),
    type: raw.type,
    grade: raw.grade,
    count: Math.max(1, Math.trunc(Number(fallback.count) || 1)),
    icon: raw.icon,
    desc: String(raw.desc ?? "").trim().slice(0, 120) || "请懂行的人看过，这才看出是什么东西。",
    elements: raw.elements,
  });

  // 看明白了，旧物的名头就此揭过
  delete item.mystery;
  return item as InventoryItem;
}

const REALMS_LIST = REALM_NAMES;

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0,
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/** 中文数字转阿拉伯数字，只认一到九十九（三、十五、二十、三十八） */
function cnNumber(s: string): number {
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (CN_DIGITS[s[1]] ?? 0);
  if (s.includes("十")) {
    const [head, tail] = s.split("十");
    return (CN_DIGITS[head] ?? 1) * 10 + (tail ? CN_DIGITS[tail] ?? 0 : 0);
  }
  return CN_DIGITS[s] ?? NaN;
}

/** 取出幅度与单位：认「+30%」「-两成」「1.5倍」这几种写法 */
function parseMagnitude(text: string): { value: number; unit: string } | null {
  const m = text.match(/([+-]?)(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*(%|成|倍)?/);
  if (!m) return null;

  const value = /^\d/.test(m[2]) ? Number(m[2]) : cnNumber(m[2]);
  if (!Number.isFinite(value)) return null;

  return { value: m[1] === "-" ? -value : value, unit: m[3] ?? "" };
}

/** 从「3天」「五日」这类说法里取出天数；认不出按三日算 */
function parseDayCount(text: string): number {
  const m = text.match(/(\d+|[一二两三四五六七八九十]+)\s*(?:天|日)/);
  if (!m) return 3;

  const value = /^\d/.test(m[1]) ? Number(m[1]) : cnNumber(m[1]);
  if (!Number.isFinite(value)) return 3;
  return Math.min(30, Math.max(1, value));
}

/**
 * 解析「持续到某时」：认 {year,month,day,hour} 这样的对象，
 * 也认「514-2-18 午时」「三日后」「五个时辰后」这类说法。
 * 说得出早晚的，若给的时刻已过去，就顺延一日，免得一写出来就失效。
 * 实在认不出，就当它从此刻起顶半日。
 */
function parseUntil(raw: unknown, root?: any): GameTime {
  const now = normalizeGameTime(root?.currentTime, OPENING_GAME_TIME);
  const halfDayLater = () => shiftGameTime(now, 12);

  if (raw && typeof raw === "object") {
    const parsed = normalizeGameTime(raw, now);
    return timeSerial(parsed) > timeSerial(now) ? parsed : halfDayLater();
  }

  const text = String(raw ?? "").trim();
  if (!text) return halfDayLater();

  // 相对说法：「三日后」「五个时辰后」
  if (/后/.test(text)) {
    const rel = text.match(/(\d+|[一二两三四五六七八九十]+)\s*(个?时辰|小时|天|日)/);
    if (rel) {
      const n = /^\d/.test(rel[1]) ? Number(rel[1]) : cnNumber(rel[1]);
      if (Number.isFinite(n) && n > 0) {
        return shiftGameTime(now, rel[2].includes("时辰") || rel[2].includes("小时") ? n : n * 12);
      }
    }
  }

  // 绝对时刻：「514-2-18 午时」「514年2月18日申时」「2月18日」
  const abs = text.match(/(?:(\d+)\s*[-年/]\s*)?(\d+)\s*[-月/]\s*(\d+)/);
  if (abs) {
    const hour = normalizeHour(text.replace(abs[0], " ").trim(), now.hour);
    const parsed = normalizeGameTime(
      {
        year: abs[1] ? Number(abs[1]) : now.year,
        month: Number(abs[2]),
        day: Number(abs[3]),
        hour,
      },
      now,
    );
    return timeSerial(parsed) > timeSerial(now) ? parsed : halfDayLater();
  }

  return halfDayLater();
}

/**
 * 把某一门还悬着的最近一次判定改口：改完这门本事也跟着长一截。
 * 只动画着的那一条，认栽过的、已成的都不再翻。
 */
function resolveCheck(root: any, skillName: string, success: boolean): void {
  const checks: SkillCheck[] = Array.isArray(root.checks) ? root.checks : [];
  const target = [...checks]
    .reverse()
    .find((c) => c?.pending && (c.skill === skillName || skillName.includes(c.skill)));
  if (!target) return;

  target.success = success;
  target.pending = undefined;
  target.admitted = !success;
  root.checks = checks;
  root.skills = trainOnceADay(
    Array.isArray(root.skills) ? root.skills : [],
    target.skill,
    success,
    target.day,
    checks,
  );
}

/**
 * 把一桩机缘了结掉：改状态、记一笔结果，再照单把酬谢或责罚兑成实数。
 * 只动还开着的那一桩，了结过的再写也不再生效。
 */
function settleQuest(root: any, name: string, status: "done" | "failed"): void {
  const quests: Quest[] = Array.isArray(root.quests) ? root.quests : [];
  // 名字照最贴近的那一桩认：先认全同，再认包含，取名字最长的，免得认错邻家的事
  const target = pickOpenQuest(quests, name);
  if (!target) return;

  const today = daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME));

  // 人物物品型：交差时行囊里真得有那件东西，取走才算交到人手上；
  // 东西不在，这桩交付便不算数，机缘照旧开着
  if (status === "done" && target.kind === "人物物品" && target.itemGoal) {
    const left = takeItemsByName(
      Array.isArray(root.inventory) ? root.inventory : [],
      target.itemGoal.name,
      target.itemGoal.count,
    );
    if (!left) return;
    root.inventory = left;
  }

  // 成与不成由 AI 判，本地只照单落账；日子过没过只是到期结算另算
  target.status = status;
  target.settledDay = today;

  // 门派交办的差事，任务板上也翻过这一页：办成与误期都算结了
  if (target.sectTask && root?.sect && Array.isArray(root.sect.tasks)) {
    const taskId = target.sectTask.taskId;
    root.sect.tasks = root.sect.tasks.map((t: any) =>
      t?.id === taskId ? { ...t, settled: true } : t,
    );
  }
  // 赏罚是一条状态时，须照眼下时辰算出顶到几时；少了这一笔，状态便立不起来，只剩字面上的一句话
  const ledger: QuestLedgerTarget = {
    ...(root as QuestLedgerTarget),
    now: normalizeGameTime(root?.currentTime, OPENING_GAME_TIME),
  };
  // 牙行揽下的差事交上了也只算办成，赏还押在柜上，得他自己回去领
  target.outcome =
    status === "done" && target.broker
      ? holdRewardOutcome(target)
      : applyQuestLedger(ledger, target, status);
  if (status === "done" && target.broker) target.claimed = false;
  root.quests = quests;
  // 捎信捎物一类的事，事一了，手里那件东西也一并销去
  if (target.carryItemId && Array.isArray(root.inventory)) {
    root.inventory = root.inventory.filter((i: any) => i?.id !== target.carryItemId);
  }
  // 这桩事一了，替它现开的那一处去处也撤去；原本就在舆图上的去处没有 questId，不动
  if (Array.isArray(root.adventures)) {
    root.adventures = root.adventures.filter((a: any) => a?.questId !== target.id);
  }
  // 交差或黄了都留一笔在见闻里，免得这事了得无声无息
  root.log = [`「${target.name}」${target.outcome}`, ...(Array.isArray(root.log) ? root.log : [])].slice(0, 30);
}

/** 掷一次骰子并把结果记进最近的判定里；掷不成（没点名考什么）返回 null */
function rollCheck(payload: any, root: any): SkillCheck | null {
  const asked = String(payload?.skill ?? payload?.name ?? "").trim().slice(0, 8);
  if (!asked) return null;

  const skills: Skill[] = Array.isArray(root?.skills) ? root.skills : [];
  const skill = findSkill(skills, asked);
  const checks: SkillCheck[] = Array.isArray(root?.checks) ? root.checks : [];
  const name = skill?.name ?? asked;

  return rollSkillCheck({
    asked,
    skill,
    dc: toFiniteNumber(payload?.dc, 12),
    context: String(payload?.context ?? payload?.why ?? "").trim(),
    day: daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME)),
    failedBefore: checks.some((c) => c?.skill === name && !c.success),
  });
}

/**
 * 解析叙事给的货物涨跌：「+30%」「-两成」「1.5倍」「130」都收，后面可跟天数。
 * 幅度夹在 -80% 到 +200%，天数夹在 1 到 30 天，认不出返回 null。
 */
function parsePriceAdjust(good: string, raw: string, root: any): PriceAdjust | null {
  const magnitude = parseMagnitude(raw.trim());
  if (!magnitude) return null;

  const { value, unit } = magnitude;
  let factor: number;
  if (unit === "%") factor = 1 + value / 100;
  else if (unit === "成") factor = 1 + value / 10;
  else if (unit === "倍") factor = value;
  // 没写单位时：大于 3 当百分数读（130 即原价的一倍三），否则当倍数读
  else factor = value > 3 ? value / 100 : value;
  if (!Number.isFinite(factor)) return null;

  const now = normalizeGameTime(root?.currentTime, OPENING_GAME_TIME);
  return {
    good,
    factor: Number(Math.min(3, Math.max(0.2, factor)).toFixed(2)),
    untilDay: daySerial(shiftGameTime(now, parseDayCount(raw) * 12)),
  };
}

/** 规范化MODIFY路径，将AI使用的字段名映射为实际字段名 */
/** 按村名找回存档里的村庄编号；对不上就当没这一处，丢弃这次改动 */
function findVillageKeyByName(root: any, name: string): string | null {
  if (!name) return null;
  const list: Record<string, any> = root?.villages ?? {};
  for (const [key, v] of Object.entries(list)) {
    if (v?.name === name || key === name) return key;
  }
  return null;
}

/** 从「王二 80」这类写法里拈出租客与月租；数字当租金，其余当名号 */
function parseRentValue(value: string): { tenant: string; monthly: number } {
  const text = String(value ?? "").trim();
  const numMatch = text.match(/(\d+)/);
  const monthly = numMatch ? Math.max(0, Math.round(Number(numMatch[1]))) : 0;
  const parts = text
    .split(/[|｜，,、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const rawTenant =
    parts.find((p) => !/^\d+$/.test(p)) ?? "";
  const tenant =
    rawTenant
      .replace(/^(租与|租给|月租|每月|租金)/, "")
      .replace(/(每月|月租|租金|下品|灵石)$/, "")
      .trim() || "租客";
  return { tenant, monthly };
}

/** 按产业名找回要出租的那一处：先认屋舍，再认宅邸 */
function findRentTargetByName(root: any, name: string): { kind: "estate" | "plot"; id: string } | null {
  if (!name) return null;
  for (const e of root?.estates ?? []) {
    if (e?.name === name || e?.id === name) return { kind: "estate", id: e.id };
  }
  for (const p of root?.manorPlots ?? []) {
    if (p?.place === name || p?.id === name) return { kind: "plot", id: p.id };
  }
  return null;
}

function normalizeModifyPath(root: any, path: string, value: string): { path: string; value: string } | null {
  // 处理 player.maxHp → player.hpMax 等
  let normalizedPath = path;

  // 四等灵石：模型有时照玩家字段写成 player.spiritStones.low，或在一条里整块给出四本账。
  // 灵石在存档里是顶层的一本，照原样写只会落到 player 底下，面板一分也认不出来
  if (normalizedPath.startsWith("player.spiritStones")) {
    normalizedPath = normalizedPath.slice("player.".length);
  }
  if (normalizedPath === "spiritStones") {
    let parsed: any = value;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return null;
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const tier = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));
    root.spiritStones = {
      low: tier(parsed.low ?? parsed.下品),
      mid: tier(parsed.mid ?? parsed.中品),
      high: tier(parsed.high ?? parsed.上品),
      supreme: tier(parsed.supreme ?? parsed.极品),
    };
    return null; // 已直接处理
  }
  if (/^spiritStones\.(low|mid|high|supreme)$/.test(normalizedPath)) {
    const n = looseNumber(value);
    return n === null ? null : { path: normalizedPath, value: String(Math.trunc(n)) };
  }

  // 时辰：模型写「午时」或写 6 都收，统一折成 0-11 的时辰序号再落库
  if (normalizedPath === "currentTime.hour") {
    const current = Number(root?.currentTime?.hour);
    const fallback = Number.isFinite(current) ? current : 0;
    return { path: "currentTime.hour", value: String(normalizeHour(value, fallback)) };
  }

  // 所在地点：模型写地名（长安）或写编号（2）都收，只认地图上已有的地点。
  // 认不出就返回 null 丢弃这次移动，绝不让模型编的地名把光标顶到图上没有的位置。
  if (normalizedPath === "currentPlaceId" || normalizedPath === "currentPlace") {
    const marker = resolveMarker(value);
    if (!marker) return null;
    // 标点编号多是「1」「7」这样的数字样字符串，若再交由 parseValue 过一道会被折成数字，
    // 而标点表以字符串为键，取不到便被当成无效地点打回原处；这里直接落库，留住字符串
    root.currentPlaceId = marker.id;
    return null; // 已直接处理
  }

  // 城中场所：同样只认表里已有的场所，认不出就丢弃
  if (normalizedPath === "currentLocation" || normalizedPath === "player.location") {
    const location = resolveLocation(value);
    return location ? { path: "currentLocation", value: location } : null;
  }

  // 村庄：叙事里若动身去了野外某一处村庄，用 modify village 记下，value 写村名。
  // 村名须与存档中真有的村庄对上；去过便解锁这一村，往后才谈得上向村人打听、与村里往来。
  if (normalizedPath === "village") {
    const name = String(value ?? "").trim().replace(/["']/g, "");
    const key = findVillageKeyByName(root, name);
    if (!key) return null;
    const list: Record<string, any> = root.villages ?? {};
    const v = list[key];
    if (v && !v.visited) {
      root.villages = { ...list, [key]: { ...v, visited: true } };
    }
    return null; // 已直接处理
  }

  // 出租：叙事里把名下某处产业租了出去，用 modify rent.<产业名> 记下，
  // value 写「租客 月租」如「王二 80」。租客与月租皆由叙事议定，系统照此按月入账。
  if (normalizedPath.startsWith("rent.")) {
    const name = normalizedPath.slice("rent.".length).trim();
    const { tenant, monthly } = parseRentValue(value);
    const target = findRentTargetByName(root, name);
    if (!target || monthly <= 0) return null;
    const lastPaidMonth = `${root?.currentTime?.year ?? ""}-${root?.currentTime?.month ?? ""}`;
    const rent = { tenant, monthly, lastPaidMonth };
    if (target.kind === "estate") {
      root.estates = (root.estates ?? []).map((e: any) => (e.id === target.id ? { ...e, rent } : e));
    } else {
      root.manorPlots = (root.manorPlots ?? []).map((p: any) => (p.id === target.id ? { ...p, rent } : p));
    }
    return null; // 已直接处理
  }

  // 街区起名：叙事把城里某一处写成独有名字（醉仙楼、铁匠巷……）。
  // 路径写 district.<街区编号> 即当前所在城，写 district.<城市编号>.<街区编号> 可指定他城。
  // 编号必须是该城城图上真有的街区，认不出就丢弃，免得给不存在的地方起名。
  if (normalizedPath.startsWith("district.")) {
    const [, first, second] = normalizedPath.split(".");
    const cityId = second ? first : String(root?.currentPlaceId ?? "");
    const districtId = Number(second ?? first);
    const district = getDistricts(cityId).find((d) => d.id === districtId);
    if (!district) return null;
    const name = value.trim().replace(/["']/g, "").slice(0, 12);
    if (!name) return null;
    if (!root.districtNames || typeof root.districtNames !== "object") root.districtNames = {};
    root.districtNames[`${cityId}:${districtId}`] = name;
    return null; // 已直接处理
  }

  // 货物行情：叙事里若有「漕路不通，盐价涨了三成」这类一时涨跌，
  // 路径写 price.<货名>，值写「涨跌幅度 + 持续几天」，如「+30% 3天」。
  // 只认预设货物表里有的货，认不出就丢弃，免得凭空多出一门不存在的买卖。
  if (normalizedPath.startsWith("price.")) {
    const good = normalizedPath.slice("price.".length).trim();
    if (!isKnownGood(good)) return null;
    const adjust = parsePriceAdjust(good, value, root);
    if (!adjust) return null;
    if (!Array.isArray(root.priceAdjusts)) root.priceAdjusts = [];
    // 一样货只留最近一次的说法，免得越叠越离谱
    root.priceAdjusts = root.priceAdjusts.filter((a: any) => a?.good !== good);
    root.priceAdjusts.push(adjust);
    return null; // 已直接处理
  }

  // 判定改口：路径写 check.<技能名>，值写「成」「过」「成功」或「败」「不成」「认栽」。
  // 改的是这一门最近一次还悬着的判定：写成便是争到了，写成败就是认栽，此后不再改口。
  if (normalizedPath.startsWith("check.")) {
    const skillName = normalizedPath.slice("check.".length).trim();
    if (!skillName) return null;
    const won = /成|过|赢/.test(value);
    const lost = /败|输|不成|认/.test(value);
    if (!won && !lost) return null;
    resolveCheck(root, skillName, won);
    return null; // 已直接处理
  }

  // 宗门词条：本门的性质、风气、特色、开局状态四条由开局叙事现定，
  // 路径写 sect.nature、sect.climate、sect.feature、sect.start，值写一个 2 至 6 字的名目。
  // 存档里这四样存的是词条对象，而模型给的是字面，故照字面拼一条词条顶上；
  // 空着便整条丢弃，留着认山门时再定。
  if (/^sect\.(nature|climate|feature|start)$/.test(normalizedPath)) {
    const field = normalizedPath.slice("sect.".length);
    const name = String(value ?? "").trim().replace(/["']/g, "").slice(0, 12);
    if (!name) return null;
    root.sect = { ...(root.sect ?? {}), [field]: { id: "ai", name, note: "" } };
    return null; // 已直接处理
  }

  // 宗门数目：等级、声望、长老、弟子四项各夹在自己的区间，路径写 sect.level 等，值写改后的数目。
  // 认不出数目便丢弃；名号、驻地、掌事者、气象、风物这些文本字段不在此列，走下方的通用逻辑直写。
  const sectNumber = normalizedPath.match(/^sect\.(level|reputation|elders|disciples)$/);
  if (sectNumber) {
    const field = sectNumber[1] as "level" | "reputation" | "elders" | "disciples";
    const bounds: Record<typeof field, [number, number]> = {
      level: [0, 8],
      reputation: [0, 100000],
      elders: [0, 999],
      disciples: [0, 99999],
    };
    const n = Number(String(value ?? "").trim());
    if (!Number.isFinite(n)) return null;
    const [lo, hi] = bounds[field];
    root.sect = { ...(root.sect ?? {}), [field]: Math.max(lo, Math.min(hi, Math.round(n))) };
    return null; // 已直接处理
  }

  // NPC 行踪：叙事里说某人往哪儿去了，路径写 relations[<id>].place（或 .cityId、.city）。
  // 城池只认地图上真有的，认不出就丢弃；城里的哪一处认得出就一并落上，认不出便只记到城池，
  // 界面上写「某城一带」，这人到了那座城便算得上撞见。
  const npcWhere = normalizedPath.match(/^relations\[([^\]]+)\]\.(place|currentPlace|cityId|city)$/);
  if (npcWhere) {
    const rel = (Array.isArray(root?.relations) ? root.relations : []).find(
      (r: any) => r && String(r.id) === npcWhere[1],
    );
    const marker = resolveMarker(value);
    if (!rel || !marker) return null;
    rel.cityId = marker.id;
    const [, ...rest] = String(value).split(/[·•.\s]/);
    const spot = rest.join("").trim();
    const district = spot
      ? getDistricts(marker.id).find((d) => {
          const named = root?.districtNames?.[`${marker.id}:${d.id}`];
          return (named && named === spot) || d.nature === spot;
        })
      : undefined;
    if (district) rel.districtId = district.id;
    else delete rel.districtId;
    return null; // 已直接处理
  }

  // NPC 落脚到哪一处街区：只认那座城城图上真有的街区
  const npcDistrict = normalizedPath.match(/^relations\[([^\]]+)\]\.districtId$/);
  if (npcDistrict) {
    const rel = (Array.isArray(root?.relations) ? root.relations : []).find(
      (r: any) => r && String(r.id) === npcDistrict[1],
    );
    const id = Math.trunc(Number(value));
    if (!rel || !Number.isFinite(id)) return null;
    if (!getDistricts(String(rel.cityId ?? "")).some((d) => d.id === id)) return null;
    rel.districtId = id;
    return null; // 已直接处理
  }

  // NPC 资料：叙事里某人的名号、身份、性情、形貌、出身、所属、境界，或与玩家的关系信任、所在有了变化，
  // 路径写 relations[<id>].<字段>，id 须在尘缘里真有其人，认不出便整条丢弃。
  // 能改的字段只此一张表：文本类去引号、按字段截断（memory 是记他心里的旧事，往后追加，不覆盖）；
  // 数值类夹进合法区间；亲疏与所在认不出的，宁可不动也不往存档里写名录外的值。
  const npcField = normalizedPath.match(/^relations\[([^\]]+)\]\.([A-Za-z_]+)$/);
  if (npcField) {
    const rel = (Array.isArray(root?.relations) ? root.relations : []).find(
      (r: any) => r && String(r.id) === npcField[1],
    );
    if (!rel) return null;
    const field = npcField[2];
    const raw = String(value ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
    const NPC_TEXT_FIELDS = [
      "name", "title", "note", "persona", "memory", "gender",
      "origin", "personality", "appearance", "affiliation", "realm",
    ];
    const NPC_NUMBER_FIELDS = ["age", "relation", "trust"];
    const NPC_PLACE_FIELDS = ["cityId", "location", "metAt"];
    if (NPC_TEXT_FIELDS.includes(field)) {
      if (!raw) return null;
      if (field === "memory") {
        // 旧事是一笔一笔攒的：新说的添在后头，只留最近四百字
        rel.memory = `${rel.memory ? `${rel.memory} ` : ""}${raw}`.slice(-400);
      } else {
        rel[field] = raw.slice(0, field === "name" || field === "title" ? 20 : 200);
      }
      return null; // 已直接处理
    }
    if (NPC_NUMBER_FIELDS.includes(field)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      if (field === "age") rel.age = Math.max(1, Math.min(299, Math.round(n)));
      else if (field === "relation") rel.relation = Math.max(-100, Math.min(100, Math.round(n)));
      else rel.trust = Math.max(1, Math.min(5, Math.round(n)));
      return null; // 已直接处理
    }
    if (field === "type") {
      const NPC_TYPES = ["dao_companion", "master", "disciple", "friend", "enemy"];
      const typeAliases: Record<string, string> = {
        道侣: "dao_companion", 师父: "master", 师尊: "master", 弟子: "disciple",
        徒弟: "disciple", 好友: "friend", 朋友: "friend", 仇敌: "enemy", 仇人: "enemy",
      };
      const t = NPC_TYPES.includes(raw) ? raw : typeAliases[raw];
      if (!t) return null;
      rel.type = t;
      return null; // 已直接处理
    }
    if (NPC_PLACE_FIELDS.includes(field)) {
      // 所在只认图上真有的城池，认不出便丢弃，绝不把行踪写到没有的地方
      const marker = resolveMarker(raw);
      if (!marker) return null;
      if (field === "cityId") rel.cityId = marker.id;
      else rel[field] = raw.slice(0, 40);
      return null; // 已直接处理
    }
    // 名录之外的人物字段不再一概打回：正文里若给他添了别的名目——生辰、绰号、喜好，
    // 写实了便照写，路由圈不圈都不作数，只守住「编号不容改写」这一条。
    if (field === "id" || !raw) return null;
    const prevValue = rel[field];
    if (typeof prevValue === "number") {
      const num = Number(raw);
      rel[field] = Number.isFinite(num) ? num : raw.slice(0, 200);
    } else {
      rel[field] = raw.slice(0, 200);
    }
    console.debug("[dataOps] 人物字段不在名录内，照实落账:", field);
    return null;
  }

  // 摧毁建筑：正文里本门某座建筑倾毁，路径写 demolish.<建筑名>，值随意。
  // 只在玩家本门里找这一座：自建的从 built 里摘掉；图上的须真在名册里立着，方记进 destroyed。
  // 主殿一律不毁；名册与自建里都没有的，整条丢弃——不准凭空毁一座不存在的，也不准拿它去拆别家的山门。
  if (normalizedPath.startsWith("demolish.")) {
    const name = normalizedPath.slice("demolish.".length).trim().replace(/["']/g, "");
    if (!name) return null;
    const sites: SectSite[] = Array.isArray(root?.sectSites) ? root.sectSites : [];
    const at = sites.findIndex((s) => s?.mine);
    if (at < 0) return null;
    // 主殿与传法大殿是硬约束，与分类目录里写的是同一句话
    if (isHardLockedPath(normalizedPath)) {
      console.warn("[dataOps] 硬约束不容违逆：", normalizedPath);
      return null;
    }
    const mine = sites[at];
    // 自建的：先在 built 里找，找着便摘掉
    const built = { ...(mine.built ?? {}) };
    let removedBuilt = false;
    for (const [key, val] of Object.entries(built)) {
      if (val === name) {
        delete built[key];
        removedBuilt = true;
      }
    }
    // 图上的：须真在本门山门名册里立着，且不是主殿
    const scene = getScene(sectSceneId(mine.id));
    const spot = scene ? sectBuildingRoster(scene).find((b) => b.name === name) : undefined;
    const canRaze = !!spot && spot.kindId !== "hall";
    if (!removedBuilt && !canRaze) return null;
    const destroyed = canRaze
      ? Array.from(new Set([...(mine.destroyed ?? []), name]))
      : mine.destroyed;
    root.sectSites = sites.map((s, i) => (i === at ? { ...mine, built, destroyed } : s));
    return null; // 已直接处理
  }

  // 机缘了结：路径写 quest.<机缘名>，值写「成了」「交差」或「不成」「误了」。
  // 成不成由叙事里那人说了算；该给的酬谢与该罚的，这里照单落账。
  if (normalizedPath.startsWith("quest.")) {
    const questName = normalizedPath.slice("quest.".length).trim();
    if (!questName) return null;
    // 判词只认说得明白的成与败：「未」「还没」只是没办完，不作误期
    const outcome = parseQuestOutcome(value);
    if (!outcome) return null;
    settleQuest(root, questName, outcome);
    return null; // 已直接处理
  }

  // 名声：四条各自落在 -100 到 100，路径写 reputation.<哪一条>，值写改后的数目。
  // 负数是坏名声，0 是无人识得；认不出是哪一条就丢弃，免得凭空多出一条没人认的名声。
  const repMatch = normalizedPath.match(/^reputation\.(.+)$/);
  if (repMatch) {
    const axis = reputationAxisByName(repMatch[1]);
    const next = Number(value);
    if (!axis || !Number.isFinite(next)) return null;
    return { path: `reputation.${axis}`, value: String(Math.max(-100, Math.min(100, Math.round(next)))) };
  }

  for (const [alias, actual] of Object.entries(FIELD_ALIASES)) {
    if (normalizedPath === `player.${alias}`) {
      normalizedPath = `player.${actual}`;
    }
  }
  // 处理 player.stats.spirit → player.stats.soul 等
  for (const [alias, actual] of Object.entries(STATS_ALIASES)) {
    if (normalizedPath === `player.stats.${alias}`) {
      normalizedPath = `player.stats.${actual}`;
    }
  }

  // 处理 player.realm "化神初期" → player.realmIndex 21
  if (normalizedPath === "player.realm") {
    const realmIdx = REALMS_LIST.indexOf(value.trim().replace(/["']/g, ""));
    if (realmIdx >= 0) {
      return { path: "player.realmIndex", value: String(realmIdx) };
    }
    return null;
  }

  // 处理 player.spiritRoots.dark 88 → 更新灵根数组
  const rootMatch = normalizedPath.match(/^player\.spiritRoots\.(\S+)$/);
  if (rootMatch) {
    const elementKey = ELEMENT_ALIASES[rootMatch[1]] || rootMatch[1];
    // 灵根只认这几行，模型编出来的「光」「混沌」之类一律丢掉
    if (!VALID_ELEMENTS.includes(elementKey)) return null;
    const roots = root?.player?.spiritRoots;
    if (Array.isArray(roots)) {
      const magnitude = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
      const rootItem = roots.find((r: any) => r.element === elementKey);
      if (rootItem) {
        rootItem.value = magnitude;
        return null; // 已直接处理
      } else {
        // 添加新的灵根
        roots.push({ element: elementKey, value: magnitude });
        return null;
      }
    }
  }

  // 处理 player.stats.heart "玩世不恭" → 更新心性数组
  if (normalizedPath === "player.stats.heart") {
    const heartVal = value.trim().replace(/["']/g, "");
    const stats = root?.player?.stats;
    if (stats) {
      if (!Array.isArray(stats.heartScores)) {
        stats.heartScores = [];
      }
      // 简单更新：如果已有心性条目则更新trait，否则新增
      if (stats.heartScores.length > 0) {
        stats.heartScores[0].trait = heartVal as any;
      } else {
        stats.heartScores.push({ trait: heartVal as any, score: 50, modifiers: [] });
      }
      return null;
    }
  }

  // 处理 player.meridians 90 (数值) → 更新所有经脉的clarity
  if (normalizedPath === "player.meridians") {
    const numVal = Number(value);
    if (!isNaN(numVal)) {
      const meridians = root?.player?.meridians;
      if (Array.isArray(meridians)) {
        meridians.forEach((m: any) => {
          m.clarity = Math.min(numVal, m.maxClarity || 100);
        });
        return null;
      }
    }
  }

  // 处理 player.body 1425 (数字) → 转为字符串
  if (normalizedPath === "player.body" || normalizedPath === "player.fortune") {
    return { path: normalizedPath, value: value.replace(/["']/g, "") };
  }

  return { path: normalizedPath, value };
}

/** 一家铺子的货架至多摆这些样：再多也摊不下，界面也读不过来 */
const SHOP_GOODS_MAX = 32;

/** 认一样要摆上货架的货：名号必写，价与存量照给，缺了便按常例补 */
function normalizeShopGood(
  raw: unknown,
): { name: string; base: number; stock: number; desc?: string; mystery?: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? r.good ?? "").trim();
  if (!name) return null;
  const base = Math.max(1, Math.min(999999, Math.round(Number(r.price ?? r.base) || 10)));
  const stock = Math.max(1, Math.min(999, Math.floor(Number(r.stock ?? r.count) || 1)));
  const desc = String(r.desc ?? "").trim();
  return {
    name: name.slice(0, 20),
    base,
    stock,
    ...(desc ? { desc: desc.slice(0, 60) } : {}),
    ...(r.mystery === true ? { mystery: true } : {}),
  };
}

/**
 * 叙事给某家铺子添货：照铺名在眼下各坊市里找那家铺子，
 * 已有的货便添存量，没有的便新上一样；铺名认不出的便作罢，不硬安在别家头上。
 * 铺面存在 markets 里，是对象不是数组，故不走 add 那条通用路子，单开这一处。
 */
function applyShopGoods(root: any, rawPayload: unknown): void {
  const payload = typeof rawPayload === "string" ? parseMarkdownBlockToJson(rawPayload) : rawPayload;
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;
  const shopName = String(p.shop ?? p.shopName ?? "").trim();
  if (!shopName) return;

  // 要上的是哪几样货：goods 数组，或单一样 good／top-level 那样
  const rawGoods: unknown[] = Array.isArray(p.goods)
    ? (p.goods as unknown[])
    : p.good && typeof p.good === "object"
      ? [p.good]
      : p.name && (p.price !== undefined || p.base !== undefined || p.stock !== undefined)
        ? [{ ...p, name: p.name }]
        : [];
  const goods = rawGoods.map(normalizeShopGood).filter((g) => g !== null);
  if (goods.length === 0) return;

  const markets = root?.markets;
  if (!markets || typeof markets !== "object") return;

  // 先在本城找那家铺子，找不到再全图找
  const cityId = String(root?.currentPlaceId ?? "");
  const allKeys = Object.keys(markets as Record<string, unknown>);
  const findKey = (list: string[]): string => {
    for (const key of list) {
      const market = (markets as Record<string, any>)[key];
      if ((market?.shops ?? []).some((s: any) => s?.name === shopName)) return key;
    }
    return "";
  };
  const targetKey = findKey(allKeys.filter((k) => k.startsWith(`${cityId}:`))) || findKey(allKeys);
  if (!targetKey) return;

  const market = (markets as Record<string, any>)[targetKey];
  const nextShops = (market.shops ?? []).map((shop: any) => {
    if (shop?.name !== shopName) return shop;
    const shelf: any[] = Array.isArray(shop.goods) ? shop.goods.map((g: any) => ({ ...g })) : [];
    for (const g of goods) {
      const at = shelf.findIndex((x) => x?.name === g.name);
      if (at >= 0) {
        shelf[at] = {
          ...shelf[at],
          stock: Math.max(0, Number(shelf[at].stock) || 0) + g.stock,
          base: g.base,
          ...(g.desc ? { desc: g.desc } : {}),
          ...(g.mystery ? { mystery: true } : {}),
        };
      } else {
        shelf.push({
          name: g.name,
          base: g.base,
          stock: g.stock,
          ...(g.desc ? { desc: g.desc } : {}),
          ...(g.mystery ? { mystery: true } : {}),
        });
      }
    }
    if (shelf.length > SHOP_GOODS_MAX) shelf.length = SHOP_GOODS_MAX;
    // 记下新的货架规模，隔日重新上货时不至于缩回旧数
    return { ...shop, goods: shelf, stockScale: Math.max(Number(shop.stockScale) || 0, shelf.length) };
  });

  root.markets = {
    ...(markets as Record<string, any>),
    [targetKey]: { ...market, shops: nextShops },
  };
}

/** 叙事里立一桩机缘：去处与接头人一并钉下，点名的去处没有便现开一处 */
function addQuestFromOp(root: any, payload: any): string | null {
  const arr = resolveCollection(root, "quests");
  const quest = normalizeQuest(payload, arr.length);
  if (!quest) return null;
  quest.day = quest.day || daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME));

  // 去处与要见的人一并由它定下：去处对得上本城或别城的街区便钉在那儿，
  // 人现掷一个钉在目标地块上；认不出去处的，才落在那一座城一处住人的地方。
  // 模型偶尔会在机缘里自写一个 target，同样不认，去处只从 place 现认
  const placeId = String(root?.currentPlaceId ?? "");
  const pinned = pinNarrativeQuest({
    quest: { ...quest, target: undefined },
    currentPlaceId: placeId,
    districtNames: root?.districtNames,
    culture: getMarker(placeId)?.culture,
    today: quest.day,
    adventures: Array.isArray(root?.adventures) ? (root.adventures as Adventure[]) : [],
    villages: Object.values((root?.villages ?? {}) as Record<string, Village>),
    sectSites: Array.isArray(root?.sectSites) ? (root.sectSites as SectSite[]) : [],
    // 叙事点名要找的人若已在尘缘里，便照那一位，不再另立一个同名的人
    known: Array.isArray(root?.relations) ? root.relations : [],
  });
  if (pinned.people.length > 0) {
    const relArr = resolveCollection(root, "relations");
    pinned.people.forEach((person) => {
      if (!relArr.some((r) => r?.id === person.id)) relArr.push(person);
    });
  }
  // 点名的地方舆图上没有、现开了一处：这一处也要一并落进舆图
  if (pinned.adventure) {
    const advArr = resolveCollection(root, "adventures");
    if (!advArr.some((a: any) => a?.id === pinned.adventure!.id)) advArr.push(pinned.adventure);
  }
  // 捎信捎物一类的事，托付时得把该带的东西真放进行囊
  attachQuestCarryItem(pinned.quest, resolveCollection(root, "inventory"));
  arr.push(pinned.quest);
  if (arr.length > 40) arr.splice(0, arr.length - 40);
  return pinned.quest.id;
}

/** 叙事里立一处奇遇：只落在预设点位上，就近归到一座城的一带 */
function addAdventureFromOp(root: any, payload: any): string | null {
  const arr = resolveCollection(root, "adventures");
  const adv = normalizeAdventure(payload, {
    state: root,
    preferCityId: String(root?.currentPlaceId ?? ""),
    day: daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME)),
    origin: "story",
  });
  if (!adv) return null;
  // 同一处点位或同一个名目的，不重复挂
  if (
    arr.some(
      (a: any) =>
        a?.id === adv.id ||
        (a?.sceneId === adv.sceneId && a?.x === adv.x && a?.y === adv.y && a?.status === "open"),
    )
  ) {
    return null;
  }
  arr.push(adv);
  if (arr.length > 12) arr.splice(0, arr.length - 12);
  return adv.id;
}

/** 叙事里定一场拍卖：只挂在已开市的宝物阁上，日子定在今日或往后 */
function addAuctionFromOp(root: any, payload: any): string | null {
  const found = findTreasureShop(root?.markets ?? {}, {
    shopName: String(payload?.shop ?? payload?.shopName ?? "").trim(),
  });
  if (!found) return null;
  const today = daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME));
  const wantedDay = Math.trunc(Number(payload?.day));
  const day = Math.max(today, Number.isFinite(wantedDay) && wantedDay > 0 ? wantedDay : today + 2);
  const wantedHour = Math.trunc(Number(payload?.hour));
  const arr = resolveCollection(root, "auctions");
  if (arr.some((a: any) => a?.shopId === found.shop.id && a?.day === day && a?.status === "open")) return null;
  const auction: Auction = {
    id: `auction-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    shopId: found.shop.id,
    shopName: found.shop.name,
    cityId: found.cityId,
    districtId: found.districtId,
    day,
    hour: Number.isFinite(wantedHour) ? Math.min(11, Math.max(0, wantedHour)) : 6,
    reason: String(payload?.reason ?? "").trim().slice(0, 40) || rollAuctionReason(),
    status: "open",
  };
  arr.push(auction);
  if (arr.length > 8) arr.splice(0, arr.length - 8);
  return auction.id;
}

/**
 * 传闻：一句话，可牵出一桩事。
 * 话里若带着机缘、去处或拍卖，先把那桩事立起来，再把它的 id 记在这句话上，
 * 日后在传闻面板里循着这话便能找去。
 */
function addRumorFromOp(root: any, payload: any): void {
  const text = String(payload?.text ?? "").trim();
  if (!text) return;
  const links: Record<string, string> = {};
  if (payload?.quest && typeof payload.quest === "object") {
    const id = addQuestFromOp(root, payload.quest);
    if (id) links.questId = id;
  }
  if (payload?.adventure && typeof payload.adventure === "object") {
    const id = addAdventureFromOp(root, payload.adventure);
    if (id) links.adventureId = id;
  }
  if (payload?.auction && typeof payload.auction === "object") {
    const id = addAuctionFromOp(root, payload.auction);
    if (id) links.auctionId = id;
  }
  const arr = resolveCollection(root, "rumors");
  const day = daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME));
  // 同一天里同一句话不记第二遍
  if (arr.some((r: any) => r?.text === text && Number(r?.day) === day)) return;
  const city = String(payload?.city ?? "").trim();
  arr.push({
    id: `rumor-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    text: text.slice(0, 120),
    source: String(payload?.source ?? "").trim().slice(0, 40) || "道听途说",
    ...(city ? { city: city.slice(0, 20) } : {}),
    day,
    ...links,
  });
  if (arr.length > 60) arr.splice(0, arr.length - 60);
}

function applyOne(root: any, op: DataOp): void {
  if (op.kind === "modify") {
    // 规范化路径和值
    const normalized = normalizeModifyPath(root, op.path, op.value);
    if (!normalized) return; // 已直接处理

    // 时间的加减要按时辰进位，不能照字面硬加：
    // 「+3日」落在月底若只加到 33 再折回，日子就白过了，故整份往后推
    if (normalized.path.startsWith("currentTime.") && op.op !== "=") {
      const field = normalized.path.slice("currentTime.".length);
      const hoursPer: Record<string, number> = { hour: 1, day: 12, month: 360, year: 4320 };
      const amount = Number(parseValue(normalized.value));
      const hours = hoursPer[field] ? amount * hoursPer[field] : 0;
      if (Number.isFinite(hours) && hours !== 0) {
        const now = normalizeGameTime(root.currentTime, OPENING_GAME_TIME);
        root.currentTime = shiftGameTime(now, op.op === "-" ? -hours : hours);
      }
      return;
    }

    const segs = parsePath(normalized.path);
    if (segs.length === 0) return;
    let parent: any = root;
    for (let i = 0; i < segs.length - 1; i++) {
      parent = descend(parent, segs[i]);
      if (parent == null) return;
      if (typeof parent !== "object") {
        console.warn("[applyOne] Path segment is not an object:", normalized.path, "at segment", i, "value:", parent);
        return;
      }
    }
    const last = segs[segs.length - 1];
    if (typeof parent !== "object" || parent === null) {
      console.warn("[applyOne] Parent is not an object for modify:", normalized.path);
      return;
    }
    const normalizedOp = { ...op, path: normalized.path, value: normalized.value };
    // 境界只升不降：叙事偶尔把高境界写回低境界，甚至给出「境界下跌」的由头。
    // 已经修到的境界不该因一笔回写而倒退；要调便照加减法，绝对值只取不小于当前的那个
    if (normalizedOp.path === "player.realmIndex" && normalizedOp.op === "=") {
      const cur = Number(root?.player?.realmIndex) || 0;
      const want = Math.trunc(Number(normalizedOp.value));
      if (Number.isFinite(want) && want < cur) {
        console.warn(`[dataOps] 境界不容倒退：叙事欲将 realmIndex 由 ${cur} 改作 ${want}，已照旧守回 ${cur}`);
        normalizedOp.value = String(cur);
      }
    }
    // 性别是开局定下的，叙事回写把男女写反了也不许改：档案里这一项不随文气走。
    // 这类硬锁一律照分类目录判定，锁的名单只有一份
    if (isHardLockedPath(normalizedOp.path)) {
      console.warn("[dataOps] 硬约束不容违逆：叙事欲改动", normalizedOp.path, "，已略过");
      return;
    }
    applyModify(parent, last, normalizedOp);
  } else if (op.kind === "add") {
    // 给某家铺子添货：铺面存在 markets 里，是对象不是数组，故不走下面的通用路子
    if (op.collection === "shop.goods") {
      applyShopGoods(root, op.payload);
      return;
    }
    const arr = resolveCollection(root, op.collection);
    if (!Array.isArray(arr)) {
      console.warn("[applyOne] Collection is not an array:", op.collection);
      return;
    }
    if (arr.length > 1000) {
      console.warn("[applyOne] Collection too large, skipping add:", op.collection);
      return;
    }
    const payload = typeof op.payload === "string" ? parseMarkdownBlockToJson(op.payload) : op.payload;
    if (op.collection === "techniques" || op.collection === "inventory" || op.collection === "relations") {
      console.debug("[dataOps] ADD", op.collection, "payload parsed:", typeof payload, "id:", (payload as any)?.id, "keys:", payload && typeof payload === "object" ? Object.keys(payload) : "N/A");
    }
    if (op.collection === "log") {
      const text = typeof payload === "string"
        ? payload
        : (payload as any).text || (payload as any).desc || JSON.stringify(payload);
      arr.push(text);
    } else {
      if (op.collection === "techniques") {
        arr.push(normalizeTechnique(payload));
      } else if (op.collection === "inventory") {
        // 模型偶尔只丢来一个名目字串；认作杂物收下，别让买来的东西凭空没了
        const rawItem = typeof payload === "string" ? { name: payload } : payload;
        const named =
          rawItem && typeof rawItem === "object" && !String((rawItem as any).name ?? "").trim()
            ? {
                ...rawItem,
                name:
                  String((rawItem as any).text ?? (rawItem as any).desc ?? (rawItem as any).description ?? "")
                    .trim()
                    .slice(0, 30) || "无名之物",
              }
            : rawItem;
        arr.push(normalizeItemElements(named));
      } else if (op.collection === "sect.modifiers") {
        // 宗门修正：只认名录里的 id，名目与生效到哪一日由系统照名录补齐，模型自造的作废
        const spec = makeModifier(
          String((payload as any)?.id ?? ""),
          daySerial(root.currentTime ?? OPENING_GAME_TIME),
          Number((payload as any)?.days),
        );
        if (spec) arr.push(spec);
      } else if (op.collection === "pacts") {
        // 叙事里与某人当面说定的一桩事：记进福缘的「约定」，到日子由玩家自己去践
        const src =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};
        const name = String(src.name ?? src.title ?? "").trim().slice(0, 20);
        if (!name) return;
        const giverName = String(src.giver ?? src.person ?? src.npc ?? "").trim().slice(0, 20) || "某人";
        // 托付人若在尘缘里认得出，便照他的编号记下，误期时才好折那一份人情
        const rel = (Array.isArray(root?.relations) ? root.relations : []).find(
          (r: any) => String(r?.name ?? "").trim() === giverName,
        );
        // 同一桩事只立一次：名目与托付人都对得上的未了之约，不再添一条
        if (arr.some((p: any) => p?.status === "open" && p?.name === name && p?.giver === giverName)) return;
        const days = Math.trunc(Number(src.days));
        const pact = normalizePact(
          {
            name,
            place: src.place,
            days: Number.isFinite(days) && days > 0 ? Math.min(720, days) : undefined,
            desc: src.desc ?? src.description,
          },
          { id: String(rel?.id ?? src.giverId ?? ""), name: giverName },
          {
            cityId: String(root?.currentPlaceId ?? ""),
            districtId: Number.isFinite(Number(src.districtId)) ? Number(src.districtId) : undefined,
          },
          daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME)),
        );
        if (pact) arr.push(pact);
      } else if (op.collection === "manorPlots") {
        // 叙事里得的一处宅地：名号与所在照写，7×7 一律从空地起；
        // 没写落在哪一格，便在所在城池的空地里挑一格，城图上多出一座院子。
        // 开局祖宅、师门分下的住处这类本就有屋的，payload 带 built，院里另起正房与两间厢房
        const place = String((payload as any)?.place ?? "无名之地");
        const input = {
          place,
          cityId: (payload as any)?.cityId,
          districtId: (payload as any)?.districtId,
        };
        const cell = assignManorCell(input, arr as { cityId?: string; districtId?: number }[]);
        const spot = {
          place,
          cityId: cell.cityId ?? input.cityId,
          districtId: cell.districtId ?? input.districtId,
        };
        arr.push((payload as any)?.built ? readyBuiltPlot(spot) : emptyPlot(spot));
      } else if (op.collection === "news.items") {
        const ct = normalizeGameTime(root.currentTime, OPENING_GAME_TIME);
        const todayKey = gameDateKey(ct);
        const todayStr = formatGameTime(ct);
        if (!root.news) root.news = { items: [], lastUpdate: "" };
        if (root.news.lastUpdate !== todayKey) {
          arr.length = 0;
          root.news.lastUpdate = todayKey;
        }

        const validCategories = ["官府公告", "宗门布告", "市井传言"];
        let itemsToAdd: any[] = [];

        if (typeof payload === "string") {
          const lines = payload.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            const colonIdx = line.indexOf(":");
            if (colonIdx > 0) {
              const category = line.slice(0, colonIdx).trim();
              const content = line.slice(colonIdx + 1).trim();
              if (content) {
                const matchedCat = validCategories.find((c) => category.includes(c)) || category || "市井传言";
                itemsToAdd.push({
                  category: matchedCat,
                  content: content,
                });
              }
            }
          }
        } else {
          itemsToAdd = [normalizeNewsItem(payload)];
        }

        for (const item of itemsToAdd) {
          const normalized = normalizeNewsItem(item);
          const catCount = arr.filter((x: any) => x.category === normalized.category).length;
          if (catCount >= 3) continue;
          normalized.date = todayStr;
          arr.push(normalized);
        }
      } else if (op.collection === "relations") {
        arr.push(normalizeRelation(payload));
      } else if (op.collection === "player.buffs") {
        // 名目不在名录里就丢掉，不往身上添一条程序算不出的状态
        const buff = normalizeBuff(payload, root);
        if (!buff) return;
        arr.push(buff);
      } else if (op.collection === "player.shields") {
        arr.push(normalizeShield(payload));
      } else if (op.collection === "skills") {
        arr.push(normalizeSkill(payload ?? {}, arr.length));
      } else if (op.collection === "checks") {
        // 判定要掷骰，掷出来的结果一并记下；掷不成就不写这一条
        const check = rollCheck(payload, root);
        if (!check) return;
        arr.push(check);
        if (arr.length > 20) arr.splice(0, arr.length - 20);
        root.skills = trainOnceADay(
          Array.isArray(root.skills) ? root.skills : [],
          check.skill,
          check.success,
          check.day,
          root.checks,
        );
      } else if (op.collection === "quests") {
        addQuestFromOp(root, payload);
      } else if (op.collection === "adventures") {
        addAdventureFromOp(root, payload);
      } else if (op.collection === "auctions") {
        addAuctionFromOp(root, payload);
      } else if (op.collection === "rumors") {
        addRumorFromOp(root, payload);
      } else if (op.collection === "sectSites") {
        // 本门不必另立：本门由舆图上就近的一处认领，另立一处便成了两处同名。
        // 名号只差末尾一个字（白鹿涧与白鹿院）也算同一处，不必另立
        const siteName = String((payload as { name?: unknown })?.name ?? "").trim();
        const mineName = String(root?.sect?.name ?? root?.player?.sectName ?? "").trim();
        if (siteName && mineName && (siteName === mineName || sectNameCore(siteName) === sectNameCore(mineName))) {
          return;
        }
        // 叙事里点了名、舆图上却没有的宗门：照它自述的信息现立一处，
        // 并当场把那张山门图注册上，好点得进去
        const site = composeSectSite(
          payload ?? {},
          arr as SectSite[],
          getMarker(String(root?.currentPlaceId ?? ""))?.culture,
        );
        if (!site) return;
        arr.push(site);
        registerSectScenes([site]);
      } else if (op.collection === "sectRelations") {
        // 宗门间的交情对称记一条：同一对宗门再来一笔便改旧的，不另添
        const rel = normalizeSectRelation(
          payload,
          daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME)),
        );
        if (!rel) return;
        const at = arr.findIndex((x: any) => x?.id === rel.id);
        if (at >= 0) arr[at] = { ...arr[at], ...rel };
        else arr.push(rel);
      } else if (op.collection === "occupations") {
        // 城村的归属：叙事与新闻照名号写，这里认成编号
        const raw = (payload ?? {}) as Record<string, unknown>;
        const kind = raw.kind === "village" ? "village" : raw.kind === "city" ? "city" : null;
        const targetName = String(raw.targetName ?? raw.name ?? "").trim();
        const ownerName = String(raw.ownerName ?? raw.sect ?? "").trim();
        if (!kind || !targetName || !ownerName) return;
        // 占的是哪一处：城照标点名号找，村照村名找
        const targetId =
          kind === "city"
            ? getCityMarkers().find((m) => m.name === targetName)?.id ?? ""
            : findVillageKeyByName(root, targetName) ?? "";
        if (!targetId) return;
        // 占家是哪一处宗门：本门也照名号认
        const owner =
          (Array.isArray(root?.sectSites) ? root.sectSites : []).find(
            (s: any) => s?.name === ownerName,
          ) ?? null;
        if (!owner) return;
        const now = normalizeGameTime(root?.currentTime, OPENING_GAME_TIME);
        const occ = normalizeOccupation({
          kind,
          targetId,
          targetName,
          ownerSectId: owner.id,
          ownerName: owner.name,
          sinceDay: daySerial(now),
          settledMonth: gameMonthKey(now),
        });
        if (!occ) return;
        const key = `${occ.kind}:${occ.targetId}`;
        const occAt = arr.findIndex((x: any) => x && `${x.kind}:${x.targetId}` === key);
        if (occAt >= 0) arr[occAt] = { ...arr[occAt], ...occ };
        else arr.push(occ);
      } else if (op.collection.startsWith("sect.")) {
        arr.push(normalizeSectEntry(op.collection, payload));
      } else if (op.collection === "player.meridians") {
        arr.push(normalizeMeridian(payload));
      } else if (op.collection === "player.timeline") {
        arr.push(normalizeTimelineEvent(payload));
      } else {
        arr.push(payload);
      }
    }
  } else if (op.kind === "delete") {
    const arr = resolveCollection(root, op.collection);
    if (!Array.isArray(arr) || arr.length === 0) return;
    if (typeof arr[0] === "object" && arr[0] !== null) {
      const idx = arr.findIndex(
        (x: any) => String(x?.id) === op.id || String(x?.name) === op.id,
      );
      if (idx !== -1) arr.splice(idx, 1);
    } else {
      const idx = arr.findIndex((x: unknown) => String(x) === op.id);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }
}

function descend(obj: any, seg: PathSeg): any {
  if (typeof seg === "string") {
    return obj?.[seg];
  }
  if (seg.type === "array" && Array.isArray(obj)) {
    return obj.find((item: any) => item && String(item.id) === seg.id);
  }
  return undefined;
}

/** 经脉部位：界面按英文区名渲染，这里把中文别名统一映射过去 */
const MERIDIAN_ZONE_MAP: Record<string, MeridianZone> = {
  head: "head", chest: "chest", abdomen: "abdomen",
  arm_left: "arm_left", arm_right: "arm_right", leg_left: "leg_left", leg_right: "leg_right",

  "头": "head", "头部": "head", "脑": "head", "神魂": "head", "神识": "head",
  "胸": "chest", "胸部": "chest", "躯干": "chest", "心肺": "chest", "心脉": "chest",
  "腹": "abdomen", "腹部": "abdomen", "丹田": "abdomen", "气海": "abdomen",
  "左臂": "arm_left", "左手": "arm_left", "左臂脉": "arm_left",
  "右臂": "arm_right", "右手": "arm_right", "右臂脉": "arm_right",
  "左腿": "leg_left", "左脚": "leg_left", "左腿脉": "leg_left",
  "右腿": "leg_right", "右脚": "leg_right", "右腿脉": "leg_right",
};

/** 部位缺失或无法识别时，按经脉名称里的关键词兜底，避免数据存在却在界面上完全看不到 */
function inferMeridianZone(name: string): MeridianZone {
  if (/[腿足膝踝股]/.test(name)) {
    if (/左/.test(name)) return "leg_left";
    if (/右/.test(name)) return "leg_right";
    return "leg_right";
  }
  if (/[手臂肘腕指掌]/.test(name)) {
    if (/左/.test(name)) return "arm_left";
    if (/右/.test(name)) return "arm_right";
    return "arm_right";
  }
  if (/[头脑神]/.test(name)) return "head";
  if (/[腹丹气海]/.test(name)) return "abdomen";
  return "chest";
}

function normalizeMeridian(item: any): any {
  if (!item || typeof item !== "object") return item;

  const rawZone = String(item.zone ?? "").trim();
  let zone: string = MERIDIAN_ZONE_MAP[rawZone] ?? "";
  if (!zone) {
    zone = inferMeridianZone(String(item.name ?? ""));
    console.warn(`[dataOps] 经脉「${item.name ?? "未命名"}」部位「${rawZone || "缺失"}」无法识别，已归入 ${zone}`);
  }

  const clarity = Number(item.clarity);
  const maxClarity = Number(item.maxClarity);

  return {
    ...item,
    zone,
    clarity: Number.isFinite(clarity) ? clarity : 0,
    maxClarity: Number.isFinite(maxClarity) && maxClarity > 0 ? maxClarity : 100,
    damage: Boolean(item.damage),
  };
}

/** 宗门下的职位/任务/商店/底蕴/仓库条目至少要保证有 id，否则界面上的晋升与兑换按钮会失效 */
function normalizeSectEntry(collection: string, item: any): any {
  if (!item || typeof item !== "object") return item;
  const next = { ...item };
  if (!next.id) {
    const kind = collection.split(".")[1] || "sect";
    next.id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }
  return next;
}

function normalizeTimelineEvent(item: any): any {
  if (!item || typeof item !== "object") return item;
  // 模型偶尔会把字段写成 time/event 之类的别名，统一成 {year,title,detail}
  return {
    year: String(item.year ?? item.time ?? item.date ?? ""),
    title: String(item.title ?? item.name ?? item.event ?? ""),
    detail: String(item.detail ?? item.desc ?? item.description ?? item.content ?? ""),
  };
}

function applyModify(parent: any, key: PathSeg, op: Extract<DataOp, { kind: "modify" }>): void {
  if (typeof key !== "string") {
    console.warn("[applyModify] Last segment cannot be an array index:", key);
    return;
  }

  const current = parent[key];
  if (op.op === "=") {
    let value = parseValue(op.value);

    if (key === "spiritRoots" && typeof value === "object" && value !== null && !Array.isArray(value)) {
      value = Object.entries(value).map(([element, val]) => ({
        element,
        value: Number(val),
      }));
    }

    if (key === "meridians" && Array.isArray(value)) {
      value = value.map((m: any) => ({
        ...m,
        damage: Boolean(m.damage),
      }));
    }

    parent[key] = value;
  } else if (op.op === "+") {
    if (typeof current === "number") {
      parent[key] = current + Number(parseValue(op.value));
    } else if (typeof current === "string") {
      const v = parseValue(op.value);
      parent[key] = current + String(v);
    } else {
      parent[key] = parseValue(op.value);
    }
  } else if (op.op === "-") {
    if (typeof current === "number") {
      parent[key] = current - Number(parseValue(op.value));
    }
  }
}

function formatValue(value: string): string {
  const parsed = parseValue(value);
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return "[]";
    if (parsed.length <= 3) {
      return parsed.map((item) => {
        if (typeof item === "object" && item !== null) {
          const keys = Object.keys(item);
          if (keys.includes("name")) return item.name;
          if (keys.includes("element")) return `${item.element}${item.grade}`;
          if (keys.includes("id")) return item.id;
          return String(item).slice(0, 20);
        }
        return String(item);
      }).join(", ");
    }
    return `[${parsed.length}项]`;
  }
  if (typeof parsed === "object" && parsed !== null) {
    const keys = Object.keys(parsed);
    if (keys.length <= 3) {
      return keys.map((k) => `${k}:${parsed[k]}`).join(", ");
    }
    return `{${keys.length}个字段}`;
  }
  return String(parsed);
}

export function summarizeOps(ops: DataOp[]): string[] {
  return ops.map((op) => {
    if (op.kind === "modify") {
      const sign = op.op === "+" ? "+" : op.op === "-" ? "-" : "=";
      const formattedValue = formatValue(op.value);
      return `${op.path} ${sign} ${formattedValue}`;
    }
    if (op.kind === "add") {
      return `新增 ${op.collection}`;
    }
    if (op.kind === "buy") {
      return `买下 ${op.name}（${op.price}）`;
    }
    return `移除 ${op.collection} ${op.id}`;
  });
}

/** 一处增删的写法：得着的写绿，折了的写红，说不清的写平 */
export type OpChangeTone = "gain" | "loss" | "flat";

export interface OpChange {
  text: string;
  tone: OpChangeTone;
}

/** 各类路径写给人看的名字；表外的一律照原路径写，至少不算漏报 */
const OP_PATH_LABEL: Record<string, string> = {
  "player.hp": "气血",
  "player.hpMax": "气血上限",
  "player.mp": "灵力",
  "player.mpMax": "灵力上限",
  "player.spirit": "神识",
  "player.spiritMax": "神识上限",
  "player.cultivation": "修为",
  "player.realmIndex": "境界",
  "player.realmStage": "境界层次",
  "player.age": "年岁",
  "player.lifespanCurrent": "余寿",
  "player.lifespanMax": "寿元上限",
  "player.karma": "业力",
  "player.body": "体魄",
  "player.fortune": "气运",
  "player.personality": "性情",
  "player.description": "形貌",
  "player.background": "出身",
  "player.name": "姓名",
  "player.title": "称号",
  "player.stats.vitality": "体魄",
  "player.stats.soul": "神魂",
  "player.stats.wisdom": "悟性",
  "player.stats.agility": "身法",
  "player.spiritStones.low": "下品灵石",
  "player.spiritStones.mid": "中品灵石",
  "player.spiritStones.high": "上品灵石",
  "reputation.righteous": "正道名声",
  "reputation.demonic": "魔道名声",
  "reputation.folk": "平民名声",
  "reputation.official": "官府名声",
  currentPlaceId: "所在之地",
  currentLocation: "所在之处",
  village: "到访村落",
};

/** 各类集合写给人看的名字 */
const OP_COLLECTION_LABEL: Record<string, string> = {
  inventory: "物品",
  techniques: "功法",
  skills: "本事",
  relations: "尘缘",
  quests: "机缘",
  adventures: "奇遇",
  pacts: "约定",
  "news.items": "见闻",
  "player.meridians": "经脉",
  "player.buffs": "状态",
  "player.shields": "护体",
  "player.timeline": "生平",
  "sect.tasks": "宗门差事",
  sectRelations: "宗门关系",
  occupations: "城村归属",
};

/** 行文里的脚手架，不算玩家在意的数据变化，末尾不报 */
const QUIET_OP_PATH = /^(currentTime|district\.|price\.|check\.|demand|news\.)/;

/** 同上，只是这些脚手架走的是 add 而不是 modify */
const QUIET_OP_COLLECTION = new Set(["checks", "price", "demand", "district"]);

/** 光写一个语气助词的值等于没写，列出来只会是「某某 变为了」这样的半句话 */
const TAIL_PARTICLE_ONLY = /^[了的着过罢吧呢啊吗]$/;

/** 随身物件路径里那截字段名，写成人话 */
const INVENTORY_FIELD_LABEL: Record<string, string> = {
  count: "数量",
  quality: "品相",
  durability: "耐久",
  element: "属性",
};

/** 认得出的名字才往「」里搁：模型偶尔自造 item_fasting_pill 这类拉丁串，写出来白占地方 */
function readableEntryId(id: string): string {
  return /[\u4e00-\u9fa5]/.test(id) ? id : "";
}

/**
 * 把一条路径写成人话。表里点过名的照表写；表外的按前缀认一认（机缘、随身物件、宗门），
 * 认不出的才照原样写出来——至少不会把 quest.xxx、inventory[xxx].count 这类内部键名直愣愣摆给玩家看。
 */
function opPathLabel(path: string): string {
  const named = OP_PATH_LABEL[path];
  if (named) return named;

  const quest = /^quests?\.(.+)$/.exec(path);
  if (quest) return `机缘「${quest[1]}」`;

  const inventory = /^inventory\[(.+?)\](?:\.(.+))?$/.exec(path);
  if (inventory) {
    const id = readableEntryId(inventory[1]);
    const field = inventory[2] ? INVENTORY_FIELD_LABEL[inventory[2]] ?? "" : "";
    return `随身之物${id ? `「${id}」` : ""}${field ? ` ${field}` : ""}`;
  }

  const sect = /^sect\.(.+)$/.exec(path);
  if (sect) return `宗门 · ${sect[1]}`;

  return path;
}

/** 从一条增删的 payload 里挑一个写给人看的名字 */
function entryName(payload: unknown): string {
  let data = payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return "";
    }
  }
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  for (const key of ["name", "title", "label"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * 把这一回合的数据操作写成给人看的话。
 * 界面照 tone 上色：得着的绿、折了的红、说不清的平。
 */
export function describeOps(ops: DataOp[]): OpChange[] {
  const changes: OpChange[] = [];
  for (const op of Array.isArray(ops) ? ops : []) {
    if (op.kind === "add") {
      if (QUIET_OP_COLLECTION.has(op.collection)) continue;
      const label = OP_COLLECTION_LABEL[op.collection] ?? op.collection;
      const name = entryName(op.payload);
      changes.push({ text: `新增 ${label}${name ? `「${name}」` : ""}`, tone: "gain" });
      continue;
    }
    if (op.kind === "delete") {
      if (QUIET_OP_COLLECTION.has(op.collection)) continue;
      const label = OP_COLLECTION_LABEL[op.collection] ?? op.collection;
      const id = readableEntryId(String(op.id ?? ""));
      changes.push({ text: `失去 ${label}${id ? `「${id}」` : ""}`, tone: "loss" });
      continue;
    }
    if (op.kind === "buy") {
      changes.push({
        text: `买下 ${op.what === "manor" ? "宅地" : "物件"}「${op.name}」（${op.price}）`,
        tone: "gain",
      });
      continue;
    }

    const path = String(op.path || "").trim();
    // 空路径、脚手架路径、以及模型把整句话写成路径的（如「quest.某某 变为了」）都不值得摆出来；
    // 正经路径里不会有空白
    if (!path || QUIET_OP_PATH.test(path) || /\s/.test(path)) continue;

    const value = formatValue(op.value);
    // 没写出值的那几条本就残缺，宁可不报，也别在界面上留半句话；
    // 模型偶尔还把「变为」的值写成一个语气助词（「了」），一并当作没写
    if (!value.trim() || TAIL_PARTICLE_ONLY.test(value.trim())) continue;

    const label = opPathLabel(path);
    if (op.op === "+") changes.push({ text: `${label} +${value}`, tone: "gain" });
    else if (op.op === "-") changes.push({ text: `${label} -${value}`, tone: "loss" });
    else changes.push({ text: `${label} 变为 ${value}`, tone: "flat" });
  }
  return changes;
}
