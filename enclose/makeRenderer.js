export const makeRenderer = (
  /** @type {number}*/ width,
  /** @type {number} */ height,
  /** @type {string[]} */ boardVals,
) => {
  const scale = 50;
  const canvas = /** @type {HTMLCanvasElement} */ (
    document.querySelector('canvas')
  );
  const ctx = canvas?.getContext('2d');
  canvas.width = width * scale;
  canvas.height = height * scale;

  /** @type {(current: number[], queueSize: number, seenSize: number) => void} */
  return (current, queueSize, seenSize) => {
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < current.length; i++) {
      ctx.fillStyle = current[i]
        ? 'yellow'
        : boardVals[i] === 'W'
          ? 'navy'
          : 'green';
      const x = i % width;
      const y = Math.floor(i / width);
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }

    ctx.fillStyle = 'black';
    const solutionSize = current.reduce((a, b) => a + b, 0).toLocaleString();
    ctx.fillText(`Solution size: ${solutionSize}`, 3, 10);
    ctx.fillText(`Queue size: ${queueSize.toLocaleString()}`, 3, 20);
    ctx.fillText(`Seen size: ${seenSize.toLocaleString()}`, 3, 30);
  };
};
