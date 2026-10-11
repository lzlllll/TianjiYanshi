/**
 * 宗门地图的贴图：建筑与地形两套。
 *
 * 建筑贴图在 image_assets/宗门建筑贴图，各地文化圈各有一套，另有几张通用的。
 * 建筑按地块用场细分类（主殿／经阁／演武／丹房／锻器／灵脉／灵田／灵苑／阵法／居所），
 * 每处宗门里：
 *   1. 与该宗门性质相合的（如剑修门中的剑冢、试剑石）先各立一座；
 *   2. 其次本文化圈的特色建筑，也各立一座；
 *   3. 其余同类地块一律铺本类的通用建筑。
 * 这样不同性质、不同文化圈的宗门，山门面貌各不相同。
 *
 * 地形贴图在 image_assets/地形贴图，按「地形_文化圈」命名：
 * 荒地铺空地、水域铺水面、山地铺山地，随宗门所属文化圈取图。
 *
 * 新增贴图时在这里补一条即可，与文件名一一对应。
 */

import { assetUrl } from "@/data/map";
import type { FacilityKindId, MapScene } from "@/data/types";
import {
  SECT_BUILDING_TILE_IDS,
  SECT_EMPTY_TILE,
  SECT_GRID_SIZE,
  SECT_HALL_TILE,
  getSectTileKind,
  sectTileCode,
} from "./sectTiles";

/** 把一撮字串揉成一个定死的种子；同图同参数，每次渲染都一样 */
function seedOf(parts: (string | number | undefined)[]): number {
  const text = parts.map((p) => String(p ?? "")).join("|");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 一只定死的骰子；种子一样，吐出来的数就一样 */
function makeRng(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 按权重挑一件；权重越大越容易被挑中 */
function pickWeighted<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return items[0];
  let x = rng() * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** 这一格的八邻格（上下左右与四角）；贴边时自然少几个 */
function neighboursOf(index: number): number[] {
  const row = Math.floor(index / SECT_GRID_SIZE);
  const col = index % SECT_GRID_SIZE;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= SECT_GRID_SIZE || c >= SECT_GRID_SIZE) continue;
      out.push(r * SECT_GRID_SIZE + c);
    }
  }
  return out;
}

/** 建筑按地块用场分的类；与 sectTiles 里建筑地块的 id 一一对应 */
type BuildingKind = (typeof SECT_BUILDING_TILE_IDS)[number];

/** 一张宗门建筑贴图：名目、所属文化圈（通用图写「通用」）、归哪一类建筑 */
interface SectBuildingTexture {
  name: string;
  culture: string;
  kind: BuildingKind;
  /** 限定只给这些宗门性质用（见 sects.ts 的 nature.id）；不填则各门通用 */
  natures?: string[];
  /**
   * 贴图文件名里的名目；不填则与 name 同。
   * 新建筑尚无专门贴图时用它指向一张现成的通用图作占位，
   * 等美术补上「本名_通用.jpg」后，删掉这项即可切回本名。
   */
  art?: string;
}

/** 名录里挑出来的一位建筑 */
export interface SectBuilding {
  name: string;
  culture: string;
  url: string;
}

/** 名录里的一位建筑，连同它归哪一类地块 */
export interface SectBuildingSpec extends SectBuilding {
  kind: FacilityKindId;
}

/** 贴图名录；与 image_assets/宗门建筑贴图 下的文件一一对应 */
const BUILDINGS: SectBuildingTexture[] = [
  // 主殿：掌门讲法之地，各门皆有，故不归某一文化圈
  { name: "传法大殿", culture: "通用", kind: "hall" },

  // 经阁：藏书、经卷、曲谱、纸墨
  { name: "藏书楼", culture: "中原", kind: "scripture" },
  { name: "曲谱库", culture: "江南", kind: "scripture" },
  { name: "和纸窖", culture: "日韩", kind: "scripture" },
  { name: "藏经阁", culture: "通用", kind: "scripture" },

  // 演武：演武、试炼、剑冢。剑冢、试剑石是练剑之门的旧物，只归剑道一脉
  { name: "演武场", culture: "通用", kind: "martial" },
  { name: "剑冢", culture: "通用", kind: "martial", natures: ["sword", "kendo", "blade"] },
  { name: "试剑石", culture: "通用", kind: "martial", natures: ["sword", "kendo", "blade"] },

  // 丹房：炼丹、药谷、毒潭、蛊窟
  { name: "炼丹房", culture: "通用", kind: "alchemy" },
  { name: "药王谷", culture: "苗疆", kind: "alchemy" },
  { name: "万毒潭", culture: "苗疆", kind: "alchemy" },
  { name: "蛊窟", culture: "苗疆", kind: "alchemy" },

  // 锻器：铸器、锻刀、矿脉
  { name: "铸器炉", culture: "通用", kind: "forge" },
  { name: "锻刀场", culture: "日韩", kind: "forge" },
  { name: "镔铁矿", culture: "西域", kind: "forge" },
  { name: "寒铁矿", culture: "漠北", kind: "forge" },

  // 灵脉：灵脉、灵泉、灵池
  { name: "活灵脉", culture: "通用", kind: "spirit" },
  { name: "水脉泉眼", culture: "江南", kind: "spirit" },
  { name: "灵鲤池", culture: "江南", kind: "spirit" },
  { name: "绿洲泉", culture: "西域", kind: "spirit" },

  // 灵田：药圃、园圃
  { name: "百亩药圃", culture: "通用", kind: "farm" },
  { name: "香料园", culture: "西域", kind: "farm" },

  // 灵苑：鹿苑、狐谷、狼群
  { name: "白鹿苑", culture: "日韩", kind: "beast" },
  { name: "雪狐谷", culture: "漠北", kind: "beast" },
  { name: "狼群", culture: "漠北", kind: "beast" },

  // 阵法：护山大阵、律令碑、星台、鼓台
  { name: "护山大阵", culture: "中原", kind: "array" },
  { name: "律令碑", culture: "中原", kind: "array" },
  { name: "星图台", culture: "西域", kind: "array" },
  { name: "铜鼓台", culture: "苗疆", kind: "array" },

  // 居所：画舫、汤泉、温泉
  { name: "画舫", culture: "江南", kind: "housing" },
  { name: "汤泉", culture: "日韩", kind: "housing" },
  { name: "温泉", culture: "漠北", kind: "housing" },

  // —— 通用一般建筑 ——
  // 以下各门通用，是填图时最常出现的面貌，用来冲淡同一类反复撞脸的单调。
  { name: "弟子厢房", culture: "通用", kind: "housing" },
  { name: "斋堂", culture: "通用", kind: "housing" },
  { name: "客舍", culture: "通用", kind: "housing" },
  { name: "讲经堂", culture: "通用", kind: "scripture" },
  { name: "碑林", culture: "通用", kind: "scripture" },
  { name: "木人巷", culture: "通用", kind: "martial" },
  { name: "擂台", culture: "通用", kind: "martial" },
  { name: "药庐", culture: "通用", kind: "alchemy" },
  { name: "丹库", culture: "通用", kind: "alchemy" },
  { name: "锻铁铺", culture: "通用", kind: "forge" },
  { name: "料场", culture: "通用", kind: "forge" },
  { name: "引灵泉", culture: "通用", kind: "spirit" },
  { name: "灵田", culture: "通用", kind: "farm" },
  { name: "菜圃", culture: "通用", kind: "farm" },
  { name: "兽栏", culture: "通用", kind: "beast" },
  { name: "阵基", culture: "通用", kind: "array" },
  { name: "传功台", culture: "通用", kind: "array" },
];

/**
 * 宗门性质（见 src/data/sects.ts 的 nature.id）惯用哪些建筑。
 * 供择图时优先取用，使剑修门中多见剑冢、丹修门中多见丹房。
 */
const SPECIALTY: Record<string, string[]> = {
  sword: ["剑冢", "试剑石", "演武场"],
  law: ["护山大阵", "律令碑", "星图台"],
  alchemy: ["炼丹房", "药王谷", "百亩药圃"],
  talisman: ["和纸窖", "藏书楼", "藏经阁"],
  artifact: ["铸器炉", "锻刀场", "镔铁矿"],
  body: ["演武场", "试剑石"],
  array: ["护山大阵", "律令碑", "铜鼓台"],
  rite: ["传法大殿", "律令碑", "藏书楼"],
  healer: ["药王谷", "百亩药圃", "灵鲤池"],
  music: ["曲谱库", "画舫"],
  lettering: ["藏书楼", "和纸窖", "藏经阁"],
  gu: ["蛊窟", "万毒潭"],
  poison: ["万毒潭", "蛊窟"],
  beast: ["狼群", "白鹿苑", "雪狐谷"],
  herbal: ["药王谷", "百亩药圃", "香料园"],
  star: ["星图台", "护山大阵"],
  blade: ["剑冢", "试剑石", "锻刀场"],
  shaman: ["铜鼓台", "狼群"],
  frost: ["寒铁矿", "雪狐谷", "温泉"],
  archer: ["演武场", "狼群"],
  wrestle: ["演武场"],
  onmyo: ["星图台", "护山大阵"],
  kendo: ["剑冢", "试剑石"],
  kyudo: ["演武场"],
  forge: ["锻刀场", "铸器炉"],
};

/** 邻格每有一处同一座建筑，这一座的分量便加这些；数越大，扎堆越紧 */
const CLUSTER_WEIGHT = 3;

/**
 * 同一类地块里，同一座建筑至多占几成。
 * 扎堆归扎堆，总不能一山的居所全是斋堂，故给每座建筑封个顶。
 */
const MAX_KIND_SHARE = 0.34;

/**
 * 本门特色或本地文化的那几座若要再添，分量按这个折扣算——
 * 它们是镇门的招牌，露面自该比通用建筑稀些。
 */
const ONCE_REPEAT_WEIGHT = 0.35;

const textureUrlOf = (b: SectBuildingTexture): SectBuilding => ({
  name: b.name,
  culture: b.culture,
  url: assetUrl(`image_assets/宗门建筑贴图/${b.name}_${b.culture}.jpg`),
});

const dedupe = (list: SectBuildingTexture[]): SectBuildingTexture[] => {
  const seen = new Set<string>();
  return list.filter((b) => (seen.has(b.name) ? false : (seen.add(b.name), true)));
};

/** 这一件建筑合不合该宗门：性质要对得上；地区特色建筑还须门派词条正对 */
const eligibleFor = (
  b: SectBuildingTexture,
  nature: string | undefined,
  culture: string | undefined,
  feature: string | undefined,
): boolean => {
  // 性质限定：剑冢、试剑石一类只归剑道门
  if (b.natures && b.natures.length > 0 && !(nature && b.natures.includes(nature))) return false;
  // 地区特色建筑：本文化圈之外不出现，且须门派词条正对它
  if (b.culture !== "通用") {
    if (b.culture !== culture) return false;
    if (!feature || b.name !== feature) return false;
  }
  return true;
};

/**
 * 给一整张宗门图排定每格立哪座建筑。
 *
 * 每一类地块里：先放与该宗门性质相合、以及本文化圈的特色建筑（各一座），
 * 其余同类地块铺本类的通用建筑。
 *
 * 通用建筑不轮流发牌，而按权重挑：某座建筑在四周的邻格里立得越多，
 * 它被挑中的分量就越重，于是相同的建筑自然凑成一堆，山门看着便不像随手撒的。
 * 骰子由宗门与文化圈定死，同一张图每次渲染都排得一样，不会闪。
 * 返回与 tiles 等长的数组，非建筑地块对应 null。
 */
export function sectBuildingsFor(
  tiles: number[],
  culture: string | undefined,
  nature: string | undefined,
  feature: string | undefined,
): (SectBuilding | null)[] {
  const result: (SectBuilding | null)[] = tiles.map(() => null);
  const specialty = (nature && SPECIALTY[nature]) || [];
  /** 各格已经定下的是哪一座，供邻格称重时参照 */
  const assigned: (string | undefined)[] = tiles.map(() => undefined);

  // 按地块类型把格子归拢
  const cellsByKind = new Map<string, number[]>();
  tiles.forEach((code, index) => {
    const kind = getSectTileKind(code).id;
    if (!(SECT_BUILDING_TILE_IDS as readonly string[]).includes(kind)) return;
    const cells = cellsByKind.get(kind) ?? [];
    cells.push(index);
    cellsByKind.set(kind, cells);
  });

  for (const [kind, cells] of cellsByKind) {
    // 这一类里凡立过一座，四周的同类格也照它办
    const rng = makeRng(seedOf([culture, nature, feature, kind]));
    // 只取合该宗门、且属于本类的建筑——地块是主殿就只立主殿，是丹房就只立丹房
    const sameKind = BUILDINGS.filter(
      (b) => b.kind === (kind as BuildingKind) && eligibleFor(b, nature, culture, feature),
    );
    // 先性质、后本文化圈，各立一座
    const specialtyKind = sameKind.filter((b) => specialty.includes(b.name));
    const cultureKind = sameKind.filter((b) => b.culture === culture);
    const once = dedupe([...specialtyKind, ...cultureKind]);
    // 这一类里每座建筑各占几格，及各自的上限——满了就不再立
    const placed: Record<string, number> = {};
    const quota = Math.max(1, Math.round(cells.length * MAX_KIND_SHARE));
    const take = (name: string) => {
      placed[name] = (placed[name] ?? 0) + 1;
    };
    // 其余一格一格铺：本类各座建筑都在池子里，特色那几座分量轻些。
    // 类里通用建筑不够铺满时，也由它们补上，免得一清色都是同一座。
    const fill = sameKind;

    cells.forEach((cellIndex, order) => {
      // 先头几格留给性质与本地特色的那几座，各立一处
      if (order < once.length) {
        const chosen = once[order];
        result[cellIndex] = textureUrlOf(chosen);
        assigned[cellIndex] = chosen.name;
        take(chosen.name);
        return;
      }
      if (fill.length === 0) return;
      if (fill.length === 1) {
        result[cellIndex] = textureUrlOf(fill[0]);
        assigned[cellIndex] = fill[0].name;
        take(fill[0].name);
        return;
      }

      // 称重：四周已经立了同一座的，分量加重，于是同类建筑聚成一片；
      // 特色那几座底子轻些，免得招牌铺得比通用建筑还密
      const around = neighboursOf(cellIndex);
      const weigh = (b: SectBuildingTexture) => {
        const base = once.includes(b) ? ONCE_REPEAT_WEIGHT : 1;
        let w = base;
        for (const n of around) {
          if (assigned[n] === b.name) w += CLUSTER_WEIGHT * base;
        }
        return w;
      };
      const open = fill.filter((b) => (placed[b.name] ?? 0) < quota);
      // 全类都已立满份额时不再硬卡，任取其一，总得把格子填上
      const pool = open.length > 0 ? open : fill;
      const picked = pickWeighted(pool, pool.map(weigh), rng);

      result[cellIndex] = textureUrlOf(picked);
      assigned[cellIndex] = picked.name;
      take(picked.name);
    });
  }

  return result;
}

/** 由宗门的词条或性质，定出该门最偏重的一类建筑 */
function resolveSpecialtyKind(nature: string | undefined, feature: string | undefined): BuildingKind | null {
  // 词条本身就是一件建筑时，取它那一类（如「炼丹房」归丹房类）
  const byFeature = BUILDINGS.find((b) => b.name === feature);
  if (byFeature) return byFeature.kind;
  // 否则退到该性质惯用建筑里的头一件
  const names = (nature && SPECIALTY[nature]) || [];
  const byNature = BUILDINGS.find((b) => names.includes(b.name));
  return byNature ? byNature.kind : null;
}

/** 各类建筑地块的合理分量：按职能定——居所与灵田最重，经阁、阵法最轻 */
const KIND_WEIGHT: Record<BuildingKind, number> = {
  hall: 0,
  scripture: 1.0,
  martial: 1.4,
  alchemy: 1.1,
  forge: 1.0,
  spirit: 1.2,
  farm: 2.0,
  beast: 1.0,
  array: 0.8,
  housing: 2.4,
};

/** 参与配比的九类，主殿单独立一座，不在此列 */
const PROPORTION_KINDS: BuildingKind[] = [
  "scripture", "martial", "alchemy", "forge", "spirit", "farm", "beast", "array", "housing",
];

/** 本门特色那一类在配比上略重这些；只添一分，不至于占满半山 */
const SPECIALTY_BOOST = 1.6;

/** 单类建筑地块至多占非主殿建筑格的几成，防一类铺满 */
const KIND_MAX_SHARE = 0.22;

/** 把一串名额削/补到总和恰为 total，且每项都落在 1..cap 之内 */
function fitToTotal(targets: number[], total: number, cap: number): number[] {
  const out = targets.slice();
  let sum = out.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (sum > total && guard++ < 10000) {
    let idx = -1;
    let best = 0;
    out.forEach((v, i) => {
      if (v > 1 && v > best) {
        best = v;
        idx = i;
      }
    });
    if (idx < 0) break;
    out[idx] -= 1;
    sum -= 1;
  }
  guard = 0;
  while (sum < total && guard++ < 10000) {
    let idx = -1;
    let best = Infinity;
    out.forEach((v, i) => {
      if (v < cap && v < best) {
        best = v;
        idx = i;
      }
    });
    if (idx < 0) break;
    out[idx] += 1;
    sum += 1;
  }
  return out;
}

/**
 * 依宗门的性质与词条，把一张宗门图里的建筑格重新摊匀。
 *
 * 原先一手就把某一类抬到全图建筑格的三分之一，山头容易排得一边倒；
 * 如今按各类的职能分量定出目标名额，多退少补：
 *   1. 主殿只留一座，其余主殿格并入可调配的池子；
 *   2. 各类按分量算出名额，卡在 1 到 KIND_MAX_SHARE 之间，本门特色那一类略重；
 *   3. 超额的类别交出多出来的格子，补给亏空的类别，其余格子原样不动。
 * 只在建筑格之间腾挪，水域、山地、荒地一概不碰；同图同词条每次排得一样。
 * 返回新的格子数组，不改动传入的底图。
 */
export function applySectFeatureBias(
  tiles: number[],
  nature: string | undefined,
  feature: string | undefined,
): number[] {
  const out = tiles.slice();
  const boostKind = resolveSpecialtyKind(nature, feature);

  // 归拢建筑格：主殿另有安排，其余各归其类
  const hallCells: number[] = [];
  const byKind = new Map<BuildingKind, number[]>();
  tiles.forEach((code, index) => {
    const id = getSectTileKind(code).id;
    if (!(SECT_BUILDING_TILE_IDS as readonly string[]).includes(id)) return;
    if (id === "hall") {
      hallCells.push(index);
      return;
    }
    const cells = byKind.get(id as BuildingKind) ?? [];
    cells.push(index);
    byKind.set(id as BuildingKind, cells);
  });

  // 主殿只留一座，多出来的并入可调配的池子
  const released: number[] = hallCells.length > 1 ? hallCells.slice(1) : [];
  const count = (k: BuildingKind) => (byKind.get(k) ?? []).length;
  const total = PROPORTION_KINDS.reduce((sum, k) => sum + count(k), 0) + released.length;
  if (total === 0) return out;

  // 各类的目标名额：按分量分配，卡在 1 与上限之间，再把总和凑回 total
  const weights = PROPORTION_KINDS.map((k) => KIND_WEIGHT[k] * (k === boostKind ? SPECIALTY_BOOST : 1));
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const cap = Math.max(1, Math.round(total * KIND_MAX_SHARE));
  const targets = fitToTotal(
    PROPORTION_KINDS.map((_, i) => Math.max(1, Math.min(cap, Math.round((weights[i] / sumW) * total)))),
    total,
    cap,
  );

  // 超额的类别交出多出来的格子
  PROPORTION_KINDS.forEach((k, i) => {
    const cells = byKind.get(k) ?? [];
    const over = cells.length - targets[i];
    if (over > 0) released.push(...cells.slice(cells.length - over));
  });
  released.sort((a, b) => a - b);

  // 亏空的类别从池子里补上，取一片便成一簇
  PROPORTION_KINDS.forEach((k, i) => {
    let need = targets[i] - count(k);
    while (need > 0 && released.length > 0) {
      out[released.shift()!] = sectTileCode(k);
      need -= 1;
    }
  });

  return out;
}

/** 荒地／水域／山地各铺哪一族地形图 */
const TERRAIN_FAMILY: Record<string, string> = {
  wasteland: "空地",
  water: "水面",
  mountain: "山地",
};

/**
 * 一格地形铺哪张图：荒地铺空地、水域铺水面、山地铺山地，按文化圈取。
 * 认不出的地块（如建筑格）返回 undefined，渲染时保留底色即可。
 */
export function sectTerrainFor(tileCode: number, culture: string | undefined): string | undefined {
  const family = TERRAIN_FAMILY[getSectTileKind(tileCode).id];
  if (!family) return undefined;
  const c = culture && culture.trim() ? culture.trim() : "中原";
  return assetUrl(`image_assets/地形贴图/${family}_${c}.jpg`);
}

/** 山门里立着的一座建筑：名目与所属用场 */
export interface SectBuildingSpot {
  name: string;
  kindId: FacilityKindId;
}

/**
 * 一处山门的最终排布：先按宗门特色微调配比，再照名册立建筑，最后抹去已毁的那几座。
 *
 * 已毁的毁在这里、不在注册山门时：地块一空出来，微调配比会把它重新分配、名册也会另挑一座补上，
 * 只抹地块是徒劳的，非得在立完建筑之后按名按住不可——故废墟的边界就是这一步。
 * 主殿不毁；已毁的那几座地块换回荒地，名册上也不再出现。
 */
export function sectMapLayout(scene: MapScene): {
  layout: number[];
  buildings: (SectBuilding | null)[];
} {
  const tiles = scene.tiles ?? [];
  const layout = applySectFeatureBias(tiles, scene.sectNature, scene.sectFeature);
  const buildings = sectBuildingsFor(layout, scene.culture, scene.sectNature, scene.sectFeature);
  const destroyed = scene.sectDestroyed;
  if (Array.isArray(destroyed) && destroyed.length > 0) {
    const dead = new Set(destroyed);
    buildings.forEach((b, index) => {
      // 主殿是山门的根，名单里混进了主殿名目也不动它
      if (b && dead.has(b.name) && layout[index] !== SECT_HALL_TILE) {
        buildings[index] = null;
        layout[index] = SECT_EMPTY_TILE;
      }
    });
  }
  return { layout, buildings };
}

/**
 * 一处山门里立着的各座建筑，同一座只记一条。
 * 与地图渲染同一套排布（先微调配比、再按权重立图），故点得出的建筑与这里报的一致；
 * 供任务指派去处用——去处落在哪座建筑上，人便在哪儿等着。
 */
export function sectBuildingRoster(scene: MapScene): SectBuildingSpot[] {
  if (!scene || (scene.tiles?.length ?? 0) === 0) return [];
  const { layout, buildings } = sectMapLayout(scene);
  const seen = new Set<string>();
  const out: SectBuildingSpot[] = [];
  buildings.forEach((b, index) => {
    if (!b || seen.has(b.name)) return;
    seen.add(b.name);
    out.push({ name: b.name, kindId: getSectTileKind(layout[index]).id as FacilityKindId });
  });
  return out;
}

/** 名录里的建筑全表，供营造时挑选用 */
export function allSectBuildings(): SectBuildingSpec[] {
  return BUILDINGS.map((b) => ({ ...textureUrlOf(b), kind: b.kind as FacilityKindId }));
}

/**
 * 按名号取一座建筑的名目、贴图与用场。
 * 名录里没有的（玩家自拟的那几座），给了类别便照那一类借一张贴图，名号仍用它自己的；
 * 类别也没给就返回 undefined，那一格便不铺图。
 */
export function sectBuildingSpec(name: string, borrowKind?: FacilityKindId): SectBuildingSpec | undefined {
  const b = BUILDINGS.find((x) => x.name === name);
  if (b) return { ...textureUrlOf(b), kind: b.kind as FacilityKindId };
  if (!borrowKind) return undefined;
  const donor = BUILDINGS.find((x) => x.kind === borrowKind);
  return donor ? { ...textureUrlOf(donor), name, kind: borrowKind } : undefined;
}
