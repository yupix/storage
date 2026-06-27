import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = env.API_BASE_URL ?? 'http://localhost:3400'

  return {
  define: {
    // REST は Vite プロキシ維持。WS のみ API 直接接続用（dev プロキシ upgrade ハング回避）
    'import.meta.env.VITE_API_WS_BASE_URL': JSON.stringify(apiBaseUrl),
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      routeRules: {
        '/v1/**': {
          proxy: `${apiBaseUrl}/v1/**`,
        },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    allowedHosts: true,
    port: 5175,
    host: "0.0.0.0",
    proxy: {
      '/v1': {
        target: apiBaseUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  }
  }
})

export default config
