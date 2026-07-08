const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5173;
const BACKEND = 'http://localhost:3000';
const DIST = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: 'localhost:3000' },
    };
    const proxy = http.request(opts, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502); res.end('Bad Gateway'); });
    req.pipe(proxy);
  } else {
    let filePath = path.join(DIST, req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }
}).listen(PORT, () => console.log(`Frontend: http://localhost:${PORT}`));
