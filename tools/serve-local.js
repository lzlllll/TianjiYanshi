/**
 * 本地静态服务器 + 大模型接口代理
 *
 * 作用：
 *   1. 托管 dist-local 目录下的静态资源
 *   2. /game/ 前缀直接指向数据目录，供 game_data 与 image_assets 现读，
 *      改完 JSON 或换掉图片刷新浏览器即可生效，不必重新构建
 *   3. /api/saves 提供游戏目录下的存档夹读写
 *   4. /api/ai/chat/completions 接住前端的推演请求，补上服务端密钥再转发给上游，
 *      密钥只从环境变量取（AI_BASE_URL / AI_API_KEY），前端不经手
 *   5. /api/<服务商>/* 供自备接口的玩家绕开跨域，只对已知的那几家开放
 *   6. 命令行启动时自动打开默认浏览器
 *
 * 既可从命令行启动，也可作为模块被 Electron 主进程调用：
 *   node tools/serve-local.js [端口] [--no-open]
 *   import { startGameServer } from "./serve-local.js"
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serveAiChatNode } from "../server/aiProxyNode.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 默认静态资源目录（本地构建产物） */
const DEFAULT_DIST_DIR = path.resolve(__dirname, "..", "dist-local");
/** 默认数据目录；/game/ 前缀的请求直接从这里的 game_data 与 image_assets 取 */
const DEFAULT_DATA_DIR = path.resolve(__dirname, "..");
/**
 * 默认存档目录：系统「文档」下的天机衍世/saves。
 * 存档不再随游戏目录走，换版本、换安装位置都不至于把旧档落下；
 * Electron 那一路会用 app.getPath("documents") 传更准的路径进来。
 */
const DEFAULT_SAVES_DIR = path.join(os.homedir(), "Documents", "天机衍世", "saves");
const GAME_PREFIX = "/game";
/** 存档夹接口；游戏内直接从这里列档、存档、读档、删档，不必弹系统文件框 */
const SAVES_PREFIX = "/api/saves";
/** 单份存档的体量上限 */
const MAX_SAVE_BYTES = 32 * 1024 * 1024;
/** 推演转发口：前端只与这里说话，密钥由服务端自环境变量取用，前端不经手 */
const AI_CHAT_PATH = "/api/ai/chat/completions";

/**
 * 自定义接口用：与服务商 baseUrl 一一对应的代理前缀，需与 src/lib/aiClient.ts 中的 PROXY_MAP 保持一致。
 * 玩家自备接口时，已知服务商走这里转发，绕开浏览器跨域；其余直连。
 */
const PROXY_MAP = {
  "/api/deepseek": "https://api.deepseek.com/v1",
  "/api/openai": "https://api.openai.com/v1",
  "/api/glm": "https://open.bigmodel.cn/api/paas/v4",
  "/api/qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "/api/qnaigc": "https://api.qnaigc.com/v1",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function sendJson(res, statusCode, message) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: { message } }));
}

/** 回一段正常 JSON 载荷（存档夹接口用） */
function sendPayload(res, statusCode, payload) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

/** 读一段 JSON 请求体，超限即断 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_SAVE_BYTES) {
        reject(new Error("存档过大，已超出上限。"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("请求体不是合法 JSON。"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * 把存档名收敛成一个安全的文件名：只留中英文、数字与 - _ . ，
 * 去掉路径分隔符与前导点，免得顺着 ../ 写到夹外去。
 */
function safeSaveName(raw) {
  const base = String(raw ?? "").trim().replace(/\.json$/i, "");
  const cleaned = base.replace(/[^\w\u4e00-\u9fa5.\-]/g, "").replace(/^\.+/, "");
  return cleaned.slice(0, 80);
}

/**
 * 只读文件头那一段，认出这份存档是哪个版本留下的。
 * 存档把 gameVersion 写在最前，读两三百字节便够；旧档没有这一项，留空。
 */
function readSaveVersion(file) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(320);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.subarray(0, n).toString("utf8");
    const hit = /"gameVersion"\s*:\s*"([^"]{0,40})"/.exec(head);
    return hit ? hit[1] : "";
  } catch {
    return "";
  }
}

/** 列出存档夹里的所有存档，新的排前面 */
function listSaves(res, savesDir) {
  let files = [];
  try {
    files = fs.readdirSync(savesDir).filter((f) => f.toLowerCase().endsWith(".json"));
  } catch {
    files = [];
  }
  const saves = files
    .map((f) => {
      const full = path.join(savesDir, f);
      let stat = null;
      try {
        stat = fs.statSync(full);
      } catch {
        stat = null;
      }
      return {
        name: f.replace(/\.json$/i, ""),
        size: stat?.size ?? 0,
        savedAt: stat?.mtimeMs ?? 0,
        // 跨版本读档时，先看这份是哪个版本留下的
        gameVersion: readSaveVersion(full),
      };
    })
    .sort((a, b) => b.savedAt - a.savedAt);
  sendPayload(res, 200, { saves });
}

/** 存档夹接口：列档、存档、读档、删档 */
function handleSaves(req, res, savesDir, url) {
  const rest = url.pathname.slice(SAVES_PREFIX.length);
  const method = (req.method || "GET").toUpperCase();

  // /api/saves —— 列表与新建
  if (rest === "" || rest === "/") {
    if (method === "GET") {
      listSaves(res, savesDir);
      return;
    }
    if (method === "POST") {
      readJsonBody(req)
        .then((body) => {
          const name = safeSaveName(body?.name);
          const content = typeof body?.content === "string" ? body.content : "";
          if (!name) {
            sendPayload(res, 400, { error: "存档名为空或含非法字符。" });
            return;
          }
          if (!content) {
            sendPayload(res, 400, { error: "存档内容为空。" });
            return;
          }
          try {
            JSON.parse(content);
          } catch {
            sendPayload(res, 400, { error: "存档内容不是合法 JSON。" });
            return;
          }
          fs.mkdirSync(savesDir, { recursive: true });
          fs.writeFileSync(path.join(savesDir, `${name}.json`), content, "utf8");
          sendPayload(res, 200, { ok: true, name });
        })
        .catch((e) => sendPayload(res, 400, { error: e.message }));
      return;
    }
    sendPayload(res, 405, { error: "不支持的请求方式。" });
    return;
  }

  // /api/saves/<名字> —— 读取与删除
  let decoded = rest.slice(1);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* 畸形百分号编码，按原样处理 */
  }
  const name = safeSaveName(decoded);
  if (!name) {
    sendPayload(res, 400, { error: "存档名不合法。" });
    return;
  }
  const file = path.join(savesDir, `${name}.json`);

  if (method === "GET") {
    fs.readFile(file, (err, data) => {
      if (err) {
        sendPayload(res, 404, { error: "未找到该存档。" });
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  if (method === "DELETE") {
    try {
      fs.unlinkSync(file);
      sendPayload(res, 200, { ok: true });
    } catch {
      sendPayload(res, 404, { error: "未找到该存档。" });
    }
    return;
  }

  sendPayload(res, 405, { error: "不支持的请求方式。" });
}

/** 自定义接口用：把请求转发给对应服务商，支持 SSE 流式响应 */
function proxyRequest(req, res, upstreamBase, restPath) {
  let targetUrl;
  try {
    targetUrl = new URL(upstreamBase + restPath);
  } catch (e) {
    sendJson(res, 500, `代理地址解析失败：${e.message}`);
    return;
  }

  const headers = { ...req.headers };
  // 这些头由本地代理接管，不应转发给上游
  delete headers.host;
  delete headers.origin;
  delete headers.referer;

  const upstream = https.request(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    console.error(`[proxy] ${targetUrl.hostname} 请求失败：${err.message}`);
    sendJson(res, 502, `本地代理转发失败：${err.message}`);
  });

  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

/** 托管静态资源；spa 模式下未命中的路径回退到 index.html */
function serveFile(res, rootDir, pathname, { spaFallback }) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // 畸形百分号编码会让 decodeURIComponent 抛错，退化为原路径处理
    decoded = pathname;
  }

  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("403 Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    // 游戏数据缺文件就该如实报 404，让启动页把原因显示出来，
    // 回退成 index.html 只会让前端拿到一段 HTML 去 JSON.parse，反而难查
    if ((err || stat.isDirectory()) && spaFallback) {
      filePath = path.join(rootDir, "index.html");
    }
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  });
}

/**
 * 编辑器把改好的数据写回数据目录（如宗门图模板）。
 * 只认 /game/ 下 game_data/*.json 这一类路径，其余一概 403。
 */
function writeGameFile(req, res, dataDir, relPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    decoded = relPath;
  }
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(dataDir, safe);
  const writableDir = path.join(dataDir, "game_data");
  const within = filePath === writableDir || filePath.startsWith(writableDir + path.sep);
  if (!within || path.extname(filePath).toLowerCase() !== ".json") {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 Forbidden");
    return;
  }

  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.concat(chunks));
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      sendJson(res, 500, `写入失败：${e.message}`);
    }
  });
  req.on("error", () => {
    try {
      res.end();
    } catch {
      // 连接已断，无需再回应
    }
  });
}

/** 按给定目录造一个请求处理器 */
function makeHandler({ distDir, dataDir, savesDir }) {
  return function handleRequest(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");

      // 存档夹接口
      if (url.pathname === SAVES_PREFIX || url.pathname.startsWith(SAVES_PREFIX + "/")) {
        handleSaves(req, res, savesDir, url);
        return;
      }

      // 推演请求：由服务端补上密钥再转发给上游，密钥不进前端
      if (url.pathname === AI_CHAT_PATH) {
        if (req.method !== "POST") {
          sendPayload(res, 405, { error: "不支持的请求方式。" });
          return;
        }
        serveAiChatNode(req, res).catch((err) => {
          console.error(`[ai] 转发失败：${err.stack || err.message}`);
          sendPayload(res, 500, { error: `AI 转发失败：${err.message}` });
        });
        return;
      }

      // 自定义接口：玩家自备接口时，已知服务商经这里转发，绕开浏览器跨域
      for (const [prefix, upstreamBase] of Object.entries(PROXY_MAP)) {
        if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
          proxyRequest(req, res, upstreamBase, url.pathname.slice(prefix.length) + url.search);
          return;
        }
      }

      // /game/ 直接指向数据目录，改完 JSON 或换掉图片，刷新浏览器就能看到，
      // 不必重新构建；构建产物里则有一份构建时复制进来的拷贝
      if (url.pathname === GAME_PREFIX || url.pathname.startsWith(GAME_PREFIX + "/")) {
        // POST 是编辑器回写数据文件；GET 照旧取文件
        if (req.method === "POST") {
          writeGameFile(req, res, dataDir, url.pathname.slice(GAME_PREFIX.length) || "/");
          return;
        }
        serveFile(res, dataDir, url.pathname.slice(GAME_PREFIX.length) || "/", { spaFallback: false });
        return;
      }

      serveFile(res, distDir, url.pathname, { spaFallback: true });
    } catch (err) {
      // 单个请求出错绝不能把整个服务带崩
      console.error(`[server] 处理请求失败 ${req.method} ${req.url}：${err.stack || err.message}`);
      sendJson(res, 500, `本地服务处理请求失败：${err.message}`);
    }
  };
}

/** 造一个绑定到指定目录的 http.Server */
export function createGameServer({
  distDir = DEFAULT_DIST_DIR,
  dataDir = DEFAULT_DATA_DIR,
  savesDir = DEFAULT_SAVES_DIR,
} = {}) {
  return http.createServer(makeHandler({ distDir, dataDir, savesDir }));
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, (err) => {
    if (err) console.log(`  请手动在浏览器中打开：${url}`);
  });
}

/**
 * 启动本地服务。
 *
 * 端口被占用时，只要 port > 0 就依次后移重试（最多 10 次）；
 * 传 port: 0 则交给系统分一个空闲端口，适合 Electron 内嵌场景。
 *
 * @returns {Promise<{server: import("node:http").Server, port: number, host: string, url: string}>}
 */
export function startGameServer({
  distDir = DEFAULT_DIST_DIR,
  dataDir = DEFAULT_DATA_DIR,
  savesDir = DEFAULT_SAVES_DIR,
  port = 5180,
  host = "127.0.0.1",
  open = true,
  silent = false,
  onLog = console.log,
} = {}) {
  return new Promise((resolve, reject) => {
    const server = createGameServer({ distDir, dataDir, savesDir });
    let attempt = 0;

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && !server.listening && port > 0 && attempt < 10) {
        attempt += 1;
        onLog(`  端口 ${port + attempt - 1} 已被占用，改用 ${port + attempt} ...`);
        server.listen(port + attempt, host);
        return;
      }
      if (!server.listening) {
        reject(err);
        return;
      }
      // 已在监听后的运行期错误不应终止服务
      console.error(`  [server] 运行期错误，服务继续：${err.message}`);
    });

    server.on("listening", () => {
      const actualPort = server.address().port;
      const url = `http://localhost:${actualPort}/`;
      if (!silent) {
        onLog("");
        onLog("  ============================================");
        onLog("   天机衍世  已启动");
        onLog("  ============================================");
        onLog(`   访问地址：${url}`);
        onLog("   大模型请求经本地代理转发，无需担心跨域");
        onLog("");
        onLog("   >>> 请保持这个窗口开着 <<<");
        onLog("   它是游戏的服务本体，关闭窗口或按 Ctrl + C");
        onLog("   游戏就会断线，页面会提示“本地服务未响应”。");
        onLog("");
      }
      if (open) openBrowser(url);
      resolve({ server, port: actualPort, host, url });
    });

    server.listen(port, host);
  });
}

/** 命令行入口：node tools/serve-local.js [端口] [--no-open] */
async function runCli() {
  const args = process.argv.slice(2);
  const startPort = Number(args.find((a) => /^\d+$/.test(a))) || 5180;
  const noOpen = args.includes("--no-open");

  // 兜底：任何漏网的异常都不应该让服务静默退出
  process.on("uncaughtException", (err) => {
    console.error("  [server] 未捕获异常，服务继续运行：", err);
  });
  process.on("unhandledRejection", (err) => {
    console.error("  [server] 未处理的 Promise 拒绝：", err);
  });

  if (!fs.existsSync(path.join(DEFAULT_DIST_DIR, "index.html"))) {
    console.error("  未找到 dist-local/index.html，请先执行 npm run build:local");
    process.exit(1);
  }

  try {
    await startGameServer({ port: startPort, open: !noOpen });
  } catch (err) {
    console.error(`  启动失败：${err.message}`);
    process.exit(1);
  }
}

// 仅在被直接执行时跑命令行入口；被当成模块 import 时不产生副作用
const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  runCli();
}
