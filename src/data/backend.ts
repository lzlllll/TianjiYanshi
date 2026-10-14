/**
 * 后端地址配置。
 *
 * 推演有两条路：
 *   一走后端（默认）：请求发到本服务，由后端带上密钥再向上游转发；
 *     密钥只放在后端侧——本地用环境变量 AI_BASE_URL / AI_API_KEY，
 *     线上用 Cloudflare Worker 的 secret（见独立的 tianji-ai-proxy 项目）。
 *   二走自定义接口：玩家自己在「自定义接口」里填齐地址与密钥时，绕开后端直连。
 *
 * 部署好后端后，把它的网址填到下面 BACKEND_BASE_URL；
 * 留空表示与游戏同源——本地服务版与打包后的 exe 正是这种情形，
 * 由内嵌的本地服务直接充当后端。
 */

import type { AISettings } from "@/data/types";

/** 后端根地址：已部署的 Cloudflare Worker；留空则与游戏同源（本地服务版与 exe） */
export const BACKEND_BASE_URL = "https://tianji-ai-proxy.lzl386588.workers.dev/";

/** 本地服务版本（本地服务与 exe）会把接口代理进同一个源，故视为已有后端 */
const SAME_ORIGIN_BACKEND =
  import.meta.env.DEV || import.meta.env.VITE_LOCAL_PROXY === "1";

/** 是否已接上可用的推演后端；没有后端时各处行动会被拦住并给出提示 */
export const AI_BACKEND_READY = Boolean(BACKEND_BASE_URL) || SAME_ORIGIN_BACKEND;

/** 把后端路径拼成可直接请求的地址；后端留空时即为同源相对路径 */
export function backendUrl(path: string): string {
  return `${BACKEND_BASE_URL.replace(/\/+$/, "")}${path}`;
}

/** 推演请求统一走这个口子 */
export const AI_CHAT_PATH = "/api/ai/chat/completions";

/**
 * 自定义接口是否填齐：地址与密钥都不空才算。
 * 填齐了便绕开后端，直接用玩家自己的接口。
 */
export function hasCustomApi(settings: Pick<AISettings, "baseUrl" | "apiKey">): boolean {
  return Boolean(settings.baseUrl?.trim() && settings.apiKey?.trim());
}

/** 推演是否可用：自带接口，或已接上后端，有其一即可 */
export function aiReady(settings: Pick<AISettings, "baseUrl" | "apiKey">): boolean {
  return hasCustomApi(settings) || AI_BACKEND_READY;
}
