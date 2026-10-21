import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { SealButton } from "@/components/ui/SealButton";
import { BEAST_BOND_MAX, bondWords } from "@/data/beast";
import type { InventoryItem, SpiritBeast } from "@/data/types";

/** 兽的几项底子，横着摆一排 */
function BeastStats({ beast }: { beast: SpiritBeast }) {
  const rows = [
    { label: "气血", value: `${beast.hp} / ${beast.hpMax}` },
    { label: "攻", value: String(beast.attack) },
    { label: "防", value: String(beast.defense) },
    { label: "身法", value: String(beast.speed) },
  ];
  return (
    <div className="grid grid-cols-4 gap-2 mt-3">
      {rows.map((r) => (
        <div key={r.label} className="rounded border border-paper-400/15 bg-ink-900/40 px-2 py-1.5 text-center">
          <div className="font-serif text-[10px] text-paper-400/50">{r.label}</div>
          <div className="font-number text-xs text-paper-100 mt-0.5">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * 随身灵兽：一身只带一头。
 * 兽是从灵兽栏买来的，收作随身后才跟着上路；遇斗时替你出手，由叙事里的人来演。
 */
export function BeastPanel() {
  const beast = useGameStore((s) => s.beast);
  const inventory = useGameStore((s) => s.inventory);
  const tameBeast = useGameStore((s) => s.tameBeast);
  const releaseBeast = useGameStore((s) => s.releaseBeast);

  // 行囊里还养着的兽：灵兽栏买下的那一类；笼上蒙着布、还看不出是什么的旧物，得先鉴过再说
  const candidates: InventoryItem[] = inventory.filter(
    (i) => i.type === "灵兽" && i.count > 0 && !i.mystery,
  );

  return (
    <div className="space-y-4">
      {beast ? (
        <ScrollCard className="!p-4">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded red-seal text-xl shrink-0 bg-pine-500">{beast.icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-brush text-lg text-paper-50 truncate">{beast.name}</h3>
              <p className="font-serif text-xs text-pine-400/80 mt-0.5">{beast.temper || "自有性子"}</p>
              {beast.desc && (
                <p className="font-serif text-xs text-paper-300/75 leading-relaxed mt-1.5">{beast.desc}</p>
              )}
            </div>
          </div>

          <BeastStats beast={beast} />

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-serif text-xs text-paper-400/60">亲疏</span>
              <span className="font-number text-xs text-paper-300">
                {beast.bond} / {BEAST_BOND_MAX}
              </span>
            </div>
            <div className="h-2 bg-ink-900/80 rounded-sm overflow-hidden border border-paper-400/10">
              <div
                className="h-full transition-all duration-500 bg-gradient-to-r from-pine-600 to-jade-400"
                style={{ width: `${(beast.bond / BEAST_BOND_MAX) * 100}%` }}
              />
            </div>
            <p className="mt-2 font-serif text-xs text-paper-300/75">{bondWords(beast.bond)}</p>
          </div>

          <div className="mt-3 flex justify-end">
            <SealButton
              onClick={releaseBeast}
              variant="ghost"
              className="py-1.5 text-xs"
              title="放它回山里；往后想再带一头，得重新去灵兽栏寻"
            >
              放归山林
            </SealButton>
          </div>
        </ScrollCard>
      ) : (
        <ScrollCard className="!p-4">
          <p className="font-serif text-xs leading-relaxed text-paper-300/70">
            你身边没有带着兽。灵兽栏里买下一头，在这儿收作随身，它便跟着你上路——遇上打斗时替你出手，路上的一举一动由叙事里的人来演。
          </p>
        </ScrollCard>
      )}

      {candidates.length > 0 && (
        <ScrollCard title="行囊里的兽" subtitle="收作随身，它便不再算一件行囊里的东西" className="!p-4">
          <div className="space-y-2">
            {candidates.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded border border-paper-400/15 bg-ink-900/40 px-3 py-2"
              >
                <div className="w-9 h-9 rounded red-seal text-sm shrink-0 bg-pine-500">{item.icon || "兽"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-brush text-sm text-paper-50 truncate">{item.name}</div>
                  <div className="font-serif text-[11px] text-paper-400/60 truncate">
                    {item.grade} · {item.desc || "一头活物"}
                  </div>
                </div>
                <SealButton
                  onClick={() => tameBeast(item.id)}
                  className="py-1.5 text-xs shrink-0"
                  title={beast ? "换这一头；眼下带着的那头就得放归了" : "收作随身，往后与你同行"}
                >
                  {beast ? "换这一头" : "收作随身"}
                </SealButton>
              </div>
            ))}
          </div>
        </ScrollCard>
      )}
    </div>
  );
}
