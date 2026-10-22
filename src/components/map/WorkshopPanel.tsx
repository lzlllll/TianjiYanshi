import { useMemo, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { tradeOf } from "@/data/craftsmen";
import { manorKey, migrateRelation } from "@/data/npcGen";
import { pactDaysLeft, pactReady, pactKindLabel } from "@/data/pacts";
import { daySerial } from "@/lib/gameTime";
import type { Relation, Workshop } from "@/data/types";
import { Coins, Hammer, MessageCircle, PackageCheck, X } from "lucide-react";

/** 点开一处匠人区时要看的东西 */
export interface WorkshopTarget {
  cityId: string;
  districtId: number;
  /** 面板抬头，如「长安·匠人区」 */
  label: string;
  culture?: string;
  workshop: Workshop;
}

/**
 * 匠人区：临水的几条街上开着几间作坊，工匠一早便定下，这一局里不换人。
 * 上门说得出要什么，匠人便掂量料钱工钱报一份单子；说定了，日子到了来取便是。
 */
export function WorkshopPanel({
  cityId,
  districtId,
  label,
  culture,
  workshop,
  onClose,
}: WorkshopTarget & { onClose: () => void }) {
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const currentTime = useGameStore((s) => s.currentTime);
  const pacts = useGameStore((s) => s.pacts);
  const settlePact = useGameStore((s) => s.settlePact);
  const meetNpc = useGameStore((s) => s.meetNpc);
  const live = useGameStore((s) => s.workshops[manorKey(cityId, districtId)]) ?? workshop;
  const openNPCChat = useAIStore((s) => s.openNPCChat);

  const [note, setNote] = useState("");
  const today = daySerial(currentTime);

  /** 在这一处作坊里定下、还没取的活 */
  const mine = useMemo(
    () => pacts.filter((p) => p.status === "open" && p.cityId === cityId && p.districtId === districtId),
    [pacts, cityId, districtId],
  );

  /** 作坊里立着的那件家什，报了名号才算得上一间铺子 */
  const shopOf = (c: Relation) => `${c.name}的${tradeOf(c)?.title ?? "作坊"}`;

  /** 上门攀谈：认下这个人，再把作坊的场面一并交代给交谈窗口 */
  const talkTo = (c: Relation) => {
    meetNpc(c);
    const trade = tradeOf(c);
    openNPCChat(c.id, {
      shop: shopOf(c),
      craft: trade?.title,
      craftHint: trade?.kindHint,
      culture,
      cityId,
      districtId,
    });
  };

  /** 日子到了，来取说定的东西 */
  const take = (pactId: string, name: string) => {
    if (settlePact(pactId)) {
      setNote(`${name}取了回来。`);
    } else {
      setNote("还没到取货的日子，匠人手上的活也没做完。");
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Hammer size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{label}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                作坊 {live.craftsmen.length} 间 · 定做的东西说定日子，到期来取
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {live.background && (
            <p className="font-serif text-xs text-paper-400/60 leading-relaxed">{live.background}</p>
          )}

          {/* 说定还没取的活：日子到了才取得走，误了期也不罚 */}
          {mine.length > 0 && (
            <ScrollCard title="在这儿定下的活" subtitle="日子到了才取得走">
              <ul className="space-y-2">
                {mine.map((p) => {
                  const ready = pactReady(p, today);
                  const left = pactDaysLeft(p, today);
                  return (
                    <li key={p.id} className="flex items-center gap-2 min-w-0">
                      <PackageCheck size={12} className="text-jade-400/70 shrink-0" />
                      <span className="flex-1 min-w-0 font-serif text-sm text-paper-100 truncate">
                        {p.item?.name ?? p.name}
                        <span className="font-serif text-[11px] text-paper-400/50 ml-2">
                          {pactKindLabel(p.kind)} · {p.giver}
                        </span>
                      </span>
                      <span className="shrink-0 font-number text-[11px] text-paper-400/55">
                        {left > 0 ? `还需 ${left} 日` : left === 0 ? "今日可取" : `已过 ${-left} 日`}
                      </span>
                      <SealButton
                        variant={ready ? "seal" : "ghost"}
                        disabled={!ready}
                        onClick={() => take(p.id, p.item?.name ?? p.name)}
                        className="shrink-0 px-3 py-1 text-[11px]"
                      >
                        {ready ? "取货" : "等货"}
                      </SealButton>
                    </li>
                  );
                })}
              </ul>
            </ScrollCard>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            {live.craftsmen.map((c) => {
              const trade = tradeOf(c);
              return (
                <ScrollCard key={c.id} className="!p-3 flex flex-col">
                  <div className="flex items-start gap-2">
                    <div className="w-10 h-10 shrink-0 red-seal text-sm">{c.name.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h4 className="font-brush text-base text-paper-50 truncate">{c.name}</h4>
                        <span className="shrink-0 font-serif text-[11px] text-gold-400/70">
                          {trade?.title ?? c.title}
                        </span>
                      </div>
                      <p className="font-serif text-[11px] text-paper-400/55 mt-0.5 truncate">
                        {trade ? `守着${trade.work}` : "作坊"}
                        {c.personality ? ` · ${c.personality}` : ""}
                      </p>
                    </div>
                  </div>

                  {c.note && (
                    <p className="font-serif text-[11px] text-paper-300/75 leading-relaxed mt-2">{c.note}</p>
                  )}

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gold-500/15">
                    <span className="font-serif text-[11px] text-paper-400/50">
                      关系 <span className="font-number text-paper-200/80">{migrateRelation(c).relation}</span>
                    </span>
                    <SealButton onClick={() => talkTo(c)} className="px-3 py-1 text-[11px]">
                      <MessageCircle size={11} className="mr-1" />
                      交谈
                    </SealButton>
                  </div>
                </ScrollCard>
              );
            })}
          </div>

          {note && <p className="font-serif text-xs text-gold-400/80 leading-relaxed">{note}</p>}

          <p className="font-serif text-[11px] text-paper-400/45 leading-relaxed">
            上门与匠人说明白要做什么，他会掂量料钱与工钱报一份单子；价钱当面付清，日子一到便来取。
          </p>
        </div>
      </div>
    </div>
  );
}
