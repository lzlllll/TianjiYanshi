/**
 * 势力图的取色：立了门户的各家各取一支固定的颜色，本门另用一色，
 * 舆图上的城、村、山门图标便照这一份染出来，一眼分得清谁家。
 */

/** 一撮可分辨的颜色，按势力名目定死取一支 */
export const FACTION_PALETTE = [
  "#c2543a",
  "#3f7d63",
  "#4a6fa5",
  "#8a6a34",
  "#7a4a7a",
  "#2f7d8a",
  "#a04a2a",
  "#5a7a3a",
  "#8a4a5a",
  "#4a5a8a",
];

/** 本门另用一色，好与旁家分得开 */
export const MINE_FACTION_COLOR = "#c9a24a";

/** 照名目取一支固定的颜色；本门另给一色 */
export function factionColor(ownerId: string, mine?: boolean): string {
  if (mine) return MINE_FACTION_COLOR;
  const seed = [...String(ownerId)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return FACTION_PALETTE[seed % FACTION_PALETTE.length];
}
