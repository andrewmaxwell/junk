/** @type {(statCanvas: HTMLCanvasElement | null) => {add: (index: number, val: number) => void, draw: (progress: number) => void}} */
export const makeStats = (statCanvas) => {
  const ctx = statCanvas?.getContext('2d');
  if (!ctx) throw new Error('wtf');

  const width = statCanvas?.clientWidth ?? 800;
  const height = statCanvas?.clientHeight ?? 200;

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

  /** @type (progress: number) => void */
  const draw = (progress) => {
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    for (let i = 0; i < stats.length; i++) {
      if (!stats[i]?.length) continue;
      ctx.fillStyle =
        ctx.strokeStyle = `hsl(${(i / stats.length) * 360},100%,70%)`;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const j = Math.floor((x / width) * maxX);
        if (isNaN(stats[i][j])) continue;
        const y = height * (1 - (stats[i][j] - minY) / (maxY - minY));
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
      const lastVal = stats[i][stats[i].length - 1];
      ctx.fillText(
        Math.round(lastVal).toLocaleString(),
        2,
        height - 2 - 16 * i,
      );
    }

    ctx.fillStyle = 'white';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = '16px sans-serif';
    ctx.fillText(`${Math.floor(progress)}% complete`, width, 0);
  };

  return {add, draw};
};
