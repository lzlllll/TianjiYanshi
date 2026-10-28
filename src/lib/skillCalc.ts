import type {
  BattleEntity,
  Technique,
  TechniqueCategory,
  TechniquePrerequisite,
  TechniqueSkill,
} from "@/data/types";
import { heartRecoveryFactor, isSpiritTechnique, soulDamageFactor } from "@/lib/attributes";
import { normalizeElement } from "@/data/elements";
import { REALM_NAMES } from "@/data/mockData";

/**
 * 战斗结算里的出招者。AI 只负责照写，数值一律由这里确定性算定，不得随机。
 */
export interface CombatActor {
  realmIndex: number;
  cultivation: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stats: { vitality: number; soul: number; wisdom: number; agility: number };
  /** 心性评分：与这门功法所合的心性越贴，出手越足 */
  heartScores?: { trait: string; score: number }[];
  /** 经脉：通畅则真元走得顺，有损伤便打折扣 */
  meridians?: { clarity: number; maxClarity: number; damage?: boolean }[];
}

/** 一招命中后压在对手身上的负面效果 */
export interface SkillDebuff {
  name: string;
  stat: string;
  valueType: string;
  value: number;
  /** 每柱香额外损失的气血；无则为 0 */
  damagePerStick: number;
  duration: number;
  description: string;
}

/** 一次出招的完整结算结果，summary 供喂给模型照写 */
export interface SkillCast {
  techniqueId: string;
  techniqueName: string;
  skillId: string;
  skillName: string;
  mpCost: number;
  /** 这一招耗掉的气血：心法催运专用，其余招式一律为 0 */
  hpCost: number;
  /** 这一招回复的灵力，已按灵力上限截断 */
  mpRestore: number;
  damage: number;
  debuffs: SkillDebuff[];
  /** 一项项列出这一招的判定依据，如「境界 ×1.24」「心性 ×1.08」 */
  breakdown: string[];
  /** 一行中文结算说明，供喂给模型照写 */
  summary: string;
  /** 这一招是否真的使了出来：灵力不足、气血不足或不必运功时为 false */
  usable: boolean;
}

/** 品阶系数：品阶越高，同一招威能越大 */
const GRADE_FACTOR: Record<string, number> = {
  凡品: 1,
  灵品: 1.15,
  玄品: 1.35,
  天品: 1.6,
  仙品: 2,
};

/**
 * 这门功法修到第几重。返回的是「下一重」的下标，与十重境界一一对应：
 * 下标之前的名次皆已修成，恰落在下标上的那一重便是眼下所求。
 * 熟练度已越过最后一重的门槛时返回 levels.length，即十重皆过、已臻圆满——
 * 不这么收尾，findIndex 会给出 -1，界面上十重光景便会整个回落成第 1 重。
 */
export function techniqueLevelOf(tech: Pick<Technique, "levels" | "proficiency">): number {
  const levels = Array.isArray(tech.levels) ? tech.levels : [];
  if (levels.length === 0) return 1;
  const prof = Number(tech.proficiency) || 0;
  const idx = levels.findIndex((l) => prof < (Number(l.proficiencyNeeded) || 0));
  return idx === -1 ? levels.length : Math.max(1, idx);
}

/**
 * 判一门功法的修炼条件时要看的几样：境界、灵根、心性，以及手里已有哪些功法。
 * 面板与开局建档共用，免得两边各判一套。
 */
export interface TechniquePrereqContext {
  realmIndex: number;
  spiritRoots?: { element: string; value?: number }[];
  heartScores?: { trait: string; score?: number }[];
  techniques?: Pick<Technique, "id" | "name" | "levels" | "proficiency">[];
}

/** 单条条件是否已过 */
function prereqMet(req: TechniquePrerequisite, ctx: TechniquePrereqContext): boolean {
  if (req.type === "realm") {
    // req.value 是大境界名（如「炼气」），按境界扁平表找到它的起始索引再比大小
    const reqStart = REALM_NAMES.findIndex((name) => name.startsWith(String(req.value ?? "")));
    if (reqStart >= 0 && ctx.realmIndex < reqStart) return false;
    return true;
  }
  if (req.type === "technique") {
    const required = (ctx.techniques ?? []).find(
      (t) => t.id === String(req.value) || t.name === String(req.value),
    );
    if (!required) return false;
    return techniqueLevelOf(required) >= (req.minLevel || 1);
  }
  if (req.type === "spiritRoot") {
    // 灵根一律先归到九系正名再比：模型写 fire、火灵根都认作火
    const want = normalizeElement(req.value);
    const root = (ctx.spiritRoots ?? []).find((r) => normalizeElement(r.element) === want);
    if (!root) return false;
    if (req.minLevel && (Number(root.value) || 0) < req.minLevel) return false;
    return true;
  }
  if (req.type === "heartTrait") {
    const score = (ctx.heartScores ?? []).find((hs) => hs.trait === req.value)?.score ?? 0;
    return score >= 50;
  }
  // realmIndex 之外的门类（旧档的 cultivation）没有可比之数，不作拦阻
  return true;
}

/** 这门功法的条件是否都已具备 */
export function meetsTechniquePrereqs(
  tech: Pick<Technique, "prerequisites">,
  ctx: TechniquePrereqContext,
): boolean {
  return (Array.isArray(tech.prerequisites) ? tech.prerequisites : []).every((req) => prereqMet(req, ctx));
}

/**
 * 把过不去的条件摘掉，已具备的留着。
 * 开局那几门功法是随手就有的，若模型替它们写了极高境界或异种灵根，玩家一辈子也修不成；
 * 故开局落账时照玩家当下的情形过一遍，只留下他确实够得着的那几条。
 */
export function stripUnmetPrereqs<T extends Pick<Technique, "prerequisites">>(
  techniques: T[],
  ctx: TechniquePrereqContext,
): T[] {
  return (Array.isArray(techniques) ? techniques : []).map((tech) => {
    const list = Array.isArray(tech.prerequisites) ? tech.prerequisites : [];
    if (list.length === 0) return tech;
    const kept = list.filter((req) => prereqMet(req, ctx));
    return kept.length === list.length ? tech : { ...tech, prerequisites: kept };
  });
}

/**
 * 在一句话里认一招：行动原文里点到的招式名，照最长的那个认。
 * 与 findSkillByName 相反——那个是拿招式名来比，这个是拿话去找招式。
 */
export function findSkillMentionedIn(
  skills: { technique: Technique; skill: TechniqueSkill }[],
  text: string,
): { technique: Technique; skill: TechniqueSkill } | null {
  const body = (text || "").replace(/\s+/g, "");
  if (!body) return null;
  let hit: { technique: Technique; skill: TechniqueSkill } | null = null;
  let hitLen = 0;
  for (const entry of Array.isArray(skills) ? skills : []) {
    const name = (entry.skill.name || "").replace(/\s+/g, "");
    if (name.length > hitLen && body.includes(name)) {
      hit = entry;
      hitLen = name.length;
    }
  }
  return hit;
}

/**
 * 认清这一招落在谁头上：先照 id 找，再照名找，都认不出便就近取一个活着的敌人。
 * 模型偶尔把名字当 id 写，认不出便白算一场，故这里认得宽些；台上没敌人可打才返回 null。
 */
export function resolveBattleTarget(
  entities: BattleEntity[],
  playerId: string,
  rawTarget?: string | null,
): string | null {
  const list = Array.isArray(entities) ? entities : [];
  const alive = list.filter(
    (e) => e.type === "enemy" && !e.isDead && !(typeof e.hp === "number" && e.hp <= 0),
  );
  if (alive.length === 0) return null;

  const raw = (rawTarget || "").trim();
  if (raw) {
    const byId = alive.find((e) => e.id === raw);
    if (byId) return byId.id;
    const byName =
      alive.find((e) => e.name === raw) ??
      alive.find((e) => raw.includes(e.name) || e.name.includes(raw));
    if (byName) return byName.id;
  }

  // 认不出便就近取一个：按曼哈顿距离取最短的，同样不动用随机
  const me = list.find((e) => e.id === playerId);
  if (!me) return alive[0].id;
  const dist = (e: BattleEntity) =>
    Math.abs(e.position.x - me.position.x) + Math.abs(e.position.y - me.position.y);
  return alive.reduce((best, e) => (dist(e) < dist(best) ? e : best), alive[0]).id;
}

/** 没有说明文字时，按受影响的属性给一个中文负面名 */
const STAT_DEBUFF_NAME: Record<string, string> = {
  defense: "护体受损",
  dodge: "步法迟滞",
  speed: "身形滞涩",
  attack: "攻势受挫",
  damage: "劲力涣散",
  vitality: "体魄受创",
  soul: "神魂震荡",
  agility: "身法受阻",
  hp: "持续失血",
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 潜能的四项根基，报判定明细时用 */
const STAT_LABEL: Record<string, string> = {
  vitality: "体魄",
  soul: "神魂",
  wisdom: "悟性",
  agility: "身法",
};

/**
 * 在全部功法里找一招。先按招式名精确匹配，再按去空白后的包含匹配，返回第一个命中。
 */
export function findSkillByName(
  techniques: Technique[],
  name: string,
): { technique: Technique; skill: TechniqueSkill } | null {
  const list = Array.isArray(techniques) ? techniques : [];
  const target = (name || "").trim();
  if (!target) return null;
  const stripped = target.replace(/\s+/g, "");

  // 先精确匹配
  for (const technique of list) {
    for (const skill of technique.skills || []) {
      if ((skill.name || "").trim() === target) return { technique, skill };
    }
  }
  // 再按去空白后的包含匹配
  for (const technique of list) {
    for (const skill of technique.skills || []) {
      const sn = (skill.name || "").replace(/\s+/g, "");
      if (sn && sn.includes(stripped)) return { technique, skill };
    }
  }
  return null;
}

/**
 * 取当前等级已解锁的全部招式，供提示词列出。
 * currentLevelOf 给出每门功法此刻修到第几层。
 */
export function computableSkills(
  techniques: Technique[],
  currentLevelOf: (t: Technique) => number,
): { technique: Technique; skill: TechniqueSkill }[] {
  const list = Array.isArray(techniques) ? techniques : [];
  const result: { technique: Technique; skill: TechniqueSkill }[] = [];
  for (const technique of list) {
    const level = currentLevelOf(technique);
    for (const skill of technique.skills || []) {
      if (level >= skill.levelRequired) result.push({ technique, skill });
    }
  }
  return result;
}

/** 每门功法主修哪一路属性：心法看悟性，炼体看体魄，身法看身法，神通与秘术看神魂 */
export function primaryStatOf(category: TechniqueCategory): keyof CombatActor["stats"] {
  switch (category) {
    case "心法":
      return "wisdom";
    case "炼体":
      return "vitality";
    case "身法":
      return "agility";
    case "神通":
    case "秘术":
      return "soul";
    default:
      return "soul";
  }
}

/**
 * 是不是「心法催运」那一招：拿气血换灵力。
 * 只有心法类功法能走这一路，且耗血与回灵都得写正数——少一样便当普通招式处理。
 */
export function isHeartConversion(technique: Technique, skill: TechniqueSkill): boolean {
  if (technique.category !== "心法") return false;
  const hp = Number(skill.hpCost) || 0;
  const restore = Number(skill.mpRestore) || 0;
  return hp > 0 && restore > 0;
}

/**
 * 确定性算一招的伤害、耗灵与负面效果。全部取整，不得随机。
 */
export function computeSkillCast(args: {
  actor: CombatActor;
  technique: Technique;
  skill: TechniqueSkill;
}): SkillCast {
  const { actor, technique, skill } = args;

  const realmFactor = 1 + actor.realmIndex * 0.06;
  const primary = primaryStatOf(technique.category);
  const attrValue = actor.stats && typeof actor.stats[primary] === "number" ? actor.stats[primary] : 0;
  const attrFactor = 1 + attrValue / 200;
  const profMax = Math.max(1, technique.proficiencyMax || 0);
  const profRatio = clamp((technique.proficiency || 0) / profMax, 0, 1);
  const profFactor = 0.6 + 0.4 * profRatio;
  const gradeFactor = GRADE_FACTOR[technique.grade] ?? 1;

  // 心性：这门功法所合的心性越贴，出手越足；一条都没写便按中平算
  const heartTraits = Array.isArray(technique.heartMatch) ? technique.heartMatch : [];
  const scores = Array.isArray(actor.heartScores) ? actor.heartScores : [];
  const heartAvg =
    heartTraits.length > 0
      ? heartTraits.reduce(
          (sum, trait) => sum + (scores.find((h) => h.trait === trait)?.score ?? 0),
          0,
        ) / heartTraits.length
      : 50;
  const heartFactor = 0.9 + (clamp(heartAvg, 0, 100) / 100) * 0.3;

  // 经脉：通畅则真元走得顺，有损伤便打折扣
  const meridians = Array.isArray(actor.meridians) ? actor.meridians : [];
  const avgClarity =
    meridians.length > 0
      ? meridians.reduce((sum, m) => sum + (Number(m.clarity) || 0), 0) / meridians.length
      : 50;
  const damagedCount = meridians.filter((m) => m.damage).length;
  const meridianFactor = clamp(0.85 + (avgClarity / 100) * 0.3 - damagedCount * 0.05, 0.5, 1.2);

  const breakdown = [
    `境界 ×${realmFactor.toFixed(2)}`,
    `潜能·${STAT_LABEL[primary] ?? primary} ${attrValue} ×${attrFactor.toFixed(2)}`,
    `熟练 ${Math.round(profRatio * 100)}% ×${profFactor.toFixed(2)}`,
    `品阶 ${technique.grade} ×${gradeFactor.toFixed(2)}`,
    `心性 ${Math.round(heartAvg)} ×${heartFactor.toFixed(2)}`,
    `经脉 通畅 ${Math.round(avgClarity)}${damagedCount > 0 ? ` 带伤 ${damagedCount} 条` : ""} ×${meridianFactor.toFixed(2)}`,
  ];

  // 心法催运：以气血换灵力。这一路不耗灵力，反过来补灵力
  const heartConvert = isHeartConversion(technique, skill);
  const wantHp = heartConvert ? Math.max(1, Math.round(Number(skill.hpCost) || 0)) : 0;
  const wantRestore = heartConvert ? Math.max(1, Math.round(Number(skill.mpRestore) || 0)) : 0;

  const base: SkillCast = {
    techniqueId: technique.id,
    techniqueName: technique.name,
    skillId: skill.id,
    skillName: skill.name,
    mpCost: heartConvert ? 0 : Math.max(0, Math.round(skill.mpCost || 0)),
    hpCost: 0,
    mpRestore: 0,
    damage: 0,
    debuffs: [],
    breakdown,
    summary: "",
    usable: false,
  };

  // 心法催运那一路：不看灵力够不够，只看气血撑不撑得住、灵力是不是已经满了
  if (heartConvert) {
    if (actor.mp >= actor.maxMp) {
      return { ...base, summary: `你欲运转「${skill.name}」补气，然灵力已满，不必再耗气血。` };
    }
    // 扣完须留一口气，见底便是拿命换气，不做
    if (actor.hp <= wantHp) {
      return { ...base, summary: `你欲运转「${skill.name}」，然气血不足，这一门运不起来。` };
    }
    // 这门心法的品阶与本人经脉的贯通程度，定这一手补回来多少灵力
    const recoveryFactor = heartRecoveryFactor(technique.grade, actor.meridians);
    const restored = Math.min(
      Math.max(1, Math.round(wantRestore * recoveryFactor)),
      Math.max(0, actor.maxMp - actor.mp),
    );
    return {
      ...base,
      usable: true,
      hpCost: wantHp,
      mpRestore: restored,
      breakdown: [...breakdown, `心法回灵 ×${recoveryFactor.toFixed(2)}`, `心法催运 气血 -${wantHp} → 灵力 +${restored}`],
      summary: `你运转「${skill.name}」，耗气血 ${wantHp}，回复灵力 ${restored}。`,
    };
  }

  // 灵力不足：此招施展不出，伤害与负面效果都清空
  if (actor.mp < base.mpCost) {
    return {
      ...base,
      mpCost: 0,
      damage: 0,
      debuffs: [],
      summary: `你欲施展「${skill.name}」，然灵力不足，此招施展不出。`,
    };
  }

  // 精神类功法（神通、秘术）另受神魂加持：神魂愈凝，催出去的力愈沉
  const spiritFactor = isSpiritTechnique(technique.category)
    ? soulDamageFactor(actor.stats?.soul ?? 0)
    : 1;
  const damage = Math.max(
    0,
    Math.round(
      (skill.damage || 0) *
        realmFactor *
        attrFactor *
        profFactor *
        gradeFactor *
        heartFactor *
        meridianFactor *
        spiritFactor,
    ),
  );
  if (spiritFactor !== 1) breakdown.push(`神魂加持 ×${spiritFactor.toFixed(2)}`);

  const rawDuration =
    typeof skill.debuffDuration === "number" && Number.isFinite(skill.debuffDuration)
      ? skill.debuffDuration
      : 3;
  const duration = clamp(Math.round(rawDuration), 1, 12);

  const debuffs: SkillDebuff[] = (skill.effects || []).map((effect) => {
    const stat = effect.stat ? String(effect.stat) : "";
    const valueType = String(effect.valueType ?? "");
    const value = typeof effect.value === "number" && Number.isFinite(effect.value) ? effect.value : 0;
    const description = effect.description || "";
    const name = description ? description.slice(0, 6) : STAT_DEBUFF_NAME[stat] || "受创";
    const damagePerStick = stat === "hp" && valueType === "fixed" ? value : 0;
    return { name, stat, valueType, value, damagePerStick, duration, description };
  });

  const summary = buildSummary(base.skillName, base.mpCost, damage, debuffs);

  return { ...base, usable: true, damage, debuffs, summary };
}

/** 拼一行中文结算说明 */
function buildSummary(
  skillName: string,
  mpCost: number,
  damage: number,
  debuffs: SkillDebuff[],
): string {
  if (debuffs.length === 0) {
    if (damage > 0) {
      return `你施展「${skillName}」，耗灵力 ${mpCost}，对目标造成 ${damage} 点伤害。`;
    }
    return `你施展「${skillName}」，耗灵力 ${mpCost}，不造成伤害。`;
  }

  const clauses = debuffs
    .map((d) => `「${d.name}」${d.duration} 柱${d.damagePerStick > 0 ? `，每柱再损 ${d.damagePerStick} 点气血` : ""}`)
    .join("；");

  if (damage > 0) {
    return `你施展「${skillName}」，耗灵力 ${mpCost}，对目标造成 ${damage} 点伤害；并使其中${clauses}。`;
  }
  return `你施展「${skillName}」，耗灵力 ${mpCost}，不造成伤害，仅施加${clauses}。`;
}

/** 一次出招落到战场上的结果 */
export interface BattleLocalResult {
  entities: BattleEntity[];
  /** 由本次判定定死的实体：收尾时这几位的气血以本地为准，模型只管叙事与走位 */
  owned: string[];
  /** 本次实际扣掉的灵力 */
  mpSpent: number;
  /** 本次实际扣掉的气血：心法催运专用，其余招式一律为 0 */
  hpSpent: number;
  /** 本次实际回复的灵力：心法催运专用，其余招式一律为 0 */
  mpRestored: number;
}

/**
 * 把本地算定的这一招落到实体上：目标扣气血、判生死，自己按走位挪窝。
 * 伤害与耗灵一律以此为准，不让模型再算一遍。
 */
export function applyBattleCast(args: {
  entities: BattleEntity[];
  playerId: string;
  cast: SkillCast | null;
  targetId?: string | null;
  moveTo?: { x: number; y: number } | null;
}): BattleLocalResult {
  const { entities, playerId, cast, targetId, moveTo } = args;
  const owned: string[] = [];
  const list = (Array.isArray(entities) ? entities : []).map((e) => ({ ...e, position: { ...e.position } }));

  // 走位先落：那一格若已有人站着便不挪，免得叠在一处
  if (moveTo && Number.isFinite(moveTo.x) && Number.isFinite(moveTo.y)) {
    const me = list.find((e) => e.id === playerId);
    if (me) {
      const occupied = list.some(
        (o) =>
          o.id !== me.id &&
          !o.isDead &&
          o.position.x === moveTo.x &&
          o.position.y === moveTo.y,
      );
      if (!occupied) {
        me.position = { x: moveTo.x, y: moveTo.y };
        // 走位既已定下，这一位的位置便以本地为准
        owned.push(me.id);
      }
    }
  }

  // 施展不出（灵力不足）那一支的 mpCost 已被清成 0，此处照实取用
  const mpSpent = cast ? Math.max(0, cast.mpCost) : 0;
  const hpSpent = cast ? Math.max(0, cast.hpCost) : 0;
  const mpRestored = cast ? Math.max(0, cast.mpRestore) : 0;

  // 心法催运先落自己身上：扣气血、补灵力，扣完留一口气在
  if (cast && (hpSpent > 0 || mpRestored > 0)) {
    const me = list.find((e) => e.id === playerId);
    if (me) {
      if (hpSpent > 0 && typeof me.hp === "number") {
        me.hp = Math.max(1, me.hp - hpSpent);
      }
      if (mpRestored > 0 && typeof me.mp === "number") {
        const maxMp = typeof me.maxMp === "number" ? me.maxMp : me.mp + mpRestored;
        me.mp = Math.min(maxMp, me.mp + mpRestored);
      }
      owned.push(me.id);
    }
  }

  if (cast && cast.damage > 0 && targetId) {
    const target = list.find((e) => e.id === targetId);
    if (target && !target.isDead && typeof target.hp === "number") {
      const maxHp = typeof target.maxHp === "number" ? target.maxHp : target.hp;
      const next = clamp(target.hp - cast.damage, 0, Math.max(0, maxHp));
      target.hp = next;
      if (next <= 0) target.isDead = true;
      owned.push(target.id);
    }
  }

  return { entities: list, owned, mpSpent, hpSpent, mpRestored };
}
