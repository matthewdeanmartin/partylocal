// Serves the demo bundle (ui/dist/demo-local: the landing page plus one
// folder per UI) the way a static host would, with a fallback to each UI's
// index.html for its client-side routes. One origin, so every UI shares
// the same localStorage data.
//
//   node tools/serve-demo.mjs [port]      (make demo-local)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../ui/dist/demo-local/', import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4300);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2',
};

async function file(path) {
  try {
    const s = await stat(path);
    return s.isFile() ? path : null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '');
  const target = join(root, rel);
  if (!target.startsWith(root.replace(/[\\/]$/, ''))) {
    res.writeHead(403).end();
    return;
  }
  // The file itself, a folder's index.html, or the UI's index.html (SPA routes).
  const ui = rel.split(sep)[0].split('/')[0];
  const found =
    (await file(target)) ??
    (await file(join(target, 'index.html'))) ??
    (extname(rel) ? null : await file(join(root, ui, 'index.html')));
  if (!found) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[extname(found)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await readFile(found));
}).listen(port, '127.0.0.1', () => {
  console.log(`party demo on http://localhost:${port}/  (Ctrl-C to stop)`);
});
