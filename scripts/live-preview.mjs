// 로컬 새 화면: 이 저장소에서 빌드한 화면(dist/client)을 내 컴퓨터(127.0.0.1)에서 띄우고,
// /api/* 요청만 운영 서버로 그대로 전달한다. 원장 데이터는 운영 D1/R2 그대로 쓴다.
// 접속 코드는 브라우저 화면에서 사용자가 입력하며, 이 스크립트는 코드를 저장·출력하지 않는다.
// 사용: npm run build 후 node scripts/live-preview.mjs  →  http://127.0.0.1:4174
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN = process.env.DEAL_HUNTER_ORIGIN || 'https://deal-hunter-v5.wwzb-64.chatgpt.site';
const PORT = Number(process.env.PORT || 4174);
const root = path.resolve('dist/client');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
// 운영 서버로 넘기는 요청 헤더. 쿠키·Origin 등 나머지는 넘기지 않는다.
const FORWARD = ['x-deal-code', 'content-type'];

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/client가 없습니다. 먼저 npm run build 를 실행하세요.');
  process.exit(1);
}

const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

async function proxy(req, res, url) {
  const headers = {};
  for (const h of FORWARD) if (req.headers[h]) headers[h] = req.headers[h];
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const upstream = await fetch(ORIGIN + url.pathname + url.search, { method: req.method, headers, body, redirect: 'manual' });
  res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

function serveStatic(res, url) {
  let file = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname.startsWith('/api/')) return await proxy(req, res, url);
    return serveStatic(res, url);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: '운영 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' }));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Deal Hunter 새 화면: http://127.0.0.1:${PORT}  (원장: ${ORIGIN})`);
  console.log('이 창을 닫으면 새 화면도 꺼집니다.');
});
