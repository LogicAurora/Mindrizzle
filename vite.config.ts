import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
import fs from 'node:fs'

const { TAURI_DEV_HOST: host, HOME: homeDir } = process.env;

// bun 的依赖是经 ~/.bun/install/cache 的符号链接暴露的，realpath 后落在 workspace 之外，
// 必须显式放行该缓存目录，否则 Vite 的 fs 守门会拒绝加载 Vuetify 等依赖的样式
const bunCacheDir = homeDir ? `${homeDir}/.bun/install/cache` : undefined;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue({
      script: {
        fs: {
          fileExists: (filePath) => fs.existsSync(filePath),
          readFile: (filePath) => fs.readFileSync(filePath, 'utf-8'),
        },
      },
    }),
    vuetify()
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  build: {
    // Tauri 各平台 WebView 均为现代内核，无需为旧浏览器降级转译
    target: 'esnext',
  },
  optimizeDeps: {
    entries: ["index.html"],
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    fs: {
      allow: [".", ...(bunCacheDir ? [bunCacheDir] : [])],
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
