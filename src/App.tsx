import { useState, useEffect } from "react";
import { useAIStore } from "@/store/useAIStore";
import Home from "@/pages/Home";
import { MainMenu } from "@/pages/MainMenu";
import { StartSetup } from "@/components/start/StartSetup";
import { TermsGate } from "@/components/start/TermsGate";
import { SaveManagerModal } from "@/components/save/SaveManagerModal";
import { hasAgreed, markAgreed } from "@/data/userAgreement";

export default function App() {
  const [showMainMenu, setShowMainMenu] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [agreed, setAgreed] = useState(() => hasAgreed());
  const turns = useAIStore((s) => s.conversation.turns);

  useEffect(() => {
    if (turns.length > 0) {
      setGameStarted(true);
      setShowMainMenu(false);
    }
  }, [turns]);

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
        <StartSetup />
      ) : (
        <Home onReturnToMenu={() => setShowMainMenu(true)} />
      )}
      <SaveManagerModal />
    </>
  );
}
