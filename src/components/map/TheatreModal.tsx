import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { daySerial } from "@/lib/gameTime";
import { WASE_HOURS, WASE_PRICE, pickWaseGain, showsLeft } from "@/data/theatre";
import { Coins, Loader2, Music, X } from "lucide-react";

/**
 * 瓦舍的台口：撂下几枚戏钱，挤进人堆里听一场戏。
 * 台上唱念做打，台下人声嘈杂，听来的门道会落到身上某门本事上。
 * 一日最多听两场，多了耳朵也听木了。
 */
export function TheatreModal({
  label,
  culture,
  shop,
  onClose,
}: {
  label: string;
  culture?: string;
  shop: { name: string };
  onClose: () => void;
}) {
  const skills = useGameStore((s) => s.skills);
  const waseShows = useGameStore((s) => s.waseShows);
  const currentTime = useGameStore((s) => s.currentTime);
  const stones = useGameStore((s) => s.spiritStones.low);
  const payStones = useGameStore((s) => s.payStones);
  const recordPlay = useGameStore((s) => s.recordPlay);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const listenToPlay = useAIStore((s) => s.listenToPlay);

  const [busy, setBusy] = useState(false);
  const [telling, setTelling] = useState("");
  /** 这一场听下来的去处：某门本事长了几分火候，或是多出一门新本事 */
  const [gained, setGained] = useState<{ name: string; gain: number; isNew?: boolean } | null>(null);
  const [error, setError] = useState("");

  const today = daySerial(currentTime);
  const left = showsLeft(waseShows, today);
  const short = WASE_PRICE - stones;

  /** 听一场：先记下听来的门道，再请人把这一场写成叙事 */
  const play = async () => {
    if (busy) return;
    if (left <= 0) {
      setError("今日的戏听足了，再坐下去耳朵也听不出门道。");
      return;
    }
    if (short > 0) {
      setError(`戏钱不够，还差 ${short}。`);
      return;
    }

    // 台上这一场能不能落到哪门本事上，此刻就定下
    const pick = pickWaseGain(skills);
    // 喂给叙事的那一句门道：要么是身上已有的本事，要么是这一场听出来的新名目
    const hint = pick ? (pick.kind === "train" ? pick.name : pick.skill.name) : undefined;

    setBusy(true);
    setError("");
    try {
      const text = await listenToPlay({
        shop: shop.name,
        market: label,
        culture,
        skill: hint,
      });
      payStones(WASE_PRICE);
      recordPlay({
        skillId: pick?.kind === "train" ? pick.id : undefined,
        gain: pick?.kind === "train" ? pick.gain : 0,
        newSkill: pick?.kind === "new" ? pick.skill : undefined,
      });
      advanceTime(WASE_HOURS);
      setTelling(text);
      setGained(
        pick?.kind === "train"
          ? { name: pick.name, gain: pick.gain }
          : pick?.kind === "new"
            ? { name: pick.skill.name, gain: 0, isNew: true }
            : null,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[84vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Music size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{shop.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {label} · 一场戏 {WASE_PRICE} 枚下品灵石，费 {WASE_HOURS} 个时辰
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
          <ScrollCard title="今日的台口" subtitle={`一日最多两场，今日还剩 ${left} 场`}>
            <p className="font-serif text-sm leading-relaxed text-paper-100">
              台上鼓板一响，台下便挤满了人。卖零嘴的、嗑瓜子的、踮脚往里看的，肩膀挨着肩膀。
              听一场戏费 {WASE_HOURS} 个时辰，戏文里的门道也未必白听——落到哪门本事上，全看当时心里想着什么。
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="flex items-center gap-1 font-serif text-xs text-paper-300/80">
                <Coins size={12} className="text-gold-400/80" />
                戏钱 {WASE_PRICE} 枚下品灵石
              </span>
              <SealButton onClick={play} disabled={busy || left <= 0 || short > 0} className="px-4 py-1.5 text-xs">
                {busy && <Loader2 size={12} className="mr-1 animate-spin" />}
                听戏
              </SealButton>
            </div>

            {left <= 0 && (
              <p className="mt-2 font-serif text-[11px] text-paper-400/45">
                今日已经听过两场，明日再来。
              </p>
            )}
            {left > 0 && short > 0 && (
              <p className="mt-2 font-serif text-[11px] text-cinnabar-400">下品灵石不够，还差 {short} 。</p>
            )}
            {error && <p className="mt-2 font-serif text-[11px] text-cinnabar-400 leading-relaxed">{error}</p>}
          </ScrollCard>

          {telling && (
            <ScrollCard
              title="这一场"
              subtitle={gained ? (gained.isNew ? `由此多了一门本事「${gained.name}」` : `听下来的门道落到了「${gained.name}」上`) : undefined}
            >
              <p className="font-serif text-sm leading-relaxed text-paper-100 whitespace-pre-wrap">{telling}</p>
              {gained && (
                <p className="mt-3 pt-3 border-t border-gold-500/15 font-serif text-[11px] text-jade-400/80">
                  {gained.isNew
                    ? `台上那几句正撞在心坎上，你自此多了一门本事：「${gained.name}」。`
                    : `「${gained.name}」长了 ${gained.gain} 分火候。`}
                </p>
              )}
              <p className="mt-2 font-serif text-[11px] text-paper-400/45">
                一折戏下来，{WASE_HOURS} 个时辰就这么过去了。
              </p>
            </ScrollCard>
          )}
        </div>
      </div>
    </div>
  );
}
