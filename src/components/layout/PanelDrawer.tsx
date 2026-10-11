import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import type { PanelId } from "@/data/types";
import { X } from "lucide-react";
import { ProfilePanel } from "@/panels/ProfilePanel";
import { TechniquePanel } from "@/panels/TechniquePanel";
import { TreasurePanel } from "@/panels/TreasurePanel";
import { SectPanel } from "@/panels/SectPanel";
import { SocialPanel } from "@/panels/SocialPanel";
import { StatusPanel } from "@/panels/StatusPanel";
import { FatePanel } from "@/panels/FatePanel";
import { SkillPanel } from "@/panels/SkillPanel";
import { TokenPanel } from "@/panels/TokenPanel";
import { NewsPanel } from "@/components/news/NewsPanel";
import { EstatePanel } from "@/panels/EstatePanel";

function renderPanel(panel: PanelId) {
  switch (panel) {
    case "profile":
      return <ProfilePanel />;
    case "technique":
      return <TechniquePanel />;
    case "treasure":
      return <TreasurePanel />;
    case "sect":
      return <SectPanel />;
    case "social":
      return <SocialPanel />;
    case "skill":
      return <SkillPanel />;
    case "fate":
      return <FatePanel />;
    case "news":
      return <NewsPanel />;
    case "estate":
      return <EstatePanel />;
    case "status":
      return <StatusPanel />;
    case "tokens":
      return <TokenPanel />;
  }
}

/**
 * 左侧导航对应的侧拉面板。点击导航项打开，再点一次或按 Esc 关闭。
 * 面板自带的 PanelTitle 就是抽屉的标题，这里不再重复渲染标题。
 */
export function PanelDrawer() {
  const currentPanel = useGameStore((s) => s.currentPanel);
  const setPanel = useGameStore((s) => s.setPanel);
  // 抽屉之上还叠着制作或交谈窗口时，Esc 应该先关上层窗口
  const upperModalOpen = useAIStore((s) => s.isCraftingOpen || s.npcChat.activeNpcId !== null);

  useEffect(() => {
    if (!currentPanel || upperModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPanel, upperModalOpen, setPanel]);

  if (!currentPanel) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex justify-end"
      role="dialog"
      aria-modal="false"
      aria-label="侧拉面板"
    >
      <div
        className="absolute inset-0 bg-ink-darkest/60 animate-fadeIn motion-reduce:animate-none"
        onClick={() => setPanel(null)}
      />

      <aside className="relative h-full w-[min(920px,94vw)] bg-paper-fresh paper-texture paper-aged border-l-2 border-ink-medium shadow-book-float flex flex-col animate-drawerIn motion-reduce:animate-none corner-ornament">
        <div className="shrink-0 h-11 flex items-center justify-end gap-3 px-4 border-b-2 border-ink-lightest cloud-border">
          <span className="text-caption text-ink-dark">Esc 关闭</span>
          <button
            onClick={() => setPanel(null)}
            aria-label="关闭面板"
            title="关闭面板"
            className="seal-button-outline w-7 h-7 flex items-center justify-center transition-smooth"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto book-scrollbar p-6">
          <div className="max-w-5xl mx-auto ink-diffuse-enter motion-reduce:animate-none">
            {renderPanel(currentPanel)}
          </div>
        </div>
      </aside>
    </div>
  );
}
