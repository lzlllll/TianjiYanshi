/**
 * Steam 小额支付（ISteamMicroTxn）封装。
 *
 * 眼下只把接口形状搭出来，供将来接上真实凭据后直接开工。
 * 未配置凭据时一律抛出明确错误、由调用方回 503，
 * 绝不静默降级成「假装付款成功」。
 *
 * 需要的环境变量：
 *   STEAM_APP_ID         游戏在 Steam 上的 AppID
 *   STEAM_PUBLISHER_KEY  发行商密钥，Steamworks 后台「微交易」处获取
 *
 * 另需在 Steamworks 后台把「微交易回调地址」指向本服务的 /api/steam/callback。
 */

const API_BASE = "https://partner.steam-api.com/ISteamMicroTxn";

function appId() {
  return process.env.STEAM_APP_ID || "";
}

function publisherKey() {
  return process.env.STEAM_PUBLISHER_KEY || "";
}

export function isConfigured() {
  return Boolean(appId() && publisherKey());
}

function assertConfigured() {
  if (!isConfigured()) {
    throw new Error(
      "Steam 小额支付尚未配置：请设置环境变量 STEAM_APP_ID 与 STEAM_PUBLISHER_KEY。",
    );
  }
}

/**
 * 统一的 Steam Web API 调用。
 * 键名按 Steam 约定用 itemid[0] / qty[0] / amount[0] 这类带序号写法。
 */
async function callSteam(pathSuffix, params) {
  assertConfigured();
  const url = `${API_BASE}/${pathSuffix}/?key=${encodeURIComponent(publisherKey())}`;
  const body = new URLSearchParams([["appid", appId()], ...Object.entries(params)]);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await resp.json().catch(() => ({}));
  const response = data?.response;
  if (!resp.ok || response?.result !== "OK") {
    const msg = response?.error?.errordesc || `HTTP ${resp.status}`;
    throw new Error(`Steam 接口返回失败：${msg}`);
  }
  return response;
}

/** 建单，返回 Steam 的 transid */
export async function initTxn({
  orderId,
  steamId,
  itemId,
  quantity,
  amountCents,
  currency = "CNY",
  language = "schinese",
  description = "",
}) {
  const response = await callSteam("InitTxn/v3", {
    orderid: orderId,
    steamid: steamId,
    "itemid[0]": itemId,
    "qty[0]": String(quantity),
    "amount[0]": String(amountCents),
    currency,
    language,
    description,
  });
  return { transId: response.transid };
}

/** 玩家在 Steam 浮层里确认后，结算（真正扣款） */
export async function finalizeTxn({ orderId }) {
  const response = await callSteam("FinalizeTxn/v2", { orderid: orderId });
  return { transId: response.transid };
}

/** 主动查单，供对账或补单用 */
export async function queryTxn({ orderId, transId }) {
  const params = orderId ? { orderid: orderId } : { transid: String(transId) };
  return callSteam("QueryTxn/v3", params);
}
