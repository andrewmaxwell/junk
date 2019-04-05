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
  data.value++;
  return data;
};

let data = {value: 0};
doStuff(data); // returns {value: 1};
doStuff(data); // returns {value: 2};
```
- It mutates `data`, which affects external state.

#### Pure:
```javascript
const doStuff = data => {
  return {...data, value: data.value + 1};
};
```

#### Impure:
```javascript
const sortArray = array => {
  return array.sort();
};
```
- `sortArray` will change the value of the argument outside of the function
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

const add = a => b => a + b;
const multiply = a => b => a * b;
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
            {value: 500}
          ]
        }
      },
      {
        name: {value: 'Component 2'},
        money: {
          value: [
            {value: 200},
            {value: 50},
            {value: 400}
          ]
        }
      }
    ]
  }
}
```

You could use `for` loops, I guess.
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

totalMoney(data); // returns 2150
```

What if we separated our concerns to the extreme, separating the finding of the data from the summing.
```javascript

const sum = arr => arr.reduce((a, b) => a + b, 0);

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

totalMoney(data); // returns 2150
```

Notice how we've broken things up into steps where each feeds into the next. This is one of prerequisite steps for functional programming. Let's use some other functions from ramda.

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

totalMoney(data); // returns 2150
```
- Notice that there are no function definitions above, just composed utility functions.
- Notice how little code there is. Less code means easier to understand, less to test, and fewer places for bugs to hide.
