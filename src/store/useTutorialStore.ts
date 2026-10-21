import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TUTORIALS, type TutorialId } from "@/data/tutorials";

/**
 * 新手引导的进度。
 *
 * 只管三样：眼下在走哪一套、走到第几步、哪几套已经看过。
 * 看过的记在本机，往后不再自动弹；想看可在顶栏菜单里重看一遍。
 */
interface TutorialState {
  activeId: TutorialId | null;
  step: number;
  seen: Partial<Record<TutorialId, boolean>>;
  /** 在设置里永久关掉自动引导；手动从顶栏菜单重看仍可用 force */
  disabled: boolean;
  setDisabled: (disabled: boolean) => void;
  /** 起一套引导；同时只走一套，看过的、或已永久关掉的，除非 force，不再自动弹出 */
  start: (id: TutorialId, force?: boolean) => void;
  next: () => void;
  prev: () => void;
  /** 中途退出也算看过，免得每回进这一页都被拦一次 */
  stop: () => void;
  reset: () => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set, get) => ({
      activeId: null,
      step: 0,
      seen: {},
      disabled: false,

      // 关掉时把正走着的那一套一并收起，免得设置关上了、眼前还悬着半套
      setDisabled: (disabled) =>
        set(disabled ? { disabled, activeId: null, step: 0 } : { disabled }),

      start: (id, force = false) => {
        const { activeId, seen, disabled } = get();
        if (activeId) return;
        if (!force && (disabled || seen[id])) return;
        set({ activeId: id, step: 0 });
      },

      next: () => {
        const { activeId, step } = get();
        if (!activeId) return;
        const total = TUTORIALS.find((t) => t.id === activeId)?.steps.length ?? 0;
        if (step + 1 < total) {
          set({ step: step + 1 });
          return;
        }
        set((s) => ({ activeId: null, step: 0, seen: { ...s.seen, [activeId]: true } }));
      },

      prev: () => set((s) => ({ step: Math.max(0, s.step - 1) })),

      stop: () =>
        set((s) => ({
          activeId: null,
          step: 0,
          seen: s.activeId ? { ...s.seen, [s.activeId]: true } : s.seen,
        })),

      reset: () => set({ activeId: null, step: 0, seen: {} }),
    }),
    {
      name: "xiuxian-tutorial",
      version: 1,
      // 走到哪一步不必留档：关掉页面再进来，从头再走一遍便是；
      // 永久关闭这一项要留着，设过便不再自动弹
      partialize: (s) => ({ seen: s.seen, disabled: s.disabled }),
    },
  ),
);
