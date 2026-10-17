import { useCallback, useEffect, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { GAME_TITLE, GAME_VERSION } from "@/lib/gameInfo";
import { AISettingsModal } from "@/components/ai/AISettingsModal";
import { BookOpen, Save, Settings, LogOut, Sparkles } from "lucide-react";

/** 开局背景图：随 image_assets 一并发布，开发态由 Vite 中间件直接托管 */
const BG_URL = new URL("game/image_assets/开局背景浅色.jpg", document.baseURI).href;

interface MainMenuProps {
  onNewGame: () => void;
  hasExistingGame: boolean;
}

export function MainMenu({ onNewGame, hasExistingGame }: MainMenuProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const setSaveManagerOpen = useAIStore((s) => s.setSaveManagerOpen);
  const [hasSaves, setHasSaves] = useState(false);
  
  const checkForSaves = useCallback(async () => {
    try {
      const res = await fetch("/api/saves", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setHasSaves(Array.isArray(data?.saves) && data.saves.length > 0);
      }
    } catch {
      setHasSaves(false);
    }
  }, []);

  useEffect(() => {
    void checkForSaves();
  }, [checkForSaves]);
  
  const handleLoadGame = () => {
    setSaveManagerOpen(true);
  };

  const handleQuit = () => {
    if (typeof window !== "undefined" && (window as any).__ELECTRON__) {
      (window as any).__ELECTRON__.quit();
    }
  };

  const isElectron = typeof window !== "undefined" && (window as any).__ELECTRON__;
  const canLoadGame = hasSaves || hasExistingGame;

  return (
    <div className="fixed inset-0 overflow-hidden bg-paper-fresh flex items-center justify-center">
      {/* 晨曦仙山底图 */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${BG_URL}")` }}
      />
      {/* 纸色薄纱：轻压一层，让题名与按钮在仙山上都读得清 */}
      <div className="absolute inset-0 bg-gradient-to-b from-paper-fresh/45 via-paper-fresh/10 to-paper-fresh/65" />
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

      <div className="relative z-10 flex flex-col items-center gap-8 px-4 w-full max-w-2xl animate-fadeIn">
        <div className="text-center space-y-3">
          <h1 className="font-brush text-3xl sm:text-4xl md:text-5xl whitespace-nowrap text-ink-darkest tracking-[0.06em] drop-shadow-[0_2px_16px_rgba(255,252,240,0.95)]">
            {GAME_TITLE}
          </h1>
          <p className="font-kai text-base text-ink-light tracking-[0.3em] drop-shadow-[0_1px_8px_rgba(255,252,240,0.9)]">
            落笔成身 · 一念入仙途
          </p>
          <div className="flex items-center justify-center gap-2 text-ink-lightest font-kai text-xs">
            <Sparkles size={12} />
            <span>{GAME_VERSION}</span>
          </div>
        </div>

        <div className="w-full max-w-md space-y-3">
          <MenuButton
            icon={<BookOpen size={18} />}
            label="开始新游戏"
            onClick={onNewGame}
            variant="primary"
          />

          <MenuButton
            icon={<Save size={18} />}
            label="读取游戏"
            onClick={handleLoadGame}
            disabled={!canLoadGame}
          />

          <MenuButton
            icon={<Settings size={18} />}
            label="设置"
            onClick={() => setSettingsOpen(true)}
          />

          {isElectron && (
            <MenuButton
              icon={<LogOut size={18} />}
              label="退出游戏"
              onClick={handleQuit}
              variant="danger"
            />
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-6 z-10 text-center">
        <p className="font-kai text-xs text-ink-light/70 tracking-wider">
          山重水复疑无路 · 柳暗花明又一村
        </p>
      </div>

      <AISettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

interface MenuButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "primary" | "normal" | "danger";
  disabled?: boolean;
}

function MenuButton({ icon, label, onClick, variant = "normal", disabled = false }: MenuButtonProps) {
  const baseClasses = "w-full group relative overflow-hidden transition-all duration-300";
  
  const variantClasses = {
    primary: "bg-paper-fresh/90 hover:bg-[#FFFDF6] border-gold-500/70 hover:border-gold-600 shadow-book-lift hover:shadow-book-float",
    normal: "bg-paper-fresh/70 hover:bg-[#FFFDF6]/95 border-ink-lightest/40 hover:border-ink-light/70 shadow-ink-soft",
    danger: "bg-paper-fresh/70 hover:bg-[#FFFDF6]/95 border-cinnabar-500/45 hover:border-cinnabar-500/80 shadow-ink-soft",
  };

  const textClasses = {
    primary: "text-ink-darkest group-hover:text-ink-darkest",
    normal: "text-ink-dark group-hover:text-ink-darkest",
    danger: "text-cinnabar-600 group-hover:text-cinnabar-600",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseClasses}
        ${disabled ? "opacity-40 cursor-not-allowed" : variantClasses[variant]}
        ${disabled ? "" : "hover:scale-[1.02] hover:-translate-y-0.5"}
        px-6 py-4 rounded-lg border backdrop-blur-sm
      `}
    >
      <div className="flex items-center justify-center gap-3 font-kai text-lg tracking-widest relative z-10">
        <span className={disabled ? "text-ink-lightest/60" : textClasses[variant]}>
          {icon}
        </span>
        <span className={disabled ? "text-ink-lightest/60" : textClasses[variant]}>
          {label}
        </span>
      </div>
      
      {!disabled && variant === "primary" && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gold-400/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      )}
    </button>
  );
}
