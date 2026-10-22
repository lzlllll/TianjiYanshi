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
  FUNCTION_SHAPES,
  MANOR_FUNCTIONS,
  MANOR_GRID,
  MANOR_SHAPES,
  SHAPE_COST,
  convertCost,
  demolishRefund,
  manorBonuses,
  manorFunctionAllowed,
  restRatio,
  upgradeCost,
} from "@/data/manors";
import type { ManorFunction, ManorPlot, ManorShape } from "@/data/types";
import { Coins, Hammer, Home, Loader2, Sparkles, Wrench, X } from "lucide-react";

/**
 * 一处宅邸：7×7 的空地。
 * 先在空地上盖「形体」，再进屋分配「功能」；可升级、拆除、改建，地块不能挪。
 */
export function ManorPlotModal({ plot, onClose }: { plot: ManorPlot; onClose: () => void }) {
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
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const addLog = useGameStore((s) => s.addLog);
  const judgeCrop = useAIStore((s) => s.judgeCrop);
  const narrateRentOut = useAIStore((s) => s.narrateRentOut);

  const [sel, setSel] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [cropInput, setCropInput] = useState("");
  const [cropNote, setCropNote] = useState("");
  const [cropBusy, setCropBusy] = useState(false);
  const [tenantKind, setTenantKind] = useState<string>(RENT_TENANT_KINDS[0]);
  const [rentBusy, setRentBusy] = useState(false);

  const rented = !!live.rent;

  /** 宅邸里若有客舍，便可在此歇息：按客舍加成回气血灵力；租出去了便住不得 */
  const hasGuestRoom = live.cells.some((c) => c?.fn === "客舍");
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

  /** 出租：整座宅邸租与他人，租客与月租由叙事议定，此后按月入账 */
  const rentOut = async () => {
    if (rentBusy) return;
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

  const cell = sel !== null ? live.cells[sel] : null;
  const bonuses = manorBonuses(live.cells);

  return (
    <div className="mainui-black fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={onClose} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-3xl max-h-[88vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Home size={18} className="text-gold-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-brush text-xl text-gold-400 tracking-widest truncate">{live.place}·宅邸</h2>
              <p className="font-serif text-xs text-paper-400 mt-0.5">7×7 宅地 · 现有折合下品灵石 {stones}</p>
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* 7×7 空地 */}
          <div className="flex justify-center mb-4">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${MANOR_GRID}, minmax(0, 1fr))` }}
            >
              {live.cells.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setSel(i)}
                  title={c ? `${c.shape} Lv.${c.level}${c.fn ? ` · ${c.fn}` : " · 未配功能"}` : "空地"}
                  className={cn(
                    "w-14 h-14 rounded border-2 font-serif text-[11px] leading-tight flex flex-col items-center justify-center transition",
                    sel === i ? "border-gold-500 bg-gold-400/15" : "border-ink-lightest/40",
                    c ? "bg-paper-old/70 text-ink-dark" : "bg-ink-900/10 text-ink-lightest",
                  )}
                >
                  {c ? (
                    <>
                      <span className="font-brush text-sm">{c.shape}</span>
                      <span>Lv.{c.level}</span>
                      <span className="text-[10px]">{c.fn ?? "未配"}</span>
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
              <div className="font-brush text-xs text-ink-dark mb-1">宅邸加成</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {bonuses.map((b) => (
                  <span key={b.fn} className="font-serif text-xs text-ink-medium">
                    {b.fn}（{FUNCTION_INFO[b.fn].note}）+{b.total}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasGuestRoom && (
            <div className="mb-4 flex items-center gap-3">
              <SealButton onClick={rest} disabled={rented} className="px-3 py-1.5 text-xs">
                <span className="flex items-center gap-1.5"><Home size={12} /> 在宅邸歇息一日</span>
              </SealButton>
              <span className="font-serif text-[11px] text-ink-lightest">
                有客舍在，回复按客舍加成：现为 {Math.round(restRatio(manorBonusOf("客舍")) * 100)}%。
              </span>
            </div>
          )}

          {/* 出租：整座宅邸租与他人，租客与月租由叙事议定，此后按月入账 */}
          <div className="mb-4 rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2">
            <div className="font-brush text-xs text-ink-dark mb-1">出租</div>
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
                <span className="font-serif text-[11px] text-ink-lightest">
                  租客与月租由叙事议定，租出去后此处不可自住。
                </span>
              </div>
            )}
          </div>

          {sel === null ? (
            <p className="font-serif text-xs text-ink-light text-center py-4">点一格空地盖屋，或点一处建筑打理。</p>
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
                    分配功能（「{cell.shape}」上可配：{MANOR_FUNCTIONS.filter((fn) => manorFunctionAllowed(cell.shape, fn)).join("、")}）：
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
                          assignManorFunction(live.id, sel, undefined);
                          setNote("已撤下此处功能。");
                        }}
                        className="px-2 py-1 rounded border border-cinnabar-500/40 font-serif text-xs text-cinnabar-600"
                      >
                        撤下功能
                      </button>
                    )}
                  </div>

                  {cell.fn === "园圃" && (
                    <div className="mt-3 rounded border border-jade-500/30 bg-jade-500/5 px-3 py-2">
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
                              className="px-3 py-1.5 text-xs"
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
                </>
              )}

              {note && <p className="font-serif text-xs text-ink-dark pt-2 leading-relaxed">{note}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
