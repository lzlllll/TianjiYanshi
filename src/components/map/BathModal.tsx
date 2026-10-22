import { useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { aliveBuffs } from "@/lib/buffTime";
import { formatTimeShort } from "@/lib/gameTime";
import {
  BATH_MAX_HOURS,
  BATH_PRICE_PER_HOUR,
  BATH_RELIEF_PER_HOUR,
  bathCost,
} from "@/data/bath";
import { cn } from "@/lib/utils";
import { Coins, Droplets, X } from "lucide-react";

/**
 * 浴堂的汤池：掏钱下汤，按时辰计。
 * 每泡一个时辰，身上的负面状态便往前挪八个时辰，挪过此刻的就算养好了。
 */
export function BathModal({
  label,
  shop,
  onClose,
}: {
  label: string;
  shop: { name: string };
  onClose: () => void;
}) {
  const buffs = useGameStore((s) => s.player.buffs);
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const currentTime = useGameStore((s) => s.currentTime);
  const takeBath = useGameStore((s) => s.takeBath);

  const [hours, setHours] = useState(1);
  const [result, setResult] = useState<{ washed: string[]; cost: number } | null>(null);
  const [error, setError] = useState("");

  const debuffs = useMemo(
    () => aliveBuffs(buffs, currentTime).filter((b) => b.isDebuff && b.durationType !== "instant"),
    [buffs, currentTime],
  );

  const cost = bathCost(hours);
  const short = cost - stones;

  /** 下汤：钱不够便进不去，身上没有不适也劝他别白花这份钱 */
  const soak = () => {
    setError("");
    const res = takeBath(hours);
    if (!res.ok) {
      setError(res.reason ?? "下不了汤。");
      return;
    }
    setResult({ washed: res.washed, cost: res.cost });
  };

  return (
    <div className="mainui-black fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Droplets size={18} className="text-jade-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{shop.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5">
                {label} · 汤池终日滚着，一个时辰 {BATH_PRICE_PER_HOUR} 枚下品灵石
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <ScrollCard title="身上的不适" subtitle="泡汤能化去的只有这些">
            {debuffs.length === 0 ? (
              <p className="font-serif text-xs text-paper-400/50 py-4 text-center">
                周身通泰，没什么要化的。
              </p>
            ) : (
              <ul className="space-y-2">
                {debuffs.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 px-3 py-2 rounded border border-cinnabar-500/25 bg-cinnabar-500/5"
                  >
                    <span className="shrink-0 w-7 h-7 rounded flex items-center justify-center bg-cinnabar-500/10 text-cinnabar-300 border border-cinnabar-500/25 text-sm">
                      {b.icon}
                    </span>
                    <span className="flex-1 min-w-0 font-serif text-sm text-paper-100 truncate">
                      {b.name}
                    </span>
                    <span className="shrink-0 font-serif text-[11px] text-paper-400/60">
                      {b.durationType === "until" && b.until
                        ? `持续到 ${formatTimeShort(b.until)}`
                        : b.durationType === "permanent"
                          ? "久缠不去"
                          : "另有所依"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ScrollCard>

          <ScrollCard title="下汤" subtitle={`每泡一个时辰，负面状态缩短 ${BATH_RELIEF_PER_HOUR} 个时辰`}>
            <div className="flex items-center gap-2 flex-wrap">
              {Array.from({ length: BATH_MAX_HOURS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setHours(n);
                    setResult(null);
                    setError("");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded border font-serif text-xs transition",
                    hours === n
                      ? "border-gold-400/60 bg-gold-500/15 text-gold-400"
                      : "border-paper-400/15 text-paper-400/70 hover:text-paper-100 hover:border-paper-400/30",
                  )}
                >
                  {n} 个时辰
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-1 font-serif text-xs text-paper-300/80">
                <Coins size={12} className="text-gold-400/80" />
                汤钱 {cost} 枚下品灵石
              </span>
              <SealButton
                onClick={soak}
                disabled={debuffs.length === 0 || short > 0}
                className="px-4 py-1.5 text-xs"
              >
                入汤
              </SealButton>
            </div>

            {debuffs.length === 0 && (
              <p className="mt-2 font-serif text-[11px] text-paper-400/45">
                身上没什么不适，不必白花这份钱。
              </p>
            )}
            {debuffs.length > 0 && short > 0 && (
              <p className="mt-2 font-serif text-[11px] text-cinnabar-400">
                下品灵石不够，还差 {short} 。
              </p>
            )}
            {error && <p className="mt-2 font-serif text-[11px] text-cinnabar-400">{error}</p>}
          </ScrollCard>

          {result && (
            <ScrollCard title="出浴" subtitle={`花了 ${result.cost} 枚下品灵石`}>
              <p className="font-serif text-sm leading-relaxed text-paper-100">
                热水漫过肩头，周身经络像是被熨过一遍。
                {result.washed.length > 0
                  ? `再起身时，${result.washed.join("、")}已经化得干干净净。`
                  : "虽未全消，身上的滞涩到底松快了些。"}
              </p>
              <p className="mt-2 font-serif text-[11px] text-paper-400/45">
                时辰也跟着过去了，外头的天色又变了一回。
              </p>
            </ScrollCard>
          )}
        </div>
      </div>
    </div>
  );
}
