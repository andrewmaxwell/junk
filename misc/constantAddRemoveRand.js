class Set {
  constructor() {
    this.array = [];
    this.dict = {}; // maps values to their index in this.array
  }
  insert(val) {
    if (this.dict[val] !== undefined) return;
    this.dict[val] = this.array.push(val) - 1; // save index into dict
  }
  remove(val) {
    const index = this.dict[val];
    if (index === undefined) return;
    const lastVal = this.array.pop();
    if (val !== lastVal) {
      this.array[index] = lastVal;
      this.dict[lastVal] = index; // change index of last item
    }
    delete this.dict[val]; // remove from dict
  }
  getRandom() {
    return this.array[Math.floor(Math.random() * this.array.length)];
  }
}

// Assuming your Set class implementation is available and named 'Set'

// Helper function to test getRandom() by ensuring it returns a value within the set
function testGetRandom(setInstance, expectedValues) {
  const randomValue = setInstance.getRandom();
  console.assert(
    expectedValues.includes(randomValue),
    `getRandom() should return one of ${expectedValues}, but got ${randomValue}`
  );
}

// Test insertion
const set1 = new Set();
set1.insert(1);
set1.insert(2);
console.assert(
  set1.array.length === 2,
  `Expected array length to be 2, got ${set1.array.length}`
);
console.assert(
  set1.dict[1] !== undefined && set1.dict[2] !== undefined,
  `Dict should contain keys 1 and 2`
);

// Test remove
set1.remove(1);
console.assert(
  set1.array.length === 1,
  `Expected array length to be 1 after removal, got ${set1.array.length}`
);
console.assert(set1.dict[1] === undefined, `Key 1 should be deleted from dict`);

// Test getRandom
const set2 = new Set();
set2.insert(3);
testGetRandom(set2, [3]); // Should only return 3

// Test that removed elements are not returned by getRandom
const set3 = new Set();
set3.insert(4);
set3.insert(5);
set3.remove(4);
testGetRandom(set3, [5]); // Should only return 5

// Test no duplicates
const set4 = new Set();
set4.insert(6);
set4.insert(6);
console.assert(
  set4.array.length === 1,
  `Expected array length to be 1 after attempting to insert duplicate, got ${set4.array.length}`
);

console.log('All tests passed!');
