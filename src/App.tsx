import { useState, useEffect } from "react";
import { useAIStore } from "@/store/useAIStore";
import Home from "@/pages/Home";
import { StartSetup } from "@/components/start/StartSetup";
import { TermsGate } from "@/components/start/TermsGate";
import { hasAgreed, markAgreed } from "@/data/userAgreement";

export default function App() {
  const [gameStarted, setGameStarted] = useState(false);
  // 头一回进来先把用户协议摊开：勾了同意才放行，同意过的那一版记在本机
  const [agreed, setAgreed] = useState(() => hasAgreed());
  const turns = useAIStore((s) => s.conversation.turns);

  useEffect(() => {
    if (turns.length > 0) {
      setGameStarted(true);
    }
  }, [turns]);

  if (!agreed) {
    return (
      <TermsGate
        onAgree={() => {
          markAgreed();
          setAgreed(true);
        }}
      />
    );
  }

  if (!gameStarted) {
    return <StartSetup />;
  }

  return <Home />;
}
