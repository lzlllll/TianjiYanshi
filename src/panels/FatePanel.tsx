import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { SealButton } from "@/components/ui/SealButton";
import { aliveRumors, RUMOR_KEEP_DAYS } from "@/data/rumors";
import { isRewardHeld, questHasPenalty, questItemGoalLabel, questRank, questRealmGoalLabel, questStoneGoalLabel } from "@/data/quests";
import { pactDaysLeft, pactKindLabel, pactRank, pactReady } from "@/data/pacts";
import { adventureWhere, dangerLabel } from "@/data/adventures";
import { daySerial } from "@/lib/gameTime";
import { findBuffTemplate } from "@/data/buffs";
import type { Quest, QuestBuffSpec } from "@/data/types";
import { cn } from "@/lib/utils";
import {
  Ear,
  Handshake,
  MessageSquareQuote,
  ScrollText,
  MapPin,
  Gift,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

/**
 * 机缘面板里的几页：有回响的机会、应承下来的任务、奇遇、闲话、说定的约定。
 * 江湖快报另成一册，见左侧书脊「快报」
 */
type FateTab = "chances" | "tasks" | "adventures" | "rumors" | "pacts";

/** 把日序按「还剩几日」「已误几日」说清楚 */
function dueLabel(quest: { status: string; dueDay?: number }, today: number) {
  if (quest.dueDay === undefined) return { text: "不限时", urgent: false, overdue: false };
  const left = quest.dueDay - today;
  if (quest.status !== "open") {
    return { text: `第 ${quest.dueDay} 日截止`, urgent: false, overdue: false };
  }
  if (left < 0) return { text: `已误期 ${-left} 日`, urgent: true, overdue: true };
  if (left === 0) return { text: "今日到期", urgent: true, overdue: false };
  return { text: `还剩 ${left} 日`, urgent: left <= 2, overdue: false };
}

/** 赏罚是一条状态时，把名目点出来；名录里挑的照名录上的名目写 */
function stateLabel(spec?: QuestBuffSpec): string {
  const name = findBuffTemplate(spec?.template ?? spec?.name)?.name ?? spec?.name ?? spec?.template;
  return name ? `状态「${name}」` : "一条状态";
}

/**
 * 机缘：分作五页——只有酬谢的机会、误期要挨罚的任务、舆图上的奇遇、
 * 这些日子听来的零碎话，以及与人当面说定的约定。
 * 约定记着什么时候、在哪儿、跟谁了结；江湖快报另成一册，见左侧书脊。
 */
export function FatePanel() {
  const rumors = useGameStore((s) => s.rumors);
  const quests = useGameStore((s) => s.quests);
  const pacts = useGameStore((s) => s.pacts);
  const adventures = useGameStore((s) => s.adventures);
  const currentAdventureId = useGameStore((s) => s.currentAdventureId);
  const currentTime = useGameStore((s) => s.currentTime);
  const settlePact = useGameStore((s) => s.settlePact);
  const openAdventure = useAIStore((s) => s.openAdventure);
  const travelToAdventure = useAIStore((s) => s.travelToAdventure);

  const [tab, setTab] = useState<FateTab>("chances");
  const [note, setNote] = useState("");

  const alive = aliveRumors(rumors, currentTime);
  const today = daySerial(currentTime);
  const ordered = [...quests].sort((a, b) => questRank(a) - questRank(b) || (a.dueDay ?? 9999) - (b.dueDay ?? 9999));
  // 误了期要挨罚的算「任务」，只有酬谢、不罚的算「机会」；两栏各按同一套次序排
  const tasks = ordered.filter(questHasPenalty);
  const chances = ordered.filter((q) => !questHasPenalty(q));
  // 赏还押在柜上的也算没完：钱没到手，这桩事就还欠着
  const unfinished = (list: Quest[]) => list.filter((q) => q.status === "open" || isRewardHeld(q)).length;
  const taskCount = unfinished(tasks);
  const chanceCount = unfinished(chances);
  // 这两栏共用同一张卡片，只把名目与那一份单子换一换
  const isTask = tab === "tasks";
  const showList = isTask ? tasks : chances;
  const openPacts = pacts.filter((p) => p.status === "open").length;
  const openAdvs = (Array.isArray(adventures) ? adventures : []).filter((a) => a.status === "open");
  const orderedPacts = [...pacts].sort(
    (a, b) => pactRank(a) - pactRank(b) || a.dueDay - b.dueDay || a.madeDay - b.madeDay,
  );

  /** 主动去了结一桩约定：取货要等日子到，口头的随时可去 */
  const settle = (pactId: string, name: string) => {
    if (settlePact(pactId)) {
      setNote(`「${name}」这一桩了了。`);
    } else {
      setNote("日子还没到，东西也还没做成，此时取不走。");
    }
  };

  const tabs: { id: FateTab; label: string; icon: React.ReactNode; badge: string }[] = [
    { id: "chances", label: "机会", icon: <Sparkles size={13} />, badge: chanceCount ? `${chanceCount}` : "" },
    { id: "tasks", label: "任务", icon: <ScrollText size={13} />, badge: taskCount ? `${taskCount}` : "" },
    { id: "adventures", label: "奇遇", icon: <MapPin size={13} />, badge: openAdvs.length ? `${openAdvs.length}` : "" },
    { id: "rumors", label: "最近听到的", icon: <Ear size={13} />, badge: alive.length ? `${alive.length}` : "" },
    { id: "pacts", label: "约定", icon: <Handshake size={13} />, badge: openPacts ? `${openPacts}` : "" },
  ];

  return (
    <div className="paper-texture">
      <PanelTitle title="机缘" poem="相逢皆有缘，受人之托，忠人之事。" />

      <div className="flex items-center gap-1.5 mb-4 flex-wrap" data-tutorial="fate-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded border font-serif text-[12px] transition",
              tab === t.id
                ? "border-gold-500 bg-gold-500 text-gold-400"
                : "border-paper-400 bg-ink-800 text-paper-400 hover:text-paper-200 hover:border-gold-500",
            )}
          >
            {t.icon}
            {t.label}
            {t.badge && (
              <span className="font-number text-[10px] text-paper-400">({t.badge})</span>
            )}
          </button>
        ))}
      </div>

      {(tab === "chances" || tab === "tasks") && (
        <ScrollCard anchor="fate-list" className="quest-ink">
          <div className="flex items-center gap-2 mb-3">
            {isTask ? (
              <ScrollText size={15} className="text-gold-400" />
            ) : (
              <Sparkles size={15} className="text-jade-400" />
            )}
            <span className={cn("font-brush text-base", isTask ? "text-gold-400" : "text-jade-400")}>
              {isTask ? "任务" : "机会"}
            </span>
            <span className="font-serif text-[11px] text-paper-400/45 ml-auto">
              共 {isTask ? taskCount : chanceCount} 桩未了
            </span>
          </div>

          {showList.length === 0 ? (
            <div className="text-center py-8">
              {isTask ? (
                <ScrollText size={32} className="mx-auto text-paper-500/30 mb-2" />
              ) : (
                <Sparkles size={32} className="mx-auto text-paper-500/30 mb-2" />
              )}
              <p className="font-serif text-sm text-paper-400/50">
                {isTask ? "眼下没有误期要挨罚的事。" : "眼下没什么可图的由头。"}
              </p>
              <p className="font-serif text-[11px] text-paper-400/35 mt-1">
                {isTask
                  ? "牙行柜上、宗门差事榜上多是这类活计；应承之前先看清误期的罚。"
                  : "多与人攀谈，或是路见不平，自会有人找上门来；这类只有酬谢，误了期也不罚。"}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {showList.map((q) => {
                const due = dueLabel(q, today);
                // 事办成了、赏却还押在牙行柜上的，算在没完的那一档里
                const held = isRewardHeld(q);
                const done = q.status !== "open" && !held;
                return (
                  <li
                    key={q.id}
                    className={cn(
                      "p-3 rounded border-2 flex items-start gap-3",
                      done
                        ? "border-paper-400 bg-ink-800 opacity-70"
                        : due.overdue
                          ? "border-cinnabar-500 bg-cinnabar-500"
                          : "border-gold-500 bg-gold-500",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 shrink-0 rounded flex items-center justify-center border",
                        done
                          ? "bg-ink-700/40 text-paper-400/40 border-paper-400/15"
                          : due.overdue
                            ? "bg-cinnabar-500/15 text-cinnabar-300 border-cinnabar-500/35"
                            : "bg-gold-500/10 text-gold-400 border-gold-500/25",
                      )}
                    >
                      <ScrollText size={14} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-brush text-base text-paper-100">{q.name}</span>
                        <span className="font-serif text-[10px] px-1.5 py-0.5 rounded border border-paper-400/30 bg-paper-400/10 text-paper-400/80">
                          {q.kind ?? "事件"}
                        </span>
                        {held && (
                          <span className="font-serif text-[11px] px-1.5 py-0.5 rounded border text-gold-400 border-gold-500/40 bg-gold-500/10">
                            待领赏
                          </span>
                        )}
                        {done && (
                          <span
                            className={cn(
                              "font-serif text-[11px] px-1.5 py-0.5 rounded border",
                              q.status === "done"
                                ? "text-jade-400 border-jade-500/35 bg-jade-500/10"
                                : "text-cinnabar-300 border-cinnabar-500/35 bg-cinnabar-500/10",
                            )}
                          >
                            {q.status === "done" ? "已了结" : "已误期"}
                          </span>
                        )}
                        {q.giver && (
                          <span className="font-serif text-[11px] text-paper-400">托自 {q.giver}</span>
                        )}
                        <span
                          className={cn(
                            "font-number text-[11px] ml-auto",
                            due.urgent ? "text-cinnabar-300" : "text-paper-400",
                          )}
                        >
                          {due.text}
                        </span>
                      </div>

                      {q.desc && (
                        <p className="font-serif text-sm text-paper-200 leading-relaxed mt-1.5">{q.desc}</p>
                      )}

                      {q.condition && (
                        <p className="font-serif text-[12px] text-paper-300/70 leading-relaxed mt-1">
                          交差：{q.condition}
                        </p>
                      )}

                      {questRealmGoalLabel(q) && (
                        <p className="font-serif text-[12px] text-jade-400/80 leading-relaxed mt-1">
                          目标：修到 {questRealmGoalLabel(q)}
                        </p>
                      )}

                      {questItemGoalLabel(q) && (
                        <p className="font-serif text-[12px] text-jade-400/80 leading-relaxed mt-1">
                          目标：寻得 {questItemGoalLabel(q)}
                        </p>
                      )}

                      {questStoneGoalLabel(q) && (
                        <p className="font-serif text-[12px] text-jade-400/80 leading-relaxed mt-1">
                          目标：凑足 {questStoneGoalLabel(q)}
                        </p>
                      )}

                      <div className="flex items-center gap-4 flex-wrap mt-2">
                        {q.place && (
                          <span className="flex items-center gap-1 font-serif text-[11px] text-paper-400/60">
                            <MapPin size={11} /> {q.place}
                          </span>
                        )}
                        {(q.reward || q.rewardKind) && (
                          <span className="flex items-center gap-1 font-serif text-[11px] text-jade-400/80">
                            <Gift size={11} />
                            {q.rewardKind === "状态"
                              ? stateLabel(q.rewardBuff)
                              : q.rewardKind && q.rewardAmount
                                ? `${q.rewardKind} ${q.rewardAmount}`
                                : q.reward || "有酬谢"}
                          </span>
                        )}
                        {(q.penalty || q.penaltyKind) && (
                          <span className="flex items-center gap-1 font-serif text-[11px] text-cinnabar-300/80">
                            <AlertTriangle size={11} />
                            误期罚：
                            {q.penaltyKind === "状态"
                              ? stateLabel(q.penaltyBuff)
                              : q.penaltyKind && q.penaltyAmount
                                ? `${q.penaltyKind} ${q.penaltyAmount}`
                                : q.penalty || "绝不轻饶"}
                          </span>
                        )}
                      </div>

                      {held && q.broker && (
                        <p className="font-serif text-[11px] text-gold-400/80 mt-1.5">
                          赏押在「{q.broker.shopName}」柜上，得回那处领才算到手。
                        </p>
                      )}

                      {/* 要办到哪儿去：星标出那处街区，好照着城图去找 */}
                      {q.status === "open" && q.target && (
                        <p className="font-serif text-[11px] text-gold-400 mt-1.5">
                          <span className="mr-1">★</span>
                          目标：{q.target.label}
                          {q.target.person ? ` · 寻 ${q.target.person}` : ""}
                        </p>
                      )}

                      {q.outcome && (
                        <p className="font-serif text-[11px] text-paper-400/45 mt-1.5">{q.outcome}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollCard>
      )}

      {tab === "adventures" && (
        <ScrollCard>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={15} className="text-gold-400" />
            <span className="font-brush text-base text-gold-400">奇遇</span>
            <span className="font-serif text-[11px] text-paper-400/45 ml-auto">共 {openAdvs.length} 处在野</span>
          </div>

          {openAdvs.length === 0 ? (
            <div className="text-center py-8">
              <MapPin size={32} className="mx-auto text-paper-500/30 mb-2" />
              <p className="font-serif text-sm text-paper-400/50">舆图上暂无新开的去处。</p>
              <p className="font-serif text-[11px] text-paper-400/35 mt-1">
                在问道中行至某地，舆图上或会生出一处奇遇；也可由旁人一句话牵出。
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {openAdvs.map((a) => {
                const here = currentAdventureId === a.id;
                return (
                  <li
                    key={a.id}
                    className={cn(
                        "p-3 rounded border-2 flex items-start gap-3 corner-ornament",
                        here ? "border-gold-500 bg-gold-500" : "border-paper-400 bg-ink-800",
                      )}
                    >
                    <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center border-2 border-gold-500 bg-gold-500 font-brush text-sm text-gold-400">
                        遇
                      </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-brush text-base text-paper-100">{a.name}</span>
                        <span className="font-serif text-[11px] text-gold-400/70">
                          {a.kind} · 凶险{dangerLabel(a.danger)}
                        </span>
                        {a.persistent && (
                          <span className="font-serif text-[10px] px-1.5 py-0.5 rounded border border-gold-500/30 bg-gold-500/10 text-gold-400/80">
                            常设
                          </span>
                        )}
                        <span className="font-serif text-[11px] text-paper-400 ml-auto">
                          在{adventureWhere(a)}
                        </span>
                      </div>

                      {a.summary && (
                        <p className="font-serif text-sm text-paper-200 leading-relaxed mt-1.5">{a.summary}</p>
                      )}

                      {(a.reward || a.penalty) && (
                        <div className="flex items-center gap-4 flex-wrap mt-1.5 font-serif text-[11px]">
                          {a.reward && <span className="text-jade-400/80">可图：{a.reward}</span>}
                          {a.penalty && <span className="text-cinnabar-300/80">凶险：{a.penalty}</span>}
                        </div>
                      )}

                      <div className="mt-2.5">
                        {here ? (
                          <SealButton onClick={() => openAdventure(a.id)} className="px-3 py-1 text-[11px]">
                            入内探看
                          </SealButton>
                        ) : (
                          <div className="flex items-center gap-3">
                            <SealButton
                              variant="outline"
                              onClick={() => void travelToAdventure(a.id)}
                              className="px-3 py-1 text-[11px]"
                            >
                              前往此处
                            </SealButton>
                            <span className="font-serif text-[11px] text-paper-400/50">须亲至该处方可入内。</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollCard>
      )}

      {tab === "rumors" && (
        <ScrollCard>
          <div className="flex items-center gap-2 mb-3">
            <Ear size={15} className="text-jade-400" />
            <span className="font-brush text-base text-jade-400">最近听到的</span>
            <span className="font-serif text-[11px] text-paper-400/45 ml-auto">
              只留最近一个月，共 {alive.length} 条
            </span>
          </div>

          {alive.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquareQuote size={32} className="mx-auto text-paper-500/30 mb-2" />
              <p className="font-serif text-sm text-paper-400/50">这些日子没听见什么值得记的事。</p>
              <p className="font-serif text-[11px] text-paper-400/35 mt-1">
                去客栈或茶棚坐下叫一碟吃食，席间的闲话自会记到这儿。
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {alive.map((r) => (
                <li
                  key={r.id}
                  className="p-3 rounded border-2 border-paper-400 bg-ink-800 flex items-start gap-3"
                >
                  <div className="w-8 h-8 shrink-0 rounded flex items-center justify-center bg-jade-500 text-jade-400 border-2 border-jade-500">
                      <Ear size={14} />
                    </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-sm text-paper-100 leading-relaxed">{r.text}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="font-serif text-[11px] text-paper-400">
                        听自：{r.city ? `${r.city}·` : ""}
                        {r.source}
                      </span>
                      <span className="font-number text-[11px] text-paper-400">
                        {today - r.day === 0 ? "今日" : `${today - r.day} 日前`}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollCard>
      )}

      {tab === "pacts" && (
        <ScrollCard>
          <div className="flex items-center gap-2 mb-3">
            <Handshake size={15} className="text-pine-400" />
            <span className="font-brush text-base text-pine-400">约定</span>
            <span className="font-serif text-[11px] text-paper-400/45 ml-auto">
              共 {pacts.length} 桩，未了 {openPacts} 桩
            </span>
          </div>

          {orderedPacts.length === 0 ? (
            <div className="text-center py-8">
              <Handshake size={32} className="mx-auto text-paper-500/30 mb-2" />
              <p className="font-serif text-sm text-paper-400/50">眼下没跟谁说过什么定话。</p>
              <p className="font-serif text-[11px] text-paper-400/35 mt-1">
                去匠人区定做一件东西，或在交谈、问道里与人把话说明白，都会记到这儿。
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {orderedPacts.map((p) => {
                const ready = pactReady(p, today);
                const left = pactDaysLeft(p, today);
                const open = p.status === "open";
                const late = open && p.kind === "word" && left < 0;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "p-3 rounded border-2 flex items-start gap-3",
                      !open
                        ? "border-paper-400 bg-ink-800 opacity-70"
                        : late
                          ? "border-cinnabar-500 bg-cinnabar-500"
                          : "border-pine-500 bg-pine-500",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 shrink-0 rounded flex items-center justify-center border-2",
                        !open
                          ? "bg-ink-700 text-paper-400 border-paper-400"
                          : late
                            ? "bg-cinnabar-500 text-cinnabar-300 border-cinnabar-500"
                            : "bg-pine-500 text-pine-400 border-pine-500",
                      )}
                    >
                      <Handshake size={14} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-brush text-base text-paper-100">{p.name}</span>
                        <span className="font-serif text-[11px] px-1.5 py-0.5 rounded border-2 border-paper-400 bg-paper-400 text-paper-400">
                          {pactKindLabel(p.kind)}
                        </span>
                        {p.status === "done" && (
                          <span className="font-serif text-[11px] px-1.5 py-0.5 rounded border text-jade-400 border-jade-500/35 bg-jade-500/10">
                            已了结
                          </span>
                        )}
                        {p.status === "failed" && (
                          <span className="font-serif text-[11px] px-1.5 py-0.5 rounded border text-cinnabar-300 border-cinnabar-500/35 bg-cinnabar-500/10">
                            已误期
                          </span>
                        )}
                        <span className="font-serif text-[11px] text-paper-400/50">与 {p.giver} 说定</span>
                        <span
                          className={cn(
                            "font-number text-[11px] ml-auto",
                            open && left <= 0 ? "text-cinnabar-300" : "text-paper-400/45",
                          )}
                        >
                          {`第 ${p.dueDay} 日期满`}
                          {open ? (left > 0 ? ` · 还剩 ${left} 日` : left === 0 ? " · 今日" : ` · 已过 ${-left} 日`) : ""}
                        </span>
                      </div>

                      {p.desc && (
                        <p className="font-serif text-sm text-paper-200 leading-relaxed mt-1.5">{p.desc}</p>
                      )}

                      <div className="flex items-center gap-4 flex-wrap mt-2">
                        <span className="flex items-center gap-1 font-serif text-[11px] text-paper-400">
                          <MapPin size={11} /> {p.place || "去处未定"}
                        </span>
                        <span className="font-serif text-[11px] text-paper-400">
                          第 {p.madeDay} 日说定
                        </span>
                      </div>

                      {open && (
                        <div className="flex items-center gap-3 mt-2.5">
                          <SealButton
                            variant={ready ? "seal" : "ghost"}
                            disabled={!ready}
                            onClick={() => settle(p.id, p.item?.name ?? p.name)}
                            className="px-3 py-1 text-[11px]"
                          >
                            {p.kind === "pickup" ? (ready ? "取货" : "日子未到") : "去了结"}
                          </SealButton>
                          <span className="font-serif text-[11px] text-paper-400/45">
                            {p.kind === "pickup"
                              ? "误了期也不罚，只是东西没做成，须等期满才取得走。"
                              : "误过宽限的几日，人情上要折一点。"}
                          </span>
                        </div>
                      )}

                      {p.outcome && (
                        <p className="font-serif text-[11px] text-paper-400/45 mt-1.5">{p.outcome}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollCard>
      )}

      <p className="font-serif text-[11px] text-paper-400/40 leading-relaxed mt-4">
        听来的话只存 {RUMOR_KEEP_DAYS} 天，过时便不再提；江湖快报另成一册，见左侧书脊「快报」；
        说定的约定误了期，取货的只是迟些拿到，口头的则要在人情上落点亏。
      </p>

      {note && <p className="font-serif text-xs text-gold-400/80 leading-relaxed mt-3">{note}</p>}
    </div>
  );
}
