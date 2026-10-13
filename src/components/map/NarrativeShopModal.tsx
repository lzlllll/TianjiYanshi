import { useEffect, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { GeneralStoreModal } from "@/components/map/GeneralStoreModal";
import { MarketPanel } from "@/components/map/MarketPanel";
import { getDistricts, getMarker } from "@/data/map";
import type { Market, Shop } from "@/data/types";

/** 定位到的去处：一家具体的铺子，或退而求其次的一片坊市 */
type ShopView =
  | { kind: "shop"; cityId: string; districtId: number; culture?: string; label: string; shop: Shop }
  | { kind: "market"; cityId: string; districtId: number; culture?: string; label: string; market: Market };

/**
 * 叙事把玩家引到某家铺子买卖。
 *
 * 按铺名在玩家所在城的坊市里寻：寻到便开出那家铺面；寻不到就退开该城的坊市面板，
 * 由玩家自己挑铺子。买卖的经过与得失全在窗里由玩家经手，正文只把人送到门口，不与它重复记账。
 */
export function NarrativeShopModal() {
  const brief = useAIStore((s) => s.narrativeShop);
  const close = useAIStore((s) => s.closeNarrativeShop);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const markets = useGameStore((s) => s.markets);
  const ensureMarket = useGameStore((s) => s.ensureMarket);

  const [view, setView] = useState<ShopView | null>(null);

  useEffect(() => {
    if (!brief) {
      setView(null);
      return;
    }
    const cityId = currentPlaceId;
    const city = getMarker(cityId);
    const culture = city?.culture;

    // 先在本城已有的坊市里找同名铺子
    for (const [key, market] of Object.entries(markets ?? {})) {
      if (!key.startsWith(`${cityId}:`)) continue;
      const shop = (market.shops ?? []).find((s) => s.name === brief.shop);
      if (shop) {
        const districtId = Number(key.slice(cityId.length + 1));
        const district = (getDistricts(cityId) ?? []).find((d) => d.id === districtId);
        setView({
          kind: "shop",
          cityId,
          districtId,
          culture,
          shop,
          label: `${city?.name ?? "此城"}·${district?.name || district?.nature || "坊市"}`,
        });
        return;
      }
    }

    // 找不到：退开本城的一处坊市，由玩家自己挑铺子
    const districts = getDistricts(cityId) ?? [];
    const district =
      districts.find((d) => d.nature === "坊市") ?? districts.find((d) => d.slots > 0);
    if (!district) {
      setView(null);
      return;
    }
    const market = ensureMarket(cityId, district.id, culture, district.slots);
    setView({
      kind: "market",
      cityId,
      districtId: district.id,
      culture,
      market,
      label: `${city?.name ?? "此城"}·${district.name || district.nature}`,
    });
  }, [brief, currentPlaceId, markets, ensureMarket]);

  if (!brief || !view) return null;

  if (view.kind === "shop") {
    return (
      <GeneralStoreModal
        cityId={view.cityId}
        districtId={view.districtId}
        label={view.label}
        culture={view.culture}
        shop={view.shop}
        onClose={close}
      />
    );
  }

  return (
    <MarketPanel
      cityId={view.cityId}
      districtId={view.districtId}
      label={view.label}
      culture={view.culture}
      market={view.market}
      onClose={close}
    />
  );
}
