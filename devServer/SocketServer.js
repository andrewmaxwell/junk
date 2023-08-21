import WebSocket, {WebSocketServer} from 'ws';

export class SocketServer {
  constructor(config) {
    this.wss = new WebSocketServer(config);
    this.wss.on('connection', (ws) => ws.on('error', console.error));
  }
  broadcast(msg) {
    console.log('broadcasting', msg);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  }
}
