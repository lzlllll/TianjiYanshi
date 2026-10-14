import { useState, useEffect } from "react";
import { useAIStore } from "@/store/useAIStore";
import Home from "@/pages/Home";
import { StartSetup } from "@/components/start/StartSetup";
import { TermsGate } from "@/components/start/TermsGate";
import { SaveManagerModal } from "@/components/save/SaveManagerModal";
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

  // 存档管理摆在这里：主菜单与游戏内共用同一扇窗，
  // 只当 isSaveManagerOpen 为真时才渲染出来
  return (
    <>
      {!agreed ? (
        <TermsGate
          onAgree={() => {
            markAgreed();
            setAgreed(true);
          }}
        />
      ) : !gameStarted ? (
        <StartSetup />
      ) : (
        <Home />
      )}
      <SaveManagerModal />
    </>
  );
}
