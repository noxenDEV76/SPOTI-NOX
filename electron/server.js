// Petit serveur HTTP local (127.0.0.1) qui sert le dossier www.
// Necessaire pour le lecteur YouTube integre : YouTube refuse les pages sans origine http(s).
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

function handler(root) {
  return (req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end('bad'); }
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(root, p));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(buf);
    });
  };
}

// Port fixe (garde le meme "site" donc les memes playlists d'un lancement a l'autre), repli si occupe.
function start(root, preferred = 47831) {
  root = path.normalize(root);
  return new Promise((resolve, reject) => {
    const tryPort = (port, left) => {
      const srv = http.createServer(handler(root));
      srv.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && left > 0) tryPort(port + 1, left - 1);
        else reject(e);
      });
      srv.listen(port, '127.0.0.1', () => resolve({ server: srv, port, url: `http://localhost:${port}/` }));
    };
    tryPort(preferred, 10);
  });
}

module.exports = { start };
