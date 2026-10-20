import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { AlertTriangle } from "lucide-react";

/**
 * 开局建档有哪一门没写全时的提示窗。
 *
 * 免费模型偶尔会漏掉一两门，档案便不齐；这与存档无关，
 * 但得把话说在前面，免得玩家过后觉得数值对不上。
 */
export function OpeningWarningModal() {
  const warning = useAIStore((s) => s.conversation.openingWarning);
  const dismiss = useAIStore((s) => s.dismissOpeningWarning);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm" onClick={dismiss} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-md p-6"
        style={{ animation: "inkSpread 0.3s ease-out" }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 red-seal rounded-sm text-lg">缺</div>
          <div className="min-w-0">
            <h2 className="font-brush text-2xl text-gold-400 tracking-widest">开局提示</h2>
            <p className="mt-3 font-serif text-sm leading-relaxed text-paper-300/85">{warning}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <SealButton onClick={dismiss} className="min-w-[100px]">
            知道了
          </SealButton>
        </div>
      </div>
    </div>
  );
}
