import { useState, useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { StatusBar } from "@/components/ui/StatusBar";
import { cn } from "@/lib/utils";
import { ChevronUp } from "lucide-react";

export function BottomStatus() {
  const player = useGameStore((s) => s.player);
  const log = useGameStore((s) => s.log);

  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLog) return;
    const onClickOutside = (e: MouseEvent) => {
      if (logRef.current && !logRef.current.contains(e.target as Node)) {
        setShowLog(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showLog]);

  return (
    <footer data-tutorial="bottom-status" className="mainui-black h-[76px] shrink-0 border-t border-ink-lightest/20 bg-paper-aged paper-texture flex items-stretch relative">
      {/* 顶部装饰线 */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ink-light to-transparent" />

      {/* 三花聚顶：三条状态并排，避免竖排撑高底栏 */}
      <div className="flex-1 grid grid-cols-3 gap-4 px-6 py-3 border-r book-divider-vertical min-w-0">
        <StatusBar compact label="气血" icon="❤" current={player.hp} max={player.hpMax} color="hp" />
        <StatusBar compact label="灵力" icon="✦" current={player.mp} max={player.mpMax} color="mp" />
        <StatusBar compact label="神识" icon="◉" current={player.spirit} max={player.spiritMax} color="spirit" />
      </div>

      {/* 修行录：常驻只留最新一条，其余收进浮层 */}
      <div className="relative w-[360px] shrink-0 px-5 py-2 flex flex-col justify-center" ref={logRef}>
        <button
          onClick={() => setShowLog((v) => !v)}
          className="flex items-center justify-between w-full group"
        >
          <span className="text-label text-ink-dark tracking-widest">修行录</span>
          <span className="text-caption text-ink-lightest group-hover:text-cinnabar transition-smooth flex items-center gap-1">
            近期动态
            <ChevronUp size={11} className={cn("transition-transform", showLog && "rotate-180")} />
          </span>
        </button>
        <p className="text-caption text-ink-medium leading-snug truncate mt-1.5">
          {log[0] ? `· ${log[0]}` : "暂无记录"}
        </p>

        {showLog && (
          <div
            className="book-card modal-book-open !absolute bottom-full right-4 mb-2 w-[400px] max-h-60 overflow-y-auto book-scrollbar shadow-book-float z-50 p-4"
          >
            <div className="text-label text-ink-dark tracking-widest mb-2">修行录</div>
            <div className="book-divider mb-3" />
            <div className="space-y-1.5">
              {log.slice(0, 12).map((entry, idx) => (
                <p key={idx} className="text-caption text-ink-medium leading-relaxed flex gap-2">
                  <span className="text-cinnabar shrink-0">·</span>
                  <span className={idx === 0 ? "text-ink-dark" : ""}>{entry}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部装饰线 */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-ink-light/20 to-transparent" />
    </footer>
  );
}
