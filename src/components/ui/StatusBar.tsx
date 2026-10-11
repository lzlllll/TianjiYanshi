import { cn } from "@/lib/utils";

interface StatusBarProps {
  label: string;
  current: number;
  max: number;
  color: "hp" | "mp" | "spirit";
  icon?: string;
  /** 紧凑模式：缩小标签区与条高，用于多条并排 */
  compact?: boolean;
  className?: string;
}

const colorMap = {
  hp: {
    bar: "from-cinnabar-darker via-cinnabar to-cinnabar-light",
    text: "text-cinnabar",
    glow: "rgba(193, 67, 46, 0.4)",
  },
  mp: {
    bar: "from-pine-700 via-jade-500 to-pine-400",
    text: "text-jade-400",
    glow: "rgba(90, 138, 114, 0.4)",
  },
  spirit: {
    bar: "from-gold-dark via-gold to-gold-light",
    text: "text-gold",
    glow: "rgba(212, 175, 55, 0.4)",
  },
};

export function StatusBar({ label, current, max, color, icon, compact, className }: StatusBarProps) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const c = colorMap[color];
  return (
    <div className={cn("flex items-center", compact ? "gap-2" : "gap-3", className)}>
      <div className={cn("flex items-center shrink-0", compact ? "gap-1 w-14" : "gap-1.5 w-24")}>
        {icon && <span className={compact ? "text-xs" : "text-base"}>{icon}</span>}
        <span className={cn("text-caption whitespace-nowrap", c.text)}>{label}</span>
      </div>
      <div
        className={cn(
          "flex-1 bg-paper-dark rounded-sm border-2 border-ink-lightest overflow-hidden relative",
          compact ? "h-4" : "h-5",
        )}
      >
        <div
          className={cn("h-full bg-gradient-to-b transition-smooth", c.bar)}
          style={{
            width: `${pct}%`,
            boxShadow: `0 0 8px ${c.glow}`,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-number text-xs text-ink-dark drop-shadow-sm whitespace-nowrap">
            {current} / {max}
          </span>
        </div>
      </div>
    </div>
  );
}
