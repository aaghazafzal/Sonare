// Makes an AAC (.m4a) copy next to every .ogg sample the manifest uses, for Safari / iOS,
// which can't decode Ogg Vorbis. Needs ffmpeg on PATH. Run with: npm run convert-samples
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/data/manifest.json'), 'utf8'));

const jobs = [];
for (const inst of manifest.instruments)
  for (const file of Object.values(inst.samples))
    if (file.endsWith('.ogg')) {
      const src = path.join(root, 'Audio', inst.folder, file);
      const dest = src.replace(/\.ogg$/, '.m4a');
      if (!fs.existsSync(dest)) jobs.push([src, dest]);
    }

console.log(`${jobs.length} samples to convert`);

const run = ([src, dest]) =>
  new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-i', src, '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', dest]);
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed on ${src}`))));
  });

let done = 0;
const workers = Array.from({ length: 8 }, async () => {
  while (jobs.length) {
    await run(jobs.pop());
    if (++done % 200 === 0) console.log(`${done} done`);
  }
});
await Promise.all(workers);
console.log(`converted ${done}`);
