// Serves dist/ like Netlify would: SPA fallback plus the headers from netlify.toml, so the
// Content-Security-Policy is exercised by the browser tests. Usage: node e2e/serve-with-headers.cjs [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'dist');
const port = Number(process.argv[2] || 4173);
const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
// minimal parse of the [[headers]] for = "/*" block
const block = toml.split('[[headers]]').find((b) => /for = "\/\*"/.test(b)) || '';
const headers = {};
for (const line of block.split('\n')) { const m = line.match(/^\s+([A-Za-z-]+) = "(.*)"\s*$/); if (m) headers[m[1]] = m[2]; }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving dist with ${Object.keys(headers).length} headers on ${port}`));
