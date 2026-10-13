import { useMemo } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { HaggleModal } from "@/components/map/HaggleModal";
import type { HaggleSubject } from "@/components/map/GeneralStoreModal";
import { itemSalePrice } from "@/data/goods";
import type { Relation } from "@/data/types";

/**
 * 叙事里挑起的一场讲价。
 *
 * 与商铺里那套讲价同源，只是由叙事点出：读回合上摘下的那一笔买卖，
 * 找齐对方与标的，便把讲价窗开出来。谈定之后照商铺那一套落账——
 * 买的扣下品灵石、把物收入行囊，卖的出行囊、得灵石；关窗不谈则不落账。
 */
export function NarrativeHaggleModal() {
  const brief = useAIStore((s) => s.narrativeHaggle);
  const closeNarrativeHaggle = useAIStore((s) => s.closeNarrativeHaggle);
  const relations = useGameStore((s) => s.relations);
  const inventory = useGameStore((s) => s.inventory);
  const buyFromNarrative = useGameStore((s) => s.buyFromNarrative);
  const sellItem = useGameStore((s) => s.sellItem);

  // 对方优先取尘缘里同名的那一个；叙事点了名、尘缘里却没有的，现拼一个买卖人顶上
  const keeper = useMemo<Relation | null>(() => {
    if (!brief) return null;
    const found = relations.find((r) => r?.name === brief.keeper);
    if (found) return found;
    return {
      id: `haggle-keeper-${brief.keeper}`,
      name: brief.keeper,
      title: "买卖人",
      type: "friend",
      realm: "",
      note: "",
    };
  }, [brief, relations]);

  // 买的标的由叙事定；卖的标的先在行囊里找同名的那一样，找不到便交给玩家在窗里挑
  const subject = useMemo<HaggleSubject | null>(() => {
    if (!brief) return null;
    if (brief.mode === "buy") {
      return {
        mode: "buy",
        name: brief.subject,
        count: brief.count,
        basePrice: brief.basePrice,
        goodName: brief.subject,
      };
    }
    const item = inventory.find((i) => i.name === brief.subject);
    if (!item) return null;
    return {
      mode: "sell",
      name: item.name,
      count: item.count,
      basePrice: itemSalePrice(item),
      itemId: item.id,
    };
  }, [brief, inventory]);

  if (!brief || !keeper) return null;

  /** 谈定之后落账；返回空串表示成了，返回文字表示没成 */
  const settle = (s: HaggleSubject, price: number): string => {
    if (s.mode === "buy") {
      const count = Math.max(1, s.count);
      // 仪表给出的是整笔的价，落到行囊按单价记
      const unit = Math.max(1, Math.round(price / count));
      const ok = buyFromNarrative({
        name: s.goodName ?? s.name,
        price: unit,
        count,
        type: brief.itemType,
        desc: `在${brief.shop}经一番讲价买下的。`,
      });
      return ok ? "" : "下品灵石不够，这笔买卖没成。";
    }
    const ok = sellItem({ itemId: s.itemId!, totalPrice: price, count: s.count });
    return ok ? "" : "这笔买卖没成。";
  };

  return (
    <HaggleModal
      shopName={brief.shop}
      keeper={keeper}
      mode={brief.mode}
      subject={subject}
      onSettle={settle}
      onClose={closeNarrativeHaggle}
    />
  );
}
