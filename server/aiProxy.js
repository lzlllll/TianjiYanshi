/**
 * AI 转发：前端只与后端说话，密钥只放在后端。
 *
 * 上游地址与密钥一律取自运行环境，代码里不写入任何密钥：
 *   AI_BASE_URL  上游 OpenAI 兼容接口根路径，如 https://api.qnaigc.com/v1
 *   AI_API_KEY   上游密钥
 * 线上走 Cloudflare 的变量与 secret（见独立的 tianji-ai-proxy 项目），本地走环境变量。
 *
 * 本模块只用 Web 标准 API（fetch / Request / Response），
 * 好让同一份逻辑既跑在 Cloudflare Worker，也跑在 Node 里（经 aiProxyNode.js 转接）。
 */

export function isAiConfigured(env = {}) {
  return Boolean(env.AI_BASE_URL && env.AI_API_KEY);
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * 接一段 OpenAI 兼容的 chat/completions 请求，带上服务端密钥转发给上游，原样送回。
 * 流式（SSE）与非流式都走这一条，响应体直接透传，前端照旧解析。
 */
export async function handleAiChat(request, env = {}) {
  if (!isAiConfigured(env)) {
    return jsonResponse(503, {
      error:
        "后端尚未配置模型密钥：请设置 AI_BASE_URL 与 AI_API_KEY（线上填在 Cloudflare 的变量与 secret 里）。",
    });
  }

  const base = String(env.AI_BASE_URL).trim().replace(/\/+$/, "");
  const upstream = `${base}/chat/completions`;
  const body = await request.text();

  let resp;
  try {
    resp = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_API_KEY}`,
        Accept: request.headers.get("accept") || "application/json",
      },
      body,
    });
  } catch (e) {
    return jsonResponse(502, { error: `后端转发失败：${e.message}` });
  }

  return new Response(resp.body, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
