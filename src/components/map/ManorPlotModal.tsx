import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { lowStonesWorth } from "@/data/spiritStones";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { HOURS_PER_DAY } from "@/data/rooms";
import { RENT_TENANT_KINDS } from "@/data/estates";
import { getMarker } from "@/data/map";
import {
  FUNCTION_INFO,
  MANOR_FUNCTIONS,
  MANOR_GRID,
  MANOR_SHAPES,
  SHAPE_COST,
  convertCost,
  demolishRefund,
  manorBonuses,
  manorFunctionAllowed,
  manorRentIncome,
  restRatio,
  rentedRooms,
  upgradeCost,
} from "@/data/manors";
import type { ManorActionId, ManorFunction, ManorPlot } from "@/data/types";
import {
  Archive,
  BookOpen,
  Brain,
  Coffee,
  Coins,
  Flame,
  Hammer,
  Home,
  Loader2,
  Package,
  PawPrint,
  Sparkles,
  Swords,
  Wrench,
  X,
} from "lucide-react";

/** 打坐、参悟、演练、研读可选的时辰 */
const HOUR_OPTIONS = [1, 2, 4, 8, 12];

/**
 * 一处宅邸：7×7 的空地。
 * 先在空地上盖「形体」，再进屋分配「功能」；每种功能都有亲手可做的事，
 * 也可把整座或单独一间租出去收租。
 */
export function ManorPlotModal({
  plot,
  onClose,
  initialIndex,
}: {
  plot: ManorPlot;
  onClose: () => void;
  /** 从宅邸图点进来时，直接落在那一间上 */
  initialIndex?: number;
}) {
  const live = useGameStore((s) => s.manorPlots?.find((p) => p.id === plot.id)) ?? plot;
  const stones = useGameStore((s) => lowStonesWorth(s.spiritStones));
  const buildShape = useGameStore((s) => s.buildShape);
  const assignManorFunction = useGameStore((s) => s.assignManorFunction);
  const upgradeManorCell = useGameStore((s) => s.upgradeManorCell);
  const demolishManorCell = useGameStore((s) => s.demolishManorCell);
  const convertManorCell = useGameStore((s) => s.convertManorCell);
  const setManorCrop = useGameStore((s) => s.setManorCrop);
  const manorBonusOf = useGameStore((s) => s.manorBonus);
  const rentOutPlot = useGameStore((s) => s.rentOutPlot);
  const reclaimPlot = useGameStore((s) => s.reclaimPlot);
  const rentOutRoom = useGameStore((s) => s.rentOutRoom);
  const reclaimRoom = useGameStore((s) => s.reclaimRoom);
  const manorAct = useGameStore((s) => s.manorAct);
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const addLog = useGameStore((s) => s.addLog);
  const techniques = useGameStore((s) => s.techniques);
  const skills = useGameStore((s) => s.skills);
  const relations = useGameStore((s) => s.relations);
  const inventory = useGameStore((s) => s.inventory);
  const beast = useGameStore((s) => s.beast);
  const setCraftingTab = useGameStore((s) => s.setCraftingTab);
  const judgeCrop = useAIStore((s) => s.judgeCrop);
  const narrateRentOut = useAIStore((s) => s.narrateRentOut);
  const openCrafting = useAIStore((s) => s.openCrafting);

  const [sel, setSel] = useState<number | null>(initialIndex ?? null);
  const [note, setNote] = useState("");
  const [cropInput, setCropInput] = useState("");
  const [cropNote, setCropNote] = useState("");
  const [cropBusy, setCropBusy] = useState(false);
  const [tenantKind, setTenantKind] = useState<string>(RENT_TENANT_KINDS[0]);
  const [roomTenantKind, setRoomTenantKind] = useState<string>(RENT_TENANT_KINDS[0]);
  const [rentBusy, setRentBusy] = useState(false);
  const [roomRentBusy, setRoomRentBusy] = useState(false);

  // 各处互动的参数：时长、功法、本事、客人、物件与件数
  const [hours, setHours] = useState(4);
  const [techId, setTechId] = useState("");
  const [skillName, setSkillName] = useState("");
  const [guestId, setGuestId] = useState("");
  const [salvageId, setSalvageId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [takeId, setTakeId] = useState("");
  const [count, setCount] = useState(1);

  const rented = !!live.rent;
  const roomCount = rentedRooms(live);
  const monthlyRent = manorRentIncome(live);
  const cell = sel !== null ? live.cells[sel] : null;
  const bonuses = manorBonuses(live.cells);
  const storage = Array.isArray(live.storage) ? live.storage : [];
  const activeTech = techId || player.activeHeartTechnique || techniques[0]?.id || "";
  const activeSkill = skillName || skills[0]?.name || "";
  const activeGuest = guestId || relations.find((r) => r.type !== "enemy")?.id || "";
  const activeSalvage = salvageId || inventory[0]?.id || "";
  const activeStore = storeId || inventory[0]?.id || "";
  const activeTake = takeId || storage[0]?.id || "";

  /** 宅邸里若有客舍且没租出去，便可在此歇息 */
  const hasGuestRoom = live.cells.some((c) => c?.fn === "客舍" && !c.rent);
  const rest = () => {
    if (rented) return;
    const ratio = restRatio(manorBonusOf("客舍"));
    setPlayer({
      ...player,
      hp: Math.min(player.hpMax, Math.round(player.hp + player.hpMax * ratio)),
      mp: Math.min(player.mpMax, Math.round(player.mp + player.mpMax * ratio)),
    });
    advanceTime(HOURS_PER_DAY);
    addLog(`你在宅邸里歇了一日，气血灵力回了 ${Math.round(ratio * 100)}%。`);
    setNote(`歇息一日，回复 ${Math.round(ratio * 100)}%。`);
  };

  /** 整座出租：租客与月租由叙事议定 */
  const rentOut = async () => {
    if (rentBusy || roomCount > 0) return;
    setRentBusy(true);
    setNote("");
    try {
      const r = await narrateRentOut({
        name: `${live.place}·宅邸`,
        place: live.place,
        kind: "manor",
        tenantKind,
      });
      if (r.monthly <= 0) {
        setNote(r.text || "议了半日也没谈拢，只好作罢。");
        return;
      }
      rentOutPlot(live.id, { tenant: r.tenant, monthly: r.monthly });
      addLog(`你把「${live.place}·宅邸」租与「${r.tenant}」，月租 ${r.monthly} 下品灵石。`);
      setNote(r.text || `已租与「${r.tenant}」，月租 ${r.monthly} 下品灵石。`);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setRentBusy(false);
    }
  };

  /** 单独出租这一间 */
  const rentRoom = async () => {
    if (roomRentBusy || sel === null || !cell || rented) return;
    setRoomRentBusy(true);
    setNote("");
    try {
      const label = `${live.place}·${cell.shape}${cell.fn ? `（${cell.fn}）` : ""}`;
      const r = await narrateRentOut({
        name: label,
        place: live.place,
        kind: "manor",
        tenantKind: roomTenantKind,
      });
      if (r.monthly <= 0) {
        setNote(r.text || "议了半日也没谈拢，只好作罢。");
        return;
      }
      rentOutRoom(live.id, sel, { tenant: r.tenant, monthly: r.monthly });
      addLog(`你把「${label}」租与「${r.tenant}」，月租 ${r.monthly} 下品灵石。`);
      setNote(r.text || `这一间已租与「${r.tenant}」，月租 ${r.monthly} 下品灵石。`);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setRoomRentBusy(false);
    }
  };

  /** 灵田：请老农相看这作物在此地成不成，成了才落种 */
  const plantCrop = async () => {
    if (sel === null || !cell || cell.fn !== "园圃" || !cropInput.trim() || cropBusy) return;
    setCropBusy(true);
    setCropNote("");
    try {
      const culture = live.cityId ? getMarker(live.cityId)?.culture : undefined;
      const verdict = await judgeCrop({ crop: cropInput.trim(), culture });
      if (verdict.feasible) {
        setManorCrop(live.id, sel, cropInput.trim());
        setCropNote(`老农说可行：${verdict.reason}。已下种「${cropInput.trim()}」。`);
      } else {
        setCropNote(`老农摇头：${verdict.reason || "此地种不活这物产。"}`);
      }
    } catch (e) {
      setCropNote((e as Error).message);
    } finally {
      setCropBusy(false);
    }
  };

  /** 做一件实事：参数先选好，由 manorAct 确定性落账 */
  const act = (action: ManorActionId) => {
    if (sel === null) return;
    const res = manorAct({
      plotId: live.id,
      index: sel,
      action,
      hours,
      techniqueId: activeTech || undefined,
      skillName: activeSkill || undefined,
      relationId: activeGuest || undefined,
      itemId:
        action === "熔炼" ? activeSalvage : action === "存物" ? activeStore : action === "取物" ? activeTake : undefined,
      count,
    });
    setNote(res.text);
  };

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-3" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-6xl h-[92vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Home size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.place}·宅邸</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5">
                7×7 宅地 · 折合下品灵石 {stones}
                {monthlyRent > 0 ? ` · 月租合计 ${monthlyRent}` : ""}
                {roomCount > 0 ? ` · 已租出 ${roomCount} 间` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5">
            {/* 左：宅邸全景与加成 */}
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="flex justify-center mb-4">
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${MANOR_GRID}, minmax(0, 1fr))` }}
                >
                  {live.cells.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setSel(i)}
                      title={
                        c
                          ? `${c.shape} Lv.${c.level}${c.fn ? ` · ${c.fn}` : " · 未配功能"}${c.rent ? " · 已出租" : ""}`
                          : "空地"
                      }
                      className={cn(
                        "w-16 h-16 xl:w-[4.5rem] xl:h-[4.5rem] rounded border-2 font-serif text-[11px] leading-tight flex flex-col items-center justify-center transition relative",
                        sel === i ? "border-gold-500 bg-gold-400/15" : "border-ink-lightest/40",
                        c ? "bg-paper-old/70 text-ink-dark" : "bg-ink-900/10 text-ink-lightest",
                      )}
                    >
                      {c ? (
                        <>
                          <span className="font-brush text-sm">{c.shape}</span>
                          <span>Lv.{c.level}</span>
                          <span className="text-[10px]">{c.fn ?? "未配"}</span>
                          {c.rent && (
                            <span className="absolute top-0.5 right-0.5 rounded bg-cinnabar-500/85 px-1 text-[9px] text-paper-50">
                              租
                            </span>
                          )}
                        </>
                      ) : (
                        "空地"
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {bonuses.length > 0 && (
                <div className="mb-4 rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2">
                  <div className="font-brush text-xs text-ink-dark mb-1">宅邸加成（租出的屋子不计）</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {bonuses.map((b) => (
                      <span key={b.fn} className="font-serif text-xs text-ink-medium">
                        {b.fn}（{FUNCTION_INFO[b.fn].note}）+{b.total}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2">
                <div className="font-brush text-xs text-ink-dark mb-1">整座出租</div>
                {rented ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-serif text-xs text-ink-medium">
                      已租与「{live.rent!.tenant}」，月租 {live.rent!.monthly} 下品灵石，每月入账。
                    </span>
                    <SealButton
                      variant="ghost"
                      onClick={() => {
                        reclaimPlot(live.id);
                        setNote("你与租客说定，收回自住。");
                      }}
                      className="px-3 py-1.5 text-xs"
                    >
                      收回自住
                    </SealButton>
                  </div>
                ) : roomCount > 0 ? (
                  <p className="font-serif text-xs text-ink-light">
                    已有 {roomCount} 间单独租出。要整座出租，先把各间的租约收回来。
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={tenantKind}
                      onChange={(ev) => setTenantKind(ev.target.value)}
                      className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                    >
                      {RENT_TENANT_KINDS.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                    <SealButton onClick={() => void rentOut()} disabled={rentBusy} className="px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5">
                        {rentBusy ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />}
                        {rentBusy ? "正在议租……" : "挂牌出租"}
                      </span>
                    </SealButton>
                    <span className="font-serif text-[11px] text-ink-lightest">租客与月租由叙事议定。</span>
                  </div>
                )}
              </div>

              {hasGuestRoom && (
                <div className="mt-3 flex items-center gap-3">
                  <SealButton onClick={rest} disabled={rented} className="px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5"><Home size={12} /> 在宅邸歇息一日</span>
                  </SealButton>
                  <span className="font-serif text-[11px] text-ink-lightest">
                    按客舍加成回复，现为 {Math.round(restRatio(manorBonusOf("客舍")) * 100)}%。
                  </span>
                </div>
              )}
            </div>

            {/* 右：选中的那一格 */}
            <div className="min-h-0 overflow-y-auto border-l border-ink-lightest/30 pl-4">
              {sel === null ? (
                <p className="font-serif text-xs text-ink-light text-center py-8">
                  点一格空地盖屋，或点一处建筑打理、做点实事。
                </p>
              ) : (
                <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/40 px-3 py-3">
                  <div className="font-brush text-sm text-ink-dark mb-2">
                    第 {Math.floor(sel / MANOR_GRID) + 1} 行 第 {(sel % MANOR_GRID) + 1} 列 ·{" "}
                    {cell ? `${cell.shape} Lv.${cell.level}` : "空地"}
                  </div>

                  {!cell ? (
                    <>
                      <p className="font-serif text-xs text-ink-light mb-2">盖一处什么？盖好后可再进屋分配功能。</p>
                      <div className="flex flex-wrap gap-2">
                        {MANOR_SHAPES.map((shape) => (
                          <SealButton
                            key={shape}
                            variant="ghost"
                            onClick={() => {
                              setNote(
                                buildShape(live.id, sel, shape)
                                  ? `盖起一座「${shape}」。可再点它分配功能。`
                                  : "灵石不够，盖不起来。",
                              );
                            }}
                            className="px-3 py-1.5 text-xs"
                          >
                            <span className="flex items-center gap-1.5">
                              <Wrench size={12} /> {shape}（{SHAPE_COST[shape]}）
                            </span>
                          </SealButton>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <SealButton
                          variant="ghost"
                          onClick={() => setNote(upgradeManorCell(live.id, sel) ? "已升级。" : "灵石不够，或已到顶。")}
                          className="px-3 py-1.5 text-xs"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles size={12} /> 升级（{upgradeCost(cell.shape, cell.level)}）
                          </span>
                        </SealButton>
                        <SealButton
                          variant="ghost"
                          onClick={() => setNote(demolishManorCell(live.id, sel) ? "已拆除，变回空地。" : "拆不成。")}
                          className="px-3 py-1.5 text-xs"
                        >
                          <span className="flex items-center gap-1.5">
                            <Hammer size={12} /> 拆除（退 {demolishRefund(cell.shape, cell.level)}）
                          </span>
                        </SealButton>
                      </div>

                      <div className="font-serif text-xs text-ink-light mb-1">改建为：</div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {MANOR_SHAPES.filter((s) => s !== cell.shape).map((shape) => (
                          <button
                            key={shape}
                            onClick={() =>
                              setNote(
                                convertManorCell(live.id, sel, shape)
                                  ? `已改建为「${shape}」。`
                                  : "灵石不够，改不成。",
                              )
                            }
                            className="px-2 py-1 rounded border border-ink-lightest/40 bg-paper-old/50 font-serif text-xs text-ink-dark transition hover:border-gold-500"
                          >
                            {shape}（{convertCost(cell.shape, shape, cell.level)}）
                          </button>
                        ))}
                      </div>

                      <div className="font-serif text-xs text-ink-light mb-1">
                        分配功能（「{cell.shape}」上可配：
                        {MANOR_FUNCTIONS.filter((fn) => manorFunctionAllowed(cell.shape, fn)).join("、")}）：
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {MANOR_FUNCTIONS.filter((fn) => manorFunctionAllowed(cell.shape, fn)).map((fn: ManorFunction) => (
                          <button
                            key={fn}
                            onClick={() => {
                              assignManorFunction(live.id, sel, fn);
                              setNote(`已把此处派作「${fn}」（${FUNCTION_INFO[fn].note}）。`);
                            }}
                            className={cn(
                              "px-2 py-1 rounded border font-serif text-xs transition",
                              cell.fn === fn
                                ? "border-gold-500 bg-gold-400/15 text-ink-dark"
                                : "border-ink-lightest/40 bg-paper-old/50 text-ink-dark hover:border-gold-500",
                            )}
                          >
                            {fn}
                          </button>
                        ))}
                        {cell.fn && (
                          <button
                            onClick={() => {
                              if (cell.rent) {
                                setNote("这一间租出去了，先收回才能撤功能。");
                                return;
                              }
                              assignManorFunction(live.id, sel, undefined);
                              setNote("已撤下此处功能。");
                            }}
                            className="px-2 py-1 rounded border border-cinnabar-500/40 font-serif text-xs text-cinnabar-600"
                          >
                            撤下功能
                          </button>
                        )}
                      </div>

                      {/* 单独出租这一间 */}
                      <div className="mt-3 rounded border border-gold-500/30 bg-gold-500/5 px-3 py-2">
                        <div className="font-brush text-xs text-ink-dark mb-1">出租这一间</div>
                        {cell.rent ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-serif text-[11px] text-ink-medium">
                              已租与「{cell.rent.tenant}」，月租 {cell.rent.monthly} 下品灵石，每月入账。
                            </span>
                            <SealButton
                              variant="ghost"
                              onClick={() => {
                                reclaimRoom(live.id, sel);
                                setNote("你收回了这一间。");
                              }}
                              className="px-2 py-1 text-[11px]"
                            >
                              收回
                            </SealButton>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={roomTenantKind}
                              onChange={(ev) => setRoomTenantKind(ev.target.value)}
                              className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                            >
                              {RENT_TENANT_KINDS.map((k) => (
                                <option key={k} value={k}>{k}</option>
                              ))}
                            </select>
                            <SealButton
                              onClick={() => void rentRoom()}
                              disabled={roomRentBusy || rented}
                              className="px-2 py-1 text-[11px]"
                            >
                              <span className="flex items-center gap-1.5">
                                {roomRentBusy ? <Loader2 size={11} className="animate-spin" /> : <Coins size={11} />}
                                {rented ? "整座已租出" : roomRentBusy ? "正在议租……" : "挂牌出租"}
                              </span>
                            </SealButton>
                          </div>
                        )}
                      </div>

                      {/* 各功能亲手可做的事 */}
                      <div className="mt-3 rounded border border-jade-500/30 bg-jade-500/5 px-3 py-2">
                        <div className="font-brush text-xs text-ink-dark mb-1">
                          在此处做事{cell.fn ? ` · ${cell.fn}（${FUNCTION_INFO[cell.fn].note} +${Math.round(manorBonusOf(cell.fn) * 100)}%）` : ""}
                        </div>

                        {cell.rent && (
                          <p className="font-serif text-[11px] text-cinnabar-600">这一间租出去了，自家人用不得。</p>
                        )}

                        {!cell.rent && cell.fn === "聚灵" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <HourPicker value={hours} onChange={setHours} />
                            <SealButton variant="ghost" onClick={() => act("打坐")} className="px-3 py-1 text-xs">
                              <span className="flex items-center gap-1.5"><Brain size={12} /> 打坐</span>
                            </SealButton>
                            <span className="font-serif text-[11px] text-ink-light">按聚灵加成长主修功法与修为。</span>
                          </div>
                        )}

                        {!cell.rent && cell.fn === "丹房" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <SealButton
                              variant="ghost"
                              onClick={() => {
                                setCraftingTab("alchemy");
                                openCrafting();
                                setNote("你收拾好炉鼎与药材，开炉炼丹。");
                              }}
                              className="px-3 py-1 text-xs"
                            >
                              <span className="flex items-center gap-1.5"><Flame size={12} /> 开炉炼丹</span>
                            </SealButton>
                            <span className="font-serif text-[11px] text-ink-light">打开百艺窗，按丹方亲自炼制。</span>
                          </div>
                        )}

                        {!cell.rent && cell.fn === "锻坊" && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={activeSalvage}
                                onChange={(ev) => setSalvageId(ev.target.value)}
                                className="flex-1 min-w-[8rem] rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                              >
                                {inventory.length === 0 && <option value="">行囊里没有可熔的东西</option>}
                                {inventory.map((it) => (
                                  <option key={it.id} value={it.id}>
                                    {it.name}（{it.grade}·{it.count}）
                                  </option>
                                ))}
                              </select>
                              <CountPicker value={count} onChange={setCount} max={inventory.find((i) => i.id === activeSalvage)?.count ?? 1} />
                              <SealButton variant="ghost" onClick={() => act("熔炼")} disabled={!activeSalvage} className="px-3 py-1 text-xs">
                                <span className="flex items-center gap-1.5"><Flame size={12} /> 熔炼</span>
                              </SealButton>
                            </div>
                            <p className="font-serif text-[11px] text-ink-light">
                              按品阶折成灵石，锻坊加成再抬一抬。
                            </p>
                          </div>
                        )}

                        {!cell.rent && (cell.fn === "经阁" || cell.fn === "演武") && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={activeTech}
                                onChange={(ev) => setTechId(ev.target.value)}
                                className="flex-1 min-w-[8rem] rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                              >
                                {techniques.length === 0 && <option value="">手上还没有功法</option>}
                                {techniques.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}（{t.proficiency}/{t.proficiencyMax}）</option>
                                ))}
                              </select>
                              <HourPicker value={hours} onChange={setHours} />
                              <SealButton
                                variant="ghost"
                                onClick={() => act(cell.fn === "经阁" ? "参悟" : "演练")}
                                className="px-3 py-1 text-xs"
                              >
                                <span className="flex items-center gap-1.5">
                                  {cell.fn === "经阁" ? <BookOpen size={12} /> : <Swords size={12} />}
                                  {cell.fn === "经阁" ? "参悟" : "演练"}
                                </span>
                              </SealButton>
                            </div>
                          </div>
                        )}

                        {!cell.rent && cell.fn === "书房" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={activeSkill}
                              onChange={(ev) => setSkillName(ev.target.value)}
                              className="flex-1 min-w-[8rem] rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                            >
                              {skills.length === 0 && <option value="">还没有可读的本事</option>}
                              {skills.map((s) => (
                                <option key={s.id} value={s.name}>{s.name}（Lv.{s.level}）</option>
                              ))}
                            </select>
                            <HourPicker value={hours} onChange={setHours} />
                            <SealButton variant="ghost" onClick={() => act("研读")} disabled={!activeSkill} className="px-3 py-1 text-xs">
                              <span className="flex items-center gap-1.5"><BookOpen size={12} /> 研读</span>
                            </SealButton>
                          </div>
                        )}

                        {!cell.rent && cell.fn === "茶室" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={activeGuest}
                              onChange={(ev) => setGuestId(ev.target.value)}
                              className="flex-1 min-w-[8rem] rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                            >
                              {relations.length === 0 && <option value="">还没有可请的人</option>}
                              {relations.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}（交情 {r.relation}）</option>
                              ))}
                            </select>
                            <SealButton variant="ghost" onClick={() => act("会客")} disabled={!activeGuest} className="px-3 py-1 text-xs">
                              <span className="flex items-center gap-1.5"><Coffee size={12} /> 请来喝茶</span>
                            </SealButton>
                          </div>
                        )}

                        {!cell.rent && cell.fn === "兽栏" && (
                          <div className="flex flex-wrap items-center gap-2">
                            {beast ? (
                              <>
                                <span className="font-serif text-xs text-ink-medium">随身：{beast.name}</span>
                                <SealButton variant="ghost" onClick={() => act("驯兽")} className="px-3 py-1 text-xs">
                                  <span className="flex items-center gap-1.5"><PawPrint size={12} /> 陪它半日</span>
                                </SealButton>
                              </>
                            ) : (
                              <span className="font-serif text-[11px] text-ink-light">身边没有带灵兽。</span>
                            )}
                          </div>
                        )}

                        {!cell.rent && cell.fn === "仓廪" && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={activeStore}
                                onChange={(ev) => setStoreId(ev.target.value)}
                                className="flex-1 min-w-[7rem] rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                              >
                                {inventory.length === 0 && <option value="">行囊里没有东西</option>}
                                {inventory.map((it) => (
                                  <option key={it.id} value={it.id}>{it.name}×{it.count}</option>
                                ))}
                              </select>
                              <CountPicker value={count} onChange={setCount} max={inventory.find((i) => i.id === activeStore)?.count ?? 1} />
                              <SealButton variant="ghost" onClick={() => act("存物")} disabled={!activeStore} className="px-2 py-1 text-[11px]">
                                <span className="flex items-center gap-1.5"><Archive size={11} /> 存入</span>
                              </SealButton>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={activeTake}
                                onChange={(ev) => setTakeId(ev.target.value)}
                                className="flex-1 min-w-[7rem] rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                              >
                                {storage.length === 0 && <option value="">仓廪里空着</option>}
                                {storage.map((it) => (
                                  <option key={it.id} value={it.id}>{it.name}×{it.count}</option>
                                ))}
                              </select>
                              <CountPicker value={count} onChange={setCount} max={storage.find((i) => i.id === activeTake)?.count ?? 1} />
                              <SealButton variant="ghost" onClick={() => act("取物")} disabled={!activeTake} className="px-2 py-1 text-[11px]">
                                <span className="flex items-center gap-1.5"><Package size={11} /> 取出</span>
                              </SealButton>
                            </div>
                          </div>
                        )}

                        {!cell.rent && cell.fn === "客舍" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <SealButton variant="ghost" onClick={rest} disabled={rented} className="px-3 py-1 text-xs">
                              <span className="flex items-center gap-1.5"><Home size={12} /> 歇息一日</span>
                            </SealButton>
                            <span className="font-serif text-[11px] text-ink-light">
                              回复 {Math.round(restRatio(manorBonusOf("客舍")) * 100)}% 气血灵力。
                            </span>
                          </div>
                        )}

                        {!cell.rent && cell.fn === "园圃" && (
                          <div className="rounded border border-jade-500/30 bg-jade-500/5 px-2 py-2">
                            <div className="font-brush text-xs text-ink-dark mb-1">
                              灵田 · {cell.crop ? `已种「${cell.crop}」` : "尚未下种"}
                            </div>
                            {!cell.crop && (
                              <>
                                <p className="font-serif text-[11px] text-ink-light mb-2">
                                  先说要种什么，请老农相看此地成不成。成则每季收一份；中原、漠北、西域的隆冬不产。
                                </p>
                                <div className="flex items-center gap-2">
                                  <input
                                    value={cropInput}
                                    onChange={(e) => setCropInput(e.target.value)}
                                    placeholder="如：灵草、稻米、沙枣……"
                                    className="flex-1 rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
                                  />
                                  <SealButton
                                    variant="ghost"
                                    onClick={() => void plantCrop()}
                                    disabled={cropBusy || !cropInput.trim()}
                                    className="px-3 py-1 text-xs"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      {cropBusy && <Loader2 size={12} className="animate-spin" />}
                                      请老农相看
                                    </span>
                                  </SealButton>
                                </div>
                              </>
                            )}
                            {cropNote && (
                              <p className="font-serif text-[11px] text-ink-dark mt-2 leading-relaxed">{cropNote}</p>
                            )}
                          </div>
                        )}

                        {!cell.rent && !cell.fn && (
                          <p className="font-serif text-[11px] text-ink-light">先给这一间分配功能，才有可做的事。</p>
                        )}
                      </div>

                      {note && <p className="font-serif text-xs text-ink-dark pt-2 leading-relaxed">{note}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 时辰选择 */
function HourPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
    >
      {HOUR_OPTIONS.map((h) => (
        <option key={h} value={h}>{h} 个时辰</option>
      ))}
    </select>
  );
}

/** 件数选择 */
function CountPicker({
  value,
  onChange,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
}) {
  const top = Math.max(1, Math.min(99, Math.trunc(max) || 1));
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="w-6 h-6 rounded border border-ink-lightest/50 font-serif text-xs text-ink-dark disabled:opacity-40"
      >
        －
      </button>
      <span className="font-number text-xs text-ink-dark w-6 text-center">{Math.min(value, top)}</span>
      <button
        onClick={() => onChange(Math.min(top, value + 1))}
        disabled={value >= top}
        className="w-6 h-6 rounded border border-ink-lightest/50 font-serif text-xs text-ink-dark disabled:opacity-40"
      >
        ＋
      </button>
    </div>
  );
}
