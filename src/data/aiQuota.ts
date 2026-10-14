/**
 * AI 额度与内购配置。
 *
 * 前端不再持有任何密钥：推演请求一律发到后端，由后端带上密钥向上游转发，
 * 密钥只存在于后端（本地走环境变量，线上走 Cloudflare secret）。
 * 这里只留模型名与套餐名目，供界面展示与选择。
 */

/** 免费额度模型：flash 与 pro 共用同一个模型名 */
export const FREE_MODEL = {
  id: "moonshot-kimi-k3-free",
  label: "Moonshot-Kimi K3 Free",
  /** Flash 与 Pro 均使用该模型；上游地址与密钥由后端决定 */
  model: "moonshotai/kimi-k3-free",
} as const;

/** 付费额度套餐；价格单位「分」，与 Steam 小额支付一致 */
export interface QuotaPlan {
  id: string;
  label: string;
  desc: string;
  priceCents: number;
  /** 本套餐折算的调用次数 */
  calls: number;
}

/** 付费套餐（免费模型由 FREE_MODEL 表示，不在此列） */
export const PAID_PLANS: QuotaPlan[] = [
  {
    id: "starter",
    label: "体验包",
    desc: "小额试水，先感受再决定",
    priceCents: 600,
    calls: 200,
  },
  {
    id: "standard",
    label: "江湖常备",
    desc: "日常推演，绰绰有余",
    priceCents: 1800,
    calls: 800,
  },
];
