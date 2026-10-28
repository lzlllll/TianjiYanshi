import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { APPRAISE_MIN_FEE, appraiseFee } from "@/data/appraisal";
import type { AppraiseResult } from "@/data/types";
import { Coins, Gem, Loader2, X } from "lucide-react";

/**
 * 宝物阁的柜上：把收来的旧物搁上去，请行家过眼。
 * 行家看得准不准，一半看这件东西本身，一半看他有多大眼力。
 * 看出了名目，旧物就成了正经营生里认得的东西；说不出名目，这一眼不收钱。
 */
export function AppraiseModal({
  label,
  culture,
  shop,
  onClose,
}: {
  label: string;
  culture?: string;
  shop: { name: string };
  onClose: () => void;
}) {
  const inventory = useGameStore((s) => s.inventory);
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const payStones = useGameStore((s) => s.payStones);
  const identifyItem = useGameStore((s) => s.identifyItem);
  const appraiseItem = useAIStore((s) => s.appraiseItem);
  const shopStream = useAIStore((s) => s.shopStream);
  // 行家正说着，边写边看
  const streamText = shopStream.key === "appraise" ? shopStream.text : "";

  const [pickedId, setPickedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ narration: string; revealed: AppraiseResult["reading"] | null } | null>(null);
  const [error, setError] = useState("");

  // 只认那些还没看出名堂的旧物
  const mysteries = inventory.filter((i) => i.mystery);
  const picked = mysteries.find((i) => i.id === pickedId) ?? null;
  const fee = picked ? appraiseFee(picked) : 0;
  const short = fee - stones;

  /** 请行家过眼：看明白了才收钱，说不出名目的这一眼白送 */
  const appraise = async () => {
    if (!picked || busy) return;
    if (short > 0) {
      setError(`鉴定钱不够，还差 ${short}。`);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await appraiseItem({
        shop: shop.name,
        market: label,
        culture,
        itemName: picked.name,
        itemDesc: picked.desc,
        fee,
      });
      const ok = identifyItem({ itemId: picked.id, reading: res.reading });
      if (!ok) {
        setResult({ narration: res.narration, revealed: null });
        setError("行家看了半晌，到底没敢说这是什么。这一眼不收你的钱。");
        return;
      }
      payStones(fee);
      setResult({ narration: res.narration, revealed: res.reading });
      setPickedId("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[84vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Gem size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{shop.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {label} · 请人过眼，看一眼至少 {APPRAISE_MIN_FEE} 枚下品灵石
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1 font-serif text-xs text-paper-200">
              <Coins size={13} className="text-gold-400" />
              折合下品灵石 {stones}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <ScrollCard title="身上的旧物" subtitle="都是买来时没看出名堂的那些">
            {mysteries.length === 0 ? (
              <p className="font-serif text-xs text-paper-400/50 py-4 text-center">
                你身上没有还没看明白的旧物。旧货铺里常压着几件，可去逛逛。
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {mysteries.map((item) => {
                  const pickedNow = pickedId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setPickedId(item.id);
                        setResult(null);
                        setError("");
                      }}
                      className={
                        "text-left rounded border px-3 py-2 transition " +
                        (pickedNow
                          ? "border-gold-400/70 bg-gold-400/10"
                          : "border-gold-500/20 bg-ink-800/50 hover:border-gold-400/40")
                      }
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-brush text-sm text-paper-50 truncate">{item.name}</span>
                        {item.count > 1 && (
                          <span className="font-serif text-[10px] text-paper-400/50 shrink-0">×{item.count}</span>
                        )}
                      </div>
                      <p className="font-serif text-[11px] text-paper-400/55 mt-1 leading-relaxed line-clamp-2">
                        {item.desc}
                      </p>
                      <div className="font-number text-xs text-gold-400 mt-1">看这一眼要 {appraiseFee(item)}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {picked && (
              <div className="mt-3 flex items-center justify-between">
                <span className="font-serif text-[11px] text-paper-400/60">
                  行家过眼不打包票——看得准不准，也看他肯不肯说。
                </span>
                <SealButton
                  onClick={appraise}
                  disabled={busy || short > 0}
                  className="px-4 py-1.5 text-xs shrink-0"
                >
                  {busy && <Loader2 size={12} className="mr-1 animate-spin" />}
                  请人过眼（{fee}）
                </SealButton>
              </div>
            )}
            {picked && short > 0 && (
              <p className="mt-2 font-serif text-[11px] text-cinnabar-400">下品灵石不够，还差 {short} 。</p>
            )}
            {error && <p className="mt-2 font-serif text-[11px] text-cinnabar-400 leading-relaxed">{error}</p>}
          </ScrollCard>

          {busy && streamText && (
            <ScrollCard title="过眼" subtitle="行家正说着">
              <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">{streamText}</p>
            </ScrollCard>
          )}

          {result && (
            <ScrollCard title="过眼" subtitle={result.revealed ? "看明白了" : "没看明白"}>
              <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">
                {result.narration}
              </p>
              {result.revealed && (
                <div className="mt-3 pt-3 border-t border-gold-500/15">
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 w-7 h-7 rounded flex items-center justify-center border border-gold-500/30 bg-ink-900/50 font-brush text-sm text-gold-400">
                      {result.revealed.icon || result.revealed.name.charAt(0)}
                    </span>
                    <h4 className="font-brush text-base text-paper-50 truncate">{result.revealed.name}</h4>
                    <span className="font-serif text-[11px] text-paper-400/60 shrink-0">
                      {result.revealed.type} · {result.revealed.grade}
                    </span>
                  </div>
                  {result.revealed.desc && (
                    <p className="font-serif text-sm text-paper-200 leading-relaxed mt-2">
                      {result.revealed.desc}
                    </p>
                  )}
                  {result.revealed.elements && Object.keys(result.revealed.elements).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(result.revealed.elements).map(([elem, value]) => (
                        <span
                          key={elem}
                          className="px-2 py-0.5 rounded border border-gold-500/25 bg-ink-900/40 font-serif text-[11px] text-gold-400/80"
                        >
                          {elem} {value > 0 ? `+${value}` : value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScrollCard>
          )}
        </div>
      </div>
    </div>
  );
}
