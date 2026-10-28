import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { SealButton } from "@/components/ui/SealButton";
import { itemSalePriceFor, type SaleCtx } from "@/data/goods";
import { migrateRelation } from "@/data/npcGen";
import type { Relation } from "@/data/types";
import type { HaggleSubject } from "@/components/map/GeneralStoreModal";
import { Loader2, Send, X } from "lucide-react";

/** 仪表圆心；刻度弧画在半径 100 处，指针比它再短一截 */
const CX = 160;
const CY = 134;
const ARC_R = 100;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 议价幅度 → 极角：-100% 在正左、原价在正上、+100% 在正右 */
function angleFor(factor: number): number {
  return 180 - ((clamp(factor, -1, 1) + 1) / 2) * 180;
}

function pointAt(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

/** 从 fromDeg 顺时针画到 toDeg 的弧；角度自左向右递减 */
function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const a = pointAt(fromDeg, r);
  const b = pointAt(toDeg, r);
  const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  const sweep = toDeg < fromDeg ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function HaggleModal({
  shopName,
  keeper,
  mode,
  subject,
  saleCtx,
  onSettle,
  onClose,
}: {
  shopName: string;
  keeper: Relation;
  /** 买还是卖 */
  mode: "buy" | "sell";
  /** 议的标的；卖东西时可以先空着，谈起来再挑 */
  subject: HaggleSubject | null;
  /** 卖东西时按这家铺子的行情折价 */
  saleCtx?: SaleCtx;
  /** 落账：返回空串表示成了，返回文字表示没成 */
  onSettle: (subject: HaggleSubject, price: number) => string;
  onClose: () => void;
}) {
  const haggle = useAIStore((s) => s.haggleWithShopkeeper);
  const inventory = useGameStore((s) => s.inventory);

  const buying = mode === "buy";
  // 耐心看掌柜的性子：相熟些的多听你磨两句
  const [patience, setPatience] = useState(() =>
    clamp(45 + Math.round((migrateRelation(keeper).relation + 100) / 2), 40, 95),
  );
  const [factor, setFactor] = useState(0);
  const [picked, setPicked] = useState<HaggleSubject | null>(subject);
  const [lines, setLines] = useState<{ role: "player" | "keeper"; text: string }[]>([]);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** 刚成交的那一笔；卖出后留在此窗，接着卖别的 */
  const [dealt, setDealt] = useState("");

  const busted = patience <= 0;
  // 柜底收来的旧物：掌柜自己也不认得，只能照实说不知道
  const mystery = buying && !!picked?.mystery;
  const displayName = picked?.name ?? "";
  const price = picked ? Math.max(1, Math.round(picked.basePrice * (1 + factor))) : 0;
  const gap = picked ? price - picked.basePrice : 0;
  // 买入时压下来才算占便宜，卖出时抬上去才算
  const favorable = buying ? factor < 0 : factor > 0;
  const angle = angleFor(factor);

  /** 挑定一样要卖的东西，价钱从头谈起；先按一件起谈，数目可在窗里改 */
  const pickItem = (itemId: string) => {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;
    setPicked({
      mode: "sell",
      name: item.name,
      count: 1,
      basePrice: itemSalePriceFor(item, 1, saleCtx),
      itemId: item.id,
    });
    setFactor(0);
    setError("");
    setDealt("");
  };

  /** 卖出时改件数：价钱照件数重算，议到的幅度仍留着 */
  const setSellCount = (count: number) => {
    if (!picked || buying) return;
    const item = inventory.find((i) => i.id === picked.itemId);
    if (!item) return;
    const n = Math.max(1, Math.min(Math.trunc(Number(count)) || 1, item.count));
    setPicked({ ...picked, count: n, basePrice: itemSalePriceFor(item, n, saleCtx) });
  };

  const send = async () => {
    const text = words.trim();
    if (!text || busy || busted) return;
    setLines((prev) => [...prev, { role: "player", text }]);
    setWords("");
    setBusy(true);
    setError("");
    try {
      const res = await haggle({
        keeper,
        shop: shopName,
        mode,
        subject: picked?.name ?? "",
        count: picked?.count ?? 1,
        basePrice: picked?.basePrice ?? 0,
        factor,
        patience,
        history: lines.slice(-10),
        words: text,
        // 还没挑定东西时，把身上的家当报给掌柜，他好问价
        available: picked ? undefined : inventory.map((i) => `${i.name}×${i.count}`).join("、"),
        mystery,
      });
      setLines((prev) => [...prev, { role: "keeper", text: res.reply }]);
      if (picked) {
        setFactor(res.factor);
        setPatience(res.patience);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deal = () => {
    if (!picked) return;
    const subject = picked;
    const paid = price;
    const failed = onSettle(subject, paid);
    if (failed) {
      setError(failed);
      return;
    }
    // 买定一笔便收窗；卖出则留在此窗，好接着卖别的、或这一组余下的
    if (buying) {
      onClose();
      return;
    }
    setDealt(`卖出「${subject.name}」${subject.count} 件，得 ${paid} 下品灵石。`);
    setError("");
    setWords("");
    setLines([]);
    setFactor(0);
    // 存货还余着，便把这一组接着摆出来；卖光了才回到挑货
    const item = useGameStore.getState().inventory.find((i) => i.id === subject.itemId);
    if (item) {
      const rest = Math.max(1, Math.min(subject.count, item.count));
      setPicked({ ...subject, count: rest, basePrice: itemSalePriceFor(item, rest, saleCtx) });
    } else {
      setPicked(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-[58] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[88vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="min-w-0">
            <h2 className="font-brush text-lg text-gold-400 tracking-widest truncate">
              {picked ? (buying ? `买${displayName}` : `卖${displayName}`) : "见掌柜"}
            </h2>
            <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
              {shopName} · {keeper.name}（{keeper.title}）
              {picked && picked.count > 1 ? ` · ${picked.count} 件` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex h-[460px]">
          {/* 左侧：掌柜的耐心，磨到底就谈不下去了 */}
          <aside className="w-16 shrink-0 border-r border-gold-500/15 flex flex-col items-center py-3">
            <span className="font-serif text-[10px] text-paper-400/60">耐心</span>
            <div className="relative w-3.5 flex-1 my-2 rounded-full bg-ink-900/80 border border-gold-500/20 overflow-hidden">
              <div
                className={
                  "absolute bottom-0 left-0 right-0 rounded-full transition-all duration-500 " +
                  (patience > 50 ? "bg-jade-400" : patience > 20 ? "bg-gold-400" : "bg-cinnabar-500")
                }
                style={{ height: `${clamp(patience, 0, 100)}%` }}
              />
            </div>
            <span className="font-number text-[10px] text-paper-300">{Math.round(patience)}</span>
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 上方：扇形仪表，针指当前价；卖东西时先在这儿挑货 */}
            <div className="px-4 pt-2 shrink-0">
              {!buying && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  <span className="font-serif text-[11px] text-paper-400/60 shrink-0">要卖哪样</span>
                  {inventory.length === 0 ? (
                    <span className="font-serif text-[11px] text-paper-400/40">你身上没什么可卖的</span>
                  ) : (
                    inventory.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => pickItem(item.id)}
                        className={
                          "shrink-0 rounded border px-2 py-1 font-serif text-[11px] transition " +
                          (picked?.itemId === item.id
                            ? "border-gold-400/70 bg-gold-400/10 text-paper-50"
                            : "border-gold-500/20 bg-ink-800/50 text-paper-200 hover:border-gold-400/40")
                        }
                      >
                        {item.name}×{item.count}
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* 卖出时挑定一件货，再定这一组卖几件；默认一件，也可一键全卖 */}
              {!buying && picked && (() => {
                const item = inventory.find((i) => i.id === picked.itemId);
                if (!item) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    <span className="font-serif text-[11px] text-paper-400/60 shrink-0">卖出件数</span>
                    <input
                      type="number"
                      min={1}
                      max={item.count}
                      value={picked.count}
                      onChange={(e) => setSellCount(Number(e.target.value))}
                      className="w-16 rounded border border-gold-500/30 bg-ink-900/60 px-2 py-1 font-number text-xs text-paper-100 outline-none focus:border-gold-400"
                    />
                    <span className="font-serif text-[11px] text-paper-400/60">/ {item.count} 件</span>
                    <button
                      type="button"
                      onClick={() => setSellCount(1)}
                      className="rounded border border-gold-500/25 px-1.5 py-0.5 font-serif text-[10px] text-paper-300 transition hover:border-gold-400/60"
                    >
                      一件
                    </button>
                    <button
                      type="button"
                      onClick={() => setSellCount(item.count)}
                      className="rounded border border-gold-500/25 px-1.5 py-0.5 font-serif text-[10px] text-paper-300 transition hover:border-gold-400/60"
                    >
                      全部
                    </button>
                  </div>
                );
              })()}

              {picked ? (
                <>
                  <svg viewBox="0 0 320 168" className="w-full h-[150px]">
                    <path
                      d={arcPath(180, 0, ARC_R)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={12}
                      strokeLinecap="round"
                      className="text-ink-darkest"
                    />
                    {/* 议到哪儿就填到哪儿：占便宜的绿，吃亏的红 */}
                    {Math.abs(factor) > 0.005 && (
                      <path
                        d={arcPath(90, angle, ARC_R)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={12}
                        strokeLinecap="round"
                        className={favorable ? "text-jade-400" : "text-cinnabar-500"}
                      />
                    )}
                    {/* 刻度：每两成半一道，两端与正中长些 */}
                    {[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((f) => {
                      const deg = angleFor(f);
                      const outer = pointAt(deg, ARC_R + 6);
                      const inner = pointAt(deg, Math.abs(f) === 0 || Math.abs(f) === 1 ? ARC_R - 16 : ARC_R - 9);
                      return (
                        <line
                          key={f}
                          x1={inner.x}
                          y1={inner.y}
                          x2={outer.x}
                          y2={outer.y}
                          stroke="currentColor"
                          strokeWidth={Math.abs(f) === 0 || Math.abs(f) === 1 ? 1.6 : 1}
                          className="text-paper-400/45"
                        />
                      );
                    })}
                    {[
                      { f: -1, text: "贱一半" },
                      { f: 0, text: "原价" },
                      { f: 1, text: "贵一倍" },
                    ].map(({ f, text }) => {
                      const p = pointAt(angleFor(f), ARC_R - 30);
                      return (
                        <text
                          key={text}
                          x={p.x}
                          y={p.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-paper-400/70"
                          style={{ fontSize: 11 }}
                        >
                          {text}
                        </text>
                      );
                    })}
                    {/* 指针 */}
                    <line
                      x1={CX}
                      y1={CY}
                      x2={pointAt(angle, ARC_R - 22).x}
                      y2={pointAt(angle, ARC_R - 22).y}
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      className={favorable ? "text-jade-400" : factor > 0 ? "text-cinnabar-400" : "text-gold-400"}
                    />
                    <circle cx={CX} cy={CY} r={6} className="fill-gold-400" />
                  </svg>

                  <div className="flex items-baseline justify-center gap-3 -mt-1">
                    <span className="font-serif text-xs text-paper-400/60">原价 {picked.basePrice}</span>
                    <span className="font-brush text-2xl text-gold-400">{price}</span>
                    <span className="font-serif text-xs text-paper-400/60">
                      下品灵石
                      {gap !== 0 && (
                        <span className={gap > 0 ? "text-cinnabar-400 ml-1" : "text-jade-400 ml-1"}>
                          {gap > 0 ? `贵${gap}` : `贱${-gap}`}
                        </span>
                      )}
                    </span>
                  </div>
                </>
              ) : (
                // 还没挑定东西，仪表先空着
                <div className="h-[150px] flex flex-col items-center justify-center gap-1 rounded border border-dashed border-gold-500/25">
                  <p className="font-brush text-sm text-paper-300/80 tracking-widest">先挑一样东西</p>
                  <p className="font-serif text-[11px] text-paper-400/50">
                    也可以先跟{keeper.name}搭话，问问他收不收
                  </p>
                </div>
              )}
            </div>

            {/* 下方：聊天窗口与输入 */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {lines.length === 0 && (
                <p className="font-serif text-xs text-paper-400/45 text-center py-3">
                  {keeper.name}把手搭在柜台上，等你先开口。
                </p>
              )}
              {lines.map((line, index) => (
                <div key={index} className={line.role === "player" ? "text-right" : ""}>
                  <div
                    className={
                      "inline-block max-w-[85%] text-left rounded-lg px-3 py-2 " +
                      (line.role === "player"
                        ? "bg-cinnabar-500/15 border border-cinnabar-500/30 rounded-br-none"
                        : "bg-gold-500/10 border border-gold-500/20 rounded-bl-none")
                    }
                  >
                    <p className="font-serif text-sm text-paper-100 leading-relaxed whitespace-pre-wrap">
                      {line.text}
                    </p>
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 font-serif text-xs text-paper-400/60">
                  <Loader2 size={13} className="animate-spin text-gold-400" />
                  {keeper.name}正打算盘……
                </div>
              )}
              {busted && (
                <p className="font-serif text-xs text-cinnabar-400 leading-relaxed pt-1">
                  {keeper.name}把脸一沉，不再听你磨价。要么就按这个价成交，要么走人。
                </p>
              )}
              {dealt && <p className="font-serif text-xs text-jade-400 leading-relaxed pt-1">{dealt}</p>}
              {error && <p className="font-serif text-xs text-cinnabar-400 leading-relaxed">{error}</p>}
            </div>

            <div className="shrink-0 border-t border-gold-500/20 px-4 py-3">
              <div className="flex gap-2">
                <textarea
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy || busted}
                  placeholder={busted ? "掌柜不听价了" : "说点什么……（Ctrl/Cmd + Enter 送出）"}
                  rows={2}
                  className="flex-1 input-ink resize-none leading-relaxed text-sm"
                  style={{ fontFamily: '"Noto Serif SC", serif', color: "#ffffff" }}
                />
                <SealButton
                  onClick={send}
                  disabled={!words.trim() || busy || busted}
                  className="shrink-0 self-end"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /> 说</>}
                </SealButton>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <SealButton onClick={deal} disabled={!picked} className="px-4 py-2 text-sm">
                  {!picked
                    ? "按此价成交"
                    : buying
                      ? `按此价买下（${price}）`
                      : `按此价卖出（${price}）`}
                </SealButton>
                <SealButton variant="ghost" onClick={onClose} className="px-4 py-2 text-sm">
                  {buying ? "不买了" : "不卖了"}
                </SealButton>
                <span className="font-serif text-[11px] text-paper-400/45 ml-auto">
                  讲价不费时辰，费的是掌柜的耐性
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
