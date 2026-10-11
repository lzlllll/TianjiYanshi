/**
 * 随身灵兽。
 *
 * 灵兽栏里买下的兽原本只是行囊里的一件东西，收作随身后才活起来：
 * 跟着你上路，遇斗时替你出手，出手轻重看它自己的斤两与跟你的亲疏。
 * 一身只带一头——两头兽搁在一处，多半谁也不听谁的。
 */

import type { InventoryItem, ItemGrade, SpiritBeast } from "@/data/types";

/** 亲疏封顶 */
export const BEAST_BOND_MAX = 100;

/** 品阶越高，兽的底子越厚 */
const GRADE_SCALE: Record<ItemGrade, number> = {
  凡品: 1,
  灵品: 1.4,
  玄品: 1.9,
  天品: 2.6,
  仙品: 3.5,
};

/** 随手掷出来的几种脾性；收服那一刻定下，往后就照这个演 */
const TEMPERS: string[] = [
  "护主得紧，见了生人就呲牙",
  "懒，吃饱了就卧着，真要动手时才来精神",
  "记仇，谁碰你一下它都记着",
  "机警，风吹草动先竖起耳朵",
  "憨，挨了打也不躲，只往你身前凑",
  "好斗，见了血就收不住",
  "认生，人多的场合只肯贴着你走",
  "贪嘴，一根肉干就能拐走半边神",
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roll = (base: number, spread: number) => base + Math.floor(Math.random() * (spread + 1));

/** 缺字段、写坏了，一律按没有灵兽算 */
export function normalizeBeast(raw: unknown): SpiritBeast | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Partial<SpiritBeast>;
  const name = String(src.name ?? "").trim();
  if (!name) return null;

  const hpMax = Math.max(1, Math.trunc(Number(src.hpMax) || 30));
  return {
    name: name.slice(0, 20),
    desc: String(src.desc ?? "").trim().slice(0, 80),
    temper: String(src.temper ?? "").trim().slice(0, 40),
    icon: String(src.icon ?? "").trim().slice(0, 1) || "兽",
    hpMax,
    hp: clamp(Math.trunc(Number(src.hp) || hpMax), 0, hpMax),
    attack: Math.max(0, Math.trunc(Number(src.attack) || 5)),
    defense: Math.max(0, Math.trunc(Number(src.defense) || 3)),
    speed: Math.max(0, Math.trunc(Number(src.speed) || 4)),
    bond: clamp(Math.trunc(Number(src.bond) || 0), 0, BEAST_BOND_MAX),
  };
}

/**
 * 把行囊里的一头兽收作随身。
 * 底子由品阶折出来——买得贵的自然壮些；至于脾性，全看这一刻的缘法。
 */
export function beastFromItem(item: InventoryItem): SpiritBeast {
  const scale = GRADE_SCALE[item.grade] ?? 1;
  const hpMax = roll(Math.round(26 * scale), 6);
  return {
    name: item.name.slice(0, 20),
    desc: item.desc.slice(0, 80),
    temper: TEMPERS[Math.floor(Math.random() * TEMPERS.length)],
    icon: item.icon && item.icon.trim() ? item.icon.trim().slice(0, 1) : "兽",
    hp: hpMax,
    hpMax,
    attack: roll(Math.round(6 * scale), 3),
    defense: roll(Math.round(4 * scale), 3),
    speed: roll(Math.round(5 * scale), 4),
    bond: 20,
  };
}

/** 相处得来的亲疏；添到顶就停 */
export function raiseBond(beast: SpiritBeast, delta: number): SpiritBeast {
  return { ...beast, bond: clamp(beast.bond + Math.trunc(delta), 0, BEAST_BOND_MAX) };
}

/** 亲疏落到嘴边的话 */
export function bondWords(bond: number): string {
  if (bond >= 80) return "与你形影不离，你一个眼神它就知道该做什么";
  if (bond >= 60) return "已认了你这个主，肯为你拼命";
  if (bond >= 40) return "熟了，唤一声便来";
  if (bond >= 20) return "还算听话，只是未必肯为你搏命";
  return "刚到手，还防着你";
}

/** 写进提示词的一行：叫什么、什么脾性、眼下亲疏如何 */
export function beastBrief(beast: SpiritBeast | null | undefined): string {
  if (!beast) return "";
  const parts = [
    beast.name,
    `亲疏 ${beast.bond}/${BEAST_BOND_MAX}`,
    `气血 ${beast.hp}/${beast.hpMax}`,
    `攻 ${beast.attack} 防 ${beast.defense} 身法 ${beast.speed}`,
  ];
  if (beast.temper) parts.push(`脾性：${beast.temper}`);
  if (beast.desc) parts.push(beast.desc);
  return parts.join("｜");
}
