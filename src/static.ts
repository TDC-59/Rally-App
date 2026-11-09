// Bundled static files. Add a file here to serve it; paths are immutable once referenced from HTML.
import { Hono } from 'hono';
import spikeIcon192 from '../static/spike/icon-192.png';
import spikeIcon512 from '../static/spike/icon-512.png';

type Entry = { body: ArrayBuffer | string; type: string };

const FILES: Record<string, Entry> = {
  '/spike/icon-192.png': { body: spikeIcon192, type: 'image/png' },
  '/spike/icon-512.png': { body: spikeIcon512, type: 'image/png' },
};

export const staticFiles = new Hono();
for (const [path, f] of Object.entries(FILES)) {
  staticFiles.get(path, (c) =>
    c.body(f.body as ArrayBuffer, 200, { 'content-type': f.type, 'cache-control': 'public, max-age=86400' }),
  );
}
