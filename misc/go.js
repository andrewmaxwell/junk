class V {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  add(v) {
    return new V(this.x + v.x, this.y + v.y);
  }
}

const dirs = [new V(1, 0), new V(0, -1), new V(-1, 0), new V(0, 1)];

const handicaps = {
  9: [new V(6, 2), new V(2, 6), new V(6, 6), new V(2, 2), new V(4, 4)],
  13: [
    new V(9, 3),
    new V(3, 9),
    new V(9, 9),
    new V(3, 3),
    new V(6, 6),
    new V(3, 6),
    new V(9, 6),
    new V(6, 3),
    new V(6, 9)
  ],
  19: [
    new V(15, 3),
    new V(3, 15),
    new V(15, 15),
    new V(3, 3),
    new V(9, 9),
    new V(3, 9),
    new V(15, 9),
    new V(9, 3),
    new V(9, 15)
  ]
};

const symbols = {black: 'x', white: 'o'};

class Go {
  constructor(height, width = height) {
    if (width > 25 || height > 25) throw new Error('Too big.');
    this.size = {width, height};
    this.reset();
  }
  reset() {
    this.board = Array(this.size.height)
      .fill()
      .map(() => Array(this.size.width).fill('.'));
    this.turn = 'black';
    this.history = [];
    this.gameStarted = false;
  }
  setValue(pos, val) {
    this.board[pos.y][pos.x] = val;
  }
  moveToCoords(str) {
    const charCode = str.charCodeAt(str.length - 1);
    return new V(
      charCode - 65 - (charCode >= 73 ? 1 : 0), // no I
      this.size.height - parseInt(str)
    );
  }
  move(...moves) {
    moves.forEach(str => {
      const pos = this.moveToCoords(str);
      if (this.getValue(pos) !== '.')
        throw new Error(`Bad move: ${str} ${pos.toString()}`);
      const otherColor = this.turn === 'black' ? 'white' : 'black';

      this.setValue(pos, symbols[this.turn]);
      this.resolveCaptures(otherColor);
      if (this.resolveCaptures(this.turn)) {
        this.rollback(0);
        throw new Error('Bad! Self Capture!');
      }
      this.pushHistory();
      this.turn = otherColor;
    });
  }
  pushHistory() {
    const boardStr = this.toString();
    if (this.history.includes(boardStr)) {
      this.rollback(0);
      throw new Error('Illegal KO!');
    }
    this.history.push(boardStr);
    this.gameStarted = true;
  }
  getPosition(str) {
    return this.getValue(this.moveToCoords(str));
  }
  getValue(pos) {
    return this.board[pos.y] && this.board[pos.y][pos.x];
  }
  toString() {
    return this.board.map(r => r.join('')).join('\n');
  }
  toLabeledString() {
    return [
      '   ' +
        Array(this.size.width)
          .fill()
          .map((v, i) => String.fromCharCode(i + 65 + (i >= 8 ? 1 : 0))) // no I
          .join(' '),
      ...this.board.map(
        (r, i) => String(this.size.height - i).padStart(2) + ' ' + r.join(' ')
      )
    ].join('\n');
  }
  resolveCaptures(color) {
    const {width, height} = this.size;
    const symbol = symbols[color];
    const groups = new Go(height, width, true);
    const captured = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = new V(x, y);
        if (this.getValue(pos) === symbol && groups.getValue(pos) === '.') {
          let liberties = 0;
          const q = [pos];
          for (let i = 0; i < q.length; i++) {
            groups.setValue(q[i], '#');
            for (let j = 0; j < dirs.length; j++) {
              const next = q[i].add(dirs[j]);
              if (this.getValue(next) === '.') liberties++;
              else if (
                this.getValue(next) === symbol &&
                groups.getValue(next) === '.'
              )
                q.push(next);
            }
          }
          if (!liberties) captured.push(...q);
        }
      }
    }
    for (let i = 0; i < captured.length; i++) {
      this.setValue(captured[i], '.');
    }
    return captured.length;
  }
  handicapStones(num) {
    const hc = handicaps[this.size.height];
    if (this.gameStarted || !hc || hc.length < num)
      throw new Error('Bad handicap!');
    for (let i = 0; i < num; i++) {
      this.setValue(hc[i], 'x');
    }
    this.gameStarted = true;
  }
  rollback(num) {
    const index = this.history.length - num - 1;
    if (index === -1) this.reset();
    else {
      if (!this.history[index]) throw new Error(`Bad rollback!`);
      this.board = this.history[index].split('\n').map(r => r.split(''));
      if (num % 2) this.pass();
      this.history.length = index + 1;
      if (this.history.length === 1) this.gameStarted = false;
    }
  }
  pass() {
    this.history.push(this.toString());
    this.turn = this.turn === 'black' ? 'white' : 'black';
    this.gameStarted = true;
  }
}

// https://www.codewars.com/kata/59de9f8ff703c4891900005c/train/javascript
// for (let i = 1; i <= handicaps[19].length; i++) {
//   const game = new Go(19);
//   game.handicapStones(i);
//   console.log(game.toString());
//   console.log('\n\n');
// }

// ['1T', '10K'].map(s => console.log(game.getPosition(s)));
const game = new Go(19);
game.move(
  '16Q',
  '16D',
  '4Q',
  '4D',
  '3F',
  '6C',
  '4J',
  '14R',
  '17O',
  '16S',
  '17F',
  '14D',
  '16J',
  '17R',
  '13P',
  '3O',
  '13R',
  '13S',
  '14S',
  '12R',
  '13Q',
  '15S',
  '3M',
  '6Q',
  '3P',
  '4O',
  '5P',
  '4M',
  '3L',
  '3R',
  '4R',
  '2P',
  '3Q',
  '2Q',
  '2R',
  '6O',
  '2N',
  '2O',
  '3S',
  '7N',
  '12C',
  '10C',
  '12E',
  '13C',
  '13B',
  '14B',
  '13F',
  '12B',
  '9M',
  '9O',
  '11N',
  '17L',
  '16M',
  '10E',
  '10F',
  '9F',
  '10G',
  '16G',
  '17G',
  '16F',
  '16H',
  '14G',
  '13H',
  '9G',
  '9H',
  '17E',
  '15E',
  '16E',
  '14H',
  '8H',
  '10H',
  '4F',
  '4G',
  '3E',
  '5F',
  '4E',
  '3G',
  '12D',
  '8G',
  '9E',
  '6P',
  '7P',
  '7Q',
  '8P',
  '7R',
  '8R',
  '10P',
  '11P',
  '10O',
  '6R',
  '7S',
  '6S',
  '8S',
  '9R',
  '9S',
  '10S',
  '12S',
  '10Q',
  '13T',
  '18P',
  '5S',
  '8Q',
  '5Q',
  '9N',
  '10M',
  '8M',
  '5O',
  '5N',
  '6M',
  '6N',
  '8L',
  '7L',
  '7M',
  '8N',
  '6L',
  '7K',
  '6K',
  '10N',
  '11O',
  '9P',
  '11Q',
  '17P',
  '11R',
  '10R',
  '7G',
  '4L',
  '4K',
  '17M',
  '16N',
  '16P',
  '14O',
  '17N',
  '16L',
  '17K',
  '16O',
  '18O',
  '7E',
  '7D',
  '2F',
  '2E',
  '15P',
  '11S',
  '12Q',
  '11E',
  '18J',
  '11F',
  '12G',
  '18E',
  '6E',
  '9T',
  '5R',
  '15Q',
  '8D',
  '8C',
  '8E',
  '9D',
  '6D',
  '7C',
  '18F',
  '19F',
  '19G',
  '19E',
  '17J',
  '3N',
  '1E',
  '1D',
  '1F',
  '2D',
  '2M',
  '18K',
  '19K',
  '19L',
  '19J',
  '8F',
  '7F',
  '3K',
  '2K',
  '8T',
  '6T',
  '14F',
  '13E',
  '11G',
  '11H',
  '14E',
  '13G',
  '5K',
  '5L',
  '3J',
  '5J',
  '1L',
  '2J',
  '1N',
  '2L',
  '1M',
  '19M',
  '18M',
  '18L',
  '9L',
  '8K',
  '19L',
  '13D',
  '11C',
  '18L',
  '11M',
  '10L',
  '19L',
  '15R',
  '16R',
  '18L',
  '12O',
  '12P',
  '19L',
  '14Q',
  '15R',
  '18L',
  '12N',
  '11P',
  '19L',
  '5D',
  '5C',
  '18L',
  '18H',
  '17H',
  '19L',
  '1K',
  '1O',
  '18L',
  '3H',
  '2H',
  '19L',
  '4C',
  '3C',
  '18L',
  '9K',
  '7J',
  '19L',
  '15H',
  '19N',
  '15G',
  '15F',
  '1Q',
  '16K',
  '15K',
  '5E',
  '5G',
  '15T',
  '14T'
);
