/**
 * 宗门地图模板。
 *
 * 宗门不跟城那样一一对应：城里是一城一份文件、以标点编号相认，
 * 宗门图只是布局底子——先备下几张，日后立宗门时挑一张来用。
 * 故一张模板认的是自己的编号与名目，不与任何地点绑定。
 *
 * 仓库里的 game_data/sectMaps.json 是随游戏发出去的那一份；
 * 编辑器里改的先存进浏览器本地，两份按编号叠合，编号相同以本地的为准。
 * 导出覆盖 sectMaps.json 才算长期生效——与城图编辑器是同一套做法。
 */

import type { SectMapTemplate } from "@/data/types";
import { findSectMapType } from "@/data/sects";
import { normalizeSectTiles } from "./sectTiles";

/** 本地暂存的宗门图模板，与城图编辑器同一个路数 */
export const LOCAL_SECT_MAPS_KEY = "xiuxian-sect-maps";

const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** 归一化一张模板；说不出编号的丢掉 */
export function normalizeSectTemplate(raw: unknown): SectMapTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;

  const id = clip(src.id, 40);
  if (!id) return null;

  // 地势认不出就当没写——留白便是「不限」，好过存一个谁也不认的编号
  const mapType = clip(src.mapType, 24);

  return {
    id,
    name: clip(src.name, 20) || id,
    tiles: normalizeSectTiles(src.tiles),
    ...(findSectMapType(mapType) ? { mapType } : {}),
  };
}

/** 同一编号只留一条：先前那张被后来的顶掉 */
export function normalizeSectTemplates(data: unknown): SectMapTemplate[] {
  const list = Array.isArray(data) ? data : [];
  const byId = new Map<string, SectMapTemplate>();
  for (const item of list) {
    const template = normalizeSectTemplate(item);
    if (template) byId.set(template.id, template);
  }
  return [...byId.values()];
}

/** 两份叠合：编号相同以本地的为准，本地新添的缀在后面 */
export function mergeSectTemplates(
  fileTemplates: SectMapTemplate[],
  localTemplates: SectMapTemplate[],
): SectMapTemplate[] {
  const byId = new Map<string, SectMapTemplate>();
  for (const template of fileTemplates) byId.set(template.id, template);
  for (const template of localTemplates) byId.set(template.id, template);
  return [...byId.values()];
}

export function readLocalSectMaps(): SectMapTemplate[] {
  try {
    const raw = localStorage.getItem(LOCAL_SECT_MAPS_KEY);
    if (!raw) return [];
    return normalizeSectTemplates(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeLocalSectMaps(templates: SectMapTemplate[]): void {
  try {
    localStorage.setItem(LOCAL_SECT_MAPS_KEY, JSON.stringify(templates));
  } catch {
    // 本地存不下（隐私模式、配额满）不算致命：这一局里模板仍然好使，只是刷新会丢
  }
}

export function clearLocalSectMaps(): void {
  try {
    localStorage.removeItem(LOCAL_SECT_MAPS_KEY);
  } catch {
    // 同上，清不掉也不影响这一局
  }
}

/** 现起一个编号：用过的最大的那个加一 */
export function nextSectTemplateId(templates: SectMapTemplate[]): string {
  let max = 0;
  for (const t of templates) {
    const found = /^tpl-(\d+)$/.exec(t.id);
    if (found) max = Math.max(max, Number(found[1]));
  }
  return `tpl-${max + 1}`;
}

/** 新开一张空白模板，名目按顺序排个占位的，如「宗门图 3」 */
export function emptySectTemplate(templates: SectMapTemplate[]): SectMapTemplate {
  return {
    id: nextSectTemplateId(templates),
    name: `宗门图 ${templates.length + 1}`,
    tiles: normalizeSectTiles(null),
  };
}

/** 导出成文件的样子 */
export function sectTemplateExportJson(template: SectMapTemplate): string {
  return JSON.stringify(template, null, 2);
}
