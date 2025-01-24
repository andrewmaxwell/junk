// Constants for our gradient generation
const GRADIENT_WIDTH = 2048;
const GRADIENT_HEIGHT = 1;
const COLOR_STOPS = [
  {offset: 0.0, color: '#000764'},
  {offset: 0.16, color: '#2068CB'},
  {offset: 0.42, color: '#EDFFFF'},
  {offset: 0.6425, color: '#FFAA00'},
  {offset: 0.8575, color: '#000200'},
];

/**
 * Creates a 1D gradient lookup table as a Uint32Array,
 * so each index corresponds to a single ARGB color.
 */
function createGradientColors(
  width = GRADIENT_WIDTH,
  height = GRADIENT_HEIGHT,
  stops = COLOR_STOPS,
) {
  // Create a small canvas to draw the gradient
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, 0);

  // Add color stops
  stops.forEach(({offset, color}) => {
    gradient.addColorStop(offset, color);
  });

  // Fill the canvas with the gradient
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Return the pixel buffer as a Uint32Array (ARGB)
  return new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer);
}

/**
 * Main function to initialize WebAssembly, set up the canvas,
 * retrieve the color buffer, and render the result.
 */
async function initAndRender() {
  // Grab canvas and set size
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Calculate memory size so we have enough pages
  // to hold two bytes per pixel (16-bit indices).
  const totalPixels = canvas.width * canvas.height;
  const bytesNeeded = totalPixels * 2;
  const pagesNeeded = ((bytesNeeded + 0xffff) & ~0xffff) >>> 16; // Round up
  const memory = new WebAssembly.Memory({initial: pagesNeeded});

  // Instantiate the WASM module
  const {instance} = await WebAssembly.instantiateStreaming(
    fetch('./build/release.wasm'),
    {
      env: {
        memory,
        'Math.log': Math.log,
        'Math.log2': Math.log2,
      },
    },
  );

  // Destructure the `update` export
  const {update} = instance.exports;

  // Create typed views into the WASM memory
  const wasmBuffer = new Uint16Array(memory.buffer);

  // Prepare the ImageData buffer for rendering
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const argb = new Uint32Array(imageData.data.buffer);

  // Generate or retrieve the gradient colors
  const colors = createGradientColors();

  // Update the WASM state (e.g., iteration count is 40 here)
  update(canvas.width, canvas.height, 40);

  // Map each 16-bit index in `wasmBuffer` to its color in `colors`
  for (let y = 0; y < canvas.height; y++) {
    const rowOffset = y * canvas.width;
    for (let x = 0; x < canvas.width; x++) {
      const index = rowOffset + x;
      argb[index] = colors[wasmBuffer[index]];
    }
  }

  // Put the final rendered image onto the canvas
  ctx.putImageData(imageData, 0, 0);
}

// Kick off the initialization and rendering
initAndRender();
