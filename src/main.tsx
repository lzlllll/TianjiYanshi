import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadGameData } from "./data/map";
import "./index.css";
import "./styles/ancient-book.css";

const root = createRoot(document.getElementById("root")!);

/** 数据没到位前先占位，避免白屏；读失败时把原因摆出来，好按图索骥去改文件 */
function bootScreen(title: string, detail?: string) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 ink-bg px-10 text-center">
      <div className="font-brush text-2xl text-gold-400">{title}</div>
      {detail && (
        <div className="max-w-2xl whitespace-pre-line font-serif text-xs leading-relaxed text-cinnabar-400">
          {detail}
        </div>
      )}
    </div>
  );
}

root.render(bootScreen("正在读取游戏数据…"));

void (async () => {
  try {
    // 地图与图片都是打开时现读的，必须等它到位再加载界面，
    // 这样各处的取数接口都能同步拿到值，不必到处写异步分支
    await loadGameData();
    const { default: App } = await import("./App");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    root.render(
      bootScreen(
        "游戏数据读取失败",
        `${err instanceof Error ? err.message : String(err)}\n请确认 game_data 与 image_assets 目录和 index.html 在同一层。`,
      ),
    );
  }
})();
