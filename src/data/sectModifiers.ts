/**
 * 宗门修正名录。
 *
 * 政策、态势一类的时效，由叙事添上、到期自灭。为避免模型自造离谱的修正，
 * 名目一律从这张硬编码名录里挑；叙事只报 id 与持续日子，其余由这里定。
 * 生效之处：宗门建筑的产出（resourceMul）、每日声望（reputationPerDay）、
 * 门中修炼效率（cultivationMul，乘在宗门内修炼上）。
 */

import type { SectModifier } from "@/data/types";

export interface SectModifierSpec {
  id: string;
  name: string;
  desc: string;
  /** 常例持续多少日 */
  days: number;
  effects: {
    /** 宗门建筑产出倍率 */
    resourceMul?: number;
    /** 每日宗门声望增减 */
    reputationPerDay?: number;
    /** 门中修炼效率倍率 */
    cultivationMul?: number;
  };
}

export const SECT_MODIFIERS: SectModifierSpec[] = [
  {
    id: "mod-open-gates",
    name: "广开山门",
    desc: "大开方便之门，四方来投，人气与进项都旺些。",
    days: 60,
    effects: { resourceMul: 1.12, reputationPerDay: 1 },
  },
  {
    id: "mod-seclusion",
    name: "闭关清修",
    desc: "闭门谢客，全门静修，外务一概搁下。",
    days: 30,
    effects: { cultivationMul: 1.15, resourceMul: 0.9 },
  },
  {
    id: "mod-grand-build",
    name: "大兴土木",
    desc: "广筑楼台，出项大增，门人劳苦颇有怨言。",
    days: 45,
    effects: { resourceMul: 1.2, reputationPerDay: -1 },
  },
  {
    id: "mod-debate",
    name: "论道大会",
    desc: "广邀同道登门论道，一时声名远播。",
    days: 15,
    effects: { reputationPerDay: 3 },
  },
  {
    id: "mod-relief",
    name: "赈济四方",
    desc: "开仓赈济灾民，善名日隆，只是库中见耗。",
    days: 30,
    effects: { reputationPerDay: 2, resourceMul: 0.94 },
  },
  {
    id: "mod-strict-rules",
    name: "门规森严",
    desc: "执法严苛，弟子不敢懈怠，外人却颇有微词。",
    days: 60,
    effects: { cultivationMul: 1.1, reputationPerDay: -1 },
  },
  {
    id: "mod-infighting",
    name: "内斗不休",
    desc: "同门阋墙，各房相争，诸事俱废。",
    days: 30,
    effects: { cultivationMul: 0.9, resourceMul: 0.88, reputationPerDay: -2 },
  },
  {
    id: "mod-herb-harvest",
    name: "药圃丰收",
    desc: "药圃大熟，丹房料足，诸事顺手。",
    days: 45,
    effects: { resourceMul: 1.15 },
  },
  {
    id: "mod-road-cut",
    name: "商路断绝",
    desc: "山外道路不靖，货殖不通，进项大减。",
    days: 30,
    effects: { resourceMul: 0.85, reputationPerDay: -1 },
  },
  {
    id: "mod-sacrifice",
    name: "祭天祈福",
    desc: "设坛祭天，四方称颂，人心大顺。",
    days: 15,
    effects: { reputationPerDay: 4, resourceMul: 0.95 },
  },
  {
    id: "mod-drill",
    name: "演武励士",
    desc: "日日演武较技，门中练功之风大盛。",
    days: 45,
    effects: { cultivationMul: 1.08 },
  },
  {
    id: "mod-heavy-tax",
    name: "苛捐杂税",
    desc: "加征抽成，库房一时充盈，人心却散了。",
    days: 30,
    effects: { resourceMul: 1.1, reputationPerDay: -3 },
  },
];

const BY_ID = new Map(SECT_MODIFIERS.map((m) => [m.id, m]));

export function sectModifierSpec(id: string): SectModifierSpec | undefined {
  return BY_ID.get(id);
}

/** 名录念给模型听：一条一行，含 id、名目、常例天数与效用 */
export function sectModifierBrief(): string {
  return SECT_MODIFIERS.map(
    (m) => `${m.id}（${m.name}，常例 ${m.days} 日）：${m.desc}`,
  ).join("\n");
}

/** 眼下生效的修正里，各项效用的合计 */
export function activeModifierEffects(modifiers: SectModifier[] | undefined): {
  resourceMul: number;
  cultivationMul: number;
  reputationPerDay: number;
} {
  let resourceMul = 1;
  let cultivationMul = 1;
  let reputationPerDay = 0;
  for (const mod of modifiers ?? []) {
    const spec = sectModifierSpec(mod.id);
    if (!spec) continue;
    resourceMul *= spec.effects.resourceMul ?? 1;
    cultivationMul *= spec.effects.cultivationMul ?? 1;
    reputationPerDay += spec.effects.reputationPerDay ?? 0;
  }
  return { resourceMul, cultivationMul, reputationPerDay };
}

/** 把名录里的一条立成生效的修正；到 until 那一日为止 */
export function makeModifier(id: string, today: number, days?: number): SectModifier | null {
  const spec = sectModifierSpec(id);
  if (!spec) return null;
  const span = Math.max(1, Math.round(Number(days) || spec.days));
  return { id: spec.id, name: spec.name, desc: spec.desc, until: today + span };
}
