import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Each build has an id; the app compares it with /version.json to offer a reload when a new version is live.
const BUILD_ID = Date.now().toString(36)
const versionFile = (): Plugin => ({
  name: 'ritmo-version',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) }) },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely: separate files stay cached across Ritmo updates
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('@capacitor')) return 'capacitor'
          if (id.includes('@sentry')) return 'sentry'
          return undefined
        },
      },
    },
  },
})
