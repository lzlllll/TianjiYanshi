/**
 * 本地静态服务器 + 大模型接口代理
 *
 * 作用：
 *   1. 托管 dist-local 目录下的静态资源
 *   2. /game/ 前缀直接指向项目目录，供 game_data 与 image_assets 现读，
 *      改完 JSON 或换掉图片刷新浏览器即可生效，不必重新构建
 *   3. 把 /api/<服务商>/* 转发到真实的大模型接口，浏览器只与本地同源通信，彻底规避跨域限制
 *   4. 启动后自动打开默认浏览器
 *
 * 用法：node tools/serve-local.js [端口] [--no-open]
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist-local");
/** 项目目录；/game/ 前缀的请求直接从这里取，改数据文件刷新即生效 */
const PROJECT_DIR = path.resolve(__dirname, "..");
const GAME_PREFIX = "/game";
const ARGS = process.argv.slice(2);
const START_PORT = Number(ARGS.find((a) => /^\d+$/.test(a))) || 5180;
const NO_OPEN = ARGS.includes("--no-open");

/** 与服务商 baseUrl 一一对应的代理前缀，需与 src/lib/aiClient.ts 中的 PROXY_MAP 保持一致 */
const PROXY_MAP = {
  "/api/deepseek": "https://api.deepseek.com/v1",
  "/api/openai": "https://api.openai.com/v1",
  "/api/glm": "https://open.bigmodel.cn/api/paas/v4",
  "/api/qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
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

/** 转发大模型请求，支持 SSE 流式响应 */
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

/** 允许前端回写的目录：只限 game_data 下的 json，别处一律回绝 */
const WRITABLE_DIR = path.join(PROJECT_DIR, "game_data");

/**
 * 编辑器把改好的数据写回项目文件（如宗门图模板）。
 * 只认 /game/game_data/*.json 这一类路径，其余一概 403。
 */
function writeGameFile(req, res, relPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    decoded = relPath;
  }
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PROJECT_DIR, safe);
  const within = filePath === WRITABLE_DIR || filePath.startsWith(WRITABLE_DIR + path.sep);
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

function handleRequest(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");

    for (const [prefix, upstreamBase] of Object.entries(PROXY_MAP)) {
      if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
        proxyRequest(req, res, upstreamBase, url.pathname.slice(prefix.length) + url.search);
        return;
      }
    }

    // /game/ 直接指向项目目录，改完 JSON 或换掉图片，刷新浏览器就能看到，
    // 不必重新构建；构建产物里则有一份构建时复制进来的拷贝
    if (url.pathname === GAME_PREFIX || url.pathname.startsWith(GAME_PREFIX + "/")) {
      // POST 是编辑器回写数据文件；GET 照旧取文件
      if (req.method === "POST") {
        writeGameFile(req, res, url.pathname.slice(GAME_PREFIX.length) || "/");
        return;
      }
      serveFile(res, PROJECT_DIR, url.pathname.slice(GAME_PREFIX.length) || "/", { spaFallback: false });
      return;
    }

    serveFile(res, DIST_DIR, url.pathname, { spaFallback: true });
  } catch (err) {
    // 单个请求出错绝不能把整个服务带崩
    console.error(`[server] 处理请求失败 ${req.method} ${req.url}：${err.stack || err.message}`);
    sendJson(res, 500, `本地服务处理请求失败：${err.message}`);
  }
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

function start(port, attempt = 0) {
  const server = http.createServer(handleRequest);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && !server.listening && attempt < 10) {
      console.log(`  端口 ${port} 已被占用，改用 ${port + 1} ...`);
      start(port + 1, attempt + 1);
      return;
    }
    if (!server.listening) {
      console.error(`  启动失败：${err.message}`);
      process.exit(1);
    }
    // 已在监听后的运行期错误不应终止服务
    console.error(`  [server] 运行期错误，服务继续：${err.message}`);
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}/`;
    console.log("");
    console.log("  ============================================");
    console.log("   天机衍世  已启动");
    console.log("  ============================================");
    console.log(`   访问地址：${url}`);
    console.log("   大模型请求经本地代理转发，无需担心跨域");
    console.log("");
    console.log("   >>> 请保持这个窗口开着 <<<");
    console.log("   它是游戏的服务本体，关闭窗口或按 Ctrl + C");
    console.log("   游戏就会断线，页面会提示“本地服务未响应”。");
    console.log("");
    if (!NO_OPEN) openBrowser(url);
  });
}

// 兜底：任何漏网的异常都不应该让服务静默退出
process.on("uncaughtException", (err) => {
  console.error("  [server] 未捕获异常，服务继续运行：", err);
});
process.on("unhandledRejection", (err) => {
  console.error("  [server] 未处理的 Promise 拒绝，服务继续运行：", err);
});

if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  console.error("  未找到 dist-local/index.html，请先执行 npm run build:local");
  process.exit(1);
}

start(START_PORT);
