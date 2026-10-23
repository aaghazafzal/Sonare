import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const AUDIO_DIR = path.resolve(__dirname, 'Audio');
const MANIFEST = path.resolve(__dirname, 'src/data/manifest.json');
const TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
};

/**
 * Samples live in ./Audio (outside public/). In dev they are served at /audio/*; on build only the files the
 * manifest references are copied to dist/audio, which keeps the deployment roughly half the size of the folder.
 */
function samples(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sonare-samples',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/audio', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]);
        const file = path.resolve(AUDIO_DIR, '.' + rel);
        if (!file.startsWith(AUDIO_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as {
        instruments: { folder: string; samples: Record<string, string> }[];
        kits: { folder: string; pieces: Record<string, string> }[];
      };
      const files = [
        ...manifest.instruments.flatMap((i) => Object.values(i.samples).map((f) => [i.folder, f])),
        ...manifest.kits.flatMap((k) => Object.values(k.pieces).map((f) => [k.folder, f])),
      ];
      // Ogg samples also ship their AAC copy (made by scripts/convert-ogg.mjs) for Safari / iOS
      const withAac = files.flatMap(([folder, f]) => {
        const aac = f.replace(/\.ogg$/, '.m4a');
        return f.endsWith('.ogg') && fs.existsSync(path.join(AUDIO_DIR, folder, aac)) ? [[folder, f], [folder, aac]] : [[folder, f]];
      });
      for (const [folder, f] of withAac) {
        const dest = path.join(outDir, 'audio', folder, f);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(AUDIO_DIR, folder, f), dest);
      }
      files.length = 0;
      files.push(...withAac);
      this.info?.(`copied ${files.length} samples to ${path.relative(process.cwd(), path.join(outDir, 'audio'))}`);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    samples(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og-image.png'],
      manifest: {
        name: 'Sonare — Instruments & Studio',
        short_name: 'Sonare',
        description: 'Play 112 sampled instruments and make full songs in a browser studio.',
        start_url: '/?source=app#/play',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1012',
        theme_color: '#0f1012',
        categories: ['music', 'entertainment', 'education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Play', url: '/#/play', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Studio', url: '/#/studio', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Learn songs', url: '/#/play?songs', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // the app shell is precached; samples are cached the first time each one is played
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        globIgnores: ['audio/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sonare-samples',
              expiration: { maxEntries: 6000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5180 },
  build: { chunkSizeWarningLimit: 1000 },
});
