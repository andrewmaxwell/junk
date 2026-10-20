// Load the shipped model in Node (tests and offline tools): weights.js fetches
// relative URLs, so route those to files in langViz/.
import {readFile} from 'fs/promises';
import {fileURLToPath} from 'url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
globalThis.fetch = async (u) => {
  const buf = await readFile(ROOT + String(u).replace(/^(\.\/)+/, ''));
  return {
    ok: true,
    json: async () => JSON.parse(buf),
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};
const {loadModel} = await import('../js/weights.js');
const {makeModel} = await import('../js/model.js');
const {makeTokenizer} = await import('../js/tokenizer.js');
export const loaded = await loadModel('.');
export const tokenizer = makeTokenizer(loaded.config.vocab);
export const makeWith = (means) => makeModel({...loaded, means});
