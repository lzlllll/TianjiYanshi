import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { DiningModal } from "@/components/map/DiningModal";
import { GeneralStoreModal } from "@/components/map/GeneralStoreModal";
import { HOURS_PER_DAY } from "@/data/rooms";
import { HAGGLE_DC, haggleDiscount } from "@/data/estates";
import { occupationTribute, ownerOf } from "@/data/occupations";
import type { Shop, Village } from "@/data/types";
import { Home, Loader2, Store, X, Users } from "lucide-react";

/**
 * 野外村庄：没有舆图，只有一方院落。
 * 初到时什么也不知道，须先打听一回，村里的人与营生才立起来。
 */
export function VillagePanel({ village, onClose }: { village: Village; onClose: () => void }) {
  const live = useGameStore((s) => s.villages?.[village.key]) ?? village;
  const occupations = useGameStore((s) => s.occupations);
  const inquireVillage = useGameStore((s) => s.inquireVillage);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const addLog = useGameStore((s) => s.addLog);
  const meetNpc = useGameStore((s) => s.meetNpc);
  const openNPCChat = useAIStore((s) => s.openNPCChat);
  const payStones = useGameStore((s) => s.payStones);
  const buyEstate = useGameStore((s) => s.buyEstate);
  const skills = useGameStore((s) => s.skills);
  const clearVillageEstateOffer = useGameStore((s) => s.clearVillageEstateOffer);
  const narrateEstateDeal = useAIStore((s) => s.narrateEstateDeal);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [openShop, setOpenShop] = useState<Shop | null>(null);
  const [price, setPrice] = useState(0);
  const [bargained, setBargained] = useState(false);

  /** 村里的待售屋舍：报价由效率定，可讲一回价 */
  const offer = live.estateOffer;
  const shownPrice = price > 0 ? price : offer?.price ?? 0;

  const haggle = () => {
    if (!offer || bargained) return;
    const level = Math.max(0, ...(skills ?? []).map((s) => Number(s.level) || 0));
    const roll = 1 + Math.floor(Math.random() * 20);
    const discount = haggleDiscount(roll, level, HAGGLE_DC);
    setBargained(true);
    if (discount <= 0) {
      setPrice(offer.price);
      setNote(`你陪着说合了半日，房主不松口，仍是 ${offer.price} 灵石。`);
      return;
    }
    const nextPrice = Math.max(1, Math.round(offer.price * (1 - discount)));
    setPrice(nextPrice);
    setNote(`你磨了半晌，房主让了 ${Math.round(discount * 100)}%，作 ${nextPrice} 灵石。`);
  };

  const buyHouse = async () => {
    if (!offer) return;
    const paid = shownPrice;
    if (!payStones(paid)) {
      setNote(`下品灵石不够，要 ${paid}。`);
      return;
    }
    buyEstate(offer, paid);
    clearVillageEstateOffer(live.key);
    setNote(`你买下了村里的「${offer.name}」，花 ${paid} 下品灵石。`);
    try {
      const text = await narrateEstateDeal({
        kind: "deal",
        name: offer.name,
        place: offer.place,
        baseEfficiency: offer.baseEfficiency,
        price: paid,
      });
      setNote(text);
    } catch {
      /* 接口不通就留那句现成的话 */
    }
  };

  // 村不在城内，与落库时同一套折算，好让合成出的铺子认得自己的名号
  const spot = Math.abs(Math.round(live.x) * 1000 + Math.round(live.y));
  const label = `${live.name}`;
  const hasInn = live.buildings.some((b) => b.kind === "客栈");
  /** 这一处眼下归谁：被占了便标出是哪一家治下，没占便不写 */
  const owner = ownerOf(occupations, "village", live.key);

  /** 向村人打听这一处的情形 */
  const inquire = async () => {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      // 掷定人与营生；结果由代码定下，此处只稍作停顿
      inquireVillage(live.key);
      advanceTime(1);
      setNote("你在村里转了一圈，与人攀谈，把这一处的情形摸清了。");
    } finally {
      setBusy(false);
    }
  };

  /** 无处投宿，只能在人家借一宿，一觉到次日 */
  const borrowLodging = () => {
    advanceTime(HOURS_PER_DAY);
    addLog(`你在${live.name}借宿一宿，辗转反侧，天一亮便起身。`);
    setNote("你借宿了一宿，天已亮。");
  };

  return (
    <div
      className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[84vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Home size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.name}</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5 truncate">
                {live.culture ? `${live.culture}一带的村庄` : "一处村庄"}
                {live.inquired
                  ? ` · ${live.buildings.length} 处营生、${live.npcs.length} 人`
                  : live.visited
                    ? " · 尚未打听"
                    : " · 尚未前往"}
              </p>
              {owner && (
                <div className="mt-0.5 font-serif text-xs text-gold-400/80 truncate">
                  已归「{owner.ownerName}」治下 · 月贡 {occupationTribute("village", live.key)} 灵石
                </div>
              )}
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
          {!live.visited ? (
            <ScrollCard title="远望村舍" subtitle="这一处尚未探访">
              <p className="font-serif text-xs text-ink-light leading-relaxed">
                你远远望见这一带的屋舍与炊烟，只是还不曾登门。欲在此处打听人事、与村里往来，须先在「问道」中动身前来。
              </p>
            </ScrollCard>
          ) : !live.inquired ? (
            <ScrollCard title="初到村口" subtitle="人事两生，先问一句">
              <p className="font-serif text-xs text-ink-light leading-relaxed mb-3">
                你站在村口，只看见几间屋舍与烟囱。这一处有什么营生、住着些什么人，还得打听过才知道。
              </p>
              <SealButton onClick={() => void inquire()} disabled={busy} className="px-4 py-2 text-sm">
                <span className="flex items-center justify-center gap-1.5">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />}
                  {busy ? "正在打听……" : "打听村里情况"}
                </span>
              </SealButton>
            </ScrollCard>
          ) : (
            <>
              <ScrollCard title="村里的营生" subtitle="能进门的都在这儿了">
                {live.buildings.length === 0 ? (
                  <p className="font-serif text-xs text-ink-lightest">这一处没有开门的营生。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {live.buildings.map((b) => (
                      <SealButton
                        key={b.kind}
                        variant="ghost"
                        onClick={() => setOpenShop(b.shop)}
                        className="px-3 py-1.5 text-xs"
                      >
                        <span className="flex items-center gap-1.5">
                          <Store size={12} /> {b.name}
                        </span>
                      </SealButton>
                    ))}
                  </div>
                )}

                {!hasInn && (
                  <div className="mt-3 flex items-center gap-3">
                    <SealButton variant="ghost" onClick={borrowLodging} className="px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5">
                        <Home size={12} /> 借宿一宿
                      </span>
                    </SealButton>
                    <span className="font-serif text-[11px] text-ink-lightest">
                      村里没有客栈，只能向人家借宿，一觉便到次日。
                    </span>
                  </div>
                )}
              </ScrollCard>

              {offer && (
                <ScrollCard title="待售的屋舍" subtitle="村里有人要出手一处院子" className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-brush text-base text-ink-dark">{offer.name}</span>
                    <span className="font-serif text-xs text-ink-light">基础效率 {offer.baseEfficiency.toFixed(2)}</span>
                  </div>
                  <p className="font-serif text-xs text-ink-medium leading-relaxed">
                    开价 {shownPrice} 下品灵石。屋舍可免费歇息、修炼、演武、储物；进益按基础效率与完好度合算。
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <SealButton onClick={buyHouse} className="px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5">买下（{shownPrice}）</span>
                    </SealButton>
                    <SealButton variant="ghost" onClick={haggle} disabled={bargained} className="px-3 py-1.5 text-xs">
                      讲价
                    </SealButton>
                  </div>
                </ScrollCard>
              )}

              <ScrollCard title="村里的人" subtitle="攀谈两句，认下了便是缘分" className="mt-4">
                {live.npcs.length === 0 ? (
                  <p className="font-serif text-xs text-ink-lightest">这一处没见着人。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {live.npcs.map((npc) => (
                      <button
                        key={npc.id}
                        onClick={() => {
                          meetNpc(npc);
                          openNPCChat(npc.id);
                        }}
                        title={`${npc.name}（${npc.title}）`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded border-2 border-ink-lightest/40 bg-paper-old/50 font-serif text-xs text-ink-dark transition hover:border-gold-500"
                      >
                        <Users size={12} />
                        {npc.name} · {npc.title}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollCard>
            </>
          )}

          {note && <p className="font-serif text-xs text-ink-dark pt-3 leading-relaxed">{note}</p>}
        </div>
      </div>

      {openShop &&
        (openShop.kind === "杂货铺" ? (
          <GeneralStoreModal
            cityId={live.sceneId}
            districtId={spot}
            label={label}
            culture={live.culture}
            shop={openShop}
            onClose={() => setOpenShop(null)}
          />
        ) : (
          <DiningModal
            cityId={live.sceneId}
            districtId={spot}
            label={label}
            culture={live.culture}
            shop={openShop}
            onClose={() => setOpenShop(null)}
          />
        ))}
    </div>
  );
}
