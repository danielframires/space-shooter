import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent((req.url || '/').split('?')[0]);
    const relative = normalize(requested).replace(/^[/\\]+/, '');
    if (relative.startsWith('..')) { res.writeHead(403); res.end(); return; }
    let path = join(root, relative || 'index.html');
    if (!(await stat(path).catch(() => null))?.isFile()) path = join(root, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Erro ao carregar arquivo.'); }
}).listen(port, '127.0.0.1', () => console.log(`Space Shooter 3D: http://127.0.0.1:${port}/`));
