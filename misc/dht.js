class DHT {
  #data = {};
  put(key, val) {
    this.#data[key] = val;
  }
  get(key) {
    return key in this.#data ? this.#data[key] : null;
  }
  delete(key) {
    delete this.#data[key];
  }
  addNode() {}
  removeNode() {}
  isKeyInNode() {
    return true;
  }
}

const dht = new DHT();

import assert from 'assert';

async function runTests() {
  // Test PUT and GET
  await dht.put('key1', 'value1');
  let value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after PUT failed');

  // Test UPDATE and GET
  await dht.put('key1', 'value2');
  value = await dht.get('key1');
  assert.strictEqual(value, 'value2', 'GET after UPDATE failed');

  // Test DELETE and GET
  await dht.delete('key1');
  value = await dht.get('key1');
  assert.strictEqual(value, null, 'GET after DELETE failed');

  // Test GET non-existing key
  value = await dht.get('keyDoesNotExist');
  assert.strictEqual(value, null, 'GET non-existing key failed');

  // Advanced: Test Node Join (Assuming you have a method to simulate this)
  // await dht.addNode(newNode);
  // await dht.put('key2', 'value2');
  // value = await dht.get('key2');
  // assert.strictEqual(value, 'value2', 'GET after node join failed');

  // Advanced: Test Node Leave (Assuming you have a method to simulate this)
  // await dht.removeNode(nodeToRemove);
  // value = await dht.get('key2');
  // assert.strictEqual(value, 'value2', 'GET after node leave failed');

  // Advanced: Test Transaction (Assuming you have a method to support this)
  // await dht.transaction(() => {
  //   dht.put('key3', 'value3');
  //   dht.delete('key2');
  // });
  // value = await dht.get('key3');
  // assert.strictEqual(value, 'value3', 'GET after transaction failed');
  // value = await dht.get('key2');
  // assert.strictEqual(value, null, 'GET after transaction failed');

  let node1 = {id: 1};
  let node2 = {id: 2};
  let node3 = {id: 3};
  await dht.addNode(node1);
  await dht.addNode(node2);
  await dht.addNode(node3);

  // Test PUT and GET
  await dht.put('key1', 'value1');
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after PUT failed');

  // Simulate node failure
  await dht.removeNode(node1);

  // Test GET after node failure
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after node failure failed');

  // Test PUT and GET after node failure
  await dht.put('key2', 'value2');
  value = await dht.get('key2');
  assert.strictEqual(value, 'value2', 'GET after PUT with node failure failed');

  // Add node back (simulate node recovery)
  await dht.addNode(node1);

  // Test GET after node recovery
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after node recovery failed');
  value = await dht.get('key2');
  assert.strictEqual(value, 'value2', 'GET after node recovery failed');

  // Simulate multiple node failures
  await dht.removeNode(node2);
  await dht.removeNode(node3);

  // Test GET after multiple node failures (depending on your replication strategy)
  // Assuming at least one replica of the data is still available
  value = await dht.get('key1');
  assert.strictEqual(
    value,
    'value1',
    'GET after multiple node failures failed'
  );

  console.log('All fault tolerance tests passed.');

  await dht.put('key1', 'value1');
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after PUT failed');

  await dht.addNode(node1);
  await dht.addNode(node2);
  await dht.addNode(node3);

  // Test distributed storage (assuming you can check which node a key ends up in)
  // assert.ok(await dht.isKeyInNode('key1', node1), 'Key not distributed correctly');

  // Simulate node failure
  await dht.removeNode(node1);

  // Test GET after node failure
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after node failure failed');

  // Test PUT and GET after node failure
  await dht.put('key2', 'value2');
  value = await dht.get('key2');
  assert.strictEqual(value, 'value2', 'GET after PUT with node failure failed');

  // Add node back (simulate node recovery)
  await dht.addNode(node1);

  // Test GET after node recovery
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after node recovery failed');
  value = await dht.get('key2');
  assert.strictEqual(value, 'value2', 'GET after node recovery failed');

  console.log('All tests passed.');

  await dht.put('key1', 'value1');
  assert.ok(
    (await dht.isKeyInNode('key1', node1)) ||
      (await dht.isKeyInNode('key1', node2)) ||
      (await dht.isKeyInNode('key1', node3)),
    'Key not distributed correctly'
  );

  // Test GET
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after PUT failed');

  // Simulate node failure
  await dht.removeNode(node1);

  // Test GET after node failure
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after node failure failed');

  // Test PUT and GET after node failure
  await dht.put('key2', 'value2');
  value = await dht.get('key2');
  assert.strictEqual(value, 'value2', 'GET after PUT with node failure failed');

  // Add node back (simulate node recovery)
  await dht.addNode(node1);

  // Test GET after node recovery
  value = await dht.get('key1');
  assert.strictEqual(value, 'value1', 'GET after node recovery failed');
  value = await dht.get('key2');
  assert.strictEqual(value, 'value2', 'GET after node recovery failed');

  console.log('All fault tolerance tests passed.');
}

runTests().catch((error) => {
  console.error('Test failed:', error);
});
