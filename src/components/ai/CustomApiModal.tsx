import { useEffect, useRef, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import type { AISettings } from "@/data/types";
import { hasCustomApi } from "@/data/backend";
import { chatWithModel } from "@/lib/aiClient";
import { FREE_MODEL } from "@/data/aiQuota";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, X } from "lucide-react";

interface CustomApiModalProps {
  open: boolean;
  onClose: () => void;
}

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; msg: string }
  | { status: "error"; msg: string };

const PRESETS: { label: string; baseUrl: string; flash: string; pro: string; note: string }[] = [
  {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    flash: "deepseek-v4-flash",
    pro: "deepseek-v4-pro",
    note: "默认支持浏览器直连",
  },
  {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    flash: "gpt-4o-mini",
    pro: "gpt-4o",
    note: "需自备代理，存在跨域限制",
  },
  {
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    flash: "glm-4-flash",
    pro: "glm-4-plus",
    note: "OpenAI 兼容接口",
  },
  {
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    flash: "qwen-turbo",
    pro: "qwen-max",
    note: "阿里云 DashScope",
  },
];

/**
 * 自定义接口。
 *
 * 默认走游戏后端；愿意自备接口的玩家在这里填上地址与密钥，
 * 两项填齐后便绕开后端，推演直接用他自己的服务商。
 */
export function CustomApiModal({ open, onClose }: CustomApiModalProps) {
  const settings = useAIStore((s) => s.settings);
  const updateSettings = useAIStore((s) => s.updateSettings);

  const [draft, setDraft] = useState<AISettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [saved, setSaved] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setTest({ status: "idle" });
      setSaved(false);
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (p: Partial<AISettings>) => setDraft((d) => ({ ...d, ...p }));

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setDraft((d) => ({
      ...d,
      baseUrl: preset.baseUrl,
      flashModel: preset.flash,
      proModel: preset.pro,
    }));
    setTest({ status: "idle" });
  };

  const customFilled = hasCustomApi(draft);

  const runTest = async (which: "flash" | "pro") => {
    if (!customFilled) {
      setTest({ status: "error", msg: "请先填齐 Base URL 与 API Key，再试连接。" });
      return;
    }
    setTest({ status: "testing" });
    try {
      const model = which === "flash" ? draft.flashModel : draft.proModel;
      const start = Date.now();
      await chatWithModel(draft, model, [{ role: "user", content: "请回复：通" }], {
        timeoutMs: 15000,
      });
      if (!isMountedRef.current) return;
      setTest({ status: "ok", msg: `${model} 连接成功（${Date.now() - start}ms）` });
    } catch (e) {
      if (!isMountedRef.current) return;
      setTest({ status: "error", msg: (e as Error).message });
    }
  };

  const clearCustom = () => {
    setDraft((d) => ({
      ...d,
      baseUrl: "",
      apiKey: "",
      flashModel: FREE_MODEL.model,
      proModel: FREE_MODEL.model,
    }));
    setTest({ status: "idle" });
  };

  const handleSave = () => {
    updateSettings(draft);
    setSaved(true);
    setTimeout(() => {
      if (isMountedRef.current) onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread"
        onClick={onClose}
      />

      <div
        className="relative scroll-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 red-seal rounded-sm text-base">接</div>
            <div>
              <h2 className="font-brush text-2xl text-gold-400 tracking-widest text-shadow-ink">
                自定义接口
              </h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5">
                填上自己的接口，便绕开后端直接使用
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
          <section className="rounded border border-paper-400/12 bg-ink-900/30 px-3 py-2.5">
            <p className="font-serif text-xs leading-relaxed text-paper-300/80">
              不填也无妨——推演默认走游戏后端。若你有自己的接口，把地址与密钥填齐，游戏便优先用它，
              不再经后端转发。密钥只存在本机 localStorage。
            </p>
          </section>

          {/* 接口预设 */}
          <section>
            <SectionLabel>接口预设</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {PRESETS.map((p) => {
                const active = draft.baseUrl === p.baseUrl;
                return (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className={cn(
                      "px-3 py-2 rounded text-left border transition-all",
                      active
                        ? "border-gold-400/60 bg-gold-400/10"
                        : "border-paper-400/15 hover:border-gold-500/40 hover:bg-paper-400/5",
                    )}
                    title={p.note}
                  >
                    <div
                      className={cn(
                        "font-brush text-sm tracking-wider",
                        active ? "text-gold-400" : "text-paper-200",
                      )}
                    >
                      {p.label}
                    </div>
                    <div className="font-serif text-xs text-paper-400/60 mt-0.5 leading-tight">
                      {p.note}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Base URL */}
          <section>
            <SectionLabel>Base URL</SectionLabel>
            <input
              type="text"
              value={draft.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
              placeholder="https://api.deepseek.com/v1"
              className="input-ink mt-2"
              spellCheck={false}
            />
            <p className="font-serif text-xs text-paper-400/50 mt-1.5 leading-relaxed">
              OpenAI 兼容接口根路径，将自动追加 <code className="text-gold-400/80">/chat/completions</code>。
              本地版与 exe 下，上列服务商经本地代理转发，其余直连；直连若被跨域拦下，请改用本地代理或支持跨域的服务商。
            </p>
          </section>

          {/* API Key */}
          <section>
            <SectionLabel>API Key</SectionLabel>
            <div className="relative mt-2">
              <input
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="input-ink pr-10"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-paper-400/60 hover:text-paper-100 transition"
                aria-label={showKey ? "隐藏" : "显示"}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="font-serif text-xs text-paper-400/50 mt-1.5">
              仅存于本机 localStorage，不会上传给开发者；请自行妥善保管。
            </p>
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
                value={draft.flashModel}
                onChange={(e) => patch({ flashModel: e.target.value })}
                placeholder="deepseek-chat"
                className="input-ink mt-2"
                spellCheck={false}
              />
              <button
                onClick={() => void runTest("flash")}
                disabled={test.status === "testing"}
                className="ghost-btn mt-2 w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
              >
                {test.status === "testing" ? <Loader2 size={12} className="animate-spin" /> : null}
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
                value={draft.proModel}
                onChange={(e) => patch({ proModel: e.target.value })}
                placeholder="deepseek-reasoner"
                className="input-ink mt-2"
                spellCheck={false}
              />
              <button
                onClick={() => void runTest("pro")}
                disabled={test.status === "testing"}
                className="ghost-btn mt-2 w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
              >
                {test.status === "testing" ? <Loader2 size={12} className="animate-spin" /> : null}
                测试 Pro 连接
              </button>
            </section>
          </div>

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
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95 backdrop-blur">
          <button
            onClick={clearCustom}
            className="font-serif text-xs text-paper-400/60 hover:text-cinnabar-400 transition"
          >
            清除，改回走后端
          </button>
          <div className="flex items-center gap-3">
            <SealButton variant="ghost" onClick={onClose}>
              取消
            </SealButton>
            <SealButton onClick={handleSave} className="min-w-[100px]">
              {saved ? "已保存" : "保存"}
            </SealButton>
          </div>
        </div>
      </div>
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
