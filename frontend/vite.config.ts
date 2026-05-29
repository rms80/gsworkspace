import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import os from 'node:os'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = parseInt(env.VITE_PORT || '3000', 10)
  const apiPort = env.VITE_API_PORT || '4000'
  const isOffline = env.VITE_OFFLINE_MODE === 'true'

  // Remote access (e.g. over a Tailscale network). When exposed, the dev server
  // binds all interfaces instead of localhost only. Vite also blocks requests
  // whose Host header isn't localhost, so we allow:
  //   - this machine's own hostname (auto-detected, so it isn't hardcoded)
  //   - anything listed in VITE_ALLOWED_HOSTS (comma-separated; "*" allows all).
  //     A leading-dot entry matches subdomains, e.g. ".ts.net" allows any
  //     Tailscale MagicDNS name like "<machine>.<tailnet>.ts.net".
  // Setting VITE_ALLOWED_HOSTS implies exposure, so either var alone is enough.
  const extraHosts = (env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  const openAll = extraHosts.some((h) => h === '*' || h.toLowerCase() === 'all')
  const expose = env.VITE_EXPOSE === 'true' || extraHosts.length > 0
  const hostName = os.hostname()
  const allowedHosts: true | string[] | undefined = !expose
    ? undefined
    : openAll
      ? true
      : Array.from(new Set([hostName, hostName.toLowerCase(), ...extraHosts]))
  // Repo root is one level up from frontend/
  const projectRoot = path.resolve(process.cwd(), '..').replace(/\\/g, '/')

  return {
    define: {
      __PROJECT_ROOT__: JSON.stringify(projectRoot),
    },
    base: isOffline ? './' : '/',
    plugins: [
      react(),
      {
        name: 'favicon-swap',
        transformIndexHtml(html, ctx) {
          const prefix = isOffline ? '.' : ''
          const useDevFavicon = ctx.server && env.VITE_PROD_FAVICON !== 'true'
          const favicon = useDevFavicon ? '/favicon_dev.png' : `${prefix}/favicon.svg`
          return html.replace(/href="\/favicon[^"]*"/, `href="${favicon}"`)
        },
      },
    ],
    server: {
      host: expose ? true : 'localhost',
      port,
      allowedHosts,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
