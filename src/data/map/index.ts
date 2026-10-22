import type { ManorCell, MapMarker, MapMarkerKind, MapScene, MapSceneKind, ManorPlot, PresetPoint, SectMapTemplate, SectSite, TileMapEntry } from "@/data/types";
import { MANOR_GRID } from "@/data/types";
import { BLOCK_TILE, EMPTY_TILE, ROAD_TILE, TILE_GRID_SIZE, hasAnyTile, normalizeDistricts, normalizeTiles, reconcileDistricts } from "./tiles";
import type { District, DistrictNature } from "./tiles";
import { SECT_GRID_SIZE, SECT_EMPTY_TILE, SECT_HALL_TILE, isSectBuildingTile } from "./sectTiles";
import { SECT_LEVEL_MAX } from "@/data/sects";
import {
  clearLocalPresets,
  mergePresets,
  normalizePresets,
  presetExportJson,
  presetKey,
  readLocalPresets,
  writeLocalPresets,
} from "./presets";
import {
  LOCAL_SECT_MAPS_KEY,
  clearLocalSectMaps,
  mergeSectTemplates,
  normalizeSectTemplates,
  readLocalSectMaps,
  writeLocalSectMaps,
} from "./sectMaps";

/**
 * 地图数据层。数据不在代码里，而是启动时从 game_data/ 与 image_assets/ 现读，
 * 改完文件刷新浏览器即可生效，不必重新构建。
 *
 * 六份 JSON 各管一件事，新增地图只动数据、不动渲染代码：
 * - scenes.json      地图场景，含主图路径、父级场景与坐标系基准尺寸
 * - cities.json      城市标点，编号 + 名称 + 文化背景 + 世界地图坐标，原点左上
 * - landmarks.json   其他地标标点，结构与城市一致，可写 kind 覆盖默认的 landmark
 * - presets.json     预设点位，为还没开出来的宗门与秘境圈下地方，只记位置（见 ./presets.ts）
 * - sectMaps.json    宗门地图模板，只作布局底子，不与哪座宗门一一对应（见 ./sectMaps.ts）
 * - tileMaps/index.json  城图清单，列出目前有哪些编号的城图
 * - tileMaps/<编号>.json 一城一份城图，文件名即标点编号：tiles 为 10×10 的格子编号，
 *                    bg 为背景底图类型（可缺省），districts 为建筑街区明细
 *                    （与编号 5 的格子一一对应，按行优先顺序排列，
 *                    字段为 id／name／nature／slots）
 *                    还没画的城不放文件，也就不在舆图上出现可进入的入口
 * - backgrounds.json 背景底图类型 → 图片路径，城图底图与编辑器下拉都按它取图
 *
 * 城市与地图一律以编号对应：改名不会让地图失联，也不会让存档里的所在地失效。
 *
 * 两张地图的接入方式不同：
 * - 手绘地图：图片放进项目目录，把相对路径写进 scenes.json 的 image
 * - 瓦片地图：用游戏内开发者工具画好导出，放进 tileMaps/ 并在 index.json 里登记编号即可，
 *   只要标点编号在地图文件里出现，该城市就自动获得「进入城图」入口
 */

export const WORLD_SCENE_ID = "world";

/** 城市瓦片地图的场景 id 前缀，后面接标点编号 */
const TOWN_SCENE_PREFIX = "town-";

/** 城图目录，一城一份文件，文件名即标点编号 */
const TILE_MAP_DIR = "game_data/tileMaps";

/** 编辑器把成果暂存在这里，读取时优先于仓库里的 JSON */
const LOCAL_TILE_MAPS_KEY = "xiuxian-tile-maps";

/**
 * 运行时数据的 URL 前缀。本地服务把 /game/ 映射到项目根目录，改文件刷新即生效；
 * 构建产物里则是构建时复制进来的一份拷贝。
 */
const DATA_ROOT = new URL("game/", document.baseURI).href;

/** 把项目内的相对路径转成可取的 URL，中文目录名一并转义 */
export function assetUrl(relativePath: string): string {
  return DATA_ROOT + relativePath.split("/").map(encodeURIComponent).join("/");
}

const SCENE_KINDS: MapSceneKind[] = ["world", "town", "sect", "dungeon"];
const MARKER_KINDS: MapMarkerKind[] = ["city", "landmark", "portal", "npc"];

/** JSON 手写字段一律宽松读入，缺字段或写错类型都当作没有 */
interface RawScene {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  image?: unknown;
  parentId?: unknown;
  width?: unknown;
  height?: unknown;
}

interface RawMarker {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  culture?: unknown;
  sceneId?: unknown;
  x?: unknown;
  y?: unknown;
  desc?: unknown;
}

const hasKind = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

const toFinite = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

const asArray = (data: unknown): unknown[] => (Array.isArray(data) ? data : []);

/** 场景表；字段不全的条目直接丢掉，避免渲染时拿到坏数据 */
function normalizeScenes(data: unknown): MapScene[] {
  return asArray(data)
    .filter((s): s is RawScene => !!s && typeof (s as RawScene).id === "string")
    .map((s) => ({
      id: s.id as string,
      name: typeof s.name === "string" && s.name ? s.name : (s.id as string),
      kind: hasKind(SCENE_KINDS, s.kind) ? s.kind : "world",
      image: typeof s.image === "string" ? s.image : "",
      parentId: typeof s.parentId === "string" ? s.parentId : null,
      width: toFinite(s.width) > 0 ? toFinite(s.width) : 1536,
      height: toFinite(s.height) > 0 ? toFinite(s.height) : 1024,
    }));
}

/** 归一化一条标点；defaultKind 由数据来源决定，条目自身写了 kind 则以它为准 */
function normalizeMarker(item: RawMarker, defaultKind: MapMarkerKind): MapMarker | null {
  const x = toFinite(item.x);
  const y = toFinite(item.y);
  if (typeof item.id !== "string" || typeof item.name !== "string" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    id: item.id,
    name: item.name,
    kind: hasKind(MARKER_KINDS, item.kind) ? item.kind : defaultKind,
    // 文化背景只作字符串读取，新增地域名不必改代码
    culture: typeof item.culture === "string" && item.culture.trim() ? item.culture.trim() : undefined,
    sceneId: typeof item.sceneId === "string" ? item.sceneId : WORLD_SCENE_ID,
    x,
    y,
    desc: typeof item.desc === "string" ? item.desc : undefined,
  };
}

/** 城市与其他地标合在一张表里，按编号去重 */
function normalizeMarkers(cities: unknown, landmarks: unknown): MapMarker[] {
  const merged = [
    ...asArray(cities).map((m) => normalizeMarker(m as RawMarker, "city")),
    ...asArray(landmarks).map((m) => normalizeMarker(m as RawMarker, "landmark")),
  ].filter((m): m is MapMarker => m !== null);

  const seen = new Set<string>();
  return merged.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

/** 归一化背景底图表；只收「类型名 → 路径」这种成对写法 */
function normalizeBackgrounds(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const table: Record<string, string> = {};
  for (const [type, path] of Object.entries(data as Record<string, unknown>)) {
    if (type && typeof path === "string" && path) table[type] = path;
  }
  return table;
}

/** 归一化瓦片地图列表；脏编号归零，空图也丢掉 */
function normalizeTileMaps(data: unknown, backgrounds: Record<string, string>): TileMapEntry[] {
  return asArray(data)
    .filter((m): m is { id: string } => !!m && typeof (m as TileMapEntry).id === "string")
    .map((m) => {
      const raw = m as { id: string; bg?: unknown; tiles?: unknown; districts?: unknown };
      const bg = typeof raw.bg === "string" && backgrounds[raw.bg.trim()] ? raw.bg.trim() : undefined;
      return {
        id: raw.id,
        bg,
        tiles: normalizeTiles(raw.tiles),
        districts: normalizeDistricts(raw.districts),
      };
    })
    .filter((m) => hasAnyTile(m.tiles) || !!m.bg);
}

/**
 * 编辑器暂存下来的地块，只取地块本身。
 * 背景与街区明细一律以仓库文件为准——编辑器的暂存若连它们一起盖住，
 * 早先存的旧版就会把后来新增的字段整段抹掉，地图上自然少一块东西。
 */
function readLocalTiles(): Map<string, number[]> {
  try {
    const raw = localStorage.getItem(LOCAL_TILE_MAPS_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as { maps?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return new Map();
    return new Map(
      asArray(parsed.maps)
        .filter((m): m is { id: string } => !!m && typeof (m as { id?: unknown }).id === "string")
        .map((m) => [m.id, normalizeTiles((m as { tiles?: unknown }).tiles)]),
    );
  } catch {
    return new Map();
  }
}

/**
 * 把编辑器暂存叠到仓库数据上：暂存只改地块，其余字段照用文件里的。
 * 文件里还没有的城市，只要本地画过也一并收进来，方便画完再落成文件。
 * 最后统一对一遍街区明细，保证每个建筑街区格都有对应的一条。
 */
function mergeLocalTiles(fromFiles: TileMapEntry[], localTiles: Map<string, number[]>): TileMapEntry[] {
  const merged = fromFiles.map((m) => {
    const tiles = localTiles.get(m.id);
    return tiles ? { ...m, tiles } : m;
  });
  for (const [id, tiles] of localTiles) {
    if (!merged.some((m) => m.id === id) && hasAnyTile(tiles)) {
      merged.push({ id, tiles, districts: [] });
    }
  }
  return merged.map((m) => ({ ...m, districts: reconcileDistricts(m.tiles, m.districts ?? []) }));
}

/**
 * 预设点位：随游戏发出去的那一份在 game_data/presets.json，
 * 开发者模式双击地图添的存在浏览器本地，两份按编号叠合，编号相同以本地的为准。
 */
let filePresets: PresetPoint[] = [];
let localPresets: PresetPoint[] = [];
let presetPoints: PresetPoint[] = [];

function refreshPresets(): void {
  presetPoints = mergePresets(filePresets, localPresets);
}

/** 载入 preset 数据；文件读不到只是这一份没有，不该拖住整个启动 */
function initPresets(fileData: unknown): void {
  filePresets = normalizePresets(fileData, WORLD_SCENE_ID);
  localPresets = readLocalPresets();
  refreshPresets();
}

/**
 * 宗门地图模板：随游戏发出去的那一份在 game_data/sectMaps.json，
 * 编辑器里改的存在浏览器本地，两份按编号叠合，编号相同以本地的为准。
 */
let fileSectMaps: SectMapTemplate[] = [];
let localSectMaps: SectMapTemplate[] = [];
let sectMaps: SectMapTemplate[] = [];

function refreshSectMaps(): void {
  sectMaps = mergeSectTemplates(fileSectMaps, localSectMaps);
}

/** 载入宗门图模板；文件读不到只是这一份没有，不该拖住整个启动 */
function initSectMaps(fileData: unknown): void {
  fileSectMaps = normalizeSectTemplates(fileData);
  localSectMaps = readLocalSectMaps();
  refreshSectMaps();
}

interface MapRegistry {
  markers: MapMarker[];
  scenes: MapScene[];
  backgrounds: Record<string, string>;
  tileMaps: TileMapEntry[];
  markerById: Map<string, MapMarker>;
  markerByName: Map<string, MapMarker>;
  sceneById: Map<string, MapScene>;
}

const EMPTY_REGISTRY: MapRegistry = {
  markers: [],
  scenes: [],
  backgrounds: {},
  tileMaps: [],
  markerById: new Map(),
  markerByName: new Map(),
  sceneById: new Map(),
};

let registry: MapRegistry = EMPTY_REGISTRY;

/** 组装注册表：城市场景由瓦片地图合成，只给画过地块的城市生成 */
function buildRegistry(raw: {
  scenes: unknown;
  cities: unknown;
  landmarks: unknown;
  tileMaps: unknown;
  backgrounds: unknown;
}): MapRegistry {
  const backgrounds = normalizeBackgrounds(raw.backgrounds);
  const markers = normalizeMarkers(raw.cities, raw.landmarks);
  const sourceScenes = normalizeScenes(raw.scenes);
  const tileMaps = mergeLocalTiles(normalizeTileMaps(raw.tileMaps, backgrounds), readLocalTiles());
  const tileMapById = new Map(tileMaps.map((m) => [m.id, m]));

  const townScenes: MapScene[] = markers
    .filter((m) => {
      const entry = tileMapById.get(m.id);
      return !!entry && hasAnyTile(entry.tiles);
    })
    .map((m) => {
      const entry = tileMapById.get(m.id)!;
      return {
        id: `${TOWN_SCENE_PREFIX}${m.id}`,
        name: `${m.name}城图`,
        kind: "town" as const,
        image: "",
        parentId: WORLD_SCENE_ID,
        width: TILE_GRID_SIZE,
        height: TILE_GRID_SIZE,
        tiles: entry.tiles,
        bg: entry.bg,
        culture: m.culture,
        districts: entry.districts,
      };
    });

  const scenes = [...sourceScenes, ...townScenes];
  return {
    markers,
    scenes,
    backgrounds,
    tileMaps,
    markerById: new Map(markers.map((m) => [m.id, m])),
    markerByName: new Map(markers.map((m) => [m.name, m])),
    sceneById: new Map(scenes.map((s) => [s.id, s])),
  };
}

/** 数据还没载入时的兜底世界地图，避免界面因取不到场景而整块空掉 */
const FALLBACK_WORLD_SCENE: MapScene = {
  id: WORLD_SCENE_ID,
  name: "九州舆图",
  kind: "world",
  image: "",
  parentId: null,
  width: 1536,
  height: 1024,
};

async function fetchJson(relativePath: string): Promise<unknown> {
  const res = await fetch(assetUrl(relativePath), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${relativePath} 读取失败：HTTP ${res.status}`);
  return res.json();
}

/**
 * 城图按编号一城一份，清单 index.json 列出目前有哪些。
 * 某一份读不到只跳过那一座城，不让一张缺图把整局数据卡死。
 */
async function loadTileMaps(manifest: unknown): Promise<unknown[]> {
  const ids = asArray(manifest).filter(
    (id): id is string => typeof id === "string" && !!id.trim(),
  );
  const files = await Promise.all(
    ids.map((id) =>
      fetchJson(`${TILE_MAP_DIR}/${id.trim()}.json`).catch((err) => {
        console.warn(`[map] 城图 ${id} 读取失败，已跳过：`, err);
        return null;
      }),
    ),
  );
  return files.filter((file) => file !== null);
}

/**
 * 启动时读入全部地图数据。清单与索引文件缺一不可，
 * 读不到就抛错，由启动页把原因显示出来，而不是让界面带着空数据跑。
 */
export async function loadGameData(): Promise<void> {
  const [scenes, cities, landmarks, backgrounds, mapIndex, presets, sectMapsData] = await Promise.all([
    fetchJson("game_data/scenes.json"),
    fetchJson("game_data/cities.json"),
    fetchJson("game_data/landmarks.json"),
    fetchJson("game_data/backgrounds.json"),
    fetchJson(`${TILE_MAP_DIR}/index.json`),
    // 预设点位与宗门图模板都是后加的：老版本没有这两份文件也不该起不来
    fetchJson("game_data/presets.json").catch(() => null),
    fetchJson("game_data/sectMaps.json").catch(() => null),
  ]);
  const tileMaps = await loadTileMaps(mapIndex);
  registry = buildRegistry({ scenes, cities, landmarks, tileMaps, backgrounds });
  initPresets(presets);
  initSectMaps(sectMapsData);
}

// ---------------- 读取接口 ----------------

export function getScene(sceneId: string): MapScene | undefined {
  return registry.sceneById.get(sceneId);
}

export function getWorldScene(): MapScene {
  return registry.sceneById.get(WORLD_SCENE_ID) ?? FALLBACK_WORLD_SCENE;
}

export function getMarker(markerId: string): MapMarker | undefined {
  // 标点表以字符串为键；旧存档里若有被折成数字的编号，这里一并认下
  return registry.markerById.get(markerId) ?? registry.markerById.get(String(markerId));
}

/** 全部标点 */
export function getMarkers(): MapMarker[] {
  return registry.markers;
}

/** 全部城市标点，编辑器与下拉列表用 */
export function getCityMarkers(): MapMarker[] {
  return registry.markers.filter((m) => m.kind === "city");
}

/** 场景主图 URL；没写图片的场景返回 undefined */
export function getSceneImage(scene: MapScene): string | undefined {
  return scene.image ? assetUrl(scene.image) : undefined;
}

/** 背景底图类型清单 */
export function getBackgroundTypes(): string[] {
  return Object.keys(registry.backgrounds).sort();
}

/** 按类型取底图 URL；认不出的类型返回 undefined，渲染时退化成纯色底 */
export function getBackgroundImage(type: unknown): string | undefined {
  if (typeof type !== "string") return undefined;
  const path = registry.backgrounds[type];
  return path ? assetUrl(path) : undefined;
}

/** 某标点对应的城市场景；没有瓦片地图则没有 */
export function getTownScene(markerId: string): MapScene | undefined {
  return registry.sceneById.get(`${TOWN_SCENE_PREFIX}${markerId}`);
}

/** 某城的建筑街区明细；没画过则返回空数组 */
export function getDistricts(markerId: string): District[] {
  return registry.tileMaps.find((m) => m.id === markerId)?.districts ?? [];
}

/** 某场景内的标点 */
export function getSceneMarkers(sceneId: string): MapMarker[] {
  return registry.markers.filter((m) => m.sceneId === sceneId);
}

// ---------------- 城图贴图 ----------------

/**
 * 贴图按「族名_地域」命名，分两个目录：
 * - 建筑贴图/民居|坊市|作坊|宗教|官署|街区_<地域>.jpg
 * - 地形贴图/山地|森林|水面_<地域>.jpg
 * 只按命名约定拼路径，不另维护清单，往目录里丢图就能用；
 * 取不到图时渲染侧会退回地块色块，所以拼错或漏图不会留下破图。
 */

/** 街区性质 → 建筑贴图族；平民住宅成片铺街区图，大户人家还是独门独院用民居图 */
const DISTRICT_TEXTURE: Record<DistrictNature, string> = {
  平民住宅: "街区",
  大户住宅: "民居",
  坊市: "坊市",
  匠人区: "作坊",
  宗教场所: "宗教",
  政府部门: "官署",
};

/** 地块编号 → 地形贴图族；街道与河流暂无贴图，留色块 */
const TERRAIN_TEXTURE: Record<number, string> = {
  0: "空地",
  3: "水面",
  4: "山地",
  6: "森林",
};

/** 少数贴图族分 A/B 两张，文件名后缀跟着换；按格子位置定选哪张，免得整片街区一个样 */
const TEXTURE_VARIANTS: Record<string, string[]> = {
  街区: ["_A", "_B"],
};

function textureUrl(
  dir: string,
  family: string,
  culture: string | undefined,
  seed: number,
): string | undefined {
  if (!culture) return undefined;
  const variants = TEXTURE_VARIANTS[family];
  const suffix = variants ? variants[seed % variants.length] : "";
  return assetUrl(`image_assets/${dir}/${family}_${culture}${suffix}.jpg`);
}

/**
 * 一格的贴图：建筑街区格按该处街区的性质取建筑贴图，其余地块取地形贴图。
 * 没配图的地块返回 undefined，渲染时保留地块本身的颜色。
 * seed 传格子序号，供分张的贴图族挑图。
 */
export function getTileTexture(
  code: number,
  nature: DistrictNature | undefined,
  culture: string | undefined,
  seed = 0,
): string | undefined {
  if (code === BLOCK_TILE) {
    const family = nature ? DISTRICT_TEXTURE[nature] : undefined;
    return family ? textureUrl("建筑贴图", family, culture, seed) : undefined;
  }
  const family = TERRAIN_TEXTURE[code];
  return family ? textureUrl("地形贴图", family, culture, seed) : undefined;
}

/** 开局所在地点：长安；认名字而不是认编号，重排编号也不会跑偏 */
export function getDefaultPlaceId(): string {
  return registry.markerByName.get("长安")?.id ?? registry.markers[0]?.id ?? "";
}

/**
 * 按编号或地名解析标点，供叙事回写所在地用。
 * 只认地图上已有的地点：认不出就返回 undefined，调用方据此丢弃这次移动，
 * 以免模型编出「洛阳」这种图上没有的地方把光标顶到空处。
 */
export function resolveMarker(value: unknown): MapMarker | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/[「」『』"'“”\s]/g, "");
  if (!text) return undefined;

  const exact = registry.markerById.get(text) ?? registry.markerByName.get(text);
  if (exact) return exact;
  // 「长安城」「金陵府」这类带后缀的写法，用已有地名做前缀匹配
  return registry.markers.find((m) => text.startsWith(m.name));
}

/**
 * 从一段文字里认出最先提到的舆图地点，城池优先。
 * 开局择地时用它兜底：开篇照理会起笔便写清身在何处，先出现的城池便是落脚之地；
 * 一处城池都没提到，再退而认最先出现的地标。
 */
export function findFirstMarkerInText(text: string): MapMarker | undefined {
  if (!text) return undefined;
  const earliest = (list: MapMarker[]) => {
    let best: { marker: MapMarker; at: number } | undefined;
    for (const m of list) {
      const at = text.indexOf(m.name);
      if (at === -1) continue;
      if (!best || at < best.at) best = { marker: m, at };
    }
    return best?.marker;
  };
  return earliest(registry.markers.filter((m) => m.kind === "city")) ?? earliest(registry.markers);
}

// ---------------- 编辑器的本地暂存 ----------------

/** 编辑器的工作副本；在它之上涂改，保存时整份写回，避免半途把别的城市覆盖掉 */
export function loadEditableTileMaps(): TileMapEntry[] {
  return registry.tileMaps.map((m) => ({
    id: m.id,
    bg: m.bg,
    tiles: [...m.tiles],
    // 街区明细编辑器不改，但要原样带着走，否则自动保存会把它整段抹掉
    districts: m.districts?.map((d) => ({ ...d })),
  }));
}

export function saveLocalTileMaps(maps: TileMapEntry[]): void {
  localStorage.setItem(LOCAL_TILE_MAPS_KEY, JSON.stringify({ version: 1, maps }));
}

export function clearLocalTileMaps(): void {
  localStorage.removeItem(LOCAL_TILE_MAPS_KEY);
}

/** 本地是否存着编辑器覆盖过的一版地图 */
export function hasLocalTileMaps(): boolean {
  return localStorage.getItem(LOCAL_TILE_MAPS_KEY) !== null;
}

// ---------------- 预设点位 ----------------

/** 全部预设点位；同一处以开发者现点的那一份为准 */
export function getPresetPoints(): PresetPoint[] {
  return presetPoints;
}

/** 某张图上圈下的预设点位 */
export function getScenePresetPoints(sceneId: string): PresetPoint[] {
  return presetPoints.filter((p) => p.sceneId === sceneId);
}

/** 本地是否点过预设点位 */
export function hasLocalPresetPoints(): boolean {
  return localPresets.length > 0;
}

/** 导出的 presets.json 正文，落盘覆盖 game_data/presets.json 才算长期生效 */
export function presetPointsExportJson(): string {
  return presetExportJson(presetPoints);
}

/**
 * 记下一处位置。位置本身就是这一处的身份，同一个地方点两回只算一处，
 * 已有的话原样把那一处交回去。
 * 记下来的先存浏览器本地，立刻就在图上看得见；要随游戏发出去得导出落盘。
 */
export function addPresetPoint(input: { sceneId: string; x: number; y: number }): PresetPoint {
  const point: PresetPoint = {
    sceneId: input.sceneId,
    x: Math.round(input.x),
    y: Math.round(input.y),
    source: "local",
  };
  const key = presetKey(point);
  const existing = presetPoints.find((p) => presetKey(p) === key);
  if (existing) return existing;

  localPresets = [...localPresets, point];
  writeLocalPresets(localPresets);
  refreshPresets();
  return point;
}

/** 抹掉一处现点的位置；随文件来的那一份要改就去改 presets.json */
export function removePresetPoint(key: string): boolean {
  const next = localPresets.filter((p) => presetKey(p) !== key);
  if (next.length === localPresets.length) return false;
  localPresets = next;
  writeLocalPresets(localPresets);
  refreshPresets();
  return true;
}

/** 丢掉全部本地暂存的位置，回到 presets.json 的版本 */
export function clearLocalPresetPoints(): void {
  localPresets = [];
  clearLocalPresets();
  refreshPresets();
}

// ---------------- 宗门地图模板 ----------------

/**
 * 眼下认的全部宗门图模板：仓库里的那一份与本地暂存的叠在一起。
 * 宗门还不与哪张图一一对应，故只按模板自己的编号相认。
 */
export function getSectMapTemplates(): SectMapTemplate[] {
  return sectMaps;
}

/** 本地是否存着编辑器改过的宗门图 */
export function hasLocalSectMaps(): boolean {
  return localStorage.getItem(LOCAL_SECT_MAPS_KEY) !== null;
}

/** 编辑器把草稿写回浏览器本地，收起页面也不丢；刷新以应用让这一局立刻用上 */
export function saveLocalSectMaps(templates: SectMapTemplate[]): void {
  localSectMaps = normalizeSectTemplates(templates);
  writeLocalSectMaps(localSectMaps);
  refreshSectMaps();
}

/** 丢掉本地暂存，回到 sectMaps.json 的版本 */
export function discardLocalSectMaps(): void {
  localSectMaps = [];
  clearLocalSectMaps();
  refreshSectMaps();
}

// ---------------- 宗门场景 ----------------

/** 宗门场景 id 前缀，后面接宗门点位编号 */
export const SECT_SCENE_PREFIX = "sect-";

/** 按点位编号取它那张宗门图的场景 id */
export function sectSceneId(siteId: string): string {
  return `${SECT_SCENE_PREFIX}${siteId}`;
}

/** 给一处宗门挑一张模板：点名的那张没有，就照地势挑，再没有随便给一张 */
function pickSectTemplate(site: SectSite): SectMapTemplate | undefined {
  if (sectMaps.length === 0) return undefined;
  if (site.templateId) {
    const exact = sectMaps.find((t) => t.id === site.templateId);
    if (exact) return exact;
  }
  const byType = sectMaps.find((t) => t.mapType && t.mapType === site.mapType);
  return byType ?? sectMaps[0];
}

/** 由点位编号算一个种子：同一处宗门，每次读档/注册都得到同一副布局 */
function sectTileSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 照种子往下淌的伪随机数；同一种子出的数一贯，不必引别家的库 */
function seededRand(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * 照宗门等级把模板上的建筑削一遍：每比满级低一级，便少留一分建筑，削掉的换回荒地。
 * 主殿始终留着；等级在 0 及以下时只余主殿。水域、山地、荒地这些地势一概不动。
 * 种子取自点位编号，故同一处宗门每次注册得来的都是同一副布局，刷新地图也不会变。
 */
function thinSectTilesByLevel(site: SectSite, tiles: number[]): number[] {
  const out = [...tiles];
  const level = Math.max(0, Math.min(SECT_LEVEL_MAX, Math.trunc(Number(site.level) || 0)));
  if (level >= SECT_LEVEL_MAX) return out;

  // 除主殿外的建筑格，挑出来照种子择留
  const pool = out
    .map((code, i) => (isSectBuildingTile(code) && code !== SECT_HALL_TILE ? i : -1))
    .filter((i) => i >= 0);

  // 尚未入品的一处（如新开之山门）：只余一座主殿。
  // 模板上有把主殿画成两三格的，这里也只留头一格，其余殿宇与别的建筑一概抹去。
  if (level <= 0) {
    const halls = out
      .map((code, i) => (code === SECT_HALL_TILE ? i : -1))
      .filter((i) => i >= 0);
    [...halls.slice(1), ...pool].forEach((i) => {
      out[i] = SECT_EMPTY_TILE;
    });
    return out;
  }

  if (pool.length === 0) return out;

  const keep = Math.max(1, Math.round((pool.length * level) / SECT_LEVEL_MAX));
  if (keep >= pool.length) return out;

  const rand = seededRand(sectTileSeed(site.id));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const kept = new Set(shuffled.slice(0, keep));
  for (const i of pool) {
    if (!kept.has(i)) out[i] = SECT_EMPTY_TILE;
  }
  return out;
}

/**
 * 把宗门点位配成可进入的场景：逐处照其模板铺一张 15×15 的图，挂回九州舆图。
 * 宗门点位是运行时掷出来的（随存档走），故不写进随游戏发下来的 scenes.json，
 * 而在开局掷完、读档补齐时现注册一次；模板改了刷新页面即重注册。
 */
export function registerSectScenes(sites: SectSite[] | undefined): void {
  const list = Array.isArray(sites) ? sites : [];
  for (const site of list) {
    if (!site || !site.id) continue;
    const template = pickSectTemplate(site);
    if (!template) continue;
    const id = sectSceneId(site.id);
    const scene: MapScene = {
      id,
      name: `${site.name}山门`,
      kind: "sect",
      image: "",
      parentId: WORLD_SCENE_ID,
      width: SECT_GRID_SIZE,
      height: SECT_GRID_SIZE,
      // 模板只作底子，照这处宗门的等级削一遍建筑；模板本身不动。
      // 已毁的几座不在这里抹——地块一空出来，微调配比又会把它填上，须等立完建筑再按住，
      // 故只把名目随场景带下去，交给 sectMapLayout 处理；存档里记着，刷新后仍是废墟。
      tiles: thinSectTilesByLevel(site, template.tiles),
      culture: site.culture,
      sectNature: site.nature?.id,
      sectFeature: site.feature?.name,
      sectDestroyed: site.destroyed,
    };
    registry.sceneById.set(id, scene);
    const at = registry.scenes.findIndex((s) => s.id === id);
    if (at >= 0) registry.scenes[at] = scene;
    else registry.scenes.push(scene);
  }
}

/**
 * 一处宅地落在城图上的哪一格。
 *
 * 已经指定过、且那一格还空着，就照用；没指定便在城里的空地上随便挑一格，
 * 让叙事里得来的宅邸也能在城图上现出一座院子。城里没有空地就不落格，
 * 宅地仍留在「地产」页里。
 */
export function assignManorCell(
  input: { place?: string; cityId?: string; districtId?: number },
  plots: { cityId?: string; districtId?: number }[] = [],
): { cityId?: string; districtId?: number } {
  const marker =
    (input.cityId ? getMarker(input.cityId) : undefined) ?? resolveMarker(input.place ?? "");
  const cityId = marker?.kind === "city" ? marker.id : undefined;
  const tiles = cityId ? getTownScene(cityId)?.tiles : undefined;
  const given = Number(input.districtId);
  if (!tiles) return { cityId, districtId: Number.isFinite(given) ? given : undefined };

  const taken = new Set(
    plots
      .filter((p) => p?.cityId === cityId && Number.isFinite(Number(p?.districtId)))
      .map((p) => Number(p.districtId)),
  );
  if (
    Number.isInteger(given) &&
    given >= 0 &&
    given < tiles.length &&
    tiles[given] === EMPTY_TILE &&
    !taken.has(given)
  ) {
    return { cityId, districtId: given };
  }

  const free: number[] = [];
  tiles.forEach((code, i) => {
    if (code === EMPTY_TILE && !taken.has(i)) free.push(i);
  });
  if (free.length === 0) return { cityId, districtId: undefined };
  return { cityId, districtId: free[Math.floor(Math.random() * free.length)] };
}

/**
 * 把整份宗门图模板写回 game_data/sectMaps.json，供日后随游戏发出去。
 * 只在本地服务下管用——本地服务把 POST /game/... 落到项目文件上；
 * 别的运行环境（如纯静态托管）会失败，返回 false，由调用方自行提示。
 */
export async function exportSectMapsToFile(templates: SectMapTemplate[]): Promise<boolean> {
  try {
    const res = await fetch(assetUrl("game_data/sectMaps.json"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(templates, null, 2),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------- 宅邸场景 ----------------

/** 宅邸场景 id 前缀，后面接宅地编号 */
export const MANOR_SCENE_PREFIX = "manor-";

export function manorSceneId(plotId: string): string {
  return `${MANOR_SCENE_PREFIX}${plotId}`;
}

/** 宅邸布局：7×7 的屋舍摆在 10×10 的院子中央，四周留一圈回廊 */
const MANOR_OFFSET = 1;

/** 一间屋子在城图贴图里归哪一类：作坊类走匠人区，其余按大户宅院 */
function manorCellNature(cell: ManorCell): DistrictNature {
  if (cell.fn === "丹房" || cell.fn === "锻坊" || cell.shape === "工坊") return "匠人区";
  return "大户住宅";
}

function manorLayout(plot: ManorPlot): { tiles: number[]; districts: District[] } {
  const total = TILE_GRID_SIZE * TILE_GRID_SIZE;
  const tiles = new Array(total).fill(EMPTY_TILE);
  // 院墙外一圈回廊
  for (let i = 0; i < TILE_GRID_SIZE; i++) {
    tiles[i] = ROAD_TILE;
    tiles[(TILE_GRID_SIZE - 1) * TILE_GRID_SIZE + i] = ROAD_TILE;
    tiles[i * TILE_GRID_SIZE] = ROAD_TILE;
    tiles[i * TILE_GRID_SIZE + TILE_GRID_SIZE - 1] = ROAD_TILE;
  }

  const districts: District[] = [];
  plot.cells.forEach((cell, index) => {
    if (!cell) return;
    const row = Math.floor(index / MANOR_GRID) + MANOR_OFFSET;
    const col = (index % MANOR_GRID) + MANOR_OFFSET;
    tiles[row * TILE_GRID_SIZE + col] = BLOCK_TILE;
    districts.push({
      id: districts.length + 1,
      name: cell.shape,
      nature: manorCellNature(cell),
      slots: 1,
    });
  });
  return { tiles, districts };
}

/**
 * 把名下每一处宅地注册成一张可进入的宅邸图：与城图同一套瓦片，
 * 屋舍落在院中，点开便进那一间的打理界面。
 * 宅地随存档走，故在开局、买地、盖屋之后现注册一次。
 */
export function registerManorScenes(plots: ManorPlot[] | undefined): void {
  for (const plot of Array.isArray(plots) ? plots : []) {
    if (!plot?.id) continue;
    const id = manorSceneId(plot.id);
    const { tiles, districts } = manorLayout(plot);
    const townId = plot.cityId ? `${TOWN_SCENE_PREFIX}${plot.cityId}` : "";
    const parentId = townId && registry.sceneById.has(townId) ? townId : WORLD_SCENE_ID;
    const scene: MapScene = {
      id,
      name: `${plot.place}·宅邸`,
      kind: "manor",
      image: "",
      parentId,
      width: TILE_GRID_SIZE,
      height: TILE_GRID_SIZE,
      tiles,
      culture: plot.cityId ? getMarker(plot.cityId)?.culture : undefined,
      districts,
      manorPlotId: plot.id,
    };
    registry.sceneById.set(id, scene);
    const at = registry.scenes.findIndex((s) => s.id === id);
    if (at >= 0) registry.scenes[at] = scene;
    else registry.scenes.push(scene);
  }
}
