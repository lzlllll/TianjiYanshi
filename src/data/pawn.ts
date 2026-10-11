/**
 * 当铺。
 *
 * 一件东西押进去，当场换回七成价钱的灵石；当票压在柜上，
 * 过了期限还不来赎，那件东西就归了当铺，再无话说。
 * 赎只能回押出去的那一家——当票跟着铺子走，别家不认。
 */

import { itemSalePrice } from "@/data/goods";
import type { InventoryItem, PawnTicket } from "@/data/types";

/** 当票的期限，按日算；过了这个数就是死当 */
export const PAWN_DAYS = 30;

/**
 * 押 n 件能当回多少灵石。
 * 当价照铺子里肯出的价算——那本就是行价的七成，当铺不另压价。
 */
export function pawnPrice(item: InventoryItem, count = 1): number {
  const held = Math.max(1, Math.trunc(item.count) || 1);
  const take = Math.max(1, Math.min(Math.trunc(count) || 1, held));
  return Math.max(1, Math.round((itemSalePrice(item) / held) * take));
}

/** 这张当票是不是已经误了期 */
export function isPawnOverdue(ticket: PawnTicket, today: number): boolean {
  return !!ticket && today > ticket.dueDay;
}

/** 还压在柜上、也还没到期的那些 */
export function alivePawns(pawns: PawnTicket[] | undefined, today: number): PawnTicket[] {
  return (Array.isArray(pawns) ? pawns : []).filter((t) => t && !isPawnOverdue(t, today));
}

/** 一家铺子柜上存着的当票 */
export function pawnsAtShop(
  pawns: PawnTicket[] | undefined,
  cityId: string,
  districtId: number,
  shopId: string,
): PawnTicket[] {
  return (Array.isArray(pawns) ? pawns : []).filter(
    (t) => t && t.cityId === cityId && t.districtId === districtId && t.shopId === shopId,
  );
}

/** 还差几日到期 */
export function daysLeft(ticket: PawnTicket, today: number): number {
  return Math.max(0, ticket.dueDay - today);
}
