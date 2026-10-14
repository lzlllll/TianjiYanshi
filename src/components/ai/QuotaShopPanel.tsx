import { cn } from "@/lib/utils";
import { AI_BACKEND_READY } from "@/data/backend";
import { FREE_MODEL, PAID_PLANS } from "@/data/aiQuota";
import { Check, Coins, Lock } from "lucide-react";

interface QuotaShopPanelProps {
  /** 当前设置是否已选中免费模型 */
  freeActive: boolean;
  /** 点选免费模型：把接口、模型名与内置密钥写回设置草稿 */
  onSelectFree: () => void;
}

/**
 * AI 额度内购面板。
 *
 * 眼下只开「免费模型」一档，付费套餐一律置灰待开，按钮不可点，
 * 不做任何「点一下即到账」的即时结算；等本地后端接上 Steam 小额支付再放行。
 */
export function QuotaShopPanel({ freeActive, onSelectFree }: QuotaShopPanelProps) {
  const ready = AI_BACKEND_READY;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="font-serif text-xs text-paper-300 tracking-wider flex items-center gap-1.5">
          <Coins size={13} /> 额度内购
        </label>
        <span className="font-serif text-[11px] text-paper-400/50">付费额度筹备中</span>
      </div>

      {/* 免费模型 */}
      <button
        onClick={onSelectFree}
        className={cn(
          "w-full text-left rounded border px-3 py-3 transition-all",
          freeActive
            ? "border-jade-400/60 bg-jade-500/10"
            : "border-paper-400/15 hover:border-jade-400/40 hover:bg-paper-400/5",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-brush text-sm tracking-wider",
                  freeActive ? "text-jade-300" : "text-paper-200",
                )}
              >
                {FREE_MODEL.label}
              </span>
              <span className="rounded-sm border border-jade-400/40 bg-jade-500/10 px-1.5 py-0.5 font-serif text-[10px] text-jade-300">
                免费
              </span>
            </div>
            <p className="mt-1 font-serif text-xs leading-relaxed text-paper-400/60">
              由后端统一供给，不必自备密钥；Flash 与 Pro 同用此模型
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-paper-400/45 break-all">
              {FREE_MODEL.model}
            </p>
          </div>
          {freeActive ? (
            <Check size={16} className="shrink-0 mt-0.5 text-jade-300" />
          ) : (
            <span className="shrink-0 mt-0.5 font-serif text-[11px] text-paper-400/50">选用</span>
          )}
        </div>
        {!ready && (
          <p className="mt-2 font-serif text-[11px] leading-relaxed text-gold-400/80">
            后端尚未接通，暂不可用；请先在 src/data/backend.ts 填入后端地址，并在后端配好模型密钥。
          </p>
        )}
      </button>

      {/* 付费额度：预留，暂不开售 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PAID_PLANS.map((plan) => (
          <div
            key={plan.id}
            className="rounded border border-paper-400/10 bg-ink-900/40 px-3 py-2.5 opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="font-brush text-sm text-paper-300">{plan.label}</span>
              <span className="font-number text-sm text-gold-400/70">
                ¥{(plan.priceCents / 100).toFixed(2)}
              </span>
            </div>
            <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-paper-400/55">
              {plan.desc} · 约 {plan.calls} 次
            </p>
            <button
              disabled
              className="mt-2 w-full cursor-not-allowed rounded border border-paper-400/15 px-3 py-1 font-serif text-[11px] text-paper-400/45 flex items-center justify-center gap-1"
            >
              <Lock size={11} /> 即将开放
            </button>
          </div>
        ))}
      </div>

      <p className="font-serif text-[11px] leading-relaxed text-paper-400/45">
        后续经 Steam 小额支付购买额度，付款由本地后端 server/ 结算无误后发放；当前尚未开通。
      </p>
    </section>
  );
}
