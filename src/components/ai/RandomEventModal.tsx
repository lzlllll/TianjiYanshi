import { useEffect, useRef, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { ChangeNotice } from "@/components/ui/ChangeNotice";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Send } from "lucide-react";

/**
 * 路上的变故。
 *
 * 这扇窗开着的时候关不上：遮罩不接点击，不给了结之前也不给关的按钮，
 * 只能就着眼前这一桩用文字应付过去。模型在正文末尾点了收场的记号、
 * 或是开发者模式里强行收场，它才落得下来。
 */
export function RandomEventModal() {
  const event = useAIStore((s) => s.randomEvent);
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  const replyRandomEvent = useAIStore((s) => s.replyRandomEvent);
  const closeRandomEvent = useAIStore((s) => s.closeRandomEvent);

  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // 新的一段落下来就滚到底
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [event.turns.length, event.opening, event.busy]);

  if (!event.active) return null;

  const busy = event.busy;
  const settled = event.resolved;
  // 了结了才给关；开发者模式随时可以强行收场
  const canClose = settled || isDeveloperMode;

  const handleSend = () => {
    const text = input.trim();
    if (!text || busy || !event.opening) return;
    void replyRandomEvent(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* 遮罩只压住底下，不接点击：没处置完这一桩，退不到地图上去 */}
      <div className="absolute inset-0 bg-ink-darkest/60 animate-inkSpread" />

      <div
        className="scroll-card corner-ornament relative flex h-[72vh] w-full max-w-2xl flex-col rounded-lg"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-gold-500 bg-ink-800 px-6 py-4 cloud-border">
          <div className="flex items-center gap-3">
            <div className="red-seal flex h-10 w-10 items-center justify-center rounded-sm font-brush text-lg">
              变
            </div>
            <div>
              <h2 className="font-brush text-xl tracking-widest text-gold-400">{event.title || "途中有变"}</h2>
              <p className="mt-0.5 font-serif text-xs text-paper-400">
                {event.reason || "途中出了变故"}
                {settled ? "　·　这一桩已了" : "　·　未了结之前，这扇窗关不上"}
              </p>
            </div>
          </div>

          {canClose && (
            <button
              type="button"
              onClick={() => closeRandomEvent()}
              className="rounded border-2 border-paper-400 px-3 py-1 font-serif text-xs text-paper-300 transition hover:border-gold-400 hover:text-paper-50"
            >
              {isDeveloperMode && !settled ? "强行收场" : "收起"}
            </button>
          )}
        </div>

        {event.errorMsg && (
          <div className="flex items-start gap-2 border-b-2 border-cinnabar-500 bg-cinnabar-500 px-6 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-cinnabar-300" />
            <p className="font-serif text-xs leading-relaxed text-cinnabar-300">{event.errorMsg}</p>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {event.opening ? (
            <div className="rounded border-2 border-paper-400 bg-ink-950 p-4 paper-aged">
              <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
                {event.opening}
              </p>
              <ChangeNotice ops={event.openingOps} />
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-10">
              <Loader2 size={15} className="animate-spin text-gold-400" />
              <span className="font-serif text-xs text-paper-400">这一段变故正写着……</span>
            </div>
          )}

          {event.turns.map((t) => (
            <div key={t.id} className={cn("flex gap-3", t.role === "player" ? "flex-row-reverse" : "")}>
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-2 font-brush text-sm",
                  t.role === "player"
                    ? "border-cinnabar-500 bg-cinnabar-500 text-cinnabar-400"
                    : "border-gold-500 bg-gold-500 text-gold-400",
                )}
              >
                {t.role === "player" ? "我" : "变"}
              </div>
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-3 font-serif text-sm leading-relaxed",
                  t.role === "player"
                    ? "border border-cinnabar-500/25 bg-cinnabar-500/10 text-paper-200"
                    : "border border-gold-500/20 bg-gold-500/10 text-paper-200",
                )}
              >
                <span className="whitespace-pre-wrap">{t.content}</span>
                {t.role === "event" && <ChangeNotice ops={t.ops} />}
              </div>
            </div>
          ))}

          {busy && event.opening && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-500/40 bg-gold-500/20 font-brush text-sm text-gold-400">
                变
              </div>
              <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-shimmer rounded-full bg-gold-400" />
                  <span className="h-2 w-2 animate-shimmer rounded-full bg-gold-400" style={{ animationDelay: "0.1s" }} />
                  <span className="h-2 w-2 animate-shimmer rounded-full bg-gold-400" style={{ animationDelay: "0.2s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="sticky bottom-0 border-t border-gold-500/20 bg-ink-800/95 px-6 py-4 backdrop-blur">
          {settled ? (
            <p className="font-serif text-xs text-paper-400/60">
              这一桩已经了结，可以收起了。此后仍可与它相关的人再作计较。
            </p>
          ) : (
            <>
              {event.options.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {event.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setInput(opt)}
                      disabled={busy || !event.opening}
                      title="填入输入栏，可再修改后应付"
                      className="rounded border-2 border-paper-400 bg-ink-900 px-2.5 py-1 font-serif text-xs text-paper-200 transition hover:border-gold-500 hover:bg-gold-500 hover:text-gold-400 disabled:opacity-40"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy || !event.opening}
                  placeholder="你打算怎么应付？&#10;（Ctrl/Cmd + Enter 送去）"
                  rows={3}
                  className="input-ink flex-1 resize-none leading-relaxed"
                  style={{ fontFamily: '"Noto Serif SC", serif' }}
                />
                <div className="shrink-0">
                  <SealButton onClick={handleSend} disabled={!input.trim() || busy || !event.opening} className="px-4">
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={14} /> 应付
                      </>
                    )}
                  </SealButton>
                </div>
              </div>
              <p className="mt-2 font-serif text-[11px] text-paper-400/40">
                写你要做的事、要问的话、要使的手段，写法随你；这一段里的得失都会照算。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
