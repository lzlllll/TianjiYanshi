/**
 * 宝物阁的拍卖。
 *
 * 一场拍卖定在一日，到日子才开；进去之后拍品与来客由叙事现写，
 * 叫价则由本地按来客的预算与性子推演：每轮客人先应一声，
 * 连着三轮无人加价便落槌。散了之后来客不留在尘缘里。
 */

import type {
  Auction,
  AuctionBidder,
  AuctionLine,
  AuctionLot,
  InventoryItem,
  ItemGrade,
  Market,
  Shop,
} from "@/data/types";

/** 舆图上同时挂着的拍卖最多几场 */
export const AUCTION_MAX_OPEN = 2;

/** 从今日起隔几日开拍 */
export const AUCTION_NOTICE_DAYS: [number, number] = [2, 6];

/** 连着几轮无人加价便落槌 */
export const AUCTION_SILENT_ROUNDS = 3;

/** 一场最多叫几轮，免得没完没了 */
export const AUCTION_ROUND_MAX = 24;

/** 一场拍卖来几位客人 */
export const AUCTION_BIDDER_RANGE: [number, number] = [3, 5];

/** 拍卖的由头：本地掷，写在铺面与传闻里 */
const AUCTION_REASONS = [
  "阁里新收了一批旧物，掌柜要当众出手",
  "山上那位老客要散家当，托阁里代拍",
  "前朝旧藏开匣，城里有些脸面的人都来了",
  "走海外的行商带了一批货，只肯在阁里论价",
  "阁主七十大寿，取几件镇店之物出来应个景",
];

export function rollAuctionReason(): string {
  return AUCTION_REASONS[Math.floor(Math.random() * AUCTION_REASONS.length)];
}

/** 一次加价的幅度：一成的样子，至少五枚 */
export function auctionStep(price: number): number {
  const base = Math.max(0, Math.trunc(price));
  return Math.max(5, Math.round(base * 0.1));
}

/** 下一口该叫到多少 */
export function auctionNextBid(auc: Auction): number {
  const high = Math.max(0, Math.trunc(auc.highBid ?? 0));
  if (high > 0) return high + auctionStep(high);
  return Math.max(1, Math.trunc(auc.lot?.basePrice ?? 0));
}

/** 连着几轮没人加价，就算落了槌 */
export function auctionHammered(auc: Auction): boolean {
  return (auc.silent ?? 0) >= AUCTION_SILENT_ROUNDS || (auc.round ?? 0) >= AUCTION_ROUND_MAX;
}

/** 场上这话是谁说的；玩家自己单算 */
function line(who: string, text: string, price?: number, player?: boolean): AuctionLine {
  return price === undefined ? { who, text, player } : { who, text, price, player };
}

/** 只留最近这些句，免得一路堆下去 */
function trimLines(lines: AuctionLine[]): AuctionLine[] {
  return lines.slice(-24);
}

/**
 * 客人们应一轮价。
 * 出不起的搁牌退出；越想要越肯往上顶，快到预算时便迟疑。
 */
function biddersRound(auc: Auction, random: () => number): Auction {
  let highBid = Math.max(0, Math.trunc(auc.highBid ?? 0));
  let leaderId = auc.leaderId ?? "";
  const lines = [...(auc.lines ?? [])];
  const bidders = (auc.bidders ?? []).map((b) => ({ ...b }));
  let raised = false;

  for (const bidder of bidders) {
    if (bidder.out || bidder.id === leaderId) continue;
    const next = highBid > 0 ? highBid + auctionStep(highBid) : Math.max(1, Math.trunc(auc.lot?.basePrice ?? 0));
    if (next > bidder.budget) {
      bidder.out = true;
      lines.push(line(bidder.name, `${bidder.name}把牌子搁下了，不再跟。`));
      continue;
    }
    // 离预算越近越不肯开口；肯不肯跟，看性子有多急
    const heat = next / Math.max(1, bidder.budget);
    const keen = Math.min(1, Math.max(0, bidder.keen));
    if (random() > keen * (1 - heat * 0.6)) continue;
    highBid = next;
    leaderId = bidder.id;
    raised = true;
    lines.push(line(bidder.name, `${bidder.name}举牌，叫到 ${highBid} 枚下品灵石。`, highBid));
  }

  const silent = raised ? 0 : (auc.silent ?? 0) + 1;
  return {
    ...auc,
    highBid,
    leaderId,
    bidders,
    lines: trimLines(lines),
    silent,
    round: (auc.round ?? 0) + 1,
  };
}

/** 玩家加一口，随后客人应一轮 */
export function applyPlayerBid(auc: Auction, random: () => number = Math.random): Auction {
  if (!auc.lot || auctionHammered(auc)) return auc;
  const price = auctionNextBid(auc);
  const lines = [...(auc.lines ?? []), line("你", `你举牌，叫到 ${price} 枚下品灵石。`, price, true)];
  return biddersRound({ ...auc, highBid: price, leaderId: "player", lines }, random);
}

/** 玩家看着不动，客人照旧应一轮 */
export function applyPlayerPass(auc: Auction, random: () => number = Math.random): Auction {
  if (!auc.lot || auctionHammered(auc)) return auc;
  const lines = [...(auc.lines ?? []), line("你", "你没有举牌，只看着场上。", undefined, true)];
  return biddersRound({ ...auc, lines }, random);
}

/** 场上执牌的这位叫什么；空场便说无人 */
export function auctionLeaderName(auc: Auction): string {
  if (auc.leaderId === "player") return "你";
  const bidder = (auc.bidders ?? []).find((b) => b.id === auc.leaderId);
  return bidder?.name ?? "无人";
}

/** 这一场还开着没有：定在今日、尚未散场 */
export function auctionDueToday(auc: Auction, today: number): boolean {
  return auc.status === "open" && auc.day === today;
}

/** 铺子里挂着的那一场：还没散、日子也还没过 */
export function auctionAtShop(list: Auction[] | undefined, shopId: string, today: number): Auction | undefined {
  return (Array.isArray(list) ? list : []).find(
    (a) => a && a.status === "open" && a.shopId === shopId && a.day >= today,
  );
}

/** 定在哪一日、还剩几日 */
export function auctionWhen(auc: Auction, today: number): string {
  const left = auc.day - today;
  if (left <= 0) return "今日开拍";
  return `还有 ${left} 日开拍`;
}

const LOT_KINDS = ["法宝", "丹药", "符箓", "材料", "秘籍", "灵兽", "杂物"];
const ITEM_GRADES: ItemGrade[] = ["凡品", "灵品", "玄品", "天品", "仙品"];
const ITEM_TYPES: InventoryItem["type"][] = ["材料", "丹药", "符箓", "法宝", "杂物", "灵兽"];

/** 拍品归到行囊里的哪一格 */
export function lotItemType(lot: AuctionLot): InventoryItem["type"] {
  if (lot.kind === "秘籍") return "杂物";
  return ITEM_TYPES.includes(lot.kind as InventoryItem["type"])
    ? (lot.kind as InventoryItem["type"])
    : "法宝";
}

/** 叙事写的拍品：名目要有，价要落在谱上 */
export function normalizeAuctionLot(raw: unknown): AuctionLot | null {
  const src = raw as Record<string, unknown>;
  if (!src || typeof src !== "object") return null;
  const name = String(src.name ?? "").trim().slice(0, 20);
  if (!name) return null;
  const kind = LOT_KINDS.includes(String(src.kind ?? "")) ? String(src.kind) : "法宝";
  const grade = ITEM_GRADES.includes(String(src.grade ?? "") as ItemGrade)
    ? (String(src.grade) as ItemGrade)
    : "玄品";
  const price = Math.trunc(Number(src.basePrice));
  return {
    name,
    kind,
    grade,
    story: String(src.story ?? "").trim().slice(0, 90),
    use: String(src.use ?? "").trim().slice(0, 70),
    // 起拍价至少一百枚，免得一件宝物叫成地摊价
    basePrice: Number.isFinite(price) ? Math.min(300000, Math.max(100, price)) : 600,
  };
}

/** 叙事写的来客：预算相对起拍价夹一把，免得一场拍出个天文数字 */
export function normalizeAuctionBidders(raw: unknown, basePrice: number): AuctionBidder[] {
  const list = Array.isArray(raw) ? raw : [];
  const floor = Math.max(1, Math.trunc(basePrice));
  const bidders: AuctionBidder[] = [];
  for (const entry of list) {
    const src = entry as Record<string, unknown>;
    if (!src || typeof src !== "object") continue;
    const name = String(src.name ?? "").trim().slice(0, 12);
    if (!name) continue;
    if (bidders.some((b) => b.name === name)) continue;
    const budget = Math.trunc(Number(src.budget));
    const keen = Number(src.keen);
    bidders.push({
      id: `bidder-${bidders.length + 1}`,
      name,
      identity: String(src.identity ?? "").trim().slice(0, 16) || "城里来的客人",
      persona: String(src.persona ?? "").trim().slice(0, 40),
      budget: Number.isFinite(budget)
        ? Math.min(floor * 10, Math.max(floor, budget))
        : Math.round(floor * 2),
      keen: Number.isFinite(keen) ? Math.min(1, Math.max(0.05, keen)) : 0.5,
    });
    if (bidders.length >= 6) break;
  }
  return bidders;
}

/** 一场拍卖要不要落槌：已到日子、还开着、没人再跟 */
export function auctionReachedDay(auc: Auction, today: number): boolean {
  return auc.status === "open" && today >= auc.day;
}

/**
 * 从已开的坊市里找一家宝物阁。
 * 铺名给了就按铺名认，没给便就近挑一家；一间坊市都没开过便找不着。
 */
export function findTreasureShop(
  markets: Record<string, Market> | undefined,
  opts: { shopName?: string; cityId?: string; preferCityId?: string } = {},
): { shop: Shop; key: string; cityId: string; districtId: number } | undefined {
  const entries = Object.entries(markets ?? {});
  const wanted = String(opts.shopName ?? "").trim();
  const city = String(opts.cityId ?? "").trim();
  const prefer = String(opts.preferCityId ?? "").trim();
  const candidates: { shop: Shop; key: string; cityId: string; districtId: number }[] = [];
  for (const [key, market] of entries) {
    const [cityId, districtId] = key.split(":");
    for (const shop of market?.shops ?? []) {
      if (shop?.kind !== "宝物阁") continue;
      candidates.push({ shop, key, cityId, districtId: Math.trunc(Number(districtId)) || 1 });
    }
  }
  if (candidates.length === 0) return undefined;
  if (wanted) {
    const exact = candidates.find((c) => c.shop.name === wanted && (!city || c.cityId === city));
    if (exact) return exact;
    const loose = candidates.find((c) => c.shop.name.includes(wanted) || wanted.includes(c.shop.name));
    if (loose) return loose;
  }
  return candidates.find((c) => c.cityId === prefer) ?? candidates[0];
}
