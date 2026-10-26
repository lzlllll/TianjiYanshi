import { useEffect, useRef, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { useGameStore } from "@/store/useGameStore";
import { useTutorialStore } from "@/store/useTutorialStore";
import { chatWithModel } from "@/lib/aiClient";
import type { AISettings, ModelReasoningMode, ThinkingParamStyle } from "@/data/types";
import { AI_BACKEND_READY, hasCustomApi } from "@/data/backend";
import { FREE_MODEL } from "@/data/aiQuota";
import { QuotaShopPanel } from "@/components/ai/QuotaShopPanel";
import { CustomApiModal } from "@/components/ai/CustomApiModal";
import { SealButton } from "@/components/ui/SealButton";
import { bgm, DEFAULT_BGM_VOLUME } from "@/lib/bgm";
import { cn } from "@/lib/utils";
import { effectiveHpMax } from "@/lib/buffUtils";
import { X, Loader2, CheckCircle2, AlertTriangle, Plug } from "lucide-react";

const DEFAULT_FONT_SCALE = 1;

interface AISettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** 游戏内才给开发者测试入口；主菜单等处一概不放 */
  allowTestTools?: boolean;
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; msg: string; model: "flash" | "pro" }
  | { status: "error"; msg: string; model: "flash" | "pro" };

export function AISettingsModal({ open, onClose, allowTestTools = false }: AISettingsModalProps) {
  const settings = useAIStore((s) => s.settings);
  const updateSettings = useAIStore((s) => s.updateSettings);
  const isDeveloperMode = useAIStore((s) => s.isDeveloperMode);
  const setDeveloperMode = useAIStore((s) => s.setDeveloperMode);
  const randomEventDisabled = useAIStore((s) => s.randomEventDisabled);
  const setRandomEventDisabled = useAIStore((s) => s.setRandomEventDisabled);
  const tutorialDisabled = useTutorialStore((s) => s.disabled);
  const setTutorialDisabled = useTutorialStore((s) => s.setDisabled);
  const openCrafting = useAIStore((s) => s.openCrafting);
  const startBattle = useAIStore((s) => s.startBattle);

  const [draft, setDraft] = useState<AISettings>(settings);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [saved, setSaved] = useState(false);
  // 「自定义接口」那扇窗单独开：它自己存自己的，随此处一同关上也无妨
  const [customApiOpen, setCustomApiOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 每次打开时同步最新设置
  useEffect(() => {
    if (open) {
      // 免费预设的模型名不可改：打开时先照它对齐，旧设置里若有别的名字也不带上界面
      setDraft(
        hasCustomApi(settings)
          ? settings
          : { ...settings, flashModel: FREE_MODEL.model, proModel: FREE_MODEL.model },
      );
      setTest({ status: "idle" });
      setSaved(false);
    }
  }, [open, settings]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 音量边拖边听。关闭时若没保存，退回已存的那个音量
  useEffect(() => {
    if (!open) return;
    bgm.setVolume(draft.bgmVolume ?? DEFAULT_BGM_VOLUME);
  }, [open, draft.bgmVolume]);

  useEffect(() => {
    if (!open) return;
    return () => {
      bgm.setVolume(useAIStore.getState().settings.bgmVolume ?? DEFAULT_BGM_VOLUME);
    };
  }, [open]);

  // 字号边拖边看。关闭时若没保存，退回已存的那个字号
  useEffect(() => {
    if (!open) return;
    document.documentElement.style.fontSize = `${16 * (draft.fontScale ?? DEFAULT_FONT_SCALE)}px`;
  }, [open, draft.fontScale]);

  useEffect(() => {
    if (!open) return;
    return () => {
      const saved = useAIStore.getState().settings.fontScale ?? DEFAULT_FONT_SCALE;
      document.documentElement.style.fontSize = `${16 * saved}px`;
    };
  }, [open]);

  if (!open) return null;

  const patch = (p: Partial<AISettings>) => setDraft((d) => ({ ...d, ...p }));

  // 是否已启用自定义接口；以已保存的设置为准，那扇窗自己保存自己
  const customActive = hasCustomApi(settings);

  // 当前是否正用着官方的免费模型：模型名对得上，且没另接自己的接口
  const freeActive =
    !hasCustomApi(draft) &&
    draft.flashModel === FREE_MODEL.model &&
    draft.proModel === FREE_MODEL.model;

  // 选用免费模型：写回模型名，并把自定义接口让开——免费额度本就是后端供给的
  const applyFreeModel = () => {
    setDraft((d) => ({
      ...d,
      baseUrl: "",
      apiKey: "",
      flashModel: FREE_MODEL.model,
      proModel: FREE_MODEL.model,
      // 免费模型不带思维链，先前那档的手动设定别跟着留下
      flashReasoning: "auto",
      proReasoning: "auto",
      thinkingStyle: "auto",
    }));
    setTest({ status: "idle" });
  };

  const runTest = async (which: "flash" | "pro") => {
    setTest({ status: "testing" });
    try {
      const model = !customActive
        ? FREE_MODEL.model
        : which === "flash"
          ? draft.flashModel
          : draft.proModel;
      const start = Date.now();
      await chatWithModel(
        draft,
        model,
        [
          {
            role: "user",
            content: "请回复：通",
          },
        ],
        { timeoutMs: 15000 },
      );
      if (!isMountedRef.current) return;
      const elapsed = Date.now() - start;
      setTest({
        status: "ok",
        msg: `${model} 连接成功（${elapsed}ms）`,
        model: which,
      });
    } catch (e) {
      if (!isMountedRef.current) return;
      setTest({
        status: "error",
        msg: (e as Error).message,
        model: which,
      });
    }
  };

  const handleSave = () => {
    updateSettings(draft);
    setSaved(true);
    setTimeout(() => {
      if (isMountedRef.current) {
        onClose();
      }
    }, 600);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread"
        onClick={onClose}
      />

      {/* 主体 */}
      <div
        ref={dialogRef}
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        {/* 标题栏 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 red-seal rounded-sm text-base">设</div>
            <div>
              <h2 className="font-brush text-2xl text-gold-400 tracking-widest text-shadow-ink">
                通灵设置
              </h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5">
                配置天机接口，连通两界叙事
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 额度内购：目前只开免费模型一档，付费套餐待开 */}
          <QuotaShopPanel freeActive={freeActive} onSelectFree={applyFreeModel} />

          {/* 推演去向：默认走后端；自备接口则在此另开一扇窗 */}
          <section className="rounded border border-paper-400/12 bg-ink-900/30 px-3 py-2.5 space-y-2">
            <p className="font-serif text-xs leading-relaxed text-paper-300/80">
              {customActive
                ? "当前走你自己的接口，推演不再经游戏后端。"
                : "当前走游戏后端：上游地址与密钥由后端统一持有，本机不保存密钥。"}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCustomApiOpen(true)}
                className="ghost-btn px-3 py-1.5 rounded text-xs flex items-center gap-1.5"
              >
                <Plug size={12} /> 自定义接口
              </button>
              <span
                className={cn(
                  "font-serif text-[11px]",
                  customActive
                    ? "text-jade-400"
                    : AI_BACKEND_READY
                      ? "text-paper-400/60"
                      : "text-gold-400/80",
                )}
              >
                {customActive ? "已启用" : AI_BACKEND_READY ? "走后端" : "后端未接通"}
              </span>
            </div>
          </section>

          {/* 双模型 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <section>
              <SectionLabel>
                Flash 模型
                <span className="font-serif text-xs text-paper-400/50 ml-2">数据判断 / 压缩</span>
              </SectionLabel>
              <input
                type="text"
                value={customActive ? draft.flashModel : FREE_MODEL.model}
                onChange={(e) => patch({ flashModel: e.target.value })}
                placeholder="deepseek-chat"
                className="input-ink mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                spellCheck={false}
                disabled={!customActive}
              />
              <label className="mt-2 flex items-center gap-2 font-serif text-xs text-paper-400/60">
                <span className="shrink-0">思维链</span>
                <select
                  value={draft.flashReasoning ?? "auto"}
                  onChange={(e) => patch({ flashReasoning: e.target.value as ModelReasoningMode })}
                  className="input-ink py-1"
                >
                  <option value="auto">自动判断</option>
                  <option value="on">有</option>
                  <option value="off">无</option>
                </select>
              </label>
              <button
                onClick={() => runTest("flash")}
                disabled={test.status === "testing"}
                className="ghost-btn mt-2 w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
              >
                {test.status === "testing" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : null}
                测试 Flash 连接
              </button>
            </section>

            <section>
              <SectionLabel>
                Pro 模型
                <span className="font-serif text-xs text-paper-400/50 ml-2">叙事生成</span>
              </SectionLabel>
              <input
                type="text"
                value={customActive ? draft.proModel : FREE_MODEL.model}
                onChange={(e) => patch({ proModel: e.target.value })}
                placeholder="deepseek-reasoner"
                className="input-ink mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
                spellCheck={false}
                disabled={!customActive}
              />
              <label className="mt-2 flex items-center gap-2 font-serif text-xs text-paper-400/60">
                <span className="shrink-0">思维链</span>
                <select
                  value={draft.proReasoning ?? "auto"}
                  onChange={(e) => patch({ proReasoning: e.target.value as ModelReasoningMode })}
                  className="input-ink py-1"
                >
                  <option value="auto">自动判断</option>
                  <option value="on">有</option>
                  <option value="off">无</option>
                </select>
              </label>
              <button
                onClick={() => runTest("pro")}
                disabled={test.status === "testing"}
                className="ghost-btn mt-2 w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
              >
                {test.status === "testing" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : null}
                测试 Pro 连接
              </button>
            </section>
          </div>

          {!customActive && (
            <p className="font-serif text-xs text-paper-400/50 leading-relaxed">
              免费预设模型不可改名；要指定自己的模型，请先在「自定义接口」里填齐 Base URL 与 API Key。
            </p>
          )}

          {/* 思考参数：各家对「开思考／关思考」的叫法不同，换模型后思考停不下来时可在此指定 */}
          <section>
            <SectionLabel>
              思考参数
              <span className="font-serif text-xs text-paper-400/50 ml-2">换模型后思考过长时调整</span>
            </SectionLabel>
            <select
              value={draft.thinkingStyle ?? "auto"}
              onChange={(e) => patch({ thinkingStyle: e.target.value as ThinkingParamStyle })}
              className="input-ink mt-2"
            >
              <option value="auto">自动识别（按接口地址与模型名）</option>
              <option value="openai">OpenAI 系 · reasoning_effort</option>
              <option value="qwen">通义千问 · enable_thinking</option>
              <option value="glm">智谱 / 豆包 / 文心 · thinking.type</option>
              <option value="deepseek">DeepSeek · thinking.type</option>
              <option value="moonshot">Kimi · reasoning_effort</option>
              <option value="openrouter">OpenRouter · reasoning</option>
              <option value="vllm">vLLM / SiliconFlow · chat_template_kwargs</option>
              <option value="none">不发思考参数</option>
            </select>
            <p className="mt-1.5 font-serif text-[11px] leading-relaxed text-paper-400/55">
              自动识别先看自定义接口的地址，再看模型名；认不出时先照 OpenAI 的写法发，不被认便自动退回通用写法，仍不行就不带思考参数。关掉思考的一档会明确发送关闭参数，免得带思考的模型把额度耗在思维链上。GLM-5.3 一类强制思考、关不掉，只会压到 low 这一档。思考若超过约六千字仍不落笔，会自动掐断并按「关思考」重发一次；仍压不住便提示换一档模型。
            </p>
          </section>

          {/* 测试结果 */}
          {test.status !== "idle" && test.status !== "testing" && (
            <div
              className={cn(
                "rounded px-3 py-2 flex items-start gap-2 text-xs font-serif",
                test.status === "ok"
                  ? "bg-jade-500/10 border border-jade-500/30 text-jade-400"
                  : "bg-cinnabar-500/10 border border-cinnabar-500/30 text-cinnabar-400",
              )}
            >
              {test.status === "ok" ? (
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed break-all">{test.msg}</span>
            </div>
          )}

          {/* 温度 */}
          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>温度</SectionLabel>
              <span className="font-number text-sm text-gold-400">
                {draft.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={draft.temperature}
              onChange={(e) => patch({ temperature: parseFloat(e.target.value) })}
              className="fire-slider mt-3 w-full"
            />
            <div className="flex justify-between mt-1.5 font-serif text-xs text-paper-400/50">
              <span>0 · 严谨</span>
              <span>1 · 平衡</span>
              <span>2 · 奔放</span>
            </div>
          </section>

          {/* 背景音乐：日常与战斗两轨自动换，音量此处定 */}
          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>背景音乐</SectionLabel>
              <span className="font-number text-sm text-gold-400">
                {Math.round((draft.bgmVolume ?? DEFAULT_BGM_VOLUME) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.bgmVolume ?? DEFAULT_BGM_VOLUME}
              onChange={(e) => patch({ bgmVolume: parseFloat(e.target.value) })}
              className="fire-slider mt-3 w-full"
            />
            <p className="font-serif text-xs text-paper-400/50 mt-1.5 leading-relaxed">
              日常放《醉酒》，战事一起换成《将军令》，换轨时交叉淡入淡出。拖到 0 即静音。
            </p>
          </section>

          {/* 字体大小：整页随根字号缩放 */}
          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>字体大小</SectionLabel>
              <span className="font-number text-sm text-gold-400">
                {Math.round((draft.fontScale ?? DEFAULT_FONT_SCALE) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.85}
              max={1.3}
              step={0.05}
              value={draft.fontScale ?? DEFAULT_FONT_SCALE}
              onChange={(e) => patch({ fontScale: parseFloat(e.target.value) })}
              className="fire-slider mt-3 w-full"
            />
            <div className="flex justify-between mt-1.5 font-serif text-xs text-paper-400/50">
              <span>85% · 小</span>
              <span>100% · 标准</span>
              <span>130% · 大</span>
            </div>
          </section>

          {/* 叙事留存：只影响是否另存全文，推演仍走压缩摘要 */}
          <section>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel>保留全程叙事</SectionLabel>
                <p className="font-serif text-xs text-paper-400/50 mt-1 leading-relaxed">
                  开启后逐回另存原文，可在存档管理里整本导出。推演照旧只带压缩摘要与近几轮，
                  等待与消耗都不变；开启之前的章节不会追记。
                </p>
              </div>
              <button
                onClick={() => patch({ keepFullNarrative: !draft.keepFullNarrative })}
                className={cn(
                  "relative h-6 w-12 shrink-0 rounded-full transition-colors",
                  draft.keepFullNarrative
                    ? "bg-gold-500/30 border border-gold-400/50"
                    : "bg-ink-700/50 border border-paper-400/20",
                )}
                aria-label="保留全程叙事"
              >
                <div
                  className={cn(
                    "absolute top-1 h-4 w-4 rounded-full transition-transform",
                    draft.keepFullNarrative ? "left-7 bg-gold-400" : "left-1 bg-paper-400/50",
                  )}
                />
              </button>
            </div>
          </section>

          {/* 新手引导：拨上之后不再自动弹出，想重看可在顶栏菜单里手动打开 */}
          <section>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel>新手引导</SectionLabel>
                <p className="font-serif text-xs text-paper-400/50 mt-1 leading-relaxed">
                  拨上之后，往后进游戏、开面板都不再自动弹出引导。想重看时，仍可在顶栏菜单里手动打开。
                </p>
              </div>
              <button
                onClick={() => setTutorialDisabled(!tutorialDisabled)}
                className={cn(
                  "relative h-6 w-12 shrink-0 rounded-full transition-colors",
                  tutorialDisabled
                    ? "bg-gold-500/30 border border-gold-400/50"
                    : "bg-ink-700/50 border border-paper-400/20",
                )}
                aria-label="关闭新手引导"
              >
                <div
                  className={cn(
                    "absolute top-1 h-4 w-4 rounded-full transition-transform",
                    tutorialDisabled ? "left-7 bg-gold-400" : "left-1 bg-paper-400/50",
                  )}
                />
              </button>
            </div>
          </section>

          {/* 自定义提示词 */}
          <section>
            <SectionLabel>自定义提示词</SectionLabel>
            <textarea
              value={draft.customPrompt || ""}
              onChange={(e) => patch({ customPrompt: e.target.value })}
              placeholder="在此输入自定义指令，将追加到AI系统提示词末尾。例如：&#10;- 增加更多战斗描写&#10;- NPC对话更加幽默&#10;- 剧情偏向黑暗风格&#10;- 关注角色情感变化"
              className="input-ink mt-2 min-h-[100px] resize-y font-serif text-xs leading-relaxed"
              spellCheck={false}
            />
            <p className="font-serif text-xs text-paper-400/50 mt-1.5 leading-relaxed">
              玩家自定义指令将追加到每轮叙事生成的系统提示词末尾，用于微调AI的叙事风格和偏好。留空则不追加。
            </p>
          </section>

          {/* 开发者模式 */}
          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>开发者模式</SectionLabel>
              <button
                onClick={() => setDeveloperMode(!isDeveloperMode)}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  isDeveloperMode ? "bg-cinnabar-500/30 border border-cinnabar-400/50" : "bg-ink-700/50 border border-paper-400/20",
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full transition-transform",
                    isDeveloperMode
                      ? "left-7 bg-cinnabar-400"
                      : "left-1 bg-paper-400/50",
                  )}
                />
              </button>
            </div>
            {isDeveloperMode && (
              <div className="mt-3 space-y-2">
                <div className="bg-cinnabar-500/5 border border-cinnabar-500/20 rounded px-3 py-2">
                  <p className="font-serif text-xs text-cinnabar-300/80">
                    已启用开发者模式
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded border border-paper-400/20 bg-ink-900/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-serif text-xs text-paper-200">关闭随机事件</p>
                      <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-paper-400/60">
                        拨上之后，时间再往前走也不生路上的变故；退出开发者模式即自动恢复。
                      </p>
                    </div>
                    <button
                      onClick={() => setRandomEventDisabled(!randomEventDisabled)}
                      className={cn(
                        "relative h-6 w-12 shrink-0 rounded-full transition-colors",
                        randomEventDisabled
                          ? "bg-cinnabar-500/30 border border-cinnabar-400/50"
                          : "bg-ink-700/50 border border-paper-400/20",
                      )}
                      aria-label="关闭随机事件"
                    >
                      <div
                        className={cn(
                          "absolute top-1 h-4 w-4 rounded-full transition-transform",
                          randomEventDisabled ? "left-7 bg-cinnabar-400" : "left-1 bg-paper-400/50",
                        )}
                      />
                    </button>
                  </div>
                  {allowTestTools && (
                    <>
                      <button
                        onClick={() => {
                          openCrafting();
                          onClose();
                        }}
                        className="ghost-btn mt-2 w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
                      >
                        强制打开百艺窗口（测试）
                      </button>
                  <button
                    onClick={() => {
                      const player = useGameStore.getState().player;
                      const maxHp = effectiveHpMax(player);
                      startBattle({
                        width: 10,
                        height: 10,
                        entities: [
                          {
                            id: "player",
                            name: player.name,
                            type: "player",
                            position: { x: 5, y: 5 },
                            hp: Math.min(player.hp, maxHp),
                            maxHp,
                            mp: player.mp,
                            maxMp: player.mpMax,
                          },
                          {
                            id: "enemy1",
                            name: "妖兽",
                            type: "enemy",
                            position: { x: 7, y: 5 },
                            hp: 100,
                            maxHp: 100,
                          },
                          {
                            id: "enemy2",
                            name: "魔修",
                            type: "enemy",
                            position: { x: 5, y: 7 },
                            hp: 80,
                            maxHp: 80,
                          },
                          {
                            id: "obstacle1",
                            name: "岩石",
                            type: "obstacle",
                            position: { x: 6, y: 6 },
                          },
                        ],
                      });
                      onClose();
                    }}
                    className="ghost-btn mt-2 w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
                  >
                    强制触发战斗模式（测试）
                  </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* 底部操作 */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <SealButton variant="ghost" onClick={onClose}>
            取消
          </SealButton>
          <SealButton onClick={handleSave} className="min-w-[100px]">
            {saved ? "已保存" : "保存"}
          </SealButton>
        </div>
      </div>

      {/* 自定义接口：另开一扇窗，压在本窗之上 */}
      <CustomApiModal
        open={customApiOpen}
        onClose={() => {
          setCustomApiOpen(false);
          // 那扇窗保存后设置已变，这里把草稿重新对齐，
          // 免得本窗再点「保存」时把刚填的自定义接口与模型名覆盖掉
          setDraft(useAIStore.getState().settings);
          setTest({ status: "idle" });
        }}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="font-serif text-xs text-paper-300 tracking-wider flex items-center">
      {children}
    </label>
  );
}
