import { useState, useEffect } from "react";
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
  const [agreed, setAgreed] = useState(() => hasAgreed());
  const turns = useAIStore((s) => s.conversation.turns);
  const battleActive = useAIStore((s) => s.battle.isActive);
  const bgmVolume = useAIStore((s) => s.settings.bgmVolume);
  const fontScale = useAIStore((s) => s.settings.fontScale);

  useEffect(() => {
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
    setShowMainMenu(false);
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
      ) : !gameStarted ? (
        <StartSetup onReturnToMenu={() => setShowMainMenu(true)} />
      ) : (
        <Home onReturnToMenu={() => setShowMainMenu(true)} />
      )}
      <SaveManagerModal />
      {/* 内置 AI 服务被限流时的说明窗，压在最上层 */}
      <RateLimitModal />
    </>
  );
}
