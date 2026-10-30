// 工作台是纯静态的，不依赖任何包。起这个服务的唯一理由是：
// 浏览器在 file:// 下对「导出整镜序列」的连续下载有限制，走 http 更稳。
// 用法：npm run dev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found: ' + url); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log('风格展示台已就绪：');
  console.log(`  展示台    http://localhost:${PORT}/`);
  console.log(`  制图台    http://localhost:${PORT}/renderer/index.html`);
  console.log(`  示波器    http://localhost:${PORT}/renderer/scope.html`);
  console.log(`  黑板      http://localhost:${PORT}/renderer/board.html`);
  console.log(`  流程手册  http://localhost:${PORT}/docs/REPRODUCE.md`);
});
