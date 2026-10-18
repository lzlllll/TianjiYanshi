/**
 * 全程叙事的留存与导出。
 *
 * 推演本身不改：仍旧只带压缩摘要与近几轮正文。
 * 这里另攒一份原样的叙事正文，开了设置里的「保留全程叙事」才记，
 * 日后可整本导出成纯文本。
 */

import type { NarrativeEntry } from "@/data/types";

/** 最多留多少回：整本另存在本机，长到这个数已够一世之用，再多怕撑破本地存储 */
const MAX_ENTRIES = 1000;

/** 收下这一回；同一轮重演时照 id 替换，不另起一条 */
export function recordNarrative(
  log: NarrativeEntry[] | undefined,
  entry: NarrativeEntry,
): NarrativeEntry[] {
  const list = Array.isArray(log) ? log : [];
  const at = list.findIndex((e) => e.id === entry.id);
  if (at === -1) return [...list, entry].slice(-MAX_ENTRIES);
  const next = list.slice();
  next[at] = entry;
  return next;
}

/** 玩家那一句行动若是整段开局的长文，导出时只留个头，免得压过正文 */
function briefInput(input: string): string {
  const text = (input || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 120 ? `${text.slice(0, 120)}……` : text;
}

/** 把攒下的全文理成一本可读的纯文本 */
export function buildNarrativeText(
  entries: NarrativeEntry[],
  header: { title: string; player: string; exportedAt: string },
): string {
  const list = Array.isArray(entries) ? entries : [];
  const lines: string[] = [
    `《${header.title}》叙事全录`,
    "",
    `角色：${header.player}`,
    `回目：${list.length} 回`,
    `导出：${header.exportedAt}`,
    "",
  ];

  list.forEach((entry, index) => {
    const where = [entry.timeLabel, entry.place].filter(Boolean).join(" · ");
    lines.push("────────────────────────────");
    lines.push(`第 ${index + 1} 回${where ? ` · ${where}` : ""}`);
    const input = briefInput(entry.input);
    if (input) lines.push(`你：${input}`);
    lines.push("");
    lines.push(entry.narrative.trim());
    lines.push("");
  });

  return lines.join("\n");
}
