import { useEffect, useMemo, useState } from "react";
import { FileDown, RotateCcw, Trash2, X } from "lucide-react";
import {
  clearLocalPresetPoints,
  getPresetPoints,
  getScene,
  hasLocalPresetPoints,
  presetPointsExportJson,
  removePresetPoint,
} from "@/data/map";
import { presetKey } from "@/data/map/presets";
import { sectSiteCoverage } from "@/data/sectSites";
import { cn } from "@/lib/utils";
import type { PresetPoint } from "@/data/types";

interface PresetPointModalProps {
  open: boolean;
  onClose: () => void;
  /** 点位上动了手脚，让地图那边跟着重画 */
  onChanged: () => void;
}

/**
 * 预设点位（开发者工具）。
 *
 * 宗门与秘境还没开出来，先把地方圈在图上；这儿清点圈下的位置，
 * 也可以导出 presets.json 落盘，或是丢掉本地暂存回到文件里的那一版。
 * 只记位置，故不列名目，一行一处坐标；落点在图上双击完成，
 * 「双击空处记一处」比在这里填坐标顺手得多。
 */
export function PresetPointModal({ open, onClose, onChanged }: PresetPointModalProps) {
  const [points, setPoints] = useState<PresetPoint[]>(() => getPresetPoints());
  const [localOnly, setLocalOnly] = useState(() => hasLocalPresetPoints());

  // 每次打开都重读一遍：地图上刚添的点应当立刻出现在这儿的清单里
  useEffect(() => {
    if (!open) return;
    setPoints(getPresetPoints());
    setLocalOnly(hasLocalPresetPoints());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // 按图分堆放：同一张图上的点位在一块儿看，才知道地方够不够散
  const groups = useMemo(() => {
    const byScene = new Map<string, PresetPoint[]>();
    for (const p of points) {
      const list = byScene.get(p.sceneId);
      if (list) list.push(p);
      else byScene.set(p.sceneId, [p]);
    }
    return [...byScene.entries()].map(([sceneId, list]) => ({
      sceneId,
      sceneName: getScene(sceneId)?.name ?? sceneId,
      list,
    }));
  }, [points]);

  if (!open) return null;

  // 每一次打开都按当下的点位重算一遍：刚添的地方要立刻计进清点里
  const coverage = sectSiteCoverage();
  const exportJson = presetPointsExportJson();

  const downloadJson = () => {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "presets.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const drop = (key: string) => {
    if (!removePresetPoint(key)) return;
    setPoints(getPresetPoints());
    setLocalOnly(hasLocalPresetPoints());
    onChanged();
  };

  const dropAll = () => {
    if (!confirm("丢掉全部本地暂存的预设点位？随 presets.json 发下来的那一份不受影响。")) return;
    clearLocalPresetPoints();
    setPoints(getPresetPoints());
    setLocalOnly(false);
    onChanged();
  };

  return (
    <div
      className="mainui-black fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="预设点位"
      // 这一层浮在地图容器里，而容器一按下左键就把指针抓走（setPointerCapture）：
      // 不把这一下拦住，面板里的按钮就再也收不到 click，连关都关不掉。
      // 双击同理，不然在面板里双击选词会在背后的地图上落一个点。
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg scroll-card">
        <div className="flex shrink-0 items-center justify-between border-b border-gold-500/20 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-brush text-lg text-paper-50">预设点位</h2>
            <span className="font-serif text-xs text-paper-400/60">
              为还没开出来的宗门与秘境圈地方 · 共 {points.length} 处
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-paper-400/60 transition hover:text-paper-100"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 宗门占的就是这些点位：哪一圈不够三处，那一圈的宗门就会少，先在这儿提醒一声 */}
        <div className="shrink-0 border-b border-gold-500/20 px-5 py-3">
          <div className="mb-1.5 font-serif text-xs text-paper-400/60">
            按文化圈清点 · 宗门照这些位置开，每圈至少要有三处
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {coverage.map((row) => (
              <span
                key={row.culture}
                className={cn(
                  "font-serif text-xs",
                  row.short > 0 ? "text-cinnabar-400" : "text-paper-300/80",
                )}
              >
                {row.culture} {row.available} 处
                {row.short > 0 && `（还差 ${row.short} 处）`}
              </span>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          {points.length === 0 ? (
            <p className="py-6 text-center font-serif text-sm text-paper-400/50">
              眼下还没记下位置。开发者模式下在舆图上双击空处，便能记下一处。
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.sceneId}>
                <div className="mb-2 font-serif text-xs text-paper-400/60">
                  {group.sceneName}
                  <span className="ml-2 text-paper-400/40">{group.list.length} 处</span>
                </div>
                <ul className="space-y-1.5">
                  {group.list.map((p) => (
                    <li
                      key={presetKey(p)}
                      className="flex items-center gap-2 rounded border border-gold-500/25 bg-ink-800/50 px-3 py-2"
                    >
                      <span className="shrink-0 font-number text-sm text-paper-100">
                        {p.x}, {p.y}
                      </span>
                      <span className="shrink-0 font-serif text-[11px] text-paper-400/40">
                        {p.source === "local" ? "本地" : "随游戏"}
                      </span>
                      <button
                        type="button"
                        onClick={() => drop(presetKey(p))}
                        disabled={p.source !== "local"}
                        title={p.source === "local" ? "抹掉这一处" : "随 presets.json 发下来的，要改请改文件"}
                        className={cn(
                          "ml-auto shrink-0 rounded p-1 transition",
                          p.source === "local"
                            ? "text-paper-400/60 hover:text-cinnabar-400"
                            : "cursor-not-allowed text-paper-400/20",
                        )}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadJson}
              disabled={points.length === 0}
              className={cn(
                "flex items-center gap-1.5 rounded border px-3 py-1.5 font-serif text-xs transition",
                points.length === 0
                  ? "cursor-not-allowed border-gold-500/15 text-paper-400/30"
                  : "border-gold-500/40 bg-gold-500/10 text-gold-300 hover:border-gold-400/70 hover:bg-gold-500/20",
              )}
            >
              <FileDown size={13} /> 导出 presets.json
            </button>
            {localOnly && (
              <button
                type="button"
                onClick={dropAll}
                className="flex items-center gap-1.5 rounded border border-cinnabar-500/40 px-3 py-1.5 font-serif text-xs text-cinnabar-400 transition hover:border-cinnabar-400/70"
              >
                <RotateCcw size={13} /> 丢弃本地暂存
              </button>
            )}
          </div>

          <div className="font-serif text-xs leading-relaxed text-paper-400/60">
            开发者模式下在舆图上<b className="text-paper-300">双击空处</b>便能记下一处位置，落点会立刻画在图上；
            城图按格子排布，不设预设点位。只记位置，名目与种类都不写，留到宗门或秘境真要开出来时再定。
            改动先存浏览器本地，导出覆盖
            <span className="font-number text-paper-300"> game_data/presets.json </span>
            才算长期生效。
          </div>

          <div>
            <div className="mb-2 font-serif text-xs text-paper-400/60">JSON 预览</div>
            <textarea
              readOnly
              value={exportJson}
              spellCheck={false}
              className="h-36 w-full resize-none rounded border border-gold-500/25 bg-ink-900/70 p-2 font-number text-xs leading-relaxed text-paper-300 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
