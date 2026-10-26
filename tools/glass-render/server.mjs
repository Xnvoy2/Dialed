// Serves the glass renderer and saves the PNG/JPEGs it posts back. Loopback only.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, 'out'), { recursive: true });
const handler = (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('access-control-allow-headers', '*'); return res.end(); }
  if (req.method === 'POST') {
    const name = basename(new URL(req.url, 'http://x').searchParams.get('name') ?? 'out.jpg');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      writeFileSync(join(root, 'out', name), Buffer.from(body.split(',')[1], 'base64'));
      res.end('ok');
      console.log('saved', name);
    });
    return;
  }
  try {
    res.setHeader('content-type', 'text/html');
    res.end(readFileSync(join(root, 'index.html')));
  } catch {
    res.statusCode = 404;
    res.end();
  }
};
const port = Number(process.env.PORT ?? 4031);
createServer(handler).listen(port, '127.0.0.1');
console.log(`glass renderer on http://localhost:${port}`);
