import { useCallback, useEffect, useState } from "react";
import { useAIStore } from "@/store/useAIStore";
import { SealButton } from "@/components/ui/SealButton";
import { cn } from "@/lib/utils";
import {
  applySavePayload,
  buildSavePayload,
  decodeSaveBytes,
  downloadBlob,
  encodeSaveText,
  pickSaveFile,
  saveStamp,
  type SaveFileShape,
} from "@/lib/saveGame";
import {
  AlertTriangle,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";

/** 存档夹里的一份存档 */
interface SaveRecord {
  name: string;
  size: number;
  savedAt: number;
}

const SAVES_API = "/api/saves";

function fmtTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * 存档管理。
 *
 * 游戏目录下的 saves 次级文件夹里列档、存档、读档、删档，全在游戏内完成，
 * 不必再弹系统的文件选择框。网页版没有本地存档夹，则自动退回「导出/导入文件」一途。
 */
export function SaveManagerModal() {
  const open = useAIStore((s) => s.isSaveManagerOpen);
  const setOpen = useAIStore((s) => s.setSaveManagerOpen);
  const hasProgress = useAIStore((s) => s.conversation.turns.length > 0);

  const [saves, setSaves] = useState<SaveRecord[]>([]);
  const [folderMode, setFolderMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");

  const close = useCallback(() => setOpen(false), [setOpen]);

  /** 拉一次存档列表；拿不到存档夹就退到文件模式 */
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(SAVES_API, { cache: "no-store" });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !type.includes("application/json")) throw new Error("no-folder");
      const data = await res.json();
      if (!Array.isArray(data?.saves)) throw new Error("no-folder");
      setSaves(data.saves as SaveRecord[]);
      setFolderMode(true);
    } catch {
      setFolderMode(false);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setNotice("");
    setName(`存档_${saveStamp()}`);
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  /** 存入新档 */
  const saveToFolder = async () => {
    const finalName = name.trim();
    if (!finalName) {
      setError("请先取个存档名。");
      return;
    }
    if (saves.some((s) => s.name === finalName)) {
      setError("同名存档已存在，请换个名字。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const content = JSON.stringify(buildSavePayload());
      const res = await fetch(SAVES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalName, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `保存失败（${res.status}）`);
      setNotice(`已存入「${data?.name || finalName}」`);
      setName(`存档_${saveStamp()}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  /** 读档：落回 store 后刷新页面 */
  const loadFromFolder = async (saveName: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${SAVES_API}/${encodeURIComponent(saveName)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`读取失败（${res.status}）`);
      const text = await res.text();
      applySavePayload(JSON.parse(text) as SaveFileShape);
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const removeFromFolder = async (saveName: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`${SAVES_API}/${encodeURIComponent(saveName)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`删除失败（${res.status}）`);
      setNotice(`已删除「${saveName}」`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  /** 退路：没有存档夹时，仍按文件导出入 */
  const exportToFile = async () => {
    const text = JSON.stringify(buildSavePayload(), null, 2);
    const { blob, ext } = await encodeSaveText(text);
    downloadBlob(blob, `save_${new Date().toISOString().slice(0, 10)}.json${ext}`);
  };

  const importFromFile = async () => {
    setError("");
    try {
      const buf = await pickSaveFile();
      if (!buf) return;
      const text = await decodeSaveBytes(buf);
      applySavePayload(JSON.parse(text) as SaveFileShape);
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-darkest/60 backdrop-blur-sm animate-inkSpread" onClick={close} />

      <div
        className="relative scroll-card rounded-lg w-full max-w-xl max-h-[88vh] flex flex-col"
        style={{ animation: "inkSpread 0.4s ease-out" }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gold-500/20 bg-ink-800/95">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 red-seal rounded-sm text-base">档</div>
            <div>
              <h2 className="font-brush text-2xl text-gold-400 tracking-widest text-shadow-ink">存档管理</h2>
              <p className="font-serif text-xs text-paper-400/60 mt-0.5">
                {folderMode ? "存档存放于游戏目录下的 saves 文件夹" : "此处无法读写存档夹，改用文件导入导出"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {folderMode && (
              <button
                onClick={() => void refresh()}
                disabled={busy}
                className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
                title="刷新列表"
              >
                <RefreshCw size={15} className={cn(busy && "animate-spin")} />
              </button>
            )}
            <button
              onClick={close}
              className="w-8 h-8 rounded flex items-center justify-center text-paper-400/60 hover:text-paper-100 hover:bg-paper-400/10 transition"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {!folderMode && (
            <div className="rounded border border-gold-500/25 bg-gold-400/5 px-3 py-2.5 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-gold-400" />
              <p className="font-serif text-xs leading-relaxed text-paper-300/80">
                当前环境读不到游戏目录下的 saves 文件夹（如网页版），改用文件导出与导入——
                导出的存档为压缩格式，导入时直接选该文件即可，无需另存为 json。
              </p>
            </div>
          )}

          {folderMode ? (
            <>
              {/* 存入新档 */}
              <section className="space-y-2">
                <label className="font-serif text-xs text-paper-300 tracking-wider flex items-center gap-1.5">
                  <Save size={13} /> 存入新档
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="给这一世取个名目"
                    className="input-ink flex-1"
                    spellCheck={false}
                  />
                  <SealButton onClick={() => void saveToFolder()} disabled={busy || !hasProgress} className="shrink-0">
                    存档
                  </SealButton>
                </div>
                {!hasProgress && (
                  <p className="font-serif text-[11px] text-paper-400/50">尚未开局，暂无可存之档。</p>
                )}
              </section>

              <div className="book-divider" />

              {/* 存档列表 */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-xs text-paper-300 tracking-wider flex items-center gap-1.5">
                    <FolderOpen size={13} /> 已有存档
                  </span>
                  <span className="font-number text-[11px] text-paper-400/50">共 {saves.length} 份</span>
                </div>

                {saves.length === 0 ? (
                  <p className="rounded border border-paper-400/12 bg-ink-900/30 px-3 py-4 text-center font-serif text-xs text-paper-400/55">
                    {busy ? "正在读取……" : "存档夹里还是空的。"}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {saves.map((s) => (
                      <li
                        key={s.name}
                        className="rounded border border-paper-400/15 bg-ink-900/30 px-3 py-2.5 flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-brush text-sm text-paper-200 truncate">{s.name}</div>
                          <div className="mt-0.5 font-number text-[11px] text-paper-400/50">
                            {fmtTime(s.savedAt)} · {fmtSize(s.size)}
                          </div>
                        </div>
                        <button
                          onClick={() => void loadFromFolder(s.name)}
                          disabled={busy}
                          className="ghost-btn shrink-0 rounded px-3 py-1 text-xs flex items-center gap-1.5"
                        >
                          读取
                        </button>
                        <button
                          onClick={() => void removeFromFolder(s.name)}
                          disabled={busy}
                          className="shrink-0 rounded border border-cinnabar-500/30 px-2.5 py-1 text-xs text-cinnabar-400 hover:bg-cinnabar-500/10 transition flex items-center gap-1.5"
                        >
                          <Trash2 size={12} /> 删除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            /* 退路：文件导入导出 */
            <section className="space-y-3">
              <p className="font-serif text-xs text-paper-300 tracking-wider">文件导入导出</p>
              <div className="flex flex-wrap gap-3">
                <SealButton onClick={() => void exportToFile()} disabled={!hasProgress} className="px-4 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Download size={14} /> 导出存档文件
                  </span>
                </SealButton>
                <SealButton variant="ghost" onClick={() => void importFromFile()} className="px-4 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Upload size={14} /> 导入存档文件
                  </span>
                </SealButton>
              </div>
              <p className="font-serif text-[11px] leading-relaxed text-paper-400/50">
                导出为 .json.gz（压缩）或 .json；导入时两种都能直接读取，按文件内容自动识别。
              </p>
            </section>
          )}

          {notice && (
            <p className="rounded px-3 py-2 font-serif text-xs text-jade-400 bg-jade-500/10 border border-jade-500/30">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded px-3 py-2 font-serif text-xs text-cinnabar-400 bg-cinnabar-500/10 border border-cinnabar-500/30">
              {error}
            </p>
          )}
          {busy && (
            <p className="flex items-center gap-2 font-serif text-xs text-paper-400/60">
              <Loader2 size={12} className="animate-spin" /> 正在处理……
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gold-500/20 bg-ink-800/95">
          <SealButton variant="ghost" onClick={close}>
            关闭
          </SealButton>
        </div>
      </div>
    </div>
  );
}
