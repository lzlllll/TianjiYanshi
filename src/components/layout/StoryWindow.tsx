import { useEffect } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { StoryPanel } from "@/panels/StoryPanel";

interface StoryWindowProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

/**
 * 问道窗口。
 * 层级：叙事窗口 < 侧拉面板 < 制作/交谈/设置弹窗，因此读叙事时仍能拉开侧拉面板查看角色状态。
 */
export function StoryWindow({ open, onClose, onOpenSettings }: StoryWindowProps) {
  const drawerOpen = useGameStore((s) => s.currentPanel !== null);
  // 上层还叠着制作或交谈窗口时，Esc 交给上层处理
  const upperModalOpen = useAIStore((s) => s.isCraftingOpen || s.npcChat.activeNpcId !== null);

  useEffect(() => {
    if (!open || upperModalOpen || drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, upperModalOpen, drawerOpen, onClose]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="false"
      aria-label="问道"
    >
      <div
        className="absolute inset-0 bg-ink-darkest/60 animate-fadeIn motion-reduce:animate-none"
        onClick={onClose}
      />

      {/* 高度取满外层（外层已留 p-4 内边距），不用 88vh：主区高度含表头与底栏，
          vh 算出来的窗口会比主区还高，顶上被 overflow-hidden 裁掉，右上角的关闭按钮正好落进裁掉的那一段，鼠标便点不着 */}
      <div className="relative w-full max-w-6xl h-full book-card paper-texture paper-aged shadow-book-float rounded-lg overflow-hidden flex flex-col modal-book-open motion-reduce:animate-none corner-ornament">
        <StoryPanel onOpenSettings={onOpenSettings} onClose={onClose} />
      </div>
    </div>
  );
}
