import { useEffect, useRef, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { ChangeNotice } from "@/components/ui/ChangeNotice";
import { BattlePanel } from "@/components/battle/BattlePanel";
import {
  Sparkles,
  Square,
  RotateCcw,
  Settings as SettingsIcon,
  Loader2,
  Database,
  Copy,
  Check,
  X,
} from "lucide-react";
import { AI_BACKEND_READY } from "@/data/backend";
import { REALM_NAMES } from "@/data/mockData";
import { effectiveHpMax } from "@/lib/buffUtils";
import type { BattleEntity, BattleFoeBrief } from "@/data/types";

/** 同一模样的几名对手，按甲乙丙丁依次称 */
const FOE_SUFFIX = ["甲", "乙", "丙", "丁"];

/** 战场右侧给敌人留的几格，依次站开 */
const FOE_SPOTS = [
  { x: 7, y: 2 },
  { x: 8, y: 2 },
  { x: 7, y: 4 },
  { x: 8, y: 4 },
  { x: 7, y: 6 },
  { x: 8, y: 6 },
  { x: 7, y: 8 },
  { x: 8, y: 8 },
];

/** 境界名归到境界序号：认全称，也认只报大境界的 */
function realmIndexOf(raw: string | undefined, fallback: number): number {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  const exact = REALM_NAMES.indexOf(text);
  if (exact >= 0) return exact;
  const idx = REALM_NAMES.findIndex((name) => name.startsWith(text));
  return idx >= 0 ? idx : fallback;
}

/**
 * 叙事点名的对手 → 战场上的敌人。
 * 人数与名号照叙事所写，气血与灵力照境界由代码算定，不由模型报数。
 * 叙事没点出对手时，也立一名与玩家相仿的对手，不让战场空着。
 */
function buildBattleFoes(foes: BattleFoeBrief[] | undefined, playerRealm: number): BattleEntity[] {
  const list = Array.isArray(foes) && foes.length > 0 ? foes : [{ name: "拦路的对手" }];
  const entities: BattleEntity[] = [];
  for (let group = 0; group < list.length; group++) {
    const foe = list[group];
    const count = Math.max(1, Math.min(4, Math.trunc(Number(foe.count) || 1)));
    const realm = realmIndexOf(foe.realm, playerRealm);
    const maxHp = Math.max(40, 70 + realm * 26);
    const maxMp = Math.max(20, 30 + realm * 8);
    for (let i = 0; i < count && entities.length < FOE_SPOTS.length; i++) {
      const slot = FOE_SPOTS[entities.length];
      entities.push({
        id: `enemy-${group + 1}-${i + 1}`,
        name: count > 1 ? `${foe.name}${FOE_SUFFIX[i] ?? i + 1}` : foe.name,
        type: "enemy",
        position: { ...slot },
        hp: maxHp,
        maxHp,
        mp: maxMp,
        maxMp,
        icon: foe.name.slice(0, 1),
      });
    }
  }
  return entities;
}

interface StoryPanelProps {
  onOpenSettings: () => void;
  /** 提供了就渲染关闭按钮；问道窗口用它关窗 */
  onClose?: () => void;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="关闭问道窗口"
      title="关闭（Esc）"
      className="absolute top-4 right-4 z-20 w-8 h-8 rounded flex items-center justify-center bg-ink-900 border-2 border-paper-400 text-paper-200 hover:text-gold-400 hover:border-gold-500 transition"
    >
      <X size={16} />
    </button>
  );
}

const QUICK_DECISIONS = [
  "闭关修炼三日，潜心参悟功法",
  "前往坊市，购买炼丹材料",
  "挑战同门师兄，切磋道法",
  "探索后山秘境，寻找机缘",
];

export function StoryPanel({ onOpenSettings, onClose }: StoryPanelProps) {
  const conversation = useAIStore((s) => s.conversation);
  const runTurn = useAIStore((s) => s.runTurn);
  const regenerate = useAIStore((s) => s.regenerate);
  const cancel = useAIStore((s) => s.cancel);
  const clearConversation = useAIStore((s) => s.clearConversation);
  const battle = useAIStore((s) => s.battle);
  const startBattle = useAIStore((s) => s.startBattle);
  const startSectWar = useAIStore((s) => s.startSectWar);
  const openNarrativeHaggle = useAIStore((s) => s.openNarrativeHaggle);
  const openNarrativeShop = useAIStore((s) => s.openNarrativeShop);
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  // 叙事里有人当面搭话：先摆一个入口，点过头才开交谈窗
  const pendingChat = useAIStore((s) => s.pendingChat);
  const confirmPendingChat = useAIStore((s) => s.confirmPendingChat);
  const dismissPendingChat = useAIStore((s) => s.dismissPendingChat);
  // 交谈窗收起去看叙事时，留一个回去的入口
  const chatHidden = useAIStore((s) => s.chatHidden);
  const activeNpcId = useAIStore((s) => s.npcChat.activeNpcId);
  const showNPCChat = useAIStore((s) => s.showNPCChat);
  const closeNPCChat = useAIStore((s) => s.closeNPCChat);

  const quickDecisions = conversation.quickDecisions?.length
    ? conversation.quickDecisions
    : QUICK_DECISIONS;

  const [showRawOutput, setShowRawOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * 翻看先前各回。null 表示停在最新；停了回头便只读旧页，
   * 要落笔演化、或新的一回写完，自会回到最新那一页。
   */
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  /** 叙事挑起的铺面／讲价：先问一声，点过头才进那一扇窗 */
  const [pendingKind, setPendingKind] = useState<"shop" | "haggle" | null>(null);

  const [decision, setDecision] = useState("");
  const narrativeRef = useRef<HTMLDivElement>(null);
  const decisionRef = useRef<HTMLTextAreaElement>(null);
  const isMountedRef = useRef(true);
  /** 记录已经据此开过战的回合，避免压缩/重渲染时重复 startBattle 把战斗重置回第一回合 */
  const battleTurnRef = useRef<string | null>(null);
  /** 同理：叙事挑起的讲价，同一条回合只叫一次窗 */
  const haggleTurnRef = useRef<string | null>(null);
  /** 同理：叙事把玩家引到某家铺子买卖，同一条回合只开一次铺面窗 */
  const shopTurnRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (conversation.stage !== "done") return;
    const lastTurn = conversation.turns[conversation.turns.length - 1];
    if (!lastTurn) return;

    // 新的一回落在页上，翻页自回最新
    setViewIndex(null);

    // 叙事挑起的讲价：先问一声，点过头才开那一扇窗；同一条回合只问一次
    if (lastTurn.haggle && haggleTurnRef.current !== lastTurn.id) {
      haggleTurnRef.current = lastTurn.id;
      setPendingKind("haggle");
    }

    // 叙事把玩家引到某家铺子买卖：同样先问一声，点过头再入内；同一条回合只问一次
    if (!lastTurn.haggle && lastTurn.shop && shopTurnRef.current !== lastTurn.id) {
      shopTurnRef.current = lastTurn.id;
      setPendingKind("shop");
    }

    // 叙事挑起的宗门战另算一路：照对手宗门摆开阵势，攻方还要破它的护山大阵
    const isSectWar = !!lastTurn.sectWar;
    if (!isSectWar && lastTurn.mode !== "battle") return;
    if (battleTurnRef.current === lastTurn.id) return;
    battleTurnRef.current = lastTurn.id;

    if (isSectWar && lastTurn.sectWar) {
      startSectWar(lastTurn.sectWar);
      return;
    }

    const player = useGameStore.getState().player;
    // 同行的几位一并入阵，站在玩家左手边
    const companions = useGameStore.getState().relations.filter((r) => r.traveling);
    // 随身的灵兽也在阵中，贴着玩家站
    const beast = useGameStore.getState().beast;
    // 对面是谁照叙事最后那一行所报：名号、人数与境界都在那儿，气血由代码照境界算
    const foes = buildBattleFoes(lastTurn.battleFoes, player.realmIndex ?? 0);
    // 带伤上阵时，内伤一类状态压低了这一刻的气血上限
    const maxHp = effectiveHpMax(player);
    startBattle({
      width: 10,
      height: 10,
      entities: [
        {
          id: "player",
          name: player.name || "玩家",
          type: "player",
          position: { x: 5, y: 5 },
          hp: Math.min(player.hp, maxHp),
          maxHp,
          mp: player.mp,
          maxMp: player.mpMax,
        },
        ...foes,
        ...(beast
          ? [
              {
                id: "beast",
                name: beast.name,
                type: "ally" as const,
                position: { x: 6, y: 6 },
                hp: beast.hp,
                maxHp: beast.hpMax,
              },
            ]
          : []),
        ...companions.map((c, i) => ({
          id: `ally-${c.id}`,
          name: c.name,
          type: "ally" as const,
          position: { x: 4, y: 4 + i },
          hp: c.stats?.hp,
          maxHp: c.stats?.hpMax,
          mp: c.stats?.mp,
          maxMp: c.stats?.mpMax,
        })),
      ],
    });
  }, [conversation.stage, conversation.turns, startBattle, startSectWar, openNarrativeHaggle, openNarrativeShop]);

  const stage = conversation.stage;
  const isGenerating = stage === "flash" || stage === "pro";
  const turns = conversation.turns;
  const lastTurn = turns[turns.length - 1];
  // 当前翻到第几回：停在最新时看最后一回，翻回头便看那一页
  const shownIndex = turns.length === 0
    ? -1
    : viewIndex === null
      ? turns.length - 1
      : Math.max(0, Math.min(viewIndex, turns.length - 1));
  const shownTurn = shownIndex >= 0 ? turns[shownIndex] : undefined;
  const reviewing = turns.length > 0 && shownIndex !== turns.length - 1;
  const hasApiKey = AI_BACKEND_READY;
  const streamingNarrative = conversation.streamingNarrative ?? "";
  // Pro 阶段流式输出时，实时显示未完成的叙事（尚未解析 OPS 块）
  const streaming = stage === "pro" && !!streamingNarrative;
  // 正文要过完内容闸才上屏，未开闸之前没有 streamingNarrative，仍得让玩家看见这一回在推演
  const generating = stage === "pro" && !streamingNarrative;
  const displayNarrative = streaming && !reviewing ? streamingNarrative : shownTurn?.narrative ?? "";
  const streamingReasoning = conversation.streamingReasoning ?? "";
  // 推理模型先长一段思考才落笔：正文还没出、思维链已经来了，便把「正在思考」亮出来，
  // 免得那一段长长的等待看着像是卡死了
  const thinking = stage === "pro" && !streamingNarrative && !!streamingReasoning;

  useEffect(() => {
    if (narrativeRef.current) {
      narrativeRef.current.scrollTop = narrativeRef.current.scrollHeight;
    }
  }, [turns.length, shownTurn?.narrative, streamingNarrative, shownIndex]);

  const handleSubmit = () => {
    const text = decision.trim();
    if (!text || isGenerating) return;
    // 站在旧页上落笔，先回到最新，再演这一回
    setViewIndex(null);
    setPendingKind(null);
    // 收起去看叙事的那一席，人已起身，便不再留着
    if (chatHidden && activeNpcId) closeNPCChat();
    runTurn(text);
    setDecision("");
  };

  /** 选项只把文字填进输入栏，由玩家确认后再手动演化 */
  const fillDecision = (text: string) => {
    setDecision(text);
    decisionRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 分出胜负后战斗界面转为收尾，这一段也挂在问道窗里
  if (battle.isActive || battle.aftermath) {
    return (
      <div className="relative h-full min-h-0">
        {onClose && <CloseButton onClose={onClose} />}
        <BattlePanel />
      </div>
    );
  }

  return (
    <div className="paper-texture spiritual-particles relative h-full flex flex-col min-h-0 p-6">
      {onClose && <CloseButton onClose={onClose} />}
      <PanelTitle
        title="问道"
        poem="道可道，非常道；名可名，非常名。以心问天，以言演命。"
      />

      {!hasApiKey && (
        <div className="mb-4 rounded-lg border border-cinnabar-500/40 bg-cinnabar-500/10 px-4 py-3 flex items-center gap-3">
          <SettingsIcon size={18} className="text-cinnabar-400 shrink-0" />
          <div className="flex-1 font-serif text-sm text-cinnabar-300">
            推演接口尚未接通。请确认后端服务已启动，且已在后端配好模型密钥。
          </div>
          <SealButton variant="ghost" onClick={onOpenSettings} className="shrink-0">
            前往设置
          </SealButton>
        </div>
      )}

      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* 叙事正文 */}
        <ScrollCard
          title="天机"
          subtitle="演万象，定一念"
          ornament={
            <div className="flex items-center gap-2 text-xs font-serif text-paper-400">
              {turns.length > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <Database size={11} />
                    {shownTurn?.ops.length ?? 0} 变
                  </span>
                  <span>·</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewIndex(Math.max(0, shownIndex - 1))}
                      disabled={shownIndex <= 0 || isGenerating}
                      title="退回到上一回"
                      className="px-1.5 rounded border border-paper-400/25 hover:border-gold-500 hover:text-gold-400 transition disabled:opacity-30 disabled:hover:border-paper-400/25 disabled:hover:text-paper-400"
                    >
                      ‹
                    </button>
                    <span className="font-number text-xs">
                      第 {shownIndex + 1} / {turns.length} 回{reviewing ? " · 回顾" : ""}
                    </span>
                    <button
                      onClick={() => setViewIndex(Math.min(turns.length - 1, shownIndex + 1))}
                      disabled={shownIndex >= turns.length - 1 || isGenerating}
                      title="往后翻一回"
                      className="px-1.5 rounded border border-paper-400/25 hover:border-gold-500 hover:text-gold-400 transition disabled:opacity-30 disabled:hover:border-paper-400/25 disabled:hover:text-paper-400"
                    >
                      ›
                    </button>
                    {reviewing && (
                      <button
                        onClick={() => setViewIndex(null)}
                        title="翻回最新这一回"
                        className="ml-1 px-2 py-0.5 rounded border border-gold-500/40 text-gold-600 hover:bg-gold-500/10 transition"
                      >
                        回到最新
                      </button>
                    )}
                  </div>
                </>
              )}
              {chatHidden && activeNpcId && (
                <button
                  onClick={showNPCChat}
                  title="那一席还没散，回去接着谈"
                  className="ml-1 px-2 py-0.5 rounded border border-jade-500/40 text-jade-600 hover:bg-jade-500/10 transition"
                >
                  回到交谈
                </button>
              )}
            </div>
          }
          className="flex-1 min-h-[45vh] overflow-hidden flex flex-col jade-tablet"
          contentClassName="flex-1 min-h-0 flex flex-col"
        >
          <div
            ref={narrativeRef}
            data-tutorial="story-narrative"
            className="flex-1 overflow-y-auto pr-2 min-h-0"
          >
            {thinking || generating ? (
              <div className="rounded border border-gold-500/25 bg-ink-800/40 px-4 py-3">
                <div className="flex items-center gap-2 font-serif text-sm text-gold-400/90">
                  <Loader2 size={13} className="animate-spin shrink-0" />
                  {streamingReasoning
                    ? `模型正在思考…（${streamingReasoning.length} 字）`
                    : "正在推演这一回…"}
                </div>
                {streamingReasoning && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-serif text-xs text-paper-400/60 select-none">
                      展开思维链
                    </summary>
                    <div className="mt-2 max-h-64 overflow-y-auto font-serif text-xs text-paper-400/80 leading-relaxed whitespace-pre-wrap">
                      {streamingReasoning}
                    </div>
                  </details>
                )}
              </div>
            ) : turns.length === 0 && !streamingNarrative ? (
              <EmptyState />
            ) : (
              <>
                <article className="font-serif text-lg text-paper-100 leading-loose tracking-wide whitespace-pre-wrap">
                  <NarrativeText text={displayNarrative} />
                  {streaming && (
                    <span className="inline-block w-2 h-5 ml-0.5 bg-gold-400/80 animate-pulse align-middle" />
                  )}
                </article>

                {/* 叙事之后列一笔这一回合落到账上的变化：得着的写绿，折了的写红。
                    开篇那一段只立人物、铺世界，不列变化 */}
                {!streaming && !shownTurn?.opening && <ChangeNotice ops={shownTurn?.ops} className="mt-6" />}
              </>
            )}
          </div>

          {/* 输出写完先摆一个入口：转交谈、入铺面、当面讲价，都等玩家点过头再进去 */}
          {(pendingChat || pendingKind) && (
            <div className="mt-3 shrink-0 rounded border border-gold-500/35 bg-gold-500/10 px-4 py-2.5 flex items-center gap-3">
              <p className="flex-1 font-serif text-sm text-ink-dark leading-snug">
                {pendingChat
                  ? `「${pendingChat.name}」似有话要与你当面说。`
                  : pendingKind === "shop"
                    ? "眼前到了一处铺面，可入内挑拣。"
                    : "有人要与你讲价，可当面议定。"}
              </p>
              <SealButton
                onClick={() => {
                  if (pendingChat) {
                    confirmPendingChat();
                    return;
                  }
                  if (pendingKind === "shop" && lastTurn?.shop) {
                    openNarrativeShop(lastTurn.shop);
                  } else if (pendingKind === "haggle" && lastTurn?.haggle) {
                    openNarrativeHaggle(lastTurn.haggle);
                  }
                  setPendingKind(null);
                }}
                className="shrink-0 px-3 py-1 text-xs"
              >
                {pendingChat ? "转入交谈" : "入内查看"}
              </SealButton>
              <button
                onClick={() => {
                  if (pendingChat) dismissPendingChat();
                  setPendingKind(null);
                }}
                className="shrink-0 font-serif text-xs text-ink-light hover:text-cinnabar-500 transition px-2 py-1"
              >
                暂且不去
              </button>
            </div>
          )}

        </ScrollCard>

        {/* 决策输入 */}
        <ScrollCard
          title="心念"
          subtitle="一念既起，万法随之"
          className="shrink min-h-0 overflow-y-auto flex flex-col p-4"
        >
          {/* 快捷决断：极矮屏下让位，保证输入框与按钮完整可见 */}
          <div className="flex flex-wrap gap-1.5 mb-3 shrink-0 [@media(max-height:760px)]:hidden">
            {quickDecisions.map((q) => (
              <button
                key={q}
                onClick={() => fillDecision(q)}
                disabled={isGenerating}
                title="填入输入栏，可再修改后演化"
                className="px-2.5 py-1 rounded text-xs font-serif border-2 border-paper-400 bg-ink-900 text-paper-200 hover:border-gold-500 hover:text-gold-400 hover:bg-gold-500 transition disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>

          <textarea
            ref={decisionRef}
            data-tutorial="story-input"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            placeholder="此处书写你的决断与行动……&#10;（点上方选项可填入此栏，Ctrl/Cmd + Enter 发送）"
            rows={5}
            className="input-ink resize-none leading-relaxed flex-1 min-h-[64px]"
            style={{ fontFamily: '"Noto Serif SC", serif' }}
          />

          {/* 阶段指示器：矮屏下让位给输入与按钮，保证主操作不被挤出 */}
          <div className="mt-3 shrink-0 [@media(max-height:860px)]:hidden">
            <StageIndicator stage={stage} />
          </div>

          {/* 操作按钮 */}
          <div className="mt-3 flex gap-2 shrink-0" data-tutorial="story-evolve">
            {isGenerating ? (
              <SealButton variant="ghost" onClick={cancel} className="flex-1">
                <span className="flex items-center justify-center gap-1.5">
                  <Square size={12} /> 中止
                </span>
              </SealButton>
            ) : (
              <SealButton
                onClick={handleSubmit}
                disabled={!decision.trim()}
                className="flex-1"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Sparkles size={13} /> 演化
                </span>
              </SealButton>
            )}
            <SealButton
              variant="ghost"
              onClick={() => regenerate()}
              disabled={isGenerating || !lastTurn}
              title="删除本轮内容，使用相同输入重新生成"
            >
              <span className="flex items-center justify-center gap-1.5">
                <RotateCcw size={13} /> 重演
              </span>
            </SealButton>
            <button
              onClick={() => {
                if (turns.length === 0) return;
                if (confirm("确定要清除所有问道记录？")) {
                  clearConversation();
                }
              }}
              disabled={turns.length === 0 || isGenerating}
              className="font-serif text-xs text-paper-300 hover:text-cinnabar-400 disabled:opacity-30 px-3 py-2 rounded border-2 border-paper-400 hover:border-cinnabar-500 transition"
            >
              清除
            </button>
          </div>

          {conversation.errorMsg && (
            <div className="mt-3 rounded px-3 py-2 bg-cinnabar-500/10 border border-cinnabar-500/30 font-serif text-xs text-cinnabar-300 leading-relaxed">
              {conversation.errorMsg}
            </div>
          )}
        </ScrollCard>

        {/* 开发者模式 - AI原始输出 */}
        {isDeveloperMode && (
          <ScrollCard
            title="AI原始输出"
            subtitle="开发者模式"
            ornament={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(conversation.lastRawOutput);
                    setCopied(true);
                    setTimeout(() => {
                      if (isMountedRef.current) setCopied(false);
                    }, 2000);
                  }}
                  className="p-1 hover:bg-paper-400/10 rounded transition"
                  title="复制"
                >
                  {copied ? <Check size={14} className="text-jade-400" /> : <Copy size={14} className="text-paper-400/60" />}
                </button>
              </div>
            }
            className="shrink-0"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-serif text-xs text-paper-400/60">
                上一轮AI原始响应
              </span>
              <button
                onClick={() => setShowRawOutput(!showRawOutput)}
                className="font-serif text-xs text-gold-400/80 hover:text-gold-400 transition"
              >
                {showRawOutput ? "收起" : "展开"}
              </button>
            </div>
            {showRawOutput && (
              <pre className="font-mono text-xs text-paper-400/80 bg-ink-900/50 p-3 rounded max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                {conversation.lastRawOutput || "暂无原始输出"}
              </pre>
            )}
          </ScrollCard>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <div className="inline-flex w-20 h-20 rounded-full bg-gold-400/10 border border-gold-400/30 items-center justify-center mb-6 rune-shimmer formation-border">
        <Sparkles size={36} className="text-gold-400/70 animate-runeGlow" />
      </div>
      <p className="font-brush text-xl text-paper-300 tracking-widest mb-2 text-glow-spiritual">
        道心未动
      </p>
      <p className="font-serif text-sm text-paper-400/50 leading-relaxed max-w-md mx-auto">
        书写决断于下，演化万象于上。<br />
        天机自会因你一念而起。
      </p>
    </div>
  );
}

function StageIndicator({ stage }: { stage: string }) {
  const stages: { key: string; label: string; desc: string }[] = [
    { key: "flash", label: "窥机", desc: "数据判断" },
    { key: "pro", label: "演化", desc: "叙事生成" },
    { key: "done", label: "定数", desc: "已应用" },
  ];

  const activeIdx =
    stage === "flash" ? 0 : stage === "pro" ? 1 : stage === "done" ? 2 : -1;

  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => {
        const isActive = i === activeIdx;
        const isDone = i < activeIdx;
        const isError = stage === "error" && i === activeIdx;
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-brush border transition",
                  isActive && "bg-gold-400/20 border-gold-400/60 text-gold-400 shadow-glow rune-shimmer",
                  isDone && "bg-jade-500/15 border-jade-500/40 text-jade-400 shadow-spiritual-glow",
                  isError && "bg-cinnabar-500/20 border-cinnabar-500/50 text-cinnabar-400 shadow-formation-glow",
                  !isActive && !isDone && !isError && "bg-ink-900/40 border-paper-400/15 text-paper-400/40",
                )}
              >
                {isActive ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : isDone ? (
                  "✓"
                ) : (
                  i + 1
                )}
              </div>
              <div
                className={cn(
                  "font-brush text-xs mt-1 tracking-wider",
                  isActive ? "text-gold-400" : isDone ? "text-jade-400/80" : "text-paper-400/40",
                )}
              >
                {s.label}
              </div>
              <div className="font-serif text-xs text-paper-400/40">{s.desc}</div>
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn(
                  "h-px flex-1 -mt-5 transition",
                  i < activeIdx ? "bg-jade-500/40" : "bg-paper-400/15",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NarrativeText({ text }: { text?: string }) {
  const paragraphs = (text || "").split(/\n+/).filter((p) => p.trim());
  if (paragraphs.length === 0) {
    return (
      <p className="text-paper-400/40 text-center py-8">
        暂无叙事内容
      </p>
    );
  }
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-4 indent-[2em]">
          {p}
        </p>
      ))}
    </>
  );
}
