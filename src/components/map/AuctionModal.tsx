import { useEffect, useRef, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { SealButton } from "@/components/ui/SealButton";
import { lowStonesWorth } from "@/data/spiritStones";
import { AUCTION_SILENT_ROUNDS, auctionNextBid } from "@/data/auction";
import { daySerial } from "@/lib/gameTime";
import { cn } from "@/lib/utils";
import { AlertTriangle, Coins, Gavel, Loader2 } from "lucide-react";

/**
 * 宝物阁拍卖那一扇窗。
 *
 * 拍品与来客由叙事先写定，叫价由本地按来客的性子推演：
 * 玩家每加一口，客人便轮着应一轮；连着三轮无人加价，掌槌的便落槌。
 * 玩家执牌到落槌，东西归他、灵石照扣；客人执牌则只能看着它被人取走。
 */
export function AuctionModal() {
  const auction = useAIStore((s) => s.auction);
  const bidAuction = useAIStore((s) => s.bidAuction);
  const passAuction = useAIStore((s) => s.passAuction);
  const closeAuction = useAIStore((s) => s.closeAuction);
  const auctions = useGameStore((s) => s.auctions);
  const currentTime = useGameStore((s) => s.currentTime);
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));

  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const found = (Array.isArray(auctions) ? auctions : []).find((a) => a.id === auction.id);
  const lot = found?.lot;
  const bidders = found?.bidders ?? [];
  const lines = found?.lines ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines.length, found?.status, auction.busy]);

  if (!auction.active) return null;

  const done = found?.status === "done";
  const next = found ? auctionNextBid(found) : 0;
  const high = found?.highBid ?? 0;
  const leader = found ? (found.leaderId === "player" ? "你" : (bidders.find((b) => b.id === found.leaderId)?.name ?? "尚无人应价")) : "";
  const silent = found?.silent ?? 0;
  const shortOfStones = next > stones;
  const leading = found?.leaderId === "player" && high > 0;
  const busy = auction.busy || pending;
  const today = daySerial(currentTime);

  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[66] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 animate-inkSpread" />

      <div
        className="scroll-card corner-ornament relative flex h-[78vh] w-full max-w-2xl flex-col rounded-lg"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-gold-500 bg-ink-800 px-6 py-4 cloud-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="red-seal flex h-10 w-10 shrink-0 items-center justify-center rounded-sm font-brush text-lg">拍</div>
            <div className="min-w-0">
              <h2 className="truncate font-brush text-xl tracking-widest text-gold-400">{found?.shopName || "宝物阁"}</h2>
              <p className="mt-0.5 font-serif text-xs text-paper-400">
                宝物阁 · 拍卖{found ? `　·　第 ${Math.max(1, (found.round ?? 0) + (done ? 0 : 1))} 轮` : ""}
                {done ? "　·　已落槌" : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex items-center gap-1 font-serif text-xs text-paper-200">
              <Coins size={13} className="text-gold-400" />
              折合下品灵石 {stones}
            </span>
            <button
              type="button"
              onClick={closeAuction}
              className="rounded border-2 border-paper-400 px-3 py-1 font-serif text-xs text-paper-300 transition hover:border-gold-400 hover:text-paper-50"
            >
              收起
            </button>
          </div>
        </div>

        {auction.errorMsg && (
          <div className="flex items-start gap-2 border-b-2 border-cinnabar-500 bg-cinnabar-500 px-6 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-cinnabar-300" />
            <p className="font-serif text-xs leading-relaxed text-cinnabar-300">{auction.errorMsg}</p>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {(auction.opening || found?.opening) && (
            <div className="rounded border-2 border-gold-500 bg-ink-950 p-4 paper-aged">
              <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
                {found?.opening || auction.opening}
              </p>
            </div>
          )}

          {lot && (
            <div className="rounded border-2 border-gold-500/50 bg-ink-900 p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="font-brush text-lg text-gold-400">{lot.name}</h3>
                <span className="font-serif text-[11px] text-paper-400">
                  {lot.kind} · {lot.grade}
                </span>
              </div>
              {lot.story && (
                <p className="mt-1 font-serif text-xs leading-relaxed text-paper-400">{lot.story}</p>
              )}
              {lot.use && (
                <p className="mt-1 font-serif text-sm leading-relaxed text-paper-200">{lot.use}</p>
              )}
              <p className="mt-2 font-number text-xs text-gold-400">起拍 {lot.basePrice} 枚下品灵石</p>
            </div>
          )}

          {bidders.length > 0 && (
            <div className="rounded border-2 border-paper-400/30 bg-ink-900 p-3">
              <p className="mb-2 font-brush text-sm text-paper-300">到场的人</p>
              <ul className="space-y-1.5">
                {bidders.map((b) => (
                  <li key={b.id} className="flex items-baseline gap-2 font-serif text-xs">
                    <span className={cn("shrink-0", b.out ? "text-paper-400/40 line-through" : "text-paper-100")}>
                      {b.name}
                    </span>
                    <span className="text-paper-400/60">{b.identity}</span>
                    {b.persona && <span className="text-paper-400/45">{b.persona}</span>}
                    {b.id === found?.leaderId && !done && (
                      <span className="ml-auto shrink-0 text-gold-400">执牌</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lot && (
            <div className="rounded border-2 border-gold-500/40 bg-ink-950 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-serif text-xs text-paper-400">
                  眼下最高价 <span className="font-number text-base text-gold-400">{high}</span> 枚
                </span>
                <span className="font-serif text-xs text-paper-300">执牌：{leader}</span>
              </div>
              {!done && (
                <p className="mt-1 font-serif text-[11px] text-paper-400/60">
                  连着 {silent}/{AUCTION_SILENT_ROUNDS} 轮无人加价便落槌
                </p>
              )}
            </div>
          )}

          {lines.length > 0 && (
            <div className="space-y-1.5">
              {lines.slice(-8).map((l, i) => (
                <p
                  key={`${i}-${l.who}-${l.price ?? 0}`}
                  className={cn(
                    "font-serif text-xs leading-relaxed",
                    l.player ? "text-gold-300" : "text-paper-300",
                  )}
                >
                  {l.text}
                </p>
              ))}
              <div ref={endRef} />
            </div>
          )}

          {busy && !auction.busy && (
            <div className="flex items-center gap-2 font-serif text-xs text-paper-400">
              <Loader2 size={13} className="animate-spin" />
              掌槌的在应价，稍候。
            </div>
          )}
          {auction.busy && (
            <div className="flex items-center gap-2 font-serif text-xs text-paper-400">
              <Loader2 size={13} className="animate-spin" />
              阁里正在陈设拍品、安置来客……
            </div>
          )}

          {done && (
            <div className="rounded border-2 border-gold-500 bg-ink-900 p-4">
              <div className="flex items-center gap-2">
                <Gavel size={14} className="text-gold-400" />
                <span className="font-brush text-sm text-gold-400">
                  {found?.winnerName && found.winnerName !== "无人"
                    ? `${found.winnerName}得了${lot ? `「${lot.name}」` : "这一件"}`
                    : "流拍"}
                </span>
                {found?.won && <span className="font-serif text-[11px] text-paper-400">已收进行囊</span>}
              </div>
              {found?.result && (
                <p className="mt-2 whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
                  {found.result}
                </p>
              )}
            </div>
          )}
        </div>

        {!done && lot && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t-2 border-gold-500/40 bg-ink-800/95 px-6 py-3">
            <SealButton
              variant="seal"
              onClick={() => void act(bidAuction)}
              disabled={busy || shortOfStones || leading}
              className="px-4 py-2 text-xs"
            >
              <Gavel size={13} className="mr-1" />
              {leading ? "已是你执牌" : high > 0 ? `加到 ${next} 枚` : `开价 ${next} 枚`}
            </SealButton>
            <SealButton
              variant="ghost"
              onClick={() => void act(passAuction)}
              disabled={busy}
              className="px-4 py-2 text-xs"
            >
              按兵不动
            </SealButton>
            {shortOfStones && (
              <span className="font-serif text-[11px] text-cinnabar-300">囊中不够叫这一口，只能看着。</span>
            )}
            <span className="ml-auto font-serif text-[11px] text-paper-400/50">
              {found && found.day < today ? "这一场已过了日子" : "落槌之前都能再叫"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
