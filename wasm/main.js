const funcs = [
  {
    code: `
  (module
    (func $fac (export "fac") (param f64) (result f64)
      local.get 0
      f64.const 1
      f64.lt
      if (result f64)
        f64.const 1
      else
        local.get 0
        local.get 0
        f64.const 1
        f64.sub
        call $fac
        f64.mul
      end))`,
    funcName: 'fac',
    tests: [{args: [10], expected: 3628800}],
  },
  {
    code: `
(module
  (func $add (param $lhs i32) (param $rhs i32) (result i32)
    local.get $lhs
    local.get $rhs
    i32.add)
  (export "add" (func $add))
)`,
    funcName: 'add',
    tests: [{args: [13, 17], expected: 30}],
  },
];

const go = async () => {
  const wabt = await window.WabtModule();

  for (const {code, funcName, tests} of funcs) {
    const container = document.createElement('div');
    container.innerHTML = `
      <textarea class="input"></textarea>
      <details class="logDetails">
       <summary>Log</summary>
       <pre class="logOutput"></pre>
      </details>
    `;

    const input = container.querySelector('.input');
    const logEl = container.querySelector('.logOutput');
    const detailsEl = container.querySelector('.logDetails');

    const onInput = () => {
      try {
        const module = wabt.parseWat('.wast', input.value);
        module.resolveNames();
        module.validate();
        const {buffer, log} = module.toBinary({
          log: true,
          write_debug_names: true,
        });
        const wasmModule = new WebAssembly.Module(buffer);
        const wasmInstance = new WebAssembly.Instance(wasmModule, {});
        const func = wasmInstance.exports[funcName];
        for (const {args, expected} of tests) {
          const actual = func(...args);
          if (actual === expected) console.log('PASS');
          else
            console.error(
              `Expected ${funcName}(${args.join(
                ', '
              )}) to be ${expected}, but got ${actual}`
            );
        }
        logEl.innerText = log;
        detailsEl.open = false;
      } catch (e) {
        logEl.innerText = e.message;
        detailsEl.open = true;
      }
    };

    input.value = code.trim();
    input.addEventListener('input', onInput);
    document.body.append(container);
    onInput();
  }
};

go();
