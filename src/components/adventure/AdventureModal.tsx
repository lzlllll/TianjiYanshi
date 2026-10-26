import { useEffect, useRef, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { SealButton } from "@/components/ui/SealButton";
import { ChangeNotice } from "@/components/ui/ChangeNotice";
import { adventureWhere, dangerLabel } from "@/data/adventures";
import type { AdventureChoice } from "@/data/types";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Send, Swords } from "lucide-react";

/**
 * 奇遇那扇窗。
 *
 * 与路上变故不同，它关得上：玩家可以随时抽身离去，那一处仍留在舆图上。
 * 交互有两路——几句话问明白（文字往来），或从旁使一个手段（探查、交涉、出手）。
 * 这里的得失都照算：正文里写下的赏罚经结算落到身上，模型点明了结之后，
 * 这一处或撤去、或留在此处，视它的性质而定。
 *
 * 说过的话会记在奇遇名下，收起这一窗之后再点开，仍是先前那些话，接着往下写。
 */
export function AdventureModal() {
  const adventure = useAIStore((s) => s.adventure);
  const replyAdventure = useAIStore((s) => s.replyAdventure);
  const actAdventure = useAIStore((s) => s.actAdventure);
  const chooseAdventure = useAIStore((s) => s.chooseAdventure);
  const closeAdventure = useAIStore((s) => s.closeAdventure);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const adventures = useGameStore((s) => s.adventures);
  const removeAdventure = useGameStore((s) => s.removeAdventure);

  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const found = (adventures || []).find((a) => a.id === adventure.id);
  const busy = adventure.busy;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [adventure.turns.length, adventure.opening, adventure.busy]);

  // 那一处若已随机缘了结而撤去，这一扇窗也不必再开着
  useEffect(() => {
    if (adventure.active && adventure.id && adventures && !found) closeAdventure();
  }, [adventure.active, adventure.id, adventures, found, closeAdventure]);

  if (!adventure.active) return null;

  const here = !!found && found.cityId === currentPlaceId;

  const handleSend = () => {
    const text = input.trim();
    if (!text || busy || !adventure.opening) return;
    void replyAdventure(text);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // 模型没拟出选择时，退回原先那三个老手段
  const fallbackActs: { id: "explore" | "parley" | "fight"; label: string }[] = [
    { id: "explore", label: "四下探查" },
    { id: "parley", label: "出言交涉" },
    { id: "fight", label: "出手相搏" },
  ];
  const choices: AdventureChoice[] = adventure.choices;

  const handleRemove = () => {
    if (!found) return;
    removeAdventure(found.id);
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 animate-inkSpread" />

      <div
        className="scroll-card corner-ornament relative flex h-[74vh] w-full max-w-2xl flex-col rounded-lg"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-gold-500 bg-ink-800 px-6 py-4 cloud-border">
          <div className="flex items-center gap-3">
            <div className="red-seal flex h-10 w-10 items-center justify-center rounded-sm font-brush text-lg">
              遇
            </div>
            <div className="min-w-0">
              <h2 className="font-brush text-xl tracking-widest text-gold-400">{adventure.title || "奇遇"}</h2>
              <p className="mt-0.5 font-serif text-xs text-paper-400">
                {found ? `${found.kind} · 凶险${dangerLabel(found.danger)} · 在${adventureWhere(found)}` : ""}
                {found?.status === "done" ? "　·　这一处已了结" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {found && found.status === "done" && (
              <button
                type="button"
                onClick={handleRemove}
                title="把这一处从舆图上抹去"
                className="rounded border-2 border-cinnabar-500/45 px-3 py-1 font-serif text-xs text-cinnabar-300 transition hover:border-cinnabar-400 hover:text-cinnabar-200"
              >
                抹去
              </button>
            )}
            <button
              type="button"
              onClick={closeAdventure}
              className="rounded border-2 border-paper-400 px-3 py-1 font-serif text-xs text-paper-300 transition hover:border-gold-400 hover:text-paper-50"
            >
              收起
            </button>
          </div>
        </div>

        {adventure.errorMsg && (
          <div className="flex items-start gap-2 border-b-2 border-cinnabar-500 bg-cinnabar-500 px-6 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-cinnabar-300" />
            <p className="font-serif text-xs leading-relaxed text-cinnabar-300">{adventure.errorMsg}</p>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {adventure.opening ? (
            <div className="rounded border-2 border-gold-500 bg-ink-950 p-4 paper-aged">
              <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
                {adventure.opening}
              </p>
              <ChangeNotice ops={adventure.openingOps} />
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-10">
              <Loader2 size={15} className="animate-spin text-gold-400" />
              <span className="font-serif text-xs text-paper-400/60">这一处正写着……</span>
            </div>
          )}

          {adventure.turns.map((t) => (
            <div key={t.id} className={cn("flex gap-3", t.role === "player" ? "flex-row-reverse" : "")}>
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border font-brush text-sm",
                  t.role === "player"
                    ? "border-cinnabar-500/40 bg-cinnabar-500/20 text-cinnabar-400"
                    : "border-gold-500/40 bg-gold-500/20 text-gold-400",
                )}
              >
                {t.role === "player" ? "我" : "遇"}
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

          {busy && adventure.opening && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-gold-500/40 bg-gold-500/20 font-brush text-sm text-gold-400">
                遇
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
          {adventure.reading ? (
            <div className="flex items-center justify-between gap-3">
              <p className="font-serif text-xs text-paper-400/60">
                这一处已经了结，只剩先前那些话可看。
              </p>
              {found && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="shrink-0 rounded border border-cinnabar-500/45 px-3 py-1 font-serif text-xs text-cinnabar-300 transition hover:bg-cinnabar-500/15 hover:text-cinnabar-200"
                >
                  抹去此处
                </button>
              )}
            </div>
          ) : adventure.resolved ? (
            <div className="flex items-center justify-between gap-3">
              <p className="font-serif text-xs text-paper-400/60">
                这一处已经了结。收起后，它{found?.persistent ? "仍在舆图上，日后再来仍有戏" : "便从舆图上撤去"}。
              </p>
              {found && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="shrink-0 rounded border border-cinnabar-500/45 px-3 py-1 font-serif text-xs text-cinnabar-300 transition hover:bg-cinnabar-500/15 hover:text-cinnabar-200"
                >
                  抹去此处
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {choices.length > 0
                  ? choices.map((c, i) => (
                      <button
                        key={`${c.act}-${i}`}
                        type="button"
                        disabled={busy || !adventure.opening}
                        onClick={() => void chooseAdventure(c)}
                        className={cn(
                          "flex items-center gap-1.5 rounded border px-3 py-1 font-serif text-xs transition",
                          busy || !adventure.opening
                            ? "border-paper-400/15 text-paper-400/40"
                            : c.act === "fight"
                              ? "border-cinnabar-500/45 bg-cinnabar-500/15 text-cinnabar-300 hover:bg-cinnabar-500/25"
                              : c.act === "leave"
                                ? "border-paper-400/25 text-paper-400/80 hover:bg-paper-400/10"
                                : "border-gold-500/35 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20",
                        )}
                      >
                        {c.act === "fight" && <Swords size={12} />}
                        {c.text}
                      </button>
                    ))
                  : fallbackActs.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        disabled={busy || !adventure.opening}
                        onClick={() => void actAdventure(a.id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded border px-3 py-1 font-serif text-xs transition",
                          busy || !adventure.opening
                            ? "border-paper-400/15 text-paper-400/40"
                            : a.id === "fight"
                              ? "border-cinnabar-500/45 bg-cinnabar-500/15 text-cinnabar-300 hover:bg-cinnabar-500/25"
                              : "border-gold-500/35 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20",
                        )}
                      >
                        {a.id === "fight" && <Swords size={12} />}
                        {a.label}
                      </button>
                    ))}
                <button
                  type="button"
                  onClick={closeAdventure}
                  className="ml-auto rounded border border-paper-400/20 px-3 py-1 font-serif text-xs text-paper-400/70 transition hover:text-paper-100"
                >
                  抽身离去
                </button>
              </div>

              <div className="flex gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={busy || !adventure.opening}
                  placeholder="你打算怎么做？&#10;（Ctrl/Cmd + Enter 送去）"
                  rows={3}
                  className="input-ink flex-1 resize-none leading-relaxed"
                  style={{ fontFamily: '"Noto Serif SC", serif' }}
                />
                <div className="shrink-0">
                  <SealButton onClick={handleSend} disabled={!input.trim() || busy || !adventure.opening} className="px-4">
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={14} /> 送去
                      </>
                    )}
                  </SealButton>
                </div>
              </div>
              <p className="mt-2 font-serif text-[11px] text-paper-400/40">
                写你要做的事、要问的话、要使的手段，写法随你；这一处里的得失都会照算。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
