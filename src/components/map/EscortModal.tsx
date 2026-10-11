import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { ESCORT_DAYS_RANGE, ESCORT_FEE_RANGE } from "@/data/escort";
import { REALM_NAMES } from "@/data/mockData";
import { MAX_TRAVEL_COMPANIONS } from "@/data/npcGen";
import { daySerial } from "@/lib/gameTime";
import type { EscortOffer, Shop } from "@/data/types";
import { Coins, Footprints, Loader2, Shield, X } from "lucide-react";

/**
 * 镖局的柜上：问一声有没有人肯走一趟。
 * 柜上推举一位，把模样、来历、要价与肯走的时日一并交代；
 * 佣金当面付清便算雇下，雇期一到各自上路。
 */
export function EscortModal({
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
  const player = useGameStore((s) => s.player);
  const stones = useGameStore((s) => s.spiritStones.low);
  const currentTime = useGameStore((s) => s.currentTime);
  const relations = useGameStore((s) => s.relations);
  const hireEscort = useGameStore((s) => s.hireEscort);
  const findEscort = useAIStore((s) => s.findEscort);

  const [busy, setBusy] = useState(false);
  const [telling, setTelling] = useState("");
  const [offer, setOffer] = useState<EscortOffer | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const today = daySerial(currentTime);
  const companions = relations.filter((r) => r.traveling);
  const partyFull = companions.length >= MAX_TRAVEL_COMPANIONS;
  const short = offer ? offer.fee - stones : 0;

  /** 问柜上要人：让模型现写一位镖师出来 */
  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await findEscort({
        shop: shop.name,
        market: label,
        culture,
        realm: REALM_NAMES[player.realmIndex],
        stones,
      });
      setTelling(res.narration);
      setOffer(res.escort);
      if (!res.escort) setError("柜上问了半晌，眼下没人肯接这一趟。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** 雇下这一位：佣金付清，人自此与你同行 */
  const hire = () => {
    if (!offer) return;
    if (partyFull) {
      setError(`身边至多带 ${MAX_TRAVEL_COMPANIONS} 人，先与谁作别才好。`);
      return;
    }
    if (short > 0) {
      setError(`佣金不够，还差 ${short} 枚下品灵石。`);
      return;
    }
    if (!hireEscort({ offer, cityId, districtId, metAt: shop.name })) {
      setError("这一趟没雇成。");
      return;
    }
    setNote(
      `与「${offer.name}」说定，付佣金 ${offer.fee} 枚下品灵石，雇到第 ${today + offer.days} 日；到期他便告辞。`,
    );
    setOffer(null);
    setTelling("");
    setError("");
  };

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[86vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Shield size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{shop.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {label} · 雇一位镖师同行，雇期自今日算起
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1 font-serif text-xs text-paper-200">
              <Coins size={13} className="text-gold-400" />
              下品灵石 {stones}
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
          <ScrollCard title="柜上问话" subtitle={`眼下带着 ${companions.length} 位，至多 ${MAX_TRAVEL_COMPANIONS} 位`}>
            <p className="font-serif text-sm leading-relaxed text-paper-100">
              柜上坐着一班走镖的人，多半刚歇下脚，正等着下一趟活。
              问一声要去哪儿、走几日，自然有人掂量着接不接。
              佣金当面付清；雇期一到，各走各的路。
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-serif text-[11px] text-paper-400/55">
                佣金 {ESCORT_FEE_RANGE[0]}~{ESCORT_FEE_RANGE[1]} 灵石，雇期 {ESCORT_DAYS_RANGE[0]}~{ESCORT_DAYS_RANGE[1]} 日
              </span>
              <SealButton onClick={ask} disabled={busy || partyFull} className="px-4 py-1.5 text-xs">
                {busy && <Loader2 size={12} className="mr-1 animate-spin" />}
                寻找镖师
              </SealButton>
            </div>
            {partyFull && (
              <p className="mt-2 font-serif text-[11px] text-paper-400/45">
                身边的人已经满了，得先与谁作别才雇得下新的。
              </p>
            )}
            {error && <p className="mt-2 font-serif text-[11px] text-cinnabar-400 leading-relaxed">{error}</p>}
          </ScrollCard>

          {telling && (
            <ScrollCard title="柜上推举的这位">
              <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">{telling}</p>
            </ScrollCard>
          )}

          {offer && (
            <ScrollCard className="!p-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 shrink-0 red-seal text-base">{offer.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h4 className="font-brush text-base text-paper-50 truncate">{offer.name}</h4>
                    <span className="font-serif text-xs text-gold-400/70 shrink-0">「{offer.title}」</span>
                  </div>
                  <div className="font-serif text-[11px] text-paper-400/60 mt-0.5">
                    {[offer.gender && offer.gender !== "不详" ? offer.gender : "", offer.age ? `${offer.age} 岁` : "", offer.realm]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </div>

              <dl className="mt-2 space-y-0.5 font-serif text-[11px] leading-relaxed text-paper-300/75">
                {offer.personality && <Line label="性情" value={offer.personality} />}
                {offer.appearance && <Line label="形貌" value={offer.appearance} />}
                {offer.origin && <Line label="出身" value={offer.origin} />}
                {offer.affiliation && offer.affiliation !== "无" && (
                  <Line label="所属" value={offer.affiliation} />
                )}
                <Line
                  label="身手"
                  value={`气血 ${offer.stats.hp}/${offer.stats.hpMax} · 灵力 ${offer.stats.mp}/${offer.stats.mpMax} · 攻 ${offer.stats.attack} 防 ${offer.stats.defense} 速 ${offer.stats.speed}`}
                />
              </dl>

              <p className="font-serif text-[11px] text-paper-300/80 leading-relaxed mt-2">{offer.note}</p>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gold-500/15">
                <span className="font-serif text-[11px] text-paper-400/60">
                  佣金 <span className="font-number text-gold-400">{offer.fee}</span> 下品灵石 · 雇{" "}
                  <span className="font-number text-gold-400">{offer.days}</span> 日
                </span>
                <SealButton onClick={hire} disabled={short > 0 || partyFull} className="px-4 py-1.5 text-xs shrink-0">
                  雇佣
                </SealButton>
              </div>
              {short > 0 && (
                <p className="mt-1.5 font-serif text-[11px] text-cinnabar-400">佣金不够，还差 {short} 枚下品灵石。</p>
              )}
            </ScrollCard>
          )}

          {note && <p className="font-serif text-xs text-gold-400/80 leading-relaxed">{note}</p>}

          {companions.length > 0 && (
            <div>
              <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">眼下同行的人</h3>
              <ul className="space-y-1.5">
                {companions.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded border border-gold-500/20 bg-ink-800/40"
                  >
                    <Footprints size={12} className="text-jade-400/70 shrink-0" />
                    <span className="flex-1 min-w-0 font-serif text-sm text-paper-100 truncate">
                      {r.name}
                      <span className="font-serif text-[11px] text-paper-400/55 ml-2">{r.realm}</span>
                    </span>
                    {typeof r.hireUntilDay === "number" && (
                      <span className="shrink-0 font-serif text-[11px] text-paper-400/55">
                        雇到第 {r.hireUntilDay} 日
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-paper-400/50">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
