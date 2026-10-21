import type { AISettings } from "@/data/types";
import { chatWithModel } from "@/lib/aiClient";

/**
 * 叙事输出的最后一道闸。
 *
 * 只拦两类高风险内容：涉及未成年人的性内容、现实世界可照做的违法操作指南。
 * 正常的虚构战斗、修炼、阴谋与黑暗奇幻不在拦截之列——这里不做泛化的道德审查。
 */
export type SafetyCategory = "minor_sexual" | "illegal_guide";

const MINOR_RE = /(未成年|幼女|幼童|儿童|孩童|小孩|萝莉|正太|垂髫|稚龄)/g;

/** 「少年」「少女」也常指成年前后的年轻人，须配上露骨的性词才拦，免得误伤正常情缘 */
const AMBIGUOUS_MINOR_RE = /(少女|少年)/g;

const EXPLICIT_SEXUAL_RE =
  /(性交|性行为|做爱|交合|云雨|床笫|裸体|裸身|私处|下体|抽送|射精|口交|肛交|强奸|强暴|猥亵|性侵|春宫|性器)/g;

const SEXUAL_RE =
  /(性交|性行为|做爱|交合|云雨|床笫|裸体|裸身|私处|下体|抽送|射精|口交|肛交|强奸|强暴|猥亵|性侵|春宫|性器|不堪之事|肌肤之亲|苟合|欢好|同房|圆房|失身|破身|亵玩|情事)/g;

const ILLEGAL_RE =
  /(冰毒|海洛因|甲基苯丙胺|芬太尼|摇头丸|K粉|可卡因|制毒|制冰毒|炸药|炸弹|雷管|枪支|弹药|仿真枪|改装枪|黑客|木马病毒|勒索病毒|电信诈骗|洗钱|拐卖人口|器官贩卖|恐怖袭击)/gi;

/** 一眼就能定性为「教程」的词 */
const STRONG_GUIDE_RE = /(教程|步骤|配方|配比|操作指南|制作方法|制造方法|详细做法|具体做法)/g;

/** 单看很寻常、须凑够两个才可疑的词 */
const GUIDE_RE = /(比例|流程|原料|材料|称取|提纯|合成|组装|图纸|代码|脚本|漏洞|话术)/g;

const HACK_COMBO_RE = /(黑客|入侵|攻击).{0,40}(银行|服务器|数据库|账号|系统|网站|手机|电脑)/g;

const FRAUD_COMBO_RE = /(诈骗|骗局).{0,40}(话术|脚本|流程|步骤|模板)/g;

const CN_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 把「十七」「二十」这类中文数字读成阿拉伯数字，只认 1 到 99 */
function chineseNumber(raw: string): number | null {
  if (!raw) return null;
  const tenAt = raw.indexOf("十");
  if (tenAt < 0) return raw.length === 1 ? CN_DIGITS[raw] ?? null : null;
  const tens = tenAt === 0 ? 1 : CN_DIGITS[raw.slice(0, tenAt)] ?? 0;
  const ones = tenAt === raw.length - 1 ? 0 : CN_DIGITS[raw.slice(tenAt + 1)] ?? 0;
  return tens * 10 + ones;
}

/** 文中提到的年龄若落在 1 到 17 岁，记下它的位置 */
function minorAgeIndexes(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/([一二三四五六七八九十]+|\d{1,2})\s*岁/g)) {
    const raw = m[1];
    const age = /^\d+$/.test(raw) ? parseInt(raw, 10) : chineseNumber(raw);
    if (age !== null && age >= 1 && age <= 17) out.push(m.index ?? 0);
  }
  return out;
}

function allMatches(re: RegExp, text: string): RegExpMatchArray[] {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return Array.from(text.matchAll(new RegExp(re.source, flags)));
}

function nearAny(index: number, others: number[], window: number): boolean {
  return others.some((other) => Math.abs(other - index) <= window);
}

function nearStrongGuide(text: string, index: number, window = 180): boolean {
  return nearAny(index, allMatches(STRONG_GUIDE_RE, text).map((m) => m.index ?? 0), window);
}

/** 附近至少凑齐两个不同的「操作类」词，才当作在讲做法 */
function guideMarkerCount(text: string, index: number, window = 180): number {
  const seen = new Set<string>();
  for (const m of allMatches(GUIDE_RE, text)) {
    if (Math.abs((m.index ?? 0) - index) <= window) seen.add(m[0]);
  }
  return seen.size;
}

function hasMinorSexual(text: string): boolean {
  const minorAt = [
    ...allMatches(MINOR_RE, text).map((m) => m.index ?? 0),
    ...minorAgeIndexes(text),
  ];
  if (minorAt.length > 0) {
    const sexualAt = allMatches(SEXUAL_RE, text).map((m) => m.index ?? 0);
    if (sexualAt.some((i) => nearAny(i, minorAt, 400))) return true;
  }
  const ambiguousAt = allMatches(AMBIGUOUS_MINOR_RE, text).map((m) => m.index ?? 0);
  if (ambiguousAt.length > 0) {
    const explicitAt = allMatches(EXPLICIT_SEXUAL_RE, text).map((m) => m.index ?? 0);
    if (explicitAt.some((i) => nearAny(i, ambiguousAt, 240))) return true;
  }
  return false;
}

function hasIllegalGuide(text: string): boolean {
  for (const m of allMatches(HACK_COMBO_RE, text)) {
    const i = m.index ?? 0;
    if (nearStrongGuide(text, i) || guideMarkerCount(text, i) >= 2) return true;
  }
  for (const m of allMatches(FRAUD_COMBO_RE, text)) {
    const i = m.index ?? 0;
    if (nearStrongGuide(text, i, 120) || guideMarkerCount(text, i, 120) >= 1) return true;
  }
  for (const m of allMatches(ILLEGAL_RE, text)) {
    const i = m.index ?? 0;
    if (nearStrongGuide(text, i) || guideMarkerCount(text, i) >= 2) return true;
  }
  return false;
}

/** 命中高风险就返回类别；正常叙事返回 null */
export function scanNarrativeRisk(text: string): SafetyCategory | null {
  if (!text.trim()) return null;
  if (hasMinorSexual(text)) return "minor_sexual";
  if (hasIllegalGuide(text)) return "illegal_guide";
  return null;
}

const FALLBACK: Record<SafetyCategory, string> = {
  minor_sexual:
    "他正要再往下说，门外忽然传来一阵急促的叩门声，紧接着有人高声唤他。话头就此断了，他定了定神，随来人转入正事，方才那一点心思只得按下不提。",
  illegal_guide:
    "他心中念头刚起，便觉此事牵连太重，一步踏错便是万劫不复。窗外的风忽然紧了，他沉默片刻，终究把话咽了回去，转而寻一条更稳妥的路子。",
};

function buildRewritePrompt(category: SafetyCategory, narrative: string): string {
  const label =
    category === "minor_sexual" ? "涉及未成年人的性内容" : "现实世界可照做的违法操作指南";
  return `你是修仙文字游戏的修订者。下面这段叙事触及了「${label}」，不能原样呈现。
请在保留本轮剧情走向、人物、地点与已发生事实的前提下改写：
- 删除一切相关细节，不复述、不解释、不评价；
- 用江湖情境自然带过：人物岔开话头、外力打断，或让越界之举在规矩与因果中落空；
- 不给出任何现实世界可照做的配方、比例、步骤、参数、工具或渠道；
- 保持原有的第三人称古风文风与大致篇幅。
只输出改写后的叙事正文，不要标题、说明或标记。

【原文】
${narrative.slice(0, 12000)}`;
}

/**
 * 输出先过闸再上屏：命中高风险时请模型改写一遍，改写仍不合格就换成安全的过场。
 * 复核只看本地规则，不把原文再发给第二个裁判模型。
 */
export async function reviewNarrative(
  settings: AISettings,
  narrative: string,
  signal?: AbortSignal,
): Promise<string> {
  const risk = scanNarrativeRisk(narrative);
  if (!risk) return narrative;
  try {
    const rewritten = await chatWithModel(
      settings,
      settings.flashModel,
      [
        {
          role: "system",
          content:
            "你是内容安全修订员。只做删改，不评判、不说教；保留剧情事实与古风文风，删除高风险细节。",
        },
        { role: "user", content: buildRewritePrompt(risk, narrative) },
      ],
      { timeoutMs: 90000, signal, retries: 0, temperature: 0.3 },
    );
    const cleaned = rewritten.trim();
    if (cleaned && !scanNarrativeRisk(cleaned)) return cleaned;
  } catch {
    // 改写没成也不把原样放出去，走安全过场
  }
  return FALLBACK[risk];
}
