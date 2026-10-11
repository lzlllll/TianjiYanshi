import { useMemo } from "react";
import { PanelTitle } from "@/components/ui/PanelTitle";
import { useTokenStore } from "@/store/useTokenStore";
import { Trash2 } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("zh-CN");

/** 记一笔的时刻，写成「月-日 时:分」 */
function fmtTime(at: number): string {
  const d = new Date(at);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 推演账：把每一次 AI 交互的 token 消耗摊在这儿。
 * 由 aiClient 在收到响应时逐笔记下，汇总、按模型、按时间都能看。
 */
export function TokenPanel() {
  const records = useTokenStore((s) => s.records);
  const clear = useTokenStore((s) => s.clear);

  const totals = useMemo(() => {
    let prompt = 0;
    let completion = 0;
    let total = 0;
    for (const r of records) {
      prompt += r.prompt;
      completion += r.completion;
      total += r.total;
    }
    return { prompt, completion, total, count: records.length };
  }, [records]);

  const byModel = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of records) {
      const e = map.get(r.model) ?? { count: 0, total: 0 };
      e.count += 1;
      e.total += r.total;
      map.set(r.model, e);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [records]);

  return (
    <div className="space-y-5">
      <PanelTitle title="推演账" poem="一言一语，皆耗灵犀；账目在此，心中有数。" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="交互次数" value={fmt(totals.count)} />
        <Stat label="输入 tokens" value={fmt(totals.prompt)} />
        <Stat label="输出 tokens" value={fmt(totals.completion)} />
        <Stat label="合计 tokens" value={fmt(totals.total)} highlight />
      </div>

      {byModel.length > 0 && (
        <section>
          <h3 className="font-brush text-sm text-gold-400/80 tracking-widest mb-2">按模型</h3>
          <div className="space-y-1.5">
            {byModel.map(([model, e]) => (
              <div
                key={model}
                className="flex items-center justify-between gap-3 rounded border border-paper-400/12 bg-ink-900/40 px-3 py-2"
              >
                <span className="min-w-0 truncate font-number text-xs text-paper-200">{model}</span>
                <span className="shrink-0 font-number text-xs text-paper-400/70">
                  {fmt(e.count)} 次 · {fmt(e.total)} tokens
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-brush text-sm text-gold-400/80 tracking-widest">
            明细{records.length > 0 ? `（近 ${records.length} 笔）` : ""}
          </h3>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("清空推演账？此操作不可撤销。")) clear();
              }}
              className="flex items-center gap-1.5 rounded border border-cinnabar-500/40 px-2.5 py-1 font-serif text-xs text-cinnabar-400 transition hover:border-cinnabar-400/70"
            >
              <Trash2 size={12} /> 清空
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <p className="py-8 text-center font-serif text-xs text-paper-400/50">
            还没有记录。每与大模型交互一次，这里便记一笔。
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-gold-500/20">
            <table className="w-full border-collapse font-number text-xs">
              <thead>
                <tr className="bg-ink-900/60 text-paper-400/70">
                  <th className="px-2 py-1.5 text-left font-serif font-normal">时刻</th>
                  <th className="px-2 py-1.5 text-left font-serif font-normal">模型</th>
                  <th className="px-2 py-1.5 text-left font-serif font-normal">用途</th>
                  <th className="px-2 py-1.5 text-right font-serif font-normal">输入</th>
                  <th className="px-2 py-1.5 text-right font-serif font-normal">输出</th>
                  <th className="px-2 py-1.5 text-right font-serif font-normal">合计</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-paper-400/10 text-paper-200/90">
                    <td className="whitespace-nowrap px-2 py-1.5 text-paper-400/70">{fmtTime(r.at)}</td>
                    <td className="max-w-[10rem] truncate px-2 py-1.5" title={r.model}>{r.model}</td>
                    <td className="max-w-[14rem] truncate px-2 py-1.5 text-paper-300/80" title={r.note}>{r.note || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{fmt(r.prompt)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{fmt(r.completion)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right text-gold-400/90">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="font-serif text-[11px] leading-relaxed text-paper-400/40">
        显示的是大模型接口回传的用量（prompt / completion / total tokens）。若某家接口不回传用量，则不计入；
        记录存在浏览器本地，最多保留最近一千笔。
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={
        highlight
          ? "rounded border border-gold-400/35 bg-gold-500/10 px-3 py-2 text-center"
          : "rounded border border-paper-400/15 bg-ink-900/40 px-3 py-2 text-center"
      }
    >
      <div className="font-serif text-[10px] text-paper-400/50">{label}</div>
      <div className={highlight ? "font-number text-base text-gold-400" : "font-number text-base text-paper-100"}>
        {value}
      </div>
    </div>
  );
}
