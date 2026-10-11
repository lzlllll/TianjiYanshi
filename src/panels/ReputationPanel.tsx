import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import {
  REPUTATION_AXES,
  REPUTATION_LABELS,
  REPUTATION_MAX,
  reputationWords,
} from "@/data/reputation";
import type { ReputationAxis } from "@/data/types";
import { cn } from "@/lib/utils";

/** 四条名声各有各的颜色：正道青、魔道朱、平民松、官府金 */
const AXIS_COLOR: Record<ReputationAxis, { text: string; bar: string }> = {
  righteous: { text: "text-jade-400", bar: "bg-gradient-to-r from-jade-600 to-jade-400" },
  demonic: { text: "text-cinnabar-400", bar: "bg-gradient-to-r from-cinnabar-700 to-cinnabar-400" },
  folk: { text: "text-pine-400", bar: "bg-gradient-to-r from-pine-600 to-pine-400" },
  official: { text: "text-gold-400", bar: "bg-gradient-to-r from-gold-600 to-gold-400" },
};

/** 20 / 40 / 60 / 80 上各有一道浅痕，看得出攒到哪一档了 */
const BAND_MARKS = [20, 40, 60, 80];

export function ReputationPanel() {
  const reputation = useGameStore((s) => s.reputation);

  return (
    <div className="space-y-4">
      <ScrollCard className="!p-4">
        <p className="font-serif text-xs leading-relaxed text-paper-300/70">
          名声是旁人嘴里的你，与你自认的人品未必相干。正道怎么看你、魔道怎么看你、街坊怎么看你、官面上怎么看你，四条各走各的，互不相抵——满手血腥的人，未必就没有百姓念他救过命。
        </p>
      </ScrollCard>

      <div className="grid grid-cols-1 gap-3">
        {REPUTATION_AXES.map((axis) => {
          const value = reputation?.[axis] ?? 0;
          const c = AXIS_COLOR[axis];
          return (
            <ScrollCard key={axis} className="!p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className={cn("font-brush text-base tracking-wider", c.text)}>
                  {REPUTATION_LABELS[axis]}
                </span>
                <span className="font-number text-sm text-paper-200">
                  {value}
                  <span className="text-paper-400/50 text-xs"> / {REPUTATION_MAX}</span>
                </span>
              </div>

              <div className="relative h-2.5 bg-ink-900/80 rounded-sm overflow-hidden border border-paper-400/10">
                <div
                  className={cn("h-full transition-all duration-500", c.bar)}
                  style={{ width: `${(value / REPUTATION_MAX) * 100}%` }}
                />
                {BAND_MARKS.map((mark) => (
                  <div
                    key={mark}
                    className="absolute top-0 bottom-0 w-px bg-paper-400/15"
                    style={{ left: `${(mark / REPUTATION_MAX) * 100}%` }}
                  />
                ))}
              </div>

              <p className="mt-2 font-serif text-xs text-paper-300/80 leading-relaxed">
                {reputationWords(axis, value)}
              </p>
            </ScrollCard>
          );
        })}
      </div>

      <ScrollCard className="!p-4">
        <p className="font-serif text-xs leading-relaxed text-paper-400/55">
          牙行里领的差事，办成办砸都在这上头有增减；行路做事，旁人也都看着。名声在外，初见时人家心里先有个底：正道、平民、官府三处攒得厚，见面便客气三分；魔道的名头太盛，人家先存着几分戒心。
        </p>
      </ScrollCard>
    </div>
  );
}
