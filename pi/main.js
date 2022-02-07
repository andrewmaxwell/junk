const ZOOM_SMOOTHING = 32;
const NUM_COLORS = 64;

const canvas = document.querySelector('canvas');
const W = (canvas.width = innerWidth);
const H = (canvas.height = innerHeight);
const ctx = canvas.getContext('2d');
let scale = 1;

const draw = (arr, spread) => {
  let x = 0;
  let y = 0;
  let a = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const coords = [{x, y}];
  for (const v of arr) {
    a += v * spread;
    x += Math.cos(a);
    y += Math.sin(a);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    coords.push({x, y});
  }

  const targetScale = Math.min(W / (maxX - minX), H / (maxY - minY));
  scale += (targetScale - scale) / ZOOM_SMOOTHING;
  const translateX = (W - (maxX - minX) * scale) / 2;
  const translateY = (H - (maxY - minY) * scale) / 2;

  const segSize = Math.floor(coords.length / NUM_COLORS);
  let px, py;
  for (let i = 0; i < NUM_COLORS; i++) {
    ctx.strokeStyle = `hsl(${30 + 200 * (i / NUM_COLORS)}, 100%, 80%)`;
    ctx.beginPath();
    if (i) ctx.moveTo(px, py);
    for (let j = Math.floor(i * segSize); j < (i + 1) * segSize; j++) {
      const c = coords[j];
      px = (c.x - minX) * scale + translateX;
      py = (c.y - minY) * scale + translateY;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
};

if (!location.search)
  location.href =
    '?3.141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067982148086513282306647093844609550582231725359408128481117450284102701938521105559644622948954930381964428810975665933446128475648233786783165271201909145648566923460348610454326648213393607260249141273724587006606315588174881520920962829254091715364367892590360011330530548820466521384146951941511609433057270365759591953092186117381932611793105118548074462379962749567351885752724891227938183011949129833673362440656643086021394946395224737190702179860943702770539217176293176752384674818467669405132000568127145263560827785771342757789609173637178721468440901224953430146549585371050792279689258923542019956112129021960864034418159813629774771309960518707211349999998372978049951059731732816096318595024459455346908302642522308253344685035261931188171010003137838752886587533208381420617177669147303598253490428755468731159562863882353787593751957781857780532171226806613001927876611195909216420198';

const arr = [...location.search.replace(/[^\d]/g, '')].map(
  (s) => (Number(s) + 0.5) / 10 - 0.5
);
const speed = 1 / arr.length;
let spread = 0;

const loop = () => {
  draw(arr, spread);
  spread += speed;
  requestAnimationFrame(loop);
};

loop();

setInterval(() => {
  ctx.globalAlpha = 1 / 64;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}, 100);
