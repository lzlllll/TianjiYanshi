import type { DataOp } from "@/data/types";
import { describeOps, type OpChangeTone } from "@/lib/dataOps";
import { cn } from "@/lib/utils";

/** 末尾至多列几条，余下的归作一句「另 N 项」 */
const MAX_CHANGES = 12;

/** 两色：得着的写绿，折了的写红，说不清的照旧 */
const TONE_CLASS: Record<OpChangeTone, string> = {
  gain: "text-jade-400",
  loss: "text-cinnabar-300",
  flat: "text-paper-300/80",
};

/**
 * 叙事末尾列一笔这一段落到账上的变化：得着的写绿，折了的写红。
 * 没有变化便什么都不画。
 */
export function ChangeNotice({ ops, className }: { ops?: DataOp[]; className?: string }) {
  const changes = describeOps(ops ?? []);
  if (changes.length === 0) return null;

  const shown = changes.slice(0, MAX_CHANGES);
  return (
    <div className={cn("mt-3 border-t border-gold-500/20 pt-2", className)}>
      <p className="mb-1.5 font-serif text-[11px] tracking-wider text-paper-400/60">此番定数</p>
      <ul className="space-y-0.5">
        {shown.map((c, i) => (
          <li key={i} className={cn("font-serif text-[12px] leading-relaxed", TONE_CLASS[c.tone])}>
            {c.text}
          </li>
        ))}
        {changes.length > shown.length && (
          <li className="font-serif text-[12px] text-paper-400/50">
            ……另 {changes.length - shown.length} 项
          </li>
        )}
      </ul>
    </div>
  );
}
