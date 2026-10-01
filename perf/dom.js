import {log, yieldToBrowser, updateScore} from './ui.js';

export async function runDOM() {
  const el = document.getElementById('res-dom');
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.visibility = 'hidden';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  // Per-element cost depends on batch size (each batch has fixed layout
  // overhead), so every machine uses the same one to keep results comparable.
  const batchSize = 5000;

  // Early batches run much slower while the JIT and the browser's style
  // system warm up, and how long that takes varies from run to run.
  const warmupStart = performance.now();
  while (performance.now() - warmupStart < 800) {
    runBatch(container, batchSize);
    await yieldToBrowser();
  }

  let totalTime = 0;
  let totalOps = 0;
  const testDuration = 1500;
  const startTest = performance.now();

  while (performance.now() - startTest < testDuration) {
    totalTime += runBatch(container, batchSize);
    // One "Op" is a full lifecycle on a single complex element (create, style, layout, mutate, reflow, delete)
    totalOps += batchSize;
    await yieldToBrowser();
  }

  document.body.removeChild(container);

  // K-Ops/s (Thousands of elements processed per second)
  const kOpsPerSec = totalOps / (totalTime / 1000) / 1000;
  updateScore('res-dom', kOpsPerSec, 500, 'K-Ops/s');
  log(`✓ DOM complete. (${Math.floor(totalOps / 1000)}k elements processed)`);
  return kOpsPerSec;
}

/**
 * Creates, lays out, restyles and deletes `batchSize` elements.
 * @param {HTMLElement} container
 * @param {number} batchSize
 * @returns {number} milliseconds taken
 */
function runBatch(container, batchSize) {
  const t0 = performance.now();

  // 1. Creation & Insertion (DOM Generation)
  const frag = document.createDocumentFragment();
  const nodes = [];
  for (let i = 0; i < batchSize; i++) {
    const node = document.createElement('div');
    node.style.width = (i % 100) + 'px';
    node.style.height = '10px';
    node.className = 'benchmark-node';
    const child = document.createElement('span');
    child.textContent = 'x';
    node.appendChild(child);
    frag.appendChild(node);
    nodes.push(node);
  }
  container.appendChild(frag);

  // 2. Force Layout Recalculation (Reflow)
  void container.offsetHeight;

  // 3. CSS Mutation (Style changes)
  for (const node of nodes) {
    node.style.backgroundColor = '#000';
  }

  // 4. Force Layout Recalculation #2
  void container.offsetHeight;

  // 5. Deletion & Garbage Collection
  container.innerHTML = '';

  return performance.now() - t0;
}
