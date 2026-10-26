import type { AISettings, ThinkingParamStyle } from "@/data/types";
import { recordTokenUsage } from "@/store/useTokenStore";
import { AI_CHAT_PATH, aiReady, backendUrl, hasCustomApi } from "@/data/backend";
import { notifyAiRateLimit } from "@/lib/aiNotice";

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
/**
 * 单次输出上限。叙事正文已收敛到一千二百字以内（约两千 token），留四倍余量足够。
 * 调小可防模型跑长；若卡得太死而触发续写，反倒要把上文重发一遍，更费。
 */
const MAX_OUTPUT_TOKENS = 8192;

/**
 * 推理档的输出上限。思维链与正文共用这一份额度，
 * 8192 常被思考过程整段吃掉、正文一个字都留不下，故另放宽一档。
 * 但别放得太宽：有的网关不认思考档，额度给多大它就想多久，
 * 故只放到够写正文的一万六千余，再长便由流式那一头的思考闸掐断。
 */
const MAX_OUTPUT_TOKENS_REASONING = 16384;

/**
 * 思维链的长度闸。带思考的模型先想后写，可有些网关不认思考档，
 * 放任它想下去，几万字都落不了一个字；到这条线还没见正文，便掐断重来。
 */
const MAX_REASONING_CHARS = 6000;

/**
 * 思考量压到最低时用的档位；OpenAI 一系与多数网关都认 reasoning_effort。
 * 其余各家的叫法不同，见下面那几张表。
 *
 * 实测（七牛云 · moonshotai/kimi-k3-free，同一句请求走游戏后端）：
 *   不加参数                53.9s，512 token 全花在思维链上，正文一个字没有
 *   reasoning_effort:"low"  30.2s，思维链降到 15 token，正文照写
 *   另试过 "minimal" 与 "medium"，上游直接 502——只有 low 与 none 可用。
 */
const REASONING_EFFORT = "low";

/** 认得出写法的几家；auto 已在前面归到具体一家 */
type ResolvedThinkingStyle = Exclude<ThinkingParamStyle, "auto">;

/** 从接口地址里取主机名；走后端时是相对路径，取不到便交空串 */
function hostOf(url: string | undefined): string {
  try {
    return new URL(String(url ?? "")).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * 这一档该照哪一家的写法发思考参数。
 * 玩家手动指定的优先；auto 先看自定义接口的主机，再看模型名的家族。
 */
function resolveThinkingStyle(
  settings: AISettings,
  model: string,
  endpoint: string,
): ResolvedThinkingStyle {
  const picked = settings.thinkingStyle ?? "auto";
  if (picked !== "auto") return picked;

  const host = hostOf(settings.baseUrl?.trim() || endpoint);
  if (/openrouter\.ai/.test(host)) return "openrouter";
  if (/dashscope|aliyuncs/.test(host)) return "qwen";
  if (/bigmodel\.cn|zhipu/.test(host)) return "glm";
  if (/deepseek\.com/.test(host)) return "deepseek";
  if (/moonshot\.(cn|ai)|kimi/.test(host)) return "moonshot";
  if (/siliconflow\.(cn|com)/.test(host)) return "vllm";
  if (/openai\.com|azure\.com/.test(host)) return "openai";

  const name = String(model ?? "").toLowerCase();
  if (/qwen|qwq|tongyi/.test(name)) return "qwen";
  if (/glm|chatglm/.test(name)) return "glm";
  if (/deepseek/.test(name)) return "deepseek";
  if (/kimi|moonshot/.test(name)) return "moonshot";
  // 豆包、混元、文心一类的写法与智谱同形：thinking.type
  if (/doubao|seed-oss|hunyuan|ernie/.test(name)) return "glm";
  if (/openrouter/.test(name)) return "openrouter";
  return "openai";
}

/** GLM-5.3 起与 4.7、4.5V 一类强制思考：传 disabled 直接 400，只能退到最低一档 */
const GLM_FORCED_THINKING = /glm-(?:5\.[3-9]|[6-9]|4\.7|4\.5v)/i;
/** 认 reasoning_effort 的 GLM：5.2 起。5.3 的档位是 low / high / max，缺省是 max——不想它想太久就得点明 low */
const GLM_EFFORT = /glm-(?:5\.[2-9]|[6-9])/i;

/** 智谱这一家的开与关 */
function glmThinkingParams(model: string, on: boolean): Record<string, unknown> {
  const name = String(model ?? "");
  const forced = GLM_FORCED_THINKING.test(name);
  const effort = GLM_EFFORT.test(name);
  if (on || forced) {
    // 强制思考的模型关不掉，能给的最低一档便是 low；不认 effort 的老模型只开思考
    return {
      thinking: { type: "enabled" },
      ...(effort ? { reasoning_effort: "low" } : {}),
    };
  }
  return { thinking: { type: "disabled" } };
}

/**
 * 有的模型压根关不掉思考——哪怕玩家把这一档设成「无」，它也照样先想再写。
 * 这类模型不能只给寻常那点输出额度，否则思维链一长，正文便没地方落了。
 */
function mustThink(model: string): boolean {
  return GLM_FORCED_THINKING.test(String(model ?? ""));
}

/**
 * 关掉思考：各家写法不同。
 * 宁可先按这一家的写法发一次——有的混合模型不点明便自顾自想下去；
 * 老模型不认这个参数会报 400，postChat 自会退到不带参数的那一种。
 */
function thinkingOffParams(
  style: ResolvedThinkingStyle,
  model: string,
): Record<string, unknown> {
  switch (style) {
    case "qwen":
      return { enable_thinking: false };
    case "glm":
      return glmThinkingParams(model, false);
    case "deepseek":
    case "moonshot":
      return { thinking: { type: "disabled" } };
    case "openrouter":
      return { reasoning: { enabled: false } };
    case "vllm":
      return { chat_template_kwargs: { enable_thinking: false } };
    case "openai":
      return { reasoning_effort: "none" };
    default:
      return {};
  }
}

/** 留着思考，但压到最低 */
function thinkingBriefParams(
  style: ResolvedThinkingStyle,
  model: string,
): Record<string, unknown> {
  switch (style) {
    case "qwen":
      // 通义这一档的最小预算是一千零二十四
      return { enable_thinking: true, thinking_budget: 1024 };
    case "glm":
      return glmThinkingParams(model, true);
    case "deepseek":
      return { thinking: { type: "enabled" } };
    case "moonshot":
      return { reasoning_effort: REASONING_EFFORT };
    case "openrouter":
      return { reasoning: { effort: "low" } };
    case "vllm":
      return { chat_template_kwargs: { enable_thinking: true }, thinking_budget: 1024 };
    case "openai":
      return { reasoning_effort: REASONING_EFFORT };
    default:
      return {};
  }
}

interface ThinkingVariant {
  /** 日志里怎么说这一种写法 */
  label: string;
  /** 叠进请求体的那几个字段 */
  extra: Record<string, unknown>;
}

/**
 * 一种写法不行便退到更通用的：先照认出来的那一家发，再退到 reasoning_effort，
 * 最后干脆不带任何思考参数。有些服务商见到不认识的字段便整笔拒掉，
 * 留着这条退路，换模型时便不至于一上来就报错。
 */
function thinkingVariants(
  style: ResolvedThinkingStyle,
  reasoning: boolean,
  model: string,
): ThinkingVariant[] {
  const list: ThinkingVariant[] = [];
  const add = (label: string, extra: Record<string, unknown>) => {
    const key = JSON.stringify(extra);
    if (!list.some((v) => JSON.stringify(v.extra) === key)) list.push({ label, extra });
  };
  add(
    reasoning ? "思考·最低" : "思考·关闭",
    reasoning ? thinkingBriefParams(style, model) : thinkingOffParams(style, model),
  );
  // 通用那一手：GLM 只认 low / high / max，没有 none 这一档
  add(
    "思考·通用",
    reasoning
      ? { reasoning_effort: REASONING_EFFORT }
      : style === "glm"
        ? { reasoning_effort: "low" }
        : { reasoning_effort: "none" },
  );
  add("不带思考参数", {});
  return list;
}

/** 哪一种写法试过能用便记下：同一家、同一档往后直接用它，少走冤枉路 */
const workingVariant = new Map<string, number>();

/**
 * 记下哪些模型怎么压都压不住思考、只能整档关掉。
 * 见过一次便记住，往后同一档起手就关，不再先陪它想满一闸。
 */
const forceOffModels = new Set<string>();

/**
 * 这一笔报错要不要换个思考参数写法再试。
 * 只认 400/422——这两档多半是参数不合；鉴权、限流、服务端故障照旧原样报出去。
 * 不细抠报错里的字眼：各家措辞不一，认漏了反倒让玩家白白碰上一次失败。
 */
function warrantsThinkingFallback(status: number): boolean {
  return status === 400 || status === 422;
}

/**
 * 认得出是推理模型的字样。认不出也无妨——哪一档真吐过思维链，
 * 运行时自会记下，往后便按推理档办。
 * kimi-k3 是官方免费额度那档（moonshotai/kimi-k3-free）：它带思维链，
 * 若不认出来，便会照普通档只给 8192 的额度，被思考过程吃光、正文一个字都留不下。
 */
const REASONING_NAME_PATTERN =
  /reason|think|z1|qwq|r1\b|o[1-9]-|kimi-k3|glm-(?:5\.[3-9]|[6-9]|4\.7|4\.5v)|minimax-m[12]|longcat|step-[3-9]|magistral|nemotron|gemini-(?:2\.[5-9]|3)|grok-[3-9]/i;

/** 运行时见过的推理档模型名；见过一次便记住，往后自动按推理档办 */
const reasonedModels = new Set<string>();

/** 照名字看这模型像不像带思维链的 */
function looksLikeReasoning(model: string): boolean {
  return REASONING_NAME_PATTERN.test(String(model ?? ""));
}

/** 记下这一档吐过思维链，往后同一档自动按推理档办 */
function noteReasoningModel(model: string): void {
  if (model) reasonedModels.add(model);
}

/** 按模型名认它归哪一档：先照 flash 比，认不出当 pro */
function slotOf(settings: AISettings, model: string): "flash" | "pro" {
  return model === settings.flashModel ? "flash" : "pro";
}

/**
 * 这一档是不是推理模型：玩家手动指的 on/off 优先，
 * auto 则看模型名，外加运行时见过的记录。
 */
export function isReasoningSlot(settings: AISettings, slot: "flash" | "pro"): boolean {
  const mode = slot === "pro" ? settings.proReasoning : settings.flashReasoning;
  if (mode === "on") return true;
  if (mode === "off") return false;
  const model = String((slot === "pro" ? settings.proModel : settings.flashModel) ?? "");
  return reasonedModels.has(model) || looksLikeReasoning(model);
}

/** 该模型是不是 OpenAI 的 o 系：那一系只认 max_completion_tokens，也不认温度 */
function isOpenAiOSeries(model: string): boolean {
  return /^o[1-9](-|$)/.test(String(model ?? "").trim());
}

/**
 * Kimi K3 的思考档只收 0、0.6、1 三档温度，别的值整笔请求会被判成 invalid_request_error。
 * 各处的温度偏好照旧，发出去之前就近归到这三档。
 */
const THINKING_TEMPERATURES = [0, 0.6, 1];

/** K3 这一档不论请求里有没有点思考量，上游都按思考档收温度，故只看模型名 */
function isThinkingTemperatureLocked(model: string): boolean {
  return /kimi-k3/i.test(String(model ?? ""));
}

function snapThinkingTemperature(temperature: number): number {
  let best = THINKING_TEMPERATURES[0];
  for (const step of THINKING_TEMPERATURES) {
    if (Math.abs(step - temperature) < Math.abs(best - temperature)) best = step;
  }
  return best;
}

/**
 * 要 JSON 的那一路另有温度：结算、建档这类活儿图的是结构稳、字段名不跑偏，
 * 不该跟着设置里那个为叙事起伏留的温度走。调用方没有单独指定温度时压到这里。
 * 要文采又要 JSON 的（如推演风闻、生成奇遇），调用方自会显式给高一点。
 */
const JSON_TEMPERATURE = 0.15;

/**
 * 请求体只在这一处生成。三处调用各写一份，参数适配迟早走岔。
 * 推理档与非推理档的差别全在这里收口：输出额度放宽、不硬要 response_format。
 */
function buildRequestBody(params: {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature: number;
  /** 这一档是不是推理模型 */
  reasoning: boolean;
  jsonMode?: boolean;
  /** 思考参数；各家写法不同，由 postChat 按家挑好再叠进来 */
  thinking?: Record<string, unknown>;
}): Record<string, unknown> {
  const { model, messages, stream, temperature, reasoning, jsonMode } = params;
  const maxTokens =
    reasoning || mustThink(model) ? MAX_OUTPUT_TOKENS_REASONING : MAX_OUTPUT_TOKENS;
  const oSeries = isOpenAiOSeries(model);
  // 思考档认得出的模型，温度须先归到它认的那几档
  const appliedTemperature = isThinkingTemperatureLocked(model)
    ? snapThinkingTemperature(temperature)
    : temperature;

  const body: Record<string, unknown> = { model, messages, stream };
  // o 系改名成 max_completion_tokens，且不认 temperature（传了会报错）
  if (oSeries) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
    body.temperature = appliedTemperature;
  }
  // 部分推理模型不认 response_format，硬要 JSON 反倒报错；提示词里已写明「只输出 JSON」
  if (jsonMode && !reasoning) {
    body.response_format = { type: "json_object" };
  }
  /*
   * 思考参数由调用方按各家的写法叠进来：开了思考的压到最低，关了的明说要关，
   * 免得带思考的模型把额度全耗在思维链上、正文一个字没有。
   * 只挡回必备字段，别让它把 model / messages / stream 盖掉。
   */
  for (const [key, value] of Object.entries(params.thinking ?? {})) {
    if (key === "model" || key === "messages" || key === "stream") continue;
    body[key] = value;
  }
  if (stream) {
    // 流式响应默认不带用量，显式要一份，好在末尾那一片里读到 token 数
    body.stream_options = { include_usage: true };
  }
  return body;
}

/** 上游拒了这一笔：状态与原文一并带出来，调用方好照状态重试或提示 */
class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`接口返回 ${status}：${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 发一笔 chat/completions；思考参数照各家的写法依次试。
 * 只有「不认思考参数」这一类才换写法重发——限流、鉴权、超时照旧原样抛给调用方，
 * 免得把别的毛病也当成参数问题一遍遍重试。
 */
async function postChat(args: {
  settings: AISettings;
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature: number;
  reasoning: boolean;
  jsonMode?: boolean;
  signal: AbortSignal;
  /** 流式时写明 text/event-stream */
  accept?: string;
  /** 这一次只按「关思考」发：思考过长掐断后，用它重来一遍 */
  forceOff?: boolean;
}): Promise<{ resp: Response; endpoint: string }> {
  const endpoint = buildEndpoint(args.settings);
  const style = resolveThinkingStyle(args.settings, args.model, endpoint);
  const variants = args.forceOff
    ? [
        { label: "思考·强制关闭", extra: thinkingOffParams(style, args.model) },
        // 有的网关不认关思考的字段：退到不带参数，至少先把这一笔发出去
        { label: "不带思考参数", extra: {} },
      ]
    : thinkingVariants(style, args.reasoning, args.model);
  const memoKey = `${style}:${args.reasoning}:${args.model}`;
  // 先前试出过能用的那一种，直接从那一种起手
  const start = args.forceOff ? 0 : Math.min(workingVariant.get(memoKey) ?? 0, variants.length - 1);

  let last: ApiError | null = null;
  for (let vi = start; vi < variants.length; vi++) {
    const requestBody = buildRequestBody({
      model: args.model,
      messages: args.messages,
      stream: args.stream,
      temperature: args.temperature,
      reasoning: args.reasoning,
      jsonMode: args.jsonMode,
      thinking: variants[vi].extra,
    });
    const bodyStr = JSON.stringify(requestBody);
    const bodySize = new Blob([bodyStr]).size;
    logRequestInfo(args.model, args.messages, bodySize, endpoint);
    checkRequestSize(bodySize);

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(args.accept ? { Accept: args.accept } : {}),
        ...authHeaders(args.settings),
      },
      body: bodyStr,
      signal: args.signal,
    });

    if (resp.ok) {
      if (args.forceOff) {
        // 头一手「关思考」真发出去了，才记：退到不带参数的那一手不算关掉，
        // GLM-5.3 一类强制思考的模型也关不掉，记下也没用
        if (vi === 0 && !mustThink(args.model)) {
          forceOffModels.add(args.model);
          console.info(`[aiClient] 这一档思考压不住，往后起手便按「关思考」发，model=${args.model}。`);
        }
      } else {
        if (vi !== start) {
          console.info(`[aiClient] 思考参数改用「${variants[vi].label}」；往后这一家照此发。`);
        }
        workingVariant.set(memoKey, vi);
      }
      return { resp, endpoint };
    }

    const errText = (await resp.text().catch(() => "")) || resp.statusText;
    last = new ApiError(resp.status, errText.slice(0, 300));
    if (vi + 1 < variants.length && warrantsThinkingFallback(resp.status)) {
      console.warn(
        `[aiClient] 思考参数「${variants[vi].label}」不被认（${resp.status}：${errText.slice(0, 120)}），换一种写法再试。`,
      );
      continue;
    }
    throw last;
  }
  throw last ?? new ApiError(0, "请求未能发出");
}


/**
 * 本地服务窗口被关掉时，浏览器只会抛出 ERR_CONNECTION_REFUSED。
 * 这里补一句用户能直接照做的说明，而不是让人误以为是模型或网络的问题。
 */
function localServiceHint(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return "";
  return `本地服务未响应：请求发往 ${endpoint}。\n本地服务窗口可能已被关闭。请重新双击「启动游戏.bat」（或重启游戏），保持服务开启，然后刷新页面继续。\n\n`;
}

/** 自定义接口用：与服务商 baseUrl 一一对应的本地代理前缀，需与 tools/serve-local.js 中的 PROXY_MAP 保持一致 */
const PROXY_MAP: Record<string, string> = {
  "https://api.deepseek.com/v1": "/api/deepseek",
  "https://api.openai.com/v1": "/api/openai",
  "https://open.bigmodel.cn/api/paas/v4": "/api/glm",
  "https://dashscope.aliyuncs.com/compatible-mode/v1": "/api/qwen",
  "https://api.qnaigc.com/v1": "/api/qnaigc",
};

/** 本地服务版与 exe 下，已知服务商走本地代理，绕开浏览器跨域；其余直连 */
const USE_LOCAL_PROXY = import.meta.env.DEV || import.meta.env.VITE_LOCAL_PROXY === "1";

/** 自定义接口的收尾地址：已知服务商经本地代理，其余直连服务商 */
function providerEndpoint(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  if (USE_LOCAL_PROXY && PROXY_MAP[url]) {
    url = PROXY_MAP[url];
  }
  if (!/\/chat\/completions$/.test(url)) {
    url += "/chat/completions";
  }
  return url;
}

/**
 * 请求去向：
 *   填了自定义接口便直连玩家自己的服务商；
 *   否则一律发往后端的转发口，密钥由后端补上，前端不经手。
 */
function buildEndpoint(settings: AISettings): string {
  return hasCustomApi(settings) ? providerEndpoint(settings.baseUrl) : backendUrl(AI_CHAT_PATH);
}

/** 自定义接口时带上玩家自己的密钥；走后端则不带，密钥由后端补 */
function authHeaders(settings: AISettings): Record<string, string> {
  return hasCustomApi(settings)
    ? { Authorization: `Bearer ${settings.apiKey.trim()}` }
    : {};
}

/** 两条路都不通时，动手之前就拦住，不做静默降级 */
function assertAiReady(settings: AISettings): void {
  if (aiReady(settings)) return;
  throw new Error(
    "推演接口尚未接通：请先在后端配好模型密钥，或在「自定义接口」里填入自己的地址与密钥。",
  );
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

/** 各家把思维链放在不同字段上：reasoning_content、reasoning、thinking、analysis，或分成几条的 reasoning_details */
function reasoningTextOf(message: any): string {
  const raw = message?.reasoning_content ?? message?.reasoning ?? message?.thinking ?? message?.analysis;
  if (typeof raw === "string") return raw;
  if (Array.isArray(message?.reasoning_details)) {
    return message.reasoning_details
      .map((d: any) => (typeof d === "string" ? d : d?.text ?? d?.summary ?? ""))
      .join("");
  }
  return "";
}

/** 非流式回包里的思维链；没有便是空串 */
function reasoningOf(data: any): string {
  return reasoningTextOf(data?.choices?.[0]?.message ?? {});
}

/** 正文可能是一段字，也可能是若干块（[{type:"text",text:"..."}]）；一并接起来 */
function contentOf(data: any): string {
  const message = data?.choices?.[0]?.message;
  const raw = message?.content ?? data?.choices?.[0]?.text ?? "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((block: any) => (typeof block === "string" ? block : block?.text ?? ""))
      .join("");
  }
  return "";
}

/**
 * 非流式回包里正文为空时，给一句对症的话。
 * 带思维链的模型把思考过程写在 message.reasoning_content / reasoning 里，正文另走 content；
 * 只吐了思维链、没写正文的情形要认出来并说清楚，别只丢一句「空内容」让人摸不着头脑。
 */
function emptyContentError(model: string, data: any): Error {
  if (reasoningOf(data)) {
    const finish = data?.choices?.[0]?.finish_reason;
    return new Error(
      `接口只吐了思维链、没写正文${finish ? `（finish_reason=${finish}）` : ""}。模型「${model}」多半是带思维链的推理模型，` +
        `思考过程把输出额度占满，正文便没写出来——请在设置里把这一档的「思维链」设为无，或换一档不带思维链的模型。`,
    );
  }
  return new Error("接口返回空内容，请检查后端的上游配置与模型名称。");
}

/**
 * 「只吐了思维链、没写正文」报的那一句。
 * 流式的两条路（正常收尾、到点被断）都要用它，口径须一致。
 */
function reasoningOnlyError(model: string, why: string): Error {
  return new Error(
    `接口只吐了思维链、没写正文（${why}）。模型「${model}」多半是带思维链的推理模型，` +
      `思考过程把输出额度占满，正文便没写出来——请在设置里把这一档的「思维链」设为无，或调整「思考参数」那一项。`,
  );
}

/** 思考闸掐断后仍不落笔：这一档既不认思考档，也关不掉，只能换模型 */
function reasoningOverflowError(model: string): Error {
  return new Error(
    `模型「${model}」思考过长：已逾 ${MAX_REASONING_CHARS} 字仍未落笔，本次推演已中止。` +
      `这一档多半不认「思考参数」里的压思考写法，关也关不掉——请在设置里换一档模型，` +
      `或把「思考参数」改成这一家真能压住的那一种。`,
  );
}

/** 调用后端转发口（OpenAI 兼容的 chat/completions），返回助手消息文本 */
export async function chatComplete(
  settings: AISettings,
  messages: ChatMessage[],
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  assertAiReady(settings);
  const endpoint = buildEndpoint(settings);
  const controller = new AbortController();
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const timer = setTimeout(() => controller.abort(), timeout);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const model = messages[0]?.role === "system" ? inferModel(messages, settings) : settings.proModel;
    const { resp } = await postChat({
      settings,
      model,
      messages,
      stream: false,
      temperature: settings.temperature,
      reasoning: isReasoningSlot(settings, slotOf(settings, model)),
      signal: controller.signal,
    });

    console.debug(`[aiClient] Response status: ${resp.status}`);

    // 连接已建立，清除超时计时器，让响应读取不受限
    clearTimeout(timer);

    let data: any;
    try {
      data = await resp.json();
    } catch (jsonErr) {
      const text = await resp.text().catch(() => "");
      console.error(`[aiClient] JSON parse error in chatComplete:`, jsonErr);
      console.error(`[aiClient] Response text (first 500 chars):`, text.slice(0, 500));

      if (text.startsWith("<") || text.includes("<!DOCTYPE") || text.includes("<html")) {
        throw new Error(`接口返回非 JSON 数据（可能是错误页面）。\n\n响应内容预览：${text.slice(0, 300)}\n\n请检查后端是否已配置模型密钥与上游地址。`);
      }

      throw new Error(`JSON 解析失败：${(jsonErr as Error).message}\n\n响应内容：${text.slice(0, 300)}`);
    }

    const content = contentOf(data);
    // 吐过思维链便记下这一档，往后自动按推理档办
    if (reasoningOf(data)) noteReasoningModel(model);
    if (!content) {
      throw emptyContentError(model, data);
    }
    noteFinish(model, data, content);
    recordTokenUsage(model, data?.usage, noteFromMessages(messages));
    if (content.length > 100000) {
      console.warn(`[aiClient] Response too large (${content.length} chars), truncating`);
      return content.slice(0, 100000);
    }
    return content;
  } catch (e: unknown) {
    if (e instanceof ApiError) {
      if (e.status === 429 && !hasCustomApi(settings)) notifyAiRateLimit();
      throw e;
    }
    if (e instanceof DOMException && e.name === "AbortError") {
      console.warn("[aiClient] Request timed out or aborted");
      throw new Error("请求超时或已取消。");
    }
    if (e instanceof TypeError) {
      console.error("[aiClient] Network error:", e);
      console.error("[aiClient] === 网络错误诊断 === ");
      console.error("[aiClient] Endpoint:", endpoint);
      console.error("[aiClient] === 诊断结束 ===");
      throw new Error(
        localServiceHint(endpoint) +
        `网络请求失败：${e.message}\n\n目标地址：${endpoint}\n\n可能原因：\n1. 后端服务未启动或已关闭\n2. 后端地址配置有误\n3. 跨域被拦截（线上后端需允许本站来源）\n\n解决办法：\n- 本地版：重新启动游戏，保持本地服务窗口开启\n- 线上版：检查 src/data/backend.ts 中的后端地址，并确认后端已放开跨域`,
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
     * 不必跟着设置里那个随叙事起伏的温度走。不指定时，jsonMode 一律按低温办。
     */
    temperature?: number;
    /**
     * 这一趟不必弹「内置服务繁忙」的提示窗。
     * 开局八门建档在后台并发跑，429 由开局的「部分数据未生成」统一交代。
     */
    muteRateLimitNotice?: boolean;
  } = {},
): Promise<string> {
  assertAiReady(settings);
  const endpoint = buildEndpoint(settings);
  const maxRetries = opts.retries ?? 2;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const { resp } = await postChat({
        settings,
        model,
        messages,
        stream: false,
        temperature:
          opts.temperature ??
          (opts.jsonMode ? Math.min(settings.temperature, JSON_TEMPERATURE) : settings.temperature),
        reasoning: isReasoningSlot(settings, slotOf(settings, model)),
        jsonMode: opts.jsonMode,
        signal: controller.signal,
      });

      console.debug(`[aiClient] Response status (attempt ${attempt}): ${resp.status}`);

      // 连接已建立，清除超时计时器，让响应读取不受限
      clearTimeout(timer);

      let data: any;
      try {
        data = await resp.json();
      } catch (jsonErr) {
        const text = await resp.text().catch(() => "");
        console.error(`[aiClient] JSON parse error (attempt ${attempt}):`, jsonErr);
        console.error(`[aiClient] Response text (first 500 chars):`, text.slice(0, 500));

        if (text.startsWith("<") || text.includes("<!DOCTYPE") || text.includes("<html")) {
          console.error(`[aiClient] Server returned HTML instead of JSON. This usually means:`);
          console.error(`[aiClient] 1. The backend endpoint is incorrect`);
          console.error(`[aiClient] 2. The upstream model name is not recognized`);
          console.error(`[aiClient] 3. The backend is missing its API key`);
          throw new Error(`接口返回非 JSON 数据（可能是错误页面）。\n\n响应内容预览：${text.slice(0, 300)}\n\n请检查后端地址与上游配置。`);
        }

        throw new Error(`JSON 解析失败：${(jsonErr as Error).message}\n\n响应内容：${text.slice(0, 300)}`);
      }

      const content = contentOf(data);
      // 吐过思维链便记下这一档，往后自动按推理档办
      if (reasoningOf(data)) noteReasoningModel(model);
      if (!content) {
        throw emptyContentError(model, data);
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

      if (e instanceof ApiError) {
        // 5xx 与限流照旧整笔重试；重试尽了再照原样报出去
        if (attempt <= maxRetries && (e.status >= 500 || e.status === 429)) {
          console.warn(`[aiClient] Retrying (attempt ${attempt}/${maxRetries}) after error: ${e.status}`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        // 内置服务（免费模型）被限流：重试也尽了，弹一扇说明窗，别让玩家以为存档坏了
        if (e.status === 429 && !hasCustomApi(settings) && !opts.muteRateLimitNotice) {
          notifyAiRateLimit();
        }
        throw e;
      }

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
          localServiceHint(endpoint) +
          `网络请求失败（已重试 ${maxRetries} 次）：${e.message}\n\n目标地址：${endpoint}\n模型：${model}\n\n可能原因：\n1. 后端服务未启动或已关闭\n2. 后端地址配置有误\n3. 跨域被拦截\n\n解决办法：\n- 本地版：重新启动游戏，保持本地服务窗口开启\n- 线上版：检查 src/data/backend.ts 中的后端地址`,
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
  /** 思维链另走这一条：它不算正文，只用来在界面上显示「正在思考」 */
  onReasoning?: (delta: string) => void,
): Promise<{ finishReason: string | null; sawReasoning: boolean }> {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finishReason: string | null = null;
  // 带思维链的那几档模型，把思考过程放在 reasoning_content 或 reasoning 里，正文另走 content。
  // 思维链不算正文，故不并进 full，只记一笔「模型确实吐过东西」——
  // 免得收尾时把「只吐了思维链、没写正文」误报成「整段流一片空白」。
  let sawReasoning = false;
  // 正文有没有收到过；顺带把「分片里到底出现过哪些字段」记下来，
  // 收尾若一字未见，靠它把上游的真实写法报出来，省得凭猜
  let sawContent = false;
  const deltaKeys = new Set<string>();
  let firstChunk = "";

  /**
   * 收尾一字正文都没收到，就把上游的真实写法报出来：分片里出现过哪些 delta 字段、
   * 第一片长什么样。各家把内容放在哪个字段上不尽相同，猜不如看。
   */
  const reportIfSilent = () => {
    if (sawContent) return;
    console.warn(
      `[aiClient][stream] 一字正文都没收到（finish_reason=${finishReason ?? "?"}）。` +
        `分片里见过的 delta 字段：${deltaKeys.size > 0 ? [...deltaKeys].join("、") : "（一个都没有）"}；` +
        `首个分片原文：${firstChunk.slice(0, 400) || "（没收到任何分片）"}`,
    );
  };

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
        if (data === "[DONE]") {
          reportIfSilent();
          return { finishReason, sawReasoning };
        }

        try {
          const json = JSON.parse(data);
          if (json?.usage && onUsage) onUsage(json.usage);
          const choice = json?.choices?.[0];
          // 收尾原因记下来：stop 是正常收尾，length 说明撞上了输出上限、正文被截断
          if (choice?.finish_reason) finishReason = String(choice.finish_reason);
          const piece = choice?.delta ?? {};
          for (const k of Object.keys(piece)) deltaKeys.add(k);
          if (!firstChunk && choice) firstChunk = data;
          // 各家把思维链放在不同字段上，逐一种都认
          const reasoning = reasoningTextOf(piece);
          if (reasoning) {
            sawReasoning = true;
            onReasoning?.(reasoning);
          }
          const rawDelta = piece.content ?? choice?.text ?? "";
          const delta: string =
            typeof rawDelta === "string"
              ? rawDelta
              : Array.isArray(rawDelta)
                ? rawDelta
                    .map((block: any) => (typeof block === "string" ? block : block?.text ?? ""))
                    .join("")
                : "";
          if (delta) {
            sawContent = true;
            onDelta(delta);
          }
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
  reportIfSilent();
  return { finishReason, sawReasoning };
}

/** 流式调用后端转发口，实时回调增量文本，返回完整文本 */
export async function chatWithModelStream(
  settings: AISettings,
  model: string,
  messages: ChatMessage[],
  opts: {
    timeoutMs?: number;
    signal?: AbortSignal;
    onDelta?: (delta: string, full: string) => void;
    /** 思维链增量；推理模型先长思考才落笔，这一段不并入正文 */
    onReasoning?: (delta: string, fullReasoning: string) => void;
    /** 单独指定温度；建档这类要合法 JSON 的活儿压低些，不必跟设置里那个随叙事起伏的温度走 */
    temperature?: number;
    /** 这一趟不必弹「内置服务繁忙」的提示窗：开局八门在后台并发跑，由开局的缺项提示统一交代 */
    muteRateLimitNotice?: boolean;
  } = {},
): Promise<string> {
  assertAiReady(settings);
  const endpoint = buildEndpoint(settings);
  const controller = new AbortController();
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  // 流式是「头一到便回、正文靠后续续传」，故这个钟不提前撤，一路架到整段读完，
  // 作整段的硬上限：到点即断，宁可报一句超时，也不让玩家对着屏幕干等。
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let full = "";
  // 服务商常把输出截在远低于 max_tokens 的地方；撞上 length 就把已写的当作上文，
  // 另起一段接着写，最多续两段，免得正文断在半截
  let lastFinish: string | null = null;
  // 全程有没有收到过思维链；收尾若正文为空，靠它分辨是「只有思维链」还是「整段空」
  let sawReasoning = false;
  // 思维链全文，只用于回调给界面显示「正在思考」，绝不并入正文
  let reasoningText = "";
  const MAX_SEGMENTS = 3;
  try {
    const convo: ChatMessage[] = [...messages];

    /**
     * 开一笔流，只读一段。
     * 思维链在正文之前就先长过闸门时，立刻掐断这一笔——
     * 有的网关不认思考档，放任它想下去，几万字都落不了一个字。
     */
    const runAttempt = async (forceOff: boolean) => {
      const attempt = new AbortController();
      const relayAbort = () => attempt.abort();
      if (controller.signal.aborted) attempt.abort();
      controller.signal.addEventListener("abort", relayAbort, { once: true });
      let overflow = false;
      try {
        const { resp } = await postChat({
          settings,
          model,
          messages: convo,
          stream: true,
          temperature: opts.temperature ?? settings.temperature,
          reasoning: isReasoningSlot(settings, slotOf(settings, model)),
          signal: attempt.signal,
          accept: "text/event-stream",
          forceOff,
        });

        console.debug(`[aiClient][stream] Response status: ${resp.status}${forceOff ? "（关思考重试）" : ""}`);

        // 这里不撤那个钟：撤了便只剩「建连」这一段受约束，正文能无限拖下去——
        // 慢的推理模型一口气吐十几分钟思维链也不会有个头。让它架到整段读完为止。

        if (!resp.body) {
          throw new Error("接口未返回流式响应体，可能上游或后端不支持 stream 模式。");
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
          attempt.signal,
          (usage) => recordTokenUsage(model, usage, noteFromMessages(messages)),
          (delta) => {
            // 收到思维链即可断定这一档是推理模型，往后自动按推理档办
            noteReasoningModel(model);
            reasoningText += delta;
            opts.onReasoning?.(delta, reasoningText);
            // 正文还没落笔、思考却已长过闸门：掐断这一笔，不陪它想下去
            if (!full && reasoningText.length > MAX_REASONING_CHARS) {
              overflow = true;
              attempt.abort();
            }
          },
        );
        return { streamInfo, overflow };
      } catch (e) {
        // 掐断不是报错，交给外头换一种写法重来
        if (overflow) {
          return { streamInfo: { finishReason: null, sawReasoning: true }, overflow: true };
        }
        throw e;
      } finally {
        controller.signal.removeEventListener("abort", relayAbort);
      }
    };

    for (let seg = 0; seg < MAX_SEGMENTS; seg++) {
      const beforeLen = full.length;
      let attemptResult = await runAttempt(forceOffModels.has(model));
      if (attemptResult.overflow && !full) {
        if (forceOffModels.has(model)) {
          // 已经按关思考发过，还是想个没完：这一档确实压不住
          throw reasoningOverflowError(model);
        }
        console.warn(
          `[aiClient][stream] 思维链已逾 ${MAX_REASONING_CHARS} 字仍未落笔，掐断后改按「关思考」再试一次，model=${model}。`,
        );
        reasoningText = "";
        attemptResult = await runAttempt(true);
        if (attemptResult.overflow && !full) throw reasoningOverflowError(model);
      }
      const streamInfo = attemptResult.streamInfo;
      lastFinish = streamInfo.finishReason;
      sawReasoning = sawReasoning || streamInfo.sawReasoning;

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
      // 空正文要分辨是「超时被断」「只吐了思维链」还是「模型压根没吐内容」，
      // 否则只看到一句空内容不知所由
      const why = timedOut
        ? `已等满 ${Math.round(timeout / 1000)} 秒仍未见到正文`
        : lastFinish
          ? `finish_reason=${lastFinish}`
          : controller.signal.aborted
            ? "请求已被中止，未收到任何内容"
            : "整段流未收到任何内容片段";
      console.warn(`[aiClient][stream] 空正文：${why}，model=${model}${sawReasoning ? "，且只收到思维链" : ""}`);
      if (sawReasoning) {
        throw reasoningOnlyError(model, why);
      }
      throw new Error(`接口返回空内容（${why}），请检查后端的上游配置与模型名称。`);
    }
    if (timedOut) {
      // 断在半路：已收到的这些先按残篇收下，至少别让这一回合空着
      console.warn(
        `[aiClient][stream] 已等满 ${Math.round(timeout / 1000)} 秒仍未写完，按残篇收下 ${full.length} 字，model=${model}。`,
      );
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
    if (e instanceof ApiError) {
      // 内置服务（免费模型）被限流：弹一扇说明窗，别让玩家以为存档坏了
      if (e.status === 429 && !hasCustomApi(settings) && !opts.muteRateLimitNotice) notifyAiRateLimit();
      console.error(`[aiClient][stream] API Error ${e.status}: ${e.detail}`);
      throw e;
    }
    if (e instanceof DOMException && e.name === "AbortError") {
      // 到点自动断的：与「用户主动取消」分开说，别让人以为是自己的操作
      if (timedOut) {
        const secs = Math.round(timeout / 1000);
        if (full) {
          console.warn(
            `[aiClient][stream] 已等满 ${secs} 秒仍未写完，按残篇收下 ${full.length} 字，model=${model}。`,
          );
          return full;
        }
        if (sawReasoning) throw reasoningOnlyError(model, `已等满 ${secs} 秒`);
        throw new Error(
          `已等满 ${secs} 秒仍未收到正文，已中断，model=${model}。请检查模型是否可用，或换一档更快的模型。`,
        );
      }
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
        localServiceHint(endpoint) +
        `网络请求失败：${e.message}\n\n目标地址：${endpoint}\n\n可能原因：\n1. 后端服务未启动或已关闭\n2. 后端地址配置有误\n3. 跨域被拦截`,
      );
    }
    console.error("[aiClient][stream] Unexpected error:", e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
