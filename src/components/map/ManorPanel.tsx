import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { manorKey, manorTitle } from "@/data/npcGen";
import { formatGameTime } from "@/lib/gameTime";
import type { Manor, Relation } from "@/data/types";
import { Home, Loader2, MessageCircle, Send, X } from "lucide-react";

/** 点开一处大户住宅时要看的东西 */
export interface ManorTarget {
  cityId: string;
  /** 城名，用来拼出「长安·赵府」这样的宅号 */
  cityName: string;
  districtId: number;
  manor: Manor;
}

interface ManorPanelProps extends ManorTarget {
  onClose: () => void;
  /** 得了主家允准，转入宅内人员那套可交谈的面板 */
  onEnter: (label: string, members: Relation[]) => void;
}

/** 门房对话框里的一来一往 */
interface GateLine {
  role: "player" | "gate";
  text: string;
}

export function ManorPanel({ cityId, cityName, districtId, manor, onClose, onEnter }: ManorPanelProps) {
  const advanceTime = useGameStore((s) => s.advanceTime);
  const currentTime = useGameStore((s) => s.currentTime);
  const setManorBackground = useGameStore((s) => s.setManorBackground);
  const admitManor = useGameStore((s) => s.admitManor);
  const probeManor = useAIStore((s) => s.probeManor);

  const key = manorKey(cityId, districtId);
  // 传进来的只是推门那一刻的样子；打听过、允准入内之后得看存档里最新的这一份
  const live = useGameStore((s) => s.manors[key]) ?? manor;
  const label = manorTitle(cityName, live);

  const [probing, setProbing] = useState(false);
  const [error, setError] = useState("");
  const [gateOpen, setGateOpen] = useState(false);

  /** 去街坊那儿转一圈问这户人家的底细；问过一回就不必再问 */
  const askNeighbors = async () => {
    if (probing || live.background) return;
    setProbing(true);
    setError("");
    try {
      const text = await probeManor({
        label,
        surname: live.surname,
        standing: live.standing,
        members: live.members,
      });
      setManorBackground(key, text);
      // 走街串巷问一圈，一个时辰就这么过去了
      advanceTime(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProbing(false);
    }
  };

  /** 进门：先记下主家的允准，再把宅内的人交给上层换成可交谈的面板 */
  const enterHouse = () => {
    admitManor(key);
    setGateOpen(false);
    onEnter(label, live.members);
  };

  return (
    <div className="mainui-black fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[78vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Home size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{label}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5 truncate">
                {live.standing} · 宅中 {live.members.length} 口
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <section>
            <h3 className="font-brush text-sm text-pine-400 tracking-widest mb-2">宅中人口</h3>
            {/* 隔着门墙只知道有这么几号人，名姓之外一概不知，要认得还得进去说话 */}
            <div className="flex flex-wrap gap-2">
              {live.members.map((m) => (
                <span
                  key={m.id}
                  className="px-2.5 py-1 rounded border border-gold-500/20 bg-ink-800/50 font-serif text-xs text-paper-200"
                >
                  {m.name}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-brush text-sm text-gold-400/80 tracking-widest mb-2">街坊所言</h3>
            {live.background ? (
              <ScrollCard className="!p-4">
                <p className="font-serif text-base text-paper-100 leading-relaxed whitespace-pre-wrap">
                  {live.background}
                </p>
              </ScrollCard>
            ) : (
              <p className="font-serif text-xs text-paper-400/50 py-4 text-center">
                这户人家什么来头，街坊间大约问得出来。
              </p>
            )}
          </section>

          {error && (
            <p className="font-serif text-xs text-cinnabar-400 leading-relaxed">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <SealButton
              onClick={askNeighbors}
              disabled={probing || !!live.background}
              variant="ghost"
              className="px-4 py-2 text-sm"
            >
              {probing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <MessageCircle size={14} className="mr-1" />}
              {live.background ? "已打听过" : "打听住户"}
            </SealButton>

            <SealButton
              onClick={() => (live.admitted ? enterHouse() : setGateOpen(true))}
              className="px-4 py-2 text-sm"
            >
              {live.admitted ? "入内拜会" : "请门房通报"}
            </SealButton>

            <span className="font-serif text-[11px] text-paper-400/45 ml-auto">
              {live.background ? `当前 ${formatGameTime(currentTime)}` : "打听一趟费一个时辰"}
            </span>
          </div>
        </div>
      </div>

      {gateOpen && (
        <GateModal
          label={label}
          surname={live.surname}
          standing={live.standing}
          gatekeeper={live.gatekeeper}
          members={live.members}
          onAdmitted={enterHouse}
          onClose={() => setGateOpen(false)}
        />
      )}
    </div>
  );
}

/** 门外求通禀：说一句话由门房定夺，通传不成这一遭就走不下去了 */
function GateModal({
  label,
  surname,
  standing,
  gatekeeper,
  members,
  onAdmitted,
  onClose,
}: {
  label: string;
  surname: string;
  standing: string;
  gatekeeper: Relation;
  members: Relation[];
  onAdmitted: () => void;
  onClose: () => void;
}) {
  const askGatekeeper = useAIStore((s) => s.askGatekeeper);

  const [lines, setLines] = useState<GateLine[]>([]);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** 门房已经给了准信：要么挡驾，要么允准，都不再听第二句 */
  const [settled, setSettled] = useState<"" | "refused" | "master_absent" | "admitted">("");

  const send = async () => {
    const text = words.trim();
    if (!text || busy || settled) return;
    setLines((prev) => [...prev, { role: "player", text }]);
    setWords("");
    setBusy(true);
    setError("");
    try {
      const { outcome, reply } = await askGatekeeper({
        label,
        surname,
        standing,
        gatekeeper,
        members,
        words: text,
      });
      setLines((prev) => [...prev, { role: "gate", text: reply }]);
      setSettled(outcome);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  };

  const resultNote =
    settled === "refused"
      ? "门房把话堵死了，再缠下去也是白搭。"
      : settled === "master_absent"
        ? "话是传进去了，主家不肯见人。今日这一趟只能到这儿。"
        : settled === "admitted"
          ? "门房侧身让开，引你往里走。"
          : "";

  return (
    <div className="mainui-black fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[72vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 red-seal rounded-sm text-lg">{gatekeeper.name.charAt(0)}</div>
            <div className="min-w-0">
              <h2 className="font-brush text-lg text-gold-400 tracking-widest truncate">{gatekeeper.name}</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5">{label} · 门房</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {lines.length === 0 && (
            <div className="text-center py-6">
              <p className="font-brush text-sm text-paper-400/60 tracking-widest">门前</p>
              <p className="font-serif text-xs text-paper-400/40 mt-2">
                {gatekeeper.name}堵在阶下，眯着眼打量你，等你先开口。
              </p>
            </div>
          )}

          {lines.map((line, index) => (
            <div key={index} className={line.role === "player" ? "text-right" : ""}>
              <div
                className={
                  line.role === "player"
                    ? "inline-block max-w-[85%] text-left rounded-lg px-4 py-2.5 bg-cinnabar-500/15 border border-cinnabar-500/30 rounded-br-none"
                    : "inline-block max-w-[85%] text-left rounded-lg px-4 py-2.5 bg-gold-500/10 border border-gold-500/20 rounded-bl-none"
                }
              >
                <p className="font-serif text-sm text-paper-100 leading-relaxed whitespace-pre-wrap">{line.text}</p>
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 font-serif text-xs text-paper-400/60">
              <Loader2 size={14} className="animate-spin text-gold-400" />
              门房正在打量你……
            </div>
          )}

          {resultNote && (
            <p className="font-serif text-xs text-gold-400/70 leading-relaxed pt-1">{resultNote}</p>
          )}

          {error && <p className="font-serif text-xs text-cinnabar-400 leading-relaxed">{error}</p>}
        </div>

        <div className="sticky bottom-0 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          {settled ? (
            <div className="flex justify-end gap-3">
              {settled === "admitted" ? (
                <SealButton onClick={onAdmitted} className="px-6 py-2.5 text-sm">
                  随门房入内
                </SealButton>
              ) : (
                <SealButton onClick={onClose} variant="ghost" className="px-6 py-2.5 text-sm">
                  作罢
                </SealButton>
              )}
            </div>
          ) : (
            <div className="flex gap-3">
              <textarea
                value={words}
                onChange={(e) => setWords(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={busy}
                placeholder="在门外说些什么……&#10;（Ctrl/Cmd + Enter 送上）"
                rows={2}
                className="flex-1 input-ink resize-none leading-relaxed"
                style={{ fontFamily: '"Noto Serif SC", serif' }}
              />
              <SealButton
                onClick={send}
                disabled={!words.trim() || busy}
                className="shrink-0 self-end"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /> 说</>}
              </SealButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
