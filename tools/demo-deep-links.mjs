// Lets a static host without per-folder fallbacks (GitHub Pages) open a
// demo UI's deep links. The site's 404.html sends /party/clubhouse/e/7 to
// /party/clubhouse/?__p=%2Fe%2F7; this script, put at the top of each UI's
// index.html, puts the path back before Angular reads it. Harmless where
// the server already falls back (tools/serve-demo.mjs).
//
//   node tools/demo-deep-links.mjs ui/dist/demo-local
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('Usage: node tools/demo-deep-links.mjs <demo bundle dir>');
  process.exit(2);
}
const restore =
  "<script>(function(){var m=/[?&]__p=([^&]*)/.exec(location.search);if(!m)return;" +
  "var b=document.querySelector('base').getAttribute('href');if(b.slice(-1)==='/')b=b.slice(0,-1);" +
  "history.replaceState(null,'',b+decodeURIComponent(m[1]));})();</script>";
// It goes into HTML as text: make sure it is valid JavaScript first.
new Function(restore.replace(/^<script>|<\/script>$/g, ''));
let n = 0;
for (const ui of readdirSync(root)) {
  const file = join(root, ui, 'index.html');
  if (!statSync(join(root, ui)).isDirectory()) continue;
  const html = readFileSync(file, 'utf8');
  if (html.includes('__p=')) continue;
  const out = html.replace(/(<base href="[^"]*"\s*\/?>)/, `$1${restore}`);
  if (out === html) throw new Error(`No <base> in ${file}`);
  writeFileSync(file, out);
  n++;
}
console.log(`deep links restored in ${n} UIs under ${root}`);
