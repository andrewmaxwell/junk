import {readFile} from 'fs/promises';
import {existsSync} from 'fs';
import nodePath from 'path';
import {FileWatcher} from './FileWatcher.js';
import {makeServer} from './makeServer.js';
import {SocketServer} from './SocketServer.js';

/*

The HTTP server:
  - watches for changes on any requested files
  - injects a script into html files that connects to the websocket and refreshes the page when it receives a message
  - broadcasts a websocket message whenever a previously requested file is changed

*/

const wsPort = 3003;
const wss = new SocketServer({port: wsPort});
const fileWatcher = new FileWatcher((filename) => {
  console.log(filename, 'changed!');
  wss.broadcast('reload');
});

const getFile = async (filePath) =>
  existsSync(filePath)
    ? await readFile(filePath, 'utf-8')
    : 'Your URL is dumb.';

makeServer(async (req, res) => {
  const filePath =
    nodePath.join(process.env.PWD, '.', req.path) +
    (req.path.endsWith('/') ? 'index.html' : '');

  fileWatcher.watchPath(filePath);

  if (filePath.endsWith('.html')) {
    res.send(
      `${await getFile(filePath)}
<script>
  new WebSocket('ws://' + location.hostname + ':${wsPort}').onmessage = (e) => {
    if (e.data === 'reload') location.reload();
    else console.log('from websocket', e);
  };
</script>`
    );
  } else {
    res.sendFile(filePath);
  }
});
