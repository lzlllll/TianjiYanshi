/**
 * 存档工具。
 *
 * 导出与导入两头的格式必须对齐：导出可能被 gzip 压过（文件名 .json.gz），
 * 故导入一律按魔数判断是否压缩，压过的先解压再读，不能只看扩展名。
 * 三处入口（主界面存档管理、开局页、终局页）共用这里的实现，免得各写各的再走岔。
 */

import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { GAME_VERSION } from "@/lib/gameInfo";
import type { ConversationState, GameSnapshot, NPCChatState } from "@/data/types";

/**
 * 存档格式版本；日后若改结构，导入端照它判断。
 * 第 3 版起不再把 AI 接口设置写进存档，旧档里的 ai.settings 读入时一律忽略。
 */
export const SAVE_VERSION = 3;

/** 文件选择框的类型过滤：.gz 与 .json 一并认下 */
export const SAVE_ACCEPT = ".json,.gz,.json.gz";

/** 一份存档的形状；字段宽松读入，缺项或写错也只当没有 */
export interface SaveFileShape {
  v?: number;
  /** 写下这份存档时的游戏版本；旧档没有这一项 */
  gameVersion?: string;
  game?: unknown;
  /**
   * 旧档里曾把整份 AI 设置写在这里，包括 baseUrl 与 apiKey。
   * 现在只写推演记录与交谈记录；settings 只为兼容旧档读入，不再落回本机。
   */
  ai?: { settings?: unknown; conversation?: unknown; npcChat?: unknown };
  timestamp?: number;
}

/** 把当前进度打包成一份存档对象 */
export function buildSavePayload(): {
  v: number;
  gameVersion: string;
  game: GameSnapshot;
  ai: { conversation: ConversationState; npcChat: Pick<NPCChatState, "profiles"> };
  timestamp: number;
} {
  const game = useGameStore.getState().getSnapshot();
  const ai = useAIStore.getState();
  // 只留真正要带走的东西：进度、推演记录，以及尘缘里各人说过的话。
  // 推演接口的设置属于这一台机器，不随存档走：一来存档会被导出或上传，明文密钥不能跟着跑；
  // 二来读别人的档也不该把接口与密钥一并换掉。临时窗口状态同样不随存档走。
  return {
    v: SAVE_VERSION,
    // 版本摆在最前：列档时只读文件头便认得出这份旧档是哪个版本留下的
    gameVersion: GAME_VERSION,
    game,
    ai: {
      conversation: ai.conversation,
      npcChat: { profiles: Array.isArray(ai.npcChat.profiles) ? ai.npcChat.profiles : [] },
    },
    timestamp: Date.now(),
  };
}

/** 读档：把存档落回两处 store。落定后由调用方刷新页面 */
export function applySavePayload(data: SaveFileShape | null | undefined): void {
  if (!data) return;
  if (data.game) {
    useGameStore.getState().restoreSnapshot(data.game as GameSnapshot);
  }
  // 旧档携带的 ai.settings 一律不落回本机：接口地址、密钥与模型应留在当前这台机器上，
  // 否则读一份旧档就会把正在用的接口换成别人或早已失效的那一套。
  if (data.ai?.conversation) {
    useAIStore.getState().restoreConversation(data.ai.conversation as ConversationState);
  }
  // 旧档没有这一项：一并清空，免得这一局还留着上一局跟人说过的话
  useAIStore.getState().restoreNPCChat((data.ai?.npcChat ?? null) as Partial<NPCChatState> | null);
}

/** 存档可能被 gzip 压过：按魔数判断，压过的先解压，纯文本的照旧读 */
export async function decodeSaveBytes(buf: Uint8Array): Promise<string> {
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(buf);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("此存档是压缩过的，当前环境不支持解压，请换用较新的浏览器或改用游戏内存档管理。");
  }
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

/** 把存档文本压成 gzip 一并附上后缀；不支持压缩时退回纯文本 */
export async function encodeSaveText(text: string): Promise<{ blob: Blob; ext: string }> {
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
      return { blob: await new Response(stream).blob(), ext: ".gz" };
    } catch {
      /* 压不动就用未压缩的 */
    }
  }
  return { blob: new Blob([text], { type: "application/json" }), ext: "" };
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 弹系统文件选择框读一份存档，返回其字节；未选文件则返回 null。
 * 仅在无法使用游戏内存档夹（如网页版）时才退到这条路。
 */
export function pickSaveFile(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = SAVE_ACCEPT;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve(new Uint8Array(await file.arrayBuffer()));
    };
    input.click();
  });
}

/** 存档文件名用的时间戳，如 2026-10-14_09-30 */
export function saveStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}
