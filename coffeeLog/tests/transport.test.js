import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../transport.js';

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec';
function environment(t) {
  const elements = [];
  const listeners = new Set();
  const originals = new Map(['window', 'document', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = {
    addEventListener(type, listener) { listeners.add(listener); },
    removeEventListener(type, listener) { listeners.delete(listener); }
  };
  globalThis.location = { origin: 'http://localhost:3000' };
  globalThis.document = {
    body: { append(...nodes) { elements.push(...nodes); } },
    createElement(tag) { return { tag, children: [], removed: false, setAttribute() {}, append(node) { this.children.push(node); }, remove() { this.removed = true; }, submit() {} }; }
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return {
    elements, listeners,
    get fields() { return Object.fromEntries(elements.find(node => node.tag === 'form').children.map(input => [input.name, input.value])); },
    reply(data, origin = 'https://abc-script.googleusercontent.com') { for (const listener of listeners) listener({ data, origin }); }
  };
}

test('POST waits for a matching Google confirmation, ignores unrelated messages and cleans up', async t => {
  const env = environment(t);
  const saving = request(endpoint, 'log', { drink_id: 'a-drink' });
  assert.equal(env.fields.parentOrigin, 'http://localhost:3000');
  assert.equal(env.fields.action, 'log');
  assert.equal(JSON.parse(env.fields.payload).drink_id, 'a-drink');
  const reply = { channel: 'coffee-log-v1', requestId: env.fields.requestId, ok: true, result: { drinkId: 'a-drink' } };
  env.reply(reply, 'https://evil.example');
  env.reply({ ...reply, requestId: 'unrelated' });
  assert.equal(env.listeners.size, 1);
  env.reply(reply);
  assert.deepEqual(await saving, { drinkId: 'a-drink' });
  assert.equal(env.listeners.size, 0);
  assert.equal(env.elements.every(element => element.removed), true);
});

test('a missing reply times out as an uncertain save, never as success', async t => {
  const env = environment(t);
  const saving = request(endpoint, 'log', {});
  const check = assert.rejects(saving, error => /did not confirm/.test(error.message) && error.definitive !== true);
  t.mock.timers.tick(30001);
  await check;
  assert.equal(env.listeners.size, 0);
  assert.equal(env.elements.every(element => element.removed), true);
});

test('explicit server validation errors preserve their definitive status', async t => {
  const env = environment(t);
  const saving = request(endpoint, 'log', {});
  const check = assert.rejects(saving, error => error.message === 'Choose a batch.' && error.definitive === true);
  env.reply({ channel: 'coffee-log-v1', requestId: env.fields.requestId, ok: false, definitive: true, error: 'Choose a batch.' });
  await check;
});
