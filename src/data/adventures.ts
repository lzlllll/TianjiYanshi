/**
 * 奇遇：舆图上预设点位上开出的机缘。
 *
 * 开发者先在舆图上圈下若干预设点位（见 src/data/map/presets.ts），
 * 宗门占去一些，余下的便空着。奇遇就落在这些空位上：
 *   - 或由叙事牵出（正文里写出一处秘境、遗迹、异象，用 add adventures 记下）；
 *   - 或由天意现掷（时间推进时按概率请模型现编一桩）。
 *
 * 去处不凭空编——只从真有的预设点位里挑，且与玩家所在的那一带相合：
 * 于玩家而言照「只由叙事推动位置」的规矩，人到了它所在的那一带，才寻得着、进得去。
 */

import { WORLD_SCENE_ID, getCityMarkers, getScenePresetPoints } from "@/data/map";
import { presetKey } from "@/data/map/presets";
import type {
  Adventure,
  GameState,
  QuestPenaltyKind,
  QuestRewardKind,
} from "@/data/types";

/** 同一时刻至多开着几处奇遇，多了反而不稀罕 */
export const ADVENTURE_OPEN_MAX = 6;

/** 奇遇类别：生成时照这几个里挑，叙事另拟的也归入其一 */
export const ADVENTURE_KINDS = ["秘境", "遗迹", "机缘", "凶险", "异象"] as const;

/** 凶险程度 1 至 5 的说法 */
export function dangerLabel(danger: number): string {
  const n = Math.max(1, Math.min(5, Math.trunc(Number(danger)) || 1));
  return ["", "平和", "微险", "涉险", "凶险", "绝境"][n];
}

/** 一处点位属于哪座城的一带：照离它最近的城 */
export function nearestCityIdOf(point: { x: number; y: number }): string | undefined {
  const cities = getCityMarkers();
  if (cities.length === 0) return undefined;
  let best = cities[0];
  let bestDist = Infinity;
  for (const city of cities) {
    const dist = (city.x - point.x) ** 2 + (city.y - point.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  return best.id;
}

/** 一处点位眼下还空着没有：宗门没立在这儿，也没有未了的奇遇占着 */
function freePresetKeys(state: Pick<GameState, "sectSites" | "adventures">): Set<string> {
  const used = new Set<string>();
  for (const site of Array.isArray(state.sectSites) ? state.sectSites : []) {
    if (site?.sceneId) used.add(presetKey(site));
  }
  for (const adv of Array.isArray(state.adventures) ? state.adventures : []) {
    // 撤了的奇遇不再占位，日后再开时还能落回原处；留着的仍占着
    if (adv?.sceneId && adv.status !== "done") used.add(presetKey(adv));
  }
  return used;
}

/** 眼下还空着、可开奇遇的预设点位 */
export function freeAdventurePoints(
  state: Pick<GameState, "sectSites" | "adventures">,
  sceneId: string = WORLD_SCENE_ID,
): { sceneId: string; x: number; y: number }[] {
  const used = freePresetKeys(state);
  return getScenePresetPoints(sceneId)
    .filter((p) => !used.has(presetKey(p)))
    .map((p) => ({ sceneId: p.sceneId, x: p.x, y: p.y }));
}

/** 这一处点位眼下还空着没有：宗门没立在这儿，也没有未了的奇遇占着 */
export function isPresetFree(
  state: Pick<GameState, "sectSites" | "adventures">,
  spot: { sceneId: string; x: number; y: number },
): boolean {
  return !freePresetKeys(state).has(presetKey(spot));
}

/**
 * 挑一处空位开奇遇。
 * 给了 preferCityId 便优先挑落在那一带的空位——多半是玩家眼下所在之处；
 * 那一带没有空位，便退而任取一处。
 */
export function pickAdventureSpot(
  state: Pick<GameState, "sectSites" | "adventures">,
  preferCityId?: string,
): { sceneId: string; x: number; y: number } | undefined {
  const free = freeAdventurePoints(state);
  if (free.length === 0) return undefined;
  if (preferCityId) {
    const near = free.filter((p) => nearestCityIdOf(p) === preferCityId);
    if (near.length > 0) return near[Math.floor(Math.random() * near.length)];
  }
  return free[Math.floor(Math.random() * free.length)];
}

/** 只在某一座城那一带的空位里挑一处；那一带没有空位便作罢 */
export function pickAdventureSpotNear(
  state: Pick<GameState, "sectSites" | "adventures">,
  cityId: string,
): { sceneId: string; x: number; y: number } | undefined {
  if (!cityId) return undefined;
  const near = freeAdventurePoints(state).filter((p) => nearestCityIdOf(p) === cityId);
  if (near.length === 0) return undefined;
  return near[Math.floor(Math.random() * near.length)];
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

const REWARD_KINDS: QuestRewardKind[] = ["灵石", "修为", "物品", "人情", "正道名声", "魔道名声", "平民名声", "官府名声"];
const PENALTY_KINDS: QuestPenaltyKind[] = ["灵石", "修为", "业力", "正道名声", "魔道名声", "平民名声", "官府名声"];

const asRewardKind = (v: unknown): QuestRewardKind | undefined =>
  REWARD_KINDS.includes(v as QuestRewardKind) ? (v as QuestRewardKind) : undefined;
const asPenaltyKind = (v: unknown): QuestPenaltyKind | undefined =>
  PENALTY_KINDS.includes(v as QuestPenaltyKind) ? (v as QuestPenaltyKind) : undefined;

/**
 * 把一段来路（叙事写下的 payload，或生成时模型吐的 JSON）归一成一桩奇遇。
 * 去处只认预设点位：挑一处空位钉上去，就近归到一座城的一带。
 * 空位挑不出来（都占满了）便作罢，宁可不生，也不往图上硬塞一处走不到的地方。
 */
export function normalizeAdventure(
  raw: unknown,
  ctx: {
    state: Pick<GameState, "sectSites" | "adventures">;
    preferCityId?: string;
    /** 直接指定落点；不填则从空位里现挑 */
    spot?: { sceneId: string; x: number; y: number };
    /** 归到哪座城的一带；不填则照落点就近算 */
    cityId?: string;
    day?: number;
    origin?: "story" | "random";
  },
): Adventure | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  const name = clip(src.name, 20);
  if (!name) return null;

  const spot = ctx.spot ?? pickAdventureSpot(ctx.state, ctx.preferCityId);
  if (!spot) return null;
  const cityId = ctx.cityId || nearestCityIdOf(spot);
  if (!cityId) return null;

  const dangerRaw = Number(src.danger);
  const danger = Math.max(1, Math.min(5, Number.isFinite(dangerRaw) ? Math.round(dangerRaw) : 2));

  const rewardKind = asRewardKind(src.rewardKind);
  const rewardAmount = rewardKind ? Math.max(0, Math.trunc(Number(src.rewardAmount) || 0)) : undefined;
  const penaltyKind = asPenaltyKind(src.penaltyKind);
  const penaltyAmount = penaltyKind ? Math.max(0, Math.trunc(Number(src.penaltyAmount) || 0)) : undefined;

  const kindText = clip(src.kind, 8) || ADVENTURE_KINDS[danger >= 4 ? 3 : 2];

  return {
    id: clip(src.id, 40) || `adv-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
    sceneId: spot.sceneId,
    x: spot.x,
    y: spot.y,
    cityId,
    name,
    summary: clip(src.summary ?? src.desc, 160),
    kind: kindText,
    danger,
    ...(clip(src.reward, 40) ? { reward: clip(src.reward, 40) } : {}),
    ...(rewardKind ? { rewardKind } : {}),
    ...(rewardAmount !== undefined ? { rewardAmount } : {}),
    ...(clip(src.penalty, 40) ? { penalty: clip(src.penalty, 40) } : {}),
    ...(penaltyKind ? { penaltyKind } : {}),
    ...(penaltyAmount !== undefined ? { penaltyAmount } : {}),
    status: "open",
    ...(src.persistent === true || src.persistent === "是" ? { persistent: true } : {}),
    day: Math.max(0, Math.trunc(Number(ctx.day) || 0)),
    origin: ctx.origin ?? "story",
  };
}

/** 眼下还开着、未了的奇遇 */
export function openAdventures(state: Pick<GameState, "adventures">): Adventure[] {
  return (Array.isArray(state.adventures) ? state.adventures : []).filter((a) => a?.status === "open");
}

/**
 * 这一处奇遇玩家够不够得着：人得亲至它那处点位。
 * 位置只由叙事推动，故玩家在问道里行至那一处，才算到了地头。
 */
export function adventureReachable(
  adventure: Adventure | undefined,
  state: Pick<GameState, "currentAdventureId">,
): boolean {
  return !!adventure && adventure.status === "open" && state.currentAdventureId === adventure.id;
}

/**
 * 这一处眼下进不进得去：人须亲至它那处点位，且还没撤去。
 * 了结后留在此处的（persistent）日后仍可再进，故不因 status 为 done 而挡住。
 */
export function adventureEnterable(
  adventure: Adventure | undefined,
  state: Pick<GameState, "currentAdventureId">,
): boolean {
  if (!adventure) return false;
  if (state.currentAdventureId !== adventure.id) return false;
  return adventure.status === "open" || !!adventure.persistent;
}

/** 归处写给人看，如「长安一带」 */
export function adventureWhere(adventure: Adventure): string {
  const city = getCityMarkers().find((c) => c.id === adventure.cityId);
  return city ? `${city.name}一带` : "舆图某处";
}
