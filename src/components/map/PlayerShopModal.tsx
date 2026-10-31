import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import {
  shopBusinessRows,
  shopFacilityUpkeep,
  shopMonthlyExpense,
  shopMonthlyIncome,
  shopMonthlyNet,
  SHOP_ARREARS_LIMIT,
  SHOP_RESTOCK_QTY,
} from "@/data/playerShops";
import { Briefcase, Coins, Loader2, Package, RefreshCw, Wrench, X } from "lucide-react";
import { useElapsedSeconds } from "@/lib/useElapsedSeconds";

/**
 * 自设铺面的「经营」面板。
 * 货物可自己存取：行囊里的东西摆上货架，货架上的东西取回行囊；
 * 营生与月收支列在「业务」一页，自动进货也在那儿开关。
 * 铺子赚的钱先进资金池，要花得回这儿取。
 */
export function PlayerShopModal({ shopId, onClose }: { shopId: string; onClose: () => void }) {
  const live = useGameStore((s) => (s.playerShops ?? []).find((x) => x.id === shopId));
  const inventory = useGameStore((s) => s.inventory);
  const withdrawShopCash = useGameStore((s) => s.withdrawShopCash);
  const depositShopCash = useGameStore((s) => s.depositShopCash);
  const applyShopPatch = useGameStore((s) => s.applyShopPatch);
  const stockShopGood = useGameStore((s) => s.stockShopGood);
  const takeShopGood = useGameStore((s) => s.takeShopGood);
  const manageShop = useAIStore((s) => s.manageShop);
  const shopStream = useAIStore((s) => s.shopStream);
  // 掌柜正写着的一笔账：边写边看
  const streamText = shopStream.key === "manageShop" ? shopStream.text : "";

  const [tab, setTab] = useState<"goods" | "business">("goods");
  const [take, setTake] = useState("");
  const [put, setPut] = useState("");
  /** 存取货时一次挪几件 */
  const [moveCount, setMoveCount] = useState("1");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  // 等掌柜这一段的秒数：光转个圈看不出进益，缀个数心里有底
  const waitSeconds = useElapsedSeconds(busy);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  if (!live) {
    return (
      <div className="mainui-black fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative scroll-card rounded-lg w-full max-w-md px-6 py-5">
          <p className="font-serif text-sm text-ink-dark">这间铺子已经不在了。</p>
          <div className="mt-4 text-right">
            <SealButton variant="ghost" onClick={onClose} className="px-3 py-1.5 text-xs">知道了</SealButton>
          </div>
        </div>
      </div>
    );
  }

  const income = shopMonthlyIncome(live);
  const expense = shopMonthlyExpense(live);
  const upkeep = shopFacilityUpkeep(live);
  const net = shopMonthlyNet(live);
  const rows = shopBusinessRows(live);
  const moveN = Math.max(1, Math.round(Number(moveCount) || 1));
  // 身上佩着的法宝不往上摆：那是不离身的东西
  const movable = inventory.filter((i) => !i.equipped);

  const withdraw = () => {
    const want = Math.round(Number(take) || 0);
    if (want <= 0) {
      setNote("说个数再取。");
      return;
    }
    const got = withdrawShopCash(live.id, want);
    setNote(got > 0 ? `从账上取出 ${got} 下品灵石。` : "账上没有这么多。");
    setTake("");
  };

  /** 注资：把自己的灵石投进铺子的资金池，供铺子开销周转 */
  const deposit = () => {
    const want = Math.round(Number(put) || 0);
    if (want <= 0) {
      setNote("说个数再注。");
      return;
    }
    const got = depositShopCash(live.id, want);
    setNote(got > 0 ? `注入 ${got} 下品灵石作本钱。` : "身上没有这么多灵石。");
    setPut("");
  };

  /** 行囊里的东西摆上货架 */
  const doStock = (itemId: string, itemName: string) => {
    const moved = stockShopGood(live.id, itemId, moveN);
    setNote(
      moved > 0
        ? `把${itemName} ${moved} 件摆上了货架。`
        : "没存进去：行囊里没有这么多，或货架已经摆满了。",
    );
  };

  /** 货架上的东西取回行囊 */
  const doTake = (goodName: string) => {
    const moved = takeShopGood(live.id, goodName, moveN);
    setNote(moved > 0 ? `从货架上取下${goodName} ${moved} 件。` : "货架上没有这么多。");
  };

  /** 吩咐掌柜：一段话交给 AI，货物、设施、营生与月收支照此改动 */
  const instruct = async () => {
    if (busy || !instruction.trim()) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await manageShop({ shopId: live.id, instruction: instruction.trim() });
      applyShopPatch(live.id, {
        goods: r.goods,
        facilities: r.facilities,
        businesses: r.businesses,
        monthlyIncome: r.monthlyIncome,
        monthlyExpense: r.monthlyExpense,
      });
      setNote(r.text || "掌柜依着吩咐张罗了一番。");
      setInstruction("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[86vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Coins size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.name}</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5 truncate">
                {live.typeLabel || live.kind} · {live.place}
                {live.arrears > 0 ? ` · 已欠 ${live.arrears} 月` : ""}
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

        {/* 两页：货物与业务 */}
        <div className="flex items-center gap-2 px-6 pt-3">
          {[
            { id: "goods" as const, label: "货物", icon: <Package size={12} /> },
            { id: "business" as const, label: "业务", icon: <Briefcase size={12} /> },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setNote("");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded border-2 px-3 py-1 font-serif text-xs transition",
                tab === t.id
                  ? "border-gold-500 text-gold-400 bg-paper-old/60"
                  : "border-ink-lightest/40 text-ink-light hover:border-gold-500/60",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 资金池：铺子的进出都走这里，取用须回铺子 */}
          <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2 mb-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-brush text-sm text-ink-dark">资金池 {live.cash} 下品灵石</div>
                <div className="font-serif text-xs text-ink-light mt-0.5">
                  月进项 {income} · 月开支 {expense} · 月净额{" "}
                  <span className={cn(net >= 0 ? "text-jade-600" : "text-cinnabar-600")}>{net >= 0 ? `+${net}` : net}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={take}
                  onChange={(e) => setTake(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="取多少"
                  className="w-24 rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                />
                <SealButton variant="ghost" onClick={withdraw} className="px-3 py-1.5 text-xs">
                  取出
                </SealButton>
                <input
                  value={put}
                  onChange={(e) => setPut(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="注多少"
                  className="w-24 rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                />
                <SealButton variant="ghost" onClick={deposit} className="px-3 py-1.5 text-xs">
                  注资
                </SealButton>
              </div>
            </div>
            {live.arrears > 0 && (
              <p className="font-serif text-xs text-cinnabar-600 mt-2">
                这铺子已经连欠 {live.arrears} 月，再欠下去（满 {SHOP_ARREARS_LIMIT} 月）便要叫债主收走。
              </p>
            )}
          </div>

          {tab === "goods" && (
            <>
              {/* 货物：自己存取，一次挪几件先在头里定 */}
              <div className="rounded border-2 border-ink-lightest/40 px-3 py-2 mb-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="font-brush text-xs text-ink-dark">
                    货架
                    {live.useStock === false && (
                      <span className="font-serif text-[11px] text-ink-lightest ml-1">（这门营生不按件记库存）</span>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 font-serif text-[11px] text-ink-light">
                    每次挪
                    <input
                      value={moveCount}
                      onChange={(e) => setMoveCount(e.target.value.replace(/[^\d]/g, ""))}
                      className="w-12 rounded border-2 border-ink-lightest/50 bg-paper-old px-1.5 py-0.5 text-center text-xs text-ink-dark outline-none focus:border-gold-500"
                    />
                    件
                  </label>
                </div>
                {live.goods.length === 0 ? (
                  <p className="font-serif text-xs text-ink-lightest">货架上还空着。从行囊里存些上去，或吩咐掌柜进货。</p>
                ) : (
                  <div className="space-y-1">
                    {live.goods.map((g) => (
                      <div key={g.name} className="flex items-center justify-between gap-2 border-b border-ink-lightest/20 pb-1">
                        <span className="font-serif text-xs text-ink-dark min-w-0 truncate">
                          <Package size={11} className="inline mr-1" />
                          {g.name}
                          {g.desc ? <span className="text-ink-lightest"> · {g.desc}</span> : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-serif text-xs text-ink-light">
                            单价 {g.price}
                            {live.useStock === false ? "" : ` · 存 ${g.stock}`}
                          </span>
                          {live.useStock !== false && (
                            <SealButton
                              variant="ghost"
                              onClick={() => doTake(g.name)}
                              disabled={g.stock <= 0}
                              className="px-2 py-0.5 text-[11px]"
                            >
                              取出
                            </SealButton>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 行囊：存进货架 */}
              <div className="rounded border-2 border-ink-lightest/40 px-3 py-2 mb-3">
                <div className="font-brush text-xs text-ink-dark mb-1">行囊</div>
                {movable.length === 0 ? (
                  <p className="font-serif text-xs text-ink-lightest">身上没带什么可摆上货架的东西。</p>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                    {movable.map((i) => (
                      <div key={i.id} className="flex items-center justify-between gap-2 border-b border-ink-lightest/20 pb-1">
                        <span className="font-serif text-xs text-ink-dark min-w-0 truncate">
                          {i.name}
                          <span className="text-ink-lightest">
                            {" "}· {i.type} · ×{i.count}
                          </span>
                        </span>
                        <SealButton
                          variant="ghost"
                          onClick={() => doStock(i.id, i.name)}
                          className="shrink-0 px-2 py-0.5 text-[11px]"
                        >
                          存入
                        </SealButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 设施 */}
              <div className="rounded border-2 border-ink-lightest/40 px-3 py-2 mb-3">
                <div className="font-brush text-xs text-ink-dark mb-1">设施</div>
                {live.facilities.length === 0 ? (
                  <p className="font-serif text-xs text-ink-lightest">还没置办什么设施。</p>
                ) : (
                  <div className="space-y-1">
                    {live.facilities.map((f) => (
                      <div key={f.name} className="flex items-center justify-between gap-2 border-b border-ink-lightest/20 pb-1">
                        <span className="font-serif text-xs text-ink-dark min-w-0 truncate">
                          <Wrench size={11} className="inline mr-1" />
                          {f.name}
                          {f.effect ? <span className="text-ink-lightest"> · {f.effect}</span> : null}
                        </span>
                        <span className="font-serif text-xs text-ink-light shrink-0">月耗 {f.upkeep}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 经营：以文字吩咐掌柜，由 AI 改动货物、设施、营生与月收支 */}
              <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2">
                <div className="font-brush text-xs text-ink-dark mb-1">吩咐掌柜</div>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  placeholder="如：进二十份疗伤丹来卖，再添一间库房囤货，月钱照旧。"
                  className="w-full rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500 resize-none"
                />
                <div className="mt-2 flex items-center gap-3">
                  <SealButton onClick={() => void instruct()} disabled={busy || !instruction.trim()} className="px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5">
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />}
                      {busy ? `正在张罗……已候 ${waitSeconds} 秒` : "照办"}
                    </span>
                  </SealButton>
                  <span className="font-serif text-[11px] text-ink-lightest">
                    货物、设施、营生与月收支都由此改动；无接口时请先去设置填写。
                  </span>
                </div>
                {busy && (
                  <p className="mt-1.5 font-serif text-[11px] text-ink-light leading-relaxed">
                    掌柜正照着你的话盘算货与账，这一段写得慢些，稍候便好。
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "business" && (
            <>
              {/* 各门营生：进项与开销逐项列出来 */}
              <div className="rounded border-2 border-ink-lightest/40 px-3 py-2 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-brush text-xs text-ink-dark">当前业务</div>
                  <span className="font-serif text-[11px] text-ink-lightest">共 {rows.length} 门</span>
                </div>
                <div className="space-y-1">
                  {rows.map((b) => (
                    <div key={b.name} className="border-b border-ink-lightest/20 pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("font-serif text-xs min-w-0 truncate", b.active === false ? "text-ink-lightest line-through" : "text-ink-dark")}>
                          {b.name}
                        </span>
                        <span className="shrink-0 font-serif text-xs text-ink-light">
                          进 <span className="text-jade-600">{b.income}</span> · 耗{" "}
                          <span className="text-cinnabar-600">{b.expense}</span>
                        </span>
                      </div>
                      {b.desc && <p className="font-serif text-[11px] text-ink-lightest leading-relaxed">{b.desc}</p>}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-serif text-xs text-ink-dark">
                  <span>
                    月进项 <span className="text-jade-600">{income}</span>　月开支{" "}
                    <span className="text-cinnabar-600">{expense}</span>
                    {upkeep > 0 ? `（含设施维持 ${upkeep}）` : ""}
                  </span>
                  <span>
                    月净额{" "}
                    <span className={cn(net >= 0 ? "text-jade-600" : "text-cinnabar-600")}>
                      {net >= 0 ? `+${net}` : net}
                    </span>
                  </span>
                </div>
              </div>

              {/* 自动进货 */}
              <div className="rounded border-2 border-ink-lightest/40 px-3 py-2 mb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-brush text-xs text-ink-dark">自动进货</div>
                  <SealButton
                    variant={live.autoRestock ? "seal" : "ghost"}
                    onClick={() => applyShopPatch(live.id, { autoRestock: !live.autoRestock })}
                    className="px-3 py-1 text-[11px]"
                  >
                    <span className="flex items-center gap-1.5">
                      <RefreshCw size={11} />
                      {live.autoRestock ? "已开" : "已关"}
                    </span>
                  </SealButton>
                </div>
                <p className="font-serif text-[11px] text-ink-light leading-relaxed mt-1">
                  每月结算时照货架上的标价，每样补 {SHOP_RESTOCK_QTY} 件，钱从资金池里出；池子不够便少补，
                  不会因此欠账。货架空着时这一项不起作用。
                </p>
              </div>

              {/* 上月实账 */}
              <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2 mb-3">
                <div className="font-brush text-xs text-ink-dark mb-1">上月结算</div>
                {live.lastReport ? (
                  <div className="font-serif text-xs text-ink-light space-y-0.5">
                    <p className="text-ink-lightest">{live.lastReport.month}</p>
                    <p>
                      实收 <span className="text-jade-600">{live.lastReport.income}</span>　实支{" "}
                      <span className="text-cinnabar-600">{live.lastReport.expense}</span>
                      {live.lastReport.restock > 0 ? `　进货 ${live.lastReport.restock}` : ""}
                    </p>
                    <p>
                      净额{" "}
                      <span className={cn(live.lastReport.net >= 0 ? "text-jade-600" : "text-cinnabar-600")}>
                        {live.lastReport.net >= 0 ? `+${live.lastReport.net}` : live.lastReport.net}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="font-serif text-xs text-ink-lightest">这铺子还没走过一个整月。</p>
                )}
              </div>

              {/* 设施维持明细 */}
              <div className="rounded border-2 border-ink-lightest/40 px-3 py-2">
                <div className="font-brush text-xs text-ink-dark mb-1">设施维持</div>
                {live.facilities.length === 0 ? (
                  <p className="font-serif text-xs text-ink-lightest">没有设施，也就没有这一笔开销。</p>
                ) : (
                  <div className="space-y-1">
                    {live.facilities.map((f) => (
                      <div key={f.name} className="flex items-center justify-between gap-2 border-b border-ink-lightest/20 pb-1">
                        <span className="font-serif text-xs text-ink-dark truncate">{f.name}</span>
                        <span className="font-serif text-xs text-ink-light shrink-0">{f.upkeep}／月</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {busy && streamText && (
            <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2 mt-3">
              <p className="font-serif text-xs text-ink-dark leading-relaxed whitespace-pre-wrap">{streamText}</p>
            </div>
          )}

          {note && <p className="font-serif text-xs text-ink-dark pt-3 leading-relaxed whitespace-pre-wrap">{note}</p>}
          {error && <p className="font-serif text-xs text-cinnabar-600 pt-3 leading-relaxed">{error}</p>}
        </div>
      </div>
    </div>
  );
}
