class Computer {
  constructor(data, onOutput) {
    this.data = data.split(',').map(Number);
    this.onOutput = onOutput;
    this.inputs = [];
    this.instCounter = 0;
  }
  isDone() {
    return this.instCounter >= this.data.length;
  }
  run(...vals) {
    const {data, onOutput, inputs} = this;
    inputs.push(...vals);
    while (!this.isDone()) {
      const [opCode, a, b, c] = data.slice(this.instCounter);
      const modes = opCode
        .toString()
        .slice(0, -2)
        .split('')
        .reverse()
        .map(Number);

      const op = Number(opCode.toString().slice(-2));
      const [va, vb] = [a, b].map((v, i) => (modes[i] ? v : data[v]));

      switch (op) {
        case 1:
          data[c] = va + vb;
          this.instCounter += 4;
          break;
        case 2:
          data[c] = va * vb;
          this.instCounter += 4;
          break;
        case 3:
          if (!inputs.length) return;
          data[a] = inputs.shift();
          this.instCounter += 2;
          break;
        case 4:
          onOutput(va);
          this.instCounter += 2;
          break;
        case 5:
          this.instCounter = va ? vb : this.instCounter + 3;
          break;
        case 6:
          this.instCounter = va ? this.instCounter + 3 : vb;
          break;
        case 7:
          data[c] = va < vb ? 1 : 0;
          this.instCounter += 4;
          break;
        case 8:
          data[c] = va === vb ? 1 : 0;
          this.instCounter += 4;
          break;
        case 99:
          return data;
        default:
          throw new Error(`Bad op: ${op}, ${a}, ${b}, ${c}`);
      }
    }
  }
}

const getCombos = arr =>
  arr.length === 1
    ? [arr]
    : [].concat(
        ...arr.map(v => getCombos(arr.filter(x => x !== v)).map(c => [v, ...c]))
      );

const run = (combo, input) => {
  let signal = 0;
  const computers = combo.map(n => {
    const computer = new Computer(input, v => {
      // console.log('Output', v);
      signal = v;
    });

    computer.run(n, signal);
    return computer;
  });

  for (let i = 0; i < 1e4; i++) {
    computers[i % computers.length].run(signal);
  }

  return signal;
};

const input = `3,8,1001,8,10,8,105,1,0,0,21,42,51,76,101,118,199,280,361,442,99999,3,9,101,5,9,9,102,2,9,9,1001,9,4,9,102,2,9,9,4,9,99,3,9,1002,9,3,9,4,9,99,3,9,1002,9,4,9,1001,9,3,9,1002,9,5,9,101,3,9,9,1002,9,2,9,4,9,99,3,9,101,4,9,9,1002,9,2,9,1001,9,3,9,1002,9,3,9,101,4,9,9,4,9,99,3,9,101,3,9,9,1002,9,3,9,101,2,9,9,4,9,99,3,9,1002,9,2,9,4,9,3,9,1001,9,2,9,4,9,3,9,1002,9,2,9,4,9,3,9,102,2,9,9,4,9,3,9,1002,9,2,9,4,9,3,9,1001,9,2,9,4,9,3,9,101,2,9,9,4,9,3,9,1002,9,2,9,4,9,3,9,1002,9,2,9,4,9,3,9,1001,9,1,9,4,9,99,3,9,1001,9,1,9,4,9,3,9,1002,9,2,9,4,9,3,9,1001,9,1,9,4,9,3,9,101,1,9,9,4,9,3,9,1001,9,1,9,4,9,3,9,101,2,9,9,4,9,3,9,1002,9,2,9,4,9,3,9,1001,9,2,9,4,9,3,9,101,2,9,9,4,9,3,9,1002,9,2,9,4,9,99,3,9,1002,9,2,9,4,9,3,9,101,1,9,9,4,9,3,9,1002,9,2,9,4,9,3,9,102,2,9,9,4,9,3,9,1001,9,1,9,4,9,3,9,101,1,9,9,4,9,3,9,102,2,9,9,4,9,3,9,1002,9,2,9,4,9,3,9,1002,9,2,9,4,9,3,9,101,2,9,9,4,9,99,3,9,1002,9,2,9,4,9,3,9,1001,9,1,9,4,9,3,9,1002,9,2,9,4,9,3,9,1002,9,2,9,4,9,3,9,1002,9,2,9,4,9,3,9,1002,9,2,9,4,9,3,9,102,2,9,9,4,9,3,9,1001,9,2,9,4,9,3,9,101,2,9,9,4,9,3,9,101,1,9,9,4,9,99,3,9,1002,9,2,9,4,9,3,9,101,1,9,9,4,9,3,9,102,2,9,9,4,9,3,9,102,2,9,9,4,9,3,9,102,2,9,9,4,9,3,9,1001,9,1,9,4,9,3,9,1001,9,1,9,4,9,3,9,101,2,9,9,4,9,3,9,1002,9,2,9,4,9,3,9,101,2,9,9,4,9,99`;
// const input = `3,52,1001,52,-5,52,3,53,1,52,56,54,1007,54,5,55,1005,55,26,1001,54,
// -5,54,1105,1,12,1,53,54,53,1008,54,0,55,1001,55,1,55,2,53,55,53,4,
// 53,1001,56,-1,56,1005,56,6,99,0,0,0,0,10`.replace(/\s/g, '');

const result = getCombos(/*[0, 1, 2, 3, 4]*/ [5, 6, 7, 8, 9]).reduce(
  (max, combo) => {
    const output = run(combo, input);
    console.log(combo, output);
    return Math.max(output, max);
  },
  -Infinity
);

// const result = run([4, 3, 2, 1, 0], input);

console.log(result);
