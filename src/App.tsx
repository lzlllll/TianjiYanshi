import { useState, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { useAIStore } from "@/store/useAIStore";
import Home from "@/pages/Home";
import { MainMenu } from "@/pages/MainMenu";
import { StartSetup } from "@/components/start/StartSetup";
import { TermsGate } from "@/components/start/TermsGate";
import { SaveManagerModal } from "@/components/save/SaveManagerModal";
import { RateLimitModal } from "@/components/ai/RateLimitModal";
import { hasAgreed, markAgreed } from "@/data/userAgreement";
import { bgm, DEFAULT_BGM_VOLUME } from "@/lib/bgm";

/**
 * 兜底：旧版本残留的本地缓存偶有与当前版本对不上的，渲染时可能直接抛错。
 * 没有这一层时整页只剩一片空白，连清缓存的地方都没有；
 * 拦下来之后给出重载与重置本地进度的路，至少能自己救回来。
 */
class GameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[App] 界面渲染出错，已拦下：", error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  private resetLocal = () => {
    try {
      localStorage.removeItem("xiuxian-save");
      localStorage.removeItem("xiuxian-ai");
      localStorage.removeItem("xiuxian-tutorial");
    } catch {
      /* 浏览器不让动本地缓存时，至少重载一次试试 */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-paper-fresh px-6">
        <div className="w-full max-w-md rounded-lg border border-gold-500/40 bg-paper-old/90 p-6 text-center shadow-book-float">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-sm bg-cinnabar-500 font-brush text-xl text-paper-fresh">
            厄
          </div>
          <h1 className="font-brush text-2xl text-ink-darkest tracking-widest">界面出了岔子</h1>
          <p className="mt-3 font-serif text-sm leading-relaxed text-ink-light">
            多半是本机残留的旧进度与当前版本对不上。可以先重新载入试试；
            若仍打不开，重置本地进度即可恢复，文档目录里的存档文件不受影响。
          </p>
          <p className="mt-2 break-all font-number text-[11px] text-ink-lightest/70">
            {this.state.error.message}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={this.reload}
              className="rounded border-2 border-gold-500/60 px-4 py-2 font-serif text-sm text-ink-dark transition hover:bg-gold-500/10"
            >
              重新载入
            </button>
            <button
              onClick={this.resetLocal}
              className="rounded bg-cinnabar-500 px-4 py-2 font-serif text-sm text-paper-fresh transition hover:bg-cinnabar-600"
            >
              重置本地进度
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function AppInner() {
  const [showMainMenu, setShowMainMenu] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  // 点了「开始新游戏」而新局尚未落笔：这一段不能拿旧局的回合把人拽回主界面
  const [startingNew, setStartingNew] = useState(false);
  const startingNewRef = useRef(false);
  // 旧局清空过没有：清了之后再生出新回合，才算新局真正开了头
  const newGameResetSeen = useRef(false);
  const [agreed, setAgreed] = useState(() => hasAgreed());
  const turns = useAIStore((s) => s.conversation.turns);
  const battleActive = useAIStore((s) => s.battle.isActive);
  const bgmVolume = useAIStore((s) => s.settings.bgmVolume);
  const fontScale = useAIStore((s) => s.settings.fontScale);

  useEffect(() => {
    // 开新局：等旧回合被清空、新回合落笔之后才进主界面；
    // 否则一点「开始新游戏」，旧档那几轮还在，转眼就被拽回旧局
    if (startingNewRef.current) {
      if (turns.length === 0) {
        newGameResetSeen.current = true;
        return;
      }
      if (!newGameResetSeen.current) return;
      startingNewRef.current = false;
      setStartingNew(false);
      setGameStarted(true);
      return;
    }
    if (turns.length > 0) {
      setGameStarted(true);
      setShowMainMenu(false);
    }
  }, [turns]);

  // 背景音乐：日常与战斗两轨，随战事起落交叉淡化
  useEffect(() => {
    bgm.setVolume(bgmVolume ?? DEFAULT_BGM_VOLUME);
  }, [bgmVolume]);

  useEffect(() => {
    bgm.setScene(battleActive ? "battle" : "daily");
  }, [battleActive]);

  // 字号：Tailwind 的字号多以 rem 计，改根字号即可整页缩放
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * (fontScale ?? 1)}px`;
  }, [fontScale]);

  const handleStartNewGame = () => {
    startingNewRef.current = true;
    newGameResetSeen.current = false;
    setStartingNew(true);
    setGameStarted(false);
    setShowMainMenu(false);
  };

  // 折回主菜单：这一趟开新局作废，往后仍按旧局算
  const backToMenu = () => {
    startingNewRef.current = false;
    setStartingNew(false);
    setShowMainMenu(true);
  };

  // 开篇真正落笔后由开局页直接报信：不再靠观察回合数来猜，
  // 模型再快也不会因为「没看见清零」而把等待遮罩一直留在屏上
  const handleGameReady = () => {
    startingNewRef.current = false;
    newGameResetSeen.current = false;
    setStartingNew(false);
    setShowMainMenu(false);
    setGameStarted(true);
  };

  return (
    <>
      {!agreed ? (
        <TermsGate
          onAgree={() => {
            markAgreed();
            setAgreed(true);
          }}
        />
      ) : showMainMenu ? (
        <MainMenu onNewGame={handleStartNewGame} hasExistingGame={gameStarted} />
      ) : !gameStarted || startingNew ? (
        <StartSetup onReturnToMenu={backToMenu} onGameReady={handleGameReady} />
      ) : (
        <Home onReturnToMenu={backToMenu} />
      )}
      <SaveManagerModal />
      {/* 内置 AI 服务被限流时的说明窗，压在最上层 */}
      <RateLimitModal />
    </>
  );
}

export default function App() {
  return (
    <GameErrorBoundary>
      <AppInner />
    </GameErrorBoundary>
  );
}
