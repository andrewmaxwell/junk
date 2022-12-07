import {Room} from '../Room.js';
import {makeFunction, Roomba} from '../Roomba.js';

self.addEventListener(
  'message',
  ({data: {iterations, width, height, code}}) => {
    const func = makeFunction(code);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const room = new Room(width, height);
      const roomba = new Roomba(room, func);
      for (let i = 0; i < iterations; i++) {
        roomba.move(room);
      }
      self.postMessage(room.getPercentClean());
    }
  }
);
