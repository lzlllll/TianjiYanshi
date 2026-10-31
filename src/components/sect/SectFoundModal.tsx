import { useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { useAIStore } from "@/store/useAIStore";
import { getMarker } from "@/data/map";
import { SECT_FOUND_STONE_COST, describeFoundingSpot } from "@/data/sectSites";
import { SECT_TERM_KINDS, SECT_TERM_LABELS, normalizeSectCulture, sectTermPool } from "@/data/sects";
import type { SectTerm, SectTermKind } from "@/data/sects";
import type { SectSiteTerm } from "@/data/types";
import { cn } from "@/lib/utils";
import { Flag, MapPin, X } from "lucide-react";

/** 玩家正在填的一格词条：手打的名字，或从池子里点的一条 */
interface TermDraft {
  name: string;
  term?: SectTerm;
}

/**
 * 开宗立派。
 *
 * 地点在主页面的九州舆图上选：散修点了「开宗立派」便回到舆图，
 * 图上空地点位亮出来，点一处便是山门所在；这扇窗只管名号与门风。
 * 再由程序按这份信息在图上立起门户、扣去一笔灵石。
 * 新立之门只有一座主殿，门下尚无一人——与营造一样，先挑参数，再落地。
 */
export function SectFoundModal({ onClose, onFounded }: { onClose: () => void; onFounded: () => void }) {
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const lowStones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const founding = useGameStore((s) => s.founding);
  const foundSect = useGameStore((s) => s.foundSect);
  const beginFoundingPick = useGameStore((s) => s.beginFoundingPick);
  const cancelFounding = useGameStore((s) => s.cancelFounding);
  const runTurn = useAIStore((s) => s.runTurn);
  const setStoryOpen = useAIStore((s) => s.setStoryOpen);

  const [name, setName] = useState("");
  const [terms, setTerms] = useState<Record<SectTermKind, TermDraft>>({
    nature: { name: "" },
    climate: { name: "" },
    feature: { name: "" },
    start: { name: "" },
  });
  const [appearance, setAppearance] = useState("");
  const [surroundings, setSurroundings] = useState("");
  const [reputationDesc, setReputationDesc] = useState("");
  const [error, setError] = useState("");

  const spot = founding?.spot;
  const spotInfo = spot ? describeFoundingSpot(spot) : null;

  // 未挑点位时，先照玩家人眼下这一带的说法给词条；挑定之后改照那一刻来
  const culture = spotInfo?.culture ?? normalizeSectCulture(getMarker(currentPlaceId)?.culture);

  const suggestions = useMemo(() => {
    const out = {} as Record<SectTermKind, SectTerm[]>;
    for (const kind of SECT_TERM_KINDS) out[kind] = sectTermPool(kind, culture);
    return out;
  }, [culture]);

  const termOf = (kind: SectTermKind): SectSiteTerm => {
    const d = terms[kind];
    const fallback = suggestions[kind][0];
    return {
      id: d.term?.id ?? "player",
      name: d.name.trim() || fallback?.name || "",
      note: d.term?.note ?? "",
    };
  };

  const enough = lowStones >= SECT_FOUND_STONE_COST;
  const canFound = !!name.trim() && !!spot && enough;

  const submit = () => {
    setError("");
    const nm = name.trim();
    if (!nm) {
      setError("先给这一派起个名号。");
      return;
    }
    if (!spot) {
      setError("先在舆图上挑一处空地。");
      return;
    }
    if (!enough) {
      setError(`开山立派须下品灵石 ${SECT_FOUND_STONE_COST}，眼下还差 ${SECT_FOUND_STONE_COST - lowStones}。`);
      return;
    }
    const r = foundSect({
      name: nm,
      spot: { x: spot.x, y: spot.y },
      nature: termOf("nature"),
      climate: termOf("climate"),
      feature: termOf("feature"),
      start: termOf("start"),
      appearance: appearance.trim() || undefined,
      reputationDesc: reputationDesc.trim() || undefined,
      surroundings: surroundings.trim() || undefined,
    });
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onFounded();
    // 立完便把这一段开山的事摊到问道窗里，由叙事接着写；
    // 没接接口的，窗里会照实说清，不悄悄吞掉这一段
    setStoryOpen(true);
    void runTurn(
      `我在${spotInfo?.seat ?? "山野"}立起门户「${nm}」，自此自成一派；门中只起了一座主殿，尚未收得弟子。`,
    );
  };

  return (
    <div className="mainui-black fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="book-card !p-0 paper-texture paper-aged shadow-book-float rounded-lg overflow-hidden w-full max-w-3xl h-full max-h-[88vh] flex flex-col modal-book-open motion-reduce:animate-none corner-ornament"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gold-500/25 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Flag size={18} className="text-gold-600 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-600 tracking-widest truncate">开宗立派</h2>
              <p className="font-serif text-xs text-ink-lightest mt-0.5 truncate">
                开山花费 {SECT_FOUND_STONE_COST} 下品灵石 · 现有 {lowStones}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-ink-lightest hover:text-ink-dark hover:bg-ink-lightest/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* 山门所在：地点在主页面舆图上选，这里只报一声定在何处 */}
          <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/60 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-brush text-xs text-ink-dark mb-1">山门所在</div>
                {spotInfo ? (
                  <p className="font-serif text-sm text-ink-dark leading-relaxed">
                    <MapPin size={13} className="mr-1 inline-block text-gold-600" />
                    {spotInfo.seat}
                    <span className="text-ink-lightest"> · 属{spotInfo.culture}一带</span>
                  </p>
                ) : (
                  <p className="font-serif text-sm text-cinnabar-600">还没在舆图上定下地方。</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  // 收起这一扇窗，回到主页面舆图上重新点一处空地
                  beginFoundingPick();
                }}
                className="shrink-0 rounded border-2 border-gold-500/50 px-2.5 py-1 font-serif text-xs text-ink-dark transition hover:border-gold-600"
              >
                {spotInfo ? "另选一处" : "去舆图选地"}
              </button>
            </div>
          </div>

          <div>
            <div className="font-brush text-xs text-ink-dark mb-1">宗门名号</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：听雨阁、万剑门……"
              className="w-full rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-sm text-ink-dark outline-none focus:border-gold-500"
            />
          </div>

          <div className="space-y-3">
            <div className="font-brush text-sm text-ink-dark">宗门门风</div>
            {SECT_TERM_KINDS.map((kind) => (
              <div key={kind}>
                <div className="font-serif text-xs text-ink-light mb-1">{SECT_TERM_LABELS[kind]}</div>
                <input
                  value={terms[kind].name}
                  onChange={(e) => setTerms((t) => ({ ...t, [kind]: { name: e.target.value } }))}
                  placeholder={suggestions[kind][0] ? `如：${suggestions[kind][0].name}` : ""}
                  className="w-full rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {suggestions[kind].slice(0, 8).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      title={t.note}
                      onClick={() => setTerms((s) => ({ ...s, [kind]: { name: t.name, term: t } }))}
                      className={cn(
                        "px-2 py-0.5 rounded border font-serif text-xs transition",
                        terms[kind].term?.id === t.id
                          ? "border-gold-500 bg-gold-400/15 text-ink-dark"
                          : "border-ink-lightest/40 bg-paper-old/50 text-ink-dark hover:border-gold-500",
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="font-brush text-sm text-ink-dark">山门气象（可选）</div>
            <textarea
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              rows={2}
              placeholder="写一写山门是什么样子，如：三面环水，一座石桥通到山门，殿前古松如盖。"
              className="w-full resize-none rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
            />
            <div>
              <div className="font-brush text-sm text-ink-dark mb-1">山门周边（可选）</div>
              <textarea
                value={surroundings}
                onChange={(e) => setSurroundings(e.target.value)}
                rows={2}
                placeholder="写一写山门之外的风物，如：后山有一片竹海，入夜常有鹤唳。"
                className="w-full resize-none rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
              />
            </div>
            <div>
              <div className="font-brush text-sm text-ink-dark mb-1">江湖风评（可选）</div>
              <textarea
                value={reputationDesc}
                onChange={(e) => setReputationDesc(e.target.value)}
                rows={2}
                placeholder="写一写外头怎么议论这一门，如：新立之门，尚无人知，只在左近村坊间有些名头。"
                className="w-full resize-none rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
              />
            </div>
          </div>

          {error && <p className="font-serif text-xs text-cinnabar-600 leading-relaxed">{error}</p>}
        </div>

        <div className="border-t border-gold-500/25 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 font-serif text-xs text-ink-lightest">
            开山立派须下品灵石{" "}
            <span className={cn("font-number", enough ? "text-gold-600" : "text-cinnabar-600")}>
              {SECT_FOUND_STONE_COST}
            </span>
            。立成之后门中只一座主殿，尚无弟子。
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                cancelFounding();
                onClose();
              }}
              className="rounded border border-ink-lightest/40 px-3 py-2 font-serif text-sm text-ink-light transition hover:border-ink-lightest"
            >
              罢了
            </button>
            <button
              type="button"
              disabled={!canFound}
              onClick={submit}
              className={cn(
                "rounded border px-4 py-2 font-serif text-sm transition",
                canFound
                  ? "border-jade-400/60 bg-jade-500/20 text-jade-700 hover:bg-jade-500/30"
                  : "border-ink-lightest/30 text-ink-lightest/60",
              )}
            >
              开山立派
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
