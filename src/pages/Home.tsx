import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { TopBanner } from "@/components/layout/TopBanner";
import { SideNav } from "@/components/layout/SideNav";
import { BottomStatus } from "@/components/layout/BottomStatus";
import { WorldMap } from "@/components/map/WorldMap";
import { TileMapEditor } from "@/components/map/TileMapEditor";
import { SectMapEditor } from "@/components/map/SectMapEditor";
import { DistrictNpcPanel } from "@/components/map/DistrictNpcPanel";
import type { DistrictNpcTarget } from "@/components/map/DistrictNpcPanel";
import { ManorPanel } from "@/components/map/ManorPanel";
import type { ManorTarget } from "@/components/map/ManorPanel";
import { MarketPanel } from "@/components/map/MarketPanel";
import type { MarketTarget } from "@/components/map/MarketPanel";
import { WorkshopPanel } from "@/components/map/WorkshopPanel";
import type { WorkshopTarget } from "@/components/map/WorkshopPanel";
import { ForestExploreModal } from "@/components/map/ForestExploreModal";
import type { ForestTarget } from "@/components/map/ForestExploreModal";
import { PanelDrawer } from "@/components/layout/PanelDrawer";
import { StoryWindow } from "@/components/layout/StoryWindow";
import { AISettingsModal } from "@/components/ai/AISettingsModal";
import { NPCChatModal } from "@/components/ai/NPCChatModal";
import { RandomEventModal } from "@/components/ai/RandomEventModal";
import { AdventureModal } from "@/components/adventure/AdventureModal";
import { CraftOrderModal } from "@/components/ai/CraftOrderModal";
import { CraftingModal } from "@/components/crafting/CraftingModal";
import { EndingScreen } from "@/components/ending/EndingScreen";
import { GameIntroModal } from "@/components/start/GameIntroModal";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 开篇推演完成后玩家第一眼就该看见叙事，所以默认打开；
  // 摆在 store 里，别处（如宗门建筑里挑起的比试）也能把窗口叫开
  const storyOpen = useAIStore((s) => s.isStoryOpen);
  const setStoryOpen = useAIStore((s) => s.setStoryOpen);
  // 开局那一段出来之后，摊一次玩法说明；勾了「以后不再打开」便不再自动弹
  const introSeen = useAIStore((s) => s.introSeen);
  const markIntroSeen = useAIStore((s) => s.markIntroSeen);
  const turnCount = useAIStore((s) => s.conversation.turns.length);
  const [introClosed, setIntroClosed] = useState(false);
  const [tileEditorOpen, setTileEditorOpen] = useState(false);
  const [sectEditorOpen, setSectEditorOpen] = useState(false);
  const [districtNpc, setDistrictNpc] = useState<DistrictNpcTarget | null>(null);
  const [manor, setManor] = useState<ManorTarget | null>(null);
  const [market, setMarket] = useState<MarketTarget | null>(null);
  const [workshop, setWorkshop] = useState<WorkshopTarget | null>(null);
  const [forest, setForest] = useState<ForestTarget | null>(null);

  // 进主界面时把该有的宗门补齐：一处都没有就先掷，玩家报过宗门的认一处作本门；
  // 顺手把开局那笔家底落下，免得一开张便无钱可花
  useEffect(() => {
    useGameStore.getState().ensureSectSites();
    useGameStore.getState().ensureSectEndowment();
    // 各处山门的宝库也先翻一遍账，点开看时便有数目
    useGameStore.getState().settleSectSites();
    // 舆图上空着的点位里，随机圈出若干村庄
    useGameStore.getState().ensureVillages();
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-paper-old paper-texture overflow-hidden">
      <TopBanner onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex-1 flex overflow-hidden">
        <SideNav storyOpen={storyOpen} onOpenStory={() => setStoryOpen(true)} />

        {/* 主区常驻武侠地图；叙事窗口与侧拉面板都只在主区内浮层，导航与状态栏始终可用 */}
        <main className="flex-1 relative overflow-hidden">
          <WorldMap
            onOpenTileEditor={() => setTileEditorOpen(true)}
            onOpenSectEditor={() => setSectEditorOpen(true)}
            onOpenDistrict={setDistrictNpc}
            onOpenManor={setManor}
            onOpenMarket={setMarket}
            onOpenWorkshop={setWorkshop}
            onExploreForest={setForest}
          />

          <StoryWindow
            open={storyOpen}
            onClose={() => setStoryOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <PanelDrawer />
        </main>
      </div>
      <BottomStatus />

      <AISettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NPCChatModal />
      {/* 路上的变故：未了结之前关不上，压在其余浮层之上 */}
      <RandomEventModal />
      {/* 踏进一处奇遇：可随时抽身，那一处仍留在舆图上 */}
      <AdventureModal />
      {/* 作坊报了价，便跳出一纸单子等玩家点头付钱；压在交谈窗口之上 */}
      <CraftOrderModal />
      <CraftingModal />
      <TileMapEditor open={tileEditorOpen} onClose={() => setTileEditorOpen(false)} />
      <SectMapEditor open={sectEditorOpen} onClose={() => setSectEditorOpen(false)} />
      {districtNpc && <DistrictNpcPanel {...districtNpc} onClose={() => setDistrictNpc(null)} />}
      {/* 门房给了准信，就把宅子面板换成宅内那套可交谈的面板 */}
      {manor && (
        <ManorPanel
          {...manor}
          onClose={() => setManor(null)}
          onEnter={(label, members) => {
            setManor(null);
            setDistrictNpc({
              cityId: manor.cityId,
              districtId: manor.districtId,
              label,
              strangers: members,
            });
          }}
        />
      )}
      {market && <MarketPanel {...market} onClose={() => setMarket(null)} />}
      {workshop && <WorkshopPanel {...workshop} onClose={() => setWorkshop(null)} />}
      {forest && <ForestExploreModal {...forest} onClose={() => setForest(null)} />}
      {/* 终局：气血耗尽或寿元用尽时压在最上层 */}
      <EndingScreen />

      {/* 开篇那一段落定之后，摊一次玩法说明 */}
      {!introSeen && !introClosed && turnCount >= 1 && (
        <GameIntroModal
          onClose={(dontShow) => {
            setIntroClosed(true);
            if (dontShow) markIntroSeen();
          }}
        />
      )}
    </div>
  );
}
