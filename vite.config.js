import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.png'],
      manifest: {
        name: 'StackHard Sistema Negocio',
        short_name: 'Sistema Negocio',
        description: 'Sistema de gestión para buffet/quiosco escolar',
        theme_color: '#1a1d23',
        background_color: '#1a1d23',
        display: 'standalone',
        icons: [
          { src: 'logo192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'logo512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: {
    port: 5173
  }
})
