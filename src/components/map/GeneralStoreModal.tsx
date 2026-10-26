import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { HaggleModal } from "@/components/map/HaggleModal";
import { AppraiseModal } from "@/components/map/AppraiseModal";
import { manorKey } from "@/data/npcGen";
import { goodDesc, goodPrice, itemSalePrice, itemSalePriceFor } from "@/data/goods";
import { formatGameTime } from "@/lib/gameTime";
import type { Good, InventoryItem, Shop } from "@/data/types";
import { Coins, Gem, MessageSquare, Tag, User, X } from "lucide-react";

/** 议价的标的：买入议的是货，卖出议的是行囊里的一样东西 */
export interface HaggleSubject {
  mode: "buy" | "sell";
  /** 货名或物名 */
  name: string;
  /** 件数 */
  count: number;
  /** 原价，即铺面标价或掌柜起初的出价（整笔的价钱） */
  basePrice: number;
  /** 买入时的货名 */
  goodName?: string;
  /** 柜底那件收来的旧物，掌柜自己也不知道是什么 */
  mystery?: boolean;
  /** 卖出时的行囊条目 id */
  itemId?: string;
}

/** 一家杂货铺的柜台：货架、行囊、买与卖 */
export function GeneralStoreModal({
  cityId,
  districtId,
  label,
  culture,
  shop,
  onClose,
}: {
  cityId: string;
  districtId: number;
  label: string;
  culture?: string;
  shop: Shop;
  onClose: () => void;
}) {
  const key = manorKey(cityId, districtId);
  const live = useGameStore((s) => s.markets[key]?.shops.find((x) => x.id === shop.id)) ?? shop;
  const currentTime = useGameStore((s) => s.currentTime);
  const priceAdjusts = useGameStore((s) => s.priceAdjusts);
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const inventory = useGameStore((s) => s.inventory);
  const buyGood = useGameStore((s) => s.buyGood);
  const sellItem = useGameStore((s) => s.sellItem);

  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [pickedGood, setPickedGood] = useState("");
  const [pickedItem, setPickedItem] = useState("");
  /** 卖出时从这一组里取几件：默认一件，可自己改，也可一键全卖 */
  const [sellCount, setSellCount] = useState(1);
  const [haggling, setHaggling] = useState<{ mode: "buy" | "sell"; subject: HaggleSubject | null } | null>(
    null,
  );
  const [note, setNote] = useState("");
  /** 宝物阁另有看旧物的营生：柜上的行家能给收来的旧物过眼 */
  const [appraising, setAppraising] = useState(false);

  const keeper = live.keeper;
  // 断货的不再摆上货架：数量归零就当没这一样
  const goods: Good[] = (live.goods ?? []).filter((g) => g.stock > 0);

  const priceOf = (g: Good) => goodPrice(g.name, g.base, currentTime, priceAdjusts);
  const selectedGood = goods.find((g) => g.name === pickedGood) ?? null;
  const selectedItem: InventoryItem | undefined = inventory.find((i) => i.id === pickedItem);
  /** 这一组要卖出几件：夹在 1 到存货数之间 */
  const sellTake = selectedItem ? Math.max(1, Math.min(Math.trunc(sellCount) || 1, selectedItem.count)) : 0;
  const sellTotal = selectedItem ? itemSalePriceFor(selectedItem, sellTake) : 0;

  /** 按标价直接买下 */
  const buyNow = (g: Good) => {
    const price = priceOf(g);
    if (buyGood({ key, shopId: live.id, goodName: g.name, price })) {
      setNote(`买下${g.name}，付了 ${price} 下品灵石。`);
    } else {
      setNote(g.stock <= 0 ? `${g.name}已经断货了。` : `下品灵石不够，还差 ${price - stones}。`);
    }
  };

  /** 按掌柜起初的价直接卖，卖几件照选定的数目 */
  const sellNow = (item: InventoryItem) => {
    const count = Math.max(1, Math.min(sellTake, item.count));
    const total = itemSalePriceFor(item, count);
    if (sellItem({ itemId: item.id, totalPrice: total, count })) {
      setNote(`卖出「${item.name}」${count} 件，得 ${total} 下品灵石。`);
      setPickedItem("");
      setSellCount(1);
    } else {
      setNote("这笔买卖没成。");
    }
  };

  /** 讲定价之后落账；返回空串表示成了，返回文字表示不成 */
  const settle = (subject: HaggleSubject, price: number): string => {
    if (subject.mode === "buy") {
      const ok = buyGood({ key, shopId: live.id, goodName: subject.goodName!, price });
      return ok ? "" : "灵石不够，或是货已经断了。";
    }
    const ok = sellItem({ itemId: subject.itemId!, totalPrice: price, count: subject.count });
    return ok ? "" : "这笔买卖没成。";
  };

  /** 这一样货眼下有没有被叙事调过行情 */
  const hasOddPrice = (name: string) => priceAdjusts.some((a) => a.good === name);

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-4xl max-h-[84vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Tag size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {label} · {keeper ? `${keeper.name}（${keeper.title}）` : "掌柜不在"}
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

        <div className="flex-1 overflow-hidden flex">
          {/* 左侧：看货还是找掌柜说话 */}
          <aside className="w-40 shrink-0 border-r border-gold-500/15 px-3 py-4 space-y-2">
            <SealButton
              variant={mode === "sell" ? "seal" : "ghost"}
              onClick={() => {
                setMode("sell");
                setNote("");
                // 点这一下就开口：窗口直接开，谈什么进窗口再挑
                setHaggling({
                  mode: "sell",
                  subject: selectedItem
                    ? {
                        mode: "sell",
                        name: selectedItem.name,
                        count: selectedItem.count,
                        basePrice: itemSalePrice(selectedItem),
                        itemId: selectedItem.id,
                      }
                    : null,
                });
              }}
              className="w-full px-2 py-2 text-xs"
            >
              <MessageSquare size={12} className="mr-1" />
              和掌柜交谈
            </SealButton>
            <SealButton
              variant={mode === "buy" ? "seal" : "ghost"}
              onClick={() => {
                setMode("buy");
                setNote("");
              }}
              className="w-full px-2 py-2 text-xs"
            >
              看货架
            </SealButton>

            {live.kind === "宝物阁" && (
              <SealButton
                variant="ghost"
                onClick={() => {
                  setNote("");
                  setAppraising(true);
                }}
                className="w-full px-2 py-2 text-xs"
              >
                <Gem size={12} className="mr-1" />
                请人鉴宝
              </SealButton>
            )}

            {keeper && (
              <div className="pt-3 border-t border-gold-500/15">
                <div className="flex items-center gap-2">
                  <User size={12} className="text-gold-400/70 shrink-0" />
                  <span className="font-brush text-sm text-paper-100 truncate">{keeper.name}</span>
                </div>
                <p className="font-serif text-[11px] text-paper-400/60 mt-1 leading-relaxed">
                  {keeper.title}
                  {keeper.personality ? ` · ${keeper.personality}` : ""}
                </p>
              </div>
            )}
          </aside>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {mode === "buy" ? (
              <>
                <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">货架</h3>
                {goods.length === 0 ? (
                  <p className="font-serif text-xs text-paper-400/50 py-6 text-center">货架上空着。</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 items-start">
                    {goods.map((g, index) => {
                      const price = priceOf(g);
                      const gap = price - g.base;
                      const picked = pickedGood === g.name;
                      return (
                        <button
                          key={`${g.name}-${index}`}
                          onClick={() => {
                            setPickedGood(g.name);
                            setNote("");
                          }}
                          className={
                            "text-left rounded border px-3 py-2 transition " +
                            (picked
                              ? "border-gold-400/70 bg-gold-400/10"
                              : "border-gold-500/20 bg-ink-800/50 hover:border-gold-400/40")
                          }
                        >
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-brush text-sm text-paper-50 truncate">{g.name}</span>
                            <span className="font-serif text-[10px] text-paper-400/50 shrink-0">
                              存{g.stock}
                            </span>
                          </div>
                          {/* 收来的旧物：看得出是什么样子，看不出究竟是什么 */}
                          {g.mystery && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded border border-gold-500/30 font-serif text-[10px] text-gold-400/70">
                              看不出名堂
                            </span>
                          )}
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="font-number text-xs text-gold-400">{price}</span>
                            <span className="font-serif text-[10px] text-paper-400/50">灵石</span>
                            {gap !== 0 && (
                              <span
                                className={
                                  "font-serif text-[10px] " + (gap > 0 ? "text-cinnabar-400" : "text-pine-400")
                                }
                              >
                                {gap > 0 ? `贵${gap}` : `贱${-gap}`}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedGood && (
                  <ScrollCard className="!p-3 mt-4">
                    <div className="flex items-baseline gap-2">
                      <h4 className="font-brush text-base text-paper-50">{selectedGood.name}</h4>
                      <span className="font-serif text-[11px] text-paper-400/60">
                        底价 {selectedGood.base}
                      </span>
                    </div>
                    {/* 这类铺子的货是拿词条拼的，词条一并摊开给人看 */}
                    {selectedGood.entries && selectedGood.entries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedGood.entries.map((entry, i) => (
                          <span
                            key={`${entry}-${i}`}
                            className="px-2 py-0.5 rounded border border-gold-500/25 bg-ink-900/40 font-serif text-[11px] text-gold-400/80"
                          >
                            {entry}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="font-serif text-sm text-paper-200 leading-relaxed mt-2">
                      {selectedGood.desc || goodDesc(selectedGood.name)}
                    </p>
                    <p className="font-serif text-[11px] text-paper-400/55 mt-1.5">
                      今日标价 {priceOf(selectedGood)} 下品灵石 · 存货 {selectedGood.stock} 件
                      {hasOddPrice(selectedGood.name) ? " · 眼下行情有异" : ""}
                    </p>
                    {selectedGood.mystery && (
                      <p className="font-serif text-[11px] text-gold-400/70 mt-1.5">
                        掌柜也说不清这是什么，价是他随口开的，能磨下多少全看本事。
                      </p>
                    )}
                  </ScrollCard>
                )}
              </>
            ) : (
              <>
                <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">行囊里的东西</h3>
                {inventory.length === 0 ? (
                  <p className="font-serif text-xs text-paper-400/50 py-6 text-center">你身上没什么可卖的。</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 items-start">
                    {inventory.map((item) => {
                      const picked = pickedItem === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setPickedItem(item.id);
                            setSellCount(1);
                            setNote("");
                          }}
                          className={
                            "text-left rounded border px-3 py-2 transition " +
                            (picked
                              ? "border-gold-400/70 bg-gold-400/10"
                              : "border-gold-500/20 bg-ink-800/50 hover:border-gold-400/40")
                          }
                        >
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-brush text-sm text-paper-50 truncate">{item.name}</span>
                            <span className="font-serif text-[10px] text-paper-400/50 shrink-0">
                              ×{item.count}
                            </span>
                          </div>
                          <div className="font-serif text-[10px] text-paper-400/55 mt-1">
                            {item.type} · {item.grade}
                          </div>
                          <div className="font-number text-xs text-gold-400 mt-0.5">
                            {itemSalePrice(item)} 灵石
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedItem && (
                  <ScrollCard className="!p-3 mt-4">
                    <div className="flex items-baseline gap-2">
                      <h4 className="font-brush text-base text-paper-50">{selectedItem.name}</h4>
                      <span className="font-serif text-[11px] text-paper-400/60">
                        {selectedItem.type} · {selectedItem.grade} · ×{selectedItem.count}
                      </span>
                    </div>
                    <p className="font-serif text-sm text-paper-200 leading-relaxed mt-1">
                      {selectedItem.desc}
                    </p>
                    {/* 这一组要卖几件：默认一件，也可以自己填或一键全卖 */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="font-serif text-[11px] text-paper-400/60">卖出</span>
                      <input
                        type="number"
                        min={1}
                        max={selectedItem.count}
                        value={sellTake}
                        onChange={(e) =>
                          setSellCount(
                            Math.max(1, Math.min(selectedItem.count, Math.trunc(Number(e.target.value)) || 1)),
                          )
                        }
                        className="w-16 rounded border border-gold-500/30 bg-ink-900/60 px-2 py-1 font-number text-xs text-paper-100 outline-none focus:border-gold-400"
                      />
                      <span className="font-serif text-[11px] text-paper-400/60">/ {selectedItem.count} 件</span>
                      <button
                        type="button"
                        onClick={() => setSellCount(1)}
                        className="rounded border border-gold-500/25 px-1.5 py-0.5 font-serif text-[10px] text-paper-300 transition hover:border-gold-400/60"
                      >
                        一件
                      </button>
                      <button
                        type="button"
                        onClick={() => setSellCount(selectedItem.count)}
                        className="rounded border border-gold-500/25 px-1.5 py-0.5 font-serif text-[10px] text-paper-300 transition hover:border-gold-400/60"
                      >
                        全部
                      </button>
                    </div>
                    <p className="font-serif text-[11px] text-paper-400/55 mt-1.5">
                      掌柜起初肯出 {sellTotal} 下品灵石。
                    </p>
                  </ScrollCard>
                )}
              </>
            )}

            {note && <p className="font-serif text-xs text-gold-400/80 pt-3">{note}</p>}
          </div>
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            {mode === "buy" ? (
              <>
                <SealButton
                  disabled={!selectedGood || selectedGood.stock <= 0}
                  onClick={() => selectedGood && buyNow(selectedGood)}
                  className="px-4 py-2 text-sm"
                >
                  按标价购买
                </SealButton>
                <SealButton
                  variant="ghost"
                  disabled={!selectedGood || selectedGood.stock <= 0}
                  onClick={() =>
                    selectedGood &&
                    setHaggling({
                      mode: "buy",
                      subject: {
                        mode: "buy",
                        name: selectedGood.name,
                        count: 1,
                        basePrice: priceOf(selectedGood),
                        goodName: selectedGood.name,
                        mystery: selectedGood.mystery,
                      },
                    })
                  }
                  className="px-4 py-2 text-sm"
                >
                  讲价
                </SealButton>
              </>
            ) : (
              <>
                <SealButton
                  disabled={!selectedItem}
                  onClick={() => selectedItem && sellNow(selectedItem)}
                  className="px-4 py-2 text-sm"
                >
                  按此价出售（{sellTotal}）
                </SealButton>
                <SealButton
                  variant="ghost"
                  disabled={!selectedItem}
                  onClick={() =>
                    selectedItem &&
                    setHaggling({
                      mode: "sell",
                      subject: {
                        mode: "sell",
                        name: selectedItem.name,
                        count: sellTake,
                        basePrice: sellTotal,
                        itemId: selectedItem.id,
                      },
                    })
                  }
                  className="px-4 py-2 text-sm"
                >
                  {sellTake > 1 ? `讲价（卖 ${sellTake} 件）` : "讲价"}
                </SealButton>
              </>
            )}

            <span className="font-serif text-[11px] text-paper-400/45 ml-auto">
              {formatGameTime(currentTime)}
            </span>
          </div>
        </div>
      </div>

      {haggling && keeper && (
        <HaggleModal
          shopName={live.name}
          keeper={keeper}
          mode={haggling.mode}
          subject={haggling.subject}
          onSettle={settle}
          onClose={() => {
            setHaggling(null);
            setNote("");
          }}
        />
      )}

      {appraising && (
        <AppraiseModal label={label} culture={culture} shop={live} onClose={() => setAppraising(false)} />
      )}
    </div>
  );
}
