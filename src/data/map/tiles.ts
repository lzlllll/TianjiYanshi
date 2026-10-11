/**
 * 城市瓦片地图的地块定义。
 *
 * 地块用数字编号存储，图例只在这里维护一份：渲染与编辑器都从这张表取颜色和名称，
 * 改名字不会影响已经画好的地图。新增地块时在末尾追加编号，不要改动已有编号。
 */

/** 城市瓦片地图固定 10×10 */
export const TILE_GRID_SIZE = 10;

export interface TileKind {
  /** 存进 JSON 的编号 */
  code: number;
  id: string;
  name: string;
  /** 底色，渲染时直接铺满一格 */
  color: string;
}

export const TILE_KINDS: TileKind[] = [
  { code: 0, id: "empty", name: "空地", color: "#6b5f47" },
  { code: 1, id: "road", name: "街道", color: "#b3a07a" },
  { code: 2, id: "river", name: "河流", color: "#2f6f8a" },
  { code: 3, id: "lake", name: "湖泊", color: "#1f4f6b" },
  { code: 4, id: "mountain", name: "山脉", color: "#55493a" },
  { code: 5, id: "block", name: "建筑街区", color: "#8a4f3a" },
  { code: 6, id: "forest", name: "林地", color: "#3f6b45" },
];

const codeOf = (id: string): number => TILE_KINDS.find((k) => k.id === id)?.code ?? -1;

/** 默认地块，也是清洗脏值时的兜底 */
export const EMPTY_TILE = codeOf("empty");

/** 建筑街区的编号；一座城的每个这种格子对应 districts 里的一条 */
export const BLOCK_TILE = codeOf("block");

/** 街道编号；街区几面临街，决定它更像坊市还是宅院。渲染时相邻的街道格会连成路网 */
export const ROAD_TILE = codeOf("road");

/** 河流编号；渲染时相邻的河流格会连成水线 */
export const RIVER_TILE = codeOf("river");

/** 林地编号；城里的林地可点开探索，走一趟或有所得、或遇上事 */
export const FOREST_TILE = codeOf("forest");

/** 临水的地块：临水的街区作匠人区，取用水之便 */
const WATER_TILES = [RIVER_TILE, codeOf("lake")];

/** 野外的地块：靠山林的街区作大户人家的宅院，取其清静 */
const WILD_TILES = [codeOf("mountain"), codeOf("forest")];

/** 街区性质，取值固定这六类 */
export const DISTRICT_NATURES = ["平民住宅", "大户住宅", "坊市", "匠人区", "宗教场所", "政府部门"] as const;

export type DistrictNature = (typeof DISTRICT_NATURES)[number];

/** 一条街区的建筑槽位数上限 */
export const MAX_DISTRICT_SLOTS = 8;

/** 推断出来的性质各配几个建筑槽位 */
const DEFAULT_SLOTS: Record<DistrictNature, number> = {
  坊市: 6,
  匠人区: 5,
  平民住宅: 4,
  大户住宅: 3,
  宗教场所: 2,
  政府部门: 2,
};

/**
 * 一条建筑街区数据。与地图上编号 5 的格子一一对应，
 * 数组按行优先顺序排列：第一条对应该城最靠左上的那个建筑街区格。
 */
export interface District {
  /** 街区编号，从 1 起按顺序排 */
  id: number;
  /** 名称，留空待定 */
  name: string;
  nature: DistrictNature;
  /** 建筑槽位数，0~8 */
  slots: number;
}

const VALID_CODES = new Set(TILE_KINDS.map((k) => k.code));

const TILE_BY_CODE = new Map(TILE_KINDS.map((k) => [k.code, k]));

export const TILE_COUNT = TILE_GRID_SIZE * TILE_GRID_SIZE;

export function getTileKind(code: number): TileKind {
  return TILE_BY_CODE.get(code) ?? TILE_KINDS[EMPTY_TILE];
}

/** 铺图用的底色；空地透明，好让背景底图透出来 */
export function tileFill(code: number): string {
  return code === EMPTY_TILE ? "transparent" : getTileKind(code).color;
}

/** 一张全空的 10×10 地图 */
export function emptyTiles(): number[] {
  return new Array(TILE_COUNT).fill(EMPTY_TILE);
}

/**
 * 把外部读来的瓦片数组夹成合法的 10×10：长度不足补空地，越界或认不出的编号归零。
 * 导出的文件、手改的数据、模型或编辑器写的内容都从这里过一道。
 */
export function normalizeTiles(input: unknown): number[] {
  const source = Array.isArray(input) ? input : [];
  const tiles = emptyTiles();
  for (let i = 0; i < TILE_COUNT; i++) {
    const code = Number(source[i]);
    tiles[i] = VALID_CODES.has(code) ? code : EMPTY_TILE;
  }
  return tiles;
}

/** 是否画过东西；全空的地图不值得收进数据文件 */
export function hasAnyTile(tiles: number[]): boolean {
  return tiles.some((code) => code !== EMPTY_TILE);
}

/**
 * 把街区明细摊回格子：按行优先顺序找到每个建筑街区格，依次对应 districts 里的条目。
 * 这是「数组不带格子坐标」这一约定的唯一落点，渲染侧靠它把街区与格子对上。
 */
export function mapDistrictsToCells(tiles: number[], districts: District[]): Map<number, District> {
  const byCell = new Map<number, District>();
  let k = 0;
  tiles.forEach((code, index) => {
    if (code !== BLOCK_TILE) return;
    const district = districts[k++];
    if (district) byCell.set(index, district);
  });
  return byCell;
}

const NATURE_SET = new Set<string>(DISTRICT_NATURES);

/**
 * 清洗外部读来的街区数组：性质认不出的整条丢掉，名称缺省留空，
 * 编号缺省按顺序补，槽位数取整后夹进 0~8。
 */
export function normalizeDistricts(input: unknown): District[] {
  if (!Array.isArray(input)) return [];
  const list: District[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { id?: unknown; name?: unknown; nature?: unknown; slots?: unknown };
    if (typeof item.nature !== "string" || !NATURE_SET.has(item.nature)) continue;
    const slots = Math.round(Number(item.slots));
    const id = Number(item.id);
    list.push({
      id: Number.isFinite(id) ? id : list.length + 1,
      name: typeof item.name === "string" ? item.name : "",
      nature: item.nature as DistrictNature,
      slots: Number.isFinite(slots) ? Math.min(MAX_DISTRICT_SLOTS, Math.max(0, slots)) : 0,
    });
  }
  return list;
}

/**
 * 补一条街区的默认性质：两面临街的作坊市，临水的作匠人区，
 * 靠山林的作大户人家的宅院，其余作平民住宅。
 * 官署与宗教场所不靠推断——它们得由人指定，缺的格子不会凭空长出一座衙门。
 */
export function inferNature(tiles: number[], cellIndex: number): DistrictNature {
  const row = Math.floor(cellIndex / TILE_GRID_SIZE);
  const col = cellIndex % TILE_GRID_SIZE;
  const at = (r: number, c: number) =>
    r < 0 || r >= TILE_GRID_SIZE || c < 0 || c >= TILE_GRID_SIZE ? -1 : tiles[r * TILE_GRID_SIZE + c];
  const around = [at(row - 1, col), at(row + 1, col), at(row, col - 1), at(row, col + 1)];

  if (around.filter((code) => code === ROAD_TILE).length >= 2) return "坊市";
  if (around.some((code) => WATER_TILES.includes(code))) return "匠人区";
  if (around.some((code) => WILD_TILES.includes(code))) return "大户住宅";
  return "平民住宅";
}

/**
 * 让街区明细与地块对齐：每个建筑街区格都该有一条。
 * 文件里写好的照用，缺的（新涂上去的、或旧数据没带的）按位置补一条默认，
 * 多出来的丢掉。有了它，渲染侧不必再判空——建筑街区一定会显示出来。
 */
export function reconcileDistricts(tiles: number[], districts: District[]): District[] {
  let k = 0;
  const list: District[] = [];
  tiles.forEach((code, index) => {
    if (code !== BLOCK_TILE) return;
    const given = districts[k++];
    const nature = given?.nature ?? inferNature(tiles, index);
    list.push({
      id: list.length + 1,
      name: given?.name ?? "",
      nature,
      slots: given?.slots ?? DEFAULT_SLOTS[nature],
    });
  });
  return list;
}

/** 一条连线；坐标以「格」为单位，0 是地图左边／上边，TILE_GRID_SIZE 是右边／下边 */
export interface TileLink {
  from: [number, number];
  to: [number, number];
}

/**
 * 只连这四个方向，八向正好各连一次：右、左下、下、右下。
 * 反向由对面那格的同一条线补上，免得每对格子画两遍。
 */
const LINK_STEPS: [number, number][] = [
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** 同类地块的连通片，八向相邻算一片 */
function findClusters(tiles: number[], code: number): number[][] {
  const seen = new Set<number>();
  const clusters: number[][] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== code || seen.has(i)) continue;
    const cluster: number[] = [];
    const stack = [i];
    seen.add(i);
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      cluster.push(cur);
      const row = Math.floor(cur / TILE_GRID_SIZE);
      const col = cur % TILE_GRID_SIZE;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = row + dr;
          const nc = col + dc;
          if (nr < 0 || nr >= TILE_GRID_SIZE || nc < 0 || nc >= TILE_GRID_SIZE) continue;
          const next = nr * TILE_GRID_SIZE + nc;
          if (tiles[next] === code && !seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/** 某个格子是不是落在四方块里——落在里面就说明这一处不止一格宽 */
function inSolidSquare(cells: Set<number>, index: number): boolean {
  const row = Math.floor(index / TILE_GRID_SIZE);
  const col = index % TILE_GRID_SIZE;
  for (const [dr, dc] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= TILE_GRID_SIZE - 1 || c < 0 || c >= TILE_GRID_SIZE - 1) continue;
    if (
      cells.has(r * TILE_GRID_SIZE + c) &&
      cells.has(r * TILE_GRID_SIZE + c + 1) &&
      cells.has((r + 1) * TILE_GRID_SIZE + c) &&
      cells.has((r + 1) * TILE_GRID_SIZE + c + 1)
    ) {
      return true;
    }
  }
  return false;
}

/** 这些格子还连成一片吗（八向相邻算相连） */
function isConnected(cells: Set<number>): boolean {
  const first = cells.values().next().value as number | undefined;
  if (first === undefined) return true;
  const seen = new Set<number>([first]);
  const stack = [first];
  while (stack.length > 0) {
    const cur = stack.pop() as number;
    const row = Math.floor(cur / TILE_GRID_SIZE);
    const col = cur % TILE_GRID_SIZE;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= TILE_GRID_SIZE || c < 0 || c >= TILE_GRID_SIZE) continue;
        const next = r * TILE_GRID_SIZE + c;
        if (cells.has(next) && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
  }
  return seen.size === cells.size;
}

/**
 * 把成片的同类地块收成一条一格宽的水道：逐个删掉落在四方块里的格子，
 * 删完仍连通才真删，删到再没有四方块为止。
 * 只看局部宽窄，不看整片的长宽——不然十字路口那种窄路会被一起收掉。
 * 不收的话，两格宽的水面会被逐格连成一把梯子，宽处看着就是一张网格。
 */
export function spineTiles(tiles: number[], code: number): number[] {
  const spine = new Array<number>(tiles.length).fill(EMPTY_TILE);
  for (const cluster of findClusters(tiles, code)) {
    const cells = new Set(cluster);
    let changed = true;
    while (changed && cells.size > 1) {
      changed = false;
      // 按行列顺序收：顺序会影响收出来的走向，跟着图面从上到下、从左到右走最不乱
      for (const index of Array.from(cells).sort((a, b) => a - b)) {
        if (cells.size <= 1) break;
        if (!inSolidSquare(cells, index)) continue;
        cells.delete(index);
        if (isConnected(cells)) {
          changed = true;
        } else {
          cells.add(index);
        }
      }
    }
    for (const index of cells) spine[index] = code;
  }
  return spine;
}

/**
 * 把同类地块连成线：相邻（直向与斜向都算）的格子中心两两相连，
 * 贴在地图边缘的格子再往图外接一小段——路与河都是穿城而过的，不该在边界上断掉。
 *
 * @param tiles 地块表
 * @param code 要连的地块编号
 * @param through 可以借道穿过的地块编号：河遇上一格道路时从它身上穿过去，把这一格当桥
 *
 * 连之前先把成片的地块收成一条一格宽的水道（见 spineTiles），两格宽的水面才不会连成一张网。
 * 另有几处去重，都是为了让线看着像一条路而不是一团线：
 * 斜向连接若绕直角一格就能走到（两格共享的直向邻格也是水道），就省掉这条对角线，
 * 否则十字路口四周会多出四道斜线，糊成一个星形；
 * 贴边的格子若水道沿着这条边一路排开，就不往外接了，
 * 不然一条沿边的河会顶出一排平行的短线，看着像梳齿。
 */
export function buildTileLinks(tiles: number[], code: number, through = -1): TileLink[] {
  const spine = spineTiles(tiles, code);
  const links: TileLink[] = [];
  const at = (r: number, c: number): number =>
    r < 0 || r >= TILE_GRID_SIZE || c < 0 || c >= TILE_GRID_SIZE ? -1 : spine[r * TILE_GRID_SIZE + c];
  const raw = (r: number, c: number): number =>
    r < 0 || r >= TILE_GRID_SIZE || c < 0 || c >= TILE_GRID_SIZE ? -1 : tiles[r * TILE_GRID_SIZE + c];

  spine.forEach((value, index) => {
    if (value !== code) return;
    const row = Math.floor(index / TILE_GRID_SIZE);
    const col = index % TILE_GRID_SIZE;
    const from: [number, number] = [col + 0.5, row + 0.5];

    for (const [dr, dc] of LINK_STEPS) {
      if (at(row + dr, col + dc) === code) {
        const diagonal = dr !== 0 && dc !== 0;
        if (diagonal && (at(row + dr, col) === code || at(row, col + dc) === code)) continue;
        links.push({ from, to: [col + dc + 0.5, row + dr + 0.5] });
        continue;
      }
      // 中间隔着一格道路、再过去又是同类地块：径直穿过去，把那一格当桥
      if (through >= 0 && raw(row + dr, col + dc) === through && at(row + dr * 2, col + dc * 2) === code) {
        links.push({ from, to: [col + dc * 2 + 0.5, row + dr * 2 + 0.5] });
      }
    }

    const aloneOnRow = at(row, col - 1) !== code && at(row, col + 1) !== code;
    const aloneOnCol = at(row - 1, col) !== code && at(row + 1, col) !== code;
    if (row === 0 && aloneOnRow) links.push({ from, to: [col + 0.5, 0] });
    if (row === TILE_GRID_SIZE - 1 && aloneOnRow) links.push({ from, to: [col + 0.5, TILE_GRID_SIZE] });
    if (col === 0 && aloneOnCol) links.push({ from, to: [0, row + 0.5] });
    if (col === TILE_GRID_SIZE - 1 && aloneOnCol) links.push({ from, to: [TILE_GRID_SIZE, row + 0.5] });
  });

  return links;
}
