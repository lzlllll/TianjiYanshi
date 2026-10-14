import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'path';

/**
 * 开发态下前端跑在 Vite 上，而推演转发、自定义接口代理与存档夹都在本地服务里，
 * 故把 /api 整段代理到本地服务（开发时另行执行 npm run serve:local）。
 * 构建产物不走这里：本地版与 exe 同源直达，线上版填 src/data/backend.ts 里的后端地址。
 */
const PROXY = {
  '/api': {
    target: 'http://127.0.0.1:5180',
    changeOrigin: true,
  },
};

/**
 * 运行时读取的游戏数据与图片，构建时原样复制到 <产物>/game/ 下，
 * 与本地服务暴露的 /game/ 前缀对齐。这些文件不进包，改完重跑构建即可，不必动代码。
 */
const GAME_ASSETS = ['game_data', 'image_assets', '武侠地图.png'];

/** 逐层复制目录；不用 cpSync 是因为它在部分 Windows 环境下会让 node 进程直接崩掉 */
function copyRecursive(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) copyRecursive(src, dest);
    else copyFileSync(src, dest);
  }
}

function copyGameAssets(outDir: string): Plugin {
  return {
    name: 'copy-game-assets',
    apply: 'build',
    closeBundle() {
      for (const entry of GAME_ASSETS) {
        const from = resolve(__dirname, entry);
        if (!existsSync(from)) continue;
        const to = resolve(__dirname, outDir, 'game', entry);
        if (statSync(from).isDirectory()) copyRecursive(from, to);
        else {
          mkdirSync(resolve(__dirname, outDir, 'game'), { recursive: true });
          copyFileSync(from, to);
        }
      }
    },
  };
}

export default defineConfig(async ({ mode }) => {
  // 两种构建目标：
  //   localrun  本地服务版本，由 启动游戏.bat 提供服务、接口代理与数据目录
  //   pages     GitHub Pages 部署，资源路径带仓库前缀
  const isLocal = mode === 'localrun';
  const outDir = isLocal ? 'dist-local' : 'dist';

  return {
    base: isLocal ? '/' : '/TianjiYanshi/',
    define: {
      // 本地服务版本通过本地代理转发大模型请求，规避浏览器跨域限制
      'import.meta.env.VITE_LOCAL_PROXY': JSON.stringify(isLocal ? '1' : ''),
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: 'hidden',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [
      react({
        babel: {
          plugins: [
            'react-dev-locator',
          ],
        },
      }),
      copyGameAssets(outDir),
    ],
    server: {
      proxy: PROXY,
    },
  };
})
