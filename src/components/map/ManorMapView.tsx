import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { getTileTexture } from "@/data/map";
import { TILE_GRID_SIZE, mapDistrictsToCells, tileFill } from "@/data/map/tiles";
import { MANOR_GRID } from "@/data/manors";
import { manorSpriteLayout } from "@/data/map/manorSprites";
import { ManorDock } from "@/components/map/ManorDock";
import { SealButton } from "@/components/ui/SealButton";
import type { MapScene } from "@/data/types";
import { DoorOpen, Home } from "lucide-react";

/** 宅邸图里 7×7 屋舍摆在 10×10 院子的这个位置 */
const MANOR_OFFSET = 1;

/**
 * 院面按等距斜视铺开：方格绕竖轴转 45°，镜头俯角 35.264°，
 * 屏幕上的竖直压缩为 sin 35.264° ≈ 0.577。宅邸建筑贴图正是这个视角，
 * 院面照同一套参数铺，立绘按标定表贴上去才与格子对得齐。
 */
const ISO_YAW = 45;
const ISO_SQUASH = Math.sin((35.264 * Math.PI) / 180);
/** 方格转 45° 后外接菱形的宽高倍数 */
const ISO_DIAGONAL = Math.SQRT2;
/** 台沿厚度，单位像素：整座院子抬起一线，下方两条斜边露出台壁 */
const PLATFORM_LIP = 10;
/**
 * 立绘比方台冒出的高度，按格宽计。标定表里最高的是高阁_漠北，约 0.87 格；
 * 最上一排的格心在院面顶角之下 0.29 格，故顶上要留 0.58 格给檐角。
 */
const ROOF_HEADROOM = 0.58;
/** 方台自身的台沿再留一线，免得最前一排贴到画布下缘 */
const BASE_HEADROOM = 0.05;
/** 立绘比方台略宽，院面横向也留一点 */
const SIDE_HEADROOM = 1.04;

/**
 * 宅邸地图：等距斜视的院子，四周围廊、院中排屋。
 * 已盖屋舍的格子上立该形制的等距立绘，点立绘进那一间的打理界面，点空地起屋。
 */
export function ManorMapView({ scene }: { scene: MapScene }) {
  const plot = useGameStore((s) => (s.manorPlots ?? []).find((p) => p.id === scene.manorPlotId));
  const exitScene = useGameStore((s) => s.exitScene);
  const [picked, setPicked] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const courtRef = useRef<HTMLDivElement>(null);
  const [court, setCourt] = useState({ w: 0, h: 0 });

  // 院子按容器尺寸取边长，窗口怎么缩都保持等比，菱形两向都不裁切
  useEffect(() => {
    const el = courtRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setCourt({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const tiles = Array.isArray(scene.tiles) ? scene.tiles : [];
  const districts = Array.isArray(scene.districts) ? scene.districts : [];
  const byCell = mapDistrictsToCells(tiles, districts);

  if (!plot) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink-darkest/90">
        <p className="font-serif text-sm text-paper-300/80">这一处宅地已经不在名下了。</p>
        <SealButton variant="ghost" onClick={exitScene} className="px-4 py-2 text-sm">
          <span className="flex items-center gap-2"><DoorOpen size={14} /> 离开</span>
        </SealButton>
      </div>
    );
  }

  // 菱形院面：宽为边长×√2，高再乘竖直压缩；上下另留一截给檐角与台沿
  const plane =
    court.w && court.h
      ? Math.min(
          court.w / (ISO_DIAGONAL * SIDE_HEADROOM),
          court.h /
            (ISO_DIAGONAL * ISO_SQUASH +
              ((ROOF_HEADROOM + BASE_HEADROOM) * ISO_DIAGONAL) / TILE_GRID_SIZE),
        )
      : 0;
  // 一格菱形在屏幕上的横向宽度，立绘按它等比放大
  const cellWidth = (plane * ISO_DIAGONAL) / TILE_GRID_SIZE;
  // 檐角那截余量都留在上方，院面整体往下挪一点
  const diamondHeight = plane * ISO_DIAGONAL * ISO_SQUASH;
  const drop = Math.max(0, ROOF_HEADROOM * cellWidth - (court.h - diamondHeight) / 2);

  const cellSide = plane / TILE_GRID_SIZE;
  // 已盖屋舍的那些格：位置由格号推出来，画在院面之上
  const built = plot.cells.flatMap((cell, index) =>
    cell
      ? [
          {
            cell,
            index,
            row: Math.floor(index / MANOR_GRID) + MANOR_OFFSET,
            col: (index % MANOR_GRID) + MANOR_OFFSET,
          },
        ]
      : [],
  );

  return (
    <div
      className="absolute inset-0 flex touch-none flex-col select-none bg-[#2a241c]"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 抬头 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gold-500/25 bg-ink-900/80 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Home size={18} className="text-gold-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-brush text-lg text-gold-400 tracking-widest truncate">{plot.place}·宅邸</h2>
            <p className="font-serif text-[11px] text-paper-400/70 truncate">
              点屋舍打理，点空地起屋{plot.rent ? " · 整座已租出" : ""}
            </p>
          </div>
        </div>
        <SealButton variant="ghost" onClick={exitScene} className="px-3 py-1.5 text-xs shrink-0">
          <span className="flex items-center gap-1.5"><DoorOpen size={13} /> 离开宅邸</span>
        </SealButton>
      </div>

      {/* 院子：等距斜视，整座院面抬起一线；右侧是打理栏，选中的一格在那里办 */}
      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1 min-w-0 overflow-hidden">
        <div ref={courtRef} className="absolute inset-3 sm:inset-5">
          {plane > 0 && (
            <div className="absolute inset-0" style={{ transform: `translateY(${drop}px)` }}>
              {/* 院面落影：菱形轮廓的软影，不参与旋转变换，故影子是直直落下去的 */}
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2"
                style={{
                  width: plane * ISO_DIAGONAL,
                  height: diamondHeight,
                  transform: `translate(-50%, -50%) translateY(${PLATFORM_LIP + 16}px)`,
                  background: "rgba(0, 0, 0, 0.55)",
                  clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
                  filter: "blur(10px)",
                }}
              />
              {/* 台壁：与院面同一菱形，往屏幕下方错开一线，只在下方两条斜边上露出来 */}
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2"
                style={{
                  width: plane,
                  height: plane,
                  transform: `translate(-50%, -50%) translateY(${PLATFORM_LIP}px) scaleY(${ISO_SQUASH}) rotate(${ISO_YAW}deg)`,
                  background: "linear-gradient(160deg, #6a5238 0%, #43331f 58%, #2b2115 100%)",
                }}
              />
              <div
                className="absolute left-1/2 top-1/2 grid"
                style={{
                  width: plane,
                  height: plane,
                  gridTemplateColumns: `repeat(${TILE_GRID_SIZE}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${TILE_GRID_SIZE}, minmax(0, 1fr))`,
                  transform: `translate(-50%, -50%) scaleY(${ISO_SQUASH}) rotate(${ISO_YAW}deg)`,
                }}
              >
                {Array.from({ length: TILE_GRID_SIZE * TILE_GRID_SIZE }).map((_, index) => {
                  const row = Math.floor(index / TILE_GRID_SIZE);
                  const col = index % TILE_GRID_SIZE;
                  const inManor =
                    row >= MANOR_OFFSET &&
                    row < MANOR_OFFSET + MANOR_GRID &&
                    col >= MANOR_OFFSET &&
                    col < MANOR_OFFSET + MANOR_GRID;
                  const cellIndex = inManor ? (row - MANOR_OFFSET) * MANOR_GRID + (col - MANOR_OFFSET) : -1;
                  const cell = cellIndex >= 0 ? plot.cells[cellIndex] : null;
                  const code = tiles[index] ?? 0;
                  const district = byCell.get(index);
                  // 屋舍格只铺院地：建筑贴图是正俯视的屋顶，铺进斜院会与地面打架，
                  // 屋舍另有一张等距立绘立在格上
                  const ground = cell ? 0 : code;
                  const texture = getTileTexture(ground, cell ? undefined : district?.nature, scene.culture, index);
                  const clickable = inManor;
                  const chosen = clickable && picked === cellIndex;

                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => clickable && setPicked(cellIndex)}
                      onPointerEnter={() => clickable && setHovered(cellIndex)}
                      onPointerLeave={() => setHovered((h) => (h === cellIndex ? null : h))}
                      disabled={!clickable}
                      title={
                        cell
                          ? `${cell.shape} Lv.${cell.level}${cell.fn ? ` · ${cell.fn}` : " · 未配功能"}${cell.facing === 1 ? " · 调转" : ""}${cell.rent ? " · 已出租" : ""}`
                          : inManor
                            ? "空地 · 点此起屋"
                            : ""
                      }
                      className={
                        "relative transition " +
                        (clickable ? "cursor-pointer hover:brightness-110" : "cursor-default")
                      }
                      style={{
                        backgroundColor: tileFill(ground),
                        backgroundImage: texture ? `url(${texture})` : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        // 院外一圈只是回廊，压暗下去，视线留在院内
                        filter: clickable ? undefined : "brightness(0.6)",
                        boxShadow: chosen ? "inset 0 0 0 3px rgba(232, 196, 120, 0.85)" : undefined,
                      }}
                    >
                      {inManor && !cell && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span
                            className="whitespace-nowrap font-serif text-[9px] leading-none text-paper-100/35"
                            style={{ transform: `rotate(-${ISO_YAW}deg) scaleY(${1 / ISO_SQUASH})` }}
                          >
                            空地
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 屋舍立绘：画在院面之上、不随院面旋转，故始终正立；
                  按行加列排层级，近处的压住远处的。点仍由底下那格接管 */}
              <div className="pointer-events-none absolute inset-0">
                {built.map(({ cell, index, row, col }) => {
                  const layout = manorSpriteLayout(cell.shape, scene.culture, cellWidth);
                  // 调转朝向：立绘沿格心左右镜像，方台仍落在原处
                  const mirrored = cell.facing === 1;
                  const spriteLeft = mirrored ? (layout.align.cx - 1) * layout.width : layout.left;
                  const dx = (col + 0.5) * cellSide - plane / 2;
                  const dy = (row + 0.5) * cellSide - plane / 2;
                  const x = (dx - dy) * Math.SQRT1_2;
                  const y = (dx + dy) * Math.SQRT1_2 * ISO_SQUASH;
                  const hot = hovered === index;

                  return (
                    <div
                      key={index}
                      className="absolute left-1/2 top-1/2"
                      style={{ transform: `translate(${x}px, ${y}px)`, zIndex: row + col }}
                    >
                      <img
                        src={layout.url}
                        alt={cell.shape}
                        draggable={false}
                        className="absolute max-w-none"
                        style={{
                          left: spriteLeft,
                          top: layout.top,
                          width: layout.width,
                          height: layout.height,
                          transform: mirrored ? "scaleX(-1)" : undefined,
                          filter: hot
                            ? "brightness(1.08) drop-shadow(0 0 6px rgba(240, 200, 120, 0.55))"
                            : "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))",
                        }}
                      />
                      {/* 匾额：只在指到这一格时露出来，免得满院挂满木牌 */}
                      {hot && (
                        <span
                          className="absolute whitespace-nowrap rounded-[2px] border border-gold-500/45 bg-[#241a11]/92 px-1.5 py-0.5 font-brush text-[11px] leading-none text-gold-300 shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
                          style={{ left: 0, top: cellWidth * 0.22, transform: "translateX(-50%)" }}
                        >
                          {cell.shape}
                          <span className="ml-1 font-serif text-[9px] text-paper-200/85">
                            {cell.fn ?? "未配"} Lv.{cell.level}
                          </span>
                          {cell.rent && <span className="ml-1 text-cinnabar-300">租</span>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
        <ManorDock plot={plot} index={picked} />
      </div>

      <div className="px-6 py-2 border-t border-gold-500/20 bg-ink-900/70">
        <p className="font-serif text-[11px] text-paper-400/55">
          屋舍共 {plot.cells.filter(Boolean).length} / {plot.cells.length} 格；点一格即可盖屋、分配功能或做点实事。
        </p>
      </div>
    </div>
  );
}
