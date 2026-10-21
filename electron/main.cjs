/**
 * Electron 主进程。
 *
 * 思路：游戏本体是纯网页，取数与模型调用都要走本地服务（/game/ 现读数据、/api/ 转发大模型），
 * 因此这里不另起一套加载方式，而是直接在应用内跑起 tools/serve-local.js 那台本地服务器，
 * 再让窗口去加载它——与浏览器版行为完全一致，改动最少。
 *
 * 数据目录：
 *   打包后指向安装目录下的 resources/game（含 game_data 与 image_assets），
 *   仍未打包（开发）时指向项目根目录。编辑器回写的数据文件也落在同一个地方。
 *
 * 注意：本文件是 CommonJS（.cjs），因为本地服务是 ESM，需用动态 import 引入。
 */

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require("electron");

/** @type {{ server: import("node:http").Server | null }} */
let localServer = null;
let mainWindow = null;

/**
 * 独立的应用名与数据目录。
 * 默认会照 package.json 的 name 落成 trae-project，既不体面，也可能与别的程序撞在一处；
 * 存档、设置与 localStorage 都落在这里，故先把它钉成自己的名字。
 */
app.setName("天机衍世");
app.setPath("userData", path.join(app.getPath("appData"), "TianjiYanshi"));

/**
 * 内嵌服务固定用这个端口。
 *
 * localStorage 与 IndexedDB 都按「协议 + 主机 + 端口」隔离：端口一变，便是一个全新的源，
 * 设置与进度都会读成空白——这才是「重开游戏存档就没了」的根由。
 * 故这里不再让系统随机分端口；真被占了，serve-local 会顺延，至少先保住常态下的稳定。
 */
const LOCAL_PORT = 5180;

// 同一时刻只留一个实例：第二个实例只把已有窗口唤到前台，不再另起一套服务与一份存储
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

/** 依运行形态算出静态资源目录、数据目录与存档目录 */
function resolveDirs() {
  if (app.isPackaged) {
    return {
      // 构建产物打进 app 目录内；数据目录放在 resources/game，方便读写
      distDir: path.join(__dirname, "..", "dist-local"),
      dataDir: path.join(process.resourcesPath, "game"),
      // 存档另起一处：放在游戏文件夹（exe 同级）下的 saves，玩家一眼能找到、也好带走
      savesDir: path.join(path.dirname(process.execPath), "saves"),
    };
  }
  const root = path.resolve(__dirname, "..");
  return {
    distDir: path.join(root, "dist-local"),
    dataDir: root,
    savesDir: path.join(root, "saves"),
  };
}

async function createWindow() {
  const { startGameServer } = await import(
    pathToFileURL(path.join(__dirname, "..", "tools", "serve-local.js")).href
  );

  const { distDir, dataDir, savesDir } = resolveDirs();
  // 固定端口：换端口便是换源，存档与设置都会读成空白（见 LOCAL_PORT 处的说明）
  const { server, port } = await startGameServer({
    distDir,
    dataDir,
    savesDir,
    port: LOCAL_PORT,
    open: false,
    silent: true,
  });
  localServer = server;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: "天机衍世",
    backgroundColor: "#F0E5D1",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 站外链接（如官方文档）交给系统浏览器，别在游戏窗口里打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${port}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  await mainWindow.loadURL(`http://localhost:${port}/`);
}

// 游戏不需要菜单栏，免得分心
Menu.setApplicationMenu(null);

app.whenReady().then(createWindow).catch((err) => {
  dialog.showErrorBox("启动失败", `本地服务未能启动：\n${err.message}`);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 监听渲染进程的退出请求
ipcMain.on("app-quit", () => {
  if (localServer?.server) {
    localServer.server.close();
  }
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 退出前把本地服务收干净，免得留下占端口的孤儿进程
app.on("quit", () => {
  localServer?.close?.();
  localServer = null;
});
