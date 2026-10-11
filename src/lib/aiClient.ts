import type { AISettings } from "@/data/types";
import { recordTokenUsage } from "@/store/useTokenStore";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 取请求里最后一段用户话的开头，作为这一笔 token 账的用途备注 */
function noteFromMessages(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      return messages[i].content.replace(/\s+/g, " ").trim().slice(0, 24);
    }
  }
  return "";
}

const MAX_REQUEST_BODY_SIZE = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT = 300000;
const PROXY_MAP: Record<string, string> = {
  "https://api.deepseek.com/v1": "/api/deepseek",
  "https://api.openai.com/v1": "/api/openai",
  "https://open.bigmodel.cn/api/paas/v4": "/api/glm",
  "https://dashscope.aliyuncs.com/compatible-mode/v1": "/api/qwen",
};

/** 开发模式或本地服务版本下，通过本地代理转发请求 */
const USE_LOCAL_PROXY = import.meta.env.DEV || import.meta.env.VITE_LOCAL_PROXY === "1";

/**
 * 本地服务版本下请求会发往同源的本地代理。
 * 一旦本地服务窗口被关闭，浏览器只会抛出 ERR_CONNECTION_REFUSED，
 * 这里补一句用户能直接照做的说明，而不是让人误以为是网络或 Base URL 的问题。
 */
function localProxyHint(endpoint: string): string {
  if (!endpoint.startsWith("/api/")) return "";
  return `本地服务未响应：请求发往本地代理 ${endpoint}。\n本地服务窗口可能已被关闭。请重新双击「启动游戏.bat」，保持弹出的命令行窗口开启，然后刷新页面继续。\n\n`;
}

function buildEndpoint(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");

  if (USE_LOCAL_PROXY && PROXY_MAP[url]) {
    url = PROXY_MAP[url];
    console.debug(`[aiClient] 使用本地接口代理: ${url}`);
  }

  if (!/\/chat\/completions$/.test(url)) {
    url += "/chat/completions";
  }
  return url;
}

function logRequestInfo(model: string, messages: ChatMessage[], bodySize: number, endpoint: string): void {
  const systemLen = messages.find((m) => m.role === "system")?.content.length ?? 0;
  const userLen = messages.find((m) => m.role === "user")?.content.length ?? 0;
  console.debug(`[aiClient] === 请求开始 ===`);
  console.debug(`[aiClient] Endpoint: ${endpoint}`);
  console.debug(`[aiClient] Model: ${model}`);
  console.debug(`[aiClient] Request body size: ${(bodySize / 1024).toFixed(2)} KB`);
  console.debug(`[aiClient] System prompt: ${systemLen} chars`);
  console.debug(`[aiClient] User prompt: ${userLen} chars`);
  console.debug(`[aiClient] Total messages: ${messages.length}`);
}

function checkRequestSize(bodySize: number): void {
  if (bodySize > MAX_REQUEST_BODY_SIZE) {
    console.warn(`[aiClient] Request body too large: ${(bodySize / 1024 / 1024).toFixed(2)} MB, max allowed: ${MAX_REQUEST_BODY_SIZE / 1024 / 1024} MB`);
  }
}

/**
 * 记一笔这次输出的收尾情况。
 * 正常收尾是 stop，不必多言；若是 length，说明撞上了输出长度上限、内容被截断，
 * 回来的 JSON 多半是半截的，这类事必须显眼地记下来，免得只看到后面「解析失败」而不知所由。
 */
function noteFinish(model: string, data: any, content: string): void {
  const finish = data?.choices?.[0]?.finish_reason;
  const completion = data?.usage?.completion_tokens;
  if (finish === "length") {
    console.warn(
      `[aiClient] 输出被截断：model=${model} finish_reason=length completion_tokens=${completion ?? "?"} 正文字数=${content.length}。多半撞上了 max_tokens 上限，回来的 JSON 可能不完整。`,
    );
  } else {
    console.debug(
      `[aiClient] finish_reason=${finish ?? "?"} completion_tokens=${completion ?? "?"} 正文字数=${content.length}`,
    );
  }
}

/** 调用 OpenAI 兼容的 chat/completions 接口，返回助手消息文本 */
export async function chatComplete(
  settings: AISettings,
  messages: ChatMessage[],
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error("尚未配置 API Key，请先在设置中填写。");
  }
  const endpoint = buildEndpoint(settings.baseUrl);
  const controller = new AbortController();
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const timer = setTimeout(() => controller.abort(), timeout);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const requestBody = {
      model: messages[0]?.role === "system" ? inferModel(messages, settings) : settings.proModel,
      messages,
      temperature: settings.temperature,
      stream: false,
      max_tokens: 16384,
    };
    const bodyStr = JSON.stringify(requestBody);
    const bodySize = new Blob([bodyStr]).size;

    logRequestInfo(requestBody.model, messages, bodySize, endpoint);
    checkRequestSize(bodySize);

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: bodyStr,
      signal: controller.signal,
    });

    console.debug(`[aiClient] Response status: ${resp.status}`);

    // 连接已建立，清除超时计时器，让响应读取不受限
    clearTimeout(timer);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const errorDetail = errText.slice(0, 300) || resp.statusText;
      console.error(`[aiClient] API Error ${resp.status}: ${errorDetail}`);
      throw new Error(`接口返回 ${resp.status}：${errorDetail}`);
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (jsonErr) {
      const text = await resp.text().catch(() => "");
      console.error(`[aiClient] JSON parse error in chatComplete:`, jsonErr);
      console.error(`[aiClient] Response text (first 500 chars):`, text.slice(0, 500));

      if (text.startsWith("<") || text.includes("<!DOCTYPE") || text.includes("<html")) {
        throw new Error(`接口返回非 JSON 数据（可能是错误页面）。\n\n响应内容预览：${text.slice(0, 300)}\n\n请检查：1. Base URL 是否正确 2. 模型名称是否有效 3. API Key 是否正确`);
      }

      throw new Error(`JSON 解析失败：${(jsonErr as Error).message}\n\n响应内容：${text.slice(0, 300)}`);
    }

    const content: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "";
    if (!content) {
      throw new Error("接口返回空内容，请检查模型名称与配额。");
    }
    noteFinish(requestBody.model, data, content);
    recordTokenUsage(requestBody.model, data?.usage, noteFromMessages(messages));
    if (content.length > 100000) {
      console.warn(`[aiClient] Response too large (${content.length} chars), truncating`);
      return content.slice(0, 100000);
    }
    return content;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      console.warn("[aiClient] Request timed out or aborted");
      throw new Error("请求超时或已取消。");
    }
    if (e instanceof TypeError) {
      console.error("[aiClient] Network error:", e);
      console.error("[aiClient] === 网络错误诊断 === ");
      console.error("[aiClient] Endpoint:", endpoint);
      console.error("[aiClient] Base URL:", settings.baseUrl);
      console.error("[aiClient] Possible causes:");
      console.error("[aiClient] 1. CORS restriction - browser blocks direct API calls");
      console.error("[aiClient] 2. Network timeout - request body too large");
      console.error("[aiClient] 3. DNS resolution failure");
      console.error("[aiClient] 4. Firewall/proxy blocking the connection");
      console.error("[aiClient] === 诊断结束 ===");
      throw new Error(
        localProxyHint(endpoint) +
        `网络请求失败：${e.message}\n\n目标地址：${endpoint}\n\n可能原因：\n1. CORS 跨域限制（浏览器安全策略阻止直接调用）\n2. 网络超时（请求体过大或网络不稳定）\n3. DNS 解析失败\n4. 防火墙/代理拦截\n\n解决方案：\n- 开发环境：运行 npm run dev 使用 Vite 代理\n- 生产环境：配置支持 CORS 的反向代理\n- 更换为支持浏览器直连的 API 服务商`,
      );
    }
    console.error("[aiClient] Unexpected error:", e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function inferModel(_messages: ChatMessage[], settings: AISettings): string {
  return settings.proModel;
}

/** 显式指定模型调用 */
export async function chatWithModel(
  settings: AISettings,
  model: string,
  messages: ChatMessage[],
  opts: {
    timeoutMs?: number;
    signal?: AbortSignal;
    retries?: number;
    jsonMode?: boolean;
    /**
     * 单独指定温度。建档、结算这类要求输出合法 JSON 的活儿该压低些，
     * 不必跟着设置里那个随叙事起伏的温度走。
     */
    temperature?: number;
  } = {},
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error("尚未配置 API Key，请先在设置中填写。");
  }
  const endpoint = buildEndpoint(settings.baseUrl);
  const maxRetries = opts.retries ?? 2;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const requestBody: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? settings.temperature,
        stream: false,
        max_tokens: 16384,
      };
      // JSON 模式：要求模型只返回合法 JSON 对象
      if (opts.jsonMode) {
        requestBody.response_format = { type: "json_object" };
      }
      const bodyStr = JSON.stringify(requestBody);
      const bodySize = new Blob([bodyStr]).size;

      logRequestInfo(model, messages, bodySize, endpoint);
      checkRequestSize(bodySize);

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: bodyStr,
        signal: controller.signal,
      });

      console.debug(`[aiClient] Response status (attempt ${attempt}): ${resp.status}`);

      // 连接已建立，清除超时计时器，让响应读取不受限
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        const errorDetail = errText.slice(0, 300) || resp.statusText;
        console.error(`[aiClient] API Error ${resp.status} (attempt ${attempt}): ${errorDetail}`);

        if (attempt <= maxRetries && (resp.status >= 500 || resp.status === 429)) {
          console.warn(`[aiClient] Retrying (attempt ${attempt}/${maxRetries}) after error: ${resp.status}`);
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }

        throw new Error(`接口返回 ${resp.status}：${errorDetail}`);
      }

      let data: any;
      try {
        data = await resp.json();
      } catch (jsonErr) {
        const text = await resp.text().catch(() => "");
        console.error(`[aiClient] JSON parse error (attempt ${attempt}):`, jsonErr);
        console.error(`[aiClient] Response text (first 500 chars):`, text.slice(0, 500));

        if (text.startsWith("<") || text.includes("<!DOCTYPE") || text.includes("<html")) {
          console.error(`[aiClient] Server returned HTML instead of JSON. This usually means:`);
          console.error(`[aiClient] 1. The API endpoint is incorrect`);
          console.error(`[aiClient] 2. The model name is not recognized by the server`);
          console.error(`[aiClient] 3. Authentication failed`);
          console.error(`[aiClient] 4. CORS error`);
          throw new Error(`接口返回非 JSON 数据（可能是错误页面）。\n\n响应内容预览：${text.slice(0, 300)}\n\n请检查：1. Base URL 是否正确 2. 模型名称是否有效 3. API Key 是否正确`);
        }

        throw new Error(`JSON 解析失败：${(jsonErr as Error).message}\n\n响应内容：${text.slice(0, 300)}`);
      }

      const content: string =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        "";
      if (!content) {
        throw new Error("接口返回空内容，请检查模型名称与配额。");
      }
      noteFinish(model, data, content);
      recordTokenUsage(model, data?.usage, noteFromMessages(messages));
      if (content.length > 100000) {
        console.warn(`[chatWithModel] Response too large (${content.length} chars), truncating`);
        return content.slice(0, 100000);
      }
      return content;
    } catch (e: unknown) {
      clearTimeout(timer);

      if (e instanceof DOMException && e.name === "AbortError") {
        console.warn(`[aiClient] Request timed out (attempt ${attempt})`);
        if (attempt <= maxRetries) {
          console.warn(`[aiClient] Retrying (attempt ${attempt}/${maxRetries}) after timeout`);
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error("请求超时或已取消。");
      }

      if (e instanceof TypeError) {
        console.error(`[aiClient] Network error (attempt ${attempt}):`, e);
        if (attempt <= maxRetries) {
          console.warn(`[aiClient] Retrying (attempt ${attempt}/${maxRetries}) after network error`);
          await new Promise((r) => setTimeout(r, 3000 * attempt));
          continue;
        }
        throw new Error(
        localProxyHint(endpoint) +
        `网络请求失败（已重试 ${maxRetries} 次）：${e.message}\n\n目标地址：${endpoint}\n模型：${model}\n请求体大小：${(new Blob([JSON.stringify({ model, messages })]).size / 1024).toFixed(2)} KB\n\n可能原因：\n1. CORS 跨域限制（浏览器安全策略阻止直接调用）\n2. 网络超时或不稳定\n3. DNS 解析失败\n4. 防火墙/代理拦截\n\n解决方案：\n- 开发环境：使用 npm run dev 启动（已内置代理，可绕过 CORS）\n- 如果开发环境已运行但仍失败，请检查 API Key 是否正确\n- 尝试更换 Base URL 或模型`,
      );
      }

      console.error(`[aiClient] Error (attempt ${attempt}):`, e);
      throw e;
    }
  }

  throw new Error("请求失败，已达到最大重试次数。");
}

/**
 * SSE 流式解析器：从 ReadableStream 中逐行解析 data: 字段，提取 delta.content
 * 兼容 OpenAI 格式的 chat/completions 流式响应。
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
  onUsage?: (usage: any) => void,
): Promise<{ finishReason: string | null }> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finishReason: string | null = null;

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按行处理 SSE 事件
      let lineEnd: number;
      while ((lineEnd = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        const line = rawLine.replace(/\r$/, "").trim();

        if (!line || line.startsWith(":")) continue; // 空行或注释
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (data === "[DONE]") return { finishReason };

        try {
          const json = JSON.parse(data);
          if (json?.usage && onUsage) onUsage(json.usage);
          const choice = json?.choices?.[0];
          // 收尾原因记下来：stop 是正常收尾，length 说明撞上了输出上限、正文被截断
          if (choice?.finish_reason) finishReason = String(choice.finish_reason);
          const delta: string = choice?.delta?.content ?? choice?.text ?? "";
          if (delta) onDelta(delta);
        } catch {
          // 单行 JSON 解析失败时跳过，不中断流
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
  return { finishReason };
}

/** 流式调用 OpenAI 兼容接口，实时回调增量文本，返回完整文本 */
export async function chatWithModelStream(
  settings: AISettings,
  model: string,
  messages: ChatMessage[],
  opts: {
    timeoutMs?: number;
    signal?: AbortSignal;
    onDelta?: (delta: string, full: string) => void;
  } = {},
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error("尚未配置 API Key，请先在设置中填写。");
  }
  const endpoint = buildEndpoint(settings.baseUrl);
  const controller = new AbortController();
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const timer = setTimeout(() => controller.abort(), timeout);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let full = "";
  // 服务商常把输出截在远低于 max_tokens 的地方；撞上 length 就把已写的当作上文，
  // 另起一段接着写，最多续两段，免得正文断在半截
  let lastFinish: string | null = null;
  const MAX_SEGMENTS = 3;
  try {
    const convo: ChatMessage[] = [...messages];
    for (let seg = 0; seg < MAX_SEGMENTS; seg++) {
      const beforeLen = full.length;
      const requestBody = {
        model,
        messages: convo,
        temperature: settings.temperature,
        stream: true,
        // 流式响应默认不带用量，显式要一份，好在末尾那一片里读到 token 数
        stream_options: { include_usage: true },
        max_tokens: 16384,
      };
      const bodyStr = JSON.stringify(requestBody);
      const bodySize = new Blob([bodyStr]).size;

      logRequestInfo(model, messages, bodySize, endpoint);
      checkRequestSize(bodySize);

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
          Accept: "text/event-stream",
        },
        body: bodyStr,
        signal: controller.signal,
      });

      console.debug(`[aiClient][stream] Response status: ${resp.status}（第 ${seg + 1} 段）`);

      // 连接已建立，清除超时计时器
      clearTimeout(timer);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        const errorDetail = errText.slice(0, 300) || resp.statusText;
        console.error(`[aiClient][stream] API Error ${resp.status}: ${errorDetail}`);
        throw new Error(`接口返回 ${resp.status}：${errorDetail}`);
      }

      if (!resp.body) {
        throw new Error("接口未返回流式响应体，可能不支持 stream 模式。");
      }

      const streamInfo = await parseSSEStream(
        resp.body.getReader(),
        (delta) => {
          full += delta;
          if (full.length > 200000) {
            // 防止超长输出撑爆内存
            controller.abort();
            return;
          }
          opts.onDelta?.(delta, full);
        },
        controller.signal,
        (usage) => recordTokenUsage(model, usage, noteFromMessages(messages)),
      );
      lastFinish = streamInfo.finishReason;

      if (streamInfo.finishReason !== "length") break;
      // 这一段落没有多出任何字，再续也是白续，就此收手
      if (full.length === beforeLen) break;
      console.warn(
        `[aiClient][stream] 输出被截断：finish_reason=length 累计正文字数=${full.length}，model=${model}，正接续写第 ${seg + 2} 段。`,
      );
      if (controller.signal.aborted) break;
      convo.push({ role: "assistant", content: full });
      convo.push({
        role: "user",
        content:
          "（上一段写到一半撞上了长度上限）请接着上文往下续写，从断处直接接上，不要重复已经写过的内容，也不要另起话头。",
      });
    }

    if (!full) {
      // 空正文要分辨是「被中止」还是「模型压根没吐内容」，否则只看到一句空内容不知所由
      const why = lastFinish
        ? `finish_reason=${lastFinish}`
        : controller.signal.aborted
          ? "请求已被中止，未收到任何内容"
          : "整段流未收到任何内容片段";
      console.warn(`[aiClient][stream] 空正文：${why}，model=${model}`);
      throw new Error(`接口返回空内容（${why}），请检查模型名称与配额。`);
    }
    if (lastFinish === "length") {
      console.warn(
        `[aiClient][stream] 续写两段后仍被截断：正文字数=${full.length}，model=${model}，正文可能不完整。`,
      );
    }
    if (full.length > 100000) {
      console.warn(`[aiClient][stream] Response too large (${full.length} chars), truncating`);
      return full.slice(0, 100000);
    }
    return full;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // 用户主动取消时，返回已收到的内容（若有）
      if (full) {
        console.warn("[aiClient][stream] Request aborted, returning partial content");
        return full;
      }
      throw new Error("请求超时或已取消。");
    }
    if (e instanceof TypeError) {
      console.error("[aiClient][stream] Network error:", e);
      throw new Error(
        localProxyHint(endpoint) +
        `网络请求失败：${e.message}\n\n目标地址：${endpoint}\n\n可能原因：\n1. CORS 跨域限制\n2. 网络超时\n3. DNS 解析失败\n4. 防火墙/代理拦截`,
      );
    }
    console.error("[aiClient][stream] Unexpected error:", e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
