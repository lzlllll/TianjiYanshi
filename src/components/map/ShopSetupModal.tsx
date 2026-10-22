import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { PLAYER_SHOP_KINDS, shopLeaseCost, SHOP_SETUP_TYPE_SUGGESTS } from "@/data/playerShops";
import { cn } from "@/lib/utils";
import { Loader2, Store, X } from "lucide-react";

/**
 * 开张一户：先由玩家以文字说定要开一间什么铺子，再请 AI 推演具体数据
 * （营生、货物、设施、月收支，以及要不要按件记库存），最后才落地盘店。
 */
export function ShopSetupModal({
  cityId,
  districtId,
  place,
  culture,
  onClose,
  onOpened,
}: {
  cityId: string;
  districtId: number;
  place: string;
  culture?: string;
  onClose: () => void;
  onOpened: (shopId: string) => void;
}) {
  const openShop = useGameStore((s) => s.openShop);
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const setupNewShop = useAIStore((s) => s.setupNewShop);

  const [typeText, setTypeText] = useState("");
  const [name, setName] = useState("");
  const [capital, setCapital] = useState("200");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const lease = shopLeaseCost(culture);
  const seed = Math.max(0, Math.round(Number(capital) || 0));

  /** 先请 AI 推演底子，再盘店付钱；接口不通就拦住 */
  const submit = async () => {
    const type = typeText.trim();
    if (!type) {
      setError("先说说要开一间什么铺子。");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await setupNewShop({ typeText: type, place, culture, capital: seed });
      const shop = openShop({
        name: name.trim() || type,
        kind: r.kind ?? PLAYER_SHOP_KINDS[0],
        typeLabel: type,
        cityId,
        districtId,
        place,
        culture,
        capital: seed,
        goods: r.goods,
        facilities: r.facilities,
        monthlyIncome: r.monthlyIncome,
        monthlyExpense: r.monthlyExpense,
        useStock: r.useStock,
      });
      if (!shop) {
        setError(`灵石不够：盘店费 ${lease}，另加本钱 ${seed}。`);
        setBusy(false);
        return;
      }
      onOpened(shop.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-[62] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-xl max-h-[84vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Store size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">新设铺面</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5 truncate">
                {place} · 盘店费 {lease} · 现有折合下品灵石 {stones}
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
          <p className="font-serif text-xs text-ink-light leading-relaxed mb-3">
            先说定要开一间什么样的铺子。说罢，掌柜自会照这一带的风物替你张罗出货物、设施与本钱账目。
          </p>

          <div className="font-brush text-xs text-ink-dark mb-1">要开一间什么铺子</div>
          <input
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            placeholder="如：酒楼、药铺、瓦舍……也可自拟，如「剑器行」"
            className="w-full rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-sm text-ink-dark outline-none focus:border-gold-500"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SHOP_SETUP_TYPE_SUGGESTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeText(t)}
                className={cn(
                  "px-2 py-1 rounded border font-serif text-xs transition",
                  typeText === t
                    ? "border-gold-500 bg-gold-400/15 text-ink-dark"
                    : "border-ink-lightest/40 bg-paper-old/50 text-ink-dark hover:border-gold-500",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 font-serif text-xs text-ink-dark">
              字号
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="不写便照营生取"
                className="w-36 rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
              />
            </label>
            <label className="flex items-center gap-2 font-serif text-xs text-ink-dark">
              本钱
              <input
                value={capital}
                onChange={(e) => setCapital(e.target.value.replace(/[^\d]/g, ""))}
                className="w-24 rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
              />
            </label>
          </div>

          <p className="font-serif text-[11px] text-ink-lightest mt-2">
            共需 {lease + seed} 下品灵石（盘店费 {lease} ＋ 本钱 {seed}）。本钱充作铺子的资金池，往后铺子赚的都进这里，要用得回铺子取。
          </p>

          {error && <p className="font-serif text-xs text-cinnabar-600 mt-3 leading-relaxed">{error}</p>}

          <div className="mt-4 flex items-center gap-3">
            <SealButton onClick={() => void submit()} disabled={busy || !typeText.trim()} className="px-4 py-2 text-sm">
              <span className="flex items-center justify-center gap-1.5">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Store size={13} />}
                {busy ? "正在张罗开张……" : "开张"}
              </span>
            </SealButton>
            <span className="font-serif text-[11px] text-ink-lightest">须先配置通灵接口，方可推演底子。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
