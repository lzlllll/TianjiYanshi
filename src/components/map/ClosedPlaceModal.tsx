import { useEffect, useRef, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { SealButton } from "@/components/ui/SealButton";
import { ChangeNotice } from "@/components/ui/ChangeNotice";
import { cn } from "@/lib/utils";
import type { DataOp } from "@/data/types";
import { AlertTriangle, Landmark, Loader2, Send, X } from "lucide-react";

/** 点开官署或寺观时要看的东西 */
export interface ClosedPlaceTarget {
  /** 面板抬头，如「长安·京兆府衙」 */
  label: string;
  /** 街区性质：政府部门 或 宗教场所 */
  nature: string;
  /** 该城文化背景，写叙事时一并交给模型 */
  culture?: string;
}

interface ClosedPlaceTurn {
  /** 玩家自述要做的事 */
  player: string;
  /** 这一回写出来的叙事 */
  text: string;
  /** 这一段落到账上的变化 */
  ops: DataOp[];
}

/**
 * 官府与寺观这两处还没做成常设界面，可差事照旧能点在这里。
 * 玩家自述要做什么，就照这一处的规矩写一段；交差、见人、了结都走同一条结算。
 */
export function ClosedPlaceModal({
  label,
  nature,
  culture,
  onClose,
}: ClosedPlaceTarget & { onClose: () => void }) {
  const visitClosedPlace = useAIStore((s) => s.visitClosedPlace);
  const quests = useGameStore((s) => s.quests);
  const [turns, setTurns] = useState<ClosedPlaceTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const office = nature === "政府部门";
  const title = office ? "官署" : "寺观";
  const intro = office
    ? "衙门前石狮森然，鸣冤鼓立在阶下。递状子、求见主事、向差役打听，或只在廊下听人说话——你想做什么，写下便是。"
    : "山门里香烟缭绕，钟磬断续。上香、求签、请人解签，或与执事、香客攀谈——你想做什么，写下便是。";
  const hints = office
    ? ["递上状纸，求见主事", "向门房打听近来可有差事", "在廊下听差役闲话"]
    : ["上一炷香，向执事问事", "求一支签，请人解签", "与香客攀谈，打听消息"];

  // 身上有差事正点在这一处的，先摊出来，省得忘了是来做什么的
  const errands = (Array.isArray(quests) ? quests : []).filter(
    (q) => q.status === "open" && (q.place === label || q.target?.label === label),
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  const submit = async () => {
    const ask = input.trim();
    if (!ask || busy) return;
    setBusy(true);
    setError("");

    // 先前几回一并带上，免得这一回接不上前话
    const history = turns.flatMap((t) => [
      { role: "player" as const, text: t.player },
      { role: "narrator" as const, text: t.text },
    ]);

    try {
      const res = await visitClosedPlace({ place: label, nature, culture, action: ask, history });
      setTurns((list) => [...list, { player: ask, text: res.text, ops: res.ops }]);
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div
      className="mainui-black fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl h-[78vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Landmark size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{title}</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5 truncate">{label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
          {turns.length === 0 && (
            <div className="rounded border border-gold-500/25 bg-ink-900/50 p-4">
              <p className="font-serif text-sm leading-relaxed text-paper-300/85">{intro}</p>
              <p className="mt-2 font-serif text-[11px] leading-relaxed text-paper-400/50">
                此处尚未设常设界面，但差事若点在这一处，照旧可以在此办事、交差。
              </p>

              {errands.length > 0 && (
                <div className="mt-3 border-t border-gold-500/20 pt-3">
                  <p className="font-serif text-[11px] text-gold-300/85">你为此处来的事：</p>
                  <ul className="mt-1 space-y-1.5">
                    {errands.map((q) => (
                      <li key={q.id} className="font-serif text-xs leading-relaxed text-paper-200">
                        · {q.name}
                        {q.condition && (
                          <span className="block pl-3 text-[11px] text-paper-400/60">交差：{q.condition}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded border border-cinnabar-500/50 bg-cinnabar-500/10 px-3 py-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-cinnabar-300" />
              <p className="font-serif text-xs leading-relaxed text-cinnabar-300">{error}</p>
            </div>
          )}

          {turns.map((turn, i) => (
            <div key={i} className="rounded border border-paper-400/10 bg-ink-900/40 p-4">
              <p className="font-serif text-xs text-gold-300/90">你：{turn.player}</p>
              <p className="mt-2 whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
                {turn.text}
              </p>
              <ChangeNotice ops={turn.ops} />
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 rounded border border-gold-500/20 bg-ink-900/40 px-4 py-3">
              <Loader2 size={14} className="animate-spin text-gold-400" />
              <span className="font-serif text-xs text-paper-400/70">此处正斟酌着如何应你……</span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="shrink-0 border-t border-gold-500/20 bg-ink-800/95 px-6 py-3">
          {turns.length === 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {hints.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  disabled={busy}
                  onClick={() => setInput(hint)}
                  className={cn(
                    "rounded border border-gold-500/25 bg-ink-900/70 px-2.5 py-1",
                    "font-serif text-[11px] text-paper-400/80 transition",
                    "hover:border-gold-400/60 hover:text-paper-100",
                  )}
                >
                  {hint}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
              placeholder={"写下你打算做什么……\n（Ctrl/Cmd + Enter 送出）"}
              rows={2}
              className="flex-1 input-ink resize-none leading-relaxed"
              style={{ fontFamily: '"Noto Serif SC", serif' }}
            />
            <SealButton
              onClick={() => void submit()}
              disabled={!input.trim() || busy}
              className="shrink-0 px-4"
            >
              {busy ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" /> 写着……
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Send size={14} /> 行事
                </span>
              )}
            </SealButton>
          </div>
        </div>
      </div>
    </div>
  );
}
