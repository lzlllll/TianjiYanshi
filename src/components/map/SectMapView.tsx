import { useEffect, useMemo, useRef, useState } from "react";
import type { MapScene } from "@/data/types";
import {
  SECT_EMPTY_TILE,
  SECT_GRID_SIZE,
  getSectTileKind,
  sectTileCode,
  sectTileFill,
} from "@/data/map/sectTiles";
import { sectMapLayout, sectTerrainFor, sectBuildingSpec } from "@/data/map/sectBuildings";
import { SECT_SCENE_PREFIX } from "@/data/map";
import { useGameStore } from "@/store/useGameStore";
import { daySerial, shichenName } from "@/lib/gameTime";
import { isElderOrAbove, lectureGain, leaderRealmIndex, lectureHour as lectureHourOf } from "@/data/sectLife";
import { facilityStateOf, facilitySteward, facilityYield } from "@/data/sectFacilities";
import { SectFacilityPanel } from "@/components/sect/SectFacilityPanel";
import { SectBuildModal } from "@/components/sect/SectBuildModal";
import type { FacilityKindId } from "@/data/types";
import { cn } from "@/lib/utils";

/** 缩放的上下限：小不过原图，大不过五倍 */
const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** 画布四周留白 */
const PADDING = 80;
/** 拖动超过这些像素才算拖图，之内都当点了一下 */
const DRAG_TOLERANCE = 4;

/**
 * 一处宗门山门图的渲染。
 *
 * 与城图是两套：宗门图 15×15。地块分两种——建筑格（主殿／生产／技术／居住）
 * 与地形格（荒地／水域／山地）。建筑格按整图排定的结果立建筑：
 * 本文化圈的特色建筑每种只立一座，其余在同一类里取图；地形格铺对应的地形贴图。
 *
 * 缩放不靠 CSS 的 scale 变换——那会先把贴图按原尺寸栅格化再放大，看着发糊；
 * 这里按放大后的像素尺寸重新排布每一格，贴图以目标尺寸原生绘制，放大后依旧清晰；
 * 平移只用 translate（不涉及位图缩放），也不会糊。滚轮以光标为锚点缩放。
 */
export function SectMapView({ scene }: { scene: MapScene }) {
  const tiles = scene.tiles ?? [];
  // 一张山门的最终排布：依宗门特色微调配比、照名册立建筑，再抹去已毁的那几座（见 sectMapLayout）
  const { layout, buildings } = useMemo(() => sectMapLayout(scene), [scene]);

  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  // 点一格建筑浮出建筑卡；「入内」再开三页面板；点空荒地开营造窗口
  const [picked, setPicked] = useState<number | null>(null);
  const [inside, setInside] = useState<{ name: string; kindId: FacilityKindId; kindName: string } | null>(null);
  const [buildAt, setBuildAt] = useState<number | null>(null);
  const dragRef = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  // 量出画布区域，方形底子取其中较小的一边
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 换一处山门就把缩放平移复位
  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 });
  }, [scene.id]);

  // 滚轮缩放：必须 preventDefault，故用原生监听并关掉 passive
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        if (scale === v.scale) return v;
        if (scale === MIN_SCALE) return { scale, x: 0, y: 0 };
        // 以光标为锚：光标下的位置在缩放前后不动
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const k = scale / v.scale;
        return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const pannable = view.scale > 1;

  /** 按落点的坐标定出十五格里的哪一格；落在图外便是 null */
  const cellAtPoint = (clientX: number, clientY: number): number | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const r = grid.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const col = Math.floor(((clientX - r.left) / r.width) * SECT_GRID_SIZE);
    const row = Math.floor(((clientY - r.top) / r.height) * SECT_GRID_SIZE);
    if (col < 0 || row < 0 || col >= SECT_GRID_SIZE || row >= SECT_GRID_SIZE) return null;
    return row * SECT_GRID_SIZE + col;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 别让事件冒泡到外层地图，免得连带着拖动了舆图
    e.stopPropagation();
    dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    if (!pannable) return;
    // 动得够远才算拖图；指针捕获到这时才夺下来，
    // 免得一按就夺走了点击，格子上的建筑便点不开
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= DRAG_TOLERANCE) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  };
  /** 抬手：没拖动过便算点了一下格子，浮出那一处的建筑卡 */
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.moved) return;
    // 面板或建筑卡开着时，这一下不作数，免得把底下的格子又翻一遍
    if (inside || buildAt !== null) return;
    e.stopPropagation();
    const index = cellAtPoint(e.clientX, e.clientY);
    if (index === null) {
      setPicked(null);
      return;
    }
    if (displayBuildings[index]) {
      setPicked(index);
      return;
    }
    // 空地点了一下：够身份的便开营造窗口，不够便只当没点
    setPicked(null);
    if (canBuildHere && layout[index] === SECT_EMPTY_TILE) setBuildAt(index);
  };

  // 主殿每日固定时辰开讲：人在山门内，临近开讲便提个醒，时辰一到可径直前往
  const sect = useGameStore((s) => s.sect);
  const player = useGameStore((s) => s.player);
  const relations = useGameStore((s) => s.relations);
  const currentTime = useGameStore((s) => s.currentTime);
  const quests = useGameStore((s) => s.quests);

  // 手上还有差事要办在这一处山门的某座建筑里：那几座挂个记号，好照着找
  const siteId = scene.id.startsWith(SECT_SCENE_PREFIX) ? scene.id.slice(SECT_SCENE_PREFIX.length) : "";
  const taskSpots = useMemo(() => {
    const set = new Set<string>();
    for (const q of quests) {
      if (q.status === "open" && q.target?.sectId === siteId && q.target.building) set.add(q.target.building);
    }
    return set;
  }, [quests, siteId]);

  // 本门自己营造的那几座：山门图本身是死的，自建的另记一笔，渲染时并到图上
  const sectSites = useGameStore((s) => s.sectSites);
  const site = sectSites.find((s) => s.id === siteId);
  const builtAt = site?.built ?? {};
  // 自拟建筑另存的一份账：辨认时按它归的类别借同类的贴图
  const customBook = site?.custom;
  const canBuildHere = !!site?.mine && isElderOrAbove(sect?.positions);

  const displayBuildings = useMemo(() => {
    const list = buildings.slice();
    for (const [key, name] of Object.entries(builtAt)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) continue;
      const spec = sectBuildingSpec(name, customBook?.[name]?.kindId);
      if (spec) list[idx] = { name: spec.name, culture: spec.culture, url: spec.url };
    }
    return list;
  }, [buildings, builtAt, customBook]);

  /** 一格归哪类：自建的按它本来的用场算，其余照图上排的算 */
  const tileKindFor = (index: number) => {
    const name = builtAt[String(index)];
    if (name) {
      const spec = sectBuildingSpec(name, customBook?.[name]?.kindId);
      if (spec) return getSectTileKind(sectTileCode(spec.kind));
    }
    return getSectTileKind(layout[index]);
  };

  const lectureAt = lectureHourOf(sect);
  const attendedToday = (sect?.lastLectureDay ?? 0) === daySerial(currentTime);
  const isLeader = /掌门/.test(player?.position || "");
  const lectureStarted = currentTime.hour >= lectureAt;
  // 提前两个时辰之内才提醒，早得太多反倒聒噪
  const lectureNear = !lectureStarted && lectureAt - currentTime.hour <= 2;
  const lectureGainNow = lectureGain(
    leaderRealmIndex({
      sect,
      playerName: player?.name,
      playerPosition: player?.position,
      playerRealmIndex: player?.realmIndex,
      relations,
    }),
    sect?.level || 1,
  );
  const showLectureNotice = !attendedToday && (lectureStarted || lectureNear);

  // 换一处山门，先前点开的格子与面板一并收起
  useEffect(() => {
    setPicked(null);
    setInside(null);
    setBuildAt(null);
  }, [scene.id]);

  const pickedBuilding = picked !== null ? displayBuildings[picked] : null;
  const pickedKind = picked !== null ? tileKindFor(picked) : null;
  const pickedState = pickedBuilding ? facilityStateOf(sect?.facilities, pickedBuilding.name) : null;
  const pickedYield = pickedBuilding && pickedKind
    ? facilityYield({
        name: pickedBuilding.name,
        kindId: pickedKind.id as FacilityKindId,
        level: pickedState?.level ?? 1,
        status: pickedState?.status ?? "正常",
        hasSteward: !!facilitySteward(sect?.management?.halls, pickedKind.id as FacilityKindId),
        nature: scene.sectNature,
        isFeature: scene.sectFeature === pickedBuilding.name,
      })
    : null;
  const pickedSteward = pickedKind ? facilitySteward(sect?.management?.halls, pickedKind.id as FacilityKindId) : undefined;
  const pickedYieldText = pickedYield
    ? [
        ...pickedYield.materials.map((m) => `${m.name}+${m.amount}`),
        pickedYield.stone > 0 ? `灵石+${pickedYield.stone}` : "",
        pickedYield.reputation > 0 ? `声望+${pickedYield.reputation}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  if (tiles.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="font-serif text-sm text-paper-400/50">这处山门还没有图。</p>
      </div>
    );
  }

  // 方形底子的边长（未缩放），再按缩放放大成实际像素尺寸——这样贴图是原尺寸绘制，不糊
  const base = Math.max(180, Math.min(size.w, size.h) - PADDING);
  const side = base * view.scale;
  // 标签字号随缩放变大，但封顶，免得撑出格子
  const labelPx = Math.min(11 * view.scale, 24);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex touch-none items-center justify-center overflow-hidden"
      style={{ cursor: pannable ? "grab" : "zoom-in" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {showLectureNotice && (
        // 让开顶上一行的场景栏（返回、城图、开发者入口），免得横幅压住那些按钮
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3">
          <div
            className="pointer-events-auto flex items-center gap-3 rounded border border-gold-500/40 bg-ink-900/90 px-4 py-2 shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span
              className={
                lectureStarted
                  ? "h-2 w-2 shrink-0 rounded-full bg-cinnabar-400"
                  : "h-2 w-2 shrink-0 rounded-full bg-gold-400"
              }
            />
            <div className="min-w-0">
              <div className="font-brush text-sm text-paper-50">
                {lectureStarted ? "主殿开讲已开始" : `今日${shichenName(lectureAt)}主殿开讲`}
              </div>
              <div className="font-serif text-xs text-paper-400/70">
                {lectureStarted
                  ? isLeader
                    ? "弟子已在殿中等候，可登坛开讲。"
                    : `掌门登坛说法，听讲可得修为 +${lectureGainNow}。`
                  : `开讲在${shichenName(lectureAt)}，届时可往主殿。`}
              </div>
            </div>
            {/* 开讲不再是按一下便涨修为：推到主殿那处，由玩家挑定这场讲什么，再交叙事 */}
            <button
              type="button"
              onClick={() => setInside({ name: "传法大殿", kindId: "hall", kindName: "主殿" })}
              className={
                lectureStarted
                  ? "shrink-0 rounded border border-jade-400/60 bg-jade-500/90 px-3 py-1 font-serif text-xs text-paper-50 transition hover:bg-jade-500"
                  : "shrink-0 rounded border border-gold-500/40 bg-gold-500/15 px-3 py-1 font-serif text-xs text-gold-200 transition hover:bg-gold-500/25"
              }
            >
              {lectureStarted ? (isLeader ? "往主殿登坛" : "往主殿听讲") : "先往主殿"}
            </button>
          </div>
        </div>
      )}
      <div
        ref={gridRef}
        className="grid shrink-0 gap-px overflow-hidden rounded border border-gold-500/30 shadow-[0_0_40px_rgba(0,0,0,0.6)]"
        style={{
          width: side,
          height: side,
          backgroundColor: "#241f1a",
          gridTemplateColumns: `repeat(${SECT_GRID_SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${SECT_GRID_SIZE}, minmax(0, 1fr))`,
          transform: `translate(${view.x}px, ${view.y}px)`,
        }}
      >
        {layout.map((code, index) => {
          const building = displayBuildings[index];
          const kind = tileKindFor(index);
          // 建筑格不铺地形；地形格取地形贴图，取不到就退回底色
          const terrain = building ? undefined : sectTerrainFor(code, scene.culture);
          const emptyBuildable = !building && canBuildHere && code === SECT_EMPTY_TILE;
          const title = building ? `${kind.name} · ${building.name}` : emptyBuildable ? "空地 · 可营造" : kind.name;
          return (
            <div
              key={index}
              title={title}
              className={cn(
                "relative overflow-hidden",
                (building || emptyBuildable) && "cursor-pointer transition hover:ring-1 hover:ring-gold-400/70",
                picked === index && "ring-2 ring-gold-400",
              )}
              style={{ backgroundColor: sectTileFill(code) }}
            >
              {terrain && (
                <span
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${terrain})` }}
                />
              )}
              {building && (
                <>
                  <span
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${building.url})` }}
                  />
                  {/* 建筑压一层暗边，好与地面分出层次 */}
                  <span className="pointer-events-none absolute inset-0 border border-ink-900/60" />
                  {taskSpots.has(building.name) && (
                    <span className="pointer-events-none absolute right-0 top-0 bg-cinnabar-500/90 px-0.5 text-[10px] leading-tight text-paper-50">
                      ★
                    </span>
                  )}
                  <span
                    className="absolute inset-x-0 bottom-0 truncate bg-ink-900/75 px-0.5 text-center font-brush leading-tight text-paper-50"
                    style={{ fontSize: labelPx, textShadow: "0 1px 2px rgba(0,0,0,0.95)" }}
                  >
                    {building.name}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* 建筑卡：点一格浮出，报名称、等级、日产与管事，并留一道入内的门 */}
      {pickedBuilding && pickedKind && pickedYield && !inside && (
        <div
          className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="flex max-w-lg items-center gap-3 rounded border border-gold-500/40 bg-ink-900/95 px-4 py-2 shadow-lg">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-brush text-base text-paper-50">{pickedBuilding.name}</span>
                <span className="font-serif text-xs text-paper-400/60">{pickedKind.name}</span>
                <span className="font-number text-xs text-gold-400">Lv.{pickedState?.level ?? 1}</span>
                {pickedState?.status && pickedState.status !== "正常" && (
                  <span className="font-serif text-xs text-cinnabar-400">{pickedState.status}</span>
                )}
              </div>
              <div className="font-serif text-xs text-paper-400/70">
                管事：{pickedSteward || "无主"}　·　日产：{pickedYieldText || "不出财货"}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setInside({ name: pickedBuilding.name, kindId: pickedKind.id as FacilityKindId, kindName: pickedKind.name })
              }
              className="shrink-0 rounded border border-jade-400/60 bg-jade-500/90 px-3 py-1 font-serif text-xs text-paper-50 transition hover:bg-jade-500"
            >
              入内
            </button>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="shrink-0 rounded border border-paper-400/20 px-2 py-1 font-serif text-xs text-paper-400/60 transition hover:text-paper-200"
            >
              收起
            </button>
          </div>
        </div>
      )}

      {inside && (
        <SectFacilityPanel
          name={inside.name}
          kindId={inside.kindId}
          kindName={inside.kindName}
          onClose={() => setInside(null)}
        />
      )}

      {buildAt !== null && (
        <SectBuildModal cellIndex={buildAt} onClose={() => setBuildAt(null)} />
      )}
    </div>
  );
}
