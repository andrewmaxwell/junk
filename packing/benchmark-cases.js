// Shared quality references. Scale is the square root of container area.

const R2 = Math.SQRT2;
// A circle of area 1 has radius 1/sqrt(pi), so a container of radius R has
// scale R*sqrt(pi). Items here have diameter 1, i.e. radius 1/2.
const circleScale = (ratio) => Math.sqrt(Math.PI) * 0.5 * ratio;

export const CASES = [
  // --- unit squares in a square: s(n) is the side of the smallest such square
  { name: 'square in square n=4', item: 'square', container: 'rect', count: 4,
    target: 2, source: 'proven', tol: 0.25 },
  { name: 'square in square n=5', item: 'square', container: 'rect', count: 5,
    target: 2 + 1 / R2, source: 'proven', tol: 0.3 },
  { name: 'square in square n=9', item: 'square', container: 'rect', count: 9,
    target: 3, source: 'proven', tol: 0.3 },
  // Nontrivial rotated-square arrangement; see Stromquist (2003).
  { name: 'square in square n=10', item: 'square', container: 'rect', count: 10,
    target: 3 + 1 / R2, source: 'proven', tol: 0.35 },
  // The hard one. Six squares square to the walls around a band of five tilted
  // to a common angle; the trivial 4x4-grid-minus-one at side 4 is only 3.2%
  // worse and is a very deep local optimum, so this case measures whether the
  // search can leave a good arrangement for a better-shaped one.
  { name: 'square in square n=11', item: 'square', container: 'rect', count: 11,
    target: 3.877084, source: 'best known', tol: 1 },
  { name: 'square in square n=16', item: 'square', container: 'rect', count: 16,
    target: 4, source: 'proven', tol: 0.4 },

  // --- unit-diameter circles in a circle (Pirl; Packomania table); ratio is R/r
  ...[[2, 2], [3, 1 + 2 / Math.sqrt(3)], [4, 1 + R2],
      [5, 1 + Math.sqrt(2 * (1 + 1 / Math.sqrt(5)))], [6, 3], [7, 3],
      [8, 1 + 1 / Math.sin(Math.PI / 7)], [10, 3.813025631398124]].map(([n, ratio]) => ({
    name: `circle in circle n=${n}`, item: 'circle', container: 'circle',
    count: n, target: circleScale(ratio), source: 'proven', tol: 0.15,
  })),

  // --- unit squares in a circle. n=12 is the 4x4 block with its corners
  // removed, whose far corners sit at (2,1): circumradius sqrt(5). It is the
  // arrangement the eye finds immediately and the search does not, which makes
  // it a good probe of how well the search escapes a bad topology.
  { name: 'square in circle n=4', item: 'square', container: 'circle', count: 4,
    target: circleScale(2 * R2), source: 'best known', tol: 0.2 },
  { name: 'square in circle n=5', item: 'square', container: 'circle', count: 5,
    target: circleScale(Math.sqrt(10)), source: 'best known', tol: 0.2 },
  { name: 'square in circle n=12', item: 'square', container: 'circle', count: 12,
    target: circleScale(2 * Math.sqrt(5)), source: 'best known', tol: 0.6 },
];

// Sources are reference metadata only. The solver never receives targets or
// reference layouts. Perfect-square cases also follow directly from area plus
// a grid construction. Square-in-circle cases above are reference constructions,
// not claims that the cited arrangements have been proved optimal.
for (const c of CASES) {
  c.reference = c.container === 'circle' && c.item === 'circle'
    ? 'https://www.packomania.com/cci/'
    : c.container === 'circle'
      ? 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6394747/'
      : c.source === 'proven'
        ? 'https://www.combinatorics.org/ojs/index.php/eljc/article/view/v10i1r8'
        // Best known, not proved: Erich Friedman's squares-in-squares survey.
        : 'https://erich-friedman.github.io/packing/squinsqu/';
}
