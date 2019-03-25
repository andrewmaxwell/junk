# What are Pure Functions?

### Pure Functions:
- Have no side-effects (they do not affect external state)
- Always output something determined exclusively by arguments (not affected by external state)
- Will always return the same thing for the same arguments

### Therefore:
- Can be reused easily
- Functions are ignorant of outside world
- Are straightforward to test and debug
- Outputs can be reliably cached
- Parallelizable

### Examples:

#### Impure:
```javascript
const doStuff = () => {
  data.name = 'Bob';
};
```
- Notice that `doStuff` takes no arguments. This should be a clue that it's impure.
- It mutates state outside the function by adding a property to `data`.
- It does not return anything. If a function doesn't return anything, then it must only exist for its side-effects.
- It relies on `data` existing in the scope, which makes it difficult to test or reuse.

#### Pure:
```javascript
const doStuff = data => {
  return {...data, name: 'Bob'};
};
```
- Takes `data` as an argument instead of referencing external state
- Returns a new object without changing `data`

#### Impure:
```javascript
const doStuff = data => {
  return value++;
};
```
- It mutates `data`, which affects external state.

#### Pure:
```javascript
const doStuff = data => {
  return value + 1;
};
```

#### Impure:
```javascript
const sortArray = array => {
  return array.sort();
};
```
- `sortArray` will change the value of `array` outside of the function
- `sort`, `reverse`, `fill`, `copyWithin`, `splice`, `push`, `pop`, `shift`, `unshift` all mutate the original array.

#### Pure:
```javascript
const sortArray = array => {
  return array.slice().sort();
};
```
- Uses `slice` to make a copy of `array` before mutating so it doesn't affect the original value.

# What is a higher order function?
A higher order function is one that takes functions as arguments and/or returns a function as a result.

Simple example:
```javascript
const complement = func => x => !func(x);

const hasElements = arr => arr.length > 0;
const isEmpty = complement(hasElements);

hasElements([]); // returns false
isEmpty([]); // returns true
```
- `complement` takes a function and returns a function that when called, gives the negated result.

```javascript
const compose = (f, g) => x => f(g(x));

const add = (a, b) => a + b;
const multiply = (a, b) => a * b;
compose(add(5), multiply(2))(4); // returns 13
```

# What is function composition?

Here's a data structure that is similar to what we use in DART. How would you total up all the money values?
```javascript
const data = {
  components: {
    value: [
      {
        name: {value: 'Component 1'},
        money: {
          value: [
            {value: 1000},
            {value: 456}
          ]
        }
      },
      {
        name: {value: 'Component 2'},
        money: {
          value: [
            {value: 2200},
            {value: 24},
            {value: 423}
          ]
        }
      }
    ]
  }
}
```

You could use `for` loops, I guess.
```javascript
const totalMoney = data => {
  let total = 0;
  for (let i = 0; i < data.components.value.length; i++) {
    for (let j = 0; j < data.components.value[i].money.value.length; j++) {
      total += data.components.value[i].money.value[j].value;
    }
  }
  return total;
};
```

Let's split this into two independent functions:
```javascript
const totalComponentMoney = component => {
  let total = 0;
  for (let i = 0; i < component.money.value.length; i++) {
    total += component.money.value[i].value;
  }
  return total;
}

const totalMoney = data => {
  let total = 0;
  for (let i = 0; i < data.components.value.length; i++) {
    total += totalComponentMoney(data.components.value[i]);
  }
  return total;
};
```

What if we separated the summing into a reusable utility function that takes an array of numbers?
```javascript
const sum = arr => arr.reduce((a, b) => total + x, 0);

const totalComponentMoney = component => {
  const arrayOfObjects = component.money.value;
  const arrayOfNumbers = arrayOfObjects.map(v => v.value);
  const total = sum(arrayOfNumbers);
  return total;
}
const totalMoney = data => {
  const arrayOfObjects = data.components.value;
  const arrayOfNumbers = arrayOfObjects.map(totalComponentMoney);
  const total = sum(arrayOfNumbers);
  return total;
};
```

Notice how we've broken things up into steps where each feeds into the next. Wouldn't it be great if we could clean things up and get rid of the intermediate values?
`pipe` takes any number of functions as arguments and returns a function that takes data and puts it into the first, whose output goes into the second and so on.
```javascript
const pipe = (...funcs) => input =>
  funcs.reduce((acc, func) => func(acc), input);

const sum = arr => arr.reduce((acc, n) => acc + n, 0);

const totalComponentMoney = component => {
  return pipe(
    c => c.money.value,
    a => a.map(v => v.value),
    sum
  )(component);
};

const totalMoney = data => {
  return pipe(
    d => d.components.value,
    a => a.map(totalComponentMoney),
    sum
  )(data);
};
```

You may have noticed, this can be simplified to:
```javascript
const pipe = (...funcs) => input =>
  funcs.reduce((acc, func) => func(acc), input);

const sum = arr => arr.reduce((acc, n) => acc + n, 0);

const totalComponentMoney = pipe(
  c => c.money.value,
  a => a.map(v => v.value),
  sum
);

const totalMoney = pipe(
  d => d.components.value,
  a => a.map(totalComponentMoney),
  sum
);
```

I still think this can be cleaner. What if we had utility functions for paths, mapping, and plucking?
```javascript
const pipe = (...funcs) => input =>
  funcs.reduce((acc, func) => func(acc), input);

const sum = arr => arr.reduce((acc, n) => acc + n, 0);

const path = arr => data =>
  arr.length ? path(arr.slice(1))(data[arr[0]]) : data;

const map = func => data => data.map(func);

const pluck = prop => data => data.map(v => v[prop]);

const totalComponentMoney = pipe(
  c => path(['money', 'value'])(c),
  a => pluck('value')(a),
  sum
);

const totalMoney = pipe(
  d => path(['components', 'value'])(d),
  a => map(totalComponentMoney)(a),
  sum
);
```

You might be thinking: "That is not simpler." Well, how about this:
```javascript
import {pipe, sum, path, map, pluck} from 'ramda';

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
```
- Notice that there are no function definitions above, just composed utility functions.
- Notice how little code there is. Less code means less to test, fewer places for bugs to hide, and less overall to maintain.

# What is currying?

Let's take a closer look at `path`:
```javascript
const path1 = arr => data =>
  arr.length ? path(arr.slice(1))(data[arr[0]]) : data;

const path2 = (arr, data) =>
  arr.length ? path2(arr.slice(1), data[arr[0]]) : data;
```

`path1` is curried, but `path2` is not. Instead of taking multiple arguments, `path1` takes one argument at a time. This allows us to put it in a pipe, but does not allow us to call it like this: `path(arr.slice(1), data[arr[0]])`

What if we had a function that could take any function and let you pass in some of its arguments now and some more later?
```javascript

const curry = (func, totalArgs = func.length) => (...args) =>
  args.length < totalArgs
    ? curry(
        (...moreArgs) => func(...args, ...moreArgs),
        totalArgs - args.length
      )
    : func(...args);


const path = curry((arr, data) =>
  arr.length ? path(arr.slice(1), data[arr[0]]) : data
);
```
Now `path(['components', 'value'])` returns a function that takes a data argument, which is the same as `path(['components', 'value'], data)`
