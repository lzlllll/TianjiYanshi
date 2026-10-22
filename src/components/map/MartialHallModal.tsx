import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { useAIStore } from "@/store/useAIStore";
import type { MartialArtOption } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { HOURS_PER_DAY } from "@/data/rooms";
import { formatTimeShort, shiftGameTime } from "@/lib/gameTime";
import type { DataOp } from "@/data/types";
import { Swords, Dumbbell, Loader2, Scroll, Coins, X } from "lucide-react";

/** 演武场每租一日的场地钱，下品灵石 */
const GYM_FEE_PER_DAY = 20;
/** 武馆场地比寻常处所强出的倍数 */
const GYM_MUL = 1.2;
const DAY_OPTIONS = [1, 3, 5];

/**
 * 武馆：可租演武场练一门已习的功法，也可请教习现列一份低阶武学名录，
 * 花束脩拜师学艺。所练所得皆由代码确定性结算。
 */
export function MartialHallModal({
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
  shop: { id: string; kind: string; name: string; keeper?: { name: string; title: string } };
  onClose: () => void;
}) {
  const techniques = useGameStore((s) => s.techniques);
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const payStones = useGameStore((s) => s.payStones);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const addLog = useGameStore((s) => s.addLog);
  const applyOps = useGameStore((s) => s.applyOps);
  const trainAt = useGameStore((s) => s.trainAt);
  const currentTime = useGameStore((s) => s.currentTime);
  const listMartialArts = useAIStore((s) => s.listMartialArts);

  const [tab, setTab] = useState<"field" | "roster">("field");
  const [pickedTech, setPickedTech] = useState<string>("");
  const [days, setDays] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [roster, setRoster] = useState<MartialArtOption[]>([]);
  const [learned, setLearned] = useState<string[]>([]);
  const [rosterBusy, setRosterBusy] = useState(false);

  const list = Array.isArray(techniques) ? techniques : [];
  const target = list.find((t) => t.id === pickedTech) ?? list[0];
  const fee = days * GYM_FEE_PER_DAY;

  /** 租演武场：按日付场地钱，练指定功法，进度记在功法上，修为随之长 */
  const practice = () => {
    if (!target) {
      setError("你还没习得一门功法，无从演武。");
      return;
    }
    if (!payStones(fee)) {
      setError(`下品灵石不够，演武场租 ${days} 日要 ${fee}。`);
      return;
    }
    setError("");
    const hours = days * HOURS_PER_DAY;
    const gain = trainAt(target.id, hours, GYM_MUL);
    advanceTime(hours);
    addLog(`你在「${shop.name}」的演武场练「${target.name}」${days} 日，进度 +${gain}，付了 ${fee} 下品灵石。`);
    setNote(`演武 ${days} 日，${target.name} 进度 +${gain}。`);
  };

  /** 请教习现列一份低阶武学名录 */
  const askRoster = async () => {
    if (rosterBusy) return;
    setRosterBusy(true);
    setError("");
    setNote("");
    try {
      const arts = await listMartialArts({ culture });
      setRoster(arts);
      setLearned([]);
      if (arts.length === 0) setNote("教习这一回没列出什么像样的武学，改日再来。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRosterBusy(false);
    }
  };

  /** 拜师学艺：付束脩，把这一门录入自身功法 */
  const learn = (art: MartialArtOption) => {
    if (learned.includes(art.id)) return;
    if (!payStones(art.price)) {
      setError(`束脩要 ${art.price} 下品灵石，眼下不够。`);
      return;
    }
    setError("");
    applyOps([
      {
        kind: "add",
        collection: "techniques",
        payload: {
          id: art.id,
          name: art.name,
          category: art.category,
          grade: art.grade,
          element: art.element,
          proficiency: 0,
          proficiencyMax: art.proficiencyMax,
          description: art.description,
          insight: art.insight,
        },
      },
    ] as DataOp[]);
    setLearned((prev) => [...prev, art.id]);
    setNote(`你拜入「${shop.name}」门下，习得「${art.name}」，付了束脩 ${art.price} 下品灵石。`);
    addLog(`你在「${shop.name}」学得「${art.name}」，付束脩 ${art.price} 下品灵石。`);
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
            <Swords size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{shop.name}</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5 truncate">
                {label} · 武馆
                {shop.keeper ? ` · ${shop.keeper.name}（${shop.keeper.title}）` : ""}
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
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTab("field")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded font-brush text-sm tracking-wider transition-all border",
                tab === "field" ? "border-gold-400/50 bg-gold-400/10 text-gold-400" : "border-paper-400/15 bg-ink-900/40 text-paper-400/70",
              )}
            >
              <Dumbbell size={13} /> 演武场
            </button>
            <button
              onClick={() => setTab("roster")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded font-brush text-sm tracking-wider transition-all border",
                tab === "roster" ? "border-gold-400/50 bg-gold-400/10 text-gold-400" : "border-paper-400/15 bg-ink-900/40 text-paper-400/70",
              )}
            >
              <Scroll size={13} /> 武学名录
            </button>
          </div>

          {tab === "field" && (
            <ScrollCard title="演武场" subtitle="租一片场地，习练一门已会的功法">
              <p className="font-serif text-xs text-ink-light leading-relaxed mb-3">
                场地按日计钱，一日 {GYM_FEE_PER_DAY} 下品灵石。此处胜在清静宽敞，进益约当山门的一点二倍。
              </p>

              {list.length === 0 ? (
                <p className="font-serif text-xs text-ink-lightest py-2">
                  你还没习得一门功法，先去名录里拜师学一门，再来演武。
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2 font-serif text-xs text-ink-dark">
                    功法
                    <select
                      value={target?.id ?? ""}
                      onChange={(e) => setPickedTech(e.target.value)}
                      className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                    >
                      {list.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}（{t.category}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 font-serif text-xs text-ink-dark">
                    几日
                    <select
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                      className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                    >
                      {DAY_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d} 日</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <SealButton onClick={practice} disabled={list.length === 0} className="px-4 py-2 text-sm">
                  <span className="flex items-center justify-center gap-1.5">
                    <Dumbbell size={13} /> 租场演武 {days} 日（{fee}）
                  </span>
                </SealButton>
                <span className="font-serif text-[11px] text-ink-lightest">
                  现有折合下品灵石 {stones}；演武至 {formatTimeShort(shiftGameTime(currentTime, days * HOURS_PER_DAY))}
                </span>
              </div>
            </ScrollCard>
          )}

          {tab === "roster" && (
            <ScrollCard title="武学名录" subtitle="请教习现列几门低阶武学，花束脩拜师">
              <div className="flex items-center gap-3 mb-3">
                <SealButton onClick={() => void askRoster()} disabled={rosterBusy} className="px-4 py-2 text-sm">
                  <span className="flex items-center justify-center gap-1.5">
                    {rosterBusy ? <Loader2 size={13} className="animate-spin" /> : <Scroll size={13} />}
                    {rosterBusy ? "教习正在拟名录……" : "请列一份武学名录"}
                  </span>
                </SealButton>
              </div>

              {roster.length > 0 && (
                <div className="space-y-2">
                  {roster.map((art) => {
                    const got = learned.includes(art.id);
                    return (
                      <div key={art.id} className="p-3 rounded border border-paper-400/20 bg-paper-old/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-brush text-base text-ink-dark">{art.name}</span>
                          <span className="font-serif text-xs text-ink-lightest">
                            {art.grade} · {art.category} · {art.element}系
                          </span>
                        </div>
                        <p className="font-serif text-xs text-ink-medium leading-relaxed">{art.description}</p>
                        {art.insight && (
                          <p className="font-serif text-[11px] text-ink-lightest mt-1 italic">「{art.insight}」</p>
                        )}
                        <div className="mt-2 flex items-center gap-3">
                          <SealButton
                            variant="ghost"
                            disabled={got}
                            onClick={() => learn(art)}
                            className="px-3 py-1.5 text-xs"
                          >
                            <span className="flex items-center gap-1.5">
                              <Coins size={12} /> {got ? "已习得" : `拜师（${art.price}）`}
                            </span>
                          </SealButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollCard>
          )}

          {note && <p className="font-serif text-xs text-ink-dark pt-3 leading-relaxed">{note}</p>}
          {error && <p className="font-serif text-xs text-cinnabar-500 pt-3 leading-relaxed">{error}</p>}
        </div>
      </div>
    </div>
  );
}
