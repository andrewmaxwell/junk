const sum = nums => nums.reduce((acc, x) => acc + x, 0);

const pipe = (...funcs) => input =>
  funcs.reduce((acc, func) => func(acc), input);

const path = arr => data =>
  arr.length ? path(arr.slice(1))(data[arr[0]]) : data;

const pluck = prop => data => data.map(e => e[prop]);

const map = func => data => data.map(func);

const componentMoney = pipe(
  path(['money', 'value']),
  pluck('value'),
  sum
);

const totalMoney = pipe(
  path(['components', 'value']),
  map(componentMoney),
  sum
);

console.log(
  totalMoney({
    components: {
      value: [
        {
          name: {value: 'Component 1'},
          money: {
            value: [{value: 1000}, {value: 456}]
          }
        },
        {
          name: {value: 'Component 2'},
          money: {
            value: [{value: 2200}, {value: 24}, {value: 423}]
          }
        }
      ]
    }
  })
);
