/**
 * 模型 429 的全局提醒。
 *
 * 请求重试尽了仍是 429 时，由 aiClient 派发一次事件；
 * 界面顶层的提示窗接住它即可，各调用处不必各写一遍错误处理。
 */
export const AI_RATE_LIMIT_EVENT = "tianji:ai-rate-limit";

/** 内置 AI 服务被限流：通知界面弹一扇提示窗 */
export function notifyAiRateLimit(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AI_RATE_LIMIT_EVENT));
}
