import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'



import svgr from 'vite-plugin-svgr'

const config = defineConfig(({ mode }) => ({
  esbuild: {
    // Strip console/debugger from production bundles only (dev keeps logs).
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  // Match TanStack Start + Nitro ordering: nitro() must run after viteReact (see hosting docs).
  plugins: [
    devtools(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
    }),
    viteReact(),
    svgr(),
    nitro(),
  ],
}))

export default config

