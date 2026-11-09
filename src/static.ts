// Bundled static files. Add a file here to serve it.
import { Hono } from 'hono';
import spikeIcon192 from '../static/spike/icon-192.png';
import spikeIcon512 from '../static/spike/icon-512.png';
import rallyCss from '../static/css/rally.css';
import fArchivoBlack from '../static/fonts/archivo-black-latin-400-normal.woff2';
import fArchivo400 from '../static/fonts/archivo-latin-400-normal.woff2';
import fArchivo600 from '../static/fonts/archivo-latin-600-normal.woff2';
import fArchivo700 from '../static/fonts/archivo-latin-700-normal.woff2';
import fPlex400 from '../static/fonts/ibm-plex-mono-latin-400-normal.woff2';
import fPlex500 from '../static/fonts/ibm-plex-mono-latin-500-normal.woff2';

type Entry = { body: ArrayBuffer | string; type: string; immutable?: boolean };

const FILES: Record<string, Entry> = {
  '/spike/icon-192.png': { body: spikeIcon192, type: 'image/png' },
  '/spike/icon-512.png': { body: spikeIcon512, type: 'image/png' },
  '/css/rally.css': { body: rallyCss, type: 'text/css; charset=utf-8' },
  '/fonts/archivo-black-latin-400-normal.woff2': { body: fArchivoBlack, type: 'font/woff2', immutable: true },
  '/fonts/archivo-latin-400-normal.woff2': { body: fArchivo400, type: 'font/woff2', immutable: true },
  '/fonts/archivo-latin-600-normal.woff2': { body: fArchivo600, type: 'font/woff2', immutable: true },
  '/fonts/archivo-latin-700-normal.woff2': { body: fArchivo700, type: 'font/woff2', immutable: true },
  '/fonts/ibm-plex-mono-latin-400-normal.woff2': { body: fPlex400, type: 'font/woff2', immutable: true },
  '/fonts/ibm-plex-mono-latin-500-normal.woff2': { body: fPlex500, type: 'font/woff2', immutable: true },
};

/** Short content hash, for cache-busting URLs like /css/rally.css?v=abc123. Computed once per isolate. */
const versions = new Map<string, string>();
export async function assetVersion(path: string): Promise<string> {
  let v = versions.get(path);
  if (!v) {
    const f = FILES[path];
    if (!f) throw new Error(`no static file ${path}`);
    const bytes = typeof f.body === 'string' ? new TextEncoder().encode(f.body) : new Uint8Array(f.body);
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    v = Array.from(d.slice(0, 5), (b) => b.toString(16).padStart(2, '0')).join('');
    versions.set(path, v);
  }
  return v;
}

export const staticFiles = new Hono();
for (const [path, f] of Object.entries(FILES)) {
  staticFiles.get(path, (c) =>
    c.body(f.body as ArrayBuffer, 200, {
      'content-type': f.type,
      'cache-control': f.immutable || c.req.query('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    }),
  );
}
