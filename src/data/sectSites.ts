/**
 * 宗门点位。
 *
 * 宗门不另圈地方，占的是开发者预先在图上记下的那些位置——见 game_data/presets.json，
 * 与开发者模式下双击舆图现点的那些是同一批。开局照六处文化圈各挑三到五处现成的点位，
 * 一一拼出名号、四类词条与那一副底子；一处预设点位归哪个文化圈，
 * 看它离哪座城最近，那座城的文化便是它的。
 *
 * 圈下的点位不够三处的，那一圈便少几处宗门：生成时在控制台里报一声，
 * 开发者模式下的「预设点位」面板上也写着还差多少。要添地方，就在舆图上双击。
 *
 * 玩家自己报过宗门名号的，会在本地的几处里认下一处作本门。
 */

import { WORLD_SCENE_ID, getCityMarkers, getScenePresetPoints, getSectMapTemplates } from "@/data/map";
import {
  SECT_CULTURES,
  SECT_LEVEL_MAX,
  SECT_TERM_LABELS,
  findSectTerm,
  normalizeSectCulture,
  rollSectDraft,
  rollSectMapType,
  type SectTermKind,
} from "@/data/sects";
import type { MapMarker, PresetPoint, Sect, SectMapTemplate, SectPosition, SectSite, SectSiteTerm } from "@/data/types";

/** 每个文化圈至少要有几处预设点位，才够开三到五处宗门 */
export const SECT_SITES_MIN = 3;
export const SECT_SITES_MAX = 5;

/** 离这个位置最近的那座城；一处都没有便没有 */
function nearestCity(point: { x: number; y: number }, cities: MapMarker[]): MapMarker | undefined {
  let best: MapMarker | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const city of cities) {
    const gap = Math.hypot(city.x - point.x, city.y - point.y);
    if (gap < bestGap) {
      bestGap = gap;
      best = city;
    }
  }
  return best;
}

/** 一处预设点位算哪个文化圈的：照离它最近的那座城 */
export function presetCulture(point: { x: number; y: number }, cities: MapMarker[]): string {
  return normalizeSectCulture(nearestCity(point, cities)?.culture);
}

/** 世界图上圈下的点位，按文化圈分好 */
export function presetsByCulture(): Record<string, PresetPoint[]> {
  const cities = getCityMarkers();
  const grouped: Record<string, PresetPoint[]> = {};
  for (const culture of SECT_CULTURES) grouped[culture] = [];
  for (const point of getScenePresetPoints(WORLD_SCENE_ID)) {
    const culture = presetCulture(point, cities);
    if (!grouped[culture]) grouped[culture] = [];
    grouped[culture].push(point);
  }
  return grouped;
}

/**
 * 六地各自圈下的点位够不够：够三处便算齐，差多少一并报出来。
 * 开发者模式下「预设点位」面板照这份单子提醒，生成宗门时也照它发一句警告。
 */
export function sectSiteCoverage(): { culture: string; available: number; short: number }[] {
  const grouped = presetsByCulture();
  return SECT_CULTURES.map((culture) => {
    const available = grouped[culture]?.length ?? 0;
    return { culture, available, short: Math.max(0, SECT_SITES_MIN - available) };
  });
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 照地势挑一张宗门图模板；这一类没有就随便挑一张，一张都没有便留空 */
function pickTemplate(
  templates: SectMapTemplate[],
  mapType: string,
  rand: () => number,
): SectMapTemplate | undefined {
  if (templates.length === 0) return undefined;
  const matching = templates.filter((t) => t.mapType === mapType);
  const pool = matching.length > 0 ? matching : templates;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/**
 * 掷出这一局的宗门：六处文化圈各占三到五处预设点位。
 * 哪一圈没有预设点位，哪一圈便没有宗门——那几处会在控制台里报出来。
 */
export function rollSectSites(rand: () => number = Math.random): SectSite[] {
  const cities = getCityMarkers();
  if (cities.length === 0) return [];

  const grouped = presetsByCulture();
  const templates = getSectMapTemplates();
  const used = new Set<string>();
  const sites: SectSite[] = [];
  let seq = 0;

  for (const culture of SECT_CULTURES) {
    const pool = grouped[culture] ?? [];
    if (pool.length === 0) continue;
    const want = Math.min(
      pool.length,
      SECT_SITES_MIN + Math.floor(rand() * (SECT_SITES_MAX - SECT_SITES_MIN + 1)),
    );

    for (const spot of shuffle(pool, rand).slice(0, want)) {
      const mapType = rollSectMapType(culture, rand);
      const draft = rollSectDraft({
        culture,
        cityName: nearestCity(spot, cities)?.name ?? "",
        mapType,
        used,
        rand,
      });
      used.add(draft.name);
      const template = pickTemplate(templates, mapType.id, rand);

      sites.push({
        id: `sect-${++seq}`,
        sceneId: WORLD_SCENE_ID,
        x: spot.x,
        y: spot.y,
        culture,
        name: draft.name,
        seat: draft.seat,
        mapType: mapType.id,
        ...(template ? { templateId: template.id } : {}),
        // 说明随手记一份，写提示词与摊界面时都不必再翻词条表
        nature: {
          id: draft.combo.nature,
          name: draft.composed.terms.nature,
          note: findSectTerm("nature", draft.combo.nature, culture)?.note ?? "",
        },
        climate: {
          id: draft.combo.climate,
          name: draft.composed.terms.climate,
          note: findSectTerm("climate", draft.combo.climate, culture)?.note ?? "",
        },
        feature: {
          id: draft.combo.feature,
          name: draft.composed.terms.feature,
          note: findSectTerm("feature", draft.combo.feature, culture)?.note ?? "",
        },
        start: {
          id: draft.combo.start,
          name: draft.composed.terms.start,
          note: findSectTerm("start", draft.combo.start, culture)?.note ?? "",
        },
        level: draft.composed.level,
        reputation: draft.composed.reputation,
        elders: draft.composed.elders,
        disciples: draft.composed.disciples,
        appearance: draft.composed.appearance,
        reputationDesc: draft.composed.reputationDesc,
        surroundings: draft.composed.surroundings,
      });
    }
  }

  const short = sectSiteCoverage().filter((row) => row.short > 0);
  if (short.length > 0) {
    console.warn(
      `[宗门] 预设点位不够，这几处文化圈的宗门会少：${short
        .map((row) => `${row.culture} 只有 ${row.available} 处，还差 ${row.short} 处`)
        .join("；")}。开发者模式下在舆图上双击空处可添点位。`,
    );
  }

  return sites;
}

/** 玩家报过的宗门名号；没填或自认散修便算没有 */
export function playerSectName(raw: string | undefined): string {
  const name = String(raw ?? "").trim();
  return name && name !== "散修" ? name : "";
}

/** 名号末尾那些只作点缀的字：判是不是同一处山门时先抹去 */
const SECT_NAME_TAILS = [
  "宗", "门", "派", "阁", "观", "院", "寺", "殿", "堂", "楼",
  "庵", "祠", "宫", "府", "城", "堡", "寨", "谷", "坞", "涧",
  "岛", "洲", "屿", "洞", "窟", "庄", "坪", "山",
];

/**
 * 一个宗名的「内核」：抹去末尾的地貌字与常见门号，
 * 白鹿院、白鹿涧、白鹿洞、白鹿洲 便都归到「白鹿」名下。
 * 抹完不足两字的照旧留着（「蛊楼」不抹作「蛊」），抹空了便返回原名。
 */
export function sectNameCore(raw: string | undefined): string {
  const name = String(raw ?? "").trim();
  if (!name) return "";
  let core = name;
  for (;;) {
    const tail = SECT_NAME_TAILS.find((t) => core.endsWith(t) && core.length - t.length >= 2);
    if (!tail) break;
    core = core.slice(0, -tail.length);
  }
  return core || name;
}

/**
 * 舆图上与这个名号算同一处的那一家。
 *
 * 一字不差的自然算；同一带里名号内核相同的也算——叙事把「白鹿涧」写成了「白鹿洞」，
 * 那是同一处山门被写岔了一个字，不该在图上另立一处。
 * 本门另当别论：内核与本门相同而写着别一字的，哪一带都不许另立。
 */
export function findSameSectSite(
  existing: SectSite[],
  name: string,
  culture?: string,
): SectSite | undefined {
  const list = Array.isArray(existing) ? existing : [];
  const want = String(name ?? "").trim();
  if (!want) return undefined;

  const exact = list.find((s) => String(s?.name ?? "").trim() === want);
  if (exact) return exact;

  const core = sectNameCore(want);
  if (!core) return undefined;
  const near = list.filter((s) => !!s?.name && sectNameCore(s.name) === core);
  if (near.length === 0) return undefined;

  const here = normalizeSectCulture(culture);
  const local = near.find((s) => normalizeSectCulture(s.culture) === here);
  if (local) return local;
  return near.find((s) => s.mine);
}

/**
 * 叙事里提到一处本局舆图上还没有的宗门时，由它自述的信息。
 * 名号必写，其余给多少算多少。
 */
export interface SectSiteSpec {
  name?: string;
  culture?: string;
  seat?: string;
  nature?: string;
  climate?: string;
  feature?: string;
  start?: string;
  level?: number;
  reputation?: number;
  elders?: number;
  disciples?: number;
  appearance?: string;
  reputationDesc?: string;
  surroundings?: string;
}

/** 在这一圈里挑一处还空着的预设点位；都占满了，便落在这一圈最近的城边上 */
function pickSectSpot(
  culture: string,
  existing: SectSite[],
  cities: MapMarker[],
): { x: number; y: number } | null {
  const free = (presetsByCulture()[culture] ?? []).filter(
    (p) => !existing.some((s) => Math.hypot((Number(s?.x) || 0) - p.x, (Number(s?.y) || 0) - p.y) < 18),
  );
  if (free.length > 0) return { x: free[0].x, y: free[0].y };

  const city = cities.find((c) => normalizeSectCulture(c.culture) === culture);
  if (!city) return null;
  const n = existing.filter((s) => s?.culture === culture).length;
  return { x: city.x + 26 + (n % 4) * 14, y: city.y + 26 + Math.floor(n / 4) * 14 };
}

/**
 * 照一份自述现立一处宗门点位：名号、驻地、词条与底子照给的写，
 * 没给到的照那一圈的风物现掷一份补上。
 *
 * 舆图上已有同名的一处便不另立——叙事照那一处写就是，免得同一处山门冒出两个。
 * 名号为空、或那一圈连个落脚处都寻不着，则返回 null。
 */
export function composeSectSite(
  spec: SectSiteSpec,
  existing: SectSite[],
  fallbackCulture?: string,
): SectSite | null {
  const name = String(spec?.name ?? "").trim().slice(0, 20);
  const list = Array.isArray(existing) ? existing : [];
  if (!name) return null;
  // 没说在哪一带，就按玩家眼下的文化圈落点
  const culture = normalizeSectCulture(spec?.culture || fallbackCulture);
  // 名号近似的也算同一处：白鹿涧、白鹿院、白鹿洞、白鹿洲 只许留一处
  if (findSameSectSite(list, name, culture)) return null;

  const cities = getCityMarkers();
  if (cities.length === 0) return null;

  const spot = pickSectSpot(culture, list, cities);
  if (!spot) return null;

  const mapType = rollSectMapType(culture);
  const used = new Set(list.map((s) => s?.name).filter((n): n is string => !!n));
  const draft = rollSectDraft({
    culture,
    cityName: nearestCity(spot, cities)?.name ?? "",
    mapType,
    used,
    rand: Math.random,
  });

  const num = (given: unknown, current: number) => {
    const n = Math.trunc(Number(given));
    return Number.isFinite(n) && n > 0 ? Math.min(9999, n) : current;
  };
  const text = (given: unknown, current: string) => String(given ?? "").trim() || current;
  // 自造的词条照「ai」记下：名目照给的写，说明留空
  const term = (given: unknown, current: SectSiteTerm): SectSiteTerm => {
    const v = String(given ?? "").trim();
    return v ? { id: "ai", name: v.slice(0, 12), note: "" } : current;
  };
  const rolled = (kind: SectTermKind, id: string, nameOf: string): SectSiteTerm => ({
    id,
    name: nameOf,
    note: findSectTerm(kind, id, culture)?.note ?? "",
  });

  const taken = new Set(list.map((s) => s?.id));
  let seq = list.length + 1;
  while (taken.has(`sect-${seq}`)) seq += 1;

  return {
    id: `sect-${seq}`,
    sceneId: WORLD_SCENE_ID,
    x: spot.x,
    y: spot.y,
    culture,
    name,
    seat: text(spec?.seat, draft.seat),
    mapType: mapType.id,
    nature: term(spec?.nature, rolled("nature", draft.combo.nature, draft.composed.terms.nature)),
    climate: term(spec?.climate, rolled("climate", draft.combo.climate, draft.composed.terms.climate)),
    feature: term(spec?.feature, rolled("feature", draft.combo.feature, draft.composed.terms.feature)),
    start: term(spec?.start, rolled("start", draft.combo.start, draft.composed.terms.start)),
    level: Math.max(1, Math.min(SECT_LEVEL_MAX, num(spec?.level, draft.composed.level))),
    reputation: num(spec?.reputation, draft.composed.reputation),
    elders: num(spec?.elders, draft.composed.elders),
    disciples: num(spec?.disciples, draft.composed.disciples),
    appearance: text(spec?.appearance, draft.composed.appearance),
    reputationDesc: text(spec?.reputationDesc, draft.composed.reputationDesc),
    surroundings: text(spec?.surroundings, draft.composed.surroundings),
  };
}

/**
 * 认下本门时，把开局 AI 生成的那副底子并到点位上。
 * 数字与字面都照「有值才抄」的规矩来：没给到的，一律留下点位上原有的值，不抹掉。
 */
function claimedFieldsFromSect(site: SectSite, sect: Sect | undefined): Partial<SectSite> {
  if (!sect) return {};
  const num = (given: unknown, current: number) => {
    const n = Number(given);
    return Number.isFinite(n) && n !== 0 ? n : current;
  };
  const text = (given: unknown, current: string) => String(given ?? "").trim() || current;
  const term = (given: SectSiteTerm | undefined, current: SectSiteTerm) =>
    given && given.name ? { ...given } : current;

  return {
    level: num(sect.level, site.level),
    reputation: num(sect.reputation, site.reputation),
    elders: num(sect.elders, site.elders),
    disciples: num(sect.disciples, site.disciples),
    appearance: text(sect.appearance, site.appearance),
    reputationDesc: text(sect.reputationDesc, site.reputationDesc),
    surroundings: text(sect.surroundings, site.surroundings),
    // 驻地照 AI 给的写，没给便用掷点留下的那处
    seat: text(sect.territory, site.seat),
    nature: term(sect.nature, site.nature),
    climate: term(sect.climate, site.climate),
    feature: term(sect.feature, site.feature),
    start: term(sect.start, site.start),
  };
}

/**
 * 把本地的某一处认作玩家的宗门：名号换成玩家报的那个，缀上 mine，
 * 一并把开局 AI 生成的那副底子（等级、规模、气象与四类词条）抄到点位上。
 * 认哪一处看玩家眼下在哪一带；那一带没有就退一步挑第一处。
 */
export function claimPlayerSect(
  sites: SectSite[],
  name: string,
  sect?: Sect,
  culture?: string,
): SectSite[] {
  if (!name || sites.length === 0 || sites.some((s) => s.mine)) return sites;

  const want = normalizeSectCulture(culture);
  let index = sites.findIndex((s) => s.culture === want);
  if (index < 0) index = 0;
  return sites.map((s, i) =>
    i === index ? { ...s, ...claimedFieldsFromSect(s, sect), name, mine: true } : s,
  );
}

/** 一处宗门的四类词条，按界面上的次序排好；说明按编号现查，查不到就只报名目 */
export function sectSiteTerms(site: SectSite): { label: string; name: string; note: string }[] {
  const rows: { kind: SectTermKind; label: string; term: SectSiteTerm }[] = [
    { kind: "nature", label: SECT_TERM_LABELS.nature, term: site.nature },
    { kind: "climate", label: SECT_TERM_LABELS.climate, term: site.climate },
    { kind: "feature", label: SECT_TERM_LABELS.feature, term: site.feature },
    { kind: "start", label: SECT_TERM_LABELS.start, term: site.start },
  ];
  return rows.map((row) => ({
    label: row.label,
    name: row.term.name,
    // 存档里记着说明便用现成的，旧档没有再去翻词条表
    note: row.term.note || findSectTerm(row.kind, row.term.id, site.culture)?.note || "",
  }));
}

// ---------------- 开宗立派 ----------------

/** 开山立派要花的一笔下品灵石 */
export const SECT_FOUND_STONE_COST = 5000;

/** 一处点位落在哪座城的哪一方，配成驻地写法，如「长安西南外的山谷」 */
function seatTextOf(point: { x: number; y: number }, cities: MapMarker[], culture: string): string {
  const city = nearestCity(point, cities);
  if (!city) return `${culture}一处山谷`;
  // 图上纵轴向下为大，故 y 大的一头是南
  const ns = point.y >= city.y ? "南" : "北";
  const ew = point.x >= city.x ? "东" : "西";
  return `${city.name}${ns}${ew}外的山谷`;
}

/** 一处空地点位的说法：归哪个文化圈、驻地在哪儿，供开宗立派时挑选与展示 */
export function describeFoundingSpot(point: { x: number; y: number }): { culture: string; seat: string } {
  const cities = getCityMarkers();
  const culture = presetCulture(point, cities);
  return { culture, seat: seatTextOf(point, cities, culture) };
}

/** 玩家自己填的那一份宗门信息 */
export interface FoundingSectInput {
  name: string;
  spot: { x: number; y: number };
  nature: SectSiteTerm;
  climate: SectSiteTerm;
  feature: SectSiteTerm;
  start: SectSiteTerm;
  appearance?: string;
  reputationDesc?: string;
  surroundings?: string;
}

/**
 * 照玩家自己填的信息，在挑定的点位上立起一处新宗门。
 * 新立之门只有一座主殿：等级记 0，山门图据此削去其余建筑；
 * 门下尚无人，长老与弟子一概为零。名号已有人用便立不成。
 */
export function buildFoundingSite(input: FoundingSectInput, existing: SectSite[]): SectSite | null {
  const name = String(input?.name ?? "").trim().slice(0, 20);
  if (!name) return null;
  const list = Array.isArray(existing) ? existing : [];
  if (list.some((s) => s?.name === name)) return null;
  const { culture, seat } = describeFoundingSpot(input.spot);
  const taken = new Set(list.map((s) => s?.id));
  let seq = list.length + 1;
  while (taken.has(`sect-${seq}`)) seq += 1;
  return {
    id: `sect-${seq}`,
    sceneId: WORLD_SCENE_ID,
    x: input.spot.x,
    y: input.spot.y,
    culture,
    name,
    seat,
    mapType: rollSectMapType(culture).id,
    mine: true,
    nature: { ...input.nature },
    climate: { ...input.climate },
    feature: { ...input.feature },
    start: { ...input.start },
    level: 0,
    reputation: 0,
    elders: 0,
    disciples: 0,
    appearance: String(input.appearance ?? "").trim(),
    reputationDesc: String(input.reputationDesc ?? "").trim(),
    surroundings: String(input.surroundings ?? "").trim(),
  };
}

/** 新立之门的职位树：眼下只开山掌门一人 */
export function foundingPositions(): SectPosition[] {
  return [
    {
      id: "leader",
      name: "掌门",
      level: 4,
      contributionNeeded: 0,
      privilege: "开山立派之人，执掌本门，总理诸事。",
      isCurrent: true,
      unlocked: true,
    },
  ];
}
