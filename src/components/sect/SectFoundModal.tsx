import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { useAIStore } from "@/store/useAIStore";
import { WORLD_SCENE_ID, getCityMarkers, getMarker, getSceneImage, getWorldScene } from "@/data/map";
import { freeAdventurePoints } from "@/data/adventures";
import { SECT_FOUND_STONE_COST, describeFoundingSpot } from "@/data/sectSites";
import { SECT_TERM_KINDS, SECT_TERM_LABELS, normalizeSectCulture, sectTermPool } from "@/data/sects";
import type { SectTerm, SectTermKind } from "@/data/sects";
import type { SectSiteTerm } from "@/data/types";
import { cn } from "@/lib/utils";
import { Flag, Minus, Plus, X } from "lucide-react";
import { AI_BACKEND_READY } from "@/data/backend";

/** 玩家正在填的一格词条：手打的名字，或从池子里点的一条 */
interface TermDraft {
  name: string;
  term?: SectTerm;
}

/** 舆图最多放大到 300%，够把挨得近的几处空地分开来点 */
const MAX_SCALE = 3;
/** 滚轮灵敏度，与主舆图同一口径 */
const WHEEL_SENSITIVITY = 0.0015;
/** 按下到抬起的位移不超过这个像素数才算单击 */
const CLICK_TOLERANCE = 6;
/** 点在图上的容错半径：落在空地印记近旁也算点中 */
const PICK_RADIUS = 26;

/**
 * 舆图选地。
 *
 * 开宗立派要在图上点一处空地，故把九州舆图整幅搬进窗里：
 * 滚轮放大、拖拽平移，空地点位照预设点位画成虚线方框，点一下便是山门所在。
 * 已有的宗门只作暗印示位，不可点，免得错把别家山头认作自家。
 */
function FoundingMap({
  spots,
  spotKey,
  onPick,
}: {
  spots: { x: number; y: number }[];
  spotKey: string;
  onPick: (key: string) => void;
}) {
  const sectSites = useGameStore((s) => s.sectSites);
  const scene = useMemo(() => getWorldScene(), []);
  const image = useMemo(() => getSceneImage(scene), [scene]);
  const cities = useMemo(() => getCityMarkers(), []);
  const base = { w: scene.width, h: scene.height };

  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBox({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 基准尺寸：等比缩放到完整放进窗内，不裁切、不拉伸
  const fit = (() => {
    if (!box.w || !box.h) return { w: 0, h: 0 };
    const ratio = Math.min(box.w / base.w, box.h / base.h);
    return { w: base.w * ratio, h: base.h * ratio };
  })();

  const clampView = useCallback(
    (next: { scale: number; x: number; y: number }) => {
      const maxX = Math.max(0, (fit.w * next.scale - box.w) / 2);
      const maxY = Math.max(0, (fit.h * next.scale - box.h) / 2);
      return {
        scale: next.scale,
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [fit.w, fit.h, box.w, box.h],
  );

  useEffect(() => {
    setView((v) => clampView(v));
  }, [clampView]);

  // 滚轮缩放：必须用非被动监听才能拦住浏览器默认的滚动行为
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;
      setView((v) => {
        const nextScale = Math.min(MAX_SCALE, Math.max(1, v.scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY)));
        if (nextScale === v.scale) return v;
        const ratio = nextScale / v.scale;
        return clampView({
          scale: nextScale,
          x: cursorX * (1 - ratio) + v.x * ratio,
          y: cursorY * (1 - ratio) + v.y * ratio,
        });
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [clampView]);

  /** 场景坐标 → 容器内的屏幕坐标 */
  const project = (nx: number, ny: number): { x: number; y: number } | null => {
    if (!fit.w || !fit.h || !box.w || !box.h) return null;
    const layoutX = nx * (fit.w / base.w);
    const layoutY = ny * (fit.h / base.h);
    return {
      x: Math.round(box.w / 2 + (layoutX - fit.w / 2) * view.scale + view.x),
      y: Math.round(box.h / 2 + (layoutY - fit.h / 2) * view.scale + view.y),
    };
  };

  /** 把屏幕上的点反解成场景坐标；落在图外则不算命中 */
  const toScenePoint = (clientX: number, clientY: number): { nx: number; ny: number } | null => {
    const el = boxRef.current;
    if (!el || !fit.w || !fit.h) return null;
    const rect = el.getBoundingClientRect();
    const cursorX = clientX - rect.left - rect.width / 2;
    const cursorY = clientY - rect.top - rect.height / 2;
    const offsetX = (cursorX - view.x) / view.scale + fit.w / 2;
    const offsetY = (cursorY - view.y) / view.scale + fit.h / 2;
    const nx = offsetX * (base.w / fit.w);
    const ny = offsetY * (base.h / fit.h);
    if (nx < 0 || ny < 0 || nx > base.w || ny > base.h) return null;
    return { nx, ny };
  };

  /** 点在图上的近旁也算点中：取离落点最近的那处空地 */
  const pickNearest = (clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let bestKey = "";
    let bestGap = PICK_RADIUS;
    for (const spot of spots) {
      const point = project(spot.x, spot.y);
      if (!point) continue;
      const gap = Math.hypot(point.x - px, point.y - py);
      if (gap < bestGap) {
        bestGap = gap;
        bestKey = `${spot.x},${spot.y}`;
      }
    }
    if (bestKey) onPick(bestKey);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: view.x,
      originY: view.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setView((v) =>
      clampView({
        ...v,
        x: drag.originX + (e.clientX - drag.startX),
        y: drag.originY + (e.clientY - drag.startY),
      }),
    );
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > CLICK_TOLERANCE) return;
    // 点在空白处，只要离某一处空地够近便算选它
    if (!toScenePoint(e.clientX, e.clientY)) return;
    pickNearest(e.clientX, e.clientY);
  };

  const zoomBy = (factor: number) =>
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(1, v.scale * factor));
      const ratio = scale / v.scale;
      return clampView({ scale, x: v.x * ratio, y: v.y * ratio });
    });

  const cursorClass = dragging
    ? "cursor-grabbing"
    : view.scale > 1
      ? "cursor-grab"
      : "cursor-crosshair";

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative h-full w-full overflow-hidden rounded border border-ink-lightest/40 bg-ink-900/70 touch-none select-none",
        cursorClass,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* 舆图本体跟着缩放平移 */}
      <div
        className="absolute inset-0 m-auto will-change-transform"
        style={{
          width: fit.w || undefined,
          height: fit.h || undefined,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        {image ? (
          <img src={image} alt={scene.name} draggable={false} className="block h-full w-full max-w-none" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-serif text-sm text-paper-400/60">
            此舆图尚未绘制，暂无可选之处
          </div>
        )}
      </div>

      {/* 图上的记号不随缩放变形，字号与点击热区始终一致 */}
      <div className="map-labels pointer-events-none absolute inset-0">
        {cities.map((city) => {
          const point = project(city.x, city.y);
          if (!point) return null;
          return (
            <span key={city.id} className="absolute" style={{ left: point.x, top: point.y }}>
              <span className="absolute block h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-gold-400 bg-cinnabar-500/80" />
              <span className="absolute left-2 top-0 whitespace-nowrap font-brush text-[10px] leading-none text-paper-100">
                {city.name}
              </span>
            </span>
          );
        })}

        {/* 已有宗门只作暗印，点不得 */}
        {sectSites
          .filter((site) => site.sceneId === scene.id)
          .map((site) => {
            const point = project(site.x, site.y);
            if (!point) return null;
            return (
              <span
                key={site.id}
                className="absolute flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-ink-lightest/50 bg-ink-900/70 font-brush text-[10px] leading-none text-paper-400/70"
                style={{ left: point.x - 9, top: point.y - 9 }}
                title={`${site.name}${site.mine ? "（本门）" : ""}`}
              >
                宗
              </span>
            );
          })}

        {spots.length === 0 && (
          <div className="absolute inset-x-0 top-1/2 mx-auto w-64 -translate-y-1/2 rounded border border-cinnabar-500/50 bg-ink-900/85 px-3 py-2 text-center font-serif text-xs leading-relaxed text-cinnabar-200">
            舆图上已无空位，无处开山。
          </div>
        )}

        {/* 空地：虚线方框，点一下便是山门所在 */}
        {spots.map((spot) => {
          const point = project(spot.x, spot.y);
          if (!point) return null;
          const key = `${spot.x},${spot.y}`;
          const chosen = key === spotKey;
          const info = describeFoundingSpot(spot);
          return (
            <button
              key={key}
              type="button"
              title={`${info.seat} · 属${info.culture}一带`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onPick(key)}
              className="pointer-events-auto absolute flex h-[26px] w-[26px] items-center justify-center"
              style={{ left: point.x - 13, top: point.y - 13 }}
            >
              <span
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center rounded-sm border font-brush text-[10px] leading-none",
                  chosen
                    ? "border-gold-300 bg-gold-500 text-ink-darkest ring-2 ring-gold-300"
                    : "border-dashed border-cinnabar-400 bg-ink-900/75 text-cinnabar-200",
                )}
              >
                山
              </span>
              {chosen && (
                <span className="absolute top-full mt-1 whitespace-nowrap rounded border border-gold-500/60 bg-ink-900/90 px-1 py-0.5 font-serif text-[10px] leading-none text-gold-200">
                  {info.seat}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 缩放：滚轮之外再留一对按钮，触控板上也好使 */}
      <div
        className="absolute right-2 top-2 flex items-center gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.35)}
          disabled={view.scale <= 1}
          className="flex h-7 w-7 items-center justify-center rounded border border-gold-500/40 bg-ink-900/85 text-paper-200 transition hover:border-gold-400 disabled:opacity-40"
          aria-label="缩小"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1.35)}
          disabled={view.scale >= MAX_SCALE}
          className="flex h-7 w-7 items-center justify-center rounded border border-gold-500/40 bg-ink-900/85 text-paper-200 transition hover:border-gold-400 disabled:opacity-40"
          aria-label="放大"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
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
        className="book-card !p-0 paper-texture paper-aged shadow-book-float rounded-lg overflow-hidden w-full max-w-6xl h-full max-h-[92vh] flex flex-col modal-book-open motion-reduce:animate-none corner-ornament"
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

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* 左半：舆图选地 */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-5 pt-3 pb-2 shrink-0">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-brush text-sm text-ink-dark">在舆图上择一处空地</div>
                <div className="font-serif text-[11px] text-ink-lightest">
                  {spotInfo ? `已选：${spotInfo.seat} · 属${spotInfo.culture}` : "点图上虚线方框，便是山门所在"}
                </div>
              </div>
              <p className="font-serif text-[11px] text-ink-lightest/90 leading-relaxed mt-0.5">
                滚轮放大、按住拖动可平移；空心「宗」印是别家山门，不能选。
              </p>
            </div>
            <div className="flex-1 min-h-[240px] px-5 pb-4">
              <FoundingMap spots={spots} spotKey={spotKey} onPick={setSpotKey} />
            </div>
          </div>

          {/* 右半：名号与门风 */}
          <div className="w-full lg:w-[380px] shrink-0 min-h-0 max-h-[48%] lg:max-h-none overflow-y-auto border-t lg:border-t-0 lg:border-l border-gold-500/25 px-5 py-4 space-y-4">
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
        </div>

        <div className="border-t border-gold-500/25 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 font-serif text-xs text-ink-lightest">
            开山立派须下品灵石{" "}
            <span className={cn("font-number", enough ? "text-gold-600" : "text-cinnabar-600")}>
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
                ? "border-jade-400/60 bg-jade-500/20 text-jade-700 hover:bg-jade-500/30"
                : "border-ink-lightest/30 text-ink-lightest/60",
            )}
          >
            开山立派
          </button>
        </div>
      </div>
    </div>
  );
}
