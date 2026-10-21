import { useState, useEffect, useRef } from "react";
import { useAIStore } from "@/store/useAIStore";
import Home from "@/pages/Home";
import { MainMenu } from "@/pages/MainMenu";
import { StartSetup } from "@/components/start/StartSetup";
import { TermsGate } from "@/components/start/TermsGate";
import { SaveManagerModal } from "@/components/save/SaveManagerModal";
import { RateLimitModal } from "@/components/ai/RateLimitModal";
import { hasAgreed, markAgreed } from "@/data/userAgreement";
import { bgm, DEFAULT_BGM_VOLUME } from "@/lib/bgm";

export default function App() {
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
        <StartSetup onReturnToMenu={backToMenu} />
      ) : (
        <Home onReturnToMenu={backToMenu} />
      )}
      <SaveManagerModal />
      {/* 内置 AI 服务被限流时的说明窗，压在最上层 */}
      <RateLimitModal />
    </>
  );
}
