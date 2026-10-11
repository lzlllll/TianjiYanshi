import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, FileDown, RotateCcw, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clearLocalTileMaps,
  // getBackgroundImage,
  // getBackgroundTypes,
  getCityMarkers,
  hasLocalTileMaps,
  loadEditableTileMaps,
  saveLocalTileMaps,
} from "@/data/map";
import { TILE_GRID_SIZE, TILE_KINDS, emptyTiles, getTileKind, hasAnyTile, reconcileDistricts, tileFill } from "@/data/map/tiles";
import type { District } from "@/data/map/tiles";
import type { TileMapEntry } from "@/data/types";

/** 一格多少像素；10 格刚好铺成一屏能看全的方块 */
const CELL_SIZE = 44;
/** 自动保存的防抖时长，连续涂刷时不必每格都写一次本地存储 */
const AUTOSAVE_DELAY = 500;

/** 编辑中的一份草稿；与导出的结构一致，只是字段都可缺省 */
type Draft = { bg?: string; tiles: number[]; districts?: District[] };

interface TileMapEditorProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 城市瓦片地图编辑器（开发者工具）。
 *
 * 在 10×10 的格子上涂刷河流、山脉、建筑街区等地块。
 * 改动会自动存进浏览器本地，关掉页面也不会丢；「刷新以应用」让当前这局立刻用上。
 * 导出 JSON 是为了把它落进仓库里的 game_data/tileMaps/<编号>.json —— 地图与城市以编号对应，改名不影响。
 * 背景底图系统已停用，编辑器不再提供底图选择；城图里的 bg 字段仍然原样保留，恢复时不必重配。
 */
export function TileMapEditor({ open, onClose }: TileMapEditorProps) {
  const cities = useMemo(() => getCityMarkers(), []);
  const [cityId, setCityId] = useState(() => cities[0]?.id ?? "");
  const [brush, setBrush] = useState<number>(TILE_KINDS[1]?.code ?? 0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const initial: Record<string, Draft> = {};
    for (const entry of loadEditableTileMaps()) {
      initial[entry.id] = { bg: entry.bg, tiles: entry.tiles, districts: entry.districts };
    }
    return initial;
  });
  const [localOverride, setLocalOverride] = useState(() => hasLocalTileMaps());
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // 按住左键连续涂刷，松手即停；放在 window 上是为了拖到格子外面也能正确收笔
  const [painting, setPainting] = useState(false);
  useEffect(() => {
    if (!painting) return;
    const stop = () => setPainting(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [painting]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /** 导出内容：按编号顺序排列，收画过地块或设了背景图的城市 */
  const buildExport = useCallback(
    (): TileMapEntry[] =>
      cities
        .map((c) => {
          const tiles = drafts[c.id]?.tiles ?? emptyTiles();
          return {
            id: c.id,
            bg: drafts[c.id]?.bg,
            tiles,
            // 新涂出来的街区格没有现成明细，按周围地块补一条默认，导出即与地块对齐
            districts: reconcileDistricts(tiles, drafts[c.id]?.districts ?? []),
          };
        })
        .filter((entry) => hasAnyTile(entry.tiles) || !!entry.bg),
    [cities, drafts],
  );

  // 自动保存：改动落定后写进浏览器本地，省得忘了按保存丢掉整张图
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveLocalTileMaps(buildExport());
      setLocalOverride(true);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [buildExport]);

  if (!open) return null;

  const draft = drafts[cityId];
  const tiles = draft?.tiles ?? emptyTiles();
  // 背景底图系统已停用；bg 仍随草稿保存与导出，只是不参与显示
  // const bg = draft?.bg;
  // const bgUrl = getBackgroundImage(bg);
  const city = cities.find((c) => c.id === cityId);
  const exportMaps = buildExport();
  // 城图是一城一份文件，预览与导出都只针对当前选中的城市
  const currentEntry = exportMaps.find((entry) => entry.id === cityId);
  // 只配了背景、还没动笔的城市省掉 100 个空地编号，落盘文件才读得下去
  const exportJson = JSON.stringify(
    currentEntry && hasAnyTile(currentEntry.tiles)
      ? currentEntry
      : { id: cityId, bg: currentEntry?.bg, districts: currentEntry?.districts },
    null,
    2,
  );
  const paintedCount = tiles.filter((code) => code !== 0).length;

  /** 缺字段时补上整张空地，保证草稿结构完整 */
  const withTiles = (d?: Draft): Draft => ({
    bg: d?.bg,
    tiles: d?.tiles ?? emptyTiles(),
    districts: d?.districts,
  });

  const paint = (index: number) => {
    setDrafts((prev) => {
      const next = withTiles(prev[cityId]);
      if (next.tiles[index] === brush) return prev;
      const painted = [...next.tiles];
      painted[index] = brush;
      return { ...prev, [cityId]: { ...next, tiles: painted } };
    });
  };

  // 背景底图系统已停用；恢复时解注这里与上方的 bg/bgUrl
  // const setBackground = (value: string) => {
  //   setDrafts((prev) => ({ ...prev, [cityId]: { ...withTiles(prev[cityId]), bg: value || undefined } }));
  // };

  /** 清掉地块但留住背景底图与街区明细：这两样都是按城市配好的，不该跟着一起没 */
  const clearCity = () => {
    setDrafts((prev) => {
      const next = { ...prev };
      const keep = prev[cityId];
      if (keep?.bg || keep?.districts) {
        next[cityId] = { bg: keep.bg, tiles: emptyTiles(), districts: keep.districts };
      } else {
        delete next[cityId];
      }
      return next;
    });
  };

  const clearAll = () => {
    if (!confirm("清空全部城市的地图？此操作不可撤销，自动保存后生效。")) return;
    setDrafts({});
  };

  const clearLocal = () => {
    clearLocalTileMaps();
    window.location.reload();
  };

  const downloadJson = () => {
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cityId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mainui-black fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="城图编辑器">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg scroll-card">
        <div className="flex shrink-0 items-center justify-between border-b border-gold-500/20 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-brush text-lg text-paper-50">城图编辑器</h2>
            <span className="font-serif text-xs text-paper-400/60">
              {TILE_GRID_SIZE}×{TILE_GRID_SIZE} 瓦片 · 地图以城市编号对应 · 改动自动保存
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

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 lg:flex-row">
          {/* 画布 */}
          <div className="flex shrink-0 flex-col gap-3">
            <div
              className="rounded border border-gold-500/25"
              style={{
                backgroundColor: "#2a241c",
                // 背景底图系统已停用，画布只显示地块
                // backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
                // backgroundSize: "cover",
                // backgroundPosition: "center",
              }}
            >
              <div
                className="grid gap-px"
                style={{
                  gridTemplateColumns: `repeat(${TILE_GRID_SIZE}, ${CELL_SIZE}px)`,
                  gridAutoRows: `${CELL_SIZE}px`,
                }}
              >
                {tiles.map((code, index) => {
                  const kind = getTileKind(code);
                  return (
                    <button
                      key={index}
                      type="button"
                      title={`第 ${Math.floor(index / TILE_GRID_SIZE) + 1} 行第 ${(index % TILE_GRID_SIZE) + 1} 列 · ${kind.name}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setPainting(true);
                        paint(index);
                      }}
                      onPointerEnter={() => {
                        if (painting) paint(index);
                      }}
                      className="transition-[filter] hover:brightness-125"
                      style={{ background: tileFill(code) }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="font-serif text-xs text-paper-400/60">
              {city ? `编号 ${city.id} · ${city.name}` : "未选择城市"} · 已涂 {paintedCount} 格
              {savedAt ? <span className="text-jade-400"> · 已自动保存 {savedAt}</span> : null}
            </div>
          </div>

          {/* 控件 */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* 背景底图系统已停用，底图选择一并收起；恢复时解注这段与 setBackground */}
            <div className="grid grid-cols-1 gap-3">
              <div className="min-w-0">
                <div className="mb-2 font-serif text-xs text-paper-400/60">所属城市</div>
                <select
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  className="w-full rounded border border-gold-500/25 bg-ink-800 px-3 py-2 font-serif text-sm text-paper-200 outline-none transition focus:border-gold-400/60"
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      编号 {c.id}｜{c.name}
                      {hasAnyTile(drafts[c.id]?.tiles ?? []) ? "（已有地图）" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {/*
              <div className="min-w-0">
                <div className="mb-2 font-serif text-xs text-paper-400/60">背景底图类型</div>
                <select
                  value={bg ?? ""}
                  onChange={(e) => setBackground(e.target.value)}
                  className="w-full rounded border border-gold-500/25 bg-ink-800 px-3 py-2 font-serif text-sm text-paper-200 outline-none transition focus:border-gold-400/60"
                >
                  <option value="">无（纯色底）</option>
                  {getBackgroundTypes().map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </div>
              */}
            </div>

            <div>
              <div className="mb-2 font-serif text-xs text-paper-400/60">地块</div>
              <div className="flex flex-wrap gap-2">
                {TILE_KINDS.map((k) => (
                  <button
                    key={k.code}
                    type="button"
                    onClick={() => setBrush(k.code)}
                    className={cn(
                      "flex items-center gap-2 rounded border px-2.5 py-1.5 font-serif text-xs transition",
                      brush === k.code
                        ? "border-gold-400/70 bg-gold-500/15 text-gold-300"
                        : "border-gold-500/25 text-paper-300 hover:border-gold-400/50",
                    )}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-sm border border-ink-900/60"
                      style={{ background: k.color }}
                    />
                    {k.name}
                    <span className="font-number text-paper-400/50">{k.code}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 rounded border border-jade-400/60 bg-jade-500/90 px-3 py-1.5 font-serif text-xs text-paper-50 transition hover:bg-jade-500"
              >
                <Save size={13} /> 刷新以应用
              </button>
              <button
                type="button"
                onClick={downloadJson}
                className="flex items-center gap-1.5 rounded border border-gold-500/40 bg-gold-500/10 px-3 py-1.5 font-serif text-xs text-gold-300 transition hover:border-gold-400/70 hover:bg-gold-500/20"
              >
                <FileDown size={13} /> 导出 {cityId}.json
              </button>
              <button
                type="button"
                onClick={clearCity}
                className="flex items-center gap-1.5 rounded border border-gold-500/25 px-3 py-1.5 font-serif text-xs text-paper-300 transition hover:border-cinnabar-400/60 hover:text-cinnabar-400"
              >
                <Eraser size={13} /> 清空地块
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1.5 rounded border border-gold-500/25 px-3 py-1.5 font-serif text-xs text-paper-300 transition hover:border-cinnabar-400/60 hover:text-cinnabar-400"
              >
                <Trash2 size={13} /> 清空全部
              </button>
              {localOverride && (
                <button
                  type="button"
                  onClick={clearLocal}
                  className="flex items-center gap-1.5 rounded border border-cinnabar-500/40 px-3 py-1.5 font-serif text-xs text-cinnabar-400 transition hover:border-cinnabar-400/70"
                  title="删掉本地暂存，回到仓库里 game_data/tileMaps 的版本"
                >
                  <RotateCcw size={13} /> 丢弃本地暂存
                </button>
              )}
            </div>

            <div className="font-serif text-xs leading-relaxed text-paper-400/60">
              改动会自动存进浏览器本地，关掉页面也不会丢；「刷新以应用」让当前这局立刻用上。
              导出 JSON 覆盖
              <span className="font-number text-paper-300"> game_data/tileMaps/&lt;编号&gt;.json </span>
              才是长期生效，一城一份文件，新增城市除了丢文件还要把编号写进
              <span className="font-number text-paper-300"> index.json </span>
              清单；只要该城在清单里，九州舆图上就会多出一个「进入城图」入口。
              背景底图系统已停用，格子里只显示地块本身；建筑街区格对应的街区明细
              （编号／名称／性质／槽位数）在这里不改，新涂出来的格子会按周围地块自动补一条默认性质。
            </div>

            <div>
              <div className="mb-2 font-serif text-xs text-paper-400/60">
                JSON 预览（{city ? `编号 ${city.id}｜${city.name}` : "未选择城市"}）
              </div>
              <textarea
                readOnly
                value={exportJson}
                spellCheck={false}
                className="h-40 w-full resize-none rounded border border-gold-500/25 bg-ink-900/70 p-2 font-number text-xs leading-relaxed text-paper-300 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
