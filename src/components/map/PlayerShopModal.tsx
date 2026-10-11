import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { shopMonthlyExpense, shopMonthlyNet, SHOP_ARREARS_LIMIT } from "@/data/playerShops";
import { Coins, Loader2, Package, Wrench, X } from "lucide-react";

/**
 * 自设铺面的「经营」面板。
 * 货物、设施与月收支都靠下头那一栏以文字与 AI 往来改动；
 * 铺子赚的钱先进资金池，要花得回这儿取。
 */
export function PlayerShopModal({ shopId, onClose }: { shopId: string; onClose: () => void }) {
  const live = useGameStore((s) => (s.playerShops ?? []).find((x) => x.id === shopId));
  const withdrawShopCash = useGameStore((s) => s.withdrawShopCash);
  const depositShopCash = useGameStore((s) => s.depositShopCash);
  const applyShopPatch = useGameStore((s) => s.applyShopPatch);
  const manageShop = useAIStore((s) => s.manageShop);

  const [take, setTake] = useState("");
  const [put, setPut] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
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

  const expense = shopMonthlyExpense(live);
  const net = shopMonthlyNet(live);

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

  /** 吩咐掌柜：一段话交给 AI，货物、设施与月收支照此改动 */
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* 资金池：铺子的进出都走这里，取用须回铺子 */}
          <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2 mb-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-brush text-sm text-ink-dark">资金池 {live.cash} 下品灵石</div>
                <div className="font-serif text-xs text-ink-light mt-0.5">
                  月进项 {live.monthlyIncome} · 月开支 {expense} · 月净额{" "}
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

          {/* 货物 */}
          <div className="rounded border-2 border-ink-lightest/40 px-3 py-2 mb-3">
            <div className="font-brush text-xs text-ink-dark mb-1">
              货物
              {live.useStock === false && (
                <span className="font-serif text-[11px] text-ink-lightest ml-1">（这门营生不按件记库存）</span>
              )}
            </div>
            {live.goods.length === 0 ? (
              <p className="font-serif text-xs text-ink-lightest">货架上还空着。吩咐掌柜进些货。</p>
            ) : (
              <div className="space-y-1">
                {live.goods.map((g) => (
                  <div key={g.name} className="flex items-center justify-between gap-2 border-b border-ink-lightest/20 pb-1">
                    <span className="font-serif text-xs text-ink-dark min-w-0 truncate">
                      <Package size={11} className="inline mr-1" />
                      {g.name}
                      {g.desc ? <span className="text-ink-lightest"> · {g.desc}</span> : null}
                    </span>
                    <span className="font-serif text-xs text-ink-light shrink-0">
                      单价 {g.price}
                      {live.useStock === false ? "" : ` · 存 ${g.stock}`}
                    </span>
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

          {/* 经营：以文字吩咐掌柜，由 AI 改动货物、设施与月收支 */}
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
                  {busy ? "正在张罗……" : "照办"}
                </span>
              </SealButton>
              <span className="font-serif text-[11px] text-ink-lightest">
                货物、设施与月收支都由此改动；无接口时请先去设置填写。
              </span>
            </div>
          </div>

          {note && <p className="font-serif text-xs text-ink-dark pt-3 leading-relaxed whitespace-pre-wrap">{note}</p>}
          {error && <p className="font-serif text-xs text-cinnabar-600 pt-3 leading-relaxed">{error}</p>}
        </div>
      </div>
    </div>
  );
}
