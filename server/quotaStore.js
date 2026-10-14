/**
 * 极简额度账本。
 *
 * 只为把「谁买了多少额度、订单走到哪一步」落在一份 JSON 里，
 * 单机小后端够用即可：不做并发控制，也不支持多实例共享。
 * 数据文件：server/data/quota.json（首次写入时自动创建）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "quota.json");

/** 订单状态：created 已建单 / pending 已提交Steam待确认 / authorized 已授权待结算 / settled 已结算到账 / failed 失败 */
const EMPTY_DB = { balances: {}, orders: {} };

function readDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return { ...EMPTY_DB, ...parsed };
  } catch {
    // 文件不存在或损坏都当空账本处理，别让一笔脏数据把服务带崩
    return { balances: {}, orders: {} };
  }
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/** 读某位玩家的剩余额度（单位：次） */
export function getBalance(steamId) {
  if (!steamId) return 0;
  return readDb().balances[steamId] ?? 0;
}

/** 落一笔订单 */
export function saveOrder(order) {
  const db = readDb();
  db.orders[order.orderId] = order;
  writeDb(db);
  return order;
}

export function getOrder(orderId) {
  return readDb().orders[orderId] ?? null;
}

export function updateOrder(orderId, patch) {
  const db = readDb();
  const cur = db.orders[orderId];
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.orders[orderId] = next;
  writeDb(db);
  return next;
}

/**
 * 订单确认无误后，把额度记到玩家账上。
 * 按 orderId 去重，同一单重复回调也只发一次。
 */
export function grantQuota(order) {
  if (!order?.steamId || !order?.quantity) return 0;
  const db = readDb();
  if (db.orders[order.orderId]?.granted) {
    return db.balances[order.steamId] ?? 0;
  }
  db.balances[order.steamId] = (db.balances[order.steamId] ?? 0) + order.quantity;
  db.orders[order.orderId] = { ...db.orders[order.orderId], granted: true };
  writeDb(db);
  return db.balances[order.steamId];
}
