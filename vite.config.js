import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ✅ Corrige o erro do React undefined
export default defineConfig({
  plugins: [
    react({
      jsxImportSource: 'react',
      include: "**/*.jsx",
    }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ponto Sorveteria',
        short_name: 'Ponto',
        start_url: '/',
        display: 'standalone',
        background_color: '#121212',
        theme_color: '#1f1f1f',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
})
