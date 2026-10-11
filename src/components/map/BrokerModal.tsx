import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { jobOpen } from "@/data/broker";
import { isRewardHeld } from "@/data/quests";
import { manorKey } from "@/data/npcGen";
import { daySerial } from "@/lib/gameTime";
import type { Shop } from "@/data/types";
import { Gift, HandCoins, ScrollText, User, X } from "lucide-react";

/**
 * 牙行的柜上：柜上挂着几桩等人来接的差事，谁都能接；
 * 赏钱由牙行先押着，事办成了得回这儿来领，才算真到手。
 * 想听掌柜亲口交代，也可以直接与他攀谈。
 */
export function BrokerModal({
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
  const quests = useGameStore((s) => s.quests);
  const currentTime = useGameStore((s) => s.currentTime);
  const meetNpc = useGameStore((s) => s.meetNpc);
  const takeBrokerJob = useGameStore((s) => s.takeBrokerJob);
  const claimQuest = useGameStore((s) => s.claimQuest);
  const openNPCChat = useAIStore((s) => s.openNPCChat);

  const today = daySerial(currentTime);
  const keeper = live.keeper;
  const jobs = live.jobs ?? [];

  const mine = quests.filter((q) => q.broker?.shopId === live.id);
  const held = mine.filter(isRewardHeld);
  const open = mine.filter((q) => q.status === "open");

  /** 跟柜上的掌柜攀谈：他会亲口交代一桩差事，去处与赏罚都说得更活 */
  const talk = () => {
    if (!keeper) return;
    meetNpc(keeper);
    openNPCChat(keeper.id, {
      shop: live.name,
      kind: "牙行",
      culture,
      cityId,
      districtId,
      shopId: live.id,
    });
  };

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-4xl max-h-[86vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <HandCoins size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {label} · {keeper ? `${keeper.name}（${keeper.title}）` : "柜上无人"} · 赏押在柜上，办成回来领
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 押在柜上的赏：事办成了回来领，钱不到手这桩事不算完 */}
          {held.length > 0 && (
            <div>
              <h3 className="font-brush text-sm text-jade-400 tracking-widest mb-2">
                你押在这儿的赏
                <span className="font-serif text-[11px] text-paper-400/50 ml-2">事办成了，来柜上领才算到手</span>
              </h3>
              <div className="space-y-2.5">
                {held.map((q) => (
                  <ScrollCard key={q.id} className="!p-3">
                    <div className="flex items-baseline gap-2">
                      <Gift size={14} className="text-jade-400 shrink-0" />
                      <h4 className="flex-1 min-w-0 font-brush text-base text-paper-50 truncate">{q.name}</h4>
                      <span className="font-serif text-[11px] text-jade-400/80 shrink-0">
                        {q.rewardKind && q.rewardAmount ? `${q.rewardKind} ${q.rewardAmount}` : q.reward || "有酬谢"}
                      </span>
                    </div>
                    {q.outcome && (
                      <p className="font-serif text-[11px] text-paper-400/60 mt-1.5 leading-relaxed">{q.outcome}</p>
                    )}
                    <div className="flex justify-end mt-2">
                      <SealButton onClick={() => claimQuest(q.id)} className="px-4 py-1.5 text-xs">
                        领赏
                      </SealButton>
                    </div>
                  </ScrollCard>
                ))}
              </div>
            </div>
          )}

          {/* 柜上挂着的差事 */}
          <div>
            <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">
              柜上挂着的差事
              <span className="font-serif text-[11px] text-paper-400/50 ml-2">接下即算你的，限期自今日算起</span>
            </h3>
            {jobs.length === 0 ? (
              <p className="font-serif text-xs text-paper-400/50 py-6 text-center">柜上眼下没挂着什么差事。</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                {jobs.map((job) => {
                  const canTake = jobOpen(job);
                  return (
                    <ScrollCard key={job.id} className="!p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="flex-1 min-w-0 font-brush text-base text-paper-50 truncate">{job.name}</h4>
                        <span
                          className={
                            "shrink-0 font-serif text-[11px] " +
                            (canTake ? "text-paper-400/60" : "text-paper-400/35")
                          }
                        >
                          {canTake ? `限 ${job.days} 日` : "已接下"}
                        </span>
                      </div>
                      <p className="font-serif text-[12px] text-paper-200/85 leading-relaxed mt-1.5">{job.desc}</p>
                      <p className="font-serif text-[11px] text-paper-300/70 leading-relaxed mt-1">
                        交差：{job.condition}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap mt-2">
                        {job.place && (
                          <span className="font-serif text-[11px] text-paper-400/60">{job.place}</span>
                        )}
                        <span className="flex items-center gap-1 font-serif text-[11px] text-jade-400/80">
                          <Gift size={11} />
                          {job.rewardKind && job.rewardAmount
                            ? `${job.rewardKind} ${job.rewardAmount}`
                            : job.reward || "有酬谢"}
                        </span>
                        {job.penalty && (
                          <span className="font-serif text-[11px] text-cinnabar-300/70">误期：{job.penalty}</span>
                        )}
                      </div>
                      <p className="font-serif text-[11px] text-paper-400/40 mt-1.5">
                        赏钱由牙行先押着，办成了回柜上领。
                      </p>
                      <SealButton
                        variant={canTake ? "seal" : "ghost"}
                        disabled={!canTake}
                        onClick={() =>
                          takeBrokerJob({ key, shopId: live.id, jobId: job.id, cityId, districtId })
                        }
                        className="w-full py-1.5 text-xs mt-3"
                      >
                        {canTake ? "接下这桩" : "已接下"}
                      </SealButton>
                    </ScrollCard>
                  );
                })}
              </div>
            )}
          </div>

          {/* 在这里揽下、还在办的事 */}
          {open.length > 0 && (
            <div>
              <h3 className="font-brush text-sm text-paper-300/80 tracking-widest mb-2">你在这儿揽下的事</h3>
              <ul className="space-y-2">
                {open.map((q) => {
                  const left = q.dueDay === undefined ? undefined : q.dueDay - today;
                  return (
                    <li
                      key={q.id}
                      className="flex items-center gap-2 px-3 py-2 rounded border border-gold-500/20 bg-ink-800/40"
                    >
                      <ScrollText size={12} className="text-gold-400/70 shrink-0" />
                      <span className="flex-1 min-w-0 font-serif text-sm text-paper-100 truncate">{q.name}</span>
                      <span className="shrink-0 font-serif text-[11px] text-paper-400/55">
                        {q.target && <span className="text-cinnabar-300 mr-0.5">★</span>}
                        {q.target?.label || q.place || "去处未定"}
                      </span>
                      <span
                        className={
                          "shrink-0 font-number text-[11px] " +
                          (left !== undefined && left <= 2 ? "text-cinnabar-300" : "text-paper-400/50")
                        }
                      >
                        {left === undefined ? "不限时" : left < 0 ? `已误 ${-left} 日` : `还剩 ${left} 日`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 柜上的人 */}
          {keeper && (
            <div className="pt-2 border-t border-gold-500/15">
              <div className="flex items-center gap-2">
                <User size={12} className="text-gold-400/70 shrink-0" />
                <span className="font-brush text-sm text-paper-100 truncate">{keeper.name}</span>
                <span className="font-serif text-[11px] text-paper-400/55 truncate">
                  {keeper.title}
                  {keeper.personality ? ` · ${keeper.personality}` : ""}
                </span>
              </div>
              <p className="font-serif text-[11px] text-paper-400/50 mt-1 leading-relaxed">
                柜上的差事是写死的常例。要听更活泛的买卖，还得与他本人攀谈。
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <SealButton disabled={!keeper} onClick={talk} className="px-4 py-2 text-sm">
              和掌柜交谈
            </SealButton>
            <span className="font-serif text-[11px] text-paper-400/45">
              攀谈里他若交代下差事，赏也一样押在柜上
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
