import { useState, useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { useTutorialStore } from "@/store/useTutorialStore";
import { REALMS } from "@/data/mockData";
import { Settings, FolderOpen, RotateCcw, Clock, ChevronDown, MoreHorizontal, Compass, LogOut } from "lucide-react";
import { formatGameTime } from "@/lib/gameTime";
import { GAME_SIGNATURE } from "@/lib/gameInfo";
import { cn } from "@/lib/utils";
import { AI_BACKEND_READY } from "@/data/backend";

interface TopBannerProps {
  onOpenSettings: () => void;
  onReturnToMenu?: () => void;
}

export function TopBanner({ onOpenSettings, onReturnToMenu }: TopBannerProps) {
  const player = useGameStore((s) => s.player);
  const currentTime = useGameStore((s) => s.currentTime);
  const realm = REALMS[player.realmIndex];
  const nextRealm = REALMS[player.realmIndex + 1];
  const hasApiKey = AI_BACKEND_READY;
  const stage = useAIStore((s) => s.conversation.stage);

  // 宗门、体魄、气运这类次要信息默认展开，玩家不必先点一下才看得到
  const [showDetails, setShowDetails] = useState(true);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSaveMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setShowSaveMenu(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showSaveMenu]);

  // 存档一律交给游戏内的存档管理窗：列档、存档、读档、删档都在那里，
  // 不再从这里弹系统文件选择框
  const openSaveManager = () => {
    setShowSaveMenu(false);
    useAIStore.getState().setSaveManagerOpen(true);
  };

  const startNewGame = () => {
    setShowSaveMenu(false);
    if (confirm("确定要开启新游戏吗？当前进度将丢失。")) {
      useGameStore.getState().resetGame();
      // 推演账与交谈、战斗、变故、奇遇几扇临时窗口一并归零，新局不接旧局的话头
      useAIStore.getState().resetLedger();
      window.location.reload();
    }
  };

  /** 重新看一遍主界面引导：菜单收起，从第一步走起 */
  const replayTutorial = () => {
    setShowSaveMenu(false);
    useTutorialStore.getState().start("map", true);
  };

  const returnToMenu = () => {
    setShowSaveMenu(false);
    if (confirm("返回主菜单？当前未保存的进度将丢失。")) {
      onReturnToMenu?.();
    }
  };

  return (
    <header data-tutorial="top-banner" className="mainui-black relative shrink-0 border-b border-ink-lightest/20 bg-paper-aged paper-texture">
      {/* 界栏装饰线 */}
      <div className="absolute top-2 left-8 right-8 h-px bg-gradient-to-r from-transparent via-ink-light/30 to-transparent" />
      <div className="absolute bottom-2 left-8 right-8 h-px bg-gradient-to-r from-transparent via-ink-light/30 to-transparent" />

      {/* 主行：道号、境界、修为、寿元 */}
      <div className="relative min-h-[72px] flex flex-wrap items-center gap-y-2 px-6 py-2">
        <div className="flex items-center gap-4 z-10 min-w-0">
          <div className="w-12 h-12 seal-button flex items-center justify-center text-xl font-kai shrink-0">
            {player.name?.charAt(0) || "道"}
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-title truncate">
                {player.name}
              </h1>
              <span className="text-caption text-gold truncate">「{player.title}」</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-caption text-cinnabar">
                {realm?.name}
                <span className="text-gold ml-1">{realm?.stage}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 这一层若只给 z-10，会和下面的次要信息行同档；本行的下拉菜单被关在这层叠层里，
            同档时后出现的次要信息行反而压在上面，存档菜单就被遮住了，故抬一档到 z-20 */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-5 gap-y-2 min-w-0 z-20">
          <div className="text-right">
            <div className="text-label">修为</div>
            <div className="font-number text-base text-gold whitespace-nowrap">
              {(player.cultivation ?? 0).toLocaleString()}
              {nextRealm && (
                <span className="text-ink-light text-xs"> / {nextRealm.cultivationNeeded.toLocaleString()}</span>
              )}
            </div>
          </div>

          <div className="book-divider-vertical h-8" />

          {/* 年岁：开局自述里报的那个数；余寿便是照上限减它算出来的 */}
          {typeof player.age === "number" && player.age > 0 && (
            <>
              <div className="text-right">
                <div className="text-label">年岁</div>
                <div className="font-number text-base text-ink-dark whitespace-nowrap">{player.age}</div>
              </div>
              <div className="book-divider-vertical h-8" />
            </>
          )}

          <div className="text-right">
            <div className="text-label">所剩寿元</div>
            <div className="font-number text-base text-jade-400 whitespace-nowrap">
              {player.lifespanCurrent}
              <span className="text-ink-light text-xs"> / {player.lifespanMax}</span>
            </div>
          </div>

          <div className="book-divider-vertical h-8" />

          <div className="text-right">
            <div className="text-label">天时</div>
            <div className="flex items-center justify-end gap-1.5 font-number text-sm text-ink-dark whitespace-nowrap">
              <Clock size={13} className="text-gold/60" />
              {formatGameTime(currentTime)}
            </div>
          </div>

          <div className="book-divider-vertical h-8" />

          <button
            onClick={() => setShowDetails((v) => !v)}
            className={cn(
              "seal-button-outline w-10 h-10 rounded flex items-center justify-center transition-smooth",
              showDetails && "bg-paper-old",
            )}
            title={showDetails ? "收起详情" : "展开详情"}
          >
            <ChevronDown size={16} className={cn("transition-transform", showDetails && "rotate-180")} />
          </button>

          <div className="relative" ref={saveMenuRef} data-tutorial="top-save">
            <button
              onClick={() => setShowSaveMenu((v) => !v)}
              className={cn(
                "seal-button-outline w-10 h-10 rounded flex items-center justify-center transition-smooth",
                showSaveMenu && "bg-paper-old",
              )}
              title="存档管理"
            >
              <MoreHorizontal size={16} />
            </button>
            {showSaveMenu && (
              <div
                className="!absolute top-full right-0 mt-2 w-44 book-card !p-1 modal-book-open z-50 overflow-hidden"
              >
                <button
                  onClick={openSaveManager}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-caption hover:bg-paper-old transition-smooth"
                >
                  <FolderOpen size={14} className="text-ink-light" /> 存档管理
                </button>
                <div className="book-divider my-1" />
                <button
                  onClick={replayTutorial}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-caption hover:bg-paper-old transition-smooth"
                >
                  <Compass size={14} className="text-ink-light" /> 新手引导
                </button>
                <div className="book-divider my-1" />
                <button
                  onClick={startNewGame}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-caption text-cinnabar hover:bg-cinnabar-light/10 transition-smooth"
                >
                  <RotateCcw size={14} /> 新游戏
                </button>
                {onReturnToMenu && (
                  <>
                    <div className="book-divider my-1" />
                    <button
                      onClick={returnToMenu}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-caption text-ink-light hover:bg-paper-old transition-smooth"
                    >
                      <LogOut size={14} /> 返回主菜单
                    </button>
                  </>
                )}
                <div className="book-divider my-1" />
                <p className="px-4 py-1.5 font-number text-[10px] text-ink-light/70">{GAME_SIGNATURE}</p>
              </div>
            )}
          </div>

          <button
            onClick={onOpenSettings}
            className="relative seal-button-outline w-10 h-10 rounded flex items-center justify-center transition-smooth group"
            title="通灵设置"
          >
            <Settings
              size={16}
              className={cn(
                "transition",
                (stage === "flash" || stage === "pro") && "animate-spin",
              )}
            />
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-paper-aged",
                hasApiKey ? "bg-jade-400" : "bg-cinnabar",
              )}
              title={hasApiKey ? "已配置" : "未配置"}
            />
          </button>
        </div>
      </div>

      {/* 次行：次要信息 */}
      {showDetails && (
        <div className="relative border-t-2 border-ink-lightest px-6 py-2 flex items-center flex-wrap gap-x-8 gap-y-1 z-10 bg-paper-old paper-aged cloud-border">
          <span className="text-caption">
            宗门 <span className="text-ink-dark">{player.sectName || "散修"} · {player.position || "无职"}</span>
          </span>
          <span className="text-caption">
            体魄 <span className="text-ink-dark">{player.body || "未载"}</span>
          </span>
          <span className="text-caption">
            气运 <span className="text-ink-dark">{player.fortune || "未载"}</span>
          </span>
        </div>
      )}
    </header>
  );
}
