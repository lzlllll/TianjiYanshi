import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { HOURS_PER_DAY } from "@/data/rooms";
import { cultivationGain } from "@/data/cultivation";
import { estateEfficiency, RENT_TENANT_KINDS } from "@/data/estates";
import { manorBonuses, restRatio } from "@/data/manors";
import { manorSceneId } from "@/data/map";
import type { Estate } from "@/data/types";
import { Coins, Home, Loader2, Package, Sparkles, Swords } from "lucide-react";

/** 完好度落到这些话上 */
function conditionWords(condition: number): string {
  if (condition <= 0) return "破败不堪，住不得人";
  if (condition < 30) return "墙歪瓦漏，勉强遮风";
  if (condition < 60) return "年久失修，尚可安身";
  if (condition < 90) return "齐整，偶有磨损";
  return "屋舍完好";
}

/** 地产：名下各处产业的境况；经营地产的事一律交予叙事，这里只作查看 */
export function EstatePanel() {
  const estates = useGameStore((s) => s.estates ?? []);
  const manorPlots = useGameStore((s) => s.manorPlots ?? []);
  const enterScene = useGameStore((s) => s.enterScene);
  const setPanel = useGameStore((s) => s.setPanel);
  const [openId, setOpenId] = useState<string | null>(null);

  /** 宅邸也是一张地图：收起抽屉，直接走进去 */
  const enterManor = (plotId: string) => {
    setPanel(null);
    enterScene(manorSceneId(plotId));
  };

  return (
    <div className="paper-texture">
      <PanelTitle title="地产" poem="广厦千间，夜眠七尺；有一瓦遮头，行路便不慌。" />

      {estates.length === 0 ? (
        <ScrollCard title="名下房产" subtitle="尚无一处">
          <div className="text-center py-8">
            <Home size={32} className="mx-auto text-ink-lightest/50 mb-2" />
            <p className="font-serif text-sm text-ink-light">名下还没有一处房产</p>
            <p className="font-serif text-xs text-ink-lightest mt-1">
              到城里的平民住宅打听，或进村问问，兴许有人要出手屋舍。
            </p>
          </div>
        </ScrollCard>
      ) : (
        <div className="space-y-4">
          {estates.map((e) => (
            <EstateCard key={e.id} estate={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
          ))}
        </div>
      )}

      {/* 宅邸：一方 7×7 空地，自建屋舍，自配功能 */}
      <ScrollCard className="mt-4" title="宅邸" subtitle="一方 7×7 空地，自建屋舍，自配功能">
        {manorPlots.length === 0 ? (
          <p className="font-serif text-xs text-ink-lightest">
            名下还没有宅地。宅地或由叙事处置得来，或经他人相赠、承继。
          </p>
        ) : (
          <div className="space-y-2">
            {manorPlots.map((p) => {
              const built = p.cells.filter(Boolean).length;
              const bonuses = manorBonuses(p.cells);
              return (
                <div key={p.id} className="flex items-center justify-between rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-brush text-sm text-ink-dark truncate">{p.place}·宅邸</div>
                    <div className="font-serif text-xs text-ink-light">
                      已建 {built}/{p.cells.length} 格
                      {bonuses.length > 0 ? ` · ${bonuses.map((b) => `${b.fn}+${b.total}`).join("，")}` : ""}
                      {p.rent ? ` · 已租与${p.rent.tenant}（月租 ${p.rent.monthly}）` : ""}
                    </div>
                  </div>
                  <SealButton variant="ghost" onClick={() => enterManor(p.id)} className="px-3 py-1.5 text-xs shrink-0">
                    进入
                  </SealButton>
                </div>
              );
            })}
          </div>
        )}
      </ScrollCard>
    </div>
  );
}

function EstateCard({ estate, open, onToggle }: { estate: Estate; open: boolean; onToggle: () => void }) {
  const eff = estateEfficiency(estate);

  return (
    <ScrollCard title={estate.name} subtitle={estate.place}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-serif text-xs text-ink-dark">{conditionWords(estate.condition)}</span>
        <span className="font-serif text-xs text-ink-light">
          完好 {estate.condition}/100 · 效率 {eff.toFixed(2)}（基础 {estate.baseEfficiency.toFixed(2)}）
        </span>
      </div>
      <div className="h-2 rounded-sm bg-ink-900/20 overflow-hidden mb-2">
        <div
          className={cn("h-full transition-all", estate.condition > 60 ? "bg-jade-500/70" : estate.condition > 30 ? "bg-gold-500/70" : "bg-cinnabar-500/70")}
          style={{ width: `${estate.condition}%` }}
        />
      </div>

      {estate.rent && (
        <p className="font-serif text-xs text-jade-600 mb-2">
          已租与「{estate.rent.tenant}」，月租 {estate.rent.monthly} 下品灵石，按月入账。
        </p>
      )}

      <SealButton variant="ghost" onClick={onToggle} className="px-3 py-1.5 text-xs">
        {open ? "收起" : "进屋打理"}
      </SealButton>

      {open && <EstateInterior estate={estate} />}
    </ScrollCard>
  );
}

function EstateInterior({ estate }: { estate: Estate }) {
  const player = useGameStore((s) => s.player);
  const techniques = useGameStore((s) => s.techniques ?? []);
  const inventory = useGameStore((s) => s.inventory ?? []);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const advanceTime = useGameStore((s) => s.advanceTime);
  const trainAt = useGameStore((s) => s.trainAt);
  const addLog = useGameStore((s) => s.addLog);
  const storeInEstate = useGameStore((s) => s.storeInEstate);
  const takeFromEstate = useGameStore((s) => s.takeFromEstate);
  const rentOutEstate = useGameStore((s) => s.rentOutEstate);
  const reclaimEstate = useGameStore((s) => s.reclaimEstate);
  const narrateRentOut = useAIStore((s) => s.narrateRentOut);

  const [note, setNote] = useState("");
  const [days, setDays] = useState(1);
  const [techId, setTechId] = useState("");
  const [tab, setTab] = useState<"rest" | "store">("rest");
  const [tenantKind, setTenantKind] = useState<string>(RENT_TENANT_KINDS[0]);
  const [rentBusy, setRentBusy] = useState(false);

  const eff = estateEfficiency(estate);
  const ruined = estate.condition <= 0;
  const rented = !!estate.rent;
  const target = techniques.find((t) => t.id === techId) ?? techniques[0];
  const hours = days * HOURS_PER_DAY;

  /** 歇息：屋里不收钱，一样把气血灵力养回来；租出去了便住不得 */
  const rest = () => {
    if (ruined || rented) return;
    // 回复按日算，宅邸里的「客舍」再抬一抬
    const ratio = restRatio(useGameStore.getState().manorBonus("客舍")) * days;
    setPlayer({
      ...player,
      hp: Math.min(player.hpMax, Math.round(player.hp + player.hpMax * ratio)),
      mp: Math.min(player.mpMax, Math.round(player.mp + player.mpMax * ratio)),
    });
    advanceTime(hours);
    addLog(`你在「${estate.name}」安歇 ${days} 日，气血灵力各回了 ${Math.round(ratio * 100)}%。`);
    setNote(`歇息 ${days} 日，气血灵力各回 ${Math.round(ratio * 100)}%。`);
  };

  /** 修炼：比自己在外头打坐强，进益按房子效率折算，只长修为 */
  const cultivate = () => {
    if (ruined || rented) return;
    const gain = Math.round(cultivationGain(hours, eff * 1.5));
    setPlayer({ ...player, cultivation: (Number(player.cultivation) || 0) + gain });
    advanceTime(hours);
    addLog(`你在「${estate.name}」静坐 ${days} 日，修为 +${gain}。`);
    setNote(`修炼 ${days} 日，修为 +${gain}。`);
  };

  /** 演武：屋里有一方空地，练一门指定功法 */
  const practice = () => {
    if (ruined || rented || !target) return;
    const gain = trainAt(target.id, hours, eff * 1.2);
    advanceTime(hours);
    addLog(`你在「${estate.name}」练「${target.name}」${days} 日，进度 +${gain}。`);
    setNote(`演武 ${days} 日，${target.name} 进度 +${gain}。`);
  };

  /** 出租：租客与月租由叙事议定，此后按月入账 */
  const rentOut = async () => {
    if (ruined || rentBusy) return;
    setRentBusy(true);
    setNote("");
    try {
      const r = await narrateRentOut({
        name: estate.name,
        place: estate.place,
        kind: "estate",
        baseEfficiency: estate.baseEfficiency,
        condition: estate.condition,
        tenantKind,
      });
      if (r.monthly <= 0) {
        setNote(r.text || "议了半日也没谈拢，只好作罢。");
        return;
      }
      rentOutEstate(estate.id, { tenant: r.tenant, monthly: r.monthly });
      addLog(`你把「${estate.name}」租与「${r.tenant}」，月租 ${r.monthly} 下品灵石。`);
      setNote(r.text || `已租与「${r.tenant}」，月租 ${r.monthly} 下品灵石。`);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setRentBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t-2 border-ink-lightest/30 pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <label className="flex items-center gap-2 font-serif text-xs text-ink-dark">
          几日
          <select
            value={days}
            onChange={(ev) => setDays(Number(ev.target.value))}
            className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
          >
            {[1, 3, 5].map((d) => (
              <option key={d} value={d}>{d} 日</option>
            ))}
          </select>
        </label>
        <SealButton onClick={rest} disabled={ruined || rented} className="px-3 py-1.5 text-xs">
          <span className="flex items-center gap-1.5"><Home size={12} /> 歇息</span>
        </SealButton>
        <SealButton variant="ghost" onClick={cultivate} disabled={ruined || rented} className="px-3 py-1.5 text-xs">
          <span className="flex items-center gap-1.5"><Sparkles size={12} /> 打坐修炼</span>
        </SealButton>
        <SealButton variant="ghost" onClick={practice} disabled={ruined || rented || !target} className="px-3 py-1.5 text-xs">
          <span className="flex items-center gap-1.5"><Swords size={12} /> 演武</span>
        </SealButton>
        {techniques.length > 0 && (
          <select
            value={target?.id ?? ""}
            onChange={(ev) => setTechId(ev.target.value)}
            className="rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1 font-serif text-xs text-ink-dark outline-none focus:border-gold-500"
          >
            {techniques.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {ruined && (
        <div className="rounded border border-cinnabar-500/30 bg-cinnabar-500/10 px-3 py-2 font-serif text-xs text-cinnabar-600 mb-3">
          屋舍已破败，住不得人、练不得功；须经叙事雇人重建，或另作打算。
        </div>
      )}

      {/* 出租：择一处租客，由叙事议定租客与月租，此后按月入账 */}
      <div className="rounded border-2 border-ink-lightest/40 bg-paper-old/50 px-3 py-2 mb-3">
        <div className="font-brush text-xs text-ink-dark mb-1">出租</div>
        {rented ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-serif text-xs text-ink-medium">
              已租与「{estate.rent!.tenant}」，月租 {estate.rent!.monthly} 下品灵石，每月入账。
            </span>
            <SealButton
              variant="ghost"
              onClick={() => {
                reclaimEstate(estate.id);
                setNote("你与租客说定，收回来自住。");
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
            <SealButton onClick={() => void rentOut()} disabled={ruined || rentBusy} className="px-3 py-1.5 text-xs">
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

      {/* 储物：行囊与屋内互取 */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setTab("rest")}
          className={cn("px-3 py-1 rounded font-brush text-xs border", tab === "rest" ? "border-gold-400/50 bg-gold-400/10 text-gold-400" : "border-paper-400/15 text-paper-400")}
        >
          行囊
        </button>
        <button
          onClick={() => setTab("store")}
          className={cn("px-3 py-1 rounded font-brush text-xs border", tab === "store" ? "border-gold-400/50 bg-gold-400/10 text-gold-400" : "border-paper-400/15 text-paper-400")}
        >
          屋内（{estate.storage?.length ?? 0}）
        </button>
      </div>

      <div className="space-y-1">
        {(tab === "rest" ? inventory : estate.storage ?? []).map((item) => (
          <div key={item.name} className="flex items-center justify-between rounded border border-ink-lightest/30 bg-paper-old/40 px-2 py-1">
            <span className="font-serif text-xs text-ink-dark">
              <Package size={11} className="inline mr-1" />
              {item.name} × {item.count}
            </span>
            <button
              onClick={() => tab === "rest" ? storeInEstate(estate.id, item.name, 1) : takeFromEstate(estate.id, item.name, 1)}
              className="font-serif text-xs text-ink-light transition hover:text-gold-400"
            >
              {tab === "rest" ? "存入 1" : "取出 1"}
            </button>
          </div>
        ))}
        {(tab === "rest" ? inventory : estate.storage ?? []).length === 0 && (
          <p className="font-serif text-xs text-ink-lightest py-2">
            {tab === "rest" ? "行囊里没有东西。" : "屋里还没存东西。"}
          </p>
        )}
      </div>

      {note && <p className="font-serif text-xs text-ink-dark pt-2 leading-relaxed">{note}</p>}
    </div>
  );
}
