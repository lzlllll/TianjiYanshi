import type {
  DataOp,
  GameState,
  GameTime,
  BattleEntity,
  BuffDurationType,
  InventoryItem,
  MeridianZone,
  PriceAdjust,
  Quest,
  SectSite,
  SectWarBrief,
  Skill,
  SkillCheck,
} from "@/data/types";
import { REALM_NAMES } from "@/data/mockData";
import { getCityMarkers, getDistricts, getMarker, getScene, registerSectScenes, resolveMarker, sectSceneId } from "@/data/map";
import { sectBuildingRoster } from "@/data/map/sectBuildings";
import { composeSectSite } from "@/data/sectSites";
import { normalizeSectRelation } from "@/data/sectRelations";
import { normalizeOccupation } from "@/data/occupations";
import { resolveLocation } from "@/data/locations";
import { isKnownGood } from "@/data/goods";
import { findSkill, normalizeSkill, rollSkillCheck, trainOnceADay } from "@/data/skills";
import { normalizeReputation, reputationAxisByName } from "@/data/reputation";
import { applyQuestLedger, holdRewardOutcome, normalizeQuest, type QuestLedgerTarget } from "@/data/quests";
import { pinNarrativeQuest } from "@/data/broker";
import { normalizeAdventure } from "@/data/adventures";
import { emptyPlot } from "@/data/manors";
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

const MAX_TOTAL_OPS = 200;

export interface ParsedTurn {
  narrative: string;
  ops: DataOp[];
  opsRaw: string;
  mode: string | null;
  battleEntities: BattleEntity[] | null;
  /** 战斗里这一柱香烧到的进度；没报就是 null */
  battleIncense: number | null;
  quickDecisions: string[];
  /** 这一轮由叙事挑起的宗门战；没挑起便是 null */
  sectWar: SectWarBrief | null;
}

const MODE_START = "<<<MODE>>>";
const MODE_END = "<<<END>>>";

export function parseModelOutput(raw: string): ParsedTurn {
  let text = raw.replace(/```[a-zA-Z]*\n?/g, "");

  let mode: string | null = null;
  const modeStartIdx = text.indexOf(MODE_START);
  if (modeStartIdx !== -1) {
    const afterModeStart = text.slice(modeStartIdx + MODE_START.length);
    const modeEndIdx = afterModeStart.indexOf(MODE_END);
    if (modeEndIdx !== -1) {
      mode = afterModeStart.slice(0, modeEndIdx).trim();
      text = text.slice(0, modeStartIdx) + afterModeStart.slice(modeEndIdx + MODE_END.length);
    }
  }

  let battleEntities: BattleEntity[] | null = null;
  let battleIncense: number | null = null;
  let battleNarrative = "";
  const battleStartIdx = text.indexOf(BATTLE_START);
  if (battleStartIdx !== -1) {
    const afterBattleStart = text.slice(battleStartIdx + BATTLE_START.length);
    const battleEndIdx = afterBattleStart.indexOf(END_MARKER);
    if (battleEndIdx !== -1) {
      const battleContent = afterBattleStart.slice(0, battleEndIdx);
      battleEntities = parseBattleEntities(battleContent);
      battleIncense = parseBattleIncense(battleContent);
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
  return { narrative, ops, opsRaw: opsRaw.trim(), mode, battleEntities, battleIncense, quickDecisions, sectWar };
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

/** 从战斗块中取出 -- incense: 45 这一行，认作本柱香已烧到的进度 */
function parseBattleIncense(content: string): number | null {
  const match = content.match(/^--\s*incense:\s*(-?\d+(?:\.\d+)?)/m);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
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

type JsonOpKind = "modify" | "add" | "delete";

const JSON_KIND_ALIASES: { pattern: RegExp; kind: JsonOpKind }[] = [
  { pattern: /^(modify|update|set|change)$/i, kind: "modify" },
  { pattern: /^(add|append|create|insert|new)$/i, kind: "add" },
  { pattern: /^(delete|remove|del|drop)$/i, kind: "delete" },
];

/** 把 JSON payload 归一化为 applyOne 可消费的字符串或对象 */
function normalizeJsonPayload(payload: any): string | Record<string, unknown> {
  if (typeof payload === "string") return payload;
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return JSON.stringify(payload);
}

/** 把单条 JSON 操作归一化为 DataOp */
function normalizeJsonOp(item: any): DataOp | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const rawKind = String(
    item.kind ?? item.type ?? item.action ?? item.operation ?? item.opType ?? "",
  ).trim();

  let kind: JsonOpKind | "" = "";
  for (const alias of JSON_KIND_ALIASES) {
    if (alias.pattern.test(rawKind)) {
      kind = alias.kind;
      break;
    }
  }
  if (!kind) {
    if (/修改|变更|更新/.test(rawKind)) kind = "modify";
    else if (/新增|添加|获得/.test(rawKind)) kind = "add";
    else if (/删除|移除|失去/.test(rawKind)) kind = "delete";
    else if (item.path !== undefined) kind = "modify";
    else if (item.collection === undefined) return null;
    else if (item.id !== undefined && item.payload === undefined && item.data === undefined && item.item !== undefined) kind = "delete";
    else kind = "add";
  }

  if (kind === "modify") {
    const path = String(item.path ?? item.key ?? "").trim();
    if (!path) return null;
    let operator = String(item.op ?? item.operator ?? "=").trim();
    if (operator !== "+" && operator !== "-") operator = "=";
    const rawValue = item.value ?? item.val ?? "";
    const value = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue ?? "");
    return { kind: "modify", path, op: operator as "=" | "+" | "-", value };
  }

  if (kind === "add") {
    const collection = String(item.collection ?? item.target ?? item.into ?? "").trim();
    if (!collection) return null;
    const payload = item.payload ?? item.data ?? item.item ?? item.value;
    if (payload === undefined || payload === null) return null;
    return { kind: "add", collection, payload: normalizeJsonPayload(payload) };
  }

  const collection = String(item.collection ?? item.target ?? item.from ?? "").trim();
  const id = String(item.id ?? item.itemId ?? item.key ?? "").trim();
  if (!collection || !id) return null;
  return { kind: "delete", collection, id };
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

  const container: any = Array.isArray(parsed) ? { ops: parsed } : parsed;
  const rawOps: any[] = Array.isArray(container.ops)
    ? container.ops
    : Array.isArray(container.operations)
      ? container.operations
      : Array.isArray(container.changes)
        ? container.changes
        : [];

  const ops: DataOp[] = [];
  for (const item of rawOps.slice(0, MAX_TOTAL_OPS)) {
    const op = normalizeJsonOp(item);
    if (op) ops.push(op);
  }

  const rawQuick =
    container.quickDecisions ?? container.quick_decisions ?? container.quick ?? container.suggestions;
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

export function applyOpsToState(state: GameState, ops: DataOp[]): GameState {
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
  };

  const oldDateKey = state.currentTime ? gameDateKey(state.currentTime) : "";

  let addCount = 0, modifyCount = 0, deleteCount = 0;
  for (const op of limitedOps) {
    try {
      if (op.kind === "add") addCount++;
      else if (op.kind === "modify") modifyCount++;
      else if (op.kind === "delete") deleteCount++;
      applyOne(next, op);
    } catch (e) {
      console.warn("[dataOps] 操作失败，已跳过:", op, e);
    }
  }

  // 时间是模型给的值，写回前统一夹一遍：时辰认名也认数，月日夹在合法区间
  next.currentTime = normalizeGameTime(next.currentTime, state.currentTime ?? OPENING_GAME_TIME);

  const newDateKey = next.currentTime ? gameDateKey(next.currentTime) : "";

  if (newDateKey && oldDateKey && newDateKey !== oldDateKey) {
    if (!next.news) next.news = { items: [], lastUpdate: "" };
    if (next.news.lastUpdate !== newDateKey) {
      next.news.items = [];
      next.news.lastUpdate = newDateKey;
      console.debug("[dataOps] 跨天检测：日期从", oldDateKey, "变为", newDateKey, "，已清空旧闻");
    }
  }

  console.debug("[dataOps] Ops applied — ADD:", addCount, "MODIFY:", modifyCount, "DELETE:", deleteCount, "techniques.length:", next.techniques?.length);
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
      return {
        id: s.id || `sk_${item.id}_${idx}`,
        name: s.name || `技能${idx + 1}`,
        description: s.description || s.desc || "",
        levelRequired: typeof s.rank === "number" ? s.rank : (idx === 0 ? 3 : idx === 1 ? 6 : 10),
        mpCost: typeof s.mpCost === "number" ? s.mpCost : 20 + idx * 15,
        damage: typeof s.damage === "number" ? s.damage : 20 + idx * 25,
        cooldown: typeof s.cooldown === "number" ? s.cooldown : 3 + idx,
        effects: s.effects || [],
        debuffDuration,
      };
    });
  }

  if (!item.prerequisites || !Array.isArray(item.prerequisites)) {
    item.prerequisites = [];
  }

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

  // 行囊条目的类别与品阶只认这几样，模型写的别称一律归到最普通的那一档
  const ITEM_TYPES = ["材料", "丹药", "符箓", "法宝", "杂物", "灵兽"];
  const ITEM_GRADES = ["凡品", "灵品", "玄品", "天品", "仙品"];
  const TYPE_ALIASES: Record<string, string> = {
    药材: "材料", 矿石: "材料", 丹药: "丹药", 药: "丹药", 符: "符箓", 法器: "法宝",
    兵器: "法宝", 宝物: "法宝", 灵宝: "法宝", 物品: "杂物", 杂物: "杂物",
  };
  if (!ITEM_TYPES.includes(item.type)) {
    item.type = TYPE_ALIASES[String(item.type ?? "").trim()] || "杂物";
  }
  if (!ITEM_GRADES.includes(item.grade)) {
    item.grade = "凡品";
  }
  const count = Math.trunc(Number(item.count));
  item.count = Number.isFinite(count) && count > 0 ? Math.min(999, count) : 1;
  if (!item.id) item.id = `i-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  if (typeof item.name !== "string" || !item.name.trim()) item.name = "无名之物";
  if (typeof item.desc !== "string") item.desc = "";
  if (typeof item.icon !== "string" || !item.icon) item.icon = item.name.charAt(0);

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

/** 机缘的名字对得上就算它：全名相同，或者一头包含另一头 */
function questMatches(quest: Quest, asked: string): boolean {
  return quest.name === asked || asked.includes(quest.name) || quest.name.includes(asked);
}

/**
 * 把一桩机缘了结掉：改状态、记一笔结果，再照单把酬谢或责罚兑成实数。
 * 只动还开着的那一桩，了结过的再写也不再生效。
 */
function settleQuest(root: any, name: string, status: "done" | "failed"): void {
  const quests: Quest[] = Array.isArray(root.quests) ? root.quests : [];
  const target = [...quests].reverse().find((q) => q?.status === "open" && questMatches(q, name));
  if (!target) return;

  const today = daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME));
  target.status = status;
  target.settledDay = today;
  // 牙行揽下的差事交上了也只算办成，赏还押在柜上，得他自己回去领
  target.outcome =
    status === "done" && target.broker
      ? holdRewardOutcome(target)
      : applyQuestLedger(root as QuestLedgerTarget, target, status);
  if (status === "done" && target.broker) target.claimed = false;
  root.quests = quests;
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
    return null; // 表外的字段一概不认
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
    if (/主殿|传法大殿/.test(name)) return null;
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
    const done = /成|了|交差|办妥|妥/.test(value);
    const failed = /误|黄|败|不成|未/.test(value);
    if (!done && !failed) return null;
    settleQuest(root, questName, done ? "done" : "failed");
    return null; // 已直接处理
  }

  // 名声：四条各自落在 0 到 100，路径写 reputation.<哪一条>，值写改后的数目。
  // 认不出是哪一条就丢弃，免得凭空多出一条没人认的名声。
  const repMatch = normalizedPath.match(/^reputation\.(.+)$/);
  if (repMatch) {
    const axis = reputationAxisByName(repMatch[1]);
    const next = Number(value);
    if (!axis || !Number.isFinite(next)) return null;
    return { path: `reputation.${axis}`, value: String(Math.max(0, Math.min(100, Math.round(next)))) };
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

function applyOne(root: any, op: DataOp): void {
  if (op.kind === "modify") {
    // 规范化路径和值
    const normalized = normalizeModifyPath(root, op.path, op.value);
    if (!normalized) return; // 已直接处理

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
    applyModify(parent, last, normalizedOp);
  } else if (op.kind === "add") {
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
        arr.push(normalizeItemElements(payload));
      } else if (op.collection === "sect.modifiers") {
        // 宗门修正：只认名录里的 id，名目与生效到哪一日由系统照名录补齐，模型自造的作废
        const spec = makeModifier(
          String((payload as any)?.id ?? ""),
          daySerial(root.currentTime ?? OPENING_GAME_TIME),
          Number((payload as any)?.days),
        );
        if (spec) arr.push(spec);
      } else if (op.collection === "manorPlots") {
        // 叙事里得的一处宅地：名号与所在照写，7×7 一律从空地起
        arr.push(
          emptyPlot({
            place: String((payload as any)?.place ?? "无名之地"),
            cityId: (payload as any)?.cityId,
            districtId: (payload as any)?.districtId,
          }),
        );
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
        const quest = normalizeQuest(payload, arr.length);
        if (!quest) return;
        quest.day = quest.day || daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME));

        // 去处与要见的人一并由它定下：去处对得上本城或别城的街区便钉在那儿，
        // 人现掷一个钉在目标地块上，玩家走到那一处方能寻着、交得了差；认不出去处的，
        // 才落在那一座城一处住人的地方。切不可先把 target 认好再交进去——
        // 它会当成去处已定，只记地方不钉人，玩家到了那儿便寻不着接头的人
        const placeId = String(root?.currentPlaceId ?? "");
        const pinned = pinNarrativeQuest({
          quest,
          currentPlaceId: placeId,
          districtNames: root?.districtNames,
          culture: getMarker(placeId)?.culture,
          today: quest.day,
        });
        if (pinned.people.length > 0) {
          const relArr = resolveCollection(root, "relations");
          pinned.people.forEach((person) => {
            if (!relArr.some((r) => r?.id === person.id)) relArr.push(person);
          });
        }
        arr.push(pinned.quest);
        if (arr.length > 40) arr.splice(0, arr.length - 40);
      } else if (op.collection === "adventures") {
        // 奇遇只落在预设点位上：挑一处空位钉上去，就近归到一座城的一带
        const adv = normalizeAdventure(payload, {
          state: root,
          preferCityId: String(root?.currentPlaceId ?? ""),
          day: daySerial(normalizeGameTime(root?.currentTime, OPENING_GAME_TIME)),
          origin: "story",
        });
        if (!adv) return;
        // 同一处点位或同一个名目的，不重复挂
        if (arr.some((a: any) => a?.id === adv.id || (a?.sceneId === adv.sceneId && a?.x === adv.x && a?.y === adv.y && a?.status === "open"))) return;
        arr.push(adv);
        if (arr.length > 12) arr.splice(0, arr.length - 12);
      } else if (op.collection === "sectSites") {
        // 本门不必另立：本门由舆图上就近的一处认领，另立一处便成了两处同名
        const siteName = String((payload as { name?: unknown })?.name ?? "").trim();
        const mineName = String(root?.sect?.name ?? root?.player?.sectName ?? "").trim();
        if (siteName && mineName && siteName === mineName) return;
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
      const label = OP_COLLECTION_LABEL[op.collection] ?? op.collection;
      const name = entryName(op.payload);
      changes.push({ text: `新增 ${label}${name ? `「${name}」` : ""}`, tone: "gain" });
      continue;
    }
    if (op.kind === "delete") {
      const label = OP_COLLECTION_LABEL[op.collection] ?? op.collection;
      changes.push({ text: `失去 ${label}${op.id ? `「${op.id}」` : ""}`, tone: "loss" });
      continue;
    }

    const path = String(op.path || "").trim();
    if (!path || QUIET_OP_PATH.test(path)) continue;
    const label = OP_PATH_LABEL[path] ?? path;
    const value = formatValue(op.value);
    if (op.op === "+") changes.push({ text: `${label} +${value}`, tone: "gain" });
    else if (op.op === "-") changes.push({ text: `${label} -${value}`, tone: "loss" });
    else changes.push({ text: `${label} 变为 ${value}`, tone: "flat" });
  }
  return changes;
}
