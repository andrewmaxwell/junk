const pipe =
  (...funcs) =>
  (input) =>
    funcs.reduce((r, f) => f(r), input);

const addIntermediate = (points) =>
  points.flatMap((c, i, arr) => {
    const next = arr[(i + 1) % arr.length];
    return [c, {x: (c.x + next.x) / 2, y: (c.y + next.y) / 2}];
  });

const fourierTransform = (points) =>
  points.map((_, i) =>
    points.reduce(
      (res, p, j) => {
        const angle = (i * j * -2 * Math.PI) / points.length;
        res.re += p.x * Math.cos(angle) - p.y * Math.sin(angle);
        res.im += p.x * Math.sin(angle) + p.y * Math.cos(angle);
        return res;
      },
      {re: 0, im: 0}
    )
  );

const fourierToGears = (complexNums) =>
  complexNums
    .map((_, i, arr) => {
      const c = arr[(i + arr.length / 2) % arr.length];
      return {
        speed: i - arr.length / 2,
        radius: Math.hypot(c.re, c.im) / arr.length,
        phase: Math.atan2(c.im, c.re),
      };
    })
    .sort((a, b) => b.radius - a.radius);

const calculatePaths = (gears) => {
  const gearsWithPaths = gears.map((g) => ({...g, path: []}));

  for (let i = 0; i < 2 * Math.PI; i += 0.01) {
    let x = 0;
    let y = 0;
    for (const g of gearsWithPaths) {
      const angle = g.speed * i + g.phase;
      x += g.radius * Math.cos(angle);
      y += g.radius * Math.sin(angle);
      g.path.push({x, y});
    }
  }

  return gearsWithPaths;
};

export const pointsToGears = pipe(
  addIntermediate,
  addIntermediate,
  fourierTransform,
  fourierToGears,
  calculatePaths
);
