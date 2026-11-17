import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon.svg'],
      manifest: {
        name: 'MediCheck',
        short_name: 'MediCheck',
        description: 'Recordatorio de medicamentos para adultos mayores',
        theme_color: '#0F4C81',
        background_color: '#F9FAFB',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})