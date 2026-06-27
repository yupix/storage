import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//] },
      routeRules: {
        '/v1/**': {
          proxy: `${process.env.API_BASE_URL ?? 'http://localhost:3400'}/v1/**`,
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
        target: process.env.API_BASE_URL ?? 'http://localhost:3400',
        changeOrigin: true,
        ws: true,
      },
    },
  }
})

export default config
