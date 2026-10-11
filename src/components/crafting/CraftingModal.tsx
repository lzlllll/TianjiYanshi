import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { CloudDivider } from "@/components/ui/CloudDivider";
import { SealButton } from "@/components/ui/SealButton";
import { GradeTag } from "@/components/ui/GradeTag";
import { TalismanCrafting } from "@/components/crafting/TalismanCrafting";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { BrewResult, CraftingResult } from "@/data/types";

export function CraftingModal() {
  const isOpen = useAIStore((s) => s.isCraftingOpen);
  const closeCrafting = useAIStore((s) => s.closeCrafting);
  const tab = useGameStore((s) => s.craftingTab);
  const setTab = useGameStore((s) => s.setCraftingTab);

  // 按 Esc 也能合上百艺，与问道、侧栏等处一致，不必非去找右上角那个叉
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCrafting();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeCrafting]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread"
        onClick={closeCrafting}
      />

      <div
        className="relative scroll-card rounded-lg w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 red-seal rounded-sm text-lg font-brush flex items-center justify-center">
              艺
            </div>
            <div>
              <h2 className="font-brush text-xl text-gold-400 tracking-widest">百艺</h2>
              <p className="font-serif text-xs text-paper-400/60">符箓丹药，皆为修真之助</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("talisman")}
                className={cn(
                  "px-4 py-1.5 rounded font-brush text-sm tracking-wider transition-all border",
                  tab === "talisman"
                    ? "border-gold-400/50 bg-gold-400/10 text-gold-400"
                    : "border-paper-400/15 bg-ink-900/40 text-paper-400/70 hover:text-paper-200",
                )}
              >
                画符台
              </button>
              <button
                onClick={() => setTab("alchemy")}
                className={cn(
                  "px-4 py-1.5 rounded font-brush text-sm tracking-wider transition-all border",
                  tab === "alchemy"
                    ? "border-gold-400/50 bg-gold-400/10 text-gold-400"
                    : "border-paper-400/15 bg-ink-900/40 text-paper-400/70 hover:text-paper-200",
                )}
              >
                炼丹炉
              </button>
            </div>
            <button
              onClick={closeCrafting}
              className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "talisman" ? <TalismanCrafting /> : <AlchemyWorkshop />}
        </div>
      </div>
    </div>
  );
}

function AlchemyWorkshop() {
  const brew = useGameStore((s) => s.brewAlchemy);
  const inventory = useGameStore((s) => s.inventory);
  const mp = useGameStore((s) => s.player.mp);
  const pendingCrafting = useAIStore((s) => s.conversation.pendingCrafting);
  const resumeTurnAfterCrafting = useAIStore((s) => s.resumeTurnAfterCrafting);
  const [selectedHerbs, setSelectedHerbs] = useState<{ name: string; count: number }[]>([]);
  const [fire, setFire] = useState(50);
  const [duration, setDuration] = useState(30);
  const [isBrewing, setIsBrewing] = useState(false);
  const [brewResult, setBrewResult] = useState<BrewResult | null>(null);

  const ELEMENTS = ["金", "木", "水", "火", "土", "风", "雷", "冰", "暗"] as const;

  const herbs = inventory.filter((i) => i.type === "材料");

  const toggleHerb = (name: string) => {
    const existing = selectedHerbs.find((h) => h.name === name);
    if (existing) {
      if (existing.count > 1) {
        setSelectedHerbs(selectedHerbs.map((h) =>
          h.name === name ? { ...h, count: h.count - 1 } : h,
        ));
      } else {
        setSelectedHerbs(selectedHerbs.filter((h) => h.name !== name));
      }
    } else {
      const item = inventory.find((i) => i.name === name);
      if (item && item.count > 0) {
        setSelectedHerbs([...selectedHerbs, { name, count: 1 }]);
      }
    }
  };

  const addHerb = (name: string) => {
    const existing = selectedHerbs.find((h) => h.name === name);
    const item = inventory.find((i) => i.name === name);
    if (item && (!existing || existing.count < item.count)) {
      if (existing) {
        setSelectedHerbs(selectedHerbs.map((h) =>
          h.name === name ? { ...h, count: h.count + 1 } : h,
        ));
      } else {
        setSelectedHerbs([...selectedHerbs, { name, count: 1 }]);
      }
    }
  };

  const removeHerb = (name: string) => {
    const existing = selectedHerbs.find((h) => h.name === name);
    if (existing) {
      if (existing.count > 1) {
        setSelectedHerbs(selectedHerbs.map((h) =>
          h.name === name ? { ...h, count: h.count - 1 } : h,
        ));
      } else {
        setSelectedHerbs(selectedHerbs.filter((h) => h.name !== name));
      }
    }
  };

  const getSelectedElements = () => {
    const result: Record<string, number> = {};
    for (const herb of selectedHerbs) {
      const item = inventory.find((i) => i.name === herb.name);
      if (item?.elements) {
        for (const [elem, val] of Object.entries(item.elements)) {
          result[elem] = (result[elem] || 0) + val * herb.count;
        }
      }
    }
    return result;
  };

  const selectedElements = getSelectedElements();
  const mpCost = 30 + selectedHerbs.reduce((sum, h) => sum + h.count * 10, 0);

  const canBrew = () => {
    if (selectedHerbs.length === 0) return false;
    if (mp < mpCost) return false;
    for (const herb of selectedHerbs) {
      const have = inventory.find((i) => i.name === herb.name)?.count ?? 0;
      if (have < herb.count) return false;
    }
    return true;
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <ScrollCard className="col-span-5" title="药材" subtitle="选择放入丹炉的药材">
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
          {herbs.map((herb) => {
            const selected = selectedHerbs.find((h) => h.name === herb.name);
            const elemStr = herb.elements
              ? `(${Object.entries(herb.elements).map(([e, v]) => `${e}:${v}`).join(',')})`
              : '';
            return (
              <button
                key={herb.id}
                onClick={() => toggleHerb(herb.name)}
                className={cn(
                  "w-full text-left rounded p-3 border transition-all flex items-center gap-3",
                  selected
                    ? "border-gold-400/50 bg-gold-400/10 shadow-glow"
                    : "border-paper-400/10 bg-ink-900/30 hover:border-paper-400/30",
                )}
              >
                <div className="w-10 h-10 rounded bg-ink-900/60 flex items-center justify-center text-gold-400/80 border border-paper-400/10 font-brush">
                  {herb.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-brush text-base text-paper-100">{herb.name}</span>
                    <span className="font-number text-xs text-paper-400/50">×{herb.count}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <GradeTag grade={herb.grade} />
                    <span className="font-number text-xs text-paper-500">{elemStr}</span>
                  </div>
                </div>
                {selected && (
                  <span className="font-number text-xs text-gold-400">已选×{selected.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollCard>

      <div className="col-span-7">
        <ScrollCard title="炼丹炉" subtitle="文武相济，火候为先">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="w-36 h-32 bg-gradient-to-b from-pine-600 to-ink-dark rounded-b-3xl rounded-t-lg border-2 border-gold-500/30 shadow-2xl relative overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                  style={{
                    height: `${fire}%`,
                    background: `linear-gradient(0deg, ${fire < 35
                      ? "rgba(90,138,114,0.6)"
                      : fire > 70
                        ? "rgba(168,50,50,0.7)"
                        : "rgba(201,169,97,0.7)"
                      } 0%, transparent 100%)`,
                  }}
                />
                <div className="absolute inset-x-0 top-2 text-center">
                  <span className="font-brush text-2xl text-gold-400/80">丹</span>
                </div>
              </div>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-4 bg-pine-700 rounded-full border border-gold-500/30" />
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-2 h-6 bg-paper-200/20 rounded-full blur-sm animate-float" />
            </div>
          </div>

          <CloudDivider label="已选药材" />

          {selectedHerbs.length > 0 ? (
            <div className="space-y-2 mb-4">
              {selectedHerbs.map((herb) => {
                const item = inventory.find((i) => i.name === herb.name);
                const elemStr = item?.elements
                  ? `(${Object.entries(item.elements).map(([e, v]) => `${e}:${v}`).join(',')})`
                  : '';
                return (
                  <div
                    key={herb.name}
                    className="flex items-center gap-2 px-3 py-2 rounded border border-jade-500/30 bg-jade-500/5"
                  >
                    <div className="w-8 h-8 rounded bg-ink-900/60 flex items-center justify-center text-gold-400/80 border border-paper-400/10">
                      药
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-serif text-xs text-paper-200 truncate">{herb.name}</div>
                      <div className="flex items-center gap-1">
                        <span className="font-number text-xs text-jade-400">×{herb.count}</span>
                        <span className="font-number text-xs text-paper-500">{elemStr}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => removeHerb(herb.name)}
                        className="w-6 h-6 rounded bg-cinnabar-500/20 flex items-center justify-center text-cinnabar-400 hover:bg-cinnabar-500/30 text-xs"
                      >
                        -
                      </button>
                      <button
                        onClick={() => addHerb(herb.name)}
                        className="w-6 h-6 rounded bg-jade-500/20 flex items-center justify-center text-jade-400 hover:bg-jade-500/30 text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 mb-4">
              <span className="font-serif text-sm text-paper-400/50">请从左侧选择药材放入丹炉</span>
            </div>
          )}

          <CloudDivider label="火候" />

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-serif text-xs text-paper-400/70">文火</span>
              <span className="font-number text-sm text-jade-400">{fire}°</span>
              <span className="font-serif text-xs text-paper-400/70">武火</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={fire}
              onChange={(e) => setFire(Number(e.target.value))}
              className="fire-slider w-full"
            />
          </div>

          <CloudDivider label="时长" />

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-serif text-xs text-paper-400/70">短时</span>
              <span className="font-number text-sm text-jade-400">{duration}息</span>
              <span className="font-serif text-xs text-paper-400/70">长时</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="fire-slider w-full"
            />
          </div>

          <CloudDivider label="元素属性预览" />

          <div className="grid grid-cols-9 gap-1 mb-4">
            {ELEMENTS.map((elem) => {
              const herbVal = selectedElements[elem] ?? 0;
              const fireFactor = fire / 100;
              const durFactor = duration / 100;
              const rawVal = herbVal * fireFactor + herbVal * durFactor;
              const normalized = Math.round(Math.max(-100, Math.min(100, rawVal)));
              return (
                <div
                  key={elem}
                  className="flex flex-col items-center p-1 rounded border border-paper-400/10 bg-ink-900/30"
                >
                  <span className="font-brush text-xs text-paper-300">{elem}</span>
                  <span className={cn(
                    "font-number text-xs",
                    normalized > 0 ? "text-jade-400" :
                      normalized < 0 ? "text-cinnabar-400" : "text-paper-500",
                  )}>
                    {normalized > 0 ? "+" : ""}{normalized}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mb-3 px-3 py-2 rounded bg-ink-900/40 border border-paper-400/10">
            <span className="font-serif text-xs text-paper-400/70">消耗灵力</span>
            <span
              className={cn(
                "font-number text-sm",
                mp >= mpCost ? "text-jade-400" : "text-cinnabar-400",
              )}
            >
              {mpCost} / {mp}
            </span>
          </div>

          <SealButton
            onClick={async () => {
              setIsBrewing(true);
              setBrewResult(null);
              try {
                const result = await brew(selectedHerbs, fire, duration);
                setBrewResult(result);

                if (pendingCrafting && result.success) {
                  const elementsStr = result.pillElements
                    ? Object.entries(result.pillElements).map(([e, v]) => `${e}:${v}`).join(", ")
                    : "";
                  const craftingResult: CraftingResult = {
                    type: "alchemy",
                    success: result.success,
                    summary: result.message,
                    details: `丹药名：${result.pillName || "无名丹药"}\n品级：${result.pillGrade || "凡品"}\n效果：${result.pillDesc || ""}\n产出数量：${result.outputCount || 1}\n元素属性：${elementsStr}`,
                  };
                  await resumeTurnAfterCrafting(craftingResult);
                } else if (pendingCrafting && !result.success) {
                  const craftingResult: CraftingResult = {
                    type: "alchemy",
                    success: false,
                    summary: result.message,
                    details: "炼丹失败，丹药化为飞灰。",
                  };
                  await resumeTurnAfterCrafting(craftingResult);
                }
              } finally {
                setIsBrewing(false);
              }
            }}
            disabled={!canBrew() || isBrewing}
            className="w-full"
          >
            {isBrewing ? (pendingCrafting ? "炼丹并生成叙事中..." : "炼丹中...") : (pendingCrafting ? "开炉炼丹并续写叙事" : "开炉炼丹")}
          </SealButton>

          {brewResult && (
            <div className={cn(
              "mt-4 p-4 rounded border",
              brewResult.success
                ? "border-jade-500/40 bg-jade-500/5"
                : "border-cinnabar-500/40 bg-cinnabar-500/5",
            )}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn(
                  "font-brush text-lg",
                  brewResult.success ? "text-jade-400" : "text-cinnabar-400",
                )}>
                  {brewResult.success ? "丹成" : "失败"}
                </span>
                {brewResult.success && brewResult.pillGrade && (
                  <GradeTag grade={brewResult.pillGrade} />
                )}
              </div>
              <p className="font-serif text-sm text-paper-300 leading-relaxed">
                {brewResult.message}
              </p>
              {brewResult.success && brewResult.pillDesc && (
                <p className="font-serif text-xs text-paper-400/70 mt-2 leading-relaxed">
                  {brewResult.pillDesc}
                </p>
              )}
              {brewResult.success && brewResult.pillElements && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(brewResult.pillElements).map(([elem, val]) => (
                    <span key={elem} className={cn(
                      "font-number text-xs px-1.5 py-0.5 rounded border",
                      val > 0 ? "border-jade-500/30 text-jade-400/80" : val < 0 ? "border-cinnabar-500/30 text-cinnabar-400/80" : "border-paper-400/10 text-paper-400/50",
                    )}>
                      {elem}{val > 0 ? "+" : ""}{val}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollCard>
      </div>
    </div>
  );
}

