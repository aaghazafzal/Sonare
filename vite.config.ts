import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
      for (const [folder, f] of files) {
        const dest = path.join(outDir, 'audio', folder, f);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(AUDIO_DIR, folder, f), dest);
      }
      this.info?.(`copied ${files.length} samples to ${path.relative(process.cwd(), path.join(outDir, 'audio'))}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), samples()],
  server: { port: 5180 },
  build: { chunkSizeWarningLimit: 900 },
});
