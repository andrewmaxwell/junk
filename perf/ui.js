/** @param {string} msg */
export function log(msg) {
  const logElement = document.getElementById('log');
  if (logElement) logElement.innerHTML += msg + '<br>';
}

export function clearLog() {
  const logElement = document.getElementById('log');
  if (logElement) logElement.innerHTML = 'Logs:<br>';
}

export const yieldToBrowser = () =>
  new Promise((resolve) => setTimeout(resolve, 50));

/**
 * @param {string} elementId
 * @param {number} value
 * @param {number} maxValue
 * @param {string} [unit='GFLOPS']
 */
export function updateScore(elementId, value, maxValue, unit = 'GFLOPS') {
  const el = /** @type {HTMLElement} */ (document.getElementById(elementId));
  if (!el) return;
  el.innerText = `${value.toFixed(2)} ${unit}`;
  if (el.parentElement) {
    el.parentElement.style.setProperty(
      '--pct',
      Math.min((value / maxValue) * 100, 100) + '%',
    );
  }
}
