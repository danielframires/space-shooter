import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const requested = decodeURIComponent((req.url || '/').split('?')[0]);
    const relative = normalize(requested).replace(/^[/\\]+/, '');
    if (relative.startsWith('..')) { res.writeHead(403); res.end(); return; }
    let path = join(root, relative || 'index.html');
    if (!(await stat(path).catch(() => null))?.isFile()) path = join(root, 'index.html');
    const body = await readFile(path);
    const contentType = mime[extname(path)] || 'application/octet-stream';
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && extname(path) === '.mp3') {
      const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
      const end = range[1] ? Math.min(body.length - 1, range[2] ? Number(range[2]) : body.length - 1) : body.length - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= body.length) {
        res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }); res.end(); return;
      }
      res.writeHead(206, { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length, 'Accept-Ranges': extname(path) === '.mp3' ? 'bytes' : 'none' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Erro ao carregar arquivo.'); }
}).listen(port, '127.0.0.1', () => console.log(`Space Shooter 3D: http://127.0.0.1:${port}/`));
