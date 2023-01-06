import {Env} from './Env.js';

const toMathInstructions = (obj) => {
  for (const key in obj) {
    const func = obj[key];
    obj[key] = (env, x, y, resultLoc) =>
      env.set(resultLoc, func(env.get(x), env.get(y)));
  }
  return obj;
};

const toBranchInstructions = (obj) => {
  for (const key in obj) {
    const func = obj[key];
    obj[key] = (env, x, jumpTo) => {
      if (func(env.get(x))) env.set(0, jumpTo - 2);
    };
  }
  return obj;
};

const ops = {
  // STORE: (env, val, loc) => (env[loc] = val),
  PUSH: (env, val) => env.push(val),
  MOVE: (env, loc, dest) => env.set(dest, env.get(loc)),
  POP: (env) => env.pop(),
  ...toMathInstructions({
    ADD: (a, b) => a + b,
    SUB: (a, b) => a - b,
    MUL: (a, b) => a * b,
    DIV: (a, b) => a / b,
    MOD: (a, b) => a % b,
    AND: (a, b) => a & b,
    OR: (a, b) => a | b,
    SHR: (a, b) => a >> b,
    SHL: (a, b) => a << b,
    EQ: (a, b) => a === b,
    NEQ: (a, b) => a !== b,
    GT: (a, b) => a > b,
    GTE: (a, b) => a >= b,
    LT: (a, b) => a < b,
    LTE: (a, b) => a <= b,
  }),
  PRINTN: (env, val) => env.print(env.get(val)),
  PRINTC: (env, val) => env.print(String.fromCharCode(env.get(val))),
  ...toBranchInstructions({
    BEZ: (a) => a === 0,
    BNZ: (a) => a !== 0,
    BLZ: (a) => a < 0,
    BGZ: (a) => a > 0,
    BLEZ: (a) => a <= 0,
    BGEZ: (a) => a >= 0,
  }),
  JUMP: (env, val) => env.set(0, val - 2),
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
