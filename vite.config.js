import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ✅ Corrige erro do React undefined e o limite do Workbox no build
export default defineConfig({
  plugins: [
    react({
      jsxImportSource: 'react',
      include: "**/*.jsx",
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'robots.txt',
        'apple-touch-icon.png',
        'logo.jpg',
      ],
      manifest: {
        name: 'Ponto Sorveteria',
        short_name: 'Ponto Sorvetao Italiano',
        start_url: '/',
        display: 'standalone',
        background_color: '#121212',
        theme_color: '#1f1f1f',
        icons: [
          {
            src: 'logo.jpg',
            sizes: '192x192',
            type: 'image/png/jpg',
          },
          {
            src: 'logo.jpg',
            sizes: '512x512',
            type: 'image/png/jpg',
          },
        ],
      },
      // ✅ Aumenta o limite de tamanho do arquivo para cache (corrige o erro do Vercel)
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
})
