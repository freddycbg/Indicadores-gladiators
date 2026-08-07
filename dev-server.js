/* Servidor estático mínimo para desarrollo local.
   Uso:  node dev-server.js   →  http://localhost:5173
   No se necesita en producción: el sitio son archivos estáticos. */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PUERTO = process.env.PORT || 5173;
const RAIZ   = __dirname;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let rel = url === '/' ? '/index.html' : url;
  const archivo = path.join(RAIZ, path.normalize(rel).replace(/^([/\\])+/, ''));

  // No servir nada fuera de la raíz del proyecto
  if (!archivo.startsWith(RAIZ)) {
    res.writeHead(403).end('Prohibido');
    return;
  }

  fs.readFile(archivo, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(datos);
  });
}).listen(PUERTO, () => {
  console.log(`Servidor listo en http://localhost:${PUERTO}`);
});
