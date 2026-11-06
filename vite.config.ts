import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve(import.meta.dirname, 'data');
const MIME: Record<string, string> = { '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

/** Only these parts of data/ are served to the browser (not the raw export). */
function allowed(rel: string) {
  return rel === 'properties.json' || /^raw\/photos\/[^/]+\.(jpg|jpeg|png)$/i.test(rel);
}

/**
 * Serves data/properties.json and the listing photos under /data/ in dev,
 * and copies them into dist/data/ on build. The data stays in data/ (git-ignored).
 */
function listingData(): Plugin {
  return {
    name: 'listing-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        // block everything else under /data (raw export, scripts, brief), which Vite would otherwise serve
        if (!allowed(rel) || rel.includes('..')) {
          res.statusCode = 404;
          return res.end('not found');
        }
        const file = path.join(DATA, rel);
        if (!fs.existsSync(file)) {
          res.statusCode = 404;
          return res.end('not found');
        }
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', rel.endsWith('.json') ? 'no-cache' : 'max-age=3600');
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = path.join(options.dir ?? 'dist', 'data');
      const props = JSON.parse(fs.readFileSync(path.join(DATA, 'properties.json'), 'utf8'));
      fs.mkdirSync(path.join(out, 'raw', 'photos'), { recursive: true });
      fs.copyFileSync(path.join(DATA, 'properties.json'), path.join(out, 'properties.json'));
      for (const l of props.listings) {
        for (const p of l.photos as string[]) {
          const src = path.join(DATA, p);
          if (allowed(p) && fs.existsSync(src)) fs.copyFileSync(src, path.join(out, p));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), listingData()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1600 }, // maplibre-gl alone is ~1 MB
});
