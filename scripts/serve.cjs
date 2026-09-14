#!/usr/bin/env node
'use strict';
// Local static preview. No dependencies, directory listings, or write endpoints.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' };
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (_) { res.writeHead(400).end('Bad request'); return; }
  const segments = pathname.split('/');
  if (segments.some(part => part.startsWith('.') && part !== '') || segments.includes('node_modules')) { res.writeHead(404).end('Not found'); return; }
  const filename = path.resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(404).end('Not found'); return; }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filename).pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log(`Patchlight: http://127.0.0.1:${port}`));
