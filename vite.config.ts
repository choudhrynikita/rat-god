import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.png', 'icons/*.png', 'assets/**/*.{png,json}'],
      manifest: {
        name: 'Rat God', short_name: 'Rat God', description: 'Watch a burrow and its king with free will. You are their god. You may only watch.',
        theme_color: '#1c1612', background_color: '#f4efe4', display: 'standalone', orientation: 'portrait', start_url: './', scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // art is precached (≈4 MB); music/ambience (≈19 MB per format) streams and is cached on first play, one format only
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,json,woff,woff2,webmanifest}'], globIgnores: ['**/audio/**'], maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, navigateFallback: 'index.html',
        runtimeCaching: [{ urlPattern: /\/assets\/final\/audio\/.*\.(ogg|mp3|m4a)$/, handler: 'CacheFirst', options: { cacheName: 'rg-audio', rangeRequests: true, cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 160 } } }, { urlPattern: /\/assets\/final\/audio\/audio_manifest\.json$/, handler: 'NetworkFirst', options: { cacheName: 'rg-audio-manifest', networkTimeoutSeconds: 3 } }], // AUDIO glue (v2): m4a + manifest, see docs/AUDIO_API.md
      },
    }),
  ],
});
