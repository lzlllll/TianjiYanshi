import { useState } from "react";
import { ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { GAME_SIGNATURE } from "@/lib/gameInfo";

/** 开局第一次进来时摊开的玩法与操作说明；勾了「以后不再打开」就不再自动弹 */
export function GameIntroModal({ onClose }: { onClose: (dontShowAgain: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);

  const items: { title: string; body: string }[] = [
    {
      title: "凡事在「问道」里说",
      body: "左侧的问道窗口便是你的手脚。写下你打算做什么，通灵自会推演出一段叙事，并照你做的事把修为、气血、灵石、人情一一记账。",
    },
    {
      title: "红绿字样是这一轮的账",
      body: "叙事末尾若缀着红绿小字，那是本回合的数据变化：绿为得、红为失。若无这类字样，便说明这一轮只是叙事，账目未动。",
    },
    {
      title: "舆图上看天下",
      body: "九州舆图上点开城池、宗门、村庄与奇遇，能看见它的详情。想动身去某处，须在问道中付诸行动——地图上不设瞬移，路要一步步走。",
    },
    {
      title: "宗门与江湖",
      body: "无门无派时可开宗立派；立了门户便能营造建筑、收纳弟子、与他门结盟或兴兵攻伐。别家宗门也会彼此征战、占城纳贡，江湖自有它的动静。",
    },
    {
      title: "面板与操作",
      body: "左侧导航可切换角色、功法、宝物、机缘、社会、门派、名声等面板。发问用 Ctrl 或 ⌘ + Enter；地图滚轮缩放、按住拖拽平移；右上角设置里填通灵接口与模型。",
    },
  ];

  return (
    <div
      className="mainui-black fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-ink-darkest/70 backdrop-blur-sm animate-inkSpread" />

      <div
        className="relative scroll-card rounded-lg w-full max-w-xl max-h-[86vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gold-500/20 bg-ink-800/95">
          <ScrollText size={18} className="text-gold-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-brush text-xl text-gold-400 tracking-widest">初入江湖</h2>
            <p className="font-serif text-xs text-paper-400 mt-0.5">{GAME_SIGNATURE}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {items.map((it) => (
            <div key={it.title}>
              <div className="font-brush text-sm text-gold-300 mb-1">{it.title}</div>
              <p className="font-serif text-xs leading-relaxed text-paper-300/85">{it.body}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-gold-500/20 px-6 py-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer font-serif text-xs text-paper-400/80 select-none">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="h-3.5 w-3.5 accent-gold-500"
            />
            以后不再打开
          </label>
          <button
            type="button"
            onClick={() => onClose(dontShow)}
            className={cn(
              "shrink-0 rounded border px-4 py-2 font-serif text-sm transition",
              "border-jade-400/50 bg-jade-500/20 text-jade-200 hover:bg-jade-500/30",
            )}
          >
            明白了
          </button>
        </div>
      </div>
    </div>
  );
}
