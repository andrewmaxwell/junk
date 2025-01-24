const div = (a, n) => Math.round(a / 10 ** n);

const getColor = (x, y) => {
  let u = x - 36;
  let v = 18 - y;
  let h = u * u + v * v;
  let R, G, B;
  if (h < 200) {
    R = 420;
    B = 520;
    let t = 5000 + 8 * h;
    let p = div(t * u, 2);
    let q = div(t * v, 2);
    let s = 2 * q;
    let w = div(1000 + p - s, 2) + 8;
    if (w > 0) R = R + w * w;
    let o = s + 2200;
    R = div(R * o, 4);
    B = div(B * o, 4);
    if (p > -q) {
      w = div(p + q, 1);
      R += w;
      B += w;
    }
  } else if (v < 0) {
    R = 150 * 2 * v;
    B = 50;
    let p = h + 8 * v * v;
    let c = 240 * -v - p;
    if (c > 1200) {
      let o = div(6 * c, 1);
      o = c * (1500 - o);
      o = div(o, 2) - 8360;
      R = div(R * o, 3);
      B = div(B * o, 3);
    }
    let r = c + u * v;
    let d = 3200 - h - 2 * r;
    if (d > 0) R += d;
  } else {
    let c = x + 4 * y;
    R = 132 + c;
    B = 192 + c;
  }
  if (R > 255) R = 255;
  if (B > 255) B = 255;
  G = div(4 * R + 3 * B, 1);
  return [R, G, B];
};
