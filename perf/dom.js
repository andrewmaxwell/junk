import {log, yieldToBrowser, updateScore} from './ui.js';

export async function runDOM() {
  const el = /** @type {HTMLElement} */ (document.getElementById('res-dom'));
  if (el) el.innerText = 'Calculating...';
  await yieldToBrowser();

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.visibility = 'hidden';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  let totalTime = 0;
  let totalOps = 0;
  const testDuration = 1500;
  let batchSize = 1000;

  const startTest = performance.now();
  let timeMs = 0;

  while (performance.now() - startTest < testDuration) {
    const t0 = performance.now();

    // 1. Creation & Insertion (DOM Generation)
    const frag = document.createDocumentFragment();
    for (let i = 0; i < batchSize; i++) {
      const node = document.createElement('div');
      node.style.width = (i % 100) + 'px';
      node.style.height = '10px';
      node.className = 'benchmark-node';
      const child = document.createElement('span');
      child.textContent = 'x';
      node.appendChild(child);
      frag.appendChild(node);
    }
    container.appendChild(frag);

    // 2. Force Layout Recalculation (Reflow)
    void container.offsetHeight;

    // 3. CSS Mutation (Style changes)
    const children = container.childNodes;
    for (let i = 0; i < batchSize; i++) {
      // @ts-expect-error: directly mutating raw element node styles inside dense loops
      children[i].style.backgroundColor = '#000';
    }

    // 4. Force Layout Recalculation #2
    void container.offsetHeight;

    // 5. Deletion & Garbage Collection
    container.innerHTML = '';

    const t1 = performance.now();
    timeMs = t1 - t0;

    totalTime += timeMs;
    // One "Op" is a full lifecycle on a single complex element (create, style, layout, mutate, reflow, delete)
    totalOps += batchSize;

    // Dynamically adjust batch size to keep JS thread from locking for more than ~30ms
    if (timeMs < 15) batchSize = Math.floor(batchSize * 1.5);
    else if (timeMs > 40)
      batchSize = Math.max(100, Math.floor(batchSize * 0.5));

    await yieldToBrowser();
  }

  document.body.removeChild(container);

  // K-Ops/s (Thousands of elements processed per second)
  const kOpsPerSec = totalOps / (totalTime / 1000) / 1000;
  updateScore('res-dom', kOpsPerSec, 500, 'K-Ops/s');
  log(`✓ DOM complete. (${Math.floor(totalOps / 1000)}k elements processed)`);
}
