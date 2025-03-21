/** @type {(statCanvas: HTMLCanvasElement | null) => {add: (index: number, val: number) => void, draw: (progress: string) => void}} */
export const makeStats = (canvas) => {
  if (!canvas) throw new Error('where is the canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('wtf');

  const width = (canvas.width = innerWidth - 50);
  const height = (canvas.height = 200);

  /** @type Array<Array<number>> */
  const stats = [];
  let maxX = 0;
  let maxY = -Infinity;
  let minY = Infinity;

  /** @type {(index: number, val: number) => void} */
  const add = (index, val) => {
    const len = (stats[index] ||= []).push(val);
    maxX = Math.max(maxX, len);
    maxY = Math.max(maxY, val);
    minY = Math.min(minY, val);
  };

  /** @type (progress: string) => void */
  const draw = (progress) => {
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '12px sans-serif';

    for (let i = 0; i < stats.length; i++) {
      if (!stats[i]?.length) continue;
      ctx.fillStyle =
        ctx.strokeStyle = `hsl(${(i / stats.length) * 360},100%,70%)`;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const j = Math.floor((x / width) * maxX);
        if (isNaN(stats[i][j])) break;
        const y = height * (1 - (stats[i][j] - minY) / (maxY - minY));
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      const lastVal = stats[i][stats[i].length - 1];
      ctx.fillText(Math.round(lastVal).toLocaleString(), width, 12 * (i + 2));
    }

    ctx.globalAlpha = 1;
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText(progress, width, 0);
  };

  return {add, draw};
};
