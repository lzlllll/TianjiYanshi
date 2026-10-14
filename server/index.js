/**
 * 轻量后端：AI 额度内购与 Steam 小额支付预留。
 *
 * 游戏内的额度面板眼下尚未开通购买，这里先把建单、对账、发放额度的落点搭好，
 * 将来接上 Steamworks 的微交易回调即可启用。全部走 Node 内置模块，无第三方依赖。
 *
 * 启动：
 *   node server/index.js
 * 环境变量：
 *   PORT                 监听端口，默认 8790
 *   STEAM_APP_ID         Steam AppID
 *   STEAM_PUBLISHER_KEY  发行商密钥
 *
 * 接口一览：
 *   GET  /health                            健康检查，含 Steam 是否已配置
 *   GET  /api/quota/plans                   可购买的额度套餐
 *   GET  /api/quota/balance?steamId=        查询某玩家剩余额度
 *   POST /api/quota/orders                  建单并发起 Steam 交易
 *   POST /api/quota/orders/:orderId/finalize 结算并发额度
 *   POST /api/steam/callback                Steam 微交易回调，须原样回 {result:"OK"}
 *   POST /api/ai/chat/completions           推演转发：补上服务端密钥交给上游，前端不经手密钥
 */

import http from "node:http";
import crypto from "node:crypto";
import { getBalance, saveOrder, getOrder, updateOrder, grantQuota } from "./quotaStore.js";
import { isConfigured as steamConfigured, initTxn, finalizeTxn } from "./steamMicroTxn.js";
import { serveAiChatNode } from "./aiProxyNode.js";

const PORT = Number(process.env.PORT) || 8790;

/**
 * 可售额度套餐。额度单位是「次」，与前端 src/data/aiQuota.ts 里的 PAID_PLANS 对应；
 * 两处保持一致，改动时记得同改。
 */
const PLANS = {
  starter: { itemId: "quota_starter", label: "体验包", quantity: 200, amountCents: 600 },
  standard: { itemId: "quota_standard", label: "江湖常备", quantity: 800, amountCents: 1800 },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function sendJson(res, statusCode, payload) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(payload));
}

/** 读取请求体，JSON 与表单编码都认（Steam 回调走表单） */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("请求体过大"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.includes("application/json")) {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error("请求体不是合法 JSON"));
        }
        return;
      }
      // 表单编码：URLSearchParams 会把 itemid[0] 原样保留
      resolve(Object.fromEntries(new URLSearchParams(raw)));
    });
    req.on("error", reject);
  });
}

async function handle(req, res, url) {
  const { pathname } = url;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/api/ai/chat/completions") {
    try {
      await serveAiChatNode(req, res, process.env);
    } catch (e) {
      sendJson(res, 500, { error: `AI 转发失败：${e.message}` });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true, steamConfigured: steamConfigured() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/quota/plans") {
    sendJson(res, 200, {
      plans: Object.entries(PLANS).map(([id, plan]) => ({ id, ...plan })),
      purchaseOpen: steamConfigured(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/quota/balance") {
    const steamId = url.searchParams.get("steamId") || "";
    sendJson(res, 200, { steamId, balance: getBalance(steamId) });
    return;
  }

  // 建单：先落一条本地订单，再请 Steam 开一笔交易
  if (req.method === "POST" && pathname === "/api/quota/orders") {
    if (!steamConfigured()) {
      sendJson(res, 503, {
        error: "Steam 小额支付尚未配置，无法建单。请先设置 STEAM_APP_ID 与 STEAM_PUBLISHER_KEY。",
      });
      return;
    }
    const body = await readBody(req);
    const { steamId, planId } = body;
    const plan = PLANS[planId];
    if (!steamId || !plan) {
      sendJson(res, 400, { error: "缺少 steamId，或 planId 不在售。" });
      return;
    }

    const orderId = `q_${crypto.randomUUID()}`;
    saveOrder({
      orderId,
      steamId,
      planId,
      itemId: plan.itemId,
      quantity: plan.quantity,
      amountCents: plan.amountCents,
      status: "created",
      granted: false,
      createdAt: new Date().toISOString(),
    });

    try {
      const { transId } = await initTxn({
        orderId,
        steamId,
        itemId: plan.itemId,
        quantity: plan.quantity,
        amountCents: plan.amountCents,
        description: `AI 额度 · ${plan.label}`,
      });
      updateOrder(orderId, { status: "pending", transId });
      sendJson(res, 200, { orderId, transId });
    } catch (e) {
      updateOrder(orderId, { status: "failed", error: e.message });
      sendJson(res, 502, { error: e.message, orderId });
    }
    return;
  }

  // 结算：Steam 端确认后扣款，并把额度记到玩家账上
  const finalizeMatch = pathname.match(/^\/api\/quota\/orders\/([^/]+)\/finalize$/);
  if (req.method === "POST" && finalizeMatch) {
    const orderId = decodeURIComponent(finalizeMatch[1]);
    const order = getOrder(orderId);
    if (!order) {
      sendJson(res, 404, { error: "订单不存在。" });
      return;
    }
    try {
      await finalizeTxn({ orderId });
      const balance = grantQuota(order);
      updateOrder(orderId, { status: "settled", settledAt: new Date().toISOString() });
      sendJson(res, 200, { orderId, balance });
    } catch (e) {
      updateOrder(orderId, { status: "failed", error: e.message });
      sendJson(res, 502, { error: e.message, orderId });
    }
    return;
  }

  /**
   * Steam 微交易回调。
   * Steam 会先后发来「待授权」与「已授权」两次通知，本服务一律先回 {result:"OK"}，
   * 授权成功后自行结算发放额度。授权前的第一次回调只记状态，不动额度。
   */
  if (req.method === "POST" && pathname === "/api/steam/callback") {
    const body = await readBody(req);
    const orderId = body.orderid || body.orderId;
    const status = body.status || "";
    const transId = body.transid || "";

    if (orderId) {
      updateOrder(orderId, {
        status: status === "Approved" ? "authorized" : "pending",
        transId: transId || getOrder(orderId)?.transId,
        lastCallbackAt: new Date().toISOString(),
      });

      // 授权通过即结算；失败也不该阻塞回执，Steam 侧看到非 OK 会重试
      if (status === "Approved") {
        const order = getOrder(orderId);
        try {
          await finalizeTxn({ orderId });
          const balance = grantQuota(order);
          updateOrder(orderId, { status: "settled", settledAt: new Date().toISOString() });
          console.log(`[quota] 订单 ${orderId} 已结算，玩家余额 ${balance}`);
        } catch (e) {
          console.error(`[quota] 订单 ${orderId} 结算失败：${e.message}`);
        }
      }
    }

    // 务必回 {result:"OK"}，否则 Steam 会判定授权未通过
    sendJson(res, 200, { result: "OK" });
    return;
  }

  sendJson(res, 404, { error: "未知接口。" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  handle(req, res, url).catch((err) => {
    console.error(`[server] 处理请求失败 ${req.method} ${req.url}：${err.stack || err.message}`);
    sendJson(res, 500, { error: `服务处理请求失败：${err.message}` });
  });
});

// 单个请求出错绝不能把整个服务带崩
process.on("uncaughtException", (err) => {
  console.error("[server] 未捕获异常，服务继续运行：", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[server] 未处理的 Promise 拒绝：", err);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  ============================================");
  console.log("   额度结算服务（Steam 小额支付预留）已启动");
  console.log("  ============================================");
  console.log(`   监听地址：http://127.0.0.1:${PORT}`);
  console.log(`   Steam 支付：${steamConfigured() ? "已配置" : "未配置（相关接口将返回 503）"}`);
  console.log("");
});
