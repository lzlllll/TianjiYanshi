import { cn } from "@/lib/utils";

interface PanelTitleProps {
  title: string;
  poem?: string;
  className?: string;
}

export function PanelTitle({ title, poem, className }: PanelTitleProps) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-baseline gap-4">
        <h2 className="text-title title-ornament text-ink-darkest tracking-widest">
          {title}
        </h2>
        <div className="flex-1 book-divider" />
      </div>
      {poem && (
        <p className="text-caption text-ink-lightest mt-2 italic tracking-wide">
          {poem}
        </p>
      )}
    </div>
  );
}
