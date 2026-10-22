import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_PARTY_SIZE, useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { SealButton } from "@/components/ui/SealButton";
import { isAroundHere } from "@/data/npcGen";
import { aiReady } from "@/data/backend";
import type { Relation } from "@/data/types";
import { cn } from "@/lib/utils";
import { migrateRelation } from "@/data/npcGen";
import { X, Loader2, Send, Trash2, UserPlus, ScrollText, Package } from "lucide-react";

export function NPCChatModal() {
  const npcChat = useAIStore((s) => s.npcChat);
  const sendNPCMessage = useAIStore((s) => s.sendNPCMessage);
  const closeNPCChat = useAIStore((s) => s.closeNPCChat);
  const clearNPCChat = useAIStore((s) => s.clearNPCChat);
  const getOrCreateNPCProfile = useAIStore((s) => s.getOrCreateNPCProfile);
  const inviteToParty = useAIStore((s) => s.inviteToParty);
  const removeFromParty = useAIStore((s) => s.removeFromParty);
  const sendPartyMessage = useAIStore((s) => s.sendPartyMessage);
  const chatHidden = useAIStore((s) => s.chatHidden);
  const hideNPCChat = useAIStore((s) => s.hideNPCChat);
  const relations = useGameStore((s) => s.relations);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const inventory = useGameStore((s) => s.inventory);
  const settings = useAIStore((s) => s.settings);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [giftCount, setGiftCount] = useState(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  const activeNpcId = npcChat.activeNpcId;
  const profile = npcChat.profiles.find((p) => p.npcId === activeNpcId);
  const relation = relations.find((r) => r.id === activeNpcId);
  const isTyping = npcChat.isTyping;

  // 同席的几个人；旧档或还没点过人时兜一个空
  const partyIds = useMemo(
    () => (Array.isArray(npcChat.partyIds) ? npcChat.partyIds : []),
    [npcChat.partyIds],
  );
  const members = useMemo(
    () => partyIds.map((id) => relations.find((r) => r.id === id)).filter((r): r is Relation => !!r),
    [partyIds, relations],
  );
  const group = members.length > 1;
  const partyMessages = Array.isArray(npcChat.partyMessages) ? npcChat.partyMessages : [];
  const isPartyTyping = !!npcChat.isPartyTyping;

  /** 能与这一席同坐的人：和最先开口的那位在同一处，且不是仇敌 */
  const anchor = members[0];
  const seat = anchor?.cityId
    ? { cityId: anchor.cityId, districtId: anchor.districtId ?? -1 }
    : { cityId: currentPlaceId, districtId: -1 };
  const candidates = useMemo(
    () =>
      relations.filter(
        (r) =>
          r.id !== activeNpcId &&
          r.type !== "enemy" &&
          !partyIds.includes(r.id) &&
          isAroundHere(r, seat.cityId, seat.districtId),
      ),
    [relations, activeNpcId, partyIds, seat.cityId, seat.districtId],
  );

  /** 能递出去的东西：活物不送，身上正用着的法器也不列，免得误送 */
  const giftable = useMemo(
    () =>
      (Array.isArray(inventory) ? inventory : []).filter(
        (i) => i && i.count > 0 && i.type !== "灵兽" && !i.equipped,
      ),
    [inventory],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 同席的每一位都要有自己那一份人设，谁缺就现推一份
  useEffect(() => {
    const ids = partyIds.length > 0 ? partyIds : activeNpcId ? [activeNpcId] : [];
    const missing = ids.filter(
      (id) => relations.some((r) => r.id === id) && !npcChat.profiles.some((p) => p.npcId === id),
    );
    if (missing.length === 0) return;

    setLoading(true);
    setError("");
    Promise.all(
      missing.map((id) => {
        const rel = relations.find((r) => r.id === id)!;
        return getOrCreateNPCProfile(id, rel.name, rel.title);
      }),
    )
      .then(() => {
        if (isMountedRef.current) setLoading(false);
      })
      .catch((e) => {
        if (isMountedRef.current) {
          setError(e.message);
          setLoading(false);
        }
      });
  }, [activeNpcId, partyIds, relations, npcChat.profiles, getOrCreateNPCProfile]);

  useEffect(() => {
    if (isMountedRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [profile?.messages.length, partyMessages.length]);

  useEffect(() => {
    if (npcChat.errorMsg) {
      setError(npcChat.errorMsg);
      setTimeout(() => {
        if (isMountedRef.current) setError("");
      }, 5000);
    }
  }, [npcChat.errorMsg]);

  if (!activeNpcId || chatHidden) return null;

  const busy = isTyping || isPartyTyping;

  const handleSend = () => {
    const text = input.trim();
    if (busy) return;
    // 同席时玩家这一句是冲着一桌人说的，诸位依次答话
    if (group) {
      if (!text) return;
      sendPartyMessage(text);
      setInput("");
      setError("");
      return;
    }
    if (!text) return;
    sendNPCMessage(activeNpcId, text);
    setInput("");
    setError("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  /** 选中的那一样；行囊变了就跟着失效 */
  const giftItem = giftable.find((i) => i.id === giftId) ?? null;
  const giftTo = (group ? members[0]?.name : relation?.name) || profile?.name || "他";

  /** 从行囊里取一样递过去：东西当场从行囊扣下，再请对方就着这一递答话 */
  const handleGift = () => {
    if (busy || !giftItem) return;
    // 递了东西却没人应声，不如先拦住：东西不能白扣
    if (!aiReady(settings)) {
      setError("推演接口尚未接通：先在设置里接上模型，再递东西。");
      return;
    }
    const n = Math.max(1, Math.min(giftCount, giftItem.count));
    const unit = giftItem.type === "丹药" || giftItem.type === "符箓" ? "枚" : "件";
    const desc = String(giftItem.desc || "").trim().slice(0, 40);
    const text = `（你从行囊里取出${n > 1 ? `${n}${unit}` : `一${unit}`}「${giftItem.name}」，递到${giftTo}面前${desc ? `：${desc}` : ""}）`;

    const ok = useGameStore
      .getState()
      .giveItemAway({ itemId: giftItem.id, count: n, toName: giftTo });
    if (!ok) {
      setError("行囊里已经没有这件东西了。");
      return;
    }
    setGiftOpen(false);
    setGiftId(null);
    setGiftCount(1);
    setError("");
    if (group) sendPartyMessage(text);
    else sendNPCMessage(activeNpcId, text);
  };

  const typeLabels: Record<string, string> = {
    dao_companion: "道侣",
    master: "师父",
    disciple: "弟子",
    friend: "好友",
    enemy: "仇敌",
  };

  const showEmpty = group ? partyMessages.length === 0 : !!profile && profile.messages.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink-darkest/60"
        onClick={closeNPCChat}
      />

      <div
        className="relative scroll-card corner-ornament spiritual-particles rounded-lg w-full max-w-3xl h-[70vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b-2 border-gold-500 bg-ink-800 cloud-border">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 red-seal rounded-sm text-xl font-brush flex items-center justify-center">
              {relation?.name.charAt(0) || "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-brush text-xl text-gold-400 tracking-widest text-glow-spiritual">
                  {group ? `${members.map((m) => m.name).join("、")}` : relation?.name || profile?.name || "未知"}
                </h2>
                {group && (
                  <span className="font-serif text-xs text-jade-400/80 border border-jade-500/35 bg-jade-500/10 px-1.5 py-0.5 rounded">
                    同席 {members.length} 人
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="font-serif text-xs text-paper-400/60">
                  {group ? "众人相谈" : typeLabels[relation?.type || "friend"]}
                </span>
                {relation && !group && (
                  <div className="flex items-center gap-1">
                    <div className="w-20 h-1.5 rounded-full bg-ink-900/60 overflow-hidden spiritual-border">
                      <div
                        className="h-full bg-gradient-to-r from-cinnabar-500 via-gold-400 to-jade-400 shadow-spiritual-glow animate-auraFlow"
                        style={{ width: `${((migrateRelation(relation).relation + 100) / 200) * 100}%` }}
                      />
                    </div>
                    <span className="font-number text-xs text-paper-400/50">
                      {migrateRelation(relation).relation}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={hideNPCChat}
              title="先收起这一席，回问道窗看前情；人还坐在席上，随时可回来"
              className="font-serif text-xs text-paper-400/50 hover:text-gold-400 px-2 py-1 rounded border border-paper-400/10 hover:border-gold-400/40 transition flex items-center gap-1"
            >
              <ScrollText size={10} /> 看叙事
            </button>
            <button
              onClick={() => {
                if (confirm("确定要清空与该 NPC 的对话记录？")) {
                  clearNPCChat(activeNpcId);
                }
              }}
              className="font-serif text-xs text-paper-400/50 hover:text-cinnabar-400 px-2 py-1 rounded border border-paper-400/10 hover:border-cinnabar-500/30 transition flex items-center gap-1"
            >
              <Trash2 size={10} /> 清空
            </button>
            <button
              onClick={closeNPCChat}
              className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 在场的人：点名字可请入、可请出 */}
        <div className="px-6 py-2 border-b border-gold-500/15 bg-ink-800/70 flex flex-wrap items-center gap-1.5">
          <span className="font-serif text-[11px] text-paper-400/55 mr-1">在场</span>
          {(members.length > 0 ? members : relation ? [relation] : []).map((m, i) => (
            <button
              key={m.id}
              onClick={() => i > 0 && removeFromParty(m.id)}
              disabled={i === 0}
              title={i === 0 ? "这一席的主，走不得" : "请他先走一步"}
              className={cn(
                "px-2 py-0.5 rounded border font-serif text-[11px] transition",
                i === 0
                  ? "border-gold-500/35 bg-gold-500/10 text-gold-400"
                  : "border-jade-500/35 bg-jade-500/10 text-jade-300 hover:border-cinnabar-500/40 hover:text-cinnabar-300",
              )}
            >
              {m.name}
              {i > 0 && " ×"}
            </button>
          ))}

          {candidates.length > 0 && (
            <>
              <span className="font-serif text-[11px] text-paper-400/40 ml-2 mr-1">可请入</span>
              {candidates.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  onClick={() => inviteToParty(r.id)}
                  disabled={partyIds.length >= MAX_PARTY_SIZE}
                  title={partyIds.length >= MAX_PARTY_SIZE ? `一席最多 ${MAX_PARTY_SIZE} 人` : `请${r.name}一并说话`}
                  className="px-2 py-0.5 rounded border border-paper-400/20 font-serif text-[11px] text-paper-400/70 hover:border-gold-400/45 hover:text-paper-100 transition disabled:opacity-40 disabled:hover:border-paper-400/20"
                >
                  <UserPlus size={9} className="inline mr-0.5 -mt-0.5" />
                  {r.name}
                </button>
              ))}
            </>
          )}
        </div>

        {/* 人设信息（初次加载） */}
        {loading && (
          <div className="px-6 py-4 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-gold-400" />
            <span className="font-serif text-xs text-paper-400/60">正在推演 {relation?.name} 的命格……</span>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="px-6 py-2 bg-cinnabar-500/10 border-b border-cinnabar-500/30">
            <p className="font-serif text-xs text-cinnabar-300">{error}</p>
          </div>
        )}

        {/* 消息列表 */}
        {(profile || group) && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {showEmpty ? (
              <div className="text-center py-8">
                <p className="font-brush text-sm text-paper-400/60 tracking-widest">
                  {group ? "众人相叙" : "开口交谈"}
                </p>
                <p className="font-serif text-xs text-paper-400/40 mt-2">
                  {group ? `与${members.map((m) => m.name).join("、")}说些什么吧……` : `与 ${profile?.name} 说些什么吧……`}
                </p>
              </div>
            ) : group ? (
              partyMessages.map((msg) =>
                msg.speakerId === "system" ? (
                  <SystemNote key={msg.id} content={msg.content} />
                ) : (
                  <Bubble
                    key={msg.id}
                    mine={msg.speakerId === "player"}
                    avatar={msg.speakerId === "player" ? "我" : msg.speakerName.charAt(0) || "?"}
                    name={msg.speakerId === "player" ? "" : msg.speakerName}
                    content={msg.content}
                    timestamp={msg.timestamp}
                  />
                ),
              )
            ) : (
              (Array.isArray(profile?.messages) ? profile!.messages : []).map((msg) =>
                msg.role === "system" ? (
                  <SystemNote key={msg.id} content={msg.content} />
                ) : (
                  <Bubble
                    key={msg.id}
                    mine={msg.role === "player"}
                    avatar={msg.role === "player" ? "我" : profile?.name?.charAt(0) || "?"}
                    content={msg.content}
                    timestamp={msg.timestamp}
                  />
                ),
              )
            )}

            {/* 打字中 */}
            {busy && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-sm bg-gold-500/20 text-gold-400 border border-gold-500/40 flex items-center justify-center shrink-0 font-brush text-sm">
                  {group ? "众" : profile?.name?.charAt(0) || "?"}
                </div>
                <div className="bg-gold-500/10 border border-gold-500/20 rounded-lg rounded-bl-none px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gold-400 animate-shimmer" />
                    <span className="w-2 h-2 rounded-full bg-gold-400 animate-shimmer" style={{ animationDelay: "0.1s" }} />
                    <span className="w-2 h-2 rounded-full bg-gold-400 animate-shimmer" style={{ animationDelay: "0.2s" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* 输入区域 */}
        {(profile || group) && (
          <div className="sticky bottom-0 px-6 py-4 border-t-2 border-gold-500 bg-ink-800">
            {giftOpen && (
              <div className="mb-3 rounded border border-gold-500/25 bg-ink-900/50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-xs text-gold-400">从行囊取一件，递与{giftTo}</span>
                  <button
                    onClick={() => setGiftOpen(false)}
                    className="text-paper-400/50 hover:text-paper-100 transition"
                    aria-label="收起"
                  >
                    <X size={12} />
                  </button>
                </div>

                {giftable.length === 0 ? (
                  <p className="font-serif text-xs text-paper-400/45 mt-2">行囊里没有可送的东西。</p>
                ) : (
                  <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1">
                    {giftable.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => {
                          setGiftId(it.id);
                          setGiftCount(1);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1 rounded border font-serif text-xs transition",
                          giftId === it.id
                            ? "border-gold-500/60 bg-gold-500/15 text-paper-100"
                            : "border-paper-400/15 text-paper-300/80 hover:border-gold-400/40",
                        )}
                      >
                        <span className="text-gold-400">{it.icon}</span>
                        <span className="flex-1 text-left">{it.name}</span>
                        <span className="text-paper-400/45">{it.type}·{it.grade}</span>
                        <span className="font-number text-paper-400/60">×{it.count}</span>
                      </button>
                    ))}
                  </div>
                )}

                {giftItem && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-serif text-[11px] text-paper-400/55">数量</span>
                    <button
                      onClick={() => setGiftCount((c) => Math.max(1, c - 1))}
                      disabled={giftCount <= 1}
                      className="w-6 h-6 rounded border border-paper-400/20 text-paper-300/80 hover:border-gold-400/50 disabled:opacity-40 transition"
                    >
                      －
                    </button>
                    <span className="font-number text-xs text-paper-100 w-6 text-center">{giftCount}</span>
                    <button
                      onClick={() => setGiftCount((c) => Math.min(giftItem.count, c + 1))}
                      disabled={giftCount >= giftItem.count}
                      className="w-6 h-6 rounded border border-paper-400/20 text-paper-300/80 hover:border-gold-400/50 disabled:opacity-40 transition"
                    >
                      ＋
                    </button>
                    <SealButton
                      variant="ghost"
                      onClick={handleGift}
                      disabled={busy}
                      className="ml-auto px-3 py-1 text-xs"
                    >
                      递过去
                    </SealButton>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={busy}
                placeholder="输入话语……&#10;（Ctrl/Cmd + Enter 发送）"
                rows={3}
                className="flex-1 input-ink resize-none leading-relaxed"
                style={{ fontFamily: '"Noto Serif SC", serif' }}
              />
              <div className="shrink-0 flex flex-col gap-2">
                <SealButton onClick={handleSend} disabled={!input.trim() || busy} className="px-4">
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Send size={14} /> 言
                    </>
                  )}
                </SealButton>
                {group && (
                  <SealButton
                    variant="ghost"
                    onClick={() => {
                      setError("");
                      sendPartyMessage(null);
                    }}
                    disabled={busy}
                    className="px-4 py-1.5 text-xs"
                    title="这一回你不开口，只在一旁听他们说"
                  >
                    略过
                  </SealButton>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                onClick={() => setGiftOpen((v) => !v)}
                disabled={busy}
                title="从行囊里取一样东西递过去"
                className={cn(
                  "font-serif text-[11px] px-2 py-1 rounded border transition flex items-center gap-1 disabled:opacity-40",
                  giftOpen
                    ? "border-gold-500/50 text-gold-400 bg-gold-500/10"
                    : "border-paper-400/15 text-paper-400/55 hover:border-gold-400/40 hover:text-gold-400",
                )}
              >
                <Package size={11} /> 赠物
              </button>
              {group && (
                <p className="font-serif text-[11px] text-paper-400/40">
                  你说一句，{members.map((m) => m.name).join("、")}依次接话；不想开口就点「略过」。
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 系统旁注：判定未过这类，居中一行小字，不占谁的气泡 */
function SystemNote({ content }: { content: string }) {
  return (
    <p className="text-center font-serif text-[11px] leading-relaxed text-cinnabar-300/80 px-4">
      {content}
    </p>
  );
}

function Bubble({
  mine,
  avatar,
  name,
  content,
  timestamp,
}: {
  mine: boolean;
  avatar: string;
  name?: string;
  content: string;
  timestamp: number;
}) {
  return (
    <div className={cn("flex gap-3", mine ? "flex-row-reverse" : "")}>
      <div
        className={cn(
          "w-8 h-8 rounded-sm flex items-center justify-center shrink-0 font-brush text-sm",
          mine
            ? "bg-cinnabar-500/20 text-cinnabar-400 border border-cinnabar-500/40"
            : "bg-gold-500/20 text-gold-400 border border-gold-500/40",
        )}
      >
        {avatar}
      </div>
      <div
        className={cn(
          "max-w-[70%] rounded-lg px-4 py-3",
          mine
            ? "bg-cinnabar-500/15 border border-cinnabar-500/30 rounded-br-none"
            : "bg-gold-500/10 border border-gold-500/20 rounded-bl-none",
        )}
      >
        {name && (
          <div className="font-brush text-[11px] text-gold-400/80 mb-1">{name}</div>
        )}
        <p className="font-serif text-sm text-paper-100 leading-relaxed whitespace-pre-wrap">
          {content}
        </p>
        <div
          className={cn(
            "font-serif text-xs text-paper-400/40 mt-1",
            mine ? "text-right" : "",
          )}
        >
          {new Date(timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
