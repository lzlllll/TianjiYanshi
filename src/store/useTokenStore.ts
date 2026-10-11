import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 一笔 AI 交互的 token 账 */
export interface TokenRecord {
  id: string;
  /** 记账时刻，毫秒时间戳 */
  at: number;
  /** 用的哪个模型 */
  model: string;
  /** 输入 tokens */
  prompt: number;
  /** 输出 tokens */
  completion: number;
  /** 合计 tokens */
  total: number;
  /** 这一笔在做什么：取请求里最后一段话的开头，便于辨认 */
  note: string;
}

/** 最多留多少笔；太多了存档会肿，超出的从头截掉 */
const MAX_RECORDS = 1000;

interface TokenStore {
  records: TokenRecord[];
  add: (rec: Omit<TokenRecord, "id" | "at">) => void;
  clear: () => void;
}

/**
 * AI 交互的 token 账。各处调用大模型时由 aiClient 记一笔，
 * 供游戏内「推演账」面板随时查询消耗。存在浏览器本地，重开也还在。
 */
export const useTokenStore = create<TokenStore>()(
  persist(
    (set) => ({
      records: [],
      add: (rec) =>
        set((s) => {
          const record: TokenRecord = {
            ...rec,
            id: `tk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            at: Date.now(),
          };
          const records = [record, ...s.records];
          return { records: records.length > MAX_RECORDS ? records.slice(0, MAX_RECORDS) : records };
        }),
      clear: () => set({ records: [] }),
    }),
    { name: "xiuxian-token-log", version: 1 },
  ),
);

/**
 * 供非 React 侧（aiClient）记一笔。usage 缺失或全为零时不记，
 * 免得把「没拿到用量」也当成一次消耗。
 */
export function recordTokenUsage(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined,
  note: string,
): void {
  if (!usage) return;
  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const total = Number(usage.total_tokens) || prompt + completion;
  if (prompt === 0 && completion === 0 && total === 0) return;
  useTokenStore.getState().add({ model: String(model || "未知模型"), prompt, completion, total, note });
}
