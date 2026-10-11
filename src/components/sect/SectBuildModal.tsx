import { useMemo, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { getScene } from "@/data/map";
import { buildOptions } from "@/data/sectFacilities";
import type { SectBuildOption } from "@/data/sectFacilities";
import { getSectTileKind, sectTileCode } from "@/data/map/sectTiles";
import type { CustomFacility, FacilityKindId } from "@/data/types";
import { cn } from "@/lib/utils";
import { Hammer, Loader2, Sparkles, X } from "lucide-react";

/** 建筑类别摆开的次序：按职能从重到轻 */
const KIND_ORDER: FacilityKindId[] = [
  "hall", "scripture", "martial", "alchemy", "forge", "spirit", "farm", "beast", "array", "housing",
];

/** 类别 → 门里的说法 */
const kindLabel = (kindId: FacilityKindId) => getSectTileKind(sectTileCode(kindId)).name;

/**
 * 营造一座新建筑。
 *
 * 点中的是一块荒地。可以照名录挑一座（要挑类别、还要看门户品级撑不撑得起），
 * 也可以自己口述一座：由 AI 照玩家的说法拟出耗费、进项与好处，再动土。
 * 无论哪一路，都要先挑定参数、备齐灵石材料，才落得成——不准一按即成。
 */
export function SectBuildModal({ cellIndex, onClose }: { cellIndex: number; onClose: () => void }) {
  const sect = useGameStore((s) => s.sect);
  const mapSceneId = useGameStore((s) => s.mapSceneId);
  const spiritStones = useGameStore((s) => s.sect.management?.treasury?.spiritStones ?? 0);
  const treasuryMaterials = useGameStore((s) => s.sect.management?.treasury?.materials ?? []);
  const buildSectFacility = useGameStore((s) => s.buildSectFacility);
  const settings = useAIStore((s) => s.settings);
  const runTurn = useAIStore((s) => s.runTurn);
  const designSectBuilding = useAIStore((s) => s.designSectBuilding);

  const scene = getScene(mapSceneId);
  const hasModel = !!settings?.apiKey;

  const [mode, setMode] = useState<"list" | "custom">("list");
  const [picked, setPicked] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // 自拟的那一路
  const [customName, setCustomName] = useState("");
  const [customBrief, setCustomBrief] = useState("");
  const [custom, setCustom] = useState<CustomFacility | null>(null);
  const [customNote, setCustomNote] = useState("");
  const [designing, setDesigning] = useState(false);

  const options = useMemo(
    () => buildOptions({ sectLevel: sect?.level ?? 1, nature: scene?.sectNature }),
    [sect?.level, scene?.sectNature],
  );

  // 一类一类摆开，先重后轻
  const groups = useMemo(() => {
    const map = new Map<FacilityKindId, SectBuildOption[]>();
    for (const o of options) {
      const list = map.get(o.kindId) ?? [];
      list.push(o);
      map.set(o.kindId, list);
    }
    return KIND_ORDER.filter((k) => map.has(k)).map((k) => ({ kindId: k, list: map.get(k)! }));
  }, [options]);

  const chosen = options.find((o) => o.name === picked);
  const stockOf = (name: string) => treasuryMaterials.find((m) => m.name === name)?.amount ?? 0;
  const canPay =
    !!chosen &&
    spiritStones >= chosen.cost.stones &&
    chosen.cost.materials.every((m) => stockOf(m.name) >= m.amount) &&
    hasModel &&
    !busy;

  const submit = () => {
    if (!chosen || busy) return;
    setBusy(true);
    const r = buildSectFacility(cellIndex, chosen.name);
    setNote(r.message);
    if (!r.ok) {
      setBusy(false);
      return;
    }
    const decision = `我在本门山门的空地上调集灵石与材料，营建了一座「${chosen.name}」（属${chosen.kindName}）。`;
    onClose();
    // 楼落了地，再请叙事把这个场面写出来
    void runTurn(decision);
  };

  /** 自拟一座：先请 AI 照口述拟出账目，玩家看过再动土 */
  const design = async () => {
    const name = customName.trim();
    const brief = customBrief.trim();
    if (!name || !brief) {
      setCustomNote("先给这一座起个名，再说说它是什么样、做什么用。");
      return;
    }
    if (designing) return;
    setDesigning(true);
    setCustomNote("");
    setCustom(null);
    try {
      const r = await designSectBuilding({
        name,
        brief,
        nature: scene?.sectNature,
        culture: scene?.culture,
        sectLevel: sect?.level,
      });
      if (!r.custom) {
        setCustomNote("这一座的账目未能立起来，且把说法再讲明白些，重拟一回。");
        setDesigning(false);
        return;
      }
      setCustom(r.custom);
    } catch (e) {
      setCustomNote((e as Error).message);
    }
    setDesigning(false);
  };

  const canPayCustom =
    !!custom &&
    spiritStones >= custom.cost.stones &&
    custom.cost.materials.every((m) => stockOf(m.name) >= m.amount) &&
    hasModel &&
    !busy;

  const submitCustom = () => {
    if (!custom || busy) return;
    const name = customName.trim();
    setBusy(true);
    const r = buildSectFacility(cellIndex, name, custom);
    setCustomNote(r.message);
    if (!r.ok) {
      setBusy(false);
      return;
    }
    const decision = `我在本门山门的空地上调集灵石与材料，营建了一座「${name}」（属${kindLabel(custom.kindId)}）——${custom.info.note}`;
    onClose();
    void runTurn(decision);
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70 px-4"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-gold-500/40 bg-ink-900/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 抬头 */}
        <div className="flex items-start justify-between border-b border-gold-500/20 px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hammer size={16} className="text-gold-400" />
              <span className="font-brush text-xl text-paper-50">营造</span>
              <span className="font-serif text-xs text-paper-400/60">山门空地 · 第 {cellIndex + 1} 格</span>
            </div>
            <div className="mt-1 font-serif text-xs text-paper-400/60">
              宝库灵石 {spiritStones}
              {treasuryMaterials.length > 0
                ? ` · ${treasuryMaterials.map((m) => `${m.name} ${m.amount}`).join("　")}`
                : ""}
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

        {/* 两路：照名录挑 / 自拟一座 */}
        <div className="flex gap-1.5 border-b border-gold-500/10 px-5 py-2">
          {([["list", "照名录挑"], ["custom", "自拟一座"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setNote("");
                setCustomNote("");
              }}
              className={cn(
                "rounded border px-3 py-1 font-serif text-xs transition",
                mode === m
                  ? "border-gold-400/70 bg-gold-400/15 text-gold-200"
                  : "border-paper-400/15 text-paper-400/70 hover:border-gold-500/40 hover:text-gold-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!hasModel && (
            <div className="mb-4 rounded border border-cinnabar-500/40 bg-cinnabar-500/10 px-3 py-2 font-serif text-xs leading-relaxed text-cinnabar-300">
              尚未配置通灵接口。起楼也要交叙事写一段，请先到设置里填上接口，再动土。
            </div>
          )}

          {mode === "list" ? (
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.kindId}>
                  <div className="mb-1.5 font-brush text-sm text-gold-300">{g.list[0]?.kindName}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.list.map((o) => {
                      const affordable =
                        spiritStones >= o.cost.stones && o.cost.materials.every((m) => stockOf(m.name) >= m.amount);
                      return (
                        <button
                          key={o.name}
                          type="button"
                          disabled={!o.unlocked}
                          title={
                            o.unlocked
                              ? `灵石 ${o.cost.stones}${o.cost.materials.map((m) => `、${m.name} ${m.amount}`).join("")}`
                              : `须宗门 ${o.minSectLevel} 级`
                          }
                          onClick={() => {
                            setPicked(o.name);
                            setNote("");
                          }}
                          className={cn(
                            "rounded border px-2 py-1 font-serif text-xs transition",
                            !o.unlocked
                              ? "border-paper-400/10 text-paper-400/30"
                              : picked === o.name
                                ? "border-gold-400/70 bg-gold-400/15 text-gold-200"
                                : affordable
                                  ? "border-paper-400/15 text-paper-300/80 hover:border-gold-500/40 hover:text-gold-300"
                                  : "border-paper-400/10 text-paper-400/45",
                          )}
                        >
                          {o.name}
                          {!o.unlocked && <span className="ml-1 text-[10px]">宗门{o.minSectLevel}级</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-serif text-xs text-ink-light leading-relaxed">
                自己起一座名录上没有的：说清它叫什么、是什么样、做什么用，通灵自会替你拟出营造的耗费、每日的进项与给门中添的好处。看过账目，再决定动土。
              </p>
              <div>
                <div className="font-brush text-xs text-ink-dark mb-1">建筑名</div>
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="如：万剑碑林、听雨阁……"
                  className="w-full rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-sm text-ink-dark outline-none focus:border-gold-500"
                />
              </div>
              <div>
                <div className="font-brush text-xs text-ink-dark mb-1">这一座是什么样、做什么用</div>
                <textarea
                  value={customBrief}
                  onChange={(e) => setCustomBrief(e.target.value)}
                  rows={3}
                  placeholder="如：一座立在半山的碑林，刻着我派历代剑诀，弟子可在此参悟剑意，日久了还能磨出剑穗一类的物什。"
                  className="w-full resize-none rounded border-2 border-ink-lightest/50 bg-paper-old px-2 py-1.5 font-serif text-sm text-ink-dark outline-none focus:border-gold-500"
                />
              </div>
              <button
                type="button"
                onClick={() => void design()}
                disabled={designing || !customName.trim() || !customBrief.trim()}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-3 py-1.5 font-serif text-xs transition",
                  !designing && customName.trim() && customBrief.trim()
                    ? "border-gold-400/50 bg-gold-400/15 text-gold-200 hover:bg-gold-400/25"
                    : "border-paper-400/15 text-paper-400/40",
                )}
              >
                {designing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {designing ? "正在拟账……" : custom ? "重拟一回" : "请通灵拟出账目"}
              </button>

              {customNote && <p className="font-serif text-xs text-cinnabar-300 leading-relaxed">{customNote}</p>}

              {custom && (
                <div className="rounded border border-gold-500/25 bg-ink-800/60 px-3 py-2.5 font-serif text-xs leading-relaxed text-paper-300/90">
                  <div className="mb-1">
                    <span className="text-gold-300">归入</span> {kindLabel(custom.kindId)}
                    {custom.effect ? ` · ${custom.effect}` : ""}
                  </div>
                  <div className="text-paper-400/80">{custom.info.note}</div>
                  <div className="mt-1.5 text-paper-400/70">
                    <span className="text-gold-300">日产</span>{" "}
                    {custom.info.produce?.length
                      ? custom.info.produce.map((p) => `${p.name} ${p.base}`).join("　")
                      : "无"}
                    {custom.info.stone ? "　灵石 " + custom.info.stone : ""}
                    {custom.info.reputation ? "　声望 " + custom.info.reputation : ""}
                  </div>
                  <div className="text-paper-400/70">
                    <span className="text-gold-300">日耗</span> {custom.info.upkeep} 灵石
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 定盘 */}
        <div className="border-t border-gold-500/20 px-5 py-3">
          {mode === "list" ? (
            <>
              {note && <p className="mb-2 font-serif text-xs text-cinnabar-300">{note}</p>}
              {chosen ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 font-serif text-xs text-paper-300/80">
                    营建「<span className="text-paper-100">{chosen.name}</span>」：
                    <span
                      className={cn("font-number", spiritStones >= chosen.cost.stones ? "text-gold-300" : "text-cinnabar-300")}
                    >
                      灵石 {chosen.cost.stones}
                    </span>
                    {chosen.cost.materials.map((m) => (
                      <span
                        key={m.name}
                        className={cn("font-number ml-2", stockOf(m.name) >= m.amount ? "text-gold-300" : "text-cinnabar-300")}
                      >
                        {m.name} {m.amount}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!canPay}
                    onClick={submit}
                    className={cn(
                      "shrink-0 rounded border px-4 py-1.5 font-serif text-sm transition",
                      canPay
                        ? "border-jade-400/50 bg-jade-500/20 text-jade-200 hover:bg-jade-500/30"
                        : "border-paper-400/15 text-paper-400/40",
                    )}
                  >
                    {busy ? "破土动工……" : "动土营建"}
                  </button>
                </div>
              ) : (
                <p className="font-serif text-xs text-paper-400/50">先从上面挑定要盖哪一座。</p>
              )}
            </>
          ) : custom ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 font-serif text-xs text-paper-300/80">
                营建「<span className="text-paper-100">{customName.trim()}</span>」：
                <span
                  className={cn("font-number", spiritStones >= custom.cost.stones ? "text-gold-300" : "text-cinnabar-300")}
                >
                  灵石 {custom.cost.stones}
                </span>
                {custom.cost.materials.map((m) => (
                  <span
                    key={m.name}
                    className={cn("font-number ml-2", stockOf(m.name) >= m.amount ? "text-gold-300" : "text-cinnabar-300")}
                  >
                    {m.name} {m.amount}
                  </span>
                ))}
              </div>
              <button
                type="button"
                disabled={!canPayCustom}
                onClick={submitCustom}
                className={cn(
                  "shrink-0 rounded border px-4 py-1.5 font-serif text-sm transition",
                  canPayCustom
                    ? "border-jade-400/50 bg-jade-500/20 text-jade-200 hover:bg-jade-500/30"
                    : "border-paper-400/15 text-paper-400/40",
                )}
              >
                {busy ? "破土动工……" : "动土营建"}
              </button>
            </div>
          ) : (
            <p className="font-serif text-xs text-paper-400/50">先说清这一座叫什么、做什么用，再请通灵拟账。</p>
          )}
        </div>
      </div>
    </div>
  );
}
