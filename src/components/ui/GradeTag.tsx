import { cn } from "@/lib/utils";
import type { ItemGrade } from "@/data/types";

interface GradeTagProps {
  grade: ItemGrade;
  className?: string;
}

const gradeStyle: Record<string, string> = {
  凡品: "border-ink-lightest text-ink-medium bg-ink-lightest",
  灵品: "border-jade-500 text-jade-400 bg-jade-500",
  玄品: "border-cinnabar text-cinnabar bg-cinnabar",
  天品: "border-gold text-gold bg-gold",
  仙品: "border-gold-light text-gold-light bg-gold-light",
};

const DEFAULT_GRADE_STYLE = "border-ink-lightest text-ink-medium bg-ink-lightest";

export function GradeTag({ grade, className }: GradeTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-sm border text-xs text-caption tracking-wider",
        gradeStyle[grade] || DEFAULT_GRADE_STYLE,
        className,
      )}
    >
      {grade}
    </span>
  );
}
