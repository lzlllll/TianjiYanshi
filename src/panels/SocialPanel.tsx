import { useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { SealButton } from "@/components/ui/SealButton";
import { ReputationPanel } from "@/panels/ReputationPanel";
import { BeastPanel } from "@/panels/BeastPanel";
import { cn } from "@/lib/utils";
import { migrateRelation, trustName } from "@/data/npcGen";
import { MAX_TRAVEL_COMPANIONS, isNpcAround, isNpcLocationKnown, relationTags, relationWhereabout, travelingCount } from "@/data/npcGen";
import { REALM_NAMES, TALK_MIN_REALM_INDEX, canTalkTo } from "@/data/mockData";
import type { Relation, RelationType } from "@/data/types";
import { Footprints, MessageCircle } from "lucide-react";

type GroupTab = "all" | RelationType;

/** 尘缘面板下分三栏：相识是人，名声是旁人嘴里的你，灵兽是随你上路的那一头 */
type SocialView = "relations" | "reputation" | "beast";

const VIEWS: { id: SocialView; label: string }[] = [
  { id: "relations", label: "相识" },
  { id: "reputation", label: "名声" },
  { id: "beast", label: "灵兽" },
];

const GROUPS: { id: GroupTab; label: string; icon: string }[] = [
  { id: "all", label: "全部", icon: "群" },
  { id: "dao_companion", label: "道侣", icon: "侣" },
  { id: "master", label: "师父", icon: "师" },
  { id: "disciple", label: "徒弟", icon: "徒" },
  { id: "friend", label: "好友", icon: "友" },
  { id: "enemy", label: "仇敌", icon: "仇" },
];

const TYPE_LABEL: Record<RelationType, string> = {
  dao_companion: "道侣",
  master: "师父",
  disciple: "徒弟",
  friend: "好友",
  enemy: "仇敌",
};

const TYPE_COLOR: Record<RelationType, { text: string; border: string; bg: string; seal: string }> = {
  dao_companion: {
    text: "text-cinnabar-400",
    border: "border-cinnabar-500/40",
    bg: "bg-cinnabar-500/10",
    seal: "bg-cinnabar-500",
  },
  master: {
    text: "text-gold-400",
    border: "border-gold-400/40",
    bg: "bg-gold-400/10",
    seal: "bg-gold-500",
  },
  disciple: {
    text: "text-jade-400",
    border: "border-jade-500/40",
    bg: "bg-jade-500/10",
    seal: "bg-jade-500",
  },
  friend: {
    text: "text-pine-400",
    border: "border-pine-500/40",
    bg: "bg-pine-500/10",
    seal: "bg-pine-500",
  },
  enemy: {
    text: "text-cinnabar-400",
    border: "border-cinnabar-700/50",
    bg: "bg-cinnabar-700/15",
    seal: "bg-cinnabar-700",
  },
};

export function SocialPanel() {
  const relations = useGameStore((s) => s.relations);
  const [view, setView] = useState<SocialView>("relations");

  return (
    <div className="paper-texture">
      <PanelTitle
        title="尘缘"
        poem={
          view === "reputation"
            ? "人言可畏，亦可为凭。旁人怎么看你，便怎么待你。"
            : view === "beast"
              ? "山中一日，人间一岁。它不懂修行，只认着你这个人。"
              : "道法自然，缘起缘灭。红尘种种，皆是修行。"
        }
      />

      {/* 分栏：相识是人，名声是旁人嘴里的你，灵兽是随你上路的那一头 */}
      <div className="flex gap-2 mb-4 border-b border-paper-400/10 pb-3">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "px-4 py-1.5 rounded font-brush text-sm tracking-widest transition-all border",
              view === v.id
                ? "border-gold-400/50 bg-gold-400/10 text-gold-400"
                : "border-transparent text-paper-400/60 hover:text-paper-200",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "reputation" && <ReputationPanel />}
      {view === "beast" && <BeastPanel />}
      {view === "relations" && <RelationsView relations={relations} />}
    </div>
  );
}

function RelationsView({ relations }: { relations: Relation[] }) {
  const [tab, setTab] = useState<GroupTab>("all");

  const filtered = tab === "all" ? relations : relations.filter((r) => r.type === tab);

  return (
    <>
      {/* 分组按钮 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {GROUPS.map((g) => {
          const count =
            g.id === "all"
              ? relations.length
              : relations.filter((r) => r.type === g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => setTab(g.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded font-brush text-sm tracking-wider transition-all border",
                tab === g.id
                  ? "border-gold-400/50 bg-gold-400/10 text-gold-400"
                  : "border-paper-400/15 bg-ink-900/40 text-paper-400/70 hover:text-paper-200",
              )}
            >
              <span className="text-base">{g.icon}</span>
              {g.label}
              <span className="font-number text-xs text-paper-400/50">({count})</span>
            </button>
          );
        })}
      </div>

      {/* 关系卡片网格 */}
      <div className="grid grid-cols-2 gap-4">
        {filtered.map((rel) => (
          <RelationCard key={rel.id} relation={rel} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-16 font-serif text-paper-400/50">
            此间空空，缘分未至
          </div>
        )}
      </div>
    </>
  );
}

const DEFAULT_RELATION_COLOR = {
  text: "text-paper-400",
  border: "border-paper-500/40",
  bg: "bg-paper-500/10",
  seal: "bg-paper-500",
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-paper-400/50">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function RelationCard({ relation }: { relation: Relation }) {
  const openNPCChat = useAIStore((s) => s.openNPCChat);
  const setTraveling = useGameStore((s) => s.setTraveling);
  const districtNames = useGameStore((s) => s.districtNames);
  const realmIndex = useGameStore((s) => s.player.realmIndex);
  const hereLabel = useGameStore((s) => s.hereLabel);
  const currentPlaceId = useGameStore((s) => s.currentPlaceId);
  const mapSceneId = useGameStore((s) => s.mapSceneId);
  const sectSites = useGameStore((s) => s.sectSites);
  // 换一处地方便重新掂量：人在哪儿，决定这些人眼下在不在近前
  const placeName = useMemo(() => hereLabel(), [hereLabel, currentPlaceId, mapSceneId, sectSites]);
  const companions = useGameStore((s) => travelingCount(s.relations));
  const c = TYPE_COLOR[relation.type] || DEFAULT_RELATION_COLOR;
  const isEnemy = relation.type === "enemy";
  const isCompanion = relation.type === "dao_companion";
  // 人在一处随时可谈；不在一处，须到金丹以上方能以神念传音；行踪不定的，修为再高也寻不着
  const locationKnown = isNpcLocationKnown(relation);
  const samePlace = isNpcAround(relation, { placeId: currentPlaceId, placeName });
  const canTalk = canTalkTo(realmIndex, samePlace, locationKnown);
  const traveling = !!relation.traveling;
  const partyFull = companions >= MAX_TRAVEL_COMPANIONS;

  return (
    <ScrollCard className={cn("!p-4", c.bg)}>
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div
            className={cn(
              "w-14 h-14 rounded red-seal text-xl",
              c.seal,
            )}
          >
            {relation.name?.charAt(0) || "?"}
          </div>
          <div
            className={cn(
              "absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-sm font-brush text-xs border",
              c.border,
              c.bg,
              c.text,
            )}
          >
            {TYPE_LABEL[relation.type]}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="font-brush text-lg text-paper-50 truncate">{relation.name}</h3>
            <span className="font-serif text-xs text-paper-400/60 truncate">
              {relation.title}
            </span>
          </div>
          {relationTags(relation).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {relationTags(relation).map((t) => (
                <span
                  key={t}
                  className={cn(
                    "px-1.5 py-0.5 rounded-sm border font-brush text-[11px] leading-none",
                    t === "重要NPC"
                      ? "border-gold-500/50 bg-gold-500/15 text-gold-300"
                      : "border-ink-lightest/40 bg-paper-old/60 text-ink-light",
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="font-serif text-xs text-gold-400/70 mt-0.5">
            {[relation.gender && relation.gender !== "不详" ? relation.gender : "", relation.age ? `${relation.age} 岁` : "", relation.realm]
              .filter(Boolean)
              .join(" · ")}
          </div>

          {/* 人设细目：模型与旧存档未必都有，有几项写几项 */}
          <dl className="mt-1.5 space-y-0.5 font-serif text-xs leading-relaxed text-paper-300/75">
            {relation.personality && <DetailRow label="性情" value={relation.personality} />}
            {relation.appearance && <DetailRow label="形貌" value={relation.appearance} />}
            {relation.origin && <DetailRow label="出身" value={relation.origin} />}
            {relation.affiliation && relation.affiliation !== "无" && (
              <DetailRow label="所属" value={relation.affiliation} />
            )}
            <DetailRow label="现在" value={relationWhereabout(relation, districtNames)} />
            {relation.metAt && <DetailRow label="结识" value={relation.metAt} />}
          </dl>

          <div className="mt-2 space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-serif text-xs text-paper-400/60">
                  {isEnemy ? "恩怨" : "关系"}
                </span>
                <span className="font-number text-xs text-paper-300">
                  {migrateRelation(relation).relation}
                </span>
              </div>
              <div className="h-2 bg-ink-900/80 rounded-sm overflow-hidden border border-paper-400/10">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    isEnemy
                      ? "bg-gradient-to-r from-cinnabar-700 to-cinnabar-400"
                      : isCompanion
                        ? "bg-gradient-to-r from-cinnabar-600 to-gold-400"
                        : "bg-gradient-to-r from-pine-500 to-jade-400",
                  )}
                  style={{ width: `${((migrateRelation(relation).relation + 100) / 200) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-serif text-xs text-paper-400/60">信任</span>
              <span className="font-serif text-xs text-paper-300">
                {migrateRelation(relation).trust} · {trustName(migrateRelation(relation).trust)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="font-serif text-xs text-paper-300/80 leading-relaxed mt-3 px-1">
        {relation.note}
      </p>

      <div className="mt-3 flex gap-2">
        <SealButton
          onClick={() => openNPCChat(relation.id)}
          disabled={!canTalk}
          variant="ghost"
          className="flex-1 py-1.5 text-xs"
          title={
            canTalk
              ? samePlace
                ? "当面攀谈"
                : "以神念传音"
              : !locationKnown
                ? "此人行踪不定，无从交谈"
                : "他不在近前；未到金丹，传不出这一声"
          }
        >
          <MessageCircle size={12} className="mr-1" />
          交谈
        </SealButton>
        {!isEnemy && (
          <SealButton
            onClick={() => setTraveling(relation.id, !traveling)}
            disabled={!traveling && (partyFull || !samePlace)}
            variant="ghost"
            className="flex-1 py-1.5 text-xs"
            title={
              traveling
                ? "就此作别，各走各的路"
                : !locationKnown
                  ? "此人行踪不定，寻不着人，邀不动"
                  : !samePlace
                    ? "他不在近前，须先与他在一处才好同行"
                    : partyFull
                      ? `至多带 ${MAX_TRAVEL_COMPANIONS} 人同行`
                      : "邀他同行；遇上打斗他会站到你这一边"
            }
          >
            <Footprints size={12} className="mr-1" />
            {traveling ? "解散同行" : "同行"}
          </SealButton>
        )}
      </div>

      {!canTalk && (
        <p className="mt-1.5 font-serif text-[11px] text-paper-400/45">
          {!locationKnown
            ? "此人行踪不定，纵到金丹也传不出这一声神念；须先寻着他的下落。"
            : `他眼下在${relationWhereabout(relation, districtNames)}，与你相隔两地。
          你才${REALM_NAMES[realmIndex] ?? "引气初期"}，未到${REALM_NAMES[TALK_MIN_REALM_INDEX] ?? "金丹初期"}，还传不出这一声神念；须得与他在一处才好说话。`}
        </p>
      )}
    </ScrollCard>
  );
}
