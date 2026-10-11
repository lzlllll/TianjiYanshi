import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { daySerial } from "@/lib/gameTime";
import { Coins, Hammer, X } from "lucide-react";

/**
 * 作坊报下的单子：说清楚要做什么之后，匠人开的价。
 * 看过这一纸单子再点头——应下便当面付清料钱工钱，改口便撂下再议。
 */
export function CraftOrderModal() {
  const pending = useAIStore((s) => s.npcChat.pendingCraft ?? null);
  const dismiss = useAIStore((s) => s.dismissCraftOffer);
  const stones = useGameStore((s) => s.spiritStones.low);
  const currentTime = useGameStore((s) => s.currentTime);
  const placeCustomOrder = useGameStore((s) => s.placeCustomOrder);

  const [error, setError] = useState("");

  if (!pending) return null;
  const { offer, giver, place, npcId, cityId, districtId } = pending;
  const today = daySerial(currentTime);
  const short = offer.price - stones;

  /** 应下这桩活：料钱工钱当面付清，记下一桩取货的约定 */
  const accept = () => {
    if (cityId === undefined || districtId === undefined) {
      setError("没弄清这是在哪一处作坊，改日再来。");
      return;
    }
    if (!placeCustomOrder({ offer, npcId, giver, place, cityId, districtId })) {
      setError("身上的灵石不够，这桩活接不下来。");
      return;
    }
    setError("");
    dismiss();
  };

  /** 撂下这纸单子：改口再说，或就此作罢 */
  const drop = () => {
    setError("");
    dismiss();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={drop} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-lg max-h-[80vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Hammer size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">说定的这一桩</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {place} · {giver}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1 font-serif text-xs text-paper-200">
              <Coins size={13} className="text-gold-400" />
              下品灵石 {stones}
            </span>
            <button
              onClick={drop}
              className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <ScrollCard className="!p-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 shrink-0 red-seal text-base">{offer.icon || offer.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <h4 className="font-brush text-base text-paper-50 truncate">{offer.name}</h4>
                <div className="font-serif text-[11px] text-paper-400/60 mt-0.5">
                  {offer.type} · {offer.grade}
                </div>
              </div>
            </div>

            <p className="font-serif text-[12px] text-paper-200/85 leading-relaxed mt-2">{offer.desc}</p>

            {offer.elements && Object.keys(offer.elements).length > 0 && (
              <p className="font-serif text-[11px] text-paper-400/55 mt-1.5">
                {Object.entries(offer.elements)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </p>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gold-500/15">
              <span className="font-serif text-[11px] text-paper-400/60">
                料钱工钱 <span className="font-number text-gold-400">{offer.price}</span> 枚下品灵石
              </span>
              <span className="font-serif text-[11px] text-paper-400/60">
                第 <span className="font-number text-gold-400">{today + offer.days}</span> 日取货
              </span>
            </div>
          </ScrollCard>

          <p className="font-serif text-xs text-paper-300/75 leading-relaxed">
            「{giver}」报了这份单子。应下便当面付清料钱工钱，日子一到回{place}取货；
            误了日子也不罚，只是东西还没做成，须得等到期满才取得走。
          </p>

          {short > 0 && (
            <p className="font-serif text-[11px] text-cinnabar-400">
              身上还差 {short} 枚下品灵石，这桩活接不下来。
            </p>
          )}
          {error && <p className="font-serif text-[11px] text-cinnabar-400">{error}</p>}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <SealButton onClick={accept} disabled={short > 0} className="px-4 py-2 text-sm">
              应下，付钱
            </SealButton>
            <SealButton variant="ghost" onClick={drop} className="px-4 py-2 text-sm">
              再议
            </SealButton>
          </div>
        </div>
      </div>
    </div>
  );
}
