import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
  barClassName?: string;
  showText?: boolean;
  height?: number;
}

export function ProgressBar({
  value,
  max,
  className,
  barClassName,
  showText,
  height = 8,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn(
        "relative w-full bg-paper-dark rounded-sm border-2 border-ink-lightest overflow-hidden",
        className,
      )}
      style={{ height }}
    >
      <div
        className={cn(
          "h-full bg-gradient-to-r from-gold-dark to-gold transition-smooth",
          barClassName,
        )}
        style={{ width: `${pct}%` }}
      />
      {showText && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-number text-xs text-ink-dark drop-shadow-sm">
            {value} / {max}
          </span>
        </div>
      )}
    </div>
  );
}
