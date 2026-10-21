/**
 * 存档工具。
 *
 * 导出与导入两头的格式必须对齐：导出可能被 gzip 压过（文件名 .json.gz），
 * 故导入一律按魔数判断是否压缩，压过的先解压再读，不能只看扩展名。
 * 三处入口（主界面存档管理、开局页、终局页）共用这里的实现，免得各写各的再走岔。
 */

import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import type { AISettings, ConversationState, GameSnapshot, NPCChatState } from "@/data/types";

/** 存档格式版本；日后若改结构，导入端照它判断 */
export const SAVE_VERSION = 2;

/** 文件选择框的类型过滤：.gz 与 .json 一并认下 */
export const SAVE_ACCEPT = ".json,.gz,.json.gz";

/** 一份存档的形状；字段宽松读入，缺项或写错也只当没有 */
export interface SaveFileShape {
  v?: number;
  game?: unknown;
  ai?: { settings?: unknown; conversation?: unknown; npcChat?: unknown };
  timestamp?: number;
}

/** 把当前进度打包成一份存档对象 */
export function buildSavePayload(): {
  v: number;
  game: GameSnapshot;
  ai: { settings: AISettings; conversation: ConversationState; npcChat: Pick<NPCChatState, "profiles"> };
  timestamp: number;
} {
  const game = useGameStore.getState().getSnapshot();
  const ai = useAIStore.getState();
  // 只留真正要带走的东西：进度、设置、推演记录，以及尘缘里各人说过的话；
  // 临时窗口状态不随存档走，免得读档一进来又弹出早先那一扇
  return {
    v: SAVE_VERSION,
    game,
    ai: {
      settings: ai.settings,
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
  if (data.ai?.settings) {
    useAIStore.getState().updateSettings(data.ai.settings as Partial<AISettings>);
  }
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
