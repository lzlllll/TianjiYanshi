import { useEffect, useState } from "react";
import { Users, Award, Flag } from "lucide-react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { CloudDivider } from "@/components/ui/CloudDivider";
import { SealButton } from "@/components/ui/SealButton";
import { GradeTag } from "@/components/ui/GradeTag";
import { SectManagement } from "@/components/sect/SectManagement";
import { SectFoundModal } from "@/components/sect/SectFoundModal";
import { SECT_FOUND_STONE_COST, playerSectName } from "@/data/sectSites";
import { vassalTribute } from "@/data/sectRelations";
import { cn } from "@/lib/utils";
import { daySerial, shichenName } from "@/lib/gameTime";
import {
  STONES_PER_CONTRIBUTION_IN,
  STONES_PER_CONTRIBUTION_OUT,
  contributionForItem,
  heritageCost,
  heritageRequirement,
  isInnerDiscipleOrAbove,
  positionLevel,
  preachReward,
} from "@/data/sectLife";
import { facilityInfo } from "@/data/sectFacilities";
import { sectModifierSpec } from "@/data/sectModifiers";
import type { SectShopItem } from "@/data/types";
import { AI_BACKEND_READY } from "@/data/backend";

type SubTab = "overview" | "position" | "task" | "shop" | "heritage" | "relations" | "management";

/** 登座讲经可挑的几个题目；挑了才讲得成，不是按一下便算 */
const PREACH_TOPICS = ["本门经义", "养生之道", "丹道火候", "剑理刀法"];

export function SectPanel() {
  const sect = useGameStore((s) => s.sect);
  const [tab, setTab] = useState<SubTab>("overview");
  const [founding, setFounding] = useState(false);

  const player = useGameStore((s) => s.player);
  const sectSites = useGameStore((s) => s.sectSites);
  const lowStones = useGameStore((s) => s.spiritStones.low);
  // 本门名号以宗门数据为准，缺了再退回角色卡上那一栏；都没有才写「本门」，
  // 免得某一处写死一个名号，与本门实际对不上
  const sectName = (sect.name || player.sectName || "").trim() || "本门";
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  const isLeader = player.position === "掌门" || player.position === "副掌门" || isDeveloperMode;

  // 无门无派的人：舆图上没有本门点位，名号栏也空着——这时才见得到「开宗立派」
  const hasSect = sectSites.some((s) => s?.mine) || !!playerSectName(sect.name || player.sectName);

  const TABS: { id: SubTab; label: string }[] = [
    { id: "overview", label: "门派概览" },
    { id: "position", label: "职位晋升" },
    { id: "task", label: "门派任务" },
    { id: "shop", label: "贡献商店" },
    { id: "heritage", label: "门派底蕴" },
    { id: "relations", label: "宗门关系" },
    ...(isLeader ? [{ id: "management" as SubTab, label: "宗门管理" }] : []),
  ];

  // 散修：宗门面板只摆开山立派这一桩
  if (!hasSect) {
    return (
      <div className="paper-texture">
        <PanelTitle
          title="宗门"
          poem="道不同，不相为谋。然宗门者，同道相护，荣辱与共。"
        />

        <ScrollCard className="bg-gradient-to-r from-paper-aged to-paper-dark">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 red-seal rounded-lg text-2xl">散</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-brush text-2xl text-gold-400 mb-2">尚无门无派</h2>
              <p className="font-serif text-sm text-paper-300 leading-relaxed">
                你如今是个散修，无门无派，来去自便。若想有个落脚处，可自占一处山头，开宗立派——
                名号与门风由你自己写定，立成之后门中只一座主殿，尚无弟子。
              </p>
              <p className="font-serif text-xs text-paper-400/70 mt-2">
                开山立派须下品灵石 {SECT_FOUND_STONE_COST} · 现有 {lowStones}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <SealButton
              onClick={() => setFounding(true)}
              disabled={lowStones < SECT_FOUND_STONE_COST}
              className="px-4 py-2 text-sm"
            >
              <span className="flex items-center justify-center gap-1.5">
                <Flag size={14} />
                开宗立派
              </span>
            </SealButton>
            <span className="font-serif text-xs text-paper-400/60">
              {lowStones < SECT_FOUND_STONE_COST
                ? `灵石不足，还差 ${SECT_FOUND_STONE_COST - lowStones}`
                : "自选一处空地，写定门风，便立得起门户"}
            </span>
          </div>
        </ScrollCard>

        {founding && (
          <SectFoundModal onClose={() => setFounding(false)} onFounded={() => setFounding(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="paper-texture">
      <PanelTitle
        title="宗门"
        poem="道不同，不相为谋。然宗门者，同道相护，荣辱与共。"
      />

      {/* 门派横幅 */}
      <ScrollCard className="mb-4 bg-gradient-to-r from-paper-aged to-paper-dark">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 red-seal rounded-lg text-2xl">{sectName.charAt(0)}</div>
          <div className="flex-1 min-w-0">
            <h2 className="font-brush text-2xl text-gold-400 mb-2">{sectName}</h2>
            <div className="flex items-center gap-4 text-sm text-paper-300">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-jade-400" />
                <span className="font-serif">{player.position || "门中弟子"}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-gold-400" />
                <span className="font-number">门派等级 Lv.{sect.level ?? 1}</span>
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-serif text-xs text-paper-400/60">声望</div>
            <div className="font-number text-2xl text-gold-400">
              {(sect.reputation ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="w-px h-12 bg-gold-500/20" />
          <div className="text-right">
            <div className="font-serif text-xs text-paper-400/60">我的贡献</div>
            <div className="font-number text-2xl text-cinnabar-400">
              {(sect.contribution ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </ScrollCard>

      {/* 子页签 */}
      <div className="flex gap-1 mb-4 border-b border-gold-500/20">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-5 py-2 font-brush text-base tracking-wider transition-all border-b-2 -mb-px",
              tab === t.id
                ? "text-gold-400 border-gold-400"
                : "text-paper-400/60 border-transparent hover:text-paper-200",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "overview" && <SectOverview />}
        {tab === "position" && <PositionTree />}
        {tab === "task" && <TaskBoard />}
        {tab === "shop" && (
          <>
            <ShopBoard />
            <ContributionExchange />
          </>
        )}
        {tab === "heritage" && <HeritageBoard />}
        {tab === "relations" && <SectRelationsBoard />}
        {tab === "management" && <SectManagement />}
      </div>
    </div>
  );
}

function SectOverview() {
  const sect = useGameStore((s) => s.sect);
  const currentTime = useGameStore((s) => s.currentTime);
  const hasAppearance = (sect.appearance || "").length > 0;
  const hasReputation = (sect.reputationDesc || "").length > 0;
  const hasSurroundings = (sect.surroundings || "").length > 0;

  // 晋升进度：当前贡献相对下一个未达职位的需求；只往上看，已达及以下的职位不算目标
  const currentLevel = positionLevel(sect.positions);
  const nextPosition = [...sect.positions]
    .filter(
      (p) =>
        !p.isCurrent &&
        (Number(p.level) || 1) > currentLevel &&
        p.contributionNeeded > sect.contribution,
    )
    .sort((a, b) => a.contributionNeeded - b.contributionNeeded)[0];
  const promotePct = nextPosition
    ? Math.min(100, Math.round((sect.contribution / nextPosition.contributionNeeded) * 100))
    : 100;

  // 传承完整：已习传承占全部传承的比例
  const heritageTotal = sect.heritage.length;
  const heritageLearned = sect.heritage.filter((h) => h.status === "已习").length;
  const heritagePct = heritageTotal > 0 ? Math.round((heritageLearned / heritageTotal) * 100) : 0;

  // 资源储备：灵石储备可支撑的日常开销天数
  const treasuryStones = sect.management?.treasury?.spiritStones ?? 0;
  const dailyCost = sect.management?.consumption?.dailyCost ?? 0;
  const supportDays = dailyCost > 0 ? Math.floor(treasuryStones / dailyCost) : null;

  // 门中眼下生效的修正：政策、态势一类的时效，由叙事立起、到期自灭
  const today = daySerial(currentTime);
  const sectMods = (sect.modifiers ?? []).filter((m) => Number(m.until) >= today);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ScrollCard title="宗门概况" subtitle="云栖山脉，仙家福地">
          <div className="space-y-3">
            <InfoRow label="门派等级" value={`Lv.${sect.level}`} />
            <InfoRow label="门派声望" value={sect.reputation.toLocaleString()} />
            <InfoRow label="掌门" value={sect.leader} />
            <InfoRow label="护法长老" value={`${sect.elders} 位`} />
            <InfoRow label="门下弟子" value={`${sect.disciples} 人`} />
            <InfoRow label="宗门驻地" value={sect.territory} />
          </div>
        </ScrollCard>

        <ScrollCard title="宗门势力" subtitle={sect.territory || "宗门态势"}>
          <div className="space-y-3">
            <InfoRow label="门派声望" value={sect.reputation.toLocaleString()} />

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-serif text-xs text-paper-300">晋升进度</span>
                <span className="font-number text-xs text-gold-400">
                  {nextPosition
                    ? `${sect.contribution.toLocaleString()} / ${nextPosition.contributionNeeded.toLocaleString()}`
                    : "已至顶阶"}
                </span>
              </div>
              <div className="h-2 bg-ink-900 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cinnabar-600 to-gold-400 transition-all"
                  style={{ width: `${promotePct}%` }}
                />
              </div>
              <div className="font-serif text-xs text-paper-400 mt-1">
                {nextPosition ? `下一职位：${nextPosition.name}` : "已无更高职位"}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-serif text-xs text-paper-300">传承完整</span>
                <span className="font-number text-xs text-cinnabar-400">
                  {heritageTotal > 0 ? `${heritageLearned} / ${heritageTotal} 门` : "尚无传承"}
                </span>
              </div>
              <div className="h-2 bg-ink-900/80 rounded-sm overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cinnabar-600 to-cinnabar-400 transition-all"
                  style={{ width: `${heritagePct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-serif text-xs text-paper-300">资源储备</span>
                <span className="font-number text-xs text-jade-400">
                  {supportDays === null ? "无开销记录" : `约可支撑 ${supportDays} 日`}
                </span>
              </div>
              <div className="font-serif text-xs text-paper-400/50">
                灵石储备 {treasuryStones.toLocaleString()}，日均开销 {dailyCost.toLocaleString()}
              </div>
            </div>

            <CloudDivider />
            {sect.name ? (
              <p className="font-serif text-xs text-paper-400/70 leading-relaxed">
                {sect.name}，当前等级 {sect.level}，门下弟子 {sect.disciples} 人。
                {sect.territory ? `据守${sect.territory}。` : ""}
              </p>
            ) : (
              <p className="font-serif text-xs text-paper-400/40 leading-relaxed italic">
                尚未创建宗门，AI将在开局时生成。
              </p>
            )}
          </div>
        </ScrollCard>
      </div>

      {/* 门中举措：政策与态势一类的时效，写在生成它的那一段叙事之后 */}
      <ScrollCard title="门中举措" subtitle="政策与态势，皆有定时">
        {sectMods.length === 0 ? (
          <p className="font-serif text-xs text-paper-400/50 italic">
            门中眼下无甚举措。叙事里若有大典、闭关、纳新这类事，便会在这上头现出来。
          </p>
        ) : (
          <div className="space-y-2">
            {sectMods.map((m) => {
              const spec = sectModifierSpec(m.id);
              const effects = [
                spec?.effects.resourceMul !== undefined ? `各处进项 ×${spec.effects.resourceMul}` : "",
                spec?.effects.cultivationMul !== undefined ? `门中修炼 ×${spec.effects.cultivationMul}` : "",
                spec?.effects.reputationPerDay
                  ? `声望 ${spec.effects.reputationPerDay > 0 ? "+" : ""}${spec.effects.reputationPerDay}/日`
                  : "",
              ].filter(Boolean);
              return (
                <div key={`${m.id}-${m.until}`} className="rounded border border-gold-500/25 bg-ink-900/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-brush text-sm text-gold-400">{m.name}</span>
                    <span className="font-number text-xs text-paper-400">
                      至第 {m.until} 日 · 余 {Math.max(0, m.until - today)} 日
                    </span>
                  </div>
                  {m.desc && (
                    <p className="font-serif text-xs text-paper-300/80 mt-1 leading-relaxed">{m.desc}</p>
                  )}
                  {effects.length > 0 && (
                    <p className="font-serif text-[11px] text-paper-400/60 mt-1">{effects.join(" · ")}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollCard>

      {/* 宗门外观 */}
      {hasAppearance && (
        <ScrollCard title="宗门外观" subtitle="青山隐隐，道观藏云"
          ornament={<span className="font-brush text-sm text-gold-400/40">形胜</span>}
        >
          <div className="relative">
            <div className="absolute -left-1 top-0 font-brush text-5xl text-gold-500/10 select-none pointer-events-none">
              {(sect.appearance || "").charAt(0) || "云"}
            </div>
            <p className="font-serif text-base text-paper-100 leading-loose tracking-wide indent-[2em] relative z-10 whitespace-pre-wrap">
              {sect.appearance}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-gold-500/15 flex items-center justify-between">
            <span className="font-serif text-sm text-paper-400/50">
              共 {sect.appearance.length} 字
            </span>
            <span className="font-brush text-base text-gold-400/40 tracking-wider">
              · 胜境录 ·
            </span>
          </div>
        </ScrollCard>
      )}

      {/* 江湖风评 */}
      {hasReputation && (
        <ScrollCard title="江湖风评" subtitle="江湖风波恶，评说各不同"
          ornament={<span className="font-brush text-sm text-cinnabar-400/40">风评</span>}
        >
          <div className="relative">
            <div className="absolute -left-1 top-0 font-brush text-5xl text-cinnabar-500/10 select-none pointer-events-none">
              {(sect.reputationDesc || "").charAt(0) || "风"}
            </div>
            <p className="font-serif text-base text-paper-100 leading-loose tracking-wide indent-[2em] relative z-10 whitespace-pre-wrap">
              {sect.reputationDesc}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-cinnabar-500/15 flex items-center justify-between">
            <span className="font-serif text-sm text-paper-400/50">
              共 {sect.reputationDesc.length} 字
            </span>
            <span className="font-brush text-base text-cinnabar-400/40 tracking-wider">
              · 风评录 ·
            </span>
          </div>
        </ScrollCard>
      )}

      {/* 周围环境 */}
      {hasSurroundings && (
        <ScrollCard title="周围环境" subtitle="山门之外，别有洞天"
          ornament={<span className="font-brush text-sm text-jade-400/40">疆域</span>}
        >
          <div className="relative">
            <div className="absolute -left-1 top-0 font-brush text-5xl text-jade-500/10 select-none pointer-events-none">
              {(sect.surroundings || "").charAt(0) || "山"}
            </div>
            <p className="font-serif text-base text-paper-100 leading-loose tracking-wide indent-[2em] relative z-10 whitespace-pre-wrap">
              {sect.surroundings}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-jade-500/15 flex items-center justify-between">
            <span className="font-serif text-sm text-paper-400/50">
              共 {sect.surroundings.length} 字
            </span>
            <span className="font-brush text-base text-jade-400/40 tracking-wider">
              · 舆图录 ·
            </span>
          </div>
        </ScrollCard>
      )}
    </div>
  );
}

/** 宗门之间的交情：起初一张白纸，由叙事与新闻添改；附庸另列一栏 */
function SectRelationsBoard() {
  const relations = useGameStore((s) => (Array.isArray(s.sectRelations) ? s.sectRelations : []));
  const sectSites = useGameStore((s) => s.sectSites);
  const nameOf = (id: string) => sectSites.find((s) => s.id === id)?.name ?? id;
  const mine = sectSites.find((s) => s.mine);
  const vassals = mine ? sectSites.filter((s) => s.vassalOf === mine.id) : [];

  const STANCE_STYLE: Record<string, string> = {
    附庸: "text-gold-400 border-gold-400/40 bg-gold-400/10",
    结盟: "text-jade-400 border-jade-500/40 bg-jade-500/10",
    友好: "text-jade-400 border-jade-500/30 bg-jade-500/5",
    中立: "text-paper-300 border-paper-400/25 bg-ink-900/40",
    敌对: "text-cinnabar-400 border-cinnabar-500/40 bg-cinnabar-500/10",
  };

  return (
    <div className="space-y-4">
      <ScrollCard title="宗门关系" subtitle="江湖门派间的交情，多由叙事与新闻添改">
        {relations.length === 0 ? (
          <p className="font-serif text-xs text-paper-400/50 italic leading-relaxed">
            本门尚未与哪家宗门结下交情。日后行走江湖、或听闻消息，这里自会一笔笔记上。
          </p>
        ) : (
          <div className="space-y-2">
            {relations.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded border border-paper-400/10 bg-ink-900/30 px-3 py-2"
              >
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 font-serif text-xs",
                    STANCE_STYLE[r.stance] ?? STANCE_STYLE.中立,
                  )}
                >
                  {r.stance}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-sm text-paper-100 truncate">
                    {nameOf(r.a)} ⇆ {nameOf(r.b)}
                  </div>
                  {r.note && (
                    <p className="font-serif text-xs text-paper-400/60 mt-0.5 leading-relaxed">{r.note}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 font-number text-xs",
                    r.relation >= 0 ? "text-jade-400" : "text-cinnabar-400",
                  )}
                >
                  {r.relation > 0 ? `+${r.relation}` : r.relation}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollCard>

      {vassals.length > 0 && (
        <ScrollCard title="本门附庸" subtitle="称臣纳贡，按日进项">
          <div className="space-y-2">
            {vassals.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 rounded border border-gold-500/25 bg-gold-500/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-brush text-sm text-paper-100">{v.name}</div>
                  <div className="font-serif text-xs text-paper-400/60 truncate">{v.seat}</div>
                </div>
                <span className="shrink-0 font-number text-xs text-gold-400">
                  日贡 {vassalTribute(v)} 灵石
                </span>
              </div>
            ))}
          </div>
        </ScrollCard>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-paper-400/10">
      <span className="font-serif text-xs text-paper-400/70">{label}</span>
      <span className="font-serif text-sm text-paper-100">{value}</span>
    </div>
  );
}

function PositionTree() {
  const positions = useGameStore((s) => Array.isArray(s.sect?.positions) ? s.sect.positions : []);
  const contribution = useGameStore((s) => s.sect?.contribution || 0);
  const promote = useGameStore((s) => s.promote);
  // 眼下排在第几级：此一档及以下皆视为已达，只往上领职，不往回降
  const currentLevel = positionLevel(positions);

  return (
    <ScrollCard title="职位晋升" subtitle="积功累德，步步登高">
      <div className="relative">
        {/* 树状连线 */}
        <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-gold-400/40 to-gold-500/10" />
        <div className="space-y-2">
          {positions.map((pos) => {
            const level = Number(pos.level) || 1;
            const reached = pos.unlocked || pos.isCurrent || level <= currentLevel;
            const canPromote = !reached && contribution >= pos.contributionNeeded;
            return (
              <div
                key={pos.id}
                className={cn(
                  "relative flex items-center gap-4 pl-12 py-3 rounded border transition-all",
                  pos.isCurrent
                    ? "border-gold-400/50 bg-gold-400/10 shadow-glow"
                    : reached
                      ? "border-jade-500/30 bg-jade-500/5"
                      : canPromote
                        ? "border-cinnabar-500/40 bg-cinnabar-500/5"
                        : "border-paper-400/10 bg-ink-900/30 opacity-60",
                )}
              >
                {/* 节点 */}
                <div
                  className={cn(
                    "absolute left-3 w-7 h-7 rounded-full flex items-center justify-center font-brush text-xs border-2",
                    pos.isCurrent
                      ? "bg-gold-400 text-ink-darkest border-gold-300"
                      : reached
                        ? "bg-jade-500/20 text-jade-400 border-jade-500/40"
                        : "bg-ink-900 text-paper-500/50 border-paper-400/20",
                  )}
                >
                  {pos.level}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-brush text-base text-paper-100">{pos.name}</span>
                    {pos.isCurrent && (
                      <span className="font-brush text-xs text-gold-400 px-1.5 py-0.5 border border-gold-400/40 rounded">
                        现任
                      </span>
                    )}
                    {reached && !pos.isCurrent && (
                      <span className="font-serif text-xs text-jade-400">已达</span>
                    )}
                  </div>
                  <p className="font-serif text-xs text-paper-400/60 mt-0.5">{pos.privilege}</p>
                  <div className="font-number text-xs text-paper-400/50 mt-0.5">
                    需贡献 {(pos.contributionNeeded ?? 0).toLocaleString()}
                  </div>
                </div>

                {!reached && (
                  <SealButton
                    onClick={() => promote(pos.id)}
                    disabled={!canPromote}
                    variant="ghost"
                    className="px-3 py-1 text-xs"
                  >
                    {canPromote ? "晋升" : "未达"}
                  </SealButton>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollCard>
  );
}

function TaskBoard() {
  const tasks = useGameStore((s) => Array.isArray(s.sect?.tasks) ? s.sect.tasks : []);
  const quests = useGameStore((s) => s.quests);
  const acceptTask = useGameStore((s) => s.acceptTask);
  const refreshSectTasks = useGameStore((s) => s.refreshSectTasks);

  // 手上没有在办的事务，进这一页时照城里的实情现张一批
  useEffect(() => {
    refreshSectTasks();
  }, [refreshSectTasks]);

  const DIFFICULTY: Record<string, { color: string; bg: string }> = {
    易: { color: "text-jade-400", bg: "border-jade-500/30 bg-jade-500/10" },
    中: { color: "text-gold-400", bg: "border-gold-400/30 bg-gold-400/10" },
    难: { color: "text-cinnabar-400", bg: "border-cinnabar-500/30 bg-cinnabar-500/10" },
    险: { color: "text-cinnabar-400", bg: "border-cinnabar-600/40 bg-cinnabar-600/15" },
  };

  const DEFAULT_DIFFICULTY = { color: "text-paper-400", bg: "border-paper-500/30 bg-paper-500/10" };

  // 接下的事务挂在机缘上，去这儿看它办到哪一步了
  const questOf = (questId?: string) =>
    questId ? quests.find((q) => q.id === questId) : undefined;

  return (
    <ScrollCard title="门派任务" subtitle="为宗出力，积攒贡献">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="font-serif text-xs text-paper-400/50 leading-relaxed">
          接下只是领了差事，须亲往去处、办妥交付才算完成；办了事回来，贡献与灵石才入账。
        </p>
        <SealButton
          onClick={() => refreshSectTasks(true)}
          variant="ghost"
          className="shrink-0 px-3 py-1 text-xs"
        >
          另张一批
        </SealButton>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => {
          const d = DIFFICULTY[task.difficulty] || DEFAULT_DIFFICULTY;
          const quest = questOf(task.questId);
          const state = !task.accepted
            ? "待接"
            : quest?.status === "done"
              ? "已交差"
              : quest?.status === "failed"
                ? "已误期"
                : "在办";
          const closed = state !== "待接";
          return (
            <div
              key={task.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded border",
                closed ? "border-jade-500/30 bg-jade-500/5 opacity-80" : "border-paper-400/10 bg-ink-900/30",
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded flex items-center justify-center font-brush text-base border shrink-0",
                  d.bg,
                  d.color,
                )}
              >
                {task.difficulty}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-brush text-base text-paper-100">{task.title}</span>
                  {state !== "待接" && (
                    <span
                      className={cn(
                        "font-serif text-xs px-1.5 py-0.5 border rounded",
                        state === "已交差"
                          ? "text-jade-400 border-jade-500/30"
                          : state === "已误期"
                            ? "text-cinnabar-400 border-cinnabar-500/30"
                            : "text-gold-400 border-gold-400/30",
                      )}
                    >
                      {state}
                    </span>
                  )}
                </div>
                <p className="font-serif text-xs text-paper-400/60 mt-0.5 leading-relaxed">
                  {task.desc}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                  {task.place && (
                    <span className="font-serif text-xs text-paper-300/70">去处：{task.place}</span>
                  )}
                  {task.days && (
                    <span className="font-serif text-xs text-paper-400/60">限期 {task.days} 日</span>
                  )}
                  <span className="font-number text-xs text-cinnabar-400">
                    贡献 +{task.contribution}
                  </span>
                  <span className="font-number text-xs text-gold-400/80">
                    灵石 +{task.spiritStone}
                  </span>
                </div>
                {task.condition && (
                  <p className="font-serif text-xs text-jade-400/70 mt-1">交差：{task.condition}</p>
                )}
              </div>
              {!task.accepted && (
                <SealButton
                  onClick={() => acceptTask(task.id)}
                  variant="ghost"
                  className="px-3 py-1 text-xs shrink-0"
                >
                  接取
                </SealButton>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && (
          <p className="font-serif text-xs text-paper-400/50 py-2">
            眼下没有挂着的事务，改日再来看看。
          </p>
        )}
      </div>
    </ScrollCard>
  );
}

function ShopBoard() {
  const shop = useGameStore((s) => Array.isArray(s.sect?.shop) ? s.sect.shop : []);
  const contribution = useGameStore((s) => s.sect?.contribution || 0);
  const buyShop = useGameStore((s) => s.buyShop);

  return (
    <ScrollCard
      title="贡献商店"
      subtitle={`现有贡献 ${(contribution ?? 0).toLocaleString()}`}
    >
      <p className="font-serif text-xs text-paper-400/50 mb-3">
        兑换后立即扣除贡献并把物品收入储物袋；也可在宗门叙事中提及，由推演一并结算。
      </p>
      <div className="grid grid-cols-2 gap-3">
        {shop.map((item: SectShopItem) => {
          const canBuy = contribution >= item.cost;
          return (
            <div
              key={item.id}
              className={cn(
                "p-3 rounded border flex flex-col",
                canBuy
                  ? "border-paper-400/15 bg-ink-900/30"
                  : "border-paper-400/10 bg-ink-900/20 opacity-60",
              )}
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h4 className="font-brush text-base text-paper-100">{item.name}</h4>
                  <span className="font-serif text-xs text-paper-400/50">{item.type}</span>
                </div>
                <span className="font-number text-sm text-cinnabar-400">
                  {(item.cost ?? 0).toLocaleString()}
                </span>
              </div>
              <p className="font-serif text-xs text-paper-400/60 leading-relaxed flex-1">
                {item.desc}
              </p>
              <SealButton
                onClick={() => buyShop(item.id)}
                disabled={!canBuy}
                variant="ghost"
                className="mt-2 w-full py-1 text-xs"
              >
                {canBuy ? "兑换" : "贡献不足"}
              </SealButton>
            </div>
          );
        })}
      </div>
    </ScrollCard>
  );
}

/** 贡献与赏赐：上交灵石／物品换贡献，内门弟子以上可以贡献折领灵石 */
function ContributionExchange() {
  const contribution = useGameStore((s) => s.sect?.contribution || 0);
  const position = useGameStore((s) => s.player.position);
  const positions = useGameStore((s) => (Array.isArray(s.sect?.positions) ? s.sect.positions : []));
  const stones = useGameStore((s) => s.spiritStones.low);
  const inventory = useGameStore((s) => (Array.isArray(s.inventory) ? s.inventory : []));
  const donateStonesToSect = useGameStore((s) => s.donateStonesToSect);
  const donateItemToSect = useGameStore((s) => s.donateItemToSect);
  const redeemContributionForStones = useGameStore((s) => s.redeemContributionForStones);

  const [stoneInput, setStoneInput] = useState("100");
  const [itemName, setItemName] = useState("");
  const [itemCount, setItemCount] = useState("1");
  const [redeemInput, setRedeemInput] = useState("10");
  const [note, setNote] = useState("");

  const mayRedeem = isInnerDiscipleOrAbove(position, positions);
  const target = inventory.find((i) => i.name === itemName) ?? inventory[0];
  const itemN = Math.max(1, Math.trunc(Number(itemCount) || 1));

  const donateStones = () => {
    const gain = donateStonesToSect(Number(stoneInput) || 0);
    setNote(gain > 0 ? `上交灵石，记贡献 ${gain} 点。` : `每次至少 ${STONES_PER_CONTRIBUTION_IN} 块整，且身上要够。`);
  };
  const donateItem = () => {
    if (!target) return;
    const gain = donateItemToSect(target.name, itemN);
    setNote(gain > 0 ? `上交「${target.name}」×${itemN}，记贡献 ${gain} 点。` : "没能交上。");
  };
  const redeem = () => {
    if (!mayRedeem) return;
    const got = redeemContributionForStones(Number(redeemInput) || 0);
    setNote(got > 0 ? `以贡献兑得下品灵石 ${got}。` : "贡献不足，或身份还不够。");
  };

  return (
    <ScrollCard
      title="贡献与赏赐"
      subtitle={`现有贡献 ${contribution.toLocaleString()} · 身上灵石 ${stones.toLocaleString()}`}
      className="mt-4"
    >
      <p className="font-serif text-xs text-paper-400/50 mb-3 leading-relaxed">
        向门中上交灵石或物品，可记作贡献；内门弟子以上，也能拿贡献折成灵石花用。
      </p>

      {/* 上交灵石 */}
      <div className="rounded border border-paper-400/15 bg-ink-900/30 p-3 mb-3">
        <div className="font-brush text-sm text-paper-100 mb-1.5">上交灵石</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={stoneInput}
            onChange={(e) => setStoneInput(e.target.value.replace(/[^\d]/g, ""))}
            className="input-ink w-28 px-2 py-1 text-sm"
          />
          <span className="font-serif text-xs text-paper-400/60">
            每 {STONES_PER_CONTRIBUTION_IN} 块折 1 点
          </span>
          <SealButton variant="ghost" onClick={donateStones} className="px-3 py-1 text-xs">
            上交
          </SealButton>
        </div>
      </div>

      {/* 上交物品 */}
      <div className="rounded border border-paper-400/15 bg-ink-900/30 p-3 mb-3">
        <div className="font-brush text-sm text-paper-100 mb-1.5">上交物品</div>
        {inventory.length === 0 ? (
          <p className="font-serif text-xs text-paper-400/50">行囊里没什么可交的。</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={target?.name ?? ""}
              onChange={(e) => setItemName(e.target.value)}
              className="input-ink max-w-[16rem] px-2 py-1 text-sm"
            >
              {inventory.map((i) => (
                <option key={i.id} value={i.name}>
                  {i.name} · {i.grade} × {i.count}
                </option>
              ))}
            </select>
            <input
              value={itemCount}
              onChange={(e) => setItemCount(e.target.value.replace(/[^\d]/g, ""))}
              className="input-ink w-16 px-2 py-1 text-sm"
            />
            <span className="font-number text-xs text-cinnabar-400">
              折贡献 {contributionForItem(target?.grade) * itemN}
            </span>
            <SealButton variant="ghost" onClick={donateItem} className="px-3 py-1 text-xs">
              上交
            </SealButton>
          </div>
        )}
      </div>

      {/* 以贡献折领灵石 */}
      <div className="rounded border border-paper-400/15 bg-ink-900/30 p-3">
        <div className="font-brush text-sm text-paper-100 mb-1.5">以贡献折领灵石</div>
        {mayRedeem ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value.replace(/[^\d]/g, ""))}
              className="input-ink w-28 px-2 py-1 text-sm"
            />
            <span className="font-serif text-xs text-paper-400/60">
              1 点折 {STONES_PER_CONTRIBUTION_OUT} 块
            </span>
            <SealButton variant="ghost" onClick={redeem} className="px-3 py-1 text-xs">
              领取
            </SealButton>
          </div>
        ) : (
          <p className="font-serif text-xs text-paper-400/50">须内门弟子以上，方可以贡献折领灵石。</p>
        )}
      </div>

      {note && <p className="font-serif text-xs text-gold-400/80 pt-2">{note}</p>}
    </ScrollCard>
  );
}

function HeritageBoard() {
  const heritage = useGameStore((s) => Array.isArray(s.sect?.heritage) ? s.sect.heritage : []);
  const resources = useGameStore((s) => Array.isArray(s.sect?.resources) ? s.sect.resources : []);
  const positions = useGameStore((s) => Array.isArray(s.sect?.positions) ? s.sect.positions : []);
  const contribution = useGameStore((s) => s.sect?.contribution || 0);
  const sectLevel = useGameStore((s) => s.sect?.level || 1);
  const lastPreachDay = useGameStore((s) => s.sect?.lastPreachDay || 0);
  const currentTime = useGameStore((s) => s.currentTime);
  const sect = useGameStore((s) => s.sect);
  const player = useGameStore((s) => s.player);
  const learnHeritage = useGameStore((s) => s.learnHeritage);
  const preachScripture = useGameStore((s) => s.preachScripture);
  const narrateFacility = useAIStore((s) => s.narrateFacility);
  const hasModel = AI_BACKEND_READY;
  const [topic, setTopic] = useState(PREACH_TOPICS[0]);
  const [hint, setHint] = useState("");
  // 参悟与讲经各出一段自己的叙事，与问道那一路分开
  const [story, setStory] = useState("");
  const [writing, setWriting] = useState(false);

  /** 把刚做完的这一桩交给模型，照这一处建筑的场面写一段 */
  const writeStory = async (args: { building: string; kindName: string; deed: string; outcome: string }) => {
    setStory("");
    setWriting(true);
    try {
      const text = await narrateFacility({
        sect: sect?.name || "本门",
        surroundings: sect?.surroundings,
        appearance: sect?.appearance,
        nature: sect?.nature ? `${sect.nature.name}${sect.nature.note ? `——${sect.nature.note}` : ""}` : undefined,
        climate: sect?.climate ? `${sect.climate.name}${sect.climate.note ? `——${sect.climate.note}` : ""}` : undefined,
        feature: sect?.feature?.name,
        building: args.building,
        kindName: args.kindName,
        scene: facilityInfo(args.building).scene,
        deed: args.deed,
        outcome: args.outcome,
        playerName: player.name || "我",
        playerPosition: player.position || "",
        realmIndex: player.realmIndex ?? 0,
        hour: shichenName(currentTime.hour),
      });
      setStory(text);
    } catch (e) {
      setHint((e as Error)?.message || "这一段没写出来，稍后再试。");
    } finally {
      setWriting(false);
    }
  };

  // 眼下这份身份在第几级，能参多高品阶的传承、讲一场经换多少贡献都由它定
  const lv = positionLevel(positions);
  const preachGain = preachReward(lv, sectLevel);
  const preachedToday = lastPreachDay === daySerial(currentTime);

  /** 参一门传承：先落账，再请人写一段；账上不成的，缘由照实说 */
  const study = (name: string) => {
    if (!hasModel) {
      setHint("尚未配置通灵接口，参悟须交叙事来写，请先到设置里填上。");
      return;
    }
    if (!learnHeritage(name)) return;
    setHint("");
    writeStory({
      building: "藏书楼",
      kindName: "经阁",
      deed: `在藏书楼借了「${name}」的抄本，静坐参详这一门传承。`,
      outcome: `参得「${name}」，自此门中又多一门本事。`,
    });
  };

  /** 登座讲经：先挑定讲什么，再落账并交叙事 */
  const preach = () => {
    if (!hasModel) {
      setHint("尚未配置通灵接口，讲经须交叙事来写，请先到设置里填上。");
      return;
    }
    const r = preachScripture(topic);
    if (!r.ok) {
      setHint(r.message || "");
      return;
    }
    setHint("");
    writeStory({
      building: "讲经堂",
      kindName: "经阁",
      deed: r.decision || `在讲经堂登座，就「${topic}」讲了一场经。`,
      outcome: r.message || "",
    });
  };

  const STATUS_STYLE: Record<string, string> = {
    已习: "text-jade-400 border-jade-500/40 bg-jade-500/10",
    可习: "text-gold-400 border-gold-400/40 bg-gold-400/10",
    未达: "text-paper-500/50 border-paper-400/15 bg-ink-900/40",
  };

  const DEFAULT_STATUS = "text-paper-500/50 border-paper-400/15 bg-ink-900/40";

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* 藏经阁 */}
      <ScrollCard
        title="藏经阁"
        subtitle={`现任身份 ${lv} 级 · 现有贡献 ${contribution.toLocaleString()}`}
      >
        <p className="font-serif text-xs text-paper-400/50 mb-3 leading-relaxed">
          以贡献参悟阁中传承；能参到哪一品，还要看你在门中的身份等级。
        </p>
        <div className="space-y-2 max-h-[440px] overflow-y-auto pr-2">
          {heritage.map((h) => {
            const need = heritageRequirement(h.grade);
            const cost = heritageCost(h.grade);
            const learned = h.status === "已习";
            const allowed = lv >= need;
            const affordable = contribution >= cost;
            const canLearn = allowed && affordable;
            return (
              <div
                key={h.name}
                className="flex items-center gap-3 p-2.5 rounded border border-paper-400/10 bg-ink-900/30"
              >
                <div className="w-9 h-9 rounded bg-ink-900/60 flex items-center justify-center border border-paper-400/15">
                  <span className="font-brush text-sm text-gold-400/80">
                    {h.type?.charAt(0) || "?"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-brush text-sm text-paper-100">{h.name}</span>
                    <GradeTag grade={h.grade} />
                  </div>
                  <span className="font-serif text-xs text-paper-400/50">{h.type}</span>
                  {!learned && (
                    <div className="mt-0.5 font-number text-xs text-paper-400/60">
                      需 {need} 级身份 · {cost.toLocaleString()} 贡献
                    </div>
                  )}
                </div>
                {learned ? (
                  <span
                    className={cn(
                      "font-serif text-xs px-2 py-0.5 rounded border",
                      STATUS_STYLE[h.status] || DEFAULT_STATUS,
                    )}
                  >
                    {h.status}
                  </span>
                ) : (
                  <SealButton
                    onClick={() => study(h.name)}
                    disabled={!canLearn}
                    variant="ghost"
                    className="shrink-0 px-2 py-1 text-xs"
                  >
                    {!allowed ? "身份未达" : !affordable ? "贡献不足" : "参悟"}
                  </SealButton>
                )}
              </div>
            );
          })}
        </div>
      </ScrollCard>

      {/* 讲经堂：主动讲经，换一笔贡献 */}
      <ScrollCard title="讲经堂" subtitle="登座讲经，以法易功">
        <div className="space-y-3">
          <p className="font-serif text-sm text-paper-300/80 leading-relaxed">
            堂中弟子常候于此听讲。你若有心得，可登座讲一场经，门人听得入神，宗门便记你一功。
            身份越高、宗门越盛，一场讲经换得的贡献越多。
          </p>
          <div className="rounded border border-paper-400/10 bg-ink-900/30 p-3 space-y-2">
            <InfoRow label="现任身份" value={`${lv} 级`} />
            <InfoRow label="宗门等级" value={`Lv.${sectLevel}`} />
            <InfoRow label="一场可得" value={`贡献 +${preachGain}`} />
          </div>
          <div>
            <div className="mb-1.5 font-serif text-xs text-paper-400/50">讲什么</div>
            <div className="flex flex-wrap gap-1.5">
              {PREACH_TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className={cn(
                    "rounded border px-2 py-0.5 font-serif text-xs transition",
                    topic === t
                      ? "border-gold-400/70 bg-gold-400/15 text-gold-200"
                      : "border-paper-400/15 text-paper-300/80 hover:border-gold-500/40 hover:text-gold-300",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <SealButton
            onClick={preach}
            disabled={preachedToday}
            variant="ghost"
            className="w-full py-2 text-sm"
          >
            {preachedToday ? "今日已讲经一场" : "登座讲经"}
          </SealButton>
          <p className="font-serif text-xs text-paper-400/50 leading-relaxed">
            每日至多讲一场；须身处山门之内方才讲得。讲完这一段由叙事接着写。
          </p>
          {hint && (
            <p className="font-serif text-xs text-cinnabar-400 leading-relaxed">{hint}</p>
          )}
        </div>
      </ScrollCard>

      {/* 仓库库存 */}
      <ScrollCard title="宗门仓库" subtitle="公用物资储备">
        <div className="space-y-2 max-h-[440px] overflow-y-auto pr-2">
          {resources.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between p-2.5 rounded border border-paper-400/10 bg-ink-900/30"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-gradient-to-b from-gold-400/20 to-ink-dark/40 flex items-center justify-center border border-gold-500/20">
                  <span className="text-xs text-gold-400/80">材</span>
                </div>
                <span className="font-serif text-sm text-paper-200">{r.name}</span>
              </div>
              <div className="text-right">
                <span className="font-number text-sm text-gold-400">
                  {(r.amount ?? 0).toLocaleString()}
                </span>
                <span className="font-serif text-xs text-paper-400/50 ml-1">
                  {r.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollCard>

      {/* 刚在经阁里做下的这一桩，由人照那一处的场面写一段 */}
      {(writing || story) && (
        <ScrollCard
          title="经阁一段"
          subtitle="照藏书楼与讲经堂的光景写来"
          className="col-span-2"
        >
          {writing ? (
            <p className="font-serif text-xs text-gold-400/80">这一段正写着……</p>
          ) : (
            <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">
              {story}
            </div>
          )}
        </ScrollCard>
      )}
    </div>
  );
}
