/**
 * 宗门地图的地块定义。
 *
 * 与城图是两套：宗门图 15×15，地块按宗门里派什么用场来分，不分街道与水系连线，
 * 也不配街区明细——那是一城一份的账，宗门图只是张布局底子。
 * 地块用数字编号存储，图例只在这里维护一份：渲染与编辑器都从这张表取颜色和名称，
 * 改名字不会影响已经画好的图。新增地块时在末尾追加编号，不要改动已有编号。
 *
 * 建筑地块按宗门里的用场细分：主殿、经阁、演武、丹房、锻器、灵脉、灵田、灵苑、阵法、居所。
 * 其余是地势：荒地、水域、山地。地块越细，越能按各宗门的性质铺出不同面貌。
 */

/** 宗门地图固定 15×15 */
export const SECT_GRID_SIZE = 15;

export interface SectTileKind {
  /** 存进 JSON 的编号 */
  code: number;
  id: string;
  name: string;
  /** 底色，渲染时直接铺满一格 */
  color: string;
}

export const SECT_TILE_KINDS: SectTileKind[] = [
  // 地势
  { code: 0, id: "wasteland", name: "荒地", color: "#6b5f47" },
  { code: 1, id: "water", name: "水域", color: "#2f6f8a" },
  { code: 2, id: "mountain", name: "山地", color: "#55493a" },
  // 建筑
  { code: 3, id: "hall", name: "主殿", color: "#8f3a30" },
  { code: 4, id: "scripture", name: "经阁", color: "#9a8f4a" },
  { code: 5, id: "martial", name: "演武", color: "#a04a2a" },
  { code: 6, id: "alchemy", name: "丹房", color: "#4f8a5f" },
  { code: 7, id: "forge", name: "锻器", color: "#7a6a52" },
  { code: 8, id: "spirit", name: "灵脉", color: "#3f6f8a" },
  { code: 9, id: "farm", name: "灵田", color: "#6b8a3f" },
  { code: 10, id: "beast", name: "灵苑", color: "#8a6f4a" },
  { code: 11, id: "array", name: "阵法", color: "#5a5a8a" },
  { code: 12, id: "housing", name: "居所", color: "#8a7a5a" },
];

/** 要立建筑的地块编号（除地势之外的一切） */
export const SECT_BUILDING_TILE_IDS = [
  "hall", "scripture", "martial", "alchemy", "forge", "spirit", "farm", "beast", "array", "housing",
] as const;

const VALID_CODES = new Set(SECT_TILE_KINDS.map((k) => k.code));

const TILE_BY_CODE = new Map(SECT_TILE_KINDS.map((k) => [k.code, k]));

const codeOf = (id: string): number =>
  SECT_TILE_KINDS.find((k) => k.id === id)?.code ?? SECT_TILE_KINDS[0].code;

export const SECT_TILE_COUNT = SECT_GRID_SIZE * SECT_GRID_SIZE;

/** 默认地块，也是清洗脏值时的兜底 */
export const SECT_EMPTY_TILE = codeOf("wasteland");

/** 主殿的编号；一张宗门图总从主殿起笔，编辑器默认落在这支笔上 */
export const SECT_HALL_TILE = codeOf("hall");

/** 这一格是不是要立建筑 */
export function isSectBuildingTile(code: number): boolean {
  return (SECT_BUILDING_TILE_IDS as readonly string[]).includes(getSectTileKind(code).id);
}

/** 依据地块 id 取其编号 */
export function sectTileCode(id: string): number {
  return codeOf(id);
}

export function getSectTileKind(code: number): SectTileKind {
  return TILE_BY_CODE.get(code) ?? SECT_TILE_KINDS[0];
}

/** 铺图用的底色；宗门图没有背景图，荒地也照自己的颜色铺 */
export function sectTileFill(code: number): string {
  return getSectTileKind(code).color;
}

/** 一张空白的 15×15 宗门图 */
export function emptySectTiles(): number[] {
  return new Array(SECT_TILE_COUNT).fill(SECT_EMPTY_TILE);
}

/**
 * 把外部读来的格子夹成合法的 15×15：长度不足补荒地，越界或认不出的编号归零。
 * 导出的文件、手改的数据、编辑器写的内容都从这里过一道。
 */
export function normalizeSectTiles(input: unknown): number[] {
  const source = Array.isArray(input) ? input : [];
  const tiles = emptySectTiles();
  for (let i = 0; i < SECT_TILE_COUNT; i++) {
    const code = Number(source[i]);
    tiles[i] = VALID_CODES.has(code) ? code : SECT_EMPTY_TILE;
  }
  return tiles;
}

/** 是否画过东西；一张全是荒地的图不值得收进数据文件 */
export function hasAnySectTile(tiles: number[]): boolean {
  return tiles.some((code) => code !== SECT_EMPTY_TILE);
}

/**
 * 画过的地块各占几格。荒地是底色，数它没意思，故只报其余几样；
 * 一样都没画过便是空表，一侧的账目也就整行不显示。
 */
export function sectTileCounts(tiles: number[]): { kind: SectTileKind; count: number }[] {
  return SECT_TILE_KINDS.filter((kind) => kind.code !== SECT_EMPTY_TILE)
    .map((kind) => ({ kind, count: tiles.filter((code) => code === kind.code).length }))
    .filter((entry) => entry.count > 0);
}
