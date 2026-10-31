import { useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { getScene } from "@/data/map";
import { positionLevel } from "@/data/sectLife";
import {
  FACILITY_LEVEL_CAP,
  facilityActions,
  facilityInfo,
  facilityStateOf,
  facilitySteward,
  facilityUpkeep,
  facilityYield,
  rollSectOpponent,
  studyableHeritage,
  upgradeCost,
} from "@/data/sectFacilities";
import type { FacilityAction, FacilityOption } from "@/data/sectFacilities";
import { daySerial, shichenName } from "@/lib/gameTime";
import { cn } from "@/lib/utils";
import { effectiveHpMax } from "@/lib/buffUtils";
import type { FacilityKindId } from "@/data/types";
import { X } from "lucide-react";
import { aiReady } from "@/data/backend";

type FacilityTab = "manage" | "act" | "story";

/** 建筑卡上「入内」之后开的三页：经营、交互、叙事 */
export function SectFacilityPanel({
  name,
  kindId,
  kindName,
  onClose,
}: {
  name: string;
  kindId: FacilityKindId;
  kindName: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<FacilityTab>("act");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** 上一桩成没成、怎么个说法 */
  const [note, setNote] = useState("");

  const sect = useGameStore((s) => s.sect);
  const player = useGameStore((s) => s.player);
  const relations = useGameStore((s) => s.relations);
  const beast = useGameStore((s) => s.beast);
  const mapSceneId = useGameStore((s) => s.mapSceneId);
  const currentTime = useGameStore((s) => s.currentTime);
  const sectSites = useGameStore((s) => s.sectSites);
  const upgradeFacility = useGameStore((s) => s.upgradeFacility);
  const performFacilityAction = useGameStore((s) => s.performFacilityAction);
  const setCraftingTab = useGameStore((s) => s.setCraftingTab);

  const narrateFacility = useAIStore((s) => s.narrateFacility);
  const openCrafting = useAIStore((s) => s.openCrafting);
  const startBattle = useAIStore((s) => s.startBattle);
  const openNPCChat = useAIStore((s) => s.openNPCChat);

  // 这一处建筑的叙事自成一格：不借问道那一路，也不与别处的掺在一处
  const [narration, setNarration] = useState("");
  const [writing, setWriting] = useState(false);
  const [storyErr, setStoryErr] = useState("");

  const scene = getScene(mapSceneId);
  const state = facilityStateOf(sect?.facilities, name);
  // 自拟建筑另存的一份账：给了便照它自己的算
  const custom = sectSites.find((s) => s.mine)?.custom?.[name];
  const info = facilityInfo(name, kindId, custom);
  const steward = facilitySteward(sect?.management?.halls, kindId);
  const today = daySerial(currentTime);
  const done = sect?.facilityDaily ?? {};
  const lv = positionLevel(sect?.positions);
  const cap = state.level >= FACILITY_LEVEL_CAP;
  const hasModel = useAIStore((s) => aiReady(s.settings));

  const yieldNow = facilityYield({
    name,
    kindId,
    level: state.level,
    status: state.status,
    hasSteward: !!steward,
    nature: scene?.sectNature,
    isFeature: scene?.sectFeature === name,
    custom,
  });
  const cost = upgradeCost({ name, kindId, level: state.level, nature: scene?.sectNature, custom });
  const upkeep = facilityUpkeep(name, kindId, state.level, custom);

  /** 门里可约的同门；一个都没记着，便给一位无名同门顶上 */
  const peers = useMemo(() => {
    const sectName = sect?.name || "";
    const list = (Array.isArray(relations) ? relations : [])
      .filter((r) => {
        if (!r?.name) return false;
        const affiliation = r.affiliation || "";
        return (sectName && affiliation.includes(sectName)) || /同门|师兄|师弟|师姐|师妹/.test(r.title || "");
      })
      .map((r) => ({ name: r.name, note: r.note || r.title }));
    return list.length > 0 ? list : [{ name: "门中同门", note: "与你同在门中学艺的一位，身手与你相仿。" }];
  }, [relations, sect?.name]);

  /** 本门这一座建筑里等着交差的人：任务把他钉在此处，期限未过便还候着 */
  const hereLabel = `${sect?.name || "本门"}·${name}`;
  const waiting = useMemo(
    () =>
      (Array.isArray(relations) ? relations : []).filter(
        (r) => r.location === hereLabel && (r.fixedUntilDay === undefined || r.fixedUntilDay >= today),
      ),
    [relations, hereLabel, today],
  );

  /** 一桩事要挑的那几项：写死的取 options，现算的照本门情形现拼 */
  const optionsOf = (action: FacilityAction): FacilityOption[] => {
    if (action.optionSource === "heritage") {
      return studyableHeritage(sect?.heritage).map((h) => ({ label: `${h.name}（${h.grade}）`, value: h.name }));
    }
    if (action.optionSource === "heritageAll") {
      return (Array.isArray(sect?.heritage) ? sect.heritage : []).map((h) => ({
        label: `${h.name}（${h.grade}${h.status === "已习" ? "·已习" : ""}）`,
        value: h.name,
      }));
    }
    if (action.optionSource === "peers") {
      return peers.map((p) => ({ label: p.name, value: p.name, hint: p.note }));
    }
    return action.options ?? [];
  };

  /** 比试：把阵摆好交给决战那套 */
  const beginBattle = (action: FacilityAction, optionValue: string) => {
    // 约的是谁便打谁，不另掷一个
    const called = action.battle === "peer" ? peers.filter((p) => p.name === optionValue) : undefined;
    const opponent = rollSectOpponent({
      kind: action.battle === "peer" ? "peer" : "random",
      realmIndex: player?.realmIndex ?? 0,
      peers: called && called.length > 0 ? called : undefined,
    });
    const together = optionValue === "together";
    const companions = together ? (Array.isArray(relations) ? relations.filter((r) => r.traveling) : []) : [];
    // 内伤一类状态压低了此刻的气血上限
    const maxHp = effectiveHpMax(player);
    startBattle({
      width: 10,
      height: 10,
      entities: [
        {
          id: "player",
          name: player?.name || "玩家",
          type: "player",
          position: { x: 5, y: 5 },
          hp: Math.min(Number(player?.hp) || 0, maxHp),
          maxHp,
          mp: player?.mp,
          maxMp: player?.mpMax,
        },
        ...(together && beast
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
        {
          id: "enemy",
          name: opponent.name,
          type: "enemy",
          position: { x: 7, y: 5 },
          hp: opponent.hp,
          maxHp: opponent.hpMax,
          mp: opponent.mp,
          maxMp: opponent.mpMax,
        },
      ],
    });
  };

  /** 动手：先落账，再把这一桩交给叙事；炼丹画符与比试则交给各自的模块 */
  const submit = async (action: FacilityAction) => {
    const option = chosen[action.id];
    if (!option || busy) return;
    setBusy(true);
    try {
      const r = performFacilityAction(name, kindId, action.id, option);
      setNote(r.message || "");
      if (!r.ok) return;

      if (action.mode === "craft") {
        setCraftingTab(action.craft === "talisman" ? "talisman" : "alchemy");
        openCrafting();
        return;
      }
      if (action.mode === "battle") {
        beginBattle(action, option);
        // 建筑面板压得比问道窗口高，不收起便遮着刚摆开的阵势
        onClose();
        return;
      }

      // 事办成了，再请人把这一段写出来；写的是这一处建筑自己的场面
      const label = optionsOf(action).find((o) => o.value === option)?.label ?? option;
      setTab("story");
      setNarration("");
      setStoryErr("");
      setWriting(true);
      try {
        const text = await narrateFacility({
          sect: sect?.name || "本门",
          surroundings: sect?.surroundings,
          appearance: sect?.appearance,
          culture: scene?.culture,
          nature: sect?.nature ? `${sect.nature.name}${sect.nature.note ? `——${sect.nature.note}` : ""}` : undefined,
          climate: sect?.climate ? `${sect.climate.name}${sect.climate.note ? `——${sect.climate.note}` : ""}` : undefined,
          feature: scene?.sectFeature,
          building: name,
          kindName,
          scene: info.scene,
          deed: r.decision || `在${name}${action.name}，${action.optionLabel}是「${label}」。`,
          outcome: r.message || "",
          playerName: player?.name || "我",
          playerPosition: player?.position || "",
          realmIndex: player?.realmIndex ?? 0,
          hour: shichenName(currentTime.hour),
        });
        setNarration(text);
      } catch (e) {
        setStoryErr((e as Error)?.message || "这一段没写出来，稍后再试。");
      } finally {
        setWriting(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const TABS: { id: FacilityTab; label: string }[] = [
    { id: "act", label: "交互" },
    { id: "manage", label: "经营" },
    { id: "story", label: "叙事" },
  ];

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-ink-950/70 px-4"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded border border-gold-500/40 bg-ink-900/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 抬头 */}
        <div className="flex items-start justify-between border-b border-gold-500/20 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-brush text-xl text-paper-50">{name}</span>
              <span className="font-serif text-xs text-paper-400/60">{kindName}</span>
              <span className="font-number text-xs text-gold-400">Lv.{state.level}</span>
              {state.status !== "正常" && (
                <span className="font-serif text-xs text-cinnabar-400">{state.status}</span>
              )}
            </div>
            <div className="mt-1 font-serif text-xs text-paper-400/60">
              管事：{steward || "无主，产出打折"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-paper-400/60 transition hover:bg-ink-800 hover:text-paper-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* 三页签 */}
        <div className="flex gap-1 border-b border-gold-500/15 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 font-brush text-sm tracking-wider transition",
                tab === t.id
                  ? "border-gold-400 text-gold-400"
                  : "border-transparent text-paper-400/60 hover:text-paper-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          {!hasModel && (
            <div className="mb-4 rounded border border-cinnabar-500/40 bg-cinnabar-500/10 px-3 py-2 font-serif text-xs leading-relaxed text-cinnabar-300">
              尚未配置通灵接口。门中的事都要交给叙事来写，请先到设置里填上接口，再动手。
            </div>
          )}

          {tab === "act" && (
            <div className="space-y-4">
              {note && (
                <div className="rounded border border-gold-500/25 bg-ink-900/50 px-3 py-2 font-serif text-xs leading-relaxed text-paper-300">
                  {note}
                </div>
              )}
              {waiting.length > 0 && (
                <div className="rounded border border-gold-500/35 bg-gold-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-brush text-base text-gold-300">此处候着的人</span>
                    <span className="font-serif text-[11px] text-paper-400/50">你手头的事要在这一处了结</span>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {waiting.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-brush text-sm text-paper-100">{r.name}</span>
                            <span className="font-serif text-xs text-gold-400/70">「{r.title}」</span>
                          </div>
                          {r.persona && (
                            <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-paper-300/70">
                              {r.persona}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!hasModel}
                          onClick={() => openNPCChat(r.id)}
                          className={cn(
                            "shrink-0 rounded border px-3 py-1 font-serif text-xs transition",
                            hasModel
                              ? "border-jade-400/50 bg-jade-500/20 text-jade-200 hover:bg-jade-500/30"
                              : "border-paper-400/15 text-paper-400/40",
                          )}
                        >
                          上前交谈
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {facilityActions(name, kindId, custom).map((action) => {
                const opts = optionsOf(action);
                const locked = (action.need ?? 1) > lv;
                const used = action.daily && done[`${name}:${action.id}`] === today;
                const picked = chosen[action.id];
                const disabled = !hasModel || locked || used || !picked || busy || opts.length === 0;
                return (
                  <div key={action.id} className="rounded border border-paper-400/10 bg-ink-900/30 p-3">
                    <div className="font-brush text-base text-paper-100">{action.name}</div>
                    <div className="mt-1 font-serif text-xs text-paper-400/60">{action.desc}</div>

                    <div className="mt-2 font-serif text-xs text-paper-400/50">
                      {action.optionLabel}
                      {opts.length === 0 && <span className="ml-1 text-cinnabar-400">（眼下没得挑）</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {opts.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          title={o.hint}
                          onClick={() => setChosen((c) => ({ ...c, [action.id]: o.value }))}
                          className={cn(
                            "rounded border px-2 py-0.5 font-serif text-xs transition",
                            picked === o.value
                              ? "border-gold-400/70 bg-gold-400/15 text-gold-200"
                              : "border-paper-400/15 text-paper-300/80 hover:border-gold-500/40 hover:text-gold-300",
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="font-serif text-xs text-paper-400/40">
                        {action.mode === "craft"
                          ? "动手后开百艺窗口"
                          : action.mode === "battle"
                            ? "动手后摆开阵势"
                            : "动手后由叙事接着写"}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => submit(action)}
                        className={cn(
                          "rounded border px-3 py-1 font-serif text-xs transition",
                          disabled
                            ? "border-paper-400/15 text-paper-400/40"
                            : "border-jade-400/50 bg-jade-500/20 text-jade-200 hover:bg-jade-500/30",
                        )}
                      >
                        {locked
                          ? `需身份 ${action.need} 级`
                          : used
                            ? "今日已做"
                            : !hasModel
                              ? "须先配置模型"
                              : busy
                                ? "……"
                                : "动手"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "manage" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 font-serif text-xs text-paper-400/50">每日产出</div>
                {yieldNow.materials.length === 0 && yieldNow.stone === 0 && yieldNow.reputation === 0 ? (
                  <p className="font-serif text-xs text-paper-400/50">此处不生财货，产出的是人与功夫。</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {yieldNow.materials.map((m) => (
                      <span key={m.name} className="rounded border border-jade-500/30 bg-jade-500/10 px-2 py-0.5 font-serif text-xs text-jade-300">
                        {m.name} +{m.amount}
                      </span>
                    ))}
                    {yieldNow.stone > 0 && (
                      <span className="rounded border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 font-serif text-xs text-gold-300">
                        灵石 +{yieldNow.stone}
                      </span>
                    )}
                    {yieldNow.reputation > 0 && (
                      <span className="rounded border border-paper-400/25 bg-ink-800/60 px-2 py-0.5 font-serif text-xs text-paper-200">
                        声望 +{yieldNow.reputation}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-paper-400/10 pt-3">
                <span className="font-serif text-xs text-paper-400/50">每日维护</span>
                <span className="font-number text-xs text-cinnabar-400">{upkeep} 灵石</span>
              </div>

              <p className="font-serif text-xs leading-relaxed text-paper-400/60">{info.note}</p>

              <div className="border-t border-paper-400/10 pt-3">
                {cap ? (
                  <p className="font-serif text-xs text-gold-400/80">已至满级 Lv.{FACILITY_LEVEL_CAP}。</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="font-serif text-xs text-paper-400/70">
                      升到 Lv.{state.level + 1}：灵石 {cost.stones}
                      {cost.materials.map((m) => `、${m.name} ${m.amount}`).join("")}
                    </div>
                    <button
                      type="button"
                      onClick={() => upgradeFacility(name, kindId)}
                      className="rounded border border-gold-500/50 bg-gold-500/20 px-3 py-1 font-serif text-xs text-gold-200 transition hover:bg-gold-500/30"
                    >
                      修缮扩建
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "story" && (
            <div className="space-y-3">
              <div className="font-serif text-xs text-paper-400/50">
                写的是「{name}」这一处的光景，与问道那一路各不相干。
              </div>
              {writing && <p className="font-serif text-xs text-gold-400/80">这一段正写着……</p>}
              {narration ? (
                <div className="whitespace-pre-wrap rounded border border-paper-400/10 bg-ink-950/60 p-3 font-serif text-sm leading-relaxed text-paper-200">
                  {narration}
                </div>
              ) : (
                !writing && (
                  <p className="font-serif text-xs text-paper-400/50">
                    还没有可看的一段。到「交互」页挑一桩事做，叙事便从这一处写起。
                  </p>
                )
              )}
              {storyErr && <p className="font-serif text-xs text-cinnabar-400">{storyErr}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
