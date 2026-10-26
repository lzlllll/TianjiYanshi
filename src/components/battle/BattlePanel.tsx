import { useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { BattleMap } from "./BattleMap";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { effectiveHpMax } from "@/lib/buffUtils";
import { Swords, X, Loader2, Flame, Footprints, Package, Coins, Skull, Flag } from "lucide-react";

export function BattlePanel() {
  const battle = useAIStore((s) => s.battle);
  const endBattle = useAIStore((s) => s.endBattle);

  return (
    // 各块按内容排开、整页可上下滚：窗口矮或是窄时，行动指令那一栏也不会被裁掉
    <div className="paper-texture spiritual-particles relative h-full flex flex-col overflow-y-auto p-3 sm:p-5">
      <PanelTitle
        title="战斗"
        poem="黄沙百战穿金甲，不破楼兰终不还。"
      />
      {/* 战斗由叙事触发后必须留一个出口，否则玩家会被困在战斗界面 */}
      <button
        onClick={endBattle}
        className="flex items-center gap-1 text-xs font-serif text-cinnabar-400/70 hover:text-cinnabar-300 transition mb-3"
      >
        <X size={12} /> 结束战斗，退出战斗界面
      </button>

      {/* 未分胜负时是交手，分出胜负后转为收尾；宗门战另有自己的一套发落 */}
      {battle.sectWar && battle.aftermath ? (
        <SectWarAftermathView />
      ) : battle.aftermath ? (
        <BattleAftermathView />
      ) : (
        <BattleOngoingView />
      )}
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
      >
        <div className="flex-1 overflow-y-auto whitespace-pre-wrap pr-2 font-serif text-sm leading-relaxed text-paper-200">
          {battle.narrative || "战斗开始，准备行动..."}
        </div>
      </ScrollCard>

      <ScrollCard
        title="我方状态"
        className="shrink-0"
      >
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
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
            <div className="font-brush text-lg text-gold-400">{player.stats.vitality}</div>
            <div className="font-serif text-xs text-paper-400/50">体魄</div>
          </div>
          <div className="text-center">
            <div className="font-brush text-lg text-jade-400">{player.stats.soul}</div>
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
        subtitle="输入你的战斗行动（Ctrl/Cmd + Enter 发送）"
        className="shrink-0"
      >
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
