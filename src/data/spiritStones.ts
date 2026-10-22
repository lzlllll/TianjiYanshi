import type { SpiritStones } from "@/data/types";

/** 一块上级灵石折一百块下一级：中品折下品、上品折中品、极品折上品 */
export const STONE_EXCHANGE_RATE = 100;

const count = (raw: unknown): number => Math.max(0, Math.trunc(Number(raw) || 0));

/** 手头的灵石折成下品来算，看看到底有多少购买力 */
export function lowStonesWorth(stones: SpiritStones | undefined): number {
  return (
    count(stones?.low) +
    count(stones?.mid) * STONE_EXCHANGE_RATE +
    count(stones?.high) * STONE_EXCHANGE_RATE ** 2 +
    count(stones?.supreme) * STONE_EXCHANGE_RATE ** 3
  );
}

/**
 * 下品灵石不够付这一笔时，自动从上级兑换下来：
 * 极品换上品、上品换中品、中品换下品，一律一比一百，兑出来的整份都留在下一级里。
 * 返回兑好之后的一本账；兑尽了仍不够，返回 null。
 */
export function prepareLowStones(
  stones: SpiritStones | undefined,
  amount: number,
): SpiritStones | null {
  const need = Math.max(0, Math.ceil(Number(amount) || 0));
  const next: SpiritStones = {
    low: count(stones?.low),
    mid: count(stones?.mid),
    high: count(stones?.high),
    supreme: count(stones?.supreme),
  };
  if (next.low >= need) return next;

  while (next.low < need && next.supreme > 0) {
    next.supreme -= 1;
    next.high += STONE_EXCHANGE_RATE;
  }
  while (next.low < need && next.high > 0) {
    next.high -= 1;
    next.mid += STONE_EXCHANGE_RATE;
  }
  while (next.low < need && next.mid > 0) {
    next.mid -= 1;
    next.low += STONE_EXCHANGE_RATE;
  }
  return next.low >= need ? next : null;
}

/** 付一笔下品灵石：先按需兑换，再扣账；不够付时返回 null */
export function spendLowStones(stones: SpiritStones | undefined, amount: number): SpiritStones | null {
  const prepared = prepareLowStones(stones, amount);
  if (!prepared) return null;
  const cost = Math.max(0, Math.ceil(Number(amount) || 0));
  return { ...prepared, low: prepared.low - cost };
}
