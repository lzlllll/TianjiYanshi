import { useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { getScene, sectSceneId } from "@/data/map";
import { ACTIVITY_COST, ACTIVITY_SPECS, activityOpen } from "@/data/sectLife";
import { facilityLedger, industryOf } from "@/data/sectFacilities";
import { daySerial, shichenName } from "@/lib/gameTime";
import type { SectActivity, SectHall } from "@/data/types";
import { Building2, Target, Users, Coins } from "lucide-react";
import { aiReady } from "@/data/backend";

type ManagementTab = "industries" | "activities" | "halls" | "treasury";

const ACTIVITY_TYPES: SectActivity["type"][] = ["大比", "试炼", "庆典", "祭祀", "远征"];

export function SectManagement() {
  const sect = useGameStore((s) => s.sect);
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  const player = useGameStore((s) => s.player);

  const isLeader = player.position === "掌门" || player.position === "副掌门" || isDeveloperMode;

  const [tab, setTab] = useState<ManagementTab>("industries");

  const TABS: { id: ManagementTab; label: string; icon: React.ReactNode }[] = [
    { id: "industries", label: "宗门产业", icon: <Building2 size={14} /> },
    { id: "activities", label: "宗门活动", icon: <Target size={14} /> },
    { id: "halls", label: "各堂信息", icon: <Users size={14} /> },
    { id: "treasury", label: "物资管理", icon: <Coins size={14} /> },
  ];

  if (!isLeader) {
    return (
      <ScrollCard title="宗门管理" subtitle="权限不足">
        <div className="text-center py-12">
          <p className="font-serif text-sm text-paper-400/60">
            只有宗门高层方可查看宗门管理详情。
          </p>
          <p className="font-serif text-xs text-paper-400/40 mt-2">
            当前职位：{player.position || "普通弟子"}
          </p>
        </div>
      </ScrollCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gold-500/20">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-5 py-2 font-brush text-base tracking-wider transition-all border-b-2 -mb-px flex items-center gap-2",
              tab === t.id
                ? "text-gold-400 border-gold-400"
                : "text-paper-400/60 border-transparent hover:text-paper-200",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "industries" && <IndustryPanel />}
        {tab === "activities" && <ActivityPanel />}
        {tab === "halls" && <HallsPanel />}
        {tab === "treasury" && <TreasuryPanel />}
      </div>
    </div>
  );
}

/** 本门眼下立着的各座建筑，连同各自的账；产业一页与堂口一页共用这一份 */
function useFacilityLedger() {
  const sect = useGameStore((s) => s.sect);
  const sectSites = useGameStore((s) => s.sectSites);
  // 台账说的是本门自己的山门，与玩家眼下站在哪张图上无关
  const mine = sectSites.find((s) => s.mine);
  const scene = mine ? getScene(sectSceneId(mine.id)) : undefined;
  return useMemo(
    () =>
      facilityLedger({
        scene,
        facilities: sect.facilities,
        custom: mine?.custom,
        built: mine?.built,
        halls: sect.management?.halls,
      }),
    [scene, sect.facilities, mine?.custom, mine?.built, sect.management?.halls],
  );
}

function IndustryPanel() {
  const ledger = useFacilityLedger();
  const sect = useGameStore((s) => s.sect);
  const mapSceneId = useGameStore((s) => s.mapSceneId);
  const upgradeFacility = useGameStore((s) => s.upgradeFacility);
  const toggleFacilityStatus = useGameStore((s) => s.toggleFacilityStatus);
  const [note, setNote] = useState("");

  const inSect = getScene(mapSceneId)?.kind === "sect";
  const industries = ledger.map(industryOf);

  // 全门合计：日产折成灵石与常料各报一行，维护另计
  const dailyStone = ledger.reduce((sum, e) => sum + e.yieldNow.stone, 0);
  const dailyUpkeep = ledger.reduce((sum, e) => sum + e.upkeep, 0);
  const materialTotals = new Map<string, number>();
  ledger.forEach((e) =>
    e.yieldNow.materials.forEach((m) => materialTotals.set(m.name, (materialTotals.get(m.name) ?? 0) + m.amount)),
  );

  return (
    <div className="space-y-3">
      <ScrollCard title="宗门产业" subtitle="各处营生，日产与修缮">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[...materialTotals.entries()].map(([name, amount]) => (
            <span
              key={name}
              className="rounded border border-jade-500/30 bg-jade-500/10 px-2 py-0.5 font-serif text-xs text-jade-300"
            >
              {name} +{amount}/日
            </span>
          ))}
          {dailyStone > 0 && (
            <span className="rounded border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 font-serif text-xs text-gold-300">
              灵石 +{dailyStone}/日
            </span>
          )}
          <span className="rounded border border-cinnabar-500/30 bg-cinnabar-500/10 px-2 py-0.5 font-serif text-xs text-cinnabar-300">
            维护 −{dailyUpkeep}/日
          </span>
        </div>

        {!inSect && (
          <p className="mb-3 font-serif text-xs text-cinnabar-400/80 leading-relaxed">
            人不在山门之内，土木动不得；扩建与停工须回了山门再做。
          </p>
        )}
        {note && <p className="mb-3 font-serif text-xs text-gold-400/85 leading-relaxed">{note}</p>}

        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {industries.length === 0 && (
            <p className="font-serif text-xs text-paper-400/50 py-2">
              账上还没有产业。回山门里起几座建筑，这里便有了进项。
            </p>
          )}
          {industries.map((ind) => {
            const stopped = ind.status === "停用";
            const repairing = ind.status === "修缮中";
            const entry = ledger.find((e) => e.cellIndex === ind.cellIndex && e.name === ind.name);
            return (
              <div key={ind.id} className="rounded border border-paper-400/10 bg-ink-900/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-brush text-base text-paper-100">{ind.name}</span>
                      <span className="font-number text-xs text-gold-400">Lv.{ind.level}</span>
                      {stopped && <span className="font-serif text-xs text-cinnabar-400">已停工</span>}
                      {repairing && <span className="font-serif text-xs text-cinnabar-400/80">修缮中</span>}
                      {entry?.steward ? (
                        <span className="font-serif text-[11px] text-jade-400/70">管事 {entry.steward}</span>
                      ) : (
                        <span className="font-serif text-[11px] text-cinnabar-400/70">无主，产出折半</span>
                      )}
                    </div>
                    <div className="mt-1 font-serif text-xs text-jade-400/90">{ind.production}</div>
                    <p className="mt-1 font-serif text-[11px] text-paper-400/55 leading-relaxed">
                      {ind.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-number text-xs text-paper-400/60">
                      维护 {(entry?.upkeep ?? 0).toLocaleString()}
                    </div>
                    <div className="font-number text-[11px] text-paper-400/40">
                      已投入 {ind.investment.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <SealButton
                    variant="ghost"
                    className="px-3 py-1 text-xs"
                    disabled={!inSect || ind.level >= 5}
                    onClick={() => {
                      const ok = upgradeFacility(ind.name, ind.kindId!);
                      setNote(
                        ok
                          ? `「${ind.name}」修葺扩建，如今是 Lv.${ind.level + 1}。`
                          : `「${ind.name}」这一回没能扩建，缘由记在见闻里。`,
                      );
                    }}
                  >
                    {ind.level >= 5 ? "已至满级" : `扩建（${(entry?.upgrade.stones ?? 0).toLocaleString()} 灵石）`}
                  </SealButton>
                  <SealButton
                    variant="ghost"
                    className="px-3 py-1 text-xs"
                    disabled={!inSect}
                    onClick={() => {
                      const r = toggleFacilityStatus(ind.name, ind.kindId!);
                      setNote(r.message || "");
                    }}
                  >
                    {stopped ? "复工" : "停工"}
                  </SealButton>
                  {repairing && (
                    <span className="font-serif text-[11px] text-paper-400/50">
                      修缮期间产出减半，过些日子自会修好。
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollCard>
    </div>
  );
}

function ActivityPanel() {
  const sect = useGameStore((s) => s.sect);
  const player = useGameStore((s) => s.player);
  const currentTime = useGameStore((s) => s.currentTime);
  const mapSceneId = useGameStore((s) => s.mapSceneId);
  const sectSites = useGameStore((s) => s.sectSites);
  const startSectActivity = useGameStore((s) => s.startSectActivity);
  const joinSectActivity = useGameStore((s) => s.joinSectActivity);
  const narrateFacility = useAIStore((s) => s.narrateFacility);
  const hasModel = useAIStore((s) => aiReady(s.settings));

  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const [story, setStory] = useState("");

  const activities = Array.isArray(sect?.management?.activities) ? sect.management.activities : [];
  const treasury = sect?.management?.treasury;
  const stones = Number(treasury?.spiritStones) || 0;
  const today = daySerial(currentTime);
  const live = activities.find((a) => activityOpen(a, today) || (a.status === "进行中" && (a.endDay ?? 0) >= today));

  /** 参与一场：先落账，再把这一段交给叙事来写 */
  const join = async (act: SectActivity) => {
    const r = joinSectActivity(act.id);
    setNote(r.message || "");
    if (!r.ok) return;
    setStory("");
    if (!hasModel) return;
    setWriting(true);
    try {
      const scene = getScene(mapSceneId);
      const mine = sectSites.find((s) => s.mine);
      const text = await narrateFacility({
        sect: sect?.name || "本门",
        surroundings: sect?.surroundings,
        appearance: sect?.appearance,
        culture: scene?.culture,
        nature: sect?.nature ? `${sect.nature.name}${sect.nature.note ? `——${sect.nature.note}` : ""}` : undefined,
        climate: sect?.climate ? `${sect.climate.name}${sect.climate.note ? `——${sect.climate.note}` : ""}` : undefined,
        feature: scene?.sectFeature,
        building: act.name,
        kindName: act.type,
        scene: mine?.seat ? `${mine.seat}一带，门中正办${act.name}。${act.description}` : act.description,
        deed: r.decision || `我在门中「${act.name}」上出了一份力。`,
        outcome: r.message || "",
        playerName: player?.name || "我",
        playerPosition: player?.position || "",
        realmIndex: player?.realmIndex ?? 0,
        hour: shichenName(currentTime.hour),
      });
      setStory(text);
    } catch (e) {
      setNote((e as Error)?.message || "这一段没写出来，稍后再试。");
    } finally {
      setWriting(false);
    }
  };

  return (
    <ScrollCard title="宗门活动" subtitle="凝心聚力，共襄盛举">
      <div className="mb-3 rounded border border-paper-400/10 bg-ink-900/30 p-3">
        <div className="font-brush text-sm text-paper-100 mb-1.5">发起一场</div>
        <p className="font-serif text-xs text-paper-400/55 leading-relaxed mb-2">
          门中大事须长老以上方能发起，从宝库支一笔灵石张罗，办三日；一场未了不另起一场。
          眼下宝库有 {stones.toLocaleString()} 灵石。
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITY_TYPES.map((type) => {
            const spec = ACTIVITY_SPECS[type];
            const cost = ACTIVITY_COST[type];
            return (
              <button
                key={type}
                type="button"
                title={`${spec.desc}（${spec.reward}）`}
                disabled={!!live || stones < cost}
                onClick={() => {
                  const r = startSectActivity(type);
                  setNote(r.message || "");
                }}
                className={cn(
                  "rounded border px-2 py-1 font-serif text-xs transition",
                  !!live || stones < cost
                    ? "border-paper-400/15 text-paper-500/50"
                    : "border-gold-500/40 text-paper-200 hover:border-gold-400 hover:text-gold-300",
                )}
              >
                {spec.name}
                <span className="ml-1 font-number text-[11px] text-gold-400/70">{cost}</span>
              </button>
            );
          })}
        </div>
        {live && (
          <p className="mt-2 font-serif text-[11px] text-gold-400/70">
            「{live.name}」正办着，至第 {live.endDay ?? 0} 日收场。
          </p>
        )}
      </div>

      {note && <p className="mb-3 font-serif text-xs text-gold-400/85 leading-relaxed">{note}</p>}

      <div className="space-y-2">
        {activities.length === 0 && (
          <p className="font-serif text-xs text-paper-400/50 py-2">
            门中还没有办过活动。挑起一场，门人便有事可做。
          </p>
        )}
        {activities.map((act) => {
          const open = activityOpen(act, today);
          const joinedToday = act.lastJoinDay === today;
          const ended = act.status === "已结束" || (typeof act.endDay === "number" && today > act.endDay);
          const spec = ACTIVITY_SPECS[act.type];
          return (
            <div
              key={act.id}
              className={cn(
                "rounded border p-3",
                ended ? "border-paper-400/10 bg-ink-900/20 opacity-70" : "border-paper-400/10 bg-ink-900/30",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-brush text-base text-paper-100 truncate">{act.name}</span>
                  <span className="shrink-0 rounded border border-gold-500/30 px-1.5 py-0.5 font-serif text-[11px] text-gold-400/80">
                    {act.type}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 font-serif text-[11px]",
                      ended
                        ? "border-paper-400/15 text-paper-500/50"
                        : "border-jade-500/30 text-jade-400",
                    )}
                  >
                    {ended ? "已结束" : act.status}
                  </span>
                </div>
                {!ended && (
                  <SealButton
                    variant="ghost"
                    className="shrink-0 px-3 py-1 text-xs"
                    disabled={!open || joinedToday}
                    onClick={() => void join(act)}
                  >
                    {joinedToday ? "今日已参与" : open ? "参与" : "已收场"}
                  </SealButton>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 font-serif text-xs text-paper-300/75">
                <Target size={12} className="text-paper-400/50" />
                目标：{act.target}
              </div>
              <p className="mt-1 font-serif text-xs text-paper-400/60 leading-relaxed">{act.description}</p>
              <p className="mt-1 font-serif text-[11px] text-paper-400/45">
                彩头：{spec?.reward ?? "门中记功"}
                {act.cost ? ` · 筹办耗灵石 ${act.cost}` : ""}
                {act.endDay ? ` · 至第 ${act.endDay} 日` : ""}
              </p>
            </div>
          );
        })}
      </div>

      {(writing || story) && (
        <div className="mt-3 rounded border border-paper-400/10 bg-ink-950/60 p-3">
          {writing ? (
            <p className="font-serif text-xs text-gold-400/80">这一段正写着……</p>
          ) : (
            <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-paper-200">{story}</div>
          )}
        </div>
      )}
    </ScrollCard>
  );
}

function HallsPanel() {
  const sect = useGameStore((s) => s.sect);
  const player = useGameStore((s) => s.player);
  const relations = useGameStore((s) => s.relations);
  const ledger = useFacilityLedger();
  const appointHallMaster = useGameStore((s) => s.appointHallMaster);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const halls = Array.isArray(sect?.management?.halls) ? sect.management.halls : [];
  // 可当堂主的人：自己，以及本门认得、没在路上的门人
  const candidates = [
    ...(player?.name ? [{ id: "self", name: player.name, realm: "本门掌门" }] : []),
    ...(Array.isArray(relations) ? relations : [])
      .filter((r) => !!r?.name && r.name !== player?.name && r.affiliation && r.affiliation.includes(sect?.name || ""))
      .map((r) => ({ id: r.id, name: r.name, realm: r.realm })),
  ];

  return (
    <ScrollCard title="各堂信息" subtitle="各司其职，共护宗门">
      <p className="mb-3 font-serif text-xs text-paper-400/55 leading-relaxed">
        门中立着哪几类建筑，便编哪几堂；有堂主的堂口，辖下建筑产出照常，缺堂主的照折四成。
        点「定」即可任免，只认尘缘里认得、且属本门的人。
      </p>
      {note && <p className="mb-3 font-serif text-xs text-gold-400/85 leading-relaxed">{note}</p>}
      <div className="grid grid-cols-2 gap-3">
        {halls.map((hall: SectHall) => {
          const vacant = !hall.master || hall.master === "空缺";
          const covered = ledger.filter((e) => (hall.kindIds ?? []).includes(e.kindId));
          const kindNames = [...new Set(covered.map((e) => e.kindName))];
          return (
            <div key={hall.id} className="p-3 rounded border border-paper-400/10 bg-ink-900/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-brush text-base text-paper-100">{hall.name}</span>
                <span className="font-number text-xs text-gold-400/80">
                  {hall.memberCount}/{hall.maxMembers}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-xs text-paper-400/50">堂主</span>
                  <span className={cn("font-serif text-xs", vacant ? "text-cinnabar-400" : "text-paper-200")}>
                    {hall.master}
                    {!vacant && <span className="text-paper-400/60">（{hall.masterRealm}）</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-xs text-paper-400/50">当前任务</span>
                  <span className="font-serif text-xs text-jade-400">{hall.currentTask}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="shrink-0 font-serif text-xs text-paper-400/50">辖下</span>
                  <span className="text-right font-serif text-xs text-paper-300/80">
                    {kindNames.length > 0 ? kindNames.join("、") : "—"}
                  </span>
                </div>
              </div>
              <p className="font-serif text-xs text-paper-400/50 mt-2 leading-relaxed">{hall.description}</p>

              <div className="mt-2 flex items-center gap-1.5">
                <select
                  value={picked[hall.id] ?? (vacant ? "" : hall.master)}
                  onChange={(e) => setPicked((p) => ({ ...p, [hall.id]: e.target.value }))}
                  className="min-w-0 flex-1 rounded border border-paper-400/20 bg-ink-900/60 px-2 py-1 font-serif text-xs text-paper-200 outline-none focus:border-gold-500"
                >
                  <option value="">（空缺）</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                      {c.realm ? ` · ${c.realm}` : ""}
                    </option>
                  ))}
                </select>
                <SealButton
                  variant="ghost"
                  className="shrink-0 px-2.5 py-1 text-xs"
                  onClick={() => {
                    const want = picked[hall.id] ?? (vacant ? "" : hall.master);
                    const r = appointHallMaster(hall.id, want);
                    setNote(r.message || "");
                  }}
                >
                  定
                </SealButton>
              </div>
            </div>
          );
        })}
      </div>
      {halls.length === 0 && (
        <p className="font-serif text-xs text-paper-400/50 py-2">
          门中尚未编堂。回山门里起几座建筑，各堂便照建筑编出来。
        </p>
      )}
    </ScrollCard>
  );
}

function TreasuryPanel() {
  const sect = useGameStore((s) => s.sect);
  const treasury = sect?.management?.treasury;
  const consumption = sect?.management?.consumption ?? { dailyCost: 0, recentConsumption: [] };
  const materials = Array.isArray(treasury?.materials) ? treasury!.materials : [];
  const items = Array.isArray(treasury?.items) ? treasury!.items : [];
  const stones = Number(treasury?.spiritStones) || 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      <ScrollCard title="宗门宝库" subtitle="灵石储备">
        <div className="text-center py-6">
          <div className="font-number text-4xl text-gold-400 mb-2">{stones.toLocaleString()}</div>
          <div className="font-serif text-xs text-paper-400/60">下品灵石</div>
          <div className="mt-4 pt-4 border-t border-paper-400/10">
            <div className="flex items-center justify-between mb-1">
              <span className="font-serif text-xs text-paper-400/50">日消耗</span>
              <span className="font-number text-xs text-cinnabar-400">
                {(consumption.dailyCost ?? 0).toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 bg-ink-900/80 rounded-sm overflow-hidden">
              <div
                className="h-full bg-cinnabar-500"
                style={{ width: `${Math.min(100, ((consumption.dailyCost ?? 0) / 5000) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </ScrollCard>

      <ScrollCard title="成件之物" subtitle="弟子按月上交，商店由此支取">
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {items.length === 0 ? (
            <p className="font-serif text-xs text-paper-400/50 py-2">库里没有成件的东西。</p>
          ) : (
            items.filter((i) => i && i.name).map((it) => (
              <div key={it.name} className="flex items-center justify-between p-2 rounded bg-ink-900/20">
                <span className="font-serif text-xs text-paper-300">
                  {it.name}
                  <span className="ml-1 text-paper-400/50">{it.type}</span>
                </span>
                <span className="font-number text-xs text-jade-400">×{it.count}</span>
              </div>
            ))
          )}
        </div>
      </ScrollCard>

      <ScrollCard title="物资库存" subtitle="各类材料储备">
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {(Array.isArray(materials) ? materials : []).map((mat) => (
            <div key={mat.name} className="flex items-center justify-between p-2 rounded bg-ink-900/20">
              <span className="font-serif text-xs text-paper-300">{mat.name}</span>
              <span className="font-number text-xs text-jade-400">{(mat.amount ?? 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </ScrollCard>

      <ScrollCard title="消耗记录" subtitle="近期开支" className="col-span-2">
        <div className="flex items-end gap-2 h-32">
          {(Array.isArray(consumption.recentConsumption) ? consumption.recentConsumption : []).map((item) => (
            <div key={item.date} className="flex-1 flex flex-col items-center">
              <span className="font-number text-xs text-paper-400/70 mb-1">{item.cost}</span>
              <div className="w-full bg-cinnabar-500/30 rounded-t" style={{ height: `${(item.cost / 3000) * 100}%` }} />
              <span className="font-serif text-xs text-paper-400/40 mt-1">{item.date}</span>
            </div>
          ))}
        </div>
      </ScrollCard>
    </div>
  );
}
