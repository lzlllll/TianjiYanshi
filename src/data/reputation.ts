/**
 * 名声。
 *
 * 名声是旁人嘴里的你，与你自认的人品未必相干：正道怎么看你、魔道怎么看你、
 * 街坊怎么看你、官面上怎么看你，四条各走各的，互不相抵——一个人满手血腥，
 * 未必就没有百姓念他救过命。只是寻常人家多半怕他，那是情谊上的事，不在这一处。
 *
 * 四条各自落在 -100 到 100，以 0 为「没人认得你」。正数是好名声，负数是坏名声：
 * 正道、平民、官府三处负得多，便是被人当作对头、遭人唾骂；
 * 魔道那一处的负，是邪门外道看不上你、懒得理你。
 * 牙行办的差事、叙事里做下的事，都在这上头加减；攒下来的数目，
 * 说话的人（模型）看得见，也照着它待你。
 */

import type { Reputation, ReputationAxis } from "@/data/types";

/** 四条名声的次序，界面与提示词都照这个来 */
export const REPUTATION_AXES: ReputationAxis[] = ["righteous", "demonic", "folk", "official"];

export const REPUTATION_LABELS: Record<ReputationAxis, string> = {
  righteous: "正道名声",
  demonic: "魔道名声",
  folk: "平民名声",
  official: "官府名声",
};

/** 某一类差事里写「正道名声」这样一整个词，落到哪一条上 */
export const REPUTATION_BY_KIND: Record<string, ReputationAxis> = {
  正道名声: "righteous",
  魔道名声: "demonic",
  平民名声: "folk",
  官府名声: "official",
};

/**
 * 叙事里的改动路径写 reputation.<哪一条>，全名、半名或英文键都认。
 * 「声望」两个字也认，归到平民名下——那是街坊口中的议论。
 */
export function reputationAxisByName(name: unknown): ReputationAxis | null {
  const key = String(name ?? "").trim();
  if (!key) return null;
  if (REPUTATION_AXES.includes(key as ReputationAxis)) return key as ReputationAxis;
  if (REPUTATION_BY_KIND[key]) return REPUTATION_BY_KIND[key];
  if (key === "声望") return "folk";
  const half: Record<string, ReputationAxis> = { 正道: "righteous", 魔道: "demonic", 平民: "folk", 官府: "official" };
  return half[key] ?? null;
}

/** 名声高低只有说法，没有点数上的好处：这是旁人怎么看你，不是你的本事 */
export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;

const clamp = (value: number) => Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Math.round(value)));

export const EMPTY_REPUTATION: Reputation = { righteous: 0, demonic: 0, folk: 0, official: 0 };

/** 缺字段、写坏了，一律落回 0，不认的轴直接不要 */
export function normalizeReputation(raw: unknown): Reputation {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (axis: ReputationAxis): number => {
    const n = Number(src[axis]);
    return Number.isFinite(n) ? clamp(n) : 0;
  };
  return {
    righteous: pick("righteous"),
    demonic: pick("demonic"),
    folk: pick("folk"),
    official: pick("official"),
  };
}

/** 添或折一笔；数目夹在 0 到 100 之间，返回改过的那一份 */
export function shiftReputation(rep: Reputation, axis: ReputationAxis, delta: number): Reputation {
  return { ...rep, [axis]: clamp((Number(rep[axis]) || 0) + delta) };
}

/**
 * 名声落到嘴边的话：把 -100 到 100 分成五档，各说各的。
 * 最低一档是坏名声，中间一档是无人识得，最高一档是名头响亮。
 * 四条各有一套说法——正道与魔道虽是同一件事的两面，说辞却不同。
 */
const REPUTATION_WORDS: Record<ReputationAxis, [string, string, string, string, string]> = {
  righteous: [
    "正道已把你当作对头，提你的名字便皱眉",
    "正道里有人疑你、防你",
    "正道中人没听过你的名",
    "正道里有几处地方念你的好",
    "你在正道里已是叫得响的一号",
  ],
  demonic: [
    "邪门外道看你不上，甚至嫌你碍眼",
    "魔道里有人对你不以为然",
    "魔道中人不知有你",
    "魔道开始留意你的行踪",
    "你的名头之盛，正道也要忌你三分",
  ],
  folk: [
    "街坊提起你便摇头，多是骂名",
    "有几条街巷对你有怨言",
    "街坊不知道你是谁",
    "市井间多有人替你说话",
    "提起你的名字，百姓没有不称道的",
  ],
  official: [
    "官府已把你记在案上，见了便要拿问",
    "衙门里有人对你存着戒心",
    "官面上没你的名帖",
    "官府中人多愿与你有往来",
    "官面上的话，你比许多人说得响",
  ],
};

/** 落在第几档，0 到 4：0 最坏，2 是无名，4 最好 */
export function reputationBand(value: number): number {
  const v = clamp(value);
  if (v >= 60) return 4;
  if (v >= 20) return 3;
  if (v > -20) return 2;
  if (v > -60) return 1;
  return 0;
}

/** 这一条名声现下落在什么话上 */
export function reputationWords(axis: ReputationAxis, value: number): string {
  return REPUTATION_WORDS[axis][reputationBand(value)];
}

/** 名声的一条摘要，写进提示词让人照着演；一字不落的四条都报上 */
export function reputationBrief(rep: Reputation): string {
  return REPUTATION_AXES.map((axis) => `${REPUTATION_LABELS[axis]} ${rep[axis] ?? 0}`).join(" · ");
}

/**
 * 名声在外，初见时人家心里先有个底。
 * 正道、平民、官府三处加起来是「世人认你的好」，魔道是「世人怕你的恶」；
 * 两相抵过之后落在 -10 到 +10 之间，初见时加到情谊上。
 * 只是初见的一点点偏向，往后的交情仍旧靠处。
 */
export function reputationFirstImpression(rep: Reputation): number {
  const good = (rep.righteous || 0) + (rep.folk || 0) + (rep.official || 0);
  // 负数的魔道名声只是「没人怕你」，并不替你说好话
  const bad = Math.max(0, rep.demonic || 0);
  return Math.max(-10, Math.min(10, Math.round((good - bad) / 30)));
}
