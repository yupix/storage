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
    // REST は Nitro routeRules プロキシ。WS 直結用（localhost dev フォールバック）
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
        // REST: Nitro routeRules 経由（dev/prod 共通）。Vite server.proxy は REST では効かない。
        // WS: localhost dev は watchword.ts API 直結。リモート dev は routeRules 経由 same-origin。
        // ws:true は upgrade イベントの補助として残置（f6fcf95 構成）。
        // secure: false,  // API が self-signed HTTPS の場合のみ有効化
      },
    },
  },
  test: {
    environment: 'node',
  },
  }
})

export default config
