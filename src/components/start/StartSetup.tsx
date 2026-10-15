import { useState, useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { REALM_NAMES } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { GAME_TITLE_BOOK, GAME_VERSION } from "@/lib/gameInfo";
import { SealButton } from "@/components/ui/SealButton";
import {
  FolderOpen,
  RotateCcw,
  MoreHorizontal,
  Check,
  Zap,
  ClipboardPaste,
  Plug,
  X,
} from "lucide-react";
import { AI_BACKEND_READY, hasCustomApi } from "@/data/backend";
import { FREE_MODEL } from "@/data/aiQuota";
import { QuotaShopPanel } from "@/components/ai/QuotaShopPanel";
import { CustomApiModal } from "@/components/ai/CustomApiModal";
import { OPENING_DOMAINS } from "@/lib/promptBuilder";
import type { AISettings } from "@/data/types";

interface PlayerSetup {
  name: string;
  title: string;
  gender: "male" | "female";
  sectName: string;
  position: string;
  realm: string;
  description: string;
  personality: string;
  background: string;
}

const SECT_POSITIONS = ["掌门", "副掌门", "长老", "内门弟子", "外门弟子", "散修"];
const REALMS = ["引气", "炼气", "筑基", "金丹", "元婴", "化神", "合体", "渡劫", "大乘"];

/** 每个境界配一句小注，让「择道」不是干巴巴的下拉 */
const REALM_NOTES: Record<string, string> = {
  引气: "灵气初感，尚在门外",
  炼气: "气行周天，可入宗门",
  筑基: "道基已立，寿元渐长",
  金丹: "一粒金丹吞入腹，始知我命不由天",
  元婴: "元神初显，可离体远游",
  化神: "神游太虚，一念千里",
  合体: "法与身合，几近于道",
  渡劫: "天雷将至，成败在此一举",
  大乘: "只差一步，登临仙界",
};

type StepId = "api" | "name" | "realm" | "sect" | "self" | "seal";

const STEP_DEFS: { id: StepId; label: string; hint: string }[] = [
  { id: "api", label: "通灵", hint: "接通推演接口" },
  { id: "name", label: "立名", hint: "姓名 · 称号 · 性别" },
  { id: "realm", label: "择道", hint: "初始境界" },
  { id: "sect", label: "归宗", hint: "宗门 · 职位" },
  { id: "self", label: "述身", hint: "简介 · 性格 · 背景" },
  { id: "seal", label: "落印", hint: "确认并开局" },
];

/** 快速开局用的随机池：随手拼一个人物，省去逐项填写 */
const QUICK_SURNAMES = ["赵", "钱", "孙", "李", "周", "吴", "郑", "王", "沈", "陆", "顾", "林", "苏", "萧", "叶", "江", "云", "楚", "慕容", "独孤"];
const QUICK_GIVEN = ["尘", "青云", "无涯", "长风", "听雪", "怀安", "疏影", "孤鸿", "望川", "子墨", "惊蛰", "霜白", "野鹤", "拾光", "问水", "守拙"];
const QUICK_TITLES = ["青衫客", "无名剑客", "游方郎中", "雪中孤鸿", "闲云野鹤", "市井闲人", "负笈书生", "落魄公子", "江湖游侠", "山野散人"];
const QUICK_SECTS = ["散修", "青云宗", "太岳谷", "听雨岛", "栖霞洞", "白鹿院", "丹霞门", "凌霜阁"];
const QUICK_DESC = [
  "身负奇诡灵根、来历不明的散修。",
  "自幼随师隐于山野的清修之人。",
  "行走江湖、以剑会友的少年人。",
  "出身没落世家、一心问道的读书人。",
  "惯走南闯北、见多识广的游方客。",
];
const QUICK_PERSONALITY = [
  "外冷内热，遇事先谋后动。",
  "爽朗仗义，认死理。",
  "谨小慎微，却重情义。",
  "沉默寡言，心细如发。",
  "放荡不羁，乐天知命。",
];
const QUICK_BACKGROUND = [
  "父母早亡，被山中道观收留。",
  "家中曾是行商大户，如今已败落。",
  "说不清自己的来处，只记得一场大火。",
  "曾在镖局做过几年杂役，学了一身武艺。",
];

const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 随手掷一个人物：姓名、称号、宗门、境界、简介都从池子里现取 */
function rollQuickPlayer(): PlayerSetup {
  return {
    name: pickOne(QUICK_SURNAMES) + pickOne(QUICK_GIVEN),
    title: pickOne(QUICK_TITLES),
    gender: Math.random() < 0.5 ? "male" : "female",
    sectName: pickOne(QUICK_SECTS),
    position: pickOne(SECT_POSITIONS),
    realm: pickOne(REALMS),
    description: pickOne(QUICK_DESC),
    personality: pickOne(QUICK_PERSONALITY),
    background: pickOne(QUICK_BACKGROUND),
  };
}

/**
 * 从一整段自述里认一个境界：先把「炼气后期」这样写全的找出来，
 * 只写了大境界的（如「筑基」）再按那一道的初期算。
 * 整段开局没有填表，角色卡上那两栏无从按表确立，就先由这里认下来；
 * 免得推演没写出这一笔时，角色一直停在默认的引气初期。
 */
function parseRealmFromText(text: string): string | null {
  const t = text || "";
  let name = "";
  let at = Number.POSITIVE_INFINITY;
  for (const full of REALM_NAMES) {
    const i = t.indexOf(full);
    if (i !== -1 && i < at) {
      name = full;
      at = i;
    }
  }
  if (name) return name;
  for (const tier of REALMS) {
    const i = t.indexOf(tier);
    if (i === -1 || i >= at) continue;
    const idx = REALM_NAMES.findIndex((n) => n.startsWith(tier));
    if (idx >= 0) {
      name = REALM_NAMES[idx];
      at = i;
    }
  }
  return name || null;
}

/** 开篇要交代的诸项；表单开局与整段开局共用这一段 */
const OPENING_BRIEF = `请为这个故事写下开篇。开篇叙事需要把下面这些设定交代清楚，凡是涉及名目、数量与程度的地方都要给出明确内容，以便后续判定；请把它们自然地融进叙事，不要写成条目清单：
 1. 我的灵根资质，写明由哪几种五行或变异灵根构成，各自大概几成
 2. 我的经脉状况，写明主要经脉的名称、通畅程度，以及是否有损伤
 3. 我的年岁，以及体魄与气运
 4. 我已掌握的 2 至 4 门功法，逐一写明名称、类别、品阶与五行属性，其中须有一门是主修的心法
 5. 我随身携带的物品，逐一写明名称、类别、品阶与数量
 6. 我持有的灵石，分别写明下品、中品、上品的数量
 7. 我所在宗门的名称、规模、掌事者、驻地与当前境况
 8. 三四位与我相识之人，写明姓名、称号、与我的关系、修为境界与亲疏程度
 9. 今日听闻的江湖消息，官府公告、宗门布告、市井传言各一则
10. 我身上几门讨生活的本事，写明名目与门道——是市井里的手艺与见识，如辨药、相玉、修器物、算账、认路看天，不要写成拳脚武功
11. 眼下已经落在肩上的两三桩事，写明是谁交办的、要办成什么才算数、限到几时
12. 开篇的场景与情节

【境界须照旧】我如今的境界已定（若上文写明，即以此为准）。开篇与后续都要照这个境界来写，不得把我写成更低的境界，更不得编出「境界下跌」「修为倒退」这类由头。`;

/** 开局推演期间翻动的几句闲话；纯为等得下去，不承载任何判定 */
const OPENING_WAITS = [
  "正在踏勘你的来路……",
  "正在排布灵根与经脉……",
  "正在挑选随身之物与功法……",
  "正在落定宗门与相识之人……",
  "正在打听今日的江湖消息……",
  "正在写下开篇……",
];

/**
 * 建档各门「正在办」时的一句风味话。
 * 开篇读完了，底下得立刻有东西告诉玩家「此刻在忙哪一门」，
 * 不能等第一门跑完才开口；键与 OPENING_DOMAINS 的 id 对齐。
 */
const FILING_FLAVOR: Record<string, string> = {
  origin: "长老正在为你测试灵根……",
  technique: "正在为你安排合用的功法……",
  treasure: "财神正在向阁下的行囊里装点财物……",
  sect: "师门与同道正依次落座……",
  bond: "正在请相识之人入尘缘……",
  skill: "正在盘你身上那几门本事……",
  quest: "正在记下落在你肩上的几桩事……",
  news: "正在打听今日的江湖见闻……",
};

/** 建档各门落定后的一句风味话；键与 OPENING_DOMAINS 的 id 对齐 */
const FILED_FLAVOR: Record<string, string> = {
  origin: "灵根与经脉已勘定",
  technique: "入门功法已入手",
  treasure: "财神已把财物装进行囊",
  sect: "师门与门中位次已落定",
  bond: "相识之人已一一请入尘缘",
  skill: "身上那几门本事已盘清",
  quest: "落在肩上的几桩事已记下",
  news: "今日的江湖见闻已打听回来",
};

/** 门的名目，风味话对不上时兜底 */
const DOMAIN_LABEL: Record<string, string> = Object.fromEntries(
  OPENING_DOMAINS.map((d) => [d.id, d.label]),
);

/**
 * 开局推演时的全屏等待页：遮住界面，免得中途误触。
 * 但正文一开流就不该再拿转圈盖着了——把这页换成能读的开篇，
 * 等待的时间用来读故事，比盯着一个圈好得多；建档那几趟在背后继续跑。
 */
function OpeningLoading() {
  const stage = useAIStore((s) => s.conversation.stage);
  const narrative = useAIStore((s) => s.conversation.streamingNarrative ?? "");
  const reasoning = useAIStore((s) => s.conversation.streamingReasoning ?? "");
  const filed = useAIStore((s) => s.conversation.openingFiled ?? []);
  const feed = useAIStore((s) => s.conversation.openingFeed ?? []);
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showNarrative, setShowNarrative] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((n) => Math.min(n + 1, OPENING_WAITS.length - 1));
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (narrative.trim() && !showNarrative) {
      const timer = setTimeout(() => setShowNarrative(true), 50);
      return () => clearTimeout(timer);
    }
  }, [narrative, showNarrative]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [narrative]);

  const total = OPENING_DOMAINS.length;
  const last = filed[filed.length - 1];
  // 流水最新的一笔：正在办的那门或刚落定的那门，等待页照它报话
  const latestEvent = feed[feed.length - 1];
  const allFiled = filed.length >= total;
  // 正文一收尾，八门便齐发；只要有一门开始了，底下就该立刻报话，不必等它跑完
  const busy = filed.length > 0 || feed.length > 0;

  useEffect(() => {
    if (stage === "done" && allFiled) {
      const timer = setTimeout(() => setFadeOut(true), 800);
      return () => clearTimeout(timer);
    }
  }, [stage, allFiled]);

  if (narrative.trim()) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-[90] flex items-center justify-center p-4 bg-ink-950/95 backdrop-blur-sm",
          "transition-all duration-1000",
          fadeOut ? "opacity-0 pointer-events-none" : showNarrative ? "opacity-100" : "opacity-0"
        )}
      >
        <div
          className={cn(
            "paper-sheet rounded-lg w-full max-w-3xl max-h-[88vh] flex flex-col",
            "transition-all duration-1000",
            fadeOut
              ? "opacity-0 scale-110 translate-y-8"
              : showNarrative
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95"
          )}
        >
          <div className="shrink-0 flex items-baseline justify-between gap-3 px-8 pt-6 pb-3 border-b border-[#8a6a3a]/25">
            <h3 className="font-brush text-xl ps-strong tracking-widest">开篇</h3>
            {!allFiled && (
              <span className="font-serif text-[11px] ps-muted">后文仍在推演，边读边等便好</span>
            )}
          </div>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 py-5">
            <article className="font-serif text-base ps-strong leading-loose tracking-wide whitespace-pre-wrap">
              {narrative}
              {!allFiled && (
                <span className="inline-block w-2 h-4 ml-0.5 bg-[#a83232]/70 animate-pulse align-middle" />
              )}
            </article>
          </div>
          <div className="shrink-0 px-8 pb-5 space-y-2">
            {!busy ? (
              <p className="font-serif text-xs ps-muted leading-relaxed">{OPENING_WAITS[idx]}</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 rounded-full bg-[#8a6a3a]/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#a83232]/70 transition-all duration-500"
                      style={{ width: `${Math.round((filed.length / total) * 100)}%` }}
                    />
                  </div>
                  <span className="font-serif text-[11px] ps-muted shrink-0">
                    已落 {filed.length} / {total}
                  </span>
                </div>
                <p className="font-serif text-xs ps-muted leading-relaxed">
                  {allFiled
                    ? stage === "done"
                      ? "江湖已开，一切就绪……"
                      : "底子已齐，正在收束……"
                    : latestEvent?.phase === "doing"
                      ? `✦ ${FILING_FLAVOR[latestEvent.id] ?? `正在办${DOMAIN_LABEL[latestEvent.id] ?? "这一门"}……`}`
                      : last?.ok
                        ? `✓ ${FILED_FLAVOR[last.id] ?? `${DOMAIN_LABEL[last.id] ?? "这一门"}已落定`}`
                        : `${DOMAIN_LABEL[last.id] ?? "这一门"}暂且空着，日后再补`}
                </p>
              </>
            )}
            {!allFiled && (
              <p className="font-serif text-[11px] ps-faint leading-relaxed">推演尚未收束，请勿关闭此页。</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const head = stage === "flash" ? "正在翻阅江湖档案" : stage === "error" ? "推演受阻" : "正在推演开篇";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-ink-950/95 backdrop-blur-sm">
      <div className="paper-sheet rounded-lg w-full max-w-md px-8 py-10 flex flex-col items-center text-center gap-5">
        {/* 一枚转着的印 */}
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border border-[#a83232]/25" />
          <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-[#a83232]/70 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center font-brush text-2xl ps-strong tracking-widest">
            道
          </div>
        </div>

        <div>
          <h3 className="font-brush text-xl ps-strong tracking-[0.3em]">{head}</h3>
          <p className="font-serif text-xs ps-muted mt-2 leading-relaxed min-h-[1.2rem]">
            {/* 推理模型先长一段思考才落笔：这一段也报出来，免得看着像卡住了 */}
            {reasoning ? `模型正在思考…（${reasoning.length} 字）` : OPENING_WAITS[idx]}
          </p>
        </div>

        {/* 一条来回走动的进度：具体到哪一步说不准，就不报数 */}
        <div className="w-full h-1 rounded-full bg-[#8a6a3a]/15 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#a83232]/70 to-transparent animate-pulse" />
        </div>

        <p className="font-serif text-[11px] ps-faint leading-relaxed">
          推演须静候片刻，请勿关闭此页。
        </p>
      </div>
    </div>
  );
}

export function StartSetup() {
  const [setup, setSetup] = useState<PlayerSetup>({
    name: "",
    title: "",
    gender: "male",
    sectName: "",
    position: "外门弟子",
    realm: "引气",
    description: "",
    personality: "",
    background: "",
  });

  const settings = useAIStore((s) => s.settings);
  // 上游与密钥都由后端持有，本机只挑模型名；有后端即算已配置
  const configured = AI_BACKEND_READY;

  const [stepId, setStepId] = useState<StepId>(() => (configured ? "name" : "api"));
  const [reached, setReached] = useState(0);
  const [apiDraft, setApiDraft] = useState<AISettings>(settings);
  // 「自定义接口」另开一扇窗；它自己存自己
  const [customApiOpen, setCustomApiOpen] = useState(false);
  // 从后头几步点「通灵」折回来改配置时，记下原先停在哪一步，存过便送回去，不必自己再点回去
  const [apiReturn, setApiReturn] = useState<StepId | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  // 整段开局那一扇：贴一大段文字，直接交出去作开篇的依据
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const resetGame = useGameStore((s) => s.resetGame);
  const runTurn = useAIStore((s) => s.runTurn);
  const updateSettings = useAIStore((s) => s.updateSettings);
  const turns = useAIStore((s) => s.conversation.turns);

  useEffect(() => {
    if (!showMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showMenu]);

  // 「通灵」这一步始终留着：配好后仍旧能点回来选额度、换模型名。
  // 从前配好便把它藏起来，反倒没处可改。
  const steps = STEP_DEFS;
  const foundIndex = steps.findIndex((s) => s.id === stepId);
  const activeIndex = foundIndex === -1 ? 0 : foundIndex;
  const activeStep = steps[activeIndex];
  const isLast = activeIndex === steps.length - 1;

  const stepValid = (id: StepId): boolean => {
    // 「通灵」这一步不再要人填密钥，只要后端接通即可放行
    if (id === "api") return AI_BACKEND_READY;
    if (id === "name") return setup.name.trim() !== "";
    if (id === "self") return setup.description.trim() !== "";
    return true;
  };

  /** 底部右侧的提示语，按当前步骤给出对应的未完成原因 */
  const footerNote = (): string | null => {
    if (activeStep.id === "api") return "填好后点上方「保存并继续」";
    // 落印这一步也可能因快速开局直接跳来，姓名与简介仍要补齐
    if (activeStep.id === "seal") {
      if (!setup.name.trim()) return "请先补上姓名";
      if (!setup.description.trim()) return "请先补上人物简介";
      return null;
    }
    if (!stepValid(activeStep.id)) {
      return activeStep.id === "name" ? "请先填写姓名" : "请先填写人物简介";
    }
    return null;
  };

  const change = (field: keyof PlayerSetup, value: string) => {
    setSetup((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const goTo = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    const next = steps[index];
    // 由别处折回「通灵」去改配置的，记下来处，存过好送回去
    if (next.id === "api" && activeStep.id !== "api" && configured) setApiReturn(activeStep.id);
    setStepId(next.id);
    setError("");
  };

  const goNext = () => {
    if (!stepValid(activeStep.id)) return;
    const ni = Math.min(activeIndex + 1, steps.length - 1);
    goTo(ni);
    setReached((r) => Math.max(r, ni));
  };

  // 是否已启用自定义接口（以草稿为准，保存后生效）
  const customActive = hasCustomApi(apiDraft);

  // 当前草稿是否正落在官方的免费模型上：模型名对得上，且没另接自己的接口
  const freeActive =
    !customActive &&
    apiDraft.flashModel === FREE_MODEL.model &&
    apiDraft.proModel === FREE_MODEL.model;

  // 选用免费模型：写回模型名，并把自定义接口让开——免费额度本就是后端供给的
  const applyFreeModel = () =>
    setApiDraft((d) => ({
      ...d,
      baseUrl: "",
      apiKey: "",
      flashModel: FREE_MODEL.model,
      proModel: FREE_MODEL.model,
    }));

  const saveApiSettings = () => {
    updateSettings(apiDraft);
    setError("");
    // 由后头几步折回来改配置的，存过送回原处；余下情形顺着往下走一步，
    // 「保存并继续」四个字才对得上——从前已配置的存过原地不动，点了跟没点一样
    if (apiReturn) {
      setStepId(apiReturn);
      setApiReturn(null);
      return;
    }
    const ni = Math.min(activeIndex + 1, steps.length - 1);
    setStepId(steps[ni].id);
    setReached((r) => Math.max(r, ni));
  };

  /**
   * 开一局：重入轮回、另起推演账，再照这一整段自述写下开篇。
   * 表单那条路会先把定好的几项写进角色卡；整段开局那条路不写，全交推演。
   * seedRealm 是整段开局时从自述里认下的境界：先落在角色卡上，免得推演没写出这一笔，
   * 角色便一直停在默认的引气初期。
   */
  const beginGame = async (firstInput: string, config?: PlayerSetup, seedRealm?: string | null) => {
    setIsGenerating(true);
    setError("");

    try {
      resetGame();
      // 开新一局，推演账也另起一册：否则开篇正文会接着上一局的话头往下走
      useAIStore.getState().resetLedger();

      if (config) {
        const gameState = useGameStore.getState();
        const newPlayer = {
          ...gameState.player,
          name: config.name.trim(),
          title: config.title.trim() || "无名之辈",
          gender: config.gender,
          sectName: config.sectName.trim() || "散修",
          position: config.position,
          realmIndex: REALMS.indexOf(config.realm) * 4,
          realmStage: 0,
          cultivation: 100,
          description: config.description.trim(),
          personality: config.personality.trim(),
          background: config.background.trim(),
        };
        useGameStore.getState().setPlayer(newPlayer);
      } else if (seedRealm) {
        // 整段开局没填表：境界先从自述里认一个落上，推演照此写，
        // 角色卡与正文才不致一个引气初期、一个炼气后期
        const idx = REALM_NAMES.indexOf(seedRealm);
        if (idx >= 0) {
          const gameState = useGameStore.getState();
          useGameStore.getState().setPlayer({ ...gameState.player, realmIndex: idx, realmStage: 0 });
        }
      }

      await runTurn(firstInput);

      // runTurn 内部会把所有异常吞掉并写进 conversation.stage，自己不抛错，
      // 所以这里必须回读状态；否则界面会一直停在「正在推演开篇…」且不给任何失败原因。
      const conv = useAIStore.getState().conversation;
      if (conv.stage !== "done") {
        setError(conv.errorMsg || "开篇推演未完成，请检查通灵接口后重试。");
        setIsGenerating(false);
        return;
      }
      // 开局另赠一处奇遇：落在这一带的空位上，往后可自行前往
      void useAIStore.getState().spawnAdventure("开局奇遇");
    } catch (e) {
      setError(`开局失败：${(e as Error).message}`);
      setIsGenerating(false);
    }
  };

  /** 照一份人物设定开局：落印、推演开篇 */
  const startGame = async (config: PlayerSetup) => {
    const blankFields: string[] = [];
    if (!config.title.trim()) blankFields.push("称号");
    if (!config.personality.trim()) blankFields.push("性格特点");
    if (!config.background.trim()) blankFields.push("身世背景");

    const firstInput = `我是${config.name}，${config.title || "一名修士"}，${config.description}。${config.personality ? "性格" + config.personality + "。" : ""}${config.background || ""}宗门归属：${config.sectName.trim() || "散修"}，身份：${config.position}，境界：${config.realm}初期。

【我没有指定的部分】${blankFields.length ? blankFields.join("、") + "，" : ""}以及年岁、外貌、修炼历程、心性评分，我都没有填写。请你依据我已给出的信息合理补全并确立，不要留空，也不必反问我。

${OPENING_BRIEF}`;

    await beginGame(firstInput, config);
  };

  const handleStart = () => startGame(setup);

  /**
   * 快速开局：随手掷一个人物填进表单，展开到「落印」一步，
   * 供你逐项过目、随手改过某一项之后再落印开局；不再掷完即走。
   * 没接通灵的，先进「通灵」一步。
   */
  const quickStart = () => {
    const rolled = rollQuickPlayer();
    setSetup(rolled);
    setError("");
    setReached(steps.length - 1);
    setStepId(configured ? "seal" : "api");
  };

  /** 打开「整段开局」那一扇 */
  const openPaste = () => {
    setShowPaste(true);
    setError("");
  };

  /** 整段开局：不拆栏，直接把这一整段交出去作开篇的依据 */
  const startWithPaste = async () => {
    const text = pasteText.trim();
    if (!text || isGenerating) return;
    if (!configured) {
      setError("尚未接通推演接口——开篇也得靠它。请先到「通灵」一步把接口填好。");
      setShowPaste(false);
      return;
    }
    setShowPaste(false);
    // 自述里报过的境界，先由代码认下来落在角色卡上，推演再据此写正文
    const seedRealm = parseRealmFromText(text);
    await beginGame(
      `${text}

【补白】以上自述里已写明的姓名、称号、性别、境界、宗门归属与身份，即为我已定之数，开篇正文与后续建档都要照此为准——不得另拟称号、不得另取宗门名号，也不得把境界写低。凡未写到的（灵根、经脉、功法、随身之物、灵石、宗门境况、相识之人、江湖消息、身上的本事与担子、开篇场景等），请你依据已给出的信息合理补全并确立，不要留空，也不必反问我。

${OPENING_BRIEF}`,
      undefined,
      seedRealm,
    );
  };

  // 存档交给游戏内的存档管理窗：列档、存档、读档、删档都在那里，
  // 此处不再弹系统文件选择框
  const openSaveManager = () => {
    setShowMenu(false);
    useAIStore.getState().setSaveManagerOpen(true);
  };

  const startNewGame = () => {
    setShowMenu(false);
    if (confirm("确定要开启新游戏吗？当前进度将丢失。")) {
      resetGame();
      useAIStore.getState().resetLedger();
      window.location.reload();
    }
  };

  const sealBase = "w-9 h-9 rounded-sm flex items-center justify-center font-brush text-sm";

  return (
    <div className="start-screen h-screen w-screen overflow-y-auto ink-bg py-10 px-6">
      <div className="w-full max-w-6xl mx-auto">
        {/* 顶部：题名与菜单 */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-brush text-3xl text-gold-400 text-shadow-ink tracking-widest">
              {GAME_TITLE_BOOK}
            </h1>
            <p className="font-serif text-sm text-paper-400/60 mt-1">
              落笔成身，一念入江湖
              <span className="ml-3 font-number text-xs text-paper-400/40">{GAME_VERSION}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={openPaste}
              disabled={isGenerating}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-serif text-xs transition",
                isGenerating
                  ? "border-gold-500/20 text-paper-400/40 cursor-not-allowed"
                  : "border-gold-500/40 bg-gold-500/10 text-gold-400 hover:border-gold-400/70 hover:bg-gold-500/20",
              )}
              title="粘贴一整段开局文字，直接把这一段交给推演开局"
            >
              <ClipboardPaste size={13} /> 整段开局
            </button>
            <button
              onClick={quickStart}
              disabled={isGenerating}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-serif text-xs transition",
                isGenerating
                  ? "border-gold-500/20 text-paper-400/40 cursor-not-allowed"
                  : "border-cinnabar-500/50 bg-[rgba(168,50,50,0.10)] text-cinnabar-400 hover:border-cinnabar-400/80 hover:bg-[rgba(168,50,50,0.18)]",
              )}
              title="随机填一份人物设定，落在「落印」一步，可逐项改过再开局"
            >
              <Zap size={13} /> 快速开局
            </button>
            <button
              type="button"
              onClick={() => goTo(steps.findIndex((s) => s.id === "api"))}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink-800 border-2 border-gold-500 transition hover:border-gold-400 hover:bg-gold-500/10"
              title="通灵设置：修改接口密钥、模型与 Base URL"
            >
              <span
                className={cn("w-2 h-2 rounded-full", configured ? "bg-jade-400" : "bg-cinnabar-500")}
              />
              <span className="font-serif text-xs text-paper-400/70">
                {configured ? "通灵已接 · 修改" : "尚未通灵 · 配置"}
              </span>
            </button>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((v) => !v)}
                className={cn(
                  "w-9 h-9 rounded flex items-center justify-center border-2 transition",
                  showMenu
                    ? "border-gold-400 bg-gold-400 text-gold-400"
                    : "border-gold-500 text-paper-300 hover:border-gold-400 hover:bg-gold-400 hover:text-gold-400",
                )}
                title="存档管理"
              >
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <div
                  className="absolute top-full right-0 mt-2 w-40 rounded-lg border border-gold-500/20 bg-ink-900/95 backdrop-blur-sm shadow-xl z-50 overflow-hidden"
                  style={{ animation: "inkSpread 0.2s ease-out" }}
                >
                  <button
                    onClick={openSaveManager}
                    className="w-full flex items-center gap-3 px-4 py-2.5 font-serif text-sm text-paper-200 hover:bg-gold-500/10 transition-colors"
                  >
                    <FolderOpen size={14} className="text-paper-400" /> 存档管理
                  </button>
                  {turns.length > 0 && (
                    <>
                      <div className="h-px bg-gold-500" />
                      <button
                        onClick={startNewGame}
                        className="w-full flex items-center gap-3 px-4 py-2.5 font-serif text-sm text-cinnabar-400 hover:bg-cinnabar-500/10 transition-colors"
                      >
                        <RotateCcw size={14} /> 新游戏
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-6 items-start">
          {/* 左：玉牌，实时显示角色卡与步骤进度 */}
          <aside className="jade-tablet rounded-lg p-5 sticky top-10">
            <div className="flex items-center gap-3">
              <div className={cn(sealBase, "bg-cinnabar-500 text-paper-50 w-12 h-12 text-lg")}>
                {setup.name.trim().charAt(0) || "道"}
              </div>
              <div className="min-w-0">
                <div className="font-brush text-lg text-paper-50 tracking-wider truncate">
                  {setup.name.trim() || "无名之辈"}
                </div>
                <div className="font-serif text-xs text-gold-400/80 truncate">
                  「{setup.title.trim() || "尚未取号"}」
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="font-serif text-xs text-cinnabar-400">
                {setup.realm}
                <span className="text-gold-400 ml-1">初期</span>
              </div>
              <div className="font-serif text-xs text-paper-400 truncate">
                {setup.sectName.trim() || "散修"} · {setup.position}
              </div>
              <div className="font-serif text-xs text-paper-500">
                {setup.gender === "male" ? "男" : "女"}
              </div>
            </div>

            <div className="cloud-divider my-4" />

            <div className="space-y-1">
              {steps.map((s, i) => {
                const done = i < activeIndex;
                const current = i === activeIndex;
                const clickable = i <= reached || done;
                return (
                  <button
                    key={s.id}
                    onClick={() => clickable && goTo(i)}
                    disabled={!clickable}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-colors",
                      current && "bg-gold-400/10",
                      clickable ? "cursor-pointer hover:bg-paper-400/5" : "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "w-5 h-5 rounded-sm flex items-center justify-center text-xs shrink-0 border-2 font-brush",
                        done && "bg-cinnabar-500 border-cinnabar-400 text-paper-50",
                        current && "border-gold-400 text-gold-400",
                        !done && !current && "border-paper-400 text-paper-400",
                      )}
                    >
                      {done ? <Check size={11} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block font-brush text-sm tracking-wider",
                          current ? "text-gold-400" : done ? "text-paper-200" : "text-paper-400/40",
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="block font-serif text-xs text-paper-500/45 truncate">
                        {s.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* 右：宣纸卷面 */}
          <section className="paper-sheet rounded-lg p-7">
            {/* 已完成步骤：收成一行，落一枚印 */}
            {steps.slice(0, activeIndex).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 py-2.5 border-b ps-rule"
              >
                <span className="font-brush text-sm ps-accent tracking-wider shrink-0 w-12">{s.label}</span>
                <span className="font-serif text-sm ps-body truncate flex-1 text-right">{renderSummary(s.id)}</span>
                <span className="w-5 h-5 rounded-sm bg-[#a83232] text-[#f5ecd6] text-xs flex items-center justify-center shrink-0 font-brush">
                  印
                </span>
              </div>
            ))}

            {/* 当前步骤 */}
            <div className="pt-6">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="font-brush text-xs ps-accent tracking-widest">
                  第 {activeIndex + 1} 步
                </span>
                <h2 className="font-brush text-2xl ps-strong tracking-widest">{activeStep.label}</h2>
              </div>
              <p className="font-serif text-xs ps-muted mb-6">{activeStep.hint}</p>

              {activeStep.id === "api" && renderApiStep()}
              {activeStep.id === "name" && renderNameStep()}
              {activeStep.id === "realm" && renderRealmStep()}
              {activeStep.id === "sect" && renderSectStep()}
              {activeStep.id === "self" && renderSelfStep()}
              {activeStep.id === "seal" && renderSealStep()}

              {error && (
                <div className="mt-5 px-4 py-3 rounded border border-[#a83232]/40 bg-[rgba(168,50,50,0.08)] font-serif text-sm ps-accent">
                  {error}
                </div>
              )}
            </div>

            {/* 未展开的后续步骤 */}
            {activeIndex < steps.length - 1 && (
              <div className="mt-7 space-y-2">
                {steps.slice(activeIndex + 1).map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="flex-1 h-px bg-gradient-to-r from-[rgba(36,31,26,0.16)] to-transparent" />
                    <span className="font-serif text-xs ps-faint whitespace-nowrap">
                      {s.label} · 尚未展开
                    </span>
                    <span className="flex-1 h-px bg-gradient-to-l from-[rgba(36,31,26,0.16)] to-transparent" />
                  </div>
                ))}
              </div>
            )}

            {/* 底部导航 */}
            <div className="mt-8 pt-5 border-t ps-rule flex items-center justify-between">
              <button
                onClick={() => goTo(activeIndex - 1)}
                disabled={activeIndex === 0}
                className="btn-paper px-4 py-2 rounded font-serif text-sm"
              >
                ← 上一步
              </button>

              <div className="flex items-center gap-3">
                {footerNote() && (
                  <span className="font-serif text-xs ps-faint">{footerNote()}</span>
                )}
                {activeStep.id === "api" ? null : isLast ? (
                  <SealButton
                    onClick={handleStart}
                    disabled={isGenerating || !setup.name.trim() || !setup.description.trim()}
                    className="px-8 py-3 text-base font-brush tracking-widest"
                  >
                    {isGenerating ? "正在推演开篇…" : "踏入江湖"}
                  </SealButton>
                ) : (
                  <SealButton
                    onClick={goNext}
                    disabled={!stepValid(activeStep.id)}
                    className="px-6 py-2.5 font-brush tracking-widest"
                  >
                    下一步 →
                  </SealButton>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 整段开局：贴一大段自述，直接交给推演写下开篇 */}
      {showPaste && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6 bg-ink-900/80 backdrop-blur-sm">
          <div className="paper-sheet rounded-lg p-5 sm:p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-brush text-xl ps-strong tracking-widest">整段开局</h3>
                <p className="font-serif text-xs ps-muted mt-1 leading-relaxed">
                  把你想好的开局整段贴进来——姓名、境界、宗门、身世、灵根、随身之物，写多写少都无妨。
                  这一段会原样作为开篇的依据，不加拆解；凡未写到的，由推演自行补白。
                </p>
              </div>
              <button
                onClick={() => setShowPaste(false)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded ps-faint hover:ps-accent transition"
                title="合上"
              >
                <X size={16} />
              </button>
            </div>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={11}
              placeholder={
                "例如：\n我叫沈听雪，江湖上唤作雪中孤鸿，是个女子。\n出身江南听雨岛，拜在外门，如今炼气后期。\n生性外冷内热，遇事先谋后动。\n随身只带一柄旧剑与半枚残玉，剑是师父留下的……"
              }
              className="input-paper px-3 py-2 resize-none w-full font-serif text-sm leading-relaxed"
              style={{ fontFamily: '"Noto Serif SC", serif' }}
            />

            <div className="flex items-center justify-between gap-3">
              <span className="font-serif text-xs ps-faint">
                这一段会原样交给推演，不再拆栏；凡未写到的，由它补白。
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowPaste(false)}
                  className="btn-paper px-4 py-2 rounded font-serif text-sm"
                >
                  取消
                </button>
                <SealButton
                  onClick={startWithPaste}
                  disabled={!pasteText.trim() || isGenerating}
                  className="px-6 py-2.5 font-brush tracking-widest"
                >
                  {isGenerating ? "正在推演…" : "以此开局"}
                </SealButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 开局推演时的等待页 */}
      {isGenerating && <OpeningLoading />}

      {/* 自定义接口：另开一扇窗；它自己存自己 */}
      <CustomApiModal
        open={customApiOpen}
        onClose={() => {
          setCustomApiOpen(false);
          // 那扇窗保存后本机设置已变，这里把草稿重新对齐，
          // 免得「保存并继续」拿旧草稿把刚填的接口覆盖掉
          setApiDraft(useAIStore.getState().settings);
        }}
      />
    </div>
  );

  /** 已完成步骤在卷面上显示的一行摘要 */
  function renderSummary(id: StepId): string {
    if (id === "api") return "接口已接通";
    if (id === "name") {
      return `${setup.name.trim()} · ${setup.title.trim() || "无名之辈"} · ${setup.gender === "male" ? "男" : "女"
        }`;
    }
    if (id === "realm") return setup.realm;
    if (id === "sect") return `${setup.sectName.trim() || "散修"} · ${setup.position}`;
    if (id === "self") return setup.description.trim();
    return "";
  }

  function renderApiStep() {
    return (
      <div className="space-y-4">
        <p className="font-serif text-sm ps-body leading-relaxed">
          本作的推演由大语言模型担纲。默认走游戏后端，接口与密钥都由后端操持，本机不必填写；
          这里选好额度与模型名即可。若你有自己的接口，也可另开「自定义接口」直接使用。
        </p>

        <QuotaShopPanel freeActive={freeActive} onSelectFree={applyFreeModel} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block font-serif text-xs ps-muted mb-1">Flash 模型（判定与压缩）</span>
            <input
              type="text"
              value={apiDraft.flashModel}
              onChange={(e) => setApiDraft((d) => ({ ...d, flashModel: e.target.value }))}
              placeholder="moonshotai/kimi-k3-free"
              className="input-paper px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block font-serif text-xs ps-muted mb-1">Pro 模型（叙事生成）</span>
            <input
              type="text"
              value={apiDraft.proModel}
              onChange={(e) => setApiDraft((d) => ({ ...d, proModel: e.target.value }))}
              placeholder="moonshotai/kimi-k3-free"
              className="input-paper px-3 py-2 text-sm"
            />
          </label>
        </div>

        {/* 推演去向：默认走后端，也可自备接口 */}
        <div className="flex flex-wrap items-center gap-3 rounded border border-[rgba(36,31,26,0.16)] px-3 py-2.5">
          <button
            type="button"
            onClick={() => setCustomApiOpen(true)}
            className="btn-paper px-4 py-1.5 rounded font-serif text-xs flex items-center gap-1.5"
          >
            <Plug size={12} /> 自定义接口
          </button>
          <span className="font-serif text-xs ps-muted">
            {customActive ? "已启用：推演走你自己的接口" : "默认走后端，无需填写"}
          </span>
        </div>

        <button
          type="button"
          onClick={saveApiSettings}
          className="btn-paper px-5 py-2 rounded font-serif text-sm"
        >
          保存并继续
        </button>
      </div>
    );
  }

  function renderNameStep() {
    return (
      <div className="space-y-5">
        <p className="font-serif text-sm ps-body leading-relaxed">
          名者，身之始也。先定下你的姓名与称号，这将是江湖中人称呼你的方式。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block font-serif text-xs ps-muted mb-1">姓名 *</span>
            <input
              type="text"
              value={setup.name}
              onChange={(e) => change("name", e.target.value)}
              placeholder="如：墨尘"
              maxLength={20}
              className="input-paper px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block font-serif text-xs ps-muted mb-1">称号</span>
            <input
              type="text"
              value={setup.title}
              onChange={(e) => change("title", e.target.value)}
              placeholder="如：青衫客"
              maxLength={20}
              className="input-paper px-3 py-2"
            />
          </label>
        </div>

        <div>
          <span className="block font-serif text-xs ps-muted mb-2">性别</span>
          <div className="flex gap-2">
            {([
              { value: "male", label: "男" },
              { value: "female", label: "女" },
            ] as const).map((g) => (
              <button
                key={g.value}
                onClick={() => change("gender", g.value)}
                className={cn(
                  "px-6 py-2 rounded font-serif text-sm border-2 transition-colors",
                  setup.gender === g.value
                    ? "border-cinnabar bg-cinnabar ps-accent"
                    : "border-ink-medium ps-body hover:border-cinnabar",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderRealmStep() {
    return (
      <div className="space-y-5">
        <p className="font-serif text-sm ps-body leading-relaxed">
          境者，器之量也。你从何处起步，决定了这一路要走多远。
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {REALMS.map((r) => {
            const active = setup.realm === r;
            return (
              <button
                key={r}
                onClick={() => change("realm", r)}
                className={cn(
                  "py-2.5 rounded font-brush text-sm tracking-wider border transition-colors",
                  active
                    ? "border-[#a83232]/60 bg-[rgba(168,50,50,0.08)] ps-accent"
                    : "border-[rgba(70,52,28,0.25)] ps-body hover:border-[#a83232]/40",
                )}
              >
                {r}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 rounded bg-[rgba(36,31,26,0.05)] border border-[rgba(36,31,26,0.1)]">
          <span className="font-serif text-sm ps-body">
            <span className="ps-accent font-brush tracking-wider">{setup.realm}初期</span>
            <span className="ps-muted"> — {REALM_NOTES[setup.realm]}</span>
          </span>
        </div>
      </div>
    );
  }

  function renderSectStep() {
    return (
      <div className="space-y-5">
        <p className="font-serif text-sm ps-body leading-relaxed">
          宗者，道之枢也。留下宗门与职位，若一时未有归属，填「散修」即可。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block font-serif text-xs ps-muted mb-1">宗门</span>
            <input
              type="text"
              value={setup.sectName}
              onChange={(e) => change("sectName", e.target.value)}
              placeholder="如：青云宗，留空则为散修"
              maxLength={20}
              className="input-paper px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="block font-serif text-xs ps-muted mb-1">职位</span>
            <select
              value={setup.position}
              onChange={(e) => change("position", e.target.value)}
              className="input-paper px-3 py-2"
            >
              {SECT_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  }

  function renderSelfStep() {
    return (
      <div className="space-y-5">
        <p className="font-serif text-sm ps-body leading-relaxed">
          这一段会直接交给推演引擎，用来决定你的灵根、经脉、初始功法与随身之物。写得越具体，开篇越贴合你的设想。
        </p>

        <label className="block">
          <span className="block font-serif text-xs ps-muted mb-1">人物简介 *</span>
          <textarea
            value={setup.description}
            onChange={(e) => change("description", e.target.value)}
            placeholder="如：身负冰火双灵根的散修，左眉有一道旧疤，随身只带半枚残玉。"
            rows={3}
            maxLength={200}
            className="input-paper px-3 py-2 resize-none"
          />
        </label>

        <label className="block">
          <span className="block font-serif text-xs ps-muted mb-1">性格特点</span>
          <textarea
            value={setup.personality}
            onChange={(e) => change("personality", e.target.value)}
            placeholder="如：外冷内热，遇事先谋后动，重诺。"
            rows={2}
            maxLength={100}
            className="input-paper px-3 py-2 resize-none"
          />
        </label>

        <label className="block">
          <span className="block font-serif text-xs ps-muted mb-1">背景故事</span>
          <textarea
            value={setup.background}
            onChange={(e) => change("background", e.target.value)}
            placeholder="如：自幼被青云宗收养，不知父母来历。"
            rows={3}
            maxLength={500}
            className="input-paper px-3 py-2 resize-none"
          />
        </label>
      </div>
    );
  }

  function renderSealStep() {
    // 每一行都标出它归哪一步，点「改」便跳去那一步单独修改
    const rows: { k: string; v: string; step: StepId }[] = [
      { k: "姓名", v: setup.name.trim(), step: "name" },
      { k: "称号", v: setup.title.trim() || "无名之辈", step: "name" },
      { k: "性别", v: setup.gender === "male" ? "男" : "女", step: "name" },
      { k: "境界", v: `${setup.realm}初期`, step: "realm" },
      { k: "宗门", v: `${setup.sectName.trim() || "散修"} · ${setup.position}`, step: "sect" },
      { k: "人物简介", v: setup.description.trim(), step: "self" },
    ];
    if (setup.personality.trim()) rows.push({ k: "性格特点", v: setup.personality.trim(), step: "self" });
    if (setup.background.trim()) rows.push({ k: "背景故事", v: setup.background.trim(), step: "self" });

    return (
      <div className="space-y-5">
        <p className="font-serif text-sm ps-body leading-relaxed">
          确认无误后落印。推演引擎将据此为你生成开篇：灵根、经脉、功法、随身之物、师门与相识之人都会一并成形。
          <span className="ps-muted">　哪一项要改，点它右侧的「改」跳到那一步便是。</span>
        </p>

        <div className="rounded border border-[rgba(36,31,26,0.16)] divide-y divide-[rgba(36,31,26,0.1)]">
          {rows.map((r) => {
            const at = steps.findIndex((s) => s.id === r.step);
            return (
              <div key={r.k} className="grid grid-cols-[4.5rem_1fr_2rem] gap-4 px-4 py-2.5 items-center">
                <span className="font-serif text-xs ps-muted pt-0.5">{r.k}</span>
                <span className="font-serif text-sm ps-strong">{r.v}</span>
                {at >= 0 ? (
                  <button
                    type="button"
                    onClick={() => goTo(at)}
                    title={`去「${steps[at].label}」改这一项`}
                    className="font-serif text-xs justify-self-end ps-faint hover:ps-accent transition"
                  >
                    改
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
