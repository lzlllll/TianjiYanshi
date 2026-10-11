import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { ChangeNotice } from "@/components/ui/ChangeNotice";
import { cn } from "@/lib/utils";
import type { DataOp } from "@/data/types";
import { AlertTriangle, Loader2, Sparkles, Trees, X } from "lucide-react";

/** 点开一处林地时要看的东西 */
export interface ForestTarget {
  /** 面板抬头，如「长安·林地 3排5列」 */
  label: string;
  /** 该城文化背景，探索时一并交给模型 */
  culture?: string;
}

/** 三档时长：走得越久，得物与遇事的可能越大，耗去的时辰也越多 */
const DURATIONS: { hours: number; name: string; hint: string }[] = [
  { hours: 1, name: "信步", hint: "一个时辰，随手看看" },
  { hours: 6, name: "搜寻", hint: "半日，仔细翻找" },
  { hours: 12, name: "穷搜", hint: "一整日，翻遍山林" },
];

/**
 * 一处林地的探索。
 * 先择时长再走一趟：这一趟的得失交模型裁定，得的物照旧落账，
 * 探出的动静另开一桩变故。时长是定数——探了几个时辰，时辰便走几个。
 */
export function ForestExploreModal({ label, culture, onClose }: ForestTarget & { onClose: () => void }) {
  const exploreForest = useAIStore((s) => s.exploreForest);
  /** 选中的时长，默认半日 */
  const [hours, setHours] = useState(6);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [ops, setOps] = useState<DataOp[]>([]);
  const [eventReason, setEventReason] = useState("");
  const [error, setError] = useState("");

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await exploreForest({ place: label, culture, hours });
      setText(res.text);
      setOps(res.ops);
      setEventReason(res.eventReason);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 收起这一趟的账，回到择时长的当口，好再探一趟 */
  const reset = () => {
    setText("");
    setOps([]);
    setEventReason("");
    setError("");
  };

  return (
    <div className="mainui-black fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Trees size={18} className="text-jade-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">林地</h2>
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

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded border border-cinnabar-500/50 bg-cinnabar-500/10 px-3 py-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-cinnabar-300" />
              <p className="font-serif text-xs leading-relaxed text-cinnabar-300">{error}</p>
            </div>
          )}

          {!text ? (
            <>
              <p className="font-serif text-sm leading-relaxed text-paper-300/85">
                城边这一片林子草木深密，寻常少有人来。想探得东西、撞见动静，全凭走得多远、翻得多细——
                走得越久，得着的与遇见的事都越多，耗去的时辰也越久。
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.hours}
                    type="button"
                    disabled={busy}
                    onClick={() => setHours(d.hours)}
                    className={cn(
                      "rounded border px-3 py-2 text-left transition",
                      hours === d.hours
                        ? "border-gold-400 bg-gold-500/20"
                        : "border-gold-500/25 bg-ink-900/70 hover:border-gold-400/60",
                    )}
                  >
                    <div className="font-brush text-sm text-paper-50">{d.name}</div>
                    <div className="mt-0.5 font-serif text-[11px] leading-relaxed text-paper-400/70">{d.hint}</div>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <SealButton onClick={() => void run()} disabled={busy} className="px-5">
                  {busy ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" /> 探着……
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={14} /> 探索
                    </span>
                  )}
                </SealButton>
              </div>
            </>
          ) : (
            <>
              <div className="rounded border border-gold-500/25 bg-ink-900/60 p-4">
                <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">{text}</p>
                <ChangeNotice ops={ops} />
              </div>
              {eventReason && (
                <p className="mt-3 font-serif text-xs leading-relaxed text-cinnabar-300">
                  林中动静引出一桩变故：{eventReason}——就此应付。
                </p>
              )}
              <div className="mt-4">
                <SealButton variant="outline" onClick={reset} disabled={busy} className="px-4">
                  再探一趟
                </SealButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
