/**
 * 跨月自动存档。
 *
 * 游戏时间每过一个月，便往存档夹里落一份「自动存档_年-月」；
 * 只保留最近五份自动存档，更早的顺手删掉，手动存的档一概不动。
 */

import { buildSavePayload } from "@/lib/saveGame";

const SAVES_API = "/api/saves";
export const AUTO_SAVE_PREFIX = "自动存档_";
export const MAX_AUTO_SAVES = 5;

interface SaveRecord {
  name: string;
  savedAt: number;
}

/** 跨月时写一份自动存档；成功与否都不出声，免得打断叙事 */
export async function autoSaveOnMonth(monthKey: string): Promise<void> {
  try {
    const res = await fetch(SAVES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${AUTO_SAVE_PREFIX}${monthKey}`,
        content: JSON.stringify(buildSavePayload()),
      }),
    });
    if (!res.ok) return;

    // 写完再列一次，把超出的旧自动存档删掉
    const listRes = await fetch(SAVES_API, { cache: "no-store" });
    if (!listRes.ok) return;
    const data = await listRes.json();
    const autos = (Array.isArray(data?.saves) ? (data.saves as SaveRecord[]) : [])
      .filter((s) => typeof s?.name === "string" && s.name.startsWith(AUTO_SAVE_PREFIX))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    for (const old of autos.slice(MAX_AUTO_SAVES)) {
      await fetch(`${SAVES_API}/${encodeURIComponent(old.name)}`, { method: "DELETE" });
    }
  } catch {
    /* 没有存档夹（如网页版）或写入失败，就跳过这一次自动存档 */
  }
}
