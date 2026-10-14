import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { GAME_TITLE_BOOK, GAME_SIGNATURE } from "@/lib/gameInfo";
import { Download, FolderOpen, Loader2, RotateCcw, ScrollText, Sparkles } from "lucide-react";

/**
 * 终局页。
 * 气血耗尽或寿元用尽时压在最上层，给出去处：读档、导出这一世的叙事、
 * 请 AI 为这一世写一段盖棺定论，或退回主菜单重开一世。
 */
export function EndingScreen() {
  const ending = useGameStore((s) => s.ending);
  const turns = useAIStore((s) => s.conversation.turns);
  const appraiseEnding = useAIStore((s) => s.appraiseEnding);

  const [appraisal, setAppraisal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!ending) return null;

  /** 这一世的叙事：把每一轮回合的玩家心意与正文串起来 */
  const narrativeOf = () =>
    turns.map((t) => `【我】${t.playerInput}\n【叙】${t.narrative}`).join("\n\n");

  const exportNarrative = () => {
    const text = `${GAME_TITLE_BOOK} —— 一世叙事\n终局：${ending.reason}\n\n${narrativeOf()}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `一世叙事_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const appraise = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const text = await appraiseEnding(narrativeOf() || "（这一世尚无叙事留下）");
      setAppraisal(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 读档走游戏内的存档管理窗，不再弹系统文件选择框
  const loadSave = () => {
    useAIStore.getState().setSaveManagerOpen(true);
  };

  const backToMenu = () => {
    if (!confirm("回到主菜单？当前这一世的进度将不再保留。")) return;
    useGameStore.getState().resetGame();
    useAIStore.getState().resetLedger();
    window.location.reload();
  };

  return (
    <div className="mainui-black fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/85 backdrop-blur-md" />

      <div className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="px-8 pt-7 pb-4 border-b border-gold-500/20 text-center">
          <div className="font-brush text-3xl text-gold-400 tracking-[0.3em]">终</div>
          <p className="font-serif text-sm text-ink-medium mt-3 leading-relaxed">{ending.reason}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SealButton variant="ghost" onClick={loadSave} className="px-4 py-2 text-sm">
              <span className="flex items-center gap-1.5"><FolderOpen size={14} /> 读档</span>
            </SealButton>
            <SealButton variant="ghost" onClick={exportNarrative} className="px-4 py-2 text-sm">
              <span className="flex items-center gap-1.5"><Download size={14} /> 导出叙事</span>
            </SealButton>
            <SealButton onClick={() => void appraise()} disabled={busy} className="px-4 py-2 text-sm">
              <span className="flex items-center gap-1.5">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {busy ? "正在评说……" : "请人评说这一世"}
              </span>
            </SealButton>
            <SealButton variant="ghost" onClick={backToMenu} className="px-4 py-2 text-sm text-cinnabar-600">
              <span className="flex items-center gap-1.5"><RotateCcw size={14} /> 退回主菜单</span>
            </SealButton>
          </div>

          {error && <p className="font-serif text-xs text-cinnabar-600 pt-4 text-center leading-relaxed">{error}</p>}

          {appraisal && (
            <div className="mt-5 rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <ScrollText size={13} className="text-gold-500" />
                <span className="font-brush text-sm text-ink-dark">盖棺定论</span>
              </div>
              <p className="font-serif text-sm text-ink-dark leading-relaxed whitespace-pre-wrap">{appraisal}</p>
            </div>
          )}

          <p className="mt-6 text-center font-number text-[11px] text-paper-400/50">{GAME_SIGNATURE}</p>
        </div>
      </div>
    </div>
  );
}
