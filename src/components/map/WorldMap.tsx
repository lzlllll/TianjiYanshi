import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Flag, Landmark, Layers, PencilRuler, Sparkles, Trash2, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { factionColor } from "@/lib/territory";
import { occupationTribute } from "@/data/occupations";
import { SectMapView } from "./SectMapView";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import {
  // getBackgroundImage,
  addPresetPoint,
  getCityMarkers,
  getMarker,
  getScene,
  getSceneImage,
  getSceneMarkers,
  getScenePresetPoints,
  getTileTexture,
  getTownScene,
  getWorldScene,
  removePresetPoint,
} from "@/data/map";
import {
  BLOCK_TILE,
  EMPTY_TILE,
  FOREST_TILE,
  RIVER_TILE,
  ROAD_TILE,
  TILE_GRID_SIZE,
  buildTileLinks,
  getTileKind,
  mapDistrictsToCells,
  tileFill,
} from "@/data/map/tiles";
import { manorHouseName, rollDistrictNpcs } from "@/data/npcGen";
import type { DistrictNpcTarget } from "./DistrictNpcPanel";
import type { ManorTarget } from "./ManorPanel";
import type { MarketTarget } from "./MarketPanel";
import type { WorkshopTarget } from "./WorkshopPanel";
import type { ForestTarget } from "./ForestExploreModal";
import { ClosedPlaceModal } from "./ClosedPlaceModal";
import type { ClosedPlaceTarget } from "./ClosedPlaceModal";
import { PresetPointModal } from "./PresetPointModal";
import { SectSiteCard } from "./SectSiteCard";
import { VillagePanel } from "./VillagePanel";
import { presetKey } from "@/data/map/presets";
import { adventureEnterable, adventureWhere, dangerLabel, isPresetFree } from "@/data/adventures";
import { MANOR_PLOT_PRICE } from "@/data/manors";
import type { MapMarker, MapMarkerKind, PresetPoint } from "@/data/types";

/** 最大放大到 200% */
const MAX_SCALE = 2;
/** 滚轮灵敏度，指数缩放让每一格滚动的观感一致 */
const WHEEL_SENSITIVITY = 0.0015;
/** 按下到抬起的位移不超过这个像素数才算单击，否则按拖拽处理。真机点击常带几像素抖动，留宽一点 */
const CLICK_MOVE_TOLERANCE = 6;
/** 标点圆点直径，单位屏幕像素；地名挂在它下方 */
const MARKER_DOT_SIZE = 12;
/** 标点的点击热区，比圆点大一圈，免得小图标难以点中 */
const MARKER_HIT_SIZE = 26;
/** 当前所在地准星的直径，比徽章大一圈 */
const CURSOR_SIZE = 40;
/** 当前所在地徽章的直径；里面放人形图标，比普通标点明显得多 */
const CURSOR_BADGE_SIZE = 28;
/** 预设点位的点击热区与标记边长；虚线方框一眼看出是还没开出来的地方 */
const PRESET_HIT_SIZE = 26;
const PRESET_MARK_SIZE = 18;
/** 宗门点位的点击热区与印记边长；比预设点位显眼些，它是真开出来的地方 */
const SECT_HIT_SIZE = 26;
const SECT_MARK_SIZE = 18;
/** 奇遇点位的点击热区与印记边长 */
const ADV_HIT_SIZE = 28;
const ADV_MARK_SIZE = 20;
/** 建筑街区的边线宽度；相邻两格的边线叠起来，街区之间就是一道更重的分界 */
const BLOCK_BORDER = 2;
/** 道路与河流连成的线：青石路面与水色，宽度按格计，跟着地图一起缩放 */
const ROAD_LINE = { color: "#7e9298", width: 0.14 };
const RIVER_LINE = { color: "#4f9fd0", width: 0.2 };

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface View {
  scale: number;
  x: number;
  y: number;
}

/** 探测点，存原图像素坐标 */
interface Probe {
  nx: number;
  ny: number;
}

/** 各类标点的样式与尺寸；新增标点种类时在这里补一行即可 */
const MARKER_STYLE: Record<MapMarkerKind, { className: string; size: number }> = {
  city: { className: "rounded-full border-2 border-gold-400 bg-cinnabar-500/80", size: MARKER_DOT_SIZE },
  landmark: { className: "rotate-45 border-2 border-gold-400 bg-jade-500/90", size: MARKER_DOT_SIZE },
  portal: { className: "rounded-full border-2 border-jade-400 bg-ink-900/75", size: MARKER_DOT_SIZE },
  npc: { className: "rounded-full border-2 border-paper-100 bg-gold-400/90", size: 10 },
};

const MARKER_KIND_NAMES: Record<MapMarkerKind, string> = {
  city: "城池",
  landmark: "地标",
  portal: "通路",
  npc: "人物",
};

/**
 * 主屏地图：滚轮缩放至最多 200%，按住左键拖拽平移，缩放以光标为锚点。
 * 地图场景、标点都来自 src/data/map，换一张地图只改数据不动这里。
 *
 * 玩家所在的地点用「定位光标」表示：脉冲光环 + 四向准星 + 人形徽章 + 深底地名牌，
 * 尺寸与对比度都明显高于普通标点，隔着半张图也能一眼找到自己。
 *
 * 标点与光标都放在不参与地图变换的覆盖层里，位置由 projectToScreen 算出来。
 * 早先的做法是把它们放进地图层再用 scale(1/scale) 反向抵消，浏览器会先把文字按缩小后的
 * 比例栅格化、再被父层放大，导致放大后字迹发虚，因此改为投影定位。
 */
export function WorldMap({
  onOpenTileEditor,
  onOpenSectEditor,
  onOpenDistrict,
  onOpenManor,
  onOpenMarket,
  onOpenWorkshop,
  onExploreForest,
}: {
  onOpenTileEditor?: () => void;
  /** 打开宗门地图模板编辑器 */
  onOpenSectEditor?: () => void;
  /** 点了平民住宅的街区，把这一处的人交给上层开面板 */
  onOpenDistrict?: (target: DistrictNpcTarget) => void;
  /** 点了大户住宅，把宅子交给上层开面板 */
  onOpenManor?: (target: ManorTarget) => void;
  /** 点了坊市，把沿街铺面交给上层开面板 */
  onOpenMarket?: (target: MarketTarget) => void;
  /** 点了匠人区，把作坊里的工匠交给上层开面板 */
  onOpenWorkshop?: (target: WorkshopTarget) => void;
  /** 点了城里的林地，把这一处交给上层开探索面板 */
  onExploreForest?: (target: ForestTarget) => void;
}) {
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const currentAdventureId = useGameStore((s) => s.currentAdventureId);
  const mapSceneId = useGameStore((s) => s.mapSceneId);
  const enterScene = useGameStore((s) => s.enterScene);
  const exitScene = useGameStore((s) => s.exitScene);
  const devMoveTo = useGameStore((s) => s.devMoveTo);
  const districtNames = useGameStore((s) => s.districtNames);
  const manors = useGameStore((s) => s.manors);
  const ensureManor = useGameStore((s) => s.ensureManor);
  const ensureMarket = useGameStore((s) => s.ensureMarket);
  const ensureWorkshop = useGameStore((s) => s.ensureWorkshop);
  const quests = useGameStore((s) => s.quests);
  const sectSites = useGameStore((s) => s.sectSites);
  const adventures = useGameStore((s) => s.adventures);
  const villages = useGameStore((s) => s.villages ?? {});
  const occupations = useGameStore((s) => s.occupations ?? []);
  const relations = useGameStore((s) => s.relations ?? []);
  const buyPlot = useGameStore((s) => s.buyPlot);
  const manorPlots = useGameStore((s) => s.manorPlots ?? []);
  const openAdventure = useAIStore((s) => s.openAdventure);
  const spawnAdventure = useAIStore((s) => s.spawnAdventure);
  const travelToAdventure = useAIStore((s) => s.travelToAdventure);
  const cities = useMemo(() => getCityMarkers(), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 预设点位：宗门与秘境还没开出来，先把地方圈下。只在开发者模式下看得见
  const [presets, setPresets] = useState<PresetPoint[]>([]);
  // 点开看的是哪一处；按位置认，故存的是 presetKey
  const [presetKeyOpen, setPresetKeyOpen] = useState<string | null>(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  // 开发者模式：在此点位现掷奇遇之后的回话
  const [presetSpawnNote, setPresetSpawnNote] = useState("");
  const [presetSpawning, setPresetSpawning] = useState(false);
  // 点开看的是哪一处宗门；按编号认
  const [sectSiteId, setSectSiteId] = useState<string | null>(null);
  // 点开看的是哪一处奇遇；按编号认
  const [adventureId, setAdventureId] = useState<string | null>(null);
  // 点开的是哪一处村庄；按点位身份认
  const [villageKey, setVillageKey] = useState<string | null>(null);
  // 点到城里一格空地：问一声要不要买下来做宅地
  const [plotOffer, setPlotOffer] = useState<{ index: number; label: string } | null>(null);
  // 地图模式：寻常舆图，或按所属门派给各处图标染色的势力图
  const [mapMode, setMapMode] = useState<"normal" | "territory">("normal");
  // 点到的宗教场所或官府：这两处还没做成常设界面，改开一扇自述行动的叙事窗
  const [closedPlace, setClosedPlace] = useState<ClosedPlaceTarget | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const scene = getScene(mapSceneId) ?? getWorldScene();
  const sceneImage = getSceneImage(scene);
  const parentScene = scene.parentId ? getScene(scene.parentId) : undefined;
  const markers = getSceneMarkers(scene.id);
  // 坐标系以场景声明的尺寸为准，图片按它铺满，新增地图只改 scenes.json
  const base = { w: scene.width, h: scene.height };
  const place = getMarker(currentPlaceId);

  // 立了门户的各家：各取一色，本门另用一色
  const sectFaction = useMemo(() => {
    const m = new Map<string, { color: string; label: string; mine?: boolean }>();
    sectSites.forEach((s) => {
      if (!s?.name) return;
      m.set(s.id, { color: factionColor(s.id, s.mine), label: s.name, mine: s.mine });
    });
    return m;
  }, [sectSites]);

  // 城村归谁：占了便照占有那一家取色，图标与名下一并照标
  const holdFaction = useMemo(() => {
    const m = new Map<string, { color: string; label: string; mine?: boolean }>();
    occupations.forEach((o) => {
      const own = sectFaction.get(o.ownerSectId);
      m.set(`${o.kind}:${o.targetId}`, {
        color: own?.color ?? factionColor(o.ownerSectId, false),
        label: o.ownerName || own?.label || o.ownerSectId,
        mine: own?.mine,
      });
    });
    return m;
  }, [occupations, sectFaction]);

  /** 某一处图标眼下归谁；没被占便是空 */
  const factionAt = (kind: "city" | "village", id: string) => holdFaction.get(`${kind}:${id}`);

  // 图例：按势力归并，本门排在前头
  const territoryLegend = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string; mine?: boolean; holds: number }>();
    const add = (f: { color: string; label: string; mine?: boolean }) => {
      const cur = map.get(f.label);
      if (cur) {
        cur.holds += 1;
        cur.mine = cur.mine || f.mine;
      } else {
        map.set(f.label, { key: f.label, label: f.label, color: f.color, mine: f.mine, holds: 1 });
      }
    };
    sectFaction.forEach(add);
    holdFaction.forEach(add);
    return [...map.values()].sort(
      (a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || b.holds - a.holds,
    );
  }, [sectFaction, holdFaction]);

  const selected = selectedId ? getMarker(selectedId) : undefined;
  // 点开的是城，顺带看它的拥有者与驻城执事
  const selectedOccupation =
    selected && selected.kind === "city"
      ? occupations.find((o) => o.kind === "city" && o.targetId === selected.id)
      : undefined;
  const selectedGovernor =
    selected && selected.kind === "city"
      ? relations.find(
          (r) => r?.cityId === selected.id && /执事|总督/.test(String(r.title ?? "")),
        )
      : undefined;
  // 手绘地图上才画玩家光标；瓦片地图没有世界坐标，画上去会落到图外
  const tiles = scene.tiles;
  // 街区明细按行优先顺序摊回格子，建筑街区格据此取对应性质的贴图
  const districtByCell = useMemo(
    () => mapDistrictsToCells(tiles ?? [], scene.districts ?? []),
    [tiles, scene.districts],
  );
  // 手上还没办完的差事办在哪一处街区：这几处在城图上挂星标
  const questDistricts = useMemo(() => {
    const ids = quests
      .filter((q) => q.status === "open" && q.target?.cityId === currentPlaceId && typeof q.target.districtId === "number")
      .map((q) => q.target!.districtId as number);
    return new Set(ids);
  }, [quests, currentPlaceId]);
  // 手上还没办完的差事办在哪一处奇遇、哪一座村庄：这两处在舆图上挂星标
  const questAdventureIds = useMemo(
    () =>
      new Set(
        quests
          .filter((q) => q.status === "open" && q.target?.adventureId)
          .map((q) => q.target!.adventureId as string),
      ),
    [quests],
  );
  const questVillageKeys = useMemo(
    () =>
      new Set(
        quests
          .filter((q) => q.status === "open" && q.target?.villageKey)
          .map((q) => q.target!.villageKey as string),
      ),
    [quests],
  );
  // 路网与水系：把相邻同类地块的中心连成线，描在格子之上；
  // 河遇上一格道路时直接穿过去，把那格当桥，免得水道被路截断
  const roadLinks = useMemo(() => buildTileLinks(tiles ?? [], ROAD_TILE), [tiles]);
  const riverLinks = useMemo(() => buildTileLinks(tiles ?? [], RIVER_TILE, ROAD_TILE), [tiles]);
  // 这一城里所有大户住宅的街区编号；宅号要挂在城图上，所以得先知道是哪几户
  const manorCells = useMemo(
    () =>
      [...districtByCell.values()]
        .filter((d) => d.nature === "大户住宅")
        .map((d) => d.id)
        .join(","),
    [districtByCell],
  );
  // 进这一城的图就把大户人家掷出来，掷过即入存档，再进来还是这几户；
  // 放在 effect 里而不是渲染中，免得渲染出副作用
  useEffect(() => {
    if (!place || !manorCells) return;
    for (const raw of manorCells.split(",")) {
      const districtId = Number(raw);
      if (Number.isFinite(districtId)) {
        ensureManor(place.id, districtId, place.name, scene.culture);
      }
    }
  }, [place, manorCells, scene.culture, ensureManor]);
  // 坊市的铺面也先开出来：点坊市进屋才不会空着；叙事要写「到某家铺子买卖」时，
  // 数据摘要里便有这城的真铺名可照抄
  const marketCells = useMemo(
    () =>
      [...districtByCell.values()]
        .filter((d) => d.nature === "坊市")
        .map((d) => `${d.id}:${d.slots}`)
        .join(","),
    [districtByCell],
  );
  useEffect(() => {
    if (!place || !marketCells) return;
    for (const entry of marketCells.split(",")) {
      const [idStr, slotStr] = entry.split(":");
      const districtId = Number(idStr);
      if (!Number.isFinite(districtId)) continue;
      ensureMarket(place.id, districtId, scene.culture, Number(slotStr));
    }
  }, [place, marketCells, scene.culture, ensureMarket]);
  // 背景底图系统已停用，城图不再叠城市背景图
  // const bgUrl = getBackgroundImage(scene.bg);
  // 坐标探测只对带图像坐标的手绘地图有效；瓦片地图按格排布，整套坐标体系在此停用
  const canProbe = isDeveloperMode && !tiles;
  // 当前城市的瓦片地图，有它才给「进入城图」的入口
  const townScene = !tiles && place ? getTownScene(place.id) : undefined;

  /**
   * 预设点位只在开发者模式下露面：那是为将来圈的地方，不该混进玩家的舆图。
   * 点位存在数据层而不是本组件的状态里，改过之后得回来重取一遍。
   */
  const refreshPresets = useCallback(() => {
    setPresets(isDeveloperMode ? getScenePresetPoints(scene.id) : []);
  }, [isDeveloperMode, scene.id]);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  // 跟随容器尺寸变化重新计算基准，窗口缩放或开合浮层都不会让地图错位
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerSize({ w: rect.width, h: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 换地图就回到初始视角，免得沿用上一张图的平移量
  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 });
    setSelectedId(null);
    setProbe(null);
    setPresetKeyOpen(null);
  }, [scene.id]);

  // 基准尺寸：等比缩放到完整放进容器（不裁切、不拉伸）
  const fit = (() => {
    if (!containerSize.w || !containerSize.h) return { w: 0, h: 0 };
    const ratio = Math.min(containerSize.w / base.w, containerSize.h / base.h);
    return { w: base.w * ratio, h: base.h * ratio };
  })();

  const clampView = useCallback(
    (next: View): View => {
      const maxX = Math.max(0, (fit.w * next.scale - containerSize.w) / 2);
      const maxY = Math.max(0, (fit.h * next.scale - containerSize.h) / 2);
      return {
        scale: next.scale,
        x: clampNumber(next.x, -maxX, maxX),
        y: clampNumber(next.y, -maxY, maxY),
      };
    },
    [fit.w, fit.h, containerSize.w, containerSize.h],
  );

  // 容器尺寸一变就把平移量夹回边界内
  useEffect(() => {
    setView((v) => clampView(v));
  }, [clampView]);

  // 滚轮缩放：必须用非被动监听才能拦住浏览器默认的滚动行为
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;

      setView((v) => {
        const nextScale = clampNumber(
          v.scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY),
          1,
          MAX_SCALE,
        );
        if (nextScale === v.scale) return v;
        // 以光标为锚点：让光标下的那张地图在缩放前后停在原处
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

  /** 场景坐标 → 容器内的屏幕坐标；取整是为了让地名落在整数像素上，文字才不发虚 */
  const projectToScreen = useCallback(
    (nx: number, ny: number): { x: number; y: number } | null => {
      if (!fit.w || !fit.h || !containerSize.w || !containerSize.h) return null;
      const layoutX = nx * (fit.w / base.w);
      const layoutY = ny * (fit.h / base.h);
      return {
        x: Math.round(containerSize.w / 2 + (layoutX - fit.w / 2) * view.scale + view.x),
        y: Math.round(containerSize.h / 2 + (layoutY - fit.h / 2) * view.scale + view.y),
      };
    },
    [base.w, base.h, fit.w, fit.h, containerSize.w, containerSize.h, view.scale, view.x, view.y],
  );

  // 街区性质标签挂在不参与地图变换的覆盖层里，字号恒定、放大后也不发虚；
  // 位置取每格的中心，与格子上铺的贴图对齐。叙事起过名的街区优先显示名字，
  // 大户人家则挂自家的宅号（如「田府」），免得整城都是「大户住宅」四个字
  const districtLabels = useMemo(
    () =>
      [...districtByCell.entries()].flatMap(([index, district]) => {
        const point = projectToScreen(
          (index % TILE_GRID_SIZE) + 0.5,
          Math.floor(index / TILE_GRID_SIZE) + 0.5,
        );
        if (!point) return [];
        const manor = place ? manors[`${place.id}:${district.id}`] : undefined;
        return [
          {
            index,
            nature: district.nature,
            name:
              (place ? districtNames?.[`${place.id}:${district.id}`] : undefined) ||
              (manor ? manorHouseName(manor) : undefined) ||
              undefined,
            // 手上还有事要办到这一处去的，星标出来
            starred: place ? questDistricts.has(district.id) : false,
            point,
          },
        ];
      }),
    [districtByCell, projectToScreen, districtNames, manors, place, questDistricts],
  );

  /** 把屏幕上的点反解成场景像素坐标；落在留白处则不算命中 */
  const toScenePoint = (clientX: number, clientY: number): Probe | null => {
    const el = containerRef.current;
    if (!el || !fit.w || !fit.h) return null;

    const rect = el.getBoundingClientRect();
    const cursorX = clientX - rect.left - rect.width / 2;
    const cursorY = clientY - rect.top - rect.height / 2;
    // 地图以自身中心缩放平移，故反解为 d = (光标 - 平移) / 缩放
    const offsetX = (cursorX - view.x) / view.scale + fit.w / 2;
    const offsetY = (cursorY - view.y) / view.scale + fit.h / 2;

    const nx = offsetX * (base.w / fit.w);
    const ny = offsetY * (base.h / fit.h);
    if (nx < 0 || ny < 0 || nx > base.w || ny > base.h) return null;

    return { nx, ny };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 只响应鼠标左键
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

  /**
   * 点街区看人看铺：平民住宅是街上撞见的一拨生人，大户人家是门墙里固定的一户人家，
   * 坊市是沿街固定的那些铺面。别处性质各有各的门径，还没做，点了不动。
   * 林地不作街巷看，另开一处探索的去处；空地点一下就问要不要置一块宅地。
   * 例外：手上若有差事办在这一处，先开这一处的人——任务要用的人钉在哪块地上都寻得着。
   */
  const openDistrictNpc = (clientX: number, clientY: number) => {
    if (!place || !tiles) return;
    const point = toScenePoint(clientX, clientY);
    if (!point) return;
    const index =
      Math.floor((point.ny / base.h) * TILE_GRID_SIZE) * TILE_GRID_SIZE +
      Math.floor((point.nx / base.w) * TILE_GRID_SIZE);
    // 城边的林地：点开便是一处探索的去处，走一趟或有所得、或遇上事
    if (tiles[index] === FOREST_TILE) {
      if (!onExploreForest) return;
      onExploreForest({
        label: `${place.name}·林地 ${Math.floor(index / TILE_GRID_SIZE) + 1}排${(index % TILE_GRID_SIZE) + 1}列`,
        culture: scene.culture,
      });
      return;
    }

    // 置宅地只认空地：水面、山体、街道、林地都动不得
    if (tiles[index] === EMPTY_TILE) {
      // 已经置过的那一格不再问
      const taken = manorPlots.some((p) => p.cityId === place.id && p.districtId === index);
      if (!taken) {
        setPlotOffer({
          index,
          label: `${place.name}·空地 ${Math.floor(index / TILE_GRID_SIZE) + 1}排${(index % TILE_GRID_SIZE) + 1}列`,
        });
      }
      return;
    }
    const district = districtByCell.get(index);
    if (!district) return;

    // 官府与寺观还没做成常设界面：点开便是一扇自述行动的叙事窗。
    // 差事就算点在这一处，也照旧在这儿办、在这儿交，不必另开一间空屋子
    if (district.nature === "宗教场所" || district.nature === "政府部门") {
      setClosedPlace({
        label: `${place.name}·${district.name || district.nature}`,
        nature: district.nature,
        culture: scene.culture,
      });
      return;
    }

    // 有差事办在这一处的，先摊这一处的人：坊市、匠人区都照此办
    const hasErrand = (Array.isArray(quests) ? quests : []).some(
      (q) => q.status === "open" && q.target?.cityId === place.id && q.target.districtId === district.id,
    );
    if (hasErrand) {
      if (!onOpenDistrict) return;
      const label = `${place.name}·${district.name || district.nature}`;
      onOpenDistrict({
        cityId: place.id,
        districtId: district.id,
        label,
        // 不是住家的地块，不现撞生面孔；钉在这儿的任务人物照旧摊得出来
        strangers:
          district.nature === "平民住宅"
            ? rollDistrictNpcs(label, place.id, district.id, scene.culture, 3)
            : [],
      });
      return;
    }

    if (district.nature === "平民住宅") {
      if (!onOpenDistrict) return;
      const label = `${place.name}·${district.name || district.nature}`;
      onOpenDistrict({
        cityId: place.id,
        districtId: district.id,
        label,
        strangers: rollDistrictNpcs(label, place.id, district.id, scene.culture, 3),
      });
      return;
    }

    if (district.nature === "大户住宅") {
      if (!onOpenManor) return;
      // 头一回推门才掷人，掷出来的就写进存档，往后都是这一户
      const manor = ensureManor(place.id, district.id, place.name, scene.culture);
      onOpenManor({ cityId: place.id, cityName: place.name, districtId: district.id, manor });
      return;
    }

    if (district.nature === "坊市") {
      if (!onOpenMarket) return;
      // 头一回进坊市才开市，铺面数与建筑槽位数相同
      const market = ensureMarket(place.id, district.id, scene.culture, district.slots);
      onOpenMarket({
        cityId: place.id,
        districtId: district.id,
        label: `${place.name}·${district.name || district.nature}`,
        culture: scene.culture,
        market,
      });
      return;
    }

    if (district.nature === "匠人区") {
      if (!onOpenWorkshop) return;
      // 头一回推门才掷工匠，掷出来的就写进存档，这一局里不再换人
      const workshop = ensureWorkshop(place.id, district.id, place.name, scene.culture);
      onOpenWorkshop({
        cityId: place.id,
        districtId: district.id,
        label: `${place.name}·${district.name || district.nature}`,
        culture: scene.culture,
        workshop,
      });
      return;
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    setDragging(false);

    // 位移很小视为单击
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (moved > CLICK_MOVE_TOLERANCE) return;
    // 城图上是点街区访人；舆图上开发模式探出该点坐标
    if (tiles) {
      openDistrictNpc(e.clientX, e.clientY);
    } else if (canProbe) {
      setProbe(toScenePoint(e.clientX, e.clientY));
    }
  };

  /**
   * 开发者模式下双击空处，就地记下一处位置：宗门与秘境还没开出来，
   * 先把地方圈住，将来照着这儿建场景。城图按格排布，没有这套坐标，故不接。
   * 名目、种类都不问，只记位置；点错了到「预设点位」里抹掉便是。
   */
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canProbe) return;
    const point = toScenePoint(e.clientX, e.clientY);
    if (!point) return;
    const saved = addPresetPoint({ sceneId: scene.id, x: point.nx, y: point.ny });
    refreshPresets();
    setSelectedId(null);
    setPresetSpawnNote("");
    setPresetKeyOpen(presetKey(saved));
  };

  /** 抹掉一处现点的位置；随 presets.json 发下来的那一份得去改文件 */
  const dropPreset = (key: string) => {
    if (!removePresetPoint(key)) return;
    refreshPresets();
    setPresetKeyOpen(null);
  };

  /** 开发者模式：就在这一处点位上现掷一桩奇遇，落在它所在的那一带 */
  const spawnHere = async (preset: PresetPoint) => {
    if (presetSpawning) return;
    setPresetSpawning(true);
    setPresetSpawnNote("已请天意在此现掷，稍候……");
    try {
      await spawnAdventure("开发者现点", { sceneId: preset.sceneId, x: preset.x, y: preset.y });
      setPresetSpawnNote("这一处已现掷过；若点位空着，舆图上便多一处奇遇。");
    } catch {
      setPresetSpawnNote("这一处没掷出来，再试一回。");
    } finally {
      setPresetSpawning(false);
    }
  };

  const pannable = view.scale > 1;
  const cursorClass = dragging
    ? "cursor-grabbing"
    : canProbe
      ? "cursor-crosshair"
      : pannable
        ? "cursor-grab"
        : "cursor-default";

  const probePoint = canProbe && probe ? projectToScreen(probe.nx, probe.ny) : null;
  // 光标所在：人若正驻在某一处奇遇点位上，光标便落在那处野地；否则照旧落在所在城池标点上
  const cursorAdventure = currentAdventureId
    ? (Array.isArray(adventures) ? adventures : []).find((a) => a.id === currentAdventureId) ?? null
    : null;
  const cursorTitle = cursorAdventure?.name || place?.name || "";
  const placePoint = !tiles
    ? cursorAdventure
      ? projectToScreen(cursorAdventure.x, cursorAdventure.y)
      : place
        ? projectToScreen(place.x, place.y)
        : null
    : null;
  const canEnter = !!selected && selected.id === currentPlaceId && !!getTownScene(selected.id);
  const openPreset = presets.find((p) => presetKey(p) === presetKeyOpen) ?? null;
  // 这一处还空着没有：开发者模式在此现掷奇遇前先看一眼
  const presetTaken = !!openPreset && !isPresetFree({ sectSites, adventures }, openPreset);
  // 点开的是哪一处宗门；按编号认
  const openSectSite = sectSites.find((s) => s.id === sectSiteId) ?? null;
  // 点开看的是哪一处奇遇
  const openAdventureItem = (Array.isArray(adventures) ? adventures : []).find((a) => a.id === adventureId) ?? null;
  // 已经开成宗门的那些点位不再画方子：一处地方只该有一个记号，
  // 不然那颗虚线方子会正好压在宗门印上，把点击也一并吃走
  const freePresets = useMemo(() => {
    const taken = new Set<string>([
      ...sectSites.map((s) => `${s.sceneId}:${Math.round(s.x)},${Math.round(s.y)}`),
      ...(Array.isArray(adventures)
        ? adventures.map((a) => `${a.sceneId}:${Math.round(a.x)},${Math.round(a.y)}`)
        : []),
    ]);
    return presets.filter((p) => !taken.has(presetKey(p)));
  }, [presets, sectSites, adventures]);

  return (
    <div
      ref={containerRef}
      data-tutorial="world-map"
      className={cn("mainui-black absolute inset-0 overflow-hidden touch-none select-none", cursorClass)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={handleDoubleClick}
    >
      {/* 宗门山门图是另一套渲染：15×15、按地块立建筑，不走城图那套格与街区 */}
      {scene.kind === "sect" && <SectMapView scene={scene} />}
      <div
        className="absolute inset-0 m-auto will-change-transform"
        style={{
          width: fit.w || undefined,
          height: fit.h || undefined,
          display: scene.kind === "sect" ? "none" : undefined,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        {tiles ? (
          // 瓦片地图：整块格子跟着地图一起缩放，格子上的贴图是照片，放大后同样清晰。
          // 背景底图系统已停用，格子底下只剩一层深色底；
          // 要恢复城市背景图，把下面三行注释放开，并解注 bgUrl 与 getBackgroundImage 的导入
          <div
            className="relative h-full w-full"
            style={{
              // backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
              // backgroundSize: "cover",
              // backgroundPosition: "center",
              backgroundColor: "#2a241c",
              opacity: fit.w ? 1 : 0,
            }}
          >
            <div
              className="grid h-full w-full gap-px"
              style={{
                gridTemplateColumns: `repeat(${scene.width}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${scene.height}, minmax(0, 1fr))`,
              }}
            >
              {tiles.map((code, index) => {
                // 建筑街区看街区性质，其余看地块类型；取不到贴图就退回地块颜色
                const district = districtByCell.get(index);
                // 大户人家连宅号一起报，悬停过去就知道这院子姓什么
                const manor = place && district ? manors[`${place.id}:${district.id}`] : undefined;
                // 河流与道路只按空地铺底，全靠上面描的线分辨
                const ground = code === ROAD_TILE || code === RIVER_TILE ? EMPTY_TILE : code;
                const texture = getTileTexture(ground, district?.nature, scene.culture, index);
                return (
                  <div
                    key={index}
                    title={
                      district
                        ? `${getTileKind(code).name} · ${manor ? manorHouseName(manor) : district.nature}`
                        : getTileKind(code).name
                    }
                    style={{
                      backgroundColor: tileFill(ground),
                      backgroundImage: texture ? `url(${texture})` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      // 街区自带一道粗边，相邻两格的边叠起来，街区之间的分界就比别处重
                      border: code === BLOCK_TILE ? `${BLOCK_BORDER}px solid rgba(38, 24, 14, 0.92)` : undefined,
                    }}
                  />
                );
              })}
            </div>
            {/* 路网与水系描在格子之上：坐标用格为单位，随地图一起缩放 */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${TILE_GRID_SIZE} ${TILE_GRID_SIZE}`}
              preserveAspectRatio="none"
            >
              {roadLinks.map((link, index) => (
                <line
                  key={`road-${index}`}
                  x1={link.from[0]}
                  y1={link.from[1]}
                  x2={link.to[0]}
                  y2={link.to[1]}
                  stroke={ROAD_LINE.color}
                  strokeWidth={ROAD_LINE.width}
                  strokeLinecap="round"
                />
              ))}
              {riverLinks.map((link, index) => (
                <line
                  key={`river-${index}`}
                  x1={link.from[0]}
                  y1={link.from[1]}
                  x2={link.to[0]}
                  y2={link.to[1]}
                  stroke={RIVER_LINE.color}
                  strokeWidth={RIVER_LINE.width}
                  strokeLinecap="round"
                />
              ))}
            </svg>
          </div>
        ) : sceneImage ? (
          <>
            <img
              src={sceneImage}
              alt={scene.name}
              draggable={false}
              className="block w-full h-full max-w-none"
              style={{ opacity: fit.w ? 1 : 0 }}
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center font-serif text-sm text-paper-400/60">
            此地图尚未绘制
          </div>
        )}
      </div>

      {/* 覆盖层不参与地图变换，图标与地名的字号恒定、且始终按整数像素栅格化 */}
      <div className="map-labels pointer-events-none absolute inset-0">
        {/* 建筑街区：深底金字压在格子上，贴图再花也读得清；
            叙事起过名的街区只留名字，性质让位给这块地方的称呼 */}
        {districtLabels.map((label) => (
          <span
            key={`district-${label.index}`}
            className={cn(
              "absolute whitespace-nowrap rounded-sm border bg-ink-900/80 px-1.5 py-0.5 font-kai text-[14px] font-bold leading-none",
              // 事要办到这一处去的挂星标：边框与字都换成星色，一眼便认得出
              label.starred
                ? "border-cinnabar-400/80 bg-ink-900/95 text-cinnabar-300"
                : "border-gold-500/45 text-gold-300",
            )}
            style={{
              left: label.point.x,
              top: label.point.y,
              transform: "translate(-50%, -50%)",
              textShadow: "0 1px 2px rgba(0,0,0,0.95)",
            }}
          >
            {label.starred && <span className="mr-0.5">★</span>}
            {label.name ?? label.nature}
          </span>
        ))}

        {markers.map((marker: MapMarker) => {
          // 玩家所在处由定位光标代替，避免两套标记叠在一起
          if (marker.id === currentPlaceId) return null;
          const point = projectToScreen(marker.x, marker.y);
          if (!point) return null;
          const style = MARKER_STYLE[marker.kind];
          // 势力图上：被占了的城照占有那一家染色，名下再缀一行归属
          const faction =
            mapMode === "territory" && marker.kind === "city" ? factionAt("city", marker.id) : undefined;
          return (
            <button
              key={marker.id}
              type="button"
              title={faction ? `${marker.name} · 属${faction.label}` : marker.name}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setSelectedId(marker.id)}
              className="pointer-events-auto absolute flex items-center justify-center"
              style={{
                left: point.x - MARKER_HIT_SIZE / 2,
                top: point.y - MARKER_HIT_SIZE / 2,
                width: MARKER_HIT_SIZE,
                height: MARKER_HIT_SIZE,
              }}
            >
              <span
                className={cn("block shadow-[0_0_6px_rgba(0,0,0,0.85)]", style.className)}
                style={{
                  width: style.size,
                  height: style.size,
                  ...(faction ? { backgroundColor: faction.color, borderColor: faction.color } : {}),
                }}
              />
              {/* 势力图上：拥有者标在城名上方，地名仍旧留在下方 */}
              {mapMode === "territory" && (
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded-sm px-1 font-brush text-[10px] leading-tight shadow-[0_0_6px_rgba(0,0,0,0.85)]",
                    faction ? "text-ink-darkest" : "border border-paper-400/30 bg-ink-900/85 text-paper-300/80",
                  )}
                  style={{
                    ...(faction ? { backgroundColor: faction.color } : {}),
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                >
                  {faction ? faction.label : "无主"}
                </span>
              )}
              <span
                className="pointer-events-none absolute top-full flex flex-col items-center whitespace-nowrap"
                style={{ left: "50%", transform: "translateX(-50%)" }}
              >
                <span
                  className="font-brush text-xs leading-none text-paper-100"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)" }}
                >
                  {marker.name}
                </span>
              </span>
            </button>
          );
        })}

        {/* 村庄：舆图上无名点位里掷出的村落，点开即进村 */}
        {Object.values(villages)
          .filter((v) => v.sceneId === scene.id)
          .map((v) => {
            const point = projectToScreen(v.x, v.y);
            if (!point) return null;
            // 势力图上：被占了的村照占有那一家染色，名下再缀一行归属
            const faction = mapMode === "territory" ? factionAt("village", v.key) : undefined;
            return (
              <button
                key={v.key}
                type="button"
                title={`${v.name}${faction ? ` · 属${faction.label}` : ""}${v.inquired ? "" : v.visited ? "（尚未打听）" : "（尚未前往）"}`}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={() => {
                  setSelectedId(null);
                  setSectSiteId(null);
                  setAdventureId(null);
                  setVillageKey(v.key);
                }}
                className="pointer-events-auto absolute flex items-center justify-center"
                style={{
                  left: point.x - SECT_HIT_SIZE / 2,
                  top: point.y - SECT_HIT_SIZE / 2,
                  width: SECT_HIT_SIZE,
                  height: SECT_HIT_SIZE,
                }}
              >
                <span
                  className="flex items-center justify-center rounded-sm border border-pine-400 font-brush text-[10px] leading-none text-paper-50 shadow-[0_0_6px_rgba(0,0,0,0.85)]"
                  style={{
                    width: SECT_MARK_SIZE,
                    height: SECT_MARK_SIZE,
                    ...(faction ? { backgroundColor: faction.color, borderColor: faction.color } : { backgroundColor: "#3d5a4a" }),
                  }}
                >
                  村
                </span>
                {questVillageKeys.has(v.key) && (
                  <span
                    className="absolute -top-1.5 -right-0.5 font-brush text-[12px] leading-none text-cinnabar-300"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.95)" }}
                  >
                    ★
                  </span>
                )}
                {/* 势力图上：拥有者标在村名上方，地名仍旧留在下方 */}
                {faction && (
                  <span
                    className="pointer-events-none absolute bottom-full mb-1 whitespace-nowrap rounded-sm px-1 font-brush text-[10px] leading-tight text-ink-darkest"
                    style={{ backgroundColor: faction.color, left: "50%", transform: "translateX(-50%)" }}
                  >
                    {faction.label}
                  </span>
                )}
                <span
                  className="absolute top-full flex flex-col items-center whitespace-nowrap"
                  style={{ left: "50%", transform: "translateX(-50%)" }}
                >
                  <span className="font-brush text-[10px] leading-none text-paper-100">{v.name}</span>
                </span>
              </button>
            );
          })}

        {/* 宗门：开局照六处文化圈掷下的山门，点开看它的名号与词条 */}
        {sectSites
          .filter((site) => site.sceneId === scene.id)
          .map((site) => {
            const point = projectToScreen(site.x, site.y);
            if (!point) return null;
            // 势力图上：各处山门照自己那一家的色，一眼看出谁家在这一带立了门户
            const faction = mapMode === "territory" ? sectFaction.get(site.id) : undefined;
            return (
              <button
                key={site.id}
                type="button"
                title={`${site.name}${site.mine ? "（本门）" : ""} · ${site.seat}`}
                onPointerDown={(e) => e.stopPropagation()}
                // 点宗门是看它，不该在它身上又记一处预设点位
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={() => {
                  setSelectedId(null);
                  setSectSiteId(site.id);
                }}
                className="pointer-events-auto absolute flex items-center justify-center"
                style={{
                  left: point.x - SECT_HIT_SIZE / 2,
                  top: point.y - SECT_HIT_SIZE / 2,
                  width: SECT_HIT_SIZE,
                  height: SECT_HIT_SIZE,
                }}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-sm border font-brush text-[10px] leading-none shadow-[0_0_6px_rgba(0,0,0,0.85)]",
                    faction
                      ? "border-transparent text-ink-darkest"
                      : site.mine
                        ? "border-gold-300 bg-gold-500 text-ink-darkest"
                        : "border-cinnabar-400/80 bg-ink-900/85 text-cinnabar-300",
                    site.id === sectSiteId && "ring-2 ring-gold-400/80",
                  )}
                  style={{
                    width: SECT_MARK_SIZE,
                    height: SECT_MARK_SIZE,
                    ...(faction ? { backgroundColor: faction.color, borderColor: faction.color } : {}),
                  }}
                >
                  宗
                </span>
                <span
                  className="absolute top-full whitespace-nowrap font-brush text-[10px] leading-none text-cinnabar-200"
                  style={{
                    left: "50%",
                    transform: "translateX(-50%)",
                    textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)",
                  }}
                >
                  {site.name}
                </span>
              </button>
            );
          })}

        {/* 预设点位：为将来的宗门与秘境圈下的地方，只在开发者模式下画出来；
            已经开成宗门的那些不在这儿画，交给上面的宗门印 */}
        {freePresets.map((preset) => {
          const key = presetKey(preset);
          const point = projectToScreen(preset.x, preset.y);
          if (!point) return null;
          return (
            <button
              key={key}
              type="button"
              title={`预设点位 ${preset.x}, ${preset.y}`}
              onPointerDown={(e) => e.stopPropagation()}
              // 双击预设点位是看它，不该在它身上又记一处新的
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={() => {
                setSelectedId(null);
                setPresetSpawnNote("");
                setPresetKeyOpen(key);
              }}
              className="pointer-events-auto absolute flex items-center justify-center"
              style={{
                left: point.x - PRESET_HIT_SIZE / 2,
                top: point.y - PRESET_HIT_SIZE / 2,
                width: PRESET_HIT_SIZE,
                height: PRESET_HIT_SIZE,
              }}
            >
              {/* 只记位置，故不挂名目，一颗方子钉在图上便是 */}
              <span
                className={cn(
                  "block rotate-45 rounded-sm border border-dashed border-cinnabar-400 bg-ink-900/75 shadow-[0_0_6px_rgba(0,0,0,0.85)]",
                  key === presetKeyOpen && "ring-2 ring-gold-400/80",
                )}
                style={{ width: PRESET_MARK_SIZE - 4, height: PRESET_MARK_SIZE - 4 }}
              />
            </button>
          );
        })}

        {/* 奇遇：预设点位上开出来的野外去处，点开看它的名目，人在那一带便可入内 */}
        {(Array.isArray(adventures) ? adventures : [])
          .filter((a) => a.sceneId === scene.id)
          .map((a) => {
            const point = projectToScreen(a.x, a.y);
            if (!point) return null;
            const done = a.status === "done";
            return (
              <button
                key={a.id}
                type="button"
                title={`${a.name} · ${adventureWhere(a)}`}
                onPointerDown={(e) => e.stopPropagation()}
                // 双击奇遇是看它，不该在它身上又记一处预设点位
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={() => {
                  setSelectedId(null);
                  setSectSiteId(null);
                  setAdventureId(a.id);
                }}
                className="pointer-events-auto absolute flex items-center justify-center"
                style={{
                  left: point.x - ADV_HIT_SIZE / 2,
                  top: point.y - ADV_HIT_SIZE / 2,
                  width: ADV_HIT_SIZE,
                  height: ADV_HIT_SIZE,
                }}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full border font-brush text-[10px] leading-none shadow-[0_0_6px_rgba(0,0,0,0.85)]",
                    done
                      ? "border-gold-500/40 bg-ink-900/80 text-gold-400/70"
                      : "border-gold-200 bg-gold-500/90 text-ink-darkest",
                    a.id === adventureId && "ring-2 ring-gold-400/80",
                  )}
                  style={{ width: ADV_MARK_SIZE, height: ADV_MARK_SIZE }}
                >
                  遇
                </span>
                {questAdventureIds.has(a.id) && (
                  <span
                    className="absolute -top-1.5 -right-0.5 font-brush text-[12px] leading-none text-cinnabar-300"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.95)" }}
                  >
                    ★
                  </span>
                )}
                <span
                  className="absolute top-full whitespace-nowrap font-brush text-[10px] leading-none text-gold-200"
                  style={{
                    left: "50%",
                    transform: "translateX(-50%)",
                    textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)",
                  }}
                >
                  {a.name}
                </span>
              </button>
            );
          })}

        {/* 所在之地：脉冲光环 + 四向准星 + 人形徽章，一眼看出「你在这里」 */}
        {placePoint && (
          <div className="absolute" style={{ left: placePoint.x, top: placePoint.y }}>
            <span
              className="absolute block animate-mapPulse rounded-full border-2 border-jade-400/80 motion-reduce:animate-none"
              style={{ width: CURSOR_SIZE, height: CURSOR_SIZE, left: -CURSOR_SIZE / 2, top: -CURSOR_SIZE / 2 }}
            />
            <span
              className="absolute block animate-mapPulse rounded-full border-2 border-jade-400/50 motion-reduce:animate-none"
              style={{
                width: CURSOR_SIZE,
                height: CURSOR_SIZE,
                left: -CURSOR_SIZE / 2,
                top: -CURSOR_SIZE / 2,
                animationDelay: "1.2s",
              }}
            />
            {/* 四向准星：从徽章外侧伸出，标出精确落点 */}
            <span className="absolute block bg-jade-400/90" style={{ width: 8, height: 2, left: -CURSOR_SIZE / 2 - 6, top: -1 }} />
            <span className="absolute block bg-jade-400/90" style={{ width: 8, height: 2, left: CURSOR_SIZE / 2 - 2, top: -1 }} />
            <span className="absolute block bg-jade-400/90" style={{ width: 2, height: 8, left: -1, top: -CURSOR_SIZE / 2 - 6 }} />
            <span className="absolute block bg-jade-400/90" style={{ width: 2, height: 8, left: -1, top: CURSOR_SIZE / 2 - 2 }} />
            <span
              className="absolute flex items-center justify-center rounded-full border-2 border-paper-50 bg-jade-500 text-paper-50 shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
              style={{
                width: CURSOR_BADGE_SIZE,
                height: CURSOR_BADGE_SIZE,
                left: -CURSOR_BADGE_SIZE / 2,
                top: -CURSOR_BADGE_SIZE / 2,
              }}
            >
              <User size={17} strokeWidth={2.6} />
            </span>
            {/* 地名牌用深底浅字，落在任何地图底色上都看得清 */}
            <span
              className="absolute whitespace-nowrap rounded border border-jade-400/70 bg-ink-900/90 px-1.5 py-0.5 font-brush text-xs leading-none text-paper-50"
              style={{
                left: 0,
                bottom: CURSOR_SIZE / 2 + 10,
                transform: "translateX(-50%)",
                boxShadow: "0 1px 6px rgba(0,0,0,0.85)",
              }}
            >
              {cursorTitle}
            </span>
          </div>
        )}

        {canProbe && probePoint && (
          <span
            className="absolute rounded-full border-2 border-cinnabar-400 bg-cinnabar-500/40"
            style={{
              width: MARKER_DOT_SIZE,
              height: MARKER_DOT_SIZE,
              left: probePoint.x - MARKER_DOT_SIZE / 2,
              top: probePoint.y - MARKER_DOT_SIZE / 2,
            }}
          />
        )}
      </div>

      {/* 场景栏：内部地图可退回上位地图 */}
      <div
        className="absolute top-3 right-3 flex items-center gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="rounded border border-gold-500/30 bg-ink-900/85 px-3 py-1.5 font-serif text-xs text-paper-200 backdrop-blur-sm">
          {scene.name}
        </span>
        {/* 势力图：只在九州舆图上开，按所属门派给各处图标染色 */}
        {scene.kind === "world" && (
          <button
            type="button"
            onClick={() => setMapMode((m) => (m === "territory" ? "normal" : "territory"))}
            className={cn(
              "flex items-center gap-1.5 rounded border px-3 py-1.5 font-serif text-xs backdrop-blur-sm transition",
              mapMode === "territory"
                ? "border-aurora-gold bg-gold-500/25 text-gold-200"
                : "border-gold-500/30 bg-ink-900/85 text-paper-200 hover:border-gold-400/60 hover:text-gold-400",
            )}
            title="按所属门派给各处图标染色，名下缀明归属"
          >
            <Layers size={12} /> 势力范围
          </button>
        )}
        {parentScene && (
          <button
            type="button"
            onClick={exitScene}
            className="flex items-center gap-1.5 rounded border border-gold-500/30 bg-ink-900/85 px-3 py-1.5 font-serif text-xs text-paper-200 backdrop-blur-sm transition hover:border-gold-400/60 hover:text-gold-400"
            title={`返回${parentScene.name}`}
          >
            <ArrowLeft size={12} /> 返回{parentScene.name}
          </button>
        )}
        {townScene && (
          <button
            type="button"
            onClick={() => enterScene(townScene.id)}
            className="rounded border border-jade-400/60 bg-jade-500/90 px-3 py-1.5 font-serif text-xs text-paper-50 backdrop-blur-sm transition hover:border-jade-400/80 hover:bg-jade-500"
            title={`查看${place?.name}城内的布局`}
          >
            进入{place?.name}城图
          </button>
        )}
        {/* 开发者模式：直接切到某座城，省得为了看一张城图先去推演 */}
        {isDeveloperMode && (
          <select
            value=""
            onChange={(e) => e.target.value && devMoveTo(e.target.value)}
            title="开发者模式：直接把所在之地切到某座城或宗门"
            className="rounded border border-cinnabar-500/50 bg-ink-900/85 px-2 py-1.5 font-serif text-xs text-paper-200 backdrop-blur-sm outline-none transition hover:border-cinnabar-400/80"
          >
            <option value="">快速移动…</option>
            <optgroup label="城市">
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  编号 {c.id}｜{c.name}
                </option>
              ))}
            </optgroup>
            {sectSites.length > 0 && (
              <optgroup label="宗门">
                {sectSites.map((s) => (
                  <option key={s.id} value={`sect:${s.id}`}>
                    {s.name}
                    {s.mine ? "（本门）" : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        {/* 开发者工具入口，只在开发者模式下露出来 */}
        {isDeveloperMode && onOpenTileEditor && (
          <button
            type="button"
            onClick={onOpenTileEditor}
            className="flex items-center gap-1.5 rounded border border-gold-500/30 bg-ink-900/85 px-3 py-1.5 font-serif text-xs text-paper-200 backdrop-blur-sm transition hover:border-gold-400/60 hover:text-gold-400"
            title="可视化编辑城市瓦片地图"
          >
            <PencilRuler size={12} /> 城图编辑器
          </button>
        )}
        {/* 宗门图与城图是两套：宗门不按城那样一一对应，只作布局底子备着 */}
        {isDeveloperMode && onOpenSectEditor && (
          <button
            type="button"
            onClick={onOpenSectEditor}
            className="flex items-center gap-1.5 rounded border border-gold-500/30 bg-ink-900/85 px-3 py-1.5 font-serif text-xs text-paper-200 backdrop-blur-sm transition hover:border-gold-400/60 hover:text-gold-400"
            title="编辑宗门地图模板，只作布局底子，日后立宗门时挑一张来用"
          >
            <Landmark size={12} /> 宗门图编辑器
          </button>
        )}
        {/* 预设点位：为将来要开的宗门与秘境圈地方，只记位置，双击地图即可落一处。
            角上那个数说的是还空着几处——开成宗门的那些已经不算空地方了 */}
        {isDeveloperMode && (
          <button
            type="button"
            onClick={() => setPresetModalOpen(true)}
            className="flex items-center gap-1.5 rounded border border-cinnabar-500/50 bg-ink-900/85 px-3 py-1.5 font-serif text-xs text-paper-200 backdrop-blur-sm transition hover:border-cinnabar-400/80 hover:text-cinnabar-300"
            title="清点圈下的位置；在图上双击空处便能记下一处坐标"
          >
            <Flag size={12} /> 预设点位
            {presets.length > 0 && (
              <span className="font-number text-cinnabar-300/80">
                {freePresets.length}/{presets.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* 势力图图例：各家一色，附上所占处数 */}
      {mapMode === "territory" && scene.kind === "world" && (
        <div
          className="absolute bottom-3 right-3 w-64 max-h-[46vh] overflow-y-auto rounded-lg border border-gold-500/35 bg-ink-900/90 p-3 backdrop-blur-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center gap-1.5 font-brush text-sm text-gold-300">
            <Layers size={13} /> 势力范围
          </div>
          {territoryLegend.length === 0 ? (
            <p className="font-serif text-xs text-cinnabar-300 leading-relaxed">
              舆图上还没有立起门户，也无人占城据村。
            </p>
          ) : (
            <>
              <div className="space-y-1">
                {territoryLegend.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-sm border border-paper-400/30"
                      style={{ backgroundColor: f.color }}
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-serif text-xs",
                        f.mine ? "text-gold-300" : "text-paper-200",
                      )}
                    >
                      {f.label}
                    </span>
                    <span className="font-number text-[11px] text-paper-400/70">{f.holds} 处</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-serif text-[11px] text-paper-400/50 leading-relaxed">
                图标按所属门派染色，名下缀一行归属；无人占据的城村仍是原色。
              </p>
            </>
          )}
        </div>
      )}

      {plotOffer && (
        <div
          className="absolute bottom-3 left-3 w-72 rounded-lg border border-gold-500/35 bg-ink-900/90 p-3 backdrop-blur-sm"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-brush text-sm text-paper-50">置一处宅地</div>
              <div className="font-number text-xs text-paper-400/70">{plotOffer.label}</div>
            </div>
            <button
              type="button"
              onClick={() => setPlotOffer(null)}
              className="shrink-0 text-paper-400/60 transition hover:text-paper-100"
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-2 font-serif text-xs text-paper-300/80 leading-relaxed">
            买下这块空地，便可起一座 7×7 的宅邸，自建屋舍、自配功能。地价 {MANOR_PLOT_PRICE} 下品灵石。
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const plot = buyPlot({ place: plotOffer.label, cityId: place?.id, districtId: plotOffer.index });
                setPlotOffer(null);
                if (!plot) alert("灵石不够，买不下这块地。");
              }}
              className="rounded border border-jade-400/60 bg-jade-500/90 px-3 py-1.5 font-serif text-xs text-paper-50 transition hover:border-jade-400/80 hover:bg-jade-500"
            >
              买下（{MANOR_PLOT_PRICE}）
            </button>
          </div>
        </div>
      )}

      {/* 点开的那一处位置：只记位置，故这儿也只报坐标，另给一个抹掉的去处 */}
      {openPreset && (
        <div
          className="absolute bottom-3 left-3 w-72 rounded-lg border border-cinnabar-500/35 bg-ink-900/90 p-3 backdrop-blur-sm"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-brush text-sm text-paper-50">预设点位</div>
              <div className="font-number text-xs text-paper-400/60">
                {scene.name} · {openPreset.x}, {openPreset.y}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPresetKeyOpen(null)}
              className="shrink-0 text-paper-400/60 transition hover:text-paper-100"
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {openPreset.source === "local" ? (
              <button
                type="button"
                onClick={() => dropPreset(presetKey(openPreset))}
                className="flex items-center gap-1.5 rounded border border-cinnabar-500/40 px-3 py-1.5 font-serif text-xs text-cinnabar-400 transition hover:border-cinnabar-400/70"
              >
                <Trash2 size={12} /> 抹掉这一处
              </button>
            ) : (
              <span className="font-serif text-xs text-paper-400/60">
                随 presets.json 发下来的，要改请改文件
              </span>
            )}
          </div>

          {/* 开发者模式：就在这一处点位上现掷一桩奇遇，落位与内容都交给天意 */}
          {isDeveloperMode && (
            <div className="mt-3 border-t border-gold-500/20 pt-3">
              <button
                type="button"
                disabled={presetTaken || presetSpawning}
                onClick={() => void spawnHere(openPreset)}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded border px-3 py-1.5 font-serif text-xs transition",
                  presetTaken || presetSpawning
                    ? "border-paper-400/15 text-paper-400/40"
                    : "border-gold-500/45 bg-gold-500/15 text-gold-300 hover:bg-gold-500/25",
                )}
              >
                <Sparkles size={12} />
                {presetSpawning ? "现掷中……" : presetTaken ? "此处已被占" : "在此现掷一处奇遇"}
              </button>
              {presetTaken && (
                <p className="mt-1.5 font-serif text-[11px] leading-relaxed text-paper-400/50">
                  这一处已立着宗门或别的奇遇，须另择一处空位。
                </p>
              )}
              {presetSpawnNote && (
                <p className="mt-1.5 font-serif text-[11px] leading-relaxed text-gold-300/80">{presetSpawnNote}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 标点信息 */}
      {selected && (
        <div
          className="absolute bottom-3 left-3 w-72 rounded-lg border border-gold-500/30 bg-ink-900/90 p-3 backdrop-blur-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-brush text-sm text-paper-50">{selected.name}</div>
              <div className="font-serif text-xs text-paper-400/60">
                {MARKER_KIND_NAMES[selected.kind]}
              </div>
              {selectedOccupation && (
                <div className="mt-0.5 font-serif text-xs text-gold-400/80">
                  已归「{selectedOccupation.ownerName}」治下 · 月贡 {occupationTribute("city", selected.id)} 灵石
                </div>
              )}
              {selectedGovernor && (
                <div className="mt-0.5 font-serif text-xs text-paper-400/70">
                  驻城{selectedGovernor.title}：{selectedGovernor.name}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="shrink-0 text-paper-400/60 transition hover:text-paper-100"
              title="关闭"
            >
              <X size={14} />
            </button>
          </div>

          {selected.desc && (
            <p className="mt-2 font-serif text-xs text-paper-300/80">{selected.desc}</p>
          )}

          {/* 位置只由叙事推动，地图上不设瞬移入口 */}
          <div className="mt-3 flex items-center gap-2">
            {selected.id === currentPlaceId ? (
              <span className="flex items-center gap-1.5 font-serif text-xs text-gold-300">
                <User size={13} /> 你正身处此地
              </span>
            ) : (
              <span className="font-serif text-xs text-paper-400/60">
                欲往此处，需在问道中付诸行动
              </span>
            )}
            {canEnter && (
              <button
                type="button"
                onClick={() => {
                  const town = getTownScene(selected.id);
                  if (town) enterScene(town.id);
                }}
                className="rounded border border-jade-400/60 bg-jade-500/90 px-3 py-1.5 font-serif text-xs text-paper-50 transition hover:border-jade-400/80 hover:bg-jade-500"
              >
                进入城图
              </button>
            )}
          </div>
        </div>
      )}

      {/* 点开的是哪一处宗门，就把它的名号与词条摊在这儿；进了山门图便收起，免得压在图上 */}
      {openSectSite && !selected && scene.kind !== "sect" && (
        <div className="absolute bottom-3 left-3">
          <SectSiteCard site={openSectSite} onClose={() => setSectSiteId(null)} />
        </div>
      )}

      {/* 点开的是哪一处奇遇，就把它的名目摊在这儿；人在那一带便可入内 */}
      {openAdventureItem && !selected && !openSectSite && scene.kind !== "sect" && (
        <div
          className="absolute bottom-3 left-3 w-80 rounded-lg border border-gold-500/30 bg-ink-900/90 p-3 backdrop-blur-sm"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-brush text-sm text-paper-50">{openAdventureItem.name}</span>
                <span className="font-serif text-[11px] text-gold-400/70">
                  {openAdventureItem.kind} · 凶险{dangerLabel(openAdventureItem.danger)}
                </span>
              </div>
              <div className="mt-0.5 font-serif text-[11px] text-paper-400/60">
                在{adventureWhere(openAdventureItem)}
                {openAdventureItem.persistent ? " · 常设" : ""}
                {openAdventureItem.status === "done" ? " · 已了结" : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAdventureId(null)}
              className="shrink-0 text-paper-400/60 transition hover:text-paper-100"
              title="关闭"
            >
              <X size={14} />
            </button>
          </div>

          {openAdventureItem.summary && (
            <p className="mt-2 font-serif text-xs leading-relaxed text-paper-300/80">{openAdventureItem.summary}</p>
          )}

          {(openAdventureItem.reward || openAdventureItem.penalty) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-serif text-[11px]">
              {openAdventureItem.reward && <span className="text-jade-400/80">可图：{openAdventureItem.reward}</span>}
              {openAdventureItem.penalty && (
                <span className="text-cinnabar-300/80">凶险：{openAdventureItem.penalty}</span>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            {adventureEnterable(openAdventureItem, { currentAdventureId }) ? (
              <button
                type="button"
                onClick={() => {
                  const id = openAdventureItem.id;
                  setAdventureId(null);
                  void openAdventure(id);
                }}
                className="rounded border border-jade-400/60 bg-jade-500/90 px-3 py-1.5 font-serif text-xs text-paper-50 transition hover:border-jade-400/80 hover:bg-jade-500"
              >
                入内探看
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const id = openAdventureItem.id;
                    setAdventureId(null);
                    void travelToAdventure(id);
                  }}
                  className="rounded border border-gold-500/50 bg-ink-800/80 px-3 py-1.5 font-serif text-xs text-gold-200 transition hover:border-gold-400/80 hover:bg-ink-700/80"
                >
                  前往此处
                </button>
                <span className="font-serif text-[11px] leading-relaxed text-paper-400/60">须亲至该处方可入内。</span>
              </>
            )}
          </div>
        </div>
      )}

      {canProbe && probe && (
        <div className="pointer-events-none absolute top-3 left-3 rounded border border-gold-500/30 bg-ink-900/85 px-3 py-2 backdrop-blur-sm font-number text-xs leading-relaxed">
          <div className="flex items-center gap-2">
            <span className="text-paper-400/60">原图坐标</span>
            <span className="text-gold-400">
              {Math.round(probe.nx)}, {Math.round(probe.ny)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-paper-400/60">占比</span>
            <span className="text-paper-200">
              {((probe.nx / base.w) * 100).toFixed(1)}%, {((probe.ny / base.h) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-paper-400/60">图幅</span>
            <span className="text-paper-400/70">
              {base.w} × {base.h}
            </span>
          </div>
        </div>
      )}

      {/* 进村：无舆图，点开的即是村中情形 */}
      {villageKey && villages[villageKey] && (
        <VillagePanel village={villages[villageKey]} onClose={() => setVillageKey(null)} />
      )}

      {/* 官府与寺观：常设界面未成，改由玩家自述行动、照此写一段 */}
      {closedPlace && <ClosedPlaceModal {...closedPlace} onClose={() => setClosedPlace(null)} />}

      <PresetPointModal
        open={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        onChanged={refreshPresets}
      />
    </div>
  );
}
