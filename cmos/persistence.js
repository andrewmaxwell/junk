/** @param {import('./simulation.js').Simulator} simulator */
export function compressGrid(simulator) {
  const parts = [];
  let currentMat = simulator.materialGrid[0];
  let runLength = 1;

  for (let i = 1; i < simulator.materialGrid.length; i++) {
    if (simulator.materialGrid[i] === currentMat && runLength < 255) {
      runLength++;
    } else {
      parts.push(String.fromCharCode(currentMat, runLength));
      currentMat = simulator.materialGrid[i];
      runLength = 1;
    }
  }
  parts.push(String.fromCharCode(currentMat, runLength));
  return btoa(parts.join(''));
}

/**
 * @param {import('./simulation.js').Simulator} simulator
 * @param {string} hash
 */
export function expandGrid(simulator, hash) {
  try {
    const decoded = atob(hash.replace(/^#/, ''));
    let idx = 0;
    for (let i = 0; i < decoded.length; i += 2) {
      const mat = decoded.charCodeAt(i);
      const runLength = decoded.charCodeAt(i + 1);
      for (
        let r = 0;
        r < runLength && idx < simulator.materialGrid.length;
        r++
      ) {
        simulator.materialGrid[idx++] = mat;
      }
    }
    return true;
  } catch (e) {
    console.warn('Failed to parse grid hash', e);
    return false;
  }
}

let saveTimeout = -1;
/** @param {import('./simulation.js').Simulator} simulator */
export function requestSave(simulator) {
  clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => {
    // Only save if it's different to avoid destroying forward history
    const hash = compressGrid(simulator);
    if (location.hash !== '#' + hash) {
      location.hash = hash;
    }
  }, 2000);
}
