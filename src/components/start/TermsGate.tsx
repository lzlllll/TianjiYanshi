import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGREEMENT_TEXT, AGREEMENT_VERSION } from "@/data/userAgreement";
import { GAME_SIGNATURE } from "@/lib/gameInfo";

/** 行内那点记号：**…** 作加粗，其余照原样摆出来 */
function inline(text: string, keyPrefix: string) {
  return text.split("**").map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyPrefix}-${i}`} className="font-brush ps-strong">
        {seg}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{seg}</span>
    ),
  );
}

/** 第一次进来时摊开的用户协议：读罢勾选同意，才放行到开局 */
export function TermsGate({ onAgree }: { onAgree: () => void }) {
  const [checked, setChecked] = useState(false);
  const [declined, setDeclined] = useState(false);

  const lines = useMemo(() => AGREEMENT_TEXT.replace(/\r\n/g, "\n").split("\n"), []);

  return (
    <div className="h-screen w-screen ink-bg flex items-center justify-center p-4 sm:p-6">
      <div className="paper-sheet rounded-lg w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b ps-rule">
          <ScrollText size={18} className="ps-accent shrink-0" />
          <div className="min-w-0">
            <h2 className="font-brush text-xl ps-strong tracking-widest">用户协议</h2>
            <p className="font-serif text-xs ps-muted mt-0.5">
              {GAME_SIGNATURE} · 协议版本 {AGREEMENT_VERSION}
            </p>
          </div>
        </div>

        {declined ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
            <p className="font-serif text-sm ps-body leading-relaxed">
              你选择了不同意本协议，本游戏将无法继续使用。
              <br />
              若改变主意，可重新阅读并同意后再进入。
            </p>
            <button
              type="button"
              onClick={() => setDeclined(false)}
              className="btn-paper px-5 py-2 rounded font-serif text-sm"
            >
              重新阅读
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-5 space-y-1.5">
              {lines.map((line, i) => {
                const t = line.trim();
                const key = `l${i}`;
                if (!t) return <div key={key} className="h-2" />;
                if (t.startsWith("## ")) {
                  return (
                    <h3 key={key} className="font-brush text-base ps-accent tracking-wider pt-3">
                      {t.slice(3)}
                    </h3>
                  );
                }
                if (t.startsWith("# ")) {
                  return (
                    <h1 key={key} className="font-brush text-xl ps-strong tracking-widest text-center pb-1">
                      {t.slice(2)}
                    </h1>
                  );
                }
                if (t.startsWith("- ")) {
                  return (
                    <div key={key} className="flex gap-2 font-serif text-xs ps-body leading-relaxed">
                      <span className="ps-accent">·</span>
                      <span className="flex-1">{inline(t.slice(2), key)}</span>
                    </div>
                  );
                }
                return (
                  <p key={key} className="font-serif text-xs ps-body leading-relaxed">
                    {inline(t, key)}
                  </p>
                );
              })}
            </div>

            <div className="border-t ps-rule px-6 py-4 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-[#a83232]"
                />
                <span className="font-serif text-xs ps-body leading-relaxed">
                  我已阅读并理解上述协议，同意遵守其中各项约定。
                </span>
              </label>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setDeclined(true)}
                  className="font-serif text-xs ps-faint hover:ps-accent transition"
                >
                  不同意
                </button>
                <button
                  type="button"
                  onClick={onAgree}
                  disabled={!checked}
                  className={cn(
                    "btn-paper px-6 py-2 rounded font-brush tracking-widest",
                    !checked && "opacity-40 cursor-not-allowed",
                  )}
                >
                  同意并继续
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
