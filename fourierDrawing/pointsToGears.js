export const pointsToGears = (points) =>
  points
    .flatMap((c, i, arr) => {
      const next = arr[(i + 1) % arr.length];
      return [c, {x: (c.x + next.x) / 2, y: (c.y + next.y) / 2}]; // add intermediate points
    })
    .map((_, i, arr) =>
      arr.reduce(
        (res, p, j) => {
          // mathemagical
          const angle = (i * j * -2 * Math.PI) / arr.length;
          res.re += p.x * Math.cos(angle) - p.y * Math.sin(angle);
          res.im += p.x * Math.sin(angle) + p.y * Math.cos(angle);
          return res;
        },
        {re: 0, im: 0}
      )
    )
    .map((_, i, arr) => {
      const c = arr[(i + arr.length / 2) % arr.length];
      return {
        speed: i - arr.length / 2,
        radius: Math.hypot(c.re, c.im) / arr.length,
        phase: Math.atan2(c.im, c.re),
        path: [], // populated when rendering
      };
    })
    .filter((g) => g.radius > 1)
    .sort((a, b) => b.radius - a.radius);
