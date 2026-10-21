import { useMemo } from "react";
import type { ReactNode } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { REALM_NAMES } from "@/data/mockData";
import { LOCATIONS } from "@/data/locations";
import { getMarker } from "@/data/map";
import { isRewardHeld } from "@/data/quests";
import { migrateRelation, relationWhereabout, trustName } from "@/data/npcGen";
import { daySerial } from "@/lib/gameTime";
import type { NPCChatState, NPCProfile, Quest, Relation } from "@/data/types";
import { cn } from "@/lib/utils";

/**
 * 问道窗与交谈窗的侧边「旁记」。
 *
 * 推到下一处场景时，前一处的内容总容易被忘掉：
 * 交谈里想不起前几回叙事走到哪儿，叙事里想不起刚与人说了什么。
 * 故两窗各挂一栏：一栏记前情，一栏记眼前的人与未了的机缘。
 */

const TYPE_LABELS: Record<string, string> = {
  dao_companion: "道侣",
  master: "师父",
  disciple: "弟子",
  friend: "好友",
  enemy: "仇敌",
};

/** 期限写到字面上：还剩几日、是否误期 */
function dueText(quest: Quest, today: number): { text: string; urgent: boolean } {
  if (quest.dueDay === undefined) return { text: "不限时", urgent: false };
  if (quest.status !== "open") return { text: `第 ${quest.dueDay} 日止`, urgent: false };
  const left = quest.dueDay - today;
  if (left < 0) return { text: `已误 ${-left} 日`, urgent: true };
  if (left === 0) return { text: "今日到期", urgent: true };
  return { text: `余 ${left} 日`, urgent: left <= 2 };
}

/** 还在办、或赏还押着没领的，都算要记着的 */
function pendingQuests(quests: Quest[]): Quest[] {
  return (Array.isArray(quests) ? quests : []).filter((q) => q && (q.status === "open" || isRewardHeld(q)));
}

/** 把相关的排在前头，其余照期限先后 */
function orderQuests(list: Quest[], isRelated: (q: Quest) => boolean): { quest: Quest; related: boolean }[] {
  return list
    .map((quest) => ({ quest, related: isRelated(quest) }))
    .sort(
      (a, b) =>
        Number(b.related) - Number(a.related) ||
        (a.quest.dueDay ?? 9999) - (b.quest.dueDay ?? 9999),
    );
}

/** 近一次交谈的几句话：同席的照同桌的记录，单谈的取最近说过话的那一位 */
function recentChatLines(npcChat: NPCChatState): { with: string; lines: { who: string; text: string; mine: boolean }[] } {
  const partyIds = Array.isArray(npcChat.partyIds) ? npcChat.partyIds : [];
  if (partyIds.length > 1) {
    const messages = (Array.isArray(npcChat.partyMessages) ? npcChat.partyMessages : [])
      .filter((m) => m.speakerId !== "system")
      .slice(-5);
    const names = partyIds
      .map((id) => npcChat.profiles.find((p) => p.npcId === id)?.name)
      .filter((n): n is string => !!n);
    return {
      with: names.join("、") || "众人",
      lines: messages.map((m) => ({
        who: m.speakerId === "player" ? "你" : m.speakerName,
        text: m.content,
        mine: m.speakerId === "player",
      })),
    };
  }

  const profile = [...(Array.isArray(npcChat.profiles) ? npcChat.profiles : [])].sort(
    (a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0),
  )[0];
  if (!profile) return { with: "", lines: [] };
  return {
    with: profile.name,
    lines: (Array.isArray(profile.messages) ? profile.messages : [])
      .filter((m) => m.role !== "system")
      .slice(-5)
      .map((m) => ({
        who: m.role === "player" ? "你" : profile.name,
        text: m.content,
        mine: m.role === "player",
      })),
  };
}

export function AsideShell({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="旁记"
      className="hidden lg:flex w-72 shrink-0 min-h-0 flex-col border-l border-gold-500/30 bg-paper-aged/60"
    >
      <div className="shrink-0 flex items-center gap-2 px-4 pt-4 pb-2 border-b border-ink-lightest/15">
        <span className="w-1 h-3.5 rounded-sm bg-cinnabar-500/80" />
        <h3 className="font-brush text-base text-ink-dark tracking-[0.2em]">旁记</h3>
        <span className="font-serif text-[11px] text-ink-lightest">以备一时之忘</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto book-scrollbar px-4 py-3.5">{children}</div>
    </aside>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h4 className="font-brush text-[15px] text-cinnabar-500 tracking-widest">{title}</h4>
        {hint && <span className="font-serif text-[11px] text-ink-lightest truncate">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="font-serif text-[12px] text-ink-lightest leading-relaxed">{text}</p>;
}

/** 一桩机缘：名目、去处、期限，相关的点一枚朱砂 */
function QuestRow({ quest, today, related }: { quest: Quest; today: number; related: boolean }) {
  const due = dueText(quest, today);
  return (
    <div className="rounded-sm border border-ink-lightest/20 bg-paper-fresh/70 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        {related && <span className="w-1.5 h-1.5 rounded-full bg-cinnabar-500 shrink-0" />}
        <span className="flex-1 min-w-0 font-serif text-[12.5px] text-ink-dark truncate">{quest.name}</span>
        <span
          className={cn(
            "shrink-0 font-serif text-[11px]",
            due.urgent ? "text-cinnabar-500" : "text-ink-light",
          )}
        >
          {due.text}
        </span>
      </div>
      {quest.place && (
        <p className="mt-1 font-serif text-[11px] text-ink-light truncate">去处 · {quest.place}</p>
      )}
      {quest.condition && (
        <p className="mt-0.5 font-serif text-[11px] leading-snug text-ink-light/90 line-clamp-2">
          交差 · {quest.condition}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 font-serif text-[11px] text-ink-lightest w-8">{label}</span>
      <span className="font-serif text-[12.5px] text-ink-dark leading-snug break-all">{value}</span>
    </div>
  );
}

/** 问道窗侧栏：近一次交谈、眼下的人、未了的机缘 */
export function StoryAside() {
  const conversation = useAIStore((s) => s.conversation);
  const npcChat = useAIStore((s) => s.npcChat);
  const player = useGameStore((s) => s.player);
  const relations = useGameStore((s) => s.relations);
  const quests = useGameStore((s) => s.quests);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const currentLocation = useGameStore((s) => s.currentLocation);
  const currentTime = useGameStore((s) => s.currentTime);

  const today = daySerial(currentTime);
  const placeName = getMarker(currentPlaceId)?.name ?? "";
  const locationName = LOCATIONS.find((l) => l.id === currentLocation)?.name ?? "";
  const chat = useMemo(() => recentChatLines(npcChat), [npcChat]);
  const companions = relations.filter((r) => r.traveling).map((r) => r.name);

  const rows = useMemo(
    () =>
      orderQuests(pendingQuests(quests), (q) => !!q.target?.cityId && q.target.cityId === currentPlaceId).slice(0, 6),
    [quests, currentPlaceId],
  );

  return (
    <AsideShell>
      <Section title="近谈" hint={chat.with ? `与${chat.with}` : undefined}>
        {chat.lines.length === 0 ? (
          <Empty text="这几日还不曾与人坐下来说话。" />
        ) : (
          chat.lines.map((line, i) => (
            <p key={i} className="font-serif text-[12px] leading-snug text-ink-medium">
              <span className={cn("font-brush mr-1", line.mine ? "text-cinnabar-500" : "text-gold-600")}>
                {line.who}
              </span>
              <span className="line-clamp-3">{line.text}</span>
            </p>
          ))
        )}
      </Section>

      <Section title="此人">
        <Row label="姓名" value={`${player.name || "无名"}${player.title ? `·${player.title}` : ""}`} />
        <Row label="境界" value={REALM_NAMES[player.realmIndex] ?? "未知"} />
        <Row label="所在" value={[placeName, locationName].filter(Boolean).join("·") || "不知何处"} />
        <Row
          label="根本"
          value={`气血 ${player.hp}/${player.hpMax} · 灵力 ${player.mp}/${player.mpMax} · 神识 ${player.spirit}/${player.spiritMax}`}
        />
        {companions.length > 0 && <Row label="同行" value={companions.join("、")} />}
      </Section>

      <Section title="机缘" hint={rows.length > 0 ? `${rows.length} 桩在办` : undefined}>
        {rows.length === 0 ? (
          <Empty text="眼下没有应下的事。" />
        ) : (
          rows.map(({ quest, related }) => (
            <QuestRow key={quest.id} quest={quest} today={today} related={related} />
          ))
        )}
      </Section>
    </AsideShell>
  );
}

/** 交谈窗侧栏：近几回叙事、眼前此人、相干机缘 */
export function ChatAside() {
  const conversation = useAIStore((s) => s.conversation);
  const npcChat = useAIStore((s) => s.npcChat);
  const relations = useGameStore((s) => s.relations);
  const quests = useGameStore((s) => s.quests);
  const districtNames = useGameStore((s) => s.districtNames);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const currentTime = useGameStore((s) => s.currentTime);

  const today = daySerial(currentTime);
  const partyIds = Array.isArray(npcChat.partyIds) ? npcChat.partyIds : [];
  const relation = relations.find((r) => r.id === npcChat.activeNpcId);
  const profile: NPCProfile | undefined = npcChat.profiles.find((p) => p.npcId === npcChat.activeNpcId);
  const partyNames = partyIds
    .map((id) => relations.find((r) => r.id === id)?.name)
    .filter((n): n is string => !!n);

  const turns = conversation.turns.slice(-3);
  const npcName = relation?.name || profile?.name || "";

  const news = useMemo(
    () =>
      orderQuests(
        pendingQuests(quests),
        (q) =>
          (!!npcName && (q.target?.person === npcName || q.giver === npcName || (q.place ?? "").includes(npcName))) ||
          (!!q.target?.cityId && q.target.cityId === currentPlaceId),
      ).slice(0, 6),
    [quests, npcName, currentPlaceId],
  );

  return (
    <AsideShell>
      <Section title="前情" hint={turns.length > 0 ? `叙事 · 近 ${turns.length} 回` : undefined}>
        {turns.length === 0 ? (
          <Empty text="尚未开卷，这一席话便由你先说。" />
        ) : (
          turns.map((turn, i) => {
            const index = conversation.turns.length - turns.length + i + 1;
            return (
              <div key={turn.id} className="rounded-sm border border-ink-lightest/20 bg-paper-fresh/70 px-2.5 py-2">
                <p className="font-serif text-[11px] text-ink-lightest truncate">
                  第 {index} 回 · {turn.playerInput || "静观其变"}
                </p>
                <p className="mt-1 font-serif text-[12px] leading-snug text-ink-medium line-clamp-4">
                  {turn.narrative}
                </p>
              </div>
            );
          })
        )}
      </Section>

      <Section title="此人">
        {!relation && !profile ? (
          <Empty text="此人的底细还没记下。" />
        ) : (
          <>
            <Row label="名号" value={`${npcName || "未知"}${relation?.title ? `·${relation.title}` : profile?.title ? `·${profile.title}` : ""}`} />
            {relation && (
              <>
                <Row label="身份" value={TYPE_LABELS[relation.type] ?? "相识"} />
                <Row label="境界" value={relation.realm || "看不透"} />
                <Row
                  label="情分"
                  value={`关系 ${migrateRelation(relation).relation} · ${trustName(migrateRelation(relation).trust)}`}
                />
                <Row label="行踪" value={relationWhereabout(relation, districtNames)} />
              </>
            )}
            {partyNames.length > 1 && <Row label="同席" value={partyNames.join("、")} />}
            {profile?.scene?.shop && <Row label="所在" value={profile.scene.shop} />}
            {(relation?.persona || relation?.note || profile?.persona) && (
              <p className="font-serif text-[11.5px] leading-relaxed text-ink-light line-clamp-4">
                {relation?.persona || relation?.note || profile?.persona}
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="机缘" hint={news.length > 0 ? `${news.length} 桩在办` : undefined}>
        {news.length === 0 ? (
          <Empty text="眼下没有应下的事。" />
        ) : (
          news.map(({ quest, related }) => (
            <QuestRow key={quest.id} quest={quest} today={today} related={related} />
          ))
        )}
      </Section>
    </AsideShell>
  );
}
