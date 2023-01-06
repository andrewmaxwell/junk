import {Env} from './Env.js';

const mathInstructions = {
  ADD: (a, b) => a + b,
  SUB: (a, b) => a - b,
  MUL: (a, b) => a * b,
  DIV: (a, b) => a / b,
  MOD: (a, b) => a % b,
  AND: (a, b) => a & b,
  OR: (a, b) => a | b,
  SHR: (a, b) => a >> b,
  SHL: (a, b) => a << b,
  // EQ: (a, b) => a === b,
  // NEQ: (a, b) => a !== b,
  // GT: (a, b) => a > b,
  // GTE: (a, b) => a >= b,
  // LT: (a, b) => a < b,
  // LTE: (a, b) => a <= b,
};
for (const key in mathInstructions) {
  const func = mathInstructions[key];
  mathInstructions[key] = (env, x, y, resultLoc) =>
    env.set(resultLoc, func(env.get(x), env.get(y)));
}

const branchInstructions = {
  BEZ: (a) => a === 0,
  BNZ: (a) => a !== 0,
  BLZ: (a) => a < 0,
  BGZ: (a) => a > 0,
  BLEZ: (a) => a <= 0,
  BGEZ: (a) => a >= 0,
};
for (const key in branchInstructions) {
  const func = branchInstructions[key];
  branchInstructions[key] = (env, x, jumpTo) => {
    if (func(env.get(x))) env.set(0, jumpTo - 2);
  };
}

const ops = {
  PUSH: (env, val) => env.push(val),
  MOVE: (env, loc, dest) => env.set(dest, env.get(loc)),
  INC: (env, val) => env.set(val, env.get(val) + 1),
  DEC: (env, val) => env.set(val, env.get(val) - 1),
  SET: (env, loc, val) => env.set(loc, env.get(val)),
  PRINTN: (env, val) => env.print(env.get(val)),
  PRINTC: (env, val) => env.print(String.fromCharCode(env.get(val))),
  JUMP: (env, val) => env.set(0, val - 2),
  ...mathInstructions,
  ...branchInstructions,
};

export const execute = (instructions) => {
  const env = new Env();
  for (let i = 0; i < 1e4 && env.get(0) < instructions.length; i++) {
    console.log(env.get(0), instructions[env.get(0)]);
    const [command, ...args] = instructions[env.get(0)];
    ops[command](env, ...args);
    env.inc(0);
  }
  return env.output;
};
