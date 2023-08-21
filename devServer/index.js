import {readFile} from 'fs/promises';
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

const watchExtensionWhitelist = new Set(['html', 'js', 'css']);

makeServer(async (req, res) => {
  const filePath =
    nodePath.join(process.env.PWD, '.', req.path) +
    (req.path.endsWith('/') ? 'index.html' : '');

  if (watchExtensionWhitelist.has(filePath.split('.').pop())) {
    fileWatcher.watchPath(filePath);
  }

  if (filePath.endsWith('.html')) {
    res.send(
      `${await readFile(filePath, 'utf-8')}
      <script>
        new WebSocket('ws://localhost:${wsPort}').onmessage = (e) => {
          if (e.data === 'reload') location.reload();
          else console.log('from websocket', e);
        };
      </script>`
    );
  } else {
    res.sendFile(filePath);
  }
});
