import { useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { ScrollCard } from "@/components/ui/ScrollCard";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { CloudDivider } from "@/components/ui/CloudDivider";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { SKILL_LEVEL_MAX } from "@/data/skills";
import type { Skill, SkillCheck } from "@/data/types";
import { Dices, Hammer, Lightbulb, Map as MapIcon, ScrollText } from "lucide-react";

const KIND_STYLE: Record<string, { text: string; border: string; bg: string; icon: React.ReactNode }> = {
  学识: {
    text: "text-gold-400",
    border: "border-gold-400/30",
    bg: "bg-gold-400/5",
    icon: <ScrollText size={13} />,
  },
  手艺: {
    text: "text-jade-400",
    border: "border-jade-500/30",
    bg: "bg-jade-500/5",
    icon: <Hammer size={13} />,
  },
  阅历: {
    text: "text-paper-300",
    border: "border-paper-400/25",
    bg: "bg-paper-400/5",
    icon: <MapIcon size={13} />,
  },
};

/**
 * 市井本事：不在功法之列，也不是拳脚。
 * 一门一门列着进度，底下是最近几次判定——悬着的那些可以就此认栽。
 */
export function SkillPanel() {
  const skills = useGameStore((s) => s.skills);
  const checks = useGameStore((s) => s.checks);
  const settleCheck = useGameStore((s) => s.settleCheck);
  const [note, setNote] = useState("");

  const pending = checks.filter((c) => c.pending);
  const settled = [...checks].reverse().filter((c) => !c.pending).slice(0, 6);

  return (
    <div className="paper-texture">
      <PanelTitle title="本事" poem="技多不压身，识广不吃亏。市井里的本事，也是一分一分挣来的。" />

      <ScrollCard className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-brush text-base text-pine-400 tracking-widest">身上几门技业</span>
          <span className="font-serif text-[11px] text-paper-400/45">
            共 {skills.length} 门 · 十级为满
          </span>
        </div>

        {skills.length === 0 ? (
          <div className="text-center py-8">
            <Lightbulb size={30} className="mx-auto text-paper-500/30 mb-2" />
            <p className="font-serif text-sm text-paper-400/50">你还未曾立下什么技业。</p>
            <p className="font-serif text-[11px] text-paper-400/35 mt-1">
              开篇叙事里会替你写下几门讨生活的手艺与见识。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} />
            ))}
          </div>
        )}
      </ScrollCard>

      <CloudDivider label="判定" />

      {pending.length > 0 && (
        <ScrollCard className="mb-4 !border-cinnabar-500/40">
          <div className="flex items-center gap-2 mb-2">
            <Dices size={14} className="text-cinnabar-400" />
            <span className="font-brush text-sm text-cinnabar-400">还悬着的</span>
            <span className="font-serif text-[11px] text-paper-400/50 ml-auto">
              学识一类头回失手还留一线
            </span>
          </div>
          <div className="space-y-2">
            {pending.map((c) => (
              <div key={c.id} className="rounded border border-cinnabar-500/25 bg-cinnabar-500/5 p-3">
                <CheckLine check={c} />
                <div className="flex items-center gap-2 mt-2">
                  <SealButton
                    variant="ghost"
                    onClick={() => {
                      settleCheck(c.id, false);
                      setNote(`这一门「${c.skill}」，你认下了。`);
                    }}
                    className="px-3 py-1 text-xs"
                  >
                    承认失败
                  </SealButton>
                  <span className="font-serif text-[11px] text-paper-400/45">
                    也可以在问道里再分说几句，看看能不能把这笔翻过来
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollCard>
      )}

      <ScrollCard>
        <div className="flex items-center gap-2 mb-3">
          <Dices size={14} className="text-gold-400" />
          <span className="font-brush text-base text-gold-400">最近几次</span>
        </div>
        {settled.length === 0 ? (
          <p className="font-serif text-xs text-paper-400/50 py-6 text-center">
            还没考较过什么本事。
          </p>
        ) : (
          <div className="space-y-2">
            {settled.map((c) => (
              <div key={c.id} className="rounded border border-gold-500/15 bg-ink-800/40 p-3">
                <CheckLine check={c} />
              </div>
            ))}
          </div>
        )}
        <p className="font-serif text-[11px] text-paper-400/40 leading-relaxed mt-4">
          判定是掷二十面骰再加上这门本事的等级，够上难度便算过。口才一类不掷骰子，另算。
        </p>
        {note && <p className="font-serif text-xs text-gold-400/80 mt-2">{note}</p>}
      </ScrollCard>
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const style = KIND_STYLE[skill.kind] ?? KIND_STYLE.手艺;
  const ratio = skill.progressMax > 0 ? Math.min(1, skill.progress / skill.progressMax) : 0;
  const full = skill.level >= SKILL_LEVEL_MAX;

  return (
    <ScrollCard className="!p-3">
      <div className="flex items-center gap-2">
        <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded border font-serif text-[11px]", style.text, style.border, style.bg)}>
          {style.icon}
          {skill.kind}
        </span>
        <span className="font-brush text-base text-paper-50 truncate">{skill.name}</span>
        <span className="font-number text-xs text-gold-400 ml-auto shrink-0">
          Lv.{skill.level}
          <span className="text-paper-400/40">/{SKILL_LEVEL_MAX}</span>
        </span>
      </div>

      {skill.desc && (
        <p className="font-serif text-[11px] text-paper-400/60 mt-1.5 leading-relaxed">{skill.desc}</p>
      )}

      <div className="mt-2">
        <div className="h-1.5 rounded-full bg-ink-900/70 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", full ? "bg-gold-400" : "bg-jade-400/80")}
            style={{ width: `${full ? 100 : Math.round(ratio * 100)}%` }}
          />
        </div>
        <div className="font-number text-[10px] text-paper-400/45 mt-1 text-right">
          {full ? "已至化境" : `${skill.progress} / ${skill.progressMax}`}
        </div>
      </div>
    </ScrollCard>
  );
}

function CheckLine({ check }: { check: SkillCheck }) {
  const label = check.success
    ? "成了"
    : check.pending
      ? "未成，还悬着"
      : check.admitted
        ? "认栽"
        : "不成";
  const tone = check.success
    ? "text-jade-400"
    : check.pending
      ? "text-cinnabar-400"
      : "text-paper-400/60";

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-brush text-sm text-paper-50">{check.skill}</span>
        <span className={cn("font-serif text-xs", tone)}>{label}</span>
        <span className="font-number text-[11px] text-paper-400/50 ml-auto">
          掷 {check.roll} + Lv.{check.level} = {check.total} ／ 难度 {check.dc}
        </span>
      </div>
      {check.context && (
        <p className="font-serif text-[11px] text-paper-400/55 mt-1 leading-relaxed">{check.context}</p>
      )}
    </div>
  );
}
