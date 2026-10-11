import { useState, useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { REALMS } from "@/data/mockData";
import { Settings, Download, Upload, RotateCcw, Clock, ChevronDown, MoreHorizontal } from "lucide-react";
import { formatGameTime } from "@/lib/gameTime";
import { GAME_SIGNATURE } from "@/lib/gameInfo";
import { cn } from "@/lib/utils";
import type { GameSnapshot } from "@/data/types";

interface TopBannerProps {
  onOpenSettings: () => void;
}

export function TopBanner({ onOpenSettings }: TopBannerProps) {
  const player = useGameStore((s) => s.player);
  const currentTime = useGameStore((s) => s.currentTime);
  const realm = REALMS[player.realmIndex];
  const nextRealm = REALMS[player.realmIndex + 1];
  const hasApiKey = useAIStore((s) => !!s.settings.apiKey);
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

  const exportSave = async () => {
    const snapshot = useGameStore.getState().getSnapshot();
    const ai = useAIStore.getState();
    const saveData = {
      // 存档格式版本，日后若改结构，导入端照它判断
      v: 2,
      game: snapshot,
      // 只存真正要留的东西：设置与推演记录。
      // 早先整份 AI store 一股脑塞进去，把临时窗口状态也带了上，白占体积
      ai: { settings: ai.settings, conversation: ai.conversation },
      timestamp: Date.now(),
    };
    // 去掉缩进，再把整份存档 gzip 一道；浏览器不支持压缩就退回纯文本
    const text = JSON.stringify(saveData);
    let blob = new Blob([text], { type: "application/json" });
    let name = `save_${new Date().toISOString().slice(0, 10)}.json`;
    if (typeof CompressionStream !== "undefined") {
      try {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
        blob = await new Response(stream).blob();
        name += ".gz";
      } catch {
        /* 压不动就用未压缩的 */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setShowSaveMenu(false);
  };

  const importSave = () => {
    setShowSaveMenu(false);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.gz,.json.gz";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        // 存档可能被 gzip 压过：按魔数判断，压过的先解压，纯文本的照旧读
        const buf = new Uint8Array(await file.arrayBuffer());
        const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
        let text: string;
        if (isGzip) {
          if (typeof DecompressionStream === "undefined") {
            throw new Error("此存档是压缩过的，当前浏览器不支持解压，请换用较新的浏览器导入。");
          }
          const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
          text = await new Response(stream).text();
        } else {
          text = new TextDecoder().decode(buf);
        }
        const saveData = JSON.parse(text);
        if (saveData.game) {
          useGameStore.getState().restoreSnapshot(saveData.game as GameSnapshot);
        }
        if (saveData.ai?.settings) {
          useAIStore.getState().updateSettings(saveData.ai.settings);
        }
        if (saveData.ai?.conversation) {
          useAIStore.getState().restoreConversation(saveData.ai.conversation);
        }
        window.location.reload();
      } catch (err) {
        alert(`导入存档失败：${(err as Error).message}`);
      }
    };
    input.click();
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

  return (
    <header className="mainui-black relative shrink-0 border-b border-ink-lightest/20 bg-paper-aged paper-texture">
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

        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-5 gap-y-2 min-w-0 z-10">
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
            <div className="text-label">寿元</div>
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

          <div className="relative" ref={saveMenuRef}>
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
                  onClick={exportSave}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-caption hover:bg-paper-old transition-smooth"
                >
                  <Download size={14} className="text-ink-light" /> 导出存档
                </button>
                <button
                  onClick={importSave}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-caption hover:bg-paper-old transition-smooth"
                >
                  <Upload size={14} className="text-ink-light" /> 导入存档
                </button>
                <div className="book-divider my-1" />
                <button
                  onClick={startNewGame}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-caption text-cinnabar hover:bg-cinnabar-light/10 transition-smooth"
                >
                  <RotateCcw size={14} /> 新游戏
                </button>
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
