import { useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { useAIStore } from "@/store/useAIStore";
import { WORLD_SCENE_ID, getMarker } from "@/data/map";
import { freeAdventurePoints } from "@/data/adventures";
import { SECT_FOUND_STONE_COST, describeFoundingSpot } from "@/data/sectSites";
import { SECT_TERM_KINDS, SECT_TERM_LABELS, normalizeSectCulture, sectTermPool } from "@/data/sects";
import type { SectTerm, SectTermKind } from "@/data/sects";
import type { SectSiteTerm } from "@/data/types";
import { cn } from "@/lib/utils";
import { Flag, X } from "lucide-react";
import { AI_BACKEND_READY } from "@/data/backend";

/** 玩家正在填的一格词条：手打的名字，或从池子里点的一条 */
interface TermDraft {
  name: string;
  term?: SectTerm;
}

/**
 * 开宗立派。
 *
 * 散修自选一处舆图上的空地点位，自己填下名号与四类词条（性质、风气、特色、开局），
 * 再由程序按这份信息在图上立起门户、扣去一笔灵石。
 * 新立之门只有一座主殿，门下尚无一人——与营造一样，先挑参数，再落地。
 */
export function SectFoundModal({ onClose, onFounded }: { onClose: () => void; onFounded: () => void }) {
  const sectSites = useGameStore((s) => s.sectSites);
  const adventures = useGameStore((s) => s.adventures);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const lowStones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const foundSect = useGameStore((s) => s.foundSect);
  const runTurn = useAIStore((s) => s.runTurn);

  const hasModel = AI_BACKEND_READY;

  const [name, setName] = useState("");
  const [spotKey, setSpotKey] = useState("");
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

  // 舆图上还空着的点位：没立宗门、也没留着未了的奇遇
  const spots = useMemo(
    () => freeAdventurePoints({ sectSites, adventures }, WORLD_SCENE_ID),
    [sectSites, adventures],
  );
  const spot = spots.find((p) => `${p.x},${p.y}` === spotKey);
  const spotInfo = spot ? describeFoundingSpot(spot) : null;

  // 未挑点位时，先照玩家人眼下这一带的说法给词条；挑定之后改照那一刻来
  const culture = spotInfo?.culture ?? normalizeSectCulture(getMarker(currentPlaceId)?.culture);

  const grouped = useMemo(() => {
    const map = new Map<string, { x: number; y: number; seat: string }[]>();
    for (const p of spots) {
      const info = describeFoundingSpot(p);
      const list = map.get(info.culture) ?? [];
      list.push({ x: p.x, y: p.y, seat: info.seat });
      map.set(info.culture, list);
    }
    return [...map.entries()];
  }, [spots]);

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
    // 配上通灵接口便顺手写一段开山叙事；没配也不拦着立派
    if (hasModel) {
      void runTurn(
        `我在${spotInfo?.seat ?? "山野"}立起门户「${nm}」，自此自成一派；门中只起了一座主殿，尚未收得弟子。`,
      );
    }
  };

  return (
    <div className="mainui-black fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[86vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Flag size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">开宗立派</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5 truncate">
                开山花费 {SECT_FOUND_STONE_COST} 下品灵石 · 现有 {lowStones}
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
          <p className="font-serif text-xs text-ink-light leading-relaxed">
            散修无门无派，如今可自占一处山头，另立门户。名号与门风由你自己写定，选中一处空地，交一笔灵石，便算立起来了。
          </p>

          {/* 名号 */}
          <div>
            <div className="font-brush text-xs text-ink-dark mb-1">宗门名号</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：听雨阁、万剑门……"
              className="w-full rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-sm text-ink-dark outline-none focus:border-gold-500"
            />
          </div>

          {/* 点位 */}
          <div>
            <div className="font-brush text-xs text-ink-dark mb-1">择一处空地立山门</div>
            {spots.length === 0 ? (
              <p className="font-serif text-xs text-cinnabar-600">舆图上已无空位，无处开山。</p>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded border border-ink-lightest/40 bg-paper-old/50 p-2 space-y-2">
                {grouped.map(([cult, list]) => (
                  <div key={cult}>
                    <div className="font-brush text-[11px] text-gold-600 mb-1">{cult}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((p) => {
                        const key = `${p.x},${p.y}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSpotKey(key)}
                            className={cn(
                              "rounded border px-2 py-0.5 font-serif text-xs transition",
                              spotKey === key
                                ? "border-gold-500 bg-gold-400/20 text-ink-dark"
                                : "border-ink-lightest/40 bg-paper-old/60 text-ink-dark hover:border-gold-500",
                            )}
                          >
                            {p.seat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {spotInfo && (
              <p className="font-serif text-[11px] text-ink-lightest mt-1.5">
                驻地：{spotInfo.seat} · 属{spotInfo.culture}一带
              </p>
            )}
          </div>

          {/* 四类词条 */}
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

          {/* 三段可选文案 */}
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

        <div className="border-t border-gold-500/20 px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 font-serif text-xs text-paper-400/70">
            开山立派须下品灵石{" "}
            <span className={cn("font-number", enough ? "text-gold-300" : "text-cinnabar-300")}>
              {SECT_FOUND_STONE_COST}
            </span>
            。立成之后门中只一座主殿，尚无弟子。
          </div>
          <button
            type="button"
            disabled={!canFound}
            onClick={submit}
            className={cn(
              "shrink-0 rounded border px-4 py-2 font-serif text-sm transition",
              canFound
                ? "border-jade-400/50 bg-jade-500/20 text-jade-200 hover:bg-jade-500/30"
                : "border-paper-400/15 text-paper-400/40",
            )}
          >
            开山立派
          </button>
        </div>
      </div>
    </div>
  );
}
