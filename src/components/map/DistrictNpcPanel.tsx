import { useMemo, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import type { EstateOffer, Relation } from "@/data/types";
import { isAroundHere, isPinnedAt, relationWhereabout, rollDistrictNpc } from "@/data/npcGen";
import { getMarker } from "@/data/map";
import { HAGGLE_DC, haggleDiscount, rollEstateOffer } from "@/data/estates";
import { daySerial } from "@/lib/gameTime";
import { Home, MessageCircle, UserRound, X } from "lucide-react";

/** 点开一处街区时要看的东西 */
export interface DistrictNpcTarget {
  cityId: string;
  districtId: number;
  /** 面板抬头，如「长安 · 平民住宅」 */
  label: string;
  /** 本次推门进来撞见的那几张生面孔；谈过一次就固定进尘缘，往后都在这块地上 */
  strangers: Relation[];
}

/** 某个街区上的人和事：已结识的常客，加上现撞见的生面孔 */
export function DistrictNpcPanel({ cityId, districtId, label, strangers, onClose }: DistrictNpcTarget & { onClose: () => void }) {
  const relations = useGameStore((s) => s.relations);
  const meetNpc = useGameStore((s) => s.meetNpc);
  const currentTime = useGameStore((s) => s.currentTime);
  const districtNames = useGameStore((s) => s.districtNames);
  const quests = useGameStore((s) => s.quests);
  const openNPCChat = useAIStore((s) => s.openNPCChat);
  const payStones = useGameStore((s) => s.payStones);
  const buyEstate = useGameStore((s) => s.buyEstate);
  const skills = useGameStore((s) => s.skills);
  const narrateEstateDeal = useAIStore((s) => s.narrateEstateDeal);

  /** 置业：找一处待售屋舍，报价由效率定，可讲价 */
  const [offer, setOffer] = useState<EstateOffer | null>(null);
  const [agent, setAgent] = useState<Relation | null>(null);
  const [price, setPrice] = useState(0);
  const [bargained, setBargained] = useState(false);
  const [estateNote, setEstateNote] = useState("");

  const findEstate = async () => {
    const culture = getMarker(cityId)?.culture;
    const next = rollEstateOffer({ place: label, culture, cityId, districtId });
    const who = rollDistrictNpc(label, cityId, districtId, culture);
    setOffer(next);
    setPrice(next.price);
    setAgent(who);
    setBargained(false);
    setEstateNote(`街坊指给你一处待售的屋舍：「${next.name}」。`);
    try {
      const text = await narrateEstateDeal({
        kind: "offer",
        name: next.name,
        place: next.place,
        baseEfficiency: next.baseEfficiency,
        price: next.price,
        agentName: who.name,
        agentTitle: who.title,
      });
      setEstateNote(text);
    } catch {
      /* 接口不通就留那句现成的话 */
    }
  };

  /** 讲价：押上一门本事去磨，成不成只看一回判定 */
  const haggle = () => {
    if (!offer || bargained) return;
    const level = Math.max(0, ...(skills ?? []).map((s) => Number(s.level) || 0));
    const roll = 1 + Math.floor(Math.random() * 20);
    const discount = haggleDiscount(roll, level, HAGGLE_DC);
    setBargained(true);
    if (discount <= 0) {
      setEstateNote(`你陪着说合了半日，房主不松口，仍是 ${price} 灵石。`);
      return;
    }
    const nextPrice = Math.max(1, Math.round(offer.price * (1 - discount)));
    setPrice(nextPrice);
    setEstateNote(`你磨了半晌，房主让了 ${Math.round(discount * 100)}%，作 ${nextPrice} 灵石。`);
  };

  const buy = async () => {
    if (!offer) return;
    if (!payStones(price)) {
      setEstateNote(`下品灵石不够，要 ${price}。`);
      return;
    }
    const paid = price;
    buyEstate(offer, paid);
    setOffer(null);
    setAgent(null);
    setEstateNote(`你买下了「${offer.name}」，花 ${paid} 下品灵石。`);
    try {
      const text = await narrateEstateDeal({
        kind: "deal",
        name: offer.name,
        place: offer.place,
        baseEfficiency: offer.baseEfficiency,
        price: paid,
      });
      setEstateNote(text);
    } catch {
      /* 接口不通就留那句现成的话 */
    }
  };

  const today = daySerial(currentTime);

  // 手上这一处还有没办完的差事：整条街挂个记号，要找的人单独星标
  const errands = useMemo(
    () =>
      quests.filter(
        (q) => q.status === "open" && q.target?.cityId === cityId && q.target.districtId === districtId,
      ),
    [quests, cityId, districtId],
  );
  const wanted = useMemo(
    () => new Set(errands.map((q) => q.target?.person).filter((n): n is string => !!n)),
    [errands],
  );

  // 落脚在这一处的人；只知道在这座城里、说不准哪一处的，也一并算上
  const known = useMemo(() => {
    const here = relations.filter((r) => isAroundHere(r, cityId, districtId));
    return [
      ...here.filter((r) => isPinnedAt(r, cityId, districtId, today)),
      ...here.filter((r) => !isPinnedAt(r, cityId, districtId, today)),
    ];
  }, [relations, cityId, districtId, today]);

  // 谈过的就从生面孔里挪走，不然同一人会同时挂在「旧识」与「生面孔」两栏
  const fresh = useMemo(() => {
    const taken = new Set(known.map((r) => r.name));
    return strangers.filter((s) => !taken.has(s.name));
  }, [strangers, known]);

  /** 交谈即认下这个人：先落进尘缘，再开口 */
  const talkTo = (npc: Relation) => {
    meetNpc(npc);
    openNPCChat(npc.id);
  };

  // 层级压在交谈窗口之下：从这儿点开交谈，谈完退回来还是这一处街区
  return (
    <div className="mainui-black fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[78vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <UserRound size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{label}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5">
                此处住着 {known.length + fresh.length} 人
              </p>
              {errands.length > 0 && (
                <p className="font-serif text-xs text-cinnabar-300 mt-0.5">
                  ★ 你有一桩差事要办在此处：{errands.map((q) => q.name).join("、")}
                </p>
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 置业：向街坊打听，看这附近可有屋舍要出手 */}
          <ScrollCard title="置业" subtitle="问问街坊，这附近可有屋舍要出手">
            <div className="flex items-center gap-3">
              <SealButton variant="ghost" onClick={findEstate} className="px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5"><Home size={12} /> 寻找可购置房产</span>
              </SealButton>
            </div>

            {offer && (
              <div className="mt-3 rounded border-2 border-ink-lightest/40 bg-paper-old/60 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-brush text-base text-ink-dark">{offer.name}</span>
                  <span className="font-serif text-xs text-ink-light">基础效率 {offer.baseEfficiency.toFixed(2)}</span>
                </div>
                {agent && (
                  <p className="font-serif text-xs text-ink-light mb-1">经手人：{agent.name}（{agent.title}）</p>
                )}
                <p className="font-serif text-xs text-ink-medium leading-relaxed">
                  房主开价 {price} 下品灵石。屋舍可免费歇息、修炼、演武、储物；进益按基础效率与完好度合算。
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <SealButton onClick={buy} className="px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5">买下（{price}）</span>
                  </SealButton>
                  <SealButton variant="ghost" onClick={haggle} disabled={bargained} className="px-3 py-1.5 text-xs">
                    讲价
                  </SealButton>
                </div>
              </div>
            )}

            {estateNote && <p className="font-serif text-xs text-ink-dark pt-2 leading-relaxed">{estateNote}</p>}
          </ScrollCard>

          {known.length > 0 && (
            <section>
              <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">旧识</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {known.map((npc) => (
                  <NpcCard
                    key={npc.id}
                    npc={npc}
                    met
                    where={relationWhereabout(npc, districtNames)}
                    pinned={isPinnedAt(npc, cityId, districtId, today)}
                    wanted={wanted.has(npc.name)}
                    onTalk={() => talkTo(npc)}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-brush text-sm text-paper-400/70 tracking-widest mb-2">
              {known.length > 0 ? "生面孔" : "此间的人"}
            </h3>
            {fresh.length === 0 ? (
              <p className="font-serif text-xs text-paper-400/50 py-6 text-center">
                {known.length > 0 ? "这一处的人你都已认得。" : "街上冷冷清清，没撞见什么人。"}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fresh.map((npc) => (
                  <NpcCard key={npc.id} npc={npc} onTalk={() => talkTo(npc)} />
                ))}
              </div>
            )}
          </section>

          <p className="font-serif text-[11px] text-paper-400/40 leading-relaxed">
            与人攀谈过，他便留在尘缘里，往后到这块地上都还能寻见。
          </p>
        </div>
      </div>
    </div>
  );
}

function NpcCard({
  npc,
  met,
  where,
  pinned,
  wanted,
  onTalk,
}: {
  npc: Relation;
  met?: boolean;
  where?: string;
  pinned?: boolean;
  /** 有差事正等着找这个人 */
  wanted?: boolean;
  onTalk: () => void;
}) {
  const detail = [
    npc.gender && npc.gender !== "不详" ? npc.gender : "",
    npc.age ? `${npc.age} 岁` : "",
    npc.realm,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollCard className="!p-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 red-seal text-base">{npc.name.charAt(0)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h4 className="font-brush text-base text-paper-50 truncate">
              {wanted && <span className="text-cinnabar-300 mr-0.5">★</span>}
              {npc.name}
            </h4>
            <span className="font-serif text-xs text-gold-400/70 shrink-0">「{npc.title}」</span>
          </div>
          <div className="font-serif text-[11px] text-paper-400/60 mt-0.5">{detail}</div>
        </div>
        {wanted && (
          <span className="shrink-0 font-serif text-[10px] px-1.5 py-0.5 rounded border border-cinnabar-500/40 bg-cinnabar-500/10 text-cinnabar-300">
            差事要寻他
          </span>
        )}
        {pinned && (
          <span className="shrink-0 font-serif text-[10px] px-1.5 py-0.5 rounded border border-gold-500/35 bg-gold-500/10 text-gold-400">
            常住此处
          </span>
        )}
      </div>

      {met ? (
        <dl className="mt-2 space-y-0.5 font-serif text-[11px] leading-relaxed text-paper-300/75">
          {npc.persona && <Line label="脾性" value={npc.persona} />}
          {npc.personality && <Line label="性情" value={npc.personality} />}
          {npc.appearance && <Line label="形貌" value={npc.appearance} />}
          {npc.origin && <Line label="出身" value={npc.origin} />}
          {npc.affiliation && npc.affiliation !== "无" && <Line label="所属" value={npc.affiliation} />}
        </dl>
      ) : (
        // 生面孔只露面上能看出来的，出身性情这些得攀谈过才写进尘缘
        <p className="mt-2 font-serif text-[11px] text-paper-400/45">面生，不知底细。</p>
      )}

      {(where || npc.metAt) && (
        <div className="mt-1.5 font-serif text-[11px] text-paper-400/45">
          {where && <>现在在{where}</>}
          {where && npc.metAt && " · "}
          {npc.metAt && <>{met ? `于${npc.metAt}初识` : `常见于${npc.metAt}`}</>}
        </div>
      )}

      <SealButton onClick={onTalk} variant="ghost" className="w-full py-1.5 text-xs mt-3">
        <MessageCircle size={12} className="mr-1" />
        交谈
      </SealButton>
    </ScrollCard>
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
