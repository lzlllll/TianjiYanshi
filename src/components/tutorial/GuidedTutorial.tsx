import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useGameStore } from "@/store/useGameStore";
import { useAIStore } from "@/store/useAIStore";
import { useTutorialStore } from "@/store/useTutorialStore";
import { TUTORIALS, type TutorialStep } from "@/data/tutorials";
import type { PanelId } from "@/data/types";

/** 圈口比目标多留的一圈 */
const PAD = 8;
/** 卡片与圈口之间留的缝 */
const GAP = 14;
/** 卡片宽度 */
const CARD_W = 340;
/** 卡片量出来之前先按这个高度摆，免得先跳一下 */
const CARD_H = 200;
/** 离视口边至少留的空 */
const EDGE = 12;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * enter 记号：走到某一步之前，先替玩家把要圈的那扇窗开出来。
 * 只认这几个，认不得的当作不动作。
 */
function runEnter(action?: string) {
  if (!action) return;
  const sep = action.indexOf(":");
  const kind = sep === -1 ? action : action.slice(0, sep);
  const arg = sep === -1 ? "" : action.slice(sep + 1);

  if (kind === "story") useAIStore.getState().setStoryOpen(true);
  else if (kind === "story-close") useAIStore.getState().setStoryOpen(false);
  else if (kind === "panel") useGameStore.getState().setPanel((arg || null) as PanelId | null);
}

/** 圈口怎么摆卡片：先生成一边，放不下再翻到另一边，最后贴边 */
function placeCard(box: Box | null, placement: TutorialStep["placement"], h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!box) {
    return {
      left: Math.max(EDGE, Math.round((vw - CARD_W) / 2)),
      top: Math.max(EDGE, Math.round((vh - h) / 2)),
    };
  }

  const below = box.top + box.height + GAP;
  const above = box.top - GAP - h;
  const roomBelow = below + h <= vh - EDGE;
  const roomAbove = above >= EDGE;

  // 圈口大得几乎铺满整屏（如九州舆图）时，外面哪一边都放不下卡片，
  // 便把它压在圈口里的下半幅，别去顶栏上挤
  if (box.width >= vw - 96 && box.height >= vh * 0.55) {
    return {
      left: Math.max(EDGE, Math.round((vw - CARD_W) / 2)),
      top: Math.max(EDGE, Math.round(vh - h - 96)),
    };
  }

  let top: number;
  if (placement === "top") top = roomAbove ? above : below;
  else if (placement === "bottom") top = roomBelow ? below : above;
  else if (placement === "left" || placement === "right") top = box.top + box.height / 2 - h / 2;
  else top = roomBelow ? below : above;

  top = Math.max(EDGE, Math.min(top, vh - EDGE - h));

  let left: number;
  if (placement === "left") left = box.left - GAP - CARD_W;
  else if (placement === "right") left = box.left + box.width + GAP;
  else left = box.left + box.width / 2 - CARD_W / 2;
  left = Math.max(EDGE, Math.min(left, vw - CARD_W - EDGE));

  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * 引导式互动教程。
 *
 * 页面其余部分压暗，只把讲到的那个元素圈出来；圈口不吃点击，
 * 玩家可以照着话去点真东西，再回来按「下一步」。
 * 元素没找着时卡片摆在正中，教程不至于卡死。
 */
export function GuidedTutorial() {
  const activeId = useTutorialStore((s) => s.activeId);
  const step = useTutorialStore((s) => s.step);
  const next = useTutorialStore((s) => s.next);
  const prev = useTutorialStore((s) => s.prev);
  const stop = useTutorialStore((s) => s.stop);

  const tutorial = useMemo(() => TUTORIALS.find((t) => t.id === activeId) ?? null, [activeId]);
  const current = tutorial?.steps[step] ?? null;

  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(CARD_H);
  const cardRef = useRef<HTMLDivElement>(null);

  // 进入某一步：先开窗，再持续量目标的位置；窗里的滚动、窗口缩放都跟着变
  useEffect(() => {
    if (!current) return;
    setBox(null);
    runEnter(current.enter);

    const target = current.target ? document.querySelector<HTMLElement>(current.target) : null;
    target?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });

    const measure = () => {
      const r = target?.getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) {
        setBox({ left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
      } else {
        setBox(null);
      }
    };

    measure();
    // 开窗有动画、贴图要解码，位置会在这几百毫秒里挪，故多量几回
    const timer = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current]);

  // 卡片高度随内容与字数变，量出来再定最终位置
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [current, box]);

  // Esc 退出，左右键翻页。用捕获阶段，免得先被问道窗口的 Esc 抢走
  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        stop();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeId, next, prev, stop]);

  if (!tutorial || !current) return null;

  const isLast = step >= tutorial.steps.length - 1;
  const pos = placeCard(box, current.placement, cardH);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[90]"
      role="dialog"
      aria-modal="false"
      aria-label="新手引导"
      aria-live="polite"
    >
      {box ? (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-gold-400/90 shadow-[0_0_0_9999px_rgba(18,12,8,0.62)] transition-all duration-200"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      ) : (
        <div className="absolute inset-0 bg-ink-darkest/60" />
      )}

      <div
        ref={cardRef}
        className="pointer-events-auto absolute rounded-lg border border-ink-lightest/60 bg-paper-fresh paper-texture p-5 shadow-book-float"
        style={{ left: pos.left, top: pos.top, width: CARD_W }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="font-brush text-lg tracking-wider text-gold-400">{current.title}</div>
          <button
            onClick={stop}
            aria-label="跳过引导"
            title="跳过（Esc）"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-ink-lightest/50 text-ink-medium transition hover:border-cinnabar hover:text-cinnabar"
          >
            <X size={13} />
          </button>
        </div>

        <p className="mt-2 font-serif text-sm leading-relaxed text-ink-medium">{current.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="font-number text-[11px] text-ink-light">
            {tutorial.label} · 第 {step + 1} / {tutorial.steps.length} 步
          </span>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="flex items-center gap-0.5 rounded border border-ink-lightest/60 px-2.5 py-1 font-serif text-xs text-ink-medium transition hover:border-gold-500 hover:text-gold-400"
              >
                <ChevronLeft size={12} /> 上一步
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-0.5 rounded bg-cinnabar px-3 py-1 font-serif text-xs text-paper-fresh transition hover:bg-cinnabar-dark"
            >
              {isLast ? "走完了" : "下一步"} <ChevronRight size={12} />
            </button>
          </div>
        </div>

        <button
          onClick={stop}
          className="mt-2 block w-full text-right font-serif text-[11px] text-ink-light transition hover:text-cinnabar"
        >
          跳过整套引导
        </button>
      </div>
    </div>
  );
}
