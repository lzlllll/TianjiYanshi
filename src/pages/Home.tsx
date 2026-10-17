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
import { NarrativeHaggleModal } from "@/components/map/NarrativeHaggleModal";
import { NarrativeShopModal } from "@/components/map/NarrativeShopModal";
import { AdventureModal } from "@/components/adventure/AdventureModal";
import { CraftOrderModal } from "@/components/ai/CraftOrderModal";
import { CraftingModal } from "@/components/crafting/CraftingModal";
import { EndingScreen } from "@/components/ending/EndingScreen";
import { GameIntroModal } from "@/components/start/GameIntroModal";
import { GuidedTutorial } from "@/components/tutorial/GuidedTutorial";
import { useTutorialStore } from "@/store/useTutorialStore";

export default function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const storyOpen = useAIStore((s) => s.isStoryOpen);
  const setStoryOpen = useAIStore((s) => s.setStoryOpen);
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
  const [showMainUI, setShowMainUI] = useState(false);

  const tutorialSeen = useTutorialStore((s) => s.seen);
  const activeTutorial = useTutorialStore((s) => s.activeId);
  const startTutorial = useTutorialStore((s) => s.start);
  // 开篇那一段落定之后摊一次玩法说明；说明还开着时先不走引导，免得两页叠在一起
  const introVisible = !introSeen && !introClosed && turnCount >= 1;

  // 头一回落定之后，把主界面的引导摊开：圈着舆图、问道、书脊、顶栏、底栏讲一遍
  useEffect(() => {
    if (turnCount < 1 || introVisible) return;
    if (activeTutorial || tutorialSeen.map) return;
    const timer = setTimeout(() => startTutorial("map"), 600);
    return () => clearTimeout(timer);
  }, [turnCount, introVisible, activeTutorial, tutorialSeen.map, startTutorial]);

  useEffect(() => {
    useGameStore.getState().ensureSectSites();
    useGameStore.getState().ensureSectEndowment();
    useGameStore.getState().settleSectSites();
    useGameStore.getState().ensureVillages();
    const timer = setTimeout(() => setShowMainUI(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      className={`h-screen w-screen flex flex-col bg-paper-old paper-texture overflow-hidden transition-opacity duration-1000 ${
        showMainUI ? "opacity-100" : "opacity-0"
      }`}
    >
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
      {/* 叙事里挑起的一场讲价：与商铺里那套同源，谈定即落账 */}
      <NarrativeHaggleModal />
      {/* 叙事把玩家引到某家铺子买卖：铺面界面由玩家自己经手 */}
      <NarrativeShopModal />
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
      {introVisible && (
        <GameIntroModal
          onClose={(dontShow) => {
            setIntroClosed(true);
            if (dontShow) markIntroSeen();
          }}
        />
      )}

      {/* 新手引导：压在最上层，圈着界面上的真东西一步一步讲 */}
      <GuidedTutorial />
    </div>
  );
}
