/**
 * 招式能及到的范围。
 *
 * 战斗里先按阵图判一判谁在这一招的范围之内，够得着的才谈得上打中；
 * 这一判由本地定死，判完再把结果交给模型照写，不让模型自己掂量远近。
 * 范围以自身所在的一格为心，四周按形制铺开：
 * 近身是贴身八格，十字是上下左右四条臂，叉状是四条斜线，
 * 矩形是以自身为中心的方阵，环绕是整圈。
 */

import type { BattleEntity, SkillRangeShape, TechniqueCategory, TechniqueSkill } from "./types";

export const SKILL_RANGE_SHAPES: SkillRangeShape[] = ["近身", "十字", "叉状", "矩形", "环绕"];

/** 范围最多伸出去几格：再远阵图也摆不下 */
export const RANGE_SIZE_MAX = 4;

/** 一种范围：形制加上伸出去几格；带 pattern 的以自拟阵图为准 */
export interface SkillRange {
  shape: SkillRangeShape;
  size: number;
  /** 自拟阵图摊开的相对格子；有它便不看形制 */
  pattern?: { dx: number; dy: number }[];
}

/** 自拟阵图最大 5×5 */
export const RANGE_PATTERN_MAX = 5;

/**
 * 把 0/1 的阵图串成相对格子。
 * 每行一串 0 与 1，1 为可及；中心以最长那一行的当中算，自身所在的一格不算在内。
 * 写坏了、或一个 1 也没有，返回 null，退回形制去算。
 */
export function parseRangePattern(raw: unknown): { dx: number; dy: number }[] | null {
  const rows = Array.isArray(raw)
    ? raw.map((r) => String(r ?? "").replace(/[^01]/g, "")).filter((r) => r.length > 0)
    : [];
  const list = rows.slice(0, RANGE_PATTERN_MAX).map((r) => r.slice(0, RANGE_PATTERN_MAX));
  if (list.length === 0) return null;
  // 不论写了 3 行还是 5 行，一律摆进 5×5 的正中，好让阵图与缩略图对得上
  const startY = Math.floor((RANGE_PATTERN_MAX - list.length) / 2);
  const out: { dx: number; dy: number }[] = [];
  list.forEach((row, y) => {
    const startX = Math.floor((RANGE_PATTERN_MAX - row.length) / 2);
    [...row].forEach((ch, x) => {
      if (ch !== "1") return;
      const dx = startX + x - 2;
      const dy = startY + y - 2;
      if (dx !== 0 || dy !== 0) out.push({ dx, dy });
    });
  });
  return out.length > 0 ? out : null;
}

/** 只写了形制、没写格数时，各形制的常例 */
const SHAPE_DEFAULT_SIZE: Record<SkillRangeShape, number> = {
  近身: 1,
  十字: 2,
  叉状: 2,
  矩形: 1,
  环绕: 2,
};

/** 各形制摊在阵图上的样子，给提示词与悬浮缩略图共用一句话 */
export const RANGE_SHAPE_HINT: Record<SkillRangeShape, string> = {
  近身: "贴身八格，须近身才够得着",
  十字: "以自身为心，上下左右各伸出若干格",
  叉状: "以自身为心，四条斜线各伸出若干格",
  矩形: "以自身为中心的方阵，横竖俱及",
  环绕: "以自身为心的一整圈，斜角也算在内",
};

/** 没写范围的招式按功法门类给一个常例 */
export function defaultRangeOf(category: TechniqueCategory): SkillRange {
  switch (category) {
    case "炼体":
      return { shape: "近身", size: 1 };
    case "身法":
      return { shape: "十字", size: 2 };
    case "神通":
      return { shape: "矩形", size: 1 };
    case "秘术":
      return { shape: "叉状", size: 2 };
    case "心法":
    default:
      return { shape: "近身", size: 1 };
  }
}

/** 这一招的范围：写了自拟阵图便照阵图，否则照形制；格数一律夹在范围之内 */
export function skillRange(
  skill: Pick<TechniqueSkill, "rangeShape" | "rangeSize" | "rangePattern">,
  category: TechniqueCategory,
): SkillRange {
  const fallback = defaultRangeOf(category);
  const shape = SKILL_RANGE_SHAPES.includes(skill.rangeShape as SkillRangeShape)
    ? (skill.rangeShape as SkillRangeShape)
    : fallback.shape;
  const raw = Number(skill.rangeSize);
  const size =
    shape === "近身"
      ? 1
      : Math.min(
          RANGE_SIZE_MAX,
          Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.round(raw) : SHAPE_DEFAULT_SIZE[shape]),
        );
  const pattern = parseRangePattern(skill.rangePattern);
  return pattern ? { shape, size, pattern } : { shape, size };
}

/** 范围的一句话说法，如「十字（2 格）」「自拟（7 格）」 */
export function rangeLabel(range: SkillRange): string {
  if (range.pattern && range.pattern.length > 0) return `自拟（${range.pattern.length} 格）`;
  if (range.shape === "近身") return "近身（贴身八格）";
  if (range.shape === "矩形") return `矩形（${range.size * 2 + 1}×${range.size * 2 + 1} 格）`;
  return `${range.shape}（${range.size} 格）`;
}

/** 摊在缩略阵图上的边长：自拟的一律按 5×5 摆 */
export function rangeSpan(range: SkillRange): number {
  if (range.pattern && range.pattern.length > 0) return RANGE_PATTERN_MAX;
  return range.shape === "近身" ? 3 : range.size * 2 + 1;
}

/** 范围摊开的相对格子，以自身为原点，供阵图与缩略图共用 */
export function rangeOffsets(range: SkillRange): { dx: number; dy: number }[] {
  if (range.pattern && range.pattern.length > 0) return range.pattern;
  const size = range.shape === "近身" ? 1 : range.size;
  const out: { dx: number; dy: number }[] = [];
  for (let dy = -size; dy <= size; dy++) {
    for (let dx = -size; dx <= size; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const hit =
        range.shape === "近身"
          ? Math.max(ax, ay) === 1
          : range.shape === "十字"
            ? ax + ay <= size && (ax === 0 || ay === 0)
            : range.shape === "叉状"
              ? ax === ay && ax <= size
              : range.shape === "矩形"
                ? true
                : Math.max(ax, ay) <= size;
      if (hit) out.push({ dx, dy });
    }
  }
  return out;
}

/** 这一招自某处施展开来，能及到阵图上的哪些格 */
export function rangeCells(
  origin: { x: number; y: number },
  range: SkillRange,
  width: number,
  height: number,
): Set<string> {
  const cells = new Set<string>();
  for (const { dx, dy } of rangeOffsets(range)) {
    const x = origin.x + dx;
    const y = origin.y + dy;
    if (x >= 0 && y >= 0 && x < width && y < height) cells.add(`${x},${y}`);
  }
  return cells;
}

/** 还活着的敌方 */
export function aliveEnemies(entities: BattleEntity[] | null | undefined): BattleEntity[] {
  return (Array.isArray(entities) ? entities : []).filter(
    (e) => e.type === "enemy" && !e.isDead && !(typeof e.hp === "number" && e.hp <= 0),
  );
}

/** 范围内还活着的敌人，按阵图上的远近排 */
export function enemiesInRange(
  entities: BattleEntity[] | null | undefined,
  origin: { x: number; y: number },
  range: SkillRange,
  width: number,
  height: number,
): BattleEntity[] {
  const cells = rangeCells(origin, range, width, height);
  return aliveEnemies(entities).filter((e) => cells.has(`${e.position.x},${e.position.y}`));
}
