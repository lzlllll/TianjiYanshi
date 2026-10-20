import { useEffect, useState } from "react";
import { AI_RATE_LIMIT_EVENT } from "@/lib/aiNotice";
import { SealButton } from "@/components/ui/SealButton";
import { X } from "lucide-react";

/**
 * 内置 AI 服务被限流（429）时的提示窗。
 *
 * 免费模型偶尔会整段拒答，这与存档无关；把话说清楚，免得玩家以为进度坏了。
 * 事件由 aiClient 在重试尽后派发，这里只管接住、摊开、关掉。
 */
export function RateLimitModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(AI_RATE_LIMIT_EVENT, show);
    return () => window.removeEventListener(AI_RATE_LIMIT_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-md p-6"
        style={{ animation: "inkSpread 0.3s ease-out" }}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
          aria-label="关闭"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="w-10 h-10 shrink-0 red-seal rounded-sm text-lg">急</div>
          <div className="min-w-0">
            <h2 className="font-brush text-2xl text-gold-400 tracking-widest">
              内置 AI 服务暂时繁忙
            </h2>
            <p className="mt-3 font-serif text-sm leading-relaxed text-paper-300/85">
              当前免费模型暂时无法稳定响应，这不代表存档损坏。你可以稍后重试，或在设置中配置自己的 AI API。
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <SealButton onClick={() => setOpen(false)} className="min-w-[100px]">
            知道了
          </SealButton>
        </div>
      </div>
    </div>
  );
}
