import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { PAWN_DAYS, daysLeft, pawnPrice, pawnsAtShop } from "@/data/pawn";
import { manorKey } from "@/data/npcGen";
import { daySerial } from "@/lib/gameTime";
import type { InventoryItem, PawnTicket, Shop } from "@/data/types";
import { Coins, Scale, X } from "lucide-react";

/**
 * 当铺的柜上：押东西、赎当票。
 * 一件东西押进去当场换回七成价钱的灵石；过了期限不来赎，那件东西就归了当铺。
 * 当票认铺子——在哪家押的，只能回哪家赎。
 */
export function PawnModal({
  cityId,
  districtId,
  label,
  shop,
  onClose,
}: {
  cityId: string;
  districtId: number;
  label: string;
  shop: Shop;
  onClose: () => void;
}) {
  const key = manorKey(cityId, districtId);
  const live = useGameStore((s) => s.markets[key]?.shops.find((x) => x.id === shop.id)) ?? shop;
  const inventory = useGameStore((s) => s.inventory);
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const pawns = useGameStore((s) => s.pawns);
  const currentTime = useGameStore((s) => s.currentTime);
  const pawnItem = useGameStore((s) => s.pawnItem);
  const redeemPawn = useGameStore((s) => s.redeemPawn);

  const [view, setView] = useState<"pledge" | "redeem">("pledge");
  const [pickedId, setPickedId] = useState("");
  const [note, setNote] = useState("");

  const today = daySerial(currentTime);
  const tickets = pawnsAtShop(pawns, cityId, districtId, live.id);
  const picked: InventoryItem | undefined = inventory.find((i) => i.id === pickedId);
  const price = picked ? pawnPrice(picked, picked.count) : 0;

  /** 押当：东西离手，灵石入手，一张当票压在柜上 */
  const pledge = () => {
    if (!picked) return;
    const ticket = pawnItem({
      itemId: picked.id,
      shopId: live.id,
      shopName: live.name,
      cityId,
      districtId,
      count: picked.count,
    });
    if (!ticket) {
      setNote("这件东西押不出去。");
      return;
    }
    setNote(`当得 ${ticket.price} 下品灵石，「${ticket.item.name}」的当票压在柜上，第 ${ticket.dueDay} 日前可赎。`);
    setPickedId("");
  };

  /** 赎当：照当票上的数目赎回原物 */
  const redeem = (ticket: PawnTicket) => {
    if (redeemPawn(ticket.id)) {
      setNote(`花了 ${ticket.price} 下品灵石，赎回「${ticket.item.name}」。`);
    } else {
      setNote(`赎这一票要 ${ticket.price} 下品灵石，还差 ${ticket.price - stones}。`);
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-4xl max-h-[84vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Scale size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {label} · 押当得七成价，{PAWN_DAYS} 日内不赎即为死当
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1 font-serif text-xs text-paper-200">
              <Coins size={13} className="text-gold-400" />
              折合下品灵石 {stones}
            </span>
            <div className="flex rounded border border-gold-500/25 overflow-hidden">
              {([
                { id: "pledge" as const, label: "押当" },
                { id: "redeem" as const, label: `赎当${tickets.length > 0 ? `（${tickets.length}）` : ""}` },
              ]).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setNote("");
                  }}
                  className={
                    "px-3 py-1 font-serif text-xs transition " +
                    (view === item.id
                      ? "bg-gold-400/15 text-gold-400"
                      : "text-paper-400/60 hover:text-paper-200")
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {view === "pledge" ? (
            <>
              <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">能押的东西</h3>
              {inventory.length === 0 ? (
                <p className="font-serif text-xs text-paper-400/50 py-6 text-center">你身上没什么可押的。</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 items-start">
                  {inventory.map((item) => {
                    const chosen = pickedId === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setPickedId(item.id);
                          setNote("");
                        }}
                        className={
                          "text-left rounded border px-3 py-2 transition " +
                          (chosen
                            ? "border-gold-400/70 bg-gold-400/10"
                            : "border-gold-500/20 bg-ink-800/50 hover:border-gold-400/40")
                        }
                      >
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-brush text-sm text-paper-50 truncate">{item.name}</span>
                          <span className="font-serif text-[10px] text-paper-400/50 shrink-0">×{item.count}</span>
                        </div>
                        <div className="font-serif text-[10px] text-paper-400/55 mt-1">
                          {item.type} · {item.grade}
                          {item.mystery ? " · 看不出名堂" : ""}
                        </div>
                        <div className="font-number text-xs text-gold-400 mt-0.5">
                          可当 {pawnPrice(item, item.count)} 灵石
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {picked && (
                <ScrollCard className="!p-3 mt-4">
                  <div className="flex items-baseline gap-2">
                    <h4 className="font-brush text-base text-paper-50">{picked.name}</h4>
                    <span className="font-serif text-[11px] text-paper-400/60">
                      {picked.type} · {picked.grade} · ×{picked.count}
                    </span>
                  </div>
                  <p className="font-serif text-sm text-paper-200 leading-relaxed mt-1">{picked.desc}</p>
                  <p className="font-serif text-[11px] text-paper-400/55 mt-1.5">
                    押出去当得 {price} 下品灵石；第 {today + PAWN_DAYS} 日前回这家铺子，花 {price} 灵石赎回原物。
                    过了日子便是死当，东西归了当铺，再赎不回来。
                  </p>
                </ScrollCard>
              )}
            </>
          ) : (
            <>
              <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">
                柜上的当票<span className="font-serif text-[11px] text-paper-400/50 ml-2">只有在这家押的才赎得回</span>
              </h3>
              {tickets.length === 0 ? (
                <p className="font-serif text-xs text-paper-400/50 py-6 text-center">
                  这家柜上没有你的当票。
                </p>
              ) : (
                <div className="space-y-2.5">
                  {tickets.map((ticket) => {
                    const left = daysLeft(ticket, today);
                    const naked = ticket.price > stones;
                    return (
                      <ScrollCard key={ticket.id} className="!p-3">
                        <div className="flex items-baseline gap-2">
                          <span className="shrink-0 w-7 h-7 rounded flex items-center justify-center border border-gold-500/30 bg-ink-900/50 font-brush text-sm text-gold-400">
                            {ticket.item.icon || ticket.item.name.charAt(0)}
                          </span>
                          <h4 className="flex-1 min-w-0 font-brush text-base text-paper-50 truncate">
                            {ticket.item.name}
                          </h4>
                          <span className="font-serif text-[11px] text-paper-400/60 shrink-0">
                            {ticket.item.type} · {ticket.item.grade} · ×{ticket.item.count}
                          </span>
                        </div>
                        <p className="font-serif text-[11px] text-paper-400/60 mt-1.5">
                          赎价 {ticket.price} 下品灵石 · 押于第 {ticket.day} 日 · 第 {ticket.dueDay} 日到期
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span
                            className={
                              "font-serif text-[11px] " + (left <= 3 ? "text-cinnabar-400" : "text-paper-400/60")
                            }
                          >
                            {left > 0 ? `还剩 ${left} 日，过了就是死当` : "今日最后一天，明日便归当铺"}
                          </span>
                          <SealButton
                            onClick={() => redeem(ticket)}
                            disabled={naked}
                            className="px-4 py-1.5 text-xs shrink-0"
                          >
                            赎回（{ticket.price}）
                          </SealButton>
                        </div>
                        {naked && (
                          <p className="mt-1.5 font-serif text-[11px] text-cinnabar-400">
                            下品灵石不够，还差 {ticket.price - stones} 。
                          </p>
                        )}
                      </ScrollCard>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {note && <p className="font-serif text-xs text-gold-400/80 leading-relaxed pt-3">{note}</p>}

          <p className="font-serif text-[11px] text-paper-400/40 leading-relaxed pt-4">
            押当得的是行价的七成，赎回也照这个数目；当票压在柜上，{PAWN_DAYS} 日内不赎便作死当。
          </p>
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            {view === "pledge" ? (
              <>
                <SealButton disabled={!picked} onClick={pledge} className="px-4 py-2 text-sm">
                  {picked ? `押当「${picked.name}」（得 ${price}）` : "先挑一件东西"}
                </SealButton>
                <span className="font-serif text-[11px] text-paper-400/45">
                  押出去当场得灵石，日后回这家铺子花同样的数目赎回
                </span>
              </>
            ) : (
              <span className="font-serif text-[11px] text-paper-400/45">
                当票压在柜上，{PAWN_DAYS} 日内不赎便是死当
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
