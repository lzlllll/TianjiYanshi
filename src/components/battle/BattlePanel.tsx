import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { BattleMap } from "./BattleMap";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { effectiveHpMax } from "@/lib/buffUtils";
import { effectiveAttributes, movementLimit } from "@/lib/attributes";
import { computableSkills, isHeartConversion, techniqueLevelOf } from "@/lib/skillCalc";
import { styleMatchup, techniqueStyleOf } from "@/data/combatStyles";
import {
  aliveEnemies,
  enemiesInRange,
  rangeLabel,
  rangeOffsets,
  rangeSpan,
  skillRange,
  type SkillRange,
} from "@/data/battleRange";
import { Swords, X, Loader2, Flame, Footprints, Package, Coins, Skull, Flag } from "lucide-react";

export function BattlePanel() {
  const battle = useAIStore((s) => s.battle);
  const endBattle = useAIStore((s) => s.endBattle);
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  // 胜负未分，还在交手
  const ongoing = battle.isActive && !battle.aftermath;

  return (
    // 左侧战事、右侧前情：窗口宽时并排，窄时上下摞着，整页仍可滚动
    <div className="paper-texture spiritual-particles relative h-full flex flex-col lg:flex-row gap-3 lg:gap-5 overflow-hidden p-3 sm:p-5">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <PanelTitle
          title="战斗"
          poem="黄沙百战穿金甲，不破楼兰终不还。"
        />
        {/*
          仗没打完就没有退出的路：寻常玩家只能把它打到分出胜负。
          开发者另开一扇门，免得调试时被自己挑起的战事困住。
          收起问道窗只是把这一页暂时挪开，战况仍在，摊开还是原处那一场。
        */}
        {ongoing ? (
          isDeveloperMode ? (
            <button
              onClick={endBattle}
              className="flex items-center gap-1 text-xs font-serif text-cinnabar-400/70 hover:text-cinnabar-300 transition mb-3"
            >
              <X size={12} /> 结束战斗，退出战斗界面（开发者）
            </button>
          ) : (
            <p className="mb-3 font-serif text-xs text-paper-400/50">胜负未分，这一战走不脱。</p>
          )
        ) : (
          <button
            onClick={endBattle}
            className="flex items-center gap-1 text-xs font-serif text-cinnabar-400/70 hover:text-cinnabar-300 transition mb-3"
          >
            <X size={12} /> 结束战斗，退出战斗界面
          </button>
        )}

        {/* 未分胜负时是交手，分出胜负后转为收尾；宗门战另有自己的一套发落 */}
        {battle.sectWar && battle.aftermath ? (
          <SectWarAftermathView />
        ) : battle.aftermath ? (
          <BattleAftermathView />
        ) : (
          <BattleOngoingView />
        )}
      </div>

      {/* 右侧：主游戏叙事，免得不记得这一战是为着什么打起来的 */}
      <aside className="flex max-h-[38vh] w-full shrink-0 flex-col border-t-2 border-gold-500/20 pt-3 lg:h-full lg:max-h-none lg:w-80 xl:w-96 lg:border-l-2 lg:border-t-0 lg:border-gold-500/20 lg:pl-4 lg:pt-0">
        <StoryPeek />
      </aside>
    </div>
  );
}

/**
 * 右栏的前情：只摆最近一回。
 * 战斗一开就把叙事挡在后面了，此处留一份，省得打到一半忘了这一手是接着哪儿来的。
 */
function StoryPeek() {
  const turns = useAIStore((s) => s.conversation.turns);
  const streaming = useAIStore((s) => s.conversation.streamingNarrative);
  const recent = (Array.isArray(turns) ? turns : []).slice(-1);

  return (
    <ScrollCard
      title="前情"
      subtitle="最近一回"
      className="flex min-h-0 flex-1 flex-col"
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {recent.length === 0 && !streaming ? (
          <p className="font-serif text-xs leading-relaxed text-paper-400/50 py-2">
            还没有可回看的叙事。这一战的来由，可收起战斗界面到问道里翻看。
          </p>
        ) : (
          recent.map((t) => (
            <div key={t.id} className="border-b border-paper-400/10 pb-2 last:border-b-0">
              {t.playerInput && (
                <p className="font-serif text-[11px] leading-relaxed text-gold-400/70">你：{t.playerInput}</p>
              )}
              <p className="mt-1 whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-paper-200">
                {t.narrative}
              </p>
            </div>
          ))
        )}
        {streaming && (
          <p className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-paper-300/80">{streaming}</p>
        )}
      </div>
    </ScrollCard>
  );
}

/**
 * 快捷出手：先点一招，再点一位够得着的对手，凑成一句话交给推演。
 * 自由输入仍在，这里只是把常走的那一手少打几个字。
 * 招式一悬停便弹出一张缩略阵图，照这一招的形制把能及到的格子染出来。
 */
function BattleQuickActions({ onAct, disabled }: { onAct: (text: string) => void; disabled: boolean }) {
  const techniques = useGameStore((s) => s.techniques);
  const inventory = useGameStore((s) => s.inventory);
  const battle = useAIStore((s) => s.battle);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; name: string; range: SkillRange } | null>(null);

  // 已解锁的招式：与战斗解析、招式面板同一套算法
  const available = useMemo(
    () => computableSkills(Array.isArray(techniques) ? techniques : [], techniqueLevelOf),
    [techniques],
  );

  const playerEntity = battle.map.entities.find((e) => e.type === "player");
  const alive = aliveEnemies(battle.map.entities);
  // 可用的物件：法宝是兵器，不列在这里
  const usableItems = (Array.isArray(inventory) ? inventory : [])
    .filter((i) => i.type !== "法宝" && Number(i.count) > 0)
    .slice(0, 12);
  const picked = available.find(({ technique, skill }) => `${technique.id}:${skill.id}` === pickedKey) ?? null;
  const pickedRange = picked ? skillRange(picked.skill, picked.technique.category) : null;
  const pickedStyle = picked ? techniqueStyleOf(picked.technique) : null;
  const convert = picked ? isHeartConversion(picked.technique, picked.skill) : false;
  const guardValue = picked ? Math.max(0, Math.round(Number(picked.skill.guard) || 0)) : 0;
  // 只对自己使的功夫不挑对手，与战斗推进时的判法一致：伤害、负面效果与挂敌状态都算冲人去的
  const aimsAtFoe = picked
    ? !convert &&
      guardValue <= 0 &&
      ((picked.skill.damage || 0) > 0 ||
        (picked.skill.effects || []).length > 0 ||
        (Array.isArray(picked.skill.buffs) ? picked.skill.buffs : []).some((b) => b.target === "enemy"))
    : false;
  // 够得着谁，与战斗推进时用的是同一判法
  const reachable =
    picked && pickedRange && playerEntity
      ? enemiesInRange(
          battle.map.entities,
          playerEntity.position,
          pickedRange,
          battle.map.width,
          battle.map.height,
        )
      : [];

  const act = (targetName?: string) => {
    if (!picked || disabled) return;
    const name = `${picked.technique.name}·${picked.skill.name}`;
    onAct(targetName ? `施展「${name}」，攻向「${targetName}」` : `施展「${name}」`);
  };

  if (available.length === 0) {
    return (
      <p className="font-serif text-[11px] text-paper-400/50">
        此刻还没有能使的招式，照旧写一句话出手便是。
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-serif text-xs text-paper-300/80">快捷出手</span>
        <span className="font-serif text-[10px] text-paper-400/50">悬停招式可看范围</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {available.map(({ technique, skill }) => {
          const key = `${technique.id}:${skill.id}`;
          const range = skillRange(skill, technique.category);
          const styleLabel = techniqueStyleOf(technique);
          const isPicked = key === pickedKey;
          const isConvert = isHeartConversion(technique, skill);
          const guard = Math.max(0, Math.round(Number(skill.guard) || 0));
          const cost =
            guard > 0
              ? `守 ${guard} · 耗灵 ${skill.mpCost}`
              : isConvert
                ? `耗气血 ${skill.hpCost ?? 0}`
                : `耗灵 ${skill.mpCost}`;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTip({
                  x: rect.left,
                  y: rect.bottom + 6,
                  name: `${technique.name}·${skill.name}`,
                  range,
                });
              }}
              onMouseLeave={() => setTip(null)}
              onClick={() => setPickedKey(isPicked ? null : key)}
              className={cn(
                "rounded border px-2 py-1 text-left font-serif text-[11px] transition",
                isPicked
                  ? "border-gold-400 bg-gold-500/20 text-gold-200"
                  : "border-paper-400/20 bg-ink-900/20 text-paper-200 hover:border-gold-400/50",
                disabled && "opacity-50",
              )}
            >
              <span className="block">
                {technique.name}·{skill.name}
              </span>
              <span className="block text-[10px] text-paper-400/60">
                {cost} · {rangeLabel(range)} · {styleLabel}
              </span>
            </button>
          );
        })}
      </div>

      {picked && pickedRange && (
        <div className="mt-2 rounded border border-paper-400/15 bg-ink-900/20 px-2.5 py-2">
          <p className="mb-1.5 font-serif text-[11px] text-paper-400/70">
            {guardValue > 0
              ? `守势：这一回合减免 ${guardValue} 点伤害，不冲人去`
              : !aimsAtFoe
                ? `这一招不冲人去，施展便可（${rangeLabel(pickedRange)}）`
                : `范围：${rangeLabel(pickedRange)}｜点一位够得着的对手出手`}
          </p>
          {!aimsAtFoe ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => act()}
              className="rounded border border-gold-400/50 px-2.5 py-1 font-serif text-[11px] text-gold-200 transition hover:bg-gold-500/20 disabled:opacity-50"
            >
              {convert ? "运功施展" : guardValue > 0 ? "施展守势" : "施展"}
            </button>
          ) : alive.length === 0 ? (
            <p className="font-serif text-[11px] text-paper-400/50">台上已无敌手。</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {alive.map((e) => {
                const hit = reachable.some((x) => x.id === e.id);
                const vs = styleMatchup(pickedStyle, e.style);
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={!hit || disabled}
                    onClick={() => act(e.name)}
                    className={cn(
                      "rounded border px-2 py-1 font-serif text-[11px] transition",
                      hit
                        ? "border-cinnabar-400/50 text-paper-100 hover:bg-cinnabar-500/20"
                        : "border-paper-400/15 text-paper-400/40 cursor-not-allowed",
                    )}
                  >
                    {e.name}
                    {vs.kind === "advantage" ? " · 克" : vs.kind === "disadvantage" ? " · 被克" : ""}
                    {typeof e.hp === "number" ? ` ${e.hp}/${e.maxHp ?? "?"}` : ""}
                    {hit ? "" : " · 范围外"}
                  </button>
                );
              })}
            </div>
          )}
          {aimsAtFoe && reachable.length === 0 && alive.length > 0 && (
            <p className="mt-1.5 font-serif text-[10px] text-paper-400/50">
              此刻没有够得着的对手，可先走位，或换一招。
            </p>
          )}
        </div>
      )}

      {/* 随身物件：兵器不算在内，点一件便算用出去，仍走推演那一套 */}
      {usableItems.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 font-serif text-[10px] text-paper-400/50">随身物件（法宝不算）</p>
          <div className="flex flex-wrap gap-1.5">
            {usableItems.map((it) => (
              <button
                key={it.id}
                type="button"
                disabled={disabled}
                onClick={() => onAct(`用「${it.name}」`)}
                className="rounded border border-paper-400/20 bg-ink-900/20 px-2 py-0.5 font-serif text-[11px] text-paper-200 transition hover:border-gold-400/50 disabled:opacity-50"
              >
                {it.name} ×{it.count}
              </button>
            ))}
          </div>
        </div>
      )}

      {tip && <RangeTip {...tip} />}
    </div>
  );
}

/** 悬停弹出的范围缩略图：摆在指针下头，浮在纸页之外，免得被卡片裁掉 */
function RangeTip({ x, y, name, range }: { x: number; y: number; name: string; range: SkillRange }) {
  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] rounded border border-gold-400/40 bg-ink-900/95 px-3 py-2 shadow-lg"
      style={{ left: Math.min(x, Math.max(0, window.innerWidth - 160)), top: y }}
    >
      <p className="mb-1.5 font-serif text-[11px] text-gold-300">{name}</p>
      <RangePreview range={range} />
      <p className="mt-1.5 font-serif text-[10px] text-paper-400/70">{rangeLabel(range)}</p>
    </div>,
    document.body,
  );
}

/** 一张小阵图：当中是自己，染红的是这一招能及的格子 */
function RangePreview({ range }: { range: SkillRange }) {
  const span = rangeSpan(range);
  const offsets = new Set(rangeOffsets(range).map(({ dx, dy }) => `${dx},${dy}`));
  const center = Math.floor(span / 2);

  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${span}, 12px)` }}>
      {Array.from({ length: span * span }, (_, i) => {
        const dx = (i % span) - center;
        const dy = Math.floor(i / span) - center;
        const self = dx === 0 && dy === 0;
        return (
          <span
            key={i}
            className={cn(
              "h-3 w-3 rounded-[1px]",
              self ? "bg-gold-400" : offsets.has(`${dx},${dy}`) ? "bg-cinnabar-400/80" : "bg-paper-400/15",
            )}
          />
        );
      })}
    </div>
  );
}

/**
 * 宗门战的收场。
 * 攻方的胜负条件是「敌方全灭」——护山大阵也算在敌方之内，故破了它才算赢。
 * 胜了便由玩家发落这一处：掠夺、纳为附庸，或一举摧毁。
 */
function SectWarAftermathView() {
  const battle = useAIStore((s) => s.battle);
  const endBattle = useAIStore((s) => s.endBattle);
  const resolveSectWar = useGameStore((s) => s.resolveSectWar);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const war = battle.sectWar;
  if (!war) return null;

  const entities = battle.map.entities;
  const isDown = (e: { isDead?: boolean; hp?: number }) =>
    Boolean(e.isDead) || (typeof e.hp === "number" && e.hp <= 0);
  const enemies = entities.filter((e) => e.type === "enemy");
  const isPlace = war.targetKind === "city" || war.targetKind === "village";
  const arrayLabel = war.targetKind === "city" ? "守城大阵" : "护山大阵";
  const arrayUnit = enemies.find((e) => e.name === arrayLabel);
  const won = enemies.length > 0 && enemies.every(isDown);
  const attacker = war.role === "attacker";
  const placeWord = war.targetKind === "city" ? "城" : "村";
  const subtitle = isPlace
    ? attacker
      ? `你攻「${war.opponentName}」这处${placeWord}`
      : `「${war.opponentName}」来犯本门`
    : attacker
      ? `你攻「${war.opponentName}」的山门`
      : `「${war.opponentName}」来犯本门`;

  const choose = (choice: "掠夺" | "附庸" | "摧毁" | "占领") => {
    if (done) return;
    const r = resolveSectWar({ targetId: war.opponentId, targetKind: war.targetKind, choice });
    setNote(r.message);
    setDone(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <ScrollCard
        title="宗门战"
        subtitle={subtitle}
        ornament={<Swords size={14} className="text-cinnabar-400/80" />}
        className="shrink-0 formation-border"
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-serif text-xs text-paper-300/80">
          {war.targetKind !== "village" && (
            <span>
              {arrayLabel}：
              <span className={cn("font-number ml-1", !arrayUnit || isDown(arrayUnit) ? "text-cinnabar-400" : "text-gold-300")}>
                {!arrayUnit ? "无" : isDown(arrayUnit) ? "已破" : `${arrayUnit.hp}/${arrayUnit.maxHp}`}
              </span>
            </span>
          )}
          <span>
            敌方余众：
            <span className="font-number text-cinnabar-400 ml-1">{enemies.filter((e) => !isDown(e)).length}</span>
          </span>
        </div>
        <div className="mt-3 whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
          {battle.narrative || "战事已了。"}
        </div>
      </ScrollCard>

      {won && attacker && !done && (
        <ScrollCard
          title="发落"
          subtitle={isPlace ? `这一处${placeWord}，你打算如何处置` : "这一处宗门，你打算如何处置"}
          className="shrink-0"
        >
          <div className="flex flex-col gap-2">
            <SealButton variant="outline" onClick={() => choose("掠夺")} className="w-full">
              <span className="flex items-center justify-center gap-1.5">
                <Coins size={13} /> 掠夺 · 尽夺其财货
              </span>
            </SealButton>
            {isPlace ? (
              war.opponentId ? (
                <SealButton variant="outline" onClick={() => choose("占领")} className="w-full">
                  <span className="flex items-center justify-center gap-1.5">
                    <Flag size={13} /> 占领 · 自此按月纳贡
                  </span>
                </SealButton>
              ) : (
                <p className="font-serif text-[11px] text-paper-400/50">
                  舆图上对不上这一处，只能掠夺，占领无从谈起。
                </p>
              )
            ) : (
              <>
                {war.opponentId ? (
                  <SealButton variant="outline" onClick={() => choose("附庸")} className="w-full">
                    <span className="flex items-center justify-center gap-1.5">
                      <Flag size={13} /> 附庸 · 令其称臣纳贡
                    </span>
                  </SealButton>
                ) : null}
                <SealButton variant="outline" onClick={() => choose("摧毁")} className="w-full">
                  <span className="flex items-center justify-center gap-1.5">
                    <Skull size={13} /> 摧毁 · 抹去这一处宗门
                  </span>
                </SealButton>
                {!war.opponentId && (
                  <p className="font-serif text-[11px] text-paper-400/50">
                    舆图上对不上这一处宗门，只能掠夺其财货，附庸与摧毁无从谈起。
                  </p>
                )}
              </>
            )}
          </div>
        </ScrollCard>
      )}

      {(done || !won || !attacker) && (
        <ScrollCard title="收场" subtitle="这一场到此了结" className="shrink-0 formation-border">
          <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
            {note ||
              (won
                ? attacker
                  ? isPlace
                    ? `你踏破了这处${placeWord}，胜负已分。`
                    : "你踏破了这处山门，胜负已分。"
                  : "来犯之敌尽数退去，本门转危为安。"
                : "本门不敌，只得且战且退。")}
          </div>
          <div className="mt-4">
            <SealButton onClick={endBattle} className="w-full">
              收场
            </SealButton>
          </div>
        </ScrollCard>
      )}

      {battle.errorMsg && (
        <div className="rounded px-3 py-2 bg-cinnabar-500/10 border border-cinnabar-500/30 font-serif text-xs text-cinnabar-300 leading-relaxed">
          {battle.errorMsg}
        </div>
      )}
    </div>
  );
}

/** 交手阶段：原有的战斗界面，原样保留 */
function BattleOngoingView() {
  const battle = useAIStore((s) => s.battle);
  const runBattleTurn = useAIStore((s) => s.runBattleTurn);
  const player = useGameStore((s) => s.player);

  const [action, setAction] = useState("");
  const isResolving = battle.isResolving;
  // 内伤一类状态压低了气血上限，界面上照实时的上限报
  const hpMax = effectiveHpMax(player);
  // 四条根基过一道临时状态；身法定这一回合能挪几步
  const attrs = effectiveAttributes(player);
  const moveLimit = movementLimit(attrs.agility);
  const incenseBuffs = (Array.isArray(player.buffs) ? player.buffs : []).filter(
    (b) => b.durationType === "incense",
  );

  const handleSubmit = () => {
    const text = action.trim();
    if (!text || isResolving) return;
    runBattleTurn(text);
    setAction("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ScrollCard
        title="战场态势"
        subtitle={`第 ${battle.round} 回合 · ${isResolving ? "推演中" : "轮到你出手"}`}
        ornament={
          <div className="flex items-center gap-2">
            <Swords size={14} className="text-cinnabar-400/80 rune-shimmer" />
            <span className="font-number text-xs text-paper-400/60">
              {battle.map.entities.filter((e) => e.type === "enemy" && !e.isDead).length} 敌
            </span>
          </div>
        }
        className="shrink-0 formation-border"
      >
        {/* 战斗里的时序以香计，一柱烧满就换下一柱 */}
        <div className="flex items-center gap-3 mb-3">
          <Flame size={13} className="text-gold-400/80 shrink-0 animate-runeGlow" />
          <span className="shrink-0 font-serif text-xs text-paper-300/80">
            第 {battle.incense.stick} 柱香
          </span>
          <div className="flex-1 h-1.5 bg-ink-900 rounded overflow-hidden spiritual-border">
            <div
              className="h-full bg-gradient-to-r from-aura-gold via-gold-500/70 to-aura-gold transition-all shadow-glow"
              style={{ width: `${battle.incense.progress}%` }}
            />
          </div>
          <span className="shrink-0 font-number text-xs text-paper-400">
            {battle.incense.progress}%
          </span>
        </div>
        <BattleMap map={battle.map} />
      </ScrollCard>

      <ScrollCard
        title="战斗叙事"
        subtitle="实时战况"
        className="flex max-h-[38vh] min-h-[120px] shrink-0 flex-col"
        contentClassName="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap pr-2 font-serif text-sm leading-relaxed text-paper-200">
          {battle.narrative || "战斗开始，准备行动..."}
        </div>
      </ScrollCard>

      <ScrollCard
        title="我方状态"
        className="shrink-0"
      >
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          <div className="text-center">
            <div className="font-brush text-lg text-cinnabar-400 text-glow-formation">{Math.min(player.hp, hpMax)}</div>
            <div className="font-serif text-xs text-paper-400/50">气血 / {hpMax}</div>
            <div className="h-1 bg-ink-900 rounded mt-1 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cinnabar-600 to-cinnabar-400 transition-all shadow-inner-glow"
                style={{ width: `${(Math.min(player.hp, hpMax) / hpMax) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="font-brush text-lg text-aura-cyan text-glow-spiritual">{player.mp}</div>
            <div className="font-serif text-xs text-paper-400/50">灵力 / {player.mpMax}</div>
            <div className="h-1 bg-ink-900 rounded mt-1 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-aura-cyan to-aura-purple transition-all shadow-spiritual-glow"
                style={{ width: `${(player.mp / player.mpMax) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-center">
            <div className="font-brush text-lg text-gold-300">{Math.round(battle.stamina)}</div>
            <div className="font-serif text-xs text-paper-400/50">体力 / {battle.staminaMax}</div>
            <div className="h-1 bg-ink-900 rounded mt-1 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  battle.stamina > 0
                    ? "bg-gradient-to-r from-gold-600 to-gold-400 shadow-glow"
                    : "bg-cinnabar-500",
                )}
                style={{
                  width: `${Math.max(0, Math.min(100, (battle.stamina / Math.max(1, battle.staminaMax)) * 100))}%`,
                }}
              />
            </div>
            <div className="mt-0.5 font-serif text-[10px] text-paper-400/40">可挪 {moveLimit} 格</div>
          </div>
          <div className="text-center">
            <div className="font-brush text-lg text-gold-400">{attrs.vitality}</div>
            <div className="font-serif text-xs text-paper-400/50">体魄</div>
          </div>
          <div className="text-center">
            <div className="font-brush text-lg text-jade-400">{attrs.soul}</div>
            <div className="font-serif text-xs text-paper-400/50">神魂</div>
          </div>
        </div>

        {/* 战斗里落下的持续状态按柱香计，这里报一报各还剩几柱 */}
        {incenseBuffs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-paper-400/10 flex items-center gap-2 flex-wrap">
            <span className="font-serif text-[11px] text-paper-400/50">香上余效</span>
            {incenseBuffs.map((b) => (
              <span
                key={b.id}
                className={cn(
                  "font-serif text-[11px] px-1.5 py-0.5 rounded border",
                  b.isDebuff
                    ? "border-cinnabar-500 bg-cinnabar-500 text-cinnabar-300"
                    : "border-jade-500 bg-jade-500 text-jade-400",
                )}
              >
                {b.icon} {b.name} · 余 {b.duration ?? 0} 柱
              </span>
            ))}
          </div>
        )}
      </ScrollCard>

      <ScrollCard
        title="行动指令"
        subtitle="可点招式快捷出手，也可自由输入（Ctrl/Cmd + Enter 发送）"
        className="shrink-0"
      >
        {/* 模型照这一合的战况备下的几条出手：与问道里的快捷决断同一用法，点一条填进输入栏 */}
        {(Array.isArray(battle.options) ? battle.options : []).length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Array.isArray(battle.options) ? battle.options : []).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setAction(o)}
                disabled={isResolving || battle.turn !== "player"}
                title="填入输入栏，可再修改后出手"
                className="px-2.5 py-1 rounded text-xs font-serif border-2 border-paper-400 bg-ink-900 text-paper-200 hover:border-gold-500 hover:text-gold-400 hover:bg-gold-500 transition disabled:opacity-40"
              >
                {o}
              </button>
            ))}
          </div>
        )}
        <BattleQuickActions
          onAct={(text) => {
            if (isResolving || battle.turn !== "player") return;
            runBattleTurn(text);
          }}
          disabled={isResolving || battle.turn !== "player"}
        />
        <div className="my-3 border-t border-paper-400/10" />
        <textarea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isResolving || battle.turn !== "player"}
          placeholder="例如：向前移动两步，然后使用剑法攻击敌人；也可写运功回气、调息恢复灵力，心法里有那一招便会自行认领"
          rows={4}
          className={cn(
            "input-ink resize-none leading-relaxed",
            battle.turn !== "player" && "opacity-50",
          )}
          style={{ fontFamily: '"Noto Serif SC", serif' }}
        />

        <div className="mt-3 flex gap-2">
          <SealButton
            onClick={handleSubmit}
            disabled={!action.trim() || isResolving || battle.turn !== "player"}
            className="flex-1"
          >
            <span className="flex items-center justify-center gap-1.5">
              {isResolving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : null}
              {isResolving ? "推演中……" : "执行行动"}
            </span>
          </SealButton>
        </div>

        {battle.errorMsg && (
          <div className="mt-3 rounded px-3 py-2 bg-cinnabar-500/10 border border-cinnabar-500/30 font-serif text-xs text-cinnabar-300 leading-relaxed">
            {battle.errorMsg}
          </div>
        )}
      </ScrollCard>
    </div>
  );
}

/** 一条进度：追击 / 撤退 / 耐心都用它 */
function AftermathBar({ label, value, tone }: { label: string; value: number; tone: "chase" | "retreat" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 w-20 font-serif text-xs text-paper-300/80">{label}</span>
      <div className="flex-1 h-1.5 bg-ink-900 rounded overflow-hidden spiritual-border">
        <div
          className={cn(
            "h-full transition-all",
            tone === "chase"
              ? "bg-gradient-to-r from-cinnabar-600 to-cinnabar-400 shadow-inner-glow"
              : "bg-gradient-to-r from-aura-cyan to-aura-purple shadow-spiritual-glow",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 font-number text-xs text-paper-400">{pct}</span>
    </div>
  );
}

/** 收尾阶段：逃 / 追、战利品、败者对话 */
function BattleAftermathView() {
  const battle = useAIStore((s) => s.battle);
  const runEscapeTurn = useAIStore((s) => s.runEscapeTurn);
  const claimLoot = useAIStore((s) => s.claimLoot);
  const speakFate = useAIStore((s) => s.speakFate);
  const surrenderBeg = useAIStore((s) => s.surrenderBeg);
  const surrenderPay = useAIStore((s) => s.surrenderPay);
  const surrenderGiveUp = useAIStore((s) => s.surrenderGiveUp);
  const endBattle = useAIStore((s) => s.endBattle);
  const spiritStones = useGameStore((s) => s.spiritStones);

  const [escapeText, setEscapeText] = useState("");
  const [fateText, setFateText] = useState("");
  const [begText, setBegText] = useState("");

  const aft = battle.aftermath;
  if (!aft) return null;

  const resolving = aft.resolving;
  const chase = aft.role === "chase";
  const allTaken = aft.loot.length > 0 && aft.loot.every((it) => it.taken);

  const onKey = (submit: () => void) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const submitEscape = () => {
    const text = escapeText.trim();
    if (!text || resolving) return;
    runEscapeTurn(text);
    setEscapeText("");
  };

  const submitFate = () => {
    const text = fateText.trim();
    if (!text || resolving) return;
    speakFate(text);
    setFateText("");
  };

  const submitBeg = () => {
    const text = begText.trim();
    if (!text || resolving) return;
    surrenderBeg(text);
    setBegText("");
  };

  return (
    <div className="flex flex-col gap-3">
      {aft.stage === "escape" && (
        <>
          <ScrollCard
            title="追逃态势"
            subtitle={chase ? "你胜了，提气追敌" : "你败了，且战且退"}
            ornament={<Footprints size={14} className="text-cinnabar-400/80" />}
            className="shrink-0"
          >
            <div className="flex flex-col gap-2.5">
              <AftermathBar label={chase ? "你追之势" : "追兵迫近"} value={aft.pursuit} tone="chase" />
              <AftermathBar label={chase ? "敌人脱身" : "你脱身之势"} value={aft.retreat} tone="retreat" />
            </div>
          </ScrollCard>

          <ScrollCard title="收尾叙事" subtitle="实时情形" className="shrink-0">
            <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
              {aft.narrative || "追逃之间，胜负未定——"}
            </div>
          </ScrollCard>

          <ScrollCard
            title="行动"
            subtitle="写下你这一步要怎么追、怎么逃（Ctrl/Cmd + Enter 发送）"
            className="shrink-0"
          >
            <textarea
              value={escapeText}
              onChange={(e) => setEscapeText(e.target.value)}
              onKeyDown={onKey(submitEscape)}
              disabled={resolving}
              placeholder={chase ? "例如：抄近路截住他的去路" : "例如：钻入密林，借地势甩开追兵"}
              rows={3}
              className="input-ink resize-none leading-relaxed"
              style={{ fontFamily: '"Noto Serif SC", serif' }}
            />
            <div className="mt-3">
              <SealButton onClick={submitEscape} disabled={!escapeText.trim() || resolving} className="w-full">
                <span className="flex items-center justify-center gap-1.5">
                  {resolving ? <Loader2 size={13} className="animate-spin" /> : null}
                  {resolving ? "推演中……" : "行动"}
                </span>
              </SealButton>
            </div>
          </ScrollCard>
        </>
      )}

      {aft.stage === "loot" && (
        <>
          <ScrollCard
            title="战利品"
            subtitle="自落败之敌身上搜得"
            ornament={<Package size={14} className="text-gold-400/80" />}
            className="shrink-0"
          >
            <div className="flex flex-col gap-2">
              {aft.loot.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded border border-paper-400/15 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-sm text-paper-200 truncate">
                      {item.name} <span className="text-paper-400">×{item.qty}</span>
                      {item.taken && <span className="ml-2 text-jade-400 text-xs">已收入行囊</span>}
                    </div>
                    {item.desc && (
                      <div className="text-xs text-paper-400/70 mt-0.5">{item.desc}</div>
                    )}
                  </div>
                  <SealButton
                    variant="outline"
                    onClick={() => claimLoot(i)}
                    disabled={item.taken}
                    className="shrink-0 text-xs"
                  >
                    {item.taken ? "已收下" : "收入行囊"}
                  </SealButton>
                </div>
              ))}
              <SealButton onClick={() => claimLoot("all")} disabled={allTaken} className="mt-1">
                全部收下
              </SealButton>
            </div>
          </ScrollCard>

          <ScrollCard
            title="处置敌人"
            subtitle="你打算如何发落这落败之人（Ctrl/Cmd + Enter 发送）"
            className="shrink-0"
          >
            <textarea
              value={fateText}
              onChange={(e) => setFateText(e.target.value)}
              onKeyDown={onKey(submitFate)}
              disabled={resolving}
              placeholder="例如：留他一命，命他立誓不得再犯"
              rows={3}
              className="input-ink resize-none leading-relaxed"
              style={{ fontFamily: '"Noto Serif SC", serif' }}
            />
            <div className="mt-3">
              <SealButton onClick={submitFate} disabled={!fateText.trim() || resolving} className="w-full">
                <span className="flex items-center justify-center gap-1.5">
                  {resolving ? <Loader2 size={13} className="animate-spin" /> : null}
                  {resolving ? "推演中……" : "就此发落"}
                </span>
              </SealButton>
            </div>
          </ScrollCard>
        </>
      )}

      {aft.stage === "surrender" && (
        <>
          <ScrollCard
            title="敌方耐心"
            subtitle="耐心归零，便是死"
            className="shrink-0 formation-border"
          >
            <AftermathBar label="耐心" value={aft.patience} tone="chase" />
            <div className="mt-3 whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
              {aft.narrative || "你落入敌手，命悬一线——"}
            </div>
          </ScrollCard>

          <ScrollCard
            title="开口求饶"
            subtitle="说一句求饶或交涉的话（Ctrl/Cmd + Enter 发送）"
            className="shrink-0"
          >
            <textarea
              value={begText}
              onChange={(e) => setBegText(e.target.value)}
              onKeyDown={onKey(submitBeg)}
              disabled={resolving}
              placeholder="例如：愿奉上身上所有财物，只求饶我一命"
              rows={3}
              className="input-ink resize-none leading-relaxed"
              style={{ fontFamily: '"Noto Serif SC", serif' }}
            />
            <div className="mt-3">
              <SealButton onClick={submitBeg} disabled={!begText.trim() || resolving} className="w-full">
                <span className="flex items-center justify-center gap-1.5">
                  {resolving ? <Loader2 size={13} className="animate-spin" /> : null}
                  {resolving ? "推演中……" : "开口"}
                </span>
              </SealButton>
            </div>
          </ScrollCard>

          <ScrollCard title="赎身与了断" className="shrink-0">
            <div className="flex flex-col gap-2">
              <SealButton
                variant="outline"
                onClick={surrenderPay}
                disabled={resolving}
                className="w-full"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Coins size={13} /> 缴纳赎身（60 下品灵石 · 现有 {spiritStones?.low ?? 0}）
                </span>
              </SealButton>
              <SealButton
                variant="outline"
                onClick={surrenderGiveUp}
                disabled={resolving}
                className="w-full"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Skull size={13} /> 束手等死
                </span>
              </SealButton>
            </div>
          </ScrollCard>
        </>
      )}

      {aft.stage === "done" && (
        <ScrollCard
          title="收场"
          subtitle="这一场到此了结"
          className="shrink-0 formation-border"
        >
          <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
            {aft.outcome || battle.narrative || "尘埃落定。"}
          </div>
          <div className="mt-4">
            <SealButton onClick={endBattle} className="w-full">
              收场
            </SealButton>
          </div>
        </ScrollCard>
      )}

      {battle.errorMsg && (
        <div className="rounded px-3 py-2 bg-cinnabar-500/10 border border-cinnabar-500/30 font-serif text-xs text-cinnabar-300 leading-relaxed">
          {battle.errorMsg}
        </div>
      )}
    </div>
  );
}
