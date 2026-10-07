import express from 'express';
import {WebSocketServer} from 'ws';
import {watch, existsSync} from 'fs';
import {readFile} from 'fs/promises';
import path from 'path';

/*

Serves the repo at http://localhost:3000 and live-reloads:
  - every requested file is remembered
  - html pages get a script that connects to a websocket and reloads on message
  - when a remembered file changes, every page reloads
  - pages also reload when they reconnect after a server restart

*/

const root = process.cwd();
const port = process.env.PORT || 3000;
const requested = new Set();

const reloadScript = `
<script>
  (function connect(reconnecting) {
    const ws = new WebSocket('ws://' + location.host);
    ws.onopen = () => reconnecting && location.reload();
    ws.onmessage = () => location.reload();
    ws.onclose = () => setTimeout(() => connect(true), 1000);
  })();
</script>`;

const app = express();

app.use(async (req, res, next) => {
  const file = path.join(
    root,
    decodeURIComponent(req.path),
    req.path.endsWith('/') ? 'index.html' : '',
  );
  if (!file.startsWith(root + path.sep)) return res.status(403).end();
  requested.add(file);
  if (!file.endsWith('.html') || !existsSync(file)) return next();
  res.type('html').send((await readFile(file, 'utf-8')) + reloadScript);
});

app.use(express.static(root));

const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Serving ${root} at http://localhost:${port}`),
);

const wss = new WebSocketServer({server});
wss.on('connection', (ws) => ws.on('error', console.error));

let timeout;
watch(root, {recursive: true}, (event, rel) => {
  if (!rel || !requested.has(path.join(root, rel))) return;
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    console.log(rel, 'changed, reloading');
    wss.clients.forEach((ws) => ws.send('reload'));
  }, 50);
});
