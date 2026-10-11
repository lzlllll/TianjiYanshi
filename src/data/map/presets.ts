/**
 * 预设点位。
 *
 * 只记一处位置：落在哪张图上、哪个坐标。名目、种类都留到真要开出来时再定，
 * 眼下只管把地方圈下，省得日后要添宗门或秘境时，对着舆图重新找地方。
 *
 * 仓库里的 game_data/presets.json 是随游戏发出去的那一份；开发者模式双击地图点的
 * 先存进浏览器本地，两份按位置叠合。导出覆盖 presets.json 才算长期生效——
 * 与城图编辑器是同一套做法。
 *
 * 位置本身就是这一处的身份，故不另起编号：同一个地方点两回只算一处。
 */

import type { PresetPoint } from "@/data/types";

/** 本地暂存的预设点位，与城图编辑器同一个路数 */
const LOCAL_PRESETS_KEY = "xiuxian-presets";

const round = (value: number) => Math.round(value);

const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** 一处的身份：所在地图加上取整后的坐标 */
export function presetKey(point: { sceneId: string; x: number; y: number }): string {
  return `${point.sceneId}:${round(point.x)},${round(point.y)}`;
}

/**
 * 归一化一处位置。坐标不是数的就丢掉——宁少一处，也不在地图上落一颗不知来路的子。
 * 早先版本写在点位上的名目、种类，这里一并读而不取，旧数据不至于读坏。
 */
export function normalizePreset(raw: unknown, defaultSceneId: string): PresetPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  const x = Number(src.x);
  const y = Number(src.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    sceneId: clip(src.sceneId, 40) || defaultSceneId,
    x: round(x),
    y: round(y),
    source: src.source === "local" ? "local" : "file",
  };
}

/** 同一处只留一条：先来的占位，后来的同号顶掉 */
export function normalizePresets(data: unknown, defaultSceneId: string): PresetPoint[] {
  const list = Array.isArray(data) ? data : [];
  const byKey = new Map<string, PresetPoint>();
  for (const item of list) {
    const point = normalizePreset(item, defaultSceneId);
    if (point) byKey.set(presetKey(point), point);
  }
  return [...byKey.values()];
}

/** 两份叠合：同一处以本地的为准，本地新点的缀在后面 */
export function mergePresets(filePresets: PresetPoint[], localPresets: PresetPoint[]): PresetPoint[] {
  const byKey = new Map<string, PresetPoint>();
  for (const point of filePresets) byKey.set(presetKey(point), point);
  for (const point of localPresets) byKey.set(presetKey(point), point);
  return [...byKey.values()];
}

export function readLocalPresets(): PresetPoint[] {
  try {
    const raw = localStorage.getItem(LOCAL_PRESETS_KEY);
    if (!raw) return [];
    // 本地存的都是开发者现点的，来源一律按 local 算，免得旧数据把来源写错
    return normalizePresets(JSON.parse(raw), "world").map((p) => ({ ...p, source: "local" as const }));
  } catch {
    return [];
  }
}

export function writeLocalPresets(points: PresetPoint[]): void {
  try {
    localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(points.map(toFileShape)));
  } catch {
    // 本地存不下（隐私模式、配额满）不算致命：这一局里点位仍然好使，只是刷新会丢
  }
}

export function clearLocalPresets(): void {
  try {
    localStorage.removeItem(LOCAL_PRESETS_KEY);
  } catch {
    // 同上，清不掉也不影响这一局
  }
}

/** 落成 presets.json 的样子：来源只是界面上的事，不写进文件 */
export function toFileShape(point: PresetPoint): Omit<PresetPoint, "source"> {
  return { sceneId: point.sceneId, x: point.x, y: point.y };
}

export function presetExportJson(points: PresetPoint[]): string {
  return JSON.stringify(points.map(toFileShape), null, 2);
}
