import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { copyFileSync, mkdirSync } from 'node:fs'

const isElectron = process.env.ELECTRON === 'true'

// Keep the in-app documents byte-identical to their canonical release sources.
const licenseAssets = [
  ['LICENSE', 'AGPL-3.0.txt'],
  ['LICENSING.md', 'LICENSING.md'],
  ['third-party-licenses/LICENSES.txt', 'THIRD-PARTY-NOTICES.txt'],
]
function syncLicenseAssets() {
  const destination = path.resolve(__dirname, 'public/licenses')
  mkdirSync(destination, { recursive: true })
  for (const [source, target] of licenseAssets) {
    copyFileSync(path.resolve(__dirname, source), path.join(destination, target))
  }
}

export default defineConfig({
  plugins: [
    {
      name: 'license-assets',
      configResolved: syncLicenseAssets,
      configureServer(server) {
        const sources = licenseAssets.map(([source]) => path.resolve(__dirname, source))
        server.watcher.add(sources)
        const refresh = (file: string) => { if (sources.includes(path.resolve(file))) syncLicenseAssets() }
        server.watcher.on('change', refresh)
        server.httpServer?.once('close', () => server.watcher.off('change', refresh))
      },
    },
    react(),
    ...(isElectron ? [
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                external: ['electron']
              }
            }
          }
        },
        {
          entry: 'electron/preload.ts',
          onstart(options) {
            options.reload()
          },
          vite: {
            build: {
              outDir: 'dist-electron'
            }
          }
        },
        {
          entry: 'electron/petPreload.ts',
          onstart(options) { options.reload() },
          vite: { build: { outDir: 'dist-electron' } }
        }
      ]),
      renderer()
    ] : [])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: './',  // 使用相对路径，解决打包后白屏问题
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { main: path.resolve(__dirname, 'index.html'), pet: path.resolve(__dirname, 'pet.html') } }
  },
  optimizeDeps: {
    include: [
      'echarts',
      'echarts-wordcloud',
      'three',

      // ── 纯 CJS 包（无 exports / module 字段）──────────────────────────
      // 必须显式列出，否则运行时懒加载时 Vite 直接提供 CJS 文件
      // 导致浏览器 ESM 环境报 "does not provide an export named 'default/xxx'" 错误

      // 通用 React 生态 CJS 依赖
      'prop-types',              // react-plotly.js / react-dropzone
      'hoist-non-react-statics', // @emotion/react
      'react-is',                // recharts / prop-types

      // plotly（react-plotly.js 及 plotly.js 均为纯 CJS）
      'react-plotly.js',
      'plotly.js',

      // dayjs 主包及 @mui/x-date-pickers 用到的所有插件
      'dayjs',
      'dayjs/plugin/advancedFormat',
      'dayjs/plugin/customParseFormat',
      'dayjs/plugin/isBetween',
      'dayjs/plugin/isoWeek',
      'dayjs/plugin/localizedFormat',
      'dayjs/plugin/utc',
      'dayjs/plugin/timezone',
      'dayjs/plugin/weekday',
      'dayjs/plugin/weekOfYear',
      'dayjs/plugin/duration',

      // ── @mui 版本冲突：@mui/x-date-pickers@7 把顶层 @mui/system 升到 v7，
      // 导致 @mui/material@5 在自己的 node_modules 里嵌套安装 v5 CJS 版本。
      // 用 "parent > child" 语法强制 Vite 预打包这些嵌套包（主入口 + 所有子路径）。
      '@mui/material > @mui/system',
      '@mui/material > @mui/system/colorManipulator',
      '@mui/material > @mui/system/createTheme',
      '@mui/material > @mui/system/createStyled',
      '@mui/material > @mui/system/DefaultPropsProvider',
      '@mui/material > @mui/system/InitColorSchemeScript',
      '@mui/material > @mui/system/RtlProvider',
      '@mui/material > @mui/system/Unstable_Grid',
      '@mui/material > @mui/system/styleFunctionSx',
      '@mui/material > @mui/system/useMediaQuery',
      '@mui/material > @mui/system/useThemeProps',
      '@mui/material > @mui/system/useThemeWithoutDefault',
      '@mui/material > @mui/styled-engine',
      '@mui/material > @mui/private-theming'
    ],
    exclude: [
      '@mui/x-date-pickers'
    ]
  }
})

