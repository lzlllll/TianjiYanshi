import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, FileDown, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { discardLocalSectMaps, exportSectMapsToFile, getSectMapTemplates, hasLocalSectMaps, saveLocalSectMaps } from "@/data/map";
import {
  SECT_EMPTY_TILE,
  SECT_GRID_SIZE,
  SECT_HALL_TILE,
  SECT_TILE_KINDS,
  emptySectTiles,
  getSectTileKind,
  hasAnySectTile,
  sectTileCounts,
  sectTileFill,
} from "@/data/map/sectTiles";
import { emptySectTemplate, sectTemplateExportJson } from "@/data/map/sectMaps";
import { SECT_MAP_TYPES } from "@/data/sects";
import type { SectMapTemplate } from "@/data/types";

/** 一格多少像素；15 格刚好铺成一屏能看全的方块 */
const CELL_SIZE = 30;
/** 画布边长：格子加格间那一线之隔，空画布与实画布同尺寸，换起来不跳 */
const CANVAS_PX = SECT_GRID_SIZE * CELL_SIZE + (SECT_GRID_SIZE - 1);
/** 自动保存的防抖时长，连续涂刷时不必每格都写一次本地存储 */
const AUTOSAVE_DELAY = 500;

interface SectMapEditorProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 宗门地图模板编辑器（开发者工具）。
 *
 * 在 15×15 的格子上涂刷水域、山地、主殿与各类建筑，备下几张布局底子，
 * 日后立宗门时挑一张来用——宗门与图不一一对应，故这里只按模板自己的编号与名目相认。
 * 改动会自动存进浏览器本地，关掉页面也不会丢；「刷新以应用」让当前这一局立刻用上。
 * 导出 JSON 是为了把它落进仓库里的 game_data/sectMaps.json。
 */
export function SectMapEditor({ open, onClose }: SectMapEditorProps) {
  const [templates, setTemplates] = useState<SectMapTemplate[]>(() => getSectMapTemplates());
  const [currentId, setCurrentId] = useState(() => getSectMapTemplates()[0]?.id ?? "");
  const [brush, setBrush] = useState<number>(SECT_HALL_TILE);
  const [localOverride, setLocalOverride] = useState(() => hasLocalSectMaps());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // 写回 game_data/sectMaps.json 的结果，供界面提示
  const [syncState, setSyncState] = useState<"idle" | "saving" | "ok" | "fail">("idle");

  /** 把整份模板写回项目里的 sectMaps.json，好让改动随游戏发出去 */
  const syncToFile = useCallback(async (list: SectMapTemplate[]) => {
    setSyncState("saving");
    const ok = await exportSectMapsToFile(list);
    setSyncState(ok ? "ok" : "fail");
    return ok;
  }, []);

  // 每次打开都重读一遍：别处改过的模板应当立刻出现在这儿。
  // 本地缓存里画过的，顺手写回文件，免得只留在浏览器里、发不出去。
  useEffect(() => {
    if (!open) return;
    const list = getSectMapTemplates();
    setTemplates(list);
    const hadLocal = hasLocalSectMaps();
    setLocalOverride(hadLocal);
    setCurrentId((id) => (list.some((t) => t.id === id) ? id : (list[0]?.id ?? "")));
    if (hadLocal && list.length > 0) void syncToFile(list);
  }, [open, syncToFile]);

  // 按住左键连续涂刷，松手即停。笔锋记在 ref 里而不是 state：
  // 按下与松开挨得很近时，state 那一版还来不及挂上监听就被松开了，笔锋会一直举着。
  // 监听常驻在 window 上，拖到格子外面也收得回来。
  const paintingRef = useRef(false);
  useEffect(() => {
    const stop = () => {
      paintingRef.current = false;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // 自动保存：改动落定后写进浏览器本地，省得忘了按保存丢掉整张图
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (!open) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveLocalSectMaps(templates);
      setLocalOverride(true);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      // 存本地之外再写回项目文件，省得每次都要手动导出
      void syncToFile(templates);
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [open, templates, syncToFile]);

  const current = useMemo(
    () => templates.find((t) => t.id === currentId) ?? null,
    [templates, currentId],
  );

  /** 改当前这张模板；没有草稿时不动 */
  const patch = useCallback(
    (change: Partial<SectMapTemplate>) => {
      setTemplates((prev) => prev.map((t) => (t.id === currentId ? { ...t, ...change } : t)));
    },
    [currentId],
  );

  const paint = (index: number) => {
    if (!current) return;
    if (index < 0 || current.tiles[index] === brush) return;
    const tiles = [...current.tiles];
    tiles[index] = brush;
    patch({ tiles });
  };

  /**
   * 按落点算落在哪一格；落在格间那一线或画布之外时返回 -1。
   * 涂刷一律走容器上的 pointerdown/pointermove，不在每一格上挂 enter：
   * 落笔会改一侧的账目、撑动画布所在的浮层，浮层一挪，光标底下就换了另一格，
   * 浏览器随即补一个 mouseover——若照着 enter 走，头一笔会连带涂到旁边那格。
   */
  const cellAt = (e: React.PointerEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const step = CELL_SIZE + 1;
    const col = Math.floor((e.clientX - rect.left) / step);
    const row = Math.floor((e.clientY - rect.top) / step);
    if (row < 0 || row >= SECT_GRID_SIZE || col < 0 || col >= SECT_GRID_SIZE) return -1;
    return row * SECT_GRID_SIZE + col;
  };

  const startPainting = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    paintingRef.current = true;
    paint(cellAt(e));
  };

  const dragPaint = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!paintingRef.current) return;
    paint(cellAt(e));
  };

  const addTemplate = () => {
    const fresh = emptySectTemplate(templates);
    setTemplates((prev) => [...prev, fresh]);
    setCurrentId(fresh.id);
  };

  const removeTemplate = () => {
    if (!current) return;
    if (!confirm(`删掉模板「${current.name}」？此操作不可撤销，自动保存后生效。`)) return;
    const rest = templates.filter((t) => t.id !== current.id);
    setTemplates(rest);
    setCurrentId(rest[0]?.id ?? "");
  };

  const clearTiles = () => {
    if (!current) return;
    patch({ tiles: emptySectTiles() });
  };

  const clearAll = () => {
    if (!confirm("清空全部模板？此操作不可撤销，自动保存后生效。")) return;
    setTemplates([]);
    setCurrentId("");
  };

  const discardLocal = () => {
    discardLocalSectMaps();
    window.location.reload();
  };

  if (!open) return null;

  const tiles = current?.tiles ?? emptySectTiles();
  const counts = sectTileCounts(tiles);
  const paintedCount = tiles.filter((code) => code !== SECT_EMPTY_TILE).length;
  const exportJson = current ? sectTemplateExportJson(current) : "[]";

  const downloadJson = () => {
    if (!current) return;
    const blob = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${current.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="mainui-black fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="宗门地图模板编辑器"
    >
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg scroll-card">
        <div className="flex shrink-0 items-center justify-between border-b border-gold-500/20 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-brush text-lg text-paper-50">宗门地图模板编辑器</h2>
            <span className="font-serif text-xs text-paper-400/60">
              {SECT_GRID_SIZE}×{SECT_GRID_SIZE} 格 · 只作布局底子，不与哪座宗门对应 · 改动自动保存
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
            {current ? (
              <div className="rounded border border-gold-500/25" style={{ backgroundColor: "#2a241c" }}>
                <div
                  className="grid gap-px"
                  style={{
                    gridTemplateColumns: `repeat(${SECT_GRID_SIZE}, ${CELL_SIZE}px)`,
                    gridAutoRows: `${CELL_SIZE}px`,
                  }}
                  onPointerDown={startPainting}
                  onPointerMove={dragPaint}
                >
                  {tiles.map((code, index) => (
                    <span
                      key={index}
                      title={`第 ${Math.floor(index / SECT_GRID_SIZE) + 1} 行第 ${(index % SECT_GRID_SIZE) + 1} 列 · ${getSectTileKind(code).name}`}
                      className="transition-[filter] hover:brightness-125"
                      style={{ background: sectTileFill(code) }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              // 一张都没有时别摆一张空画布出来：笔落不下去，只会让人白点
              <div
                className="flex items-center justify-center rounded border border-dashed border-gold-500/25"
                style={{ width: CANVAS_PX, height: CANVAS_PX, backgroundColor: "#2a241c" }}
              >
                <p className="font-serif text-sm text-paper-400/50">还没有模板，先在右边新建一张。</p>
              </div>
            )}
            <div className="font-serif text-xs text-paper-400/60">
              {current ? `${current.id} · ${current.name}` : "未选择模板"} · 已涂 {paintedCount} 格
              {savedAt ? <span className="text-jade-400"> · 已自动保存 {savedAt}</span> : null}
              {syncState === "ok" ? (
                <span className="text-jade-400"> · 已写入 sectMaps.json</span>
              ) : syncState === "saving" ? (
                <span className="text-paper-400/50"> · 正在写入…</span>
              ) : syncState === "fail" ? (
                <span className="text-cinnabar-400"> · 未能写入文件（须经本地服务运行）</span>
              ) : null}
            </div>
          </div>

          {/* 控件 */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <div className="mb-2 font-serif text-xs text-paper-400/60">模板</div>
              <div className="flex items-center gap-2">
                <select
                  value={currentId}
                  onChange={(e) => setCurrentId(e.target.value)}
                  disabled={templates.length === 0}
                  className="min-w-0 flex-1 rounded border border-gold-500/25 bg-ink-800 px-3 py-2 font-serif text-sm text-paper-200 outline-none transition focus:border-gold-400/60 disabled:text-paper-400/40"
                >
                  {templates.length === 0 && <option value="">（还没有模板）</option>}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id}｜{t.name}
                      {hasAnySectTile(t.tiles) ? "（已画）" : "（空）"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addTemplate}
                  className="flex shrink-0 items-center gap-1.5 rounded border border-jade-400/60 bg-jade-500/90 px-3 py-2 font-serif text-xs text-paper-50 transition hover:bg-jade-500"
                >
                  <Plus size={13} /> 新建模板
                </button>
              </div>
              <input
                value={current?.name ?? ""}
                onChange={(e) => patch({ name: e.target.value })}
                disabled={!current}
                placeholder="模板名目"
                className="mt-2 w-full rounded border border-gold-500/25 bg-ink-800 px-3 py-2 font-serif text-sm text-paper-200 outline-none transition placeholder:text-paper-400/40 focus:border-gold-400/60 disabled:text-paper-400/40"
              />
              <div className="mt-2 flex items-center gap-2">
                <span className="shrink-0 font-serif text-xs text-paper-400/60">地图类型</span>
                <select
                  value={current?.mapType ?? ""}
                  onChange={(e) => patch({ mapType: e.target.value || undefined })}
                  disabled={!current}
                  className="min-w-0 flex-1 rounded border border-gold-500/25 bg-ink-800 px-3 py-2 font-serif text-sm text-paper-200 outline-none transition focus:border-gold-400/60 disabled:text-paper-400/40"
                >
                  <option value="">不限</option>
                  {SECT_MAP_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}｜{type.note}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1.5 font-serif text-[11px] leading-relaxed text-paper-400/50">
                立宗门时照地势挑模板：这一张标了山谷，就只给掷出山谷的宗门用；标「不限」的谁都能用。
              </p>
            </div>

            <div>
              <div className="mb-2 font-serif text-xs text-paper-400/60">地块</div>
              <div className="flex flex-wrap gap-2">
                {SECT_TILE_KINDS.map((k) => (
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
              {counts.length > 0 && (
                <div className="mt-2 font-serif text-xs text-paper-400/50">
                  {counts.map((c) => `${c.kind.name} ${c.count}`).join(" · ")}
                </div>
              )}
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
                disabled={!current}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-3 py-1.5 font-serif text-xs transition",
                  current
                    ? "border-gold-500/40 bg-gold-500/10 text-gold-300 hover:border-gold-400/70 hover:bg-gold-500/20"
                    : "cursor-not-allowed border-gold-500/15 text-paper-400/30",
                )}
              >
                <FileDown size={13} /> 导出 {current ? `${current.id}.json` : "JSON"}
              </button>
              <button
                type="button"
                onClick={clearTiles}
                disabled={!current}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-3 py-1.5 font-serif text-xs transition",
                  current
                    ? "border-gold-500/25 text-paper-300 hover:border-cinnabar-400/60 hover:text-cinnabar-400"
                    : "cursor-not-allowed border-gold-500/15 text-paper-400/30",
                )}
              >
                <Eraser size={13} /> 清空地块
              </button>
              <button
                type="button"
                onClick={removeTemplate}
                disabled={!current}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-3 py-1.5 font-serif text-xs transition",
                  current
                    ? "border-cinnabar-500/40 text-cinnabar-400 hover:border-cinnabar-400/70"
                    : "cursor-not-allowed border-gold-500/15 text-paper-400/30",
                )}
              >
                <Trash2 size={13} /> 删掉这张
              </button>
              {templates.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex items-center gap-1.5 rounded border border-gold-500/25 px-3 py-1.5 font-serif text-xs text-paper-300 transition hover:border-cinnabar-400/60 hover:text-cinnabar-400"
                >
                  <Trash2 size={13} /> 清空全部
                </button>
              )}
              {localOverride && (
                <button
                  type="button"
                  onClick={discardLocal}
                  className="flex items-center gap-1.5 rounded border border-cinnabar-500/40 px-3 py-1.5 font-serif text-xs text-cinnabar-400 transition hover:border-cinnabar-400/70"
                  title="删掉本地暂存，回到仓库里 game_data/sectMaps.json 的版本"
                >
                  <RotateCcw size={13} /> 丢弃本地暂存
                </button>
              )}
            </div>

            <div className="font-serif text-xs leading-relaxed text-paper-400/60">
              改动会自动存进浏览器本地，并写回
              <span className="font-number text-paper-300"> game_data/sectMaps.json </span>
              （须经本地服务运行才会落到文件）；「刷新以应用」让当前这一局立刻用上。宗门图不与哪座宗门一一对应，
              故只按模板自己的编号相认，备下几张，立宗门时照地势挑一张来用。
            </div>

            <div>
              <div className="mb-2 font-serif text-xs text-paper-400/60">
                JSON 预览（{current ? `${current.id}｜${current.name}` : "未选择模板"}）
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
