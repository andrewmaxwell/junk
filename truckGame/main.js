const W = 1200;
const H = 800;
const ROUND_TIME = 120;
const CAPACITY = 6;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let scale = 1;
const resize = () => {
  scale = Math.min(innerWidth / W, innerHeight / H);
  canvas.width = W * scale * devicePixelRatio;
  canvas.height = H * scale * devicePixelRatio;
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  canvas.style.marginTop = `${(innerHeight - H * scale) / 2}px`;
};
addEventListener('resize', resize);
resize();

const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  audio?.resume();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (
    (e.code === 'Space' || e.code === 'Enter') &&
    state !== 'play' &&
    Date.now() - endedAt > 800
  )
    start();
});
addEventListener('keyup', (e) => (keys[e.code] = false));

// --- sound ---
let audio;
const beep = (freq, dur = 0.1, type = 'square', vol = 0.08, slide = 0) => {
  audio ??= new AudioContext();
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, audio.currentTime);
  if (slide)
    o.frequency.exponentialRampToValueAtTime(
      freq * slide,
      audio.currentTime + dur,
    );
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + dur);
};

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- level ---
const dump = {x: 30, y: 30, w: 190, h: 140};
const buildings = [
  {x: 330, y: 140, w: 170, h: 120, c: '#b5654a'},
  {x: 640, y: 90, w: 130, h: 170, c: '#5a7fa8'},
  {x: 920, y: 160, w: 190, h: 110, c: '#c9a24a'},
  {x: 160, y: 380, w: 140, h: 150, c: '#7d6aa3'},
  {x: 470, y: 420, w: 240, h: 110, c: '#4f9a7a'},
  {x: 860, y: 430, w: 120, h: 170, c: '#b5654a'},
  {x: 330, y: 640, w: 160, h: 100, c: '#c9a24a'},
  {x: 660, y: 660, w: 120, h: 100, c: '#5a7fa8'},
  {x: 1050, y: 620, w: 110, h: 140, c: '#7d6aa3'},
];
const trees = [
  {x: 560, y: 300, r: 22},
  {x: 820, y: 330, r: 26},
  {x: 260, y: 290, r: 20},
  {x: 1120, y: 380, r: 24},
  {x: 90, y: 640, r: 26},
  {x: 580, y: 610, r: 20},
  {x: 1000, y: 70, r: 22},
];

const insideRect = (p, r, pad = 0) =>
  p.x > r.x - pad &&
  p.x < r.x + r.w + pad &&
  p.y > r.y - pad &&
  p.y < r.y + r.h + pad;
const blocked = (p, pad) =>
  p.x < pad ||
  p.y < pad ||
  p.x > W - pad ||
  p.y > H - pad ||
  buildings.some((b) => insideRect(p, b, pad)) ||
  trees.some((t) => dist(p, t) < t.r + pad);

// push a circle out of buildings, trees and walls; returns true if it hit something
const collide = (o, r) => {
  let hit = false;
  for (const b of buildings) {
    const cx = clamp(o.x, b.x, b.x + b.w);
    const cy = clamp(o.y, b.y, b.y + b.h);
    const dx = o.x - cx;
    const dy = o.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < r) {
      const nx = d ? dx / d : 0;
      const ny = d ? dy / d : -1;
      o.x = cx + nx * r;
      o.y = cy + ny * r;
      const vn = o.vx * nx + o.vy * ny;
      if (vn < 0) {
        o.vx -= 1.5 * vn * nx;
        o.vy -= 1.5 * vn * ny;
      }
      hit = true;
    }
  }
  for (const t of trees) {
    const d = dist(o, t);
    if (d < r + t.r) {
      const nx = (o.x - t.x) / d;
      const ny = (o.y - t.y) / d;
      o.x = t.x + nx * (r + t.r);
      o.y = t.y + ny * (r + t.r);
      const vn = o.vx * nx + o.vy * ny;
      if (vn < 0) {
        o.vx -= 1.5 * vn * nx;
        o.vy -= 1.5 * vn * ny;
      }
      hit = true;
    }
  }
  if (o.x < r || o.x > W - r) {
    o.x = clamp(o.x, r, W - r);
    o.vx *= -0.5;
    hit = true;
  }
  if (o.y < r || o.y > H - r) {
    o.y = clamp(o.y, r, H - r);
    o.vy *= -0.5;
    hit = true;
  }
  return hit;
};

// --- background, drawn once ---
const bg = document.createElement('canvas');
bg.width = W;
bg.height = H;
{
  const g = bg.getContext('2d');
  g.fillStyle = '#4a4d48';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${rand(0.02, 0.06)})`;
    g.fillRect(rand(0, W), rand(0, H), 3, 3);
  }
  // sidewalks around buildings
  for (const b of buildings) {
    g.fillStyle = '#8a8a80';
    g.fillRect(b.x - 14, b.y - 14, b.w + 28, b.h + 28);
  }
  // lane dashes
  g.strokeStyle = '#d8c25a';
  g.lineWidth = 4;
  g.setLineDash([24, 22]);
  for (const y of [325, 590]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  for (const x of [580, 820]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  g.setLineDash([]);
  // dump
  g.fillStyle = '#5b4a33';
  g.fillRect(dump.x, dump.y, dump.w, dump.h);
  g.strokeStyle = '#f2c230';
  g.lineWidth = 6;
  g.setLineDash([18, 12]);
  g.strokeRect(dump.x, dump.y, dump.w, dump.h);
  g.setLineDash([]);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = ['#6d5a3e', '#3f3424', '#7a6a4a', '#556b2f'][i % 4];
    g.beginPath();
    g.arc(
      rand(dump.x + 20, dump.x + dump.w - 20),
      rand(dump.y + 20, dump.y + dump.h - 20),
      rand(4, 12),
      0,
      7,
    );
    g.fill();
  }
  g.fillStyle = '#f2c230';
  g.font = 'bold 22px Trebuchet MS';
  g.textAlign = 'center';
  g.fillText('DUMP HERE', dump.x + dump.w / 2, dump.y + dump.h / 2 + 8);
}

// --- game state ---
let state = 'title';
let endedAt = 0;
let truck,
  trash,
  soapMen,
  puddles,
  particles,
  texts,
  score,
  time,
  shake,
  combo,
  best;
try {
  best = +localStorage.getItem('truckGameBest') || 0;
} catch {
  best = 0;
}

const freeSpot = (pad) => {
  for (;;) {
    const p = {x: rand(pad, W - pad), y: rand(pad, H - pad)};
    if (!blocked(p, pad) && !insideRect(p, dump, 40)) return p;
  }
};

const spawnTrash = () => {
  const p = freeSpot(30);
  const golden = Math.random() < 0.12;
  trash.push({...p, born: time, golden, wobble: rand(0, 6)});
};

const spawnSoapMan = () => {
  // walk in from an edge far from the truck
  let p;
  do {
    p = freeSpot(30);
  } while (dist(p, truck) < 400);
  soapMen.push({
    ...p,
    vx: 0,
    vy: 0,
    stun: 0,
    dropT: rand(1, 3),
    speed: rand(75, 105),
    step: 0,
  });
  floatText(p.x, p.y - 30, 'A SOAP MAN APPEARS', '#9fe7ff');
};

const start = () => {
  state = 'play';
  truck = {x: 125, y: 230, vx: 0, vy: 0, a: 0, load: [], spin: 0};
  trash = [];
  soapMen = [];
  puddles = [];
  particles = [];
  texts = [];
  score = 0;
  time = 0;
  shake = 0;
  combo = 0;
  for (let i = 0; i < 9; i++) spawnTrash();
  spawnSoapMan();
  beep(330, 0.1);
  setTimeout(() => beep(495, 0.15), 100);
};

const floatText = (x, y, s, color = '#fff', size = 22) =>
  texts.push({x, y, s, color, size, t: 0});
const bubbles = (x, y, n, spread = 1) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 7);
    const v = rand(20, 120) * spread;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: rand(3, 9),
      life: rand(0.6, 1.4),
      t: 0,
      kind: 'bubble',
    });
  }
};
const debris = (x, y, n) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 7);
    const v = rand(60, 260);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: rand(3, 7),
      life: rand(0.4, 0.9),
      t: 0,
      kind: 'junk',
      c: ['#3a3a3a', '#6b8e23', '#8b5a2b', '#ddd'][i % 4],
    });
  }
};

// bag value decays the longer it sits on the street
const bagValue = (b) =>
  Math.round(Math.max(10, 100 - (time - b.born) * 3) * (b.golden ? 3 : 1));

const update = (dt) => {
  time += dt;
  if (time >= ROUND_TIME) {
    state = 'over';
    endedAt = Date.now();
    if (score > best) {
      best = score;
      try {
        localStorage.setItem('truckGameBest', best);
      } catch {
        // private mode, no storage
      }
    }
    beep(400, 0.2, 'sawtooth', 0.08, 0.3);
    return;
  }

  // --- truck ---
  const t = truck;
  const up = keys.ArrowUp || keys.KeyW;
  const down = keys.ArrowDown || keys.KeyS;
  const left = keys.ArrowLeft || keys.KeyA;
  const right = keys.ArrowRight || keys.KeyD;
  const fx = Math.cos(t.a);
  const fy = Math.sin(t.a);
  const fwd = t.vx * fx + t.vy * fy;
  const slick = puddles.some((p) => dist(p, t) < p.r + 10);
  const heavy = 1 - t.load.length * 0.05;
  const accel = (up ? 520 : 0) - (down ? 380 : 0);
  t.vx += fx * accel * heavy * dt;
  t.vy += fy * accel * heavy * dt;
  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  t.a += steer * clamp(fwd / 140, -1, 1) * 3.2 * dt + t.spin * dt;
  t.spin *= Math.exp(-2 * dt);
  // split velocity into forward and sideways; sideways grip is what makes it a truck, not a hockey puck
  const nfx = Math.cos(t.a);
  const nfy = Math.sin(t.a);
  let f = t.vx * nfx + t.vy * nfy;
  let s = -t.vx * nfy + t.vy * nfx;
  s *= Math.exp(-(slick ? 0.4 : 9) * dt);
  f *= Math.exp(-(slick ? 0.2 : 1.1) * dt);
  f = clamp(f, -200, 360);
  t.vx = f * nfx - s * nfy;
  t.vy = f * nfy + s * nfx;
  t.x += t.vx * dt;
  t.y += t.vy * dt;
  const speedBefore = Math.hypot(t.vx, t.vy);
  if (collide(t, 24) && speedBefore > 150) {
    shake = Math.min(12, speedBefore / 30);
    beep(90, 0.12, 'square', 0.1);
    if (t.load.length && speedBefore > 250) {
      // big crash spills a bag
      const b = t.load.pop();
      const p = freeSpot(30);
      trash.push({...p, born: b.born, golden: b.golden, wobble: 0});
      floatText(t.x, t.y - 30, 'SPILLED!', '#ff9a5a');
      debris(t.x, t.y, 12);
    }
  }
  if (slick && Math.random() < 0.4) bubbles(t.x, t.y, 1, 0.4);

  // pick up trash
  for (let i = trash.length - 1; i >= 0; i--) {
    const b = trash[i];
    if (dist(b, t) < 34) {
      if (t.load.length >= CAPACITY) {
        if (!b.warned) floatText(t.x, t.y - 34, 'TRUCK FULL!', '#ff6b6b');
        b.warned = true;
        continue;
      }
      trash.splice(i, 1);
      t.load.push(b);
      debris(b.x, b.y, 6);
      beep(500 + t.load.length * 80, 0.07, 'square', 0.06);
      floatText(
        b.x,
        b.y - 20,
        `+bag (${bagValue(b)})`,
        b.golden ? '#ffd84a' : '#cfe8a8',
        16,
      );
    }
  }
  while (trash.length < 9) spawnTrash();

  // dump
  if (t.load.length && insideRect(t, dump)) {
    const n = t.load.length;
    let pts = t.load.reduce((sum, b) => sum + bagValue(b), 0);
    let label = `+${pts}`;
    if (n === CAPACITY) {
      pts *= 2;
      label = `FULL LOAD x2! +${pts}`;
    }
    combo++;
    if (combo > 1) {
      pts += combo * 20;
      label += `  streak +${combo * 20}`;
    }
    score += pts;
    t.load = [];
    floatText(dump.x + dump.w / 2, dump.y + dump.h + 30, label, '#ffd84a', 28);
    debris(t.x, t.y, 30);
    shake = 6;
    [523, 659, 784, 1047].forEach((fq, i) =>
      setTimeout(() => beep(fq, 0.12, 'triangle', 0.1), i * 70),
    );
  }

  // --- soap men ---
  const wanted = 1 + Math.floor(time / 20);
  if (soapMen.length < wanted) spawnSoapMan();
  for (const m of soapMen) {
    if (m.stun > 0) {
      m.stun -= dt;
      m.vx *= Math.exp(-3 * dt);
      m.vy *= Math.exp(-3 * dt);
    } else {
      // chase where the truck is going, not where it is
      const tx = t.x + t.vx * 0.5 - m.x;
      const ty = t.y + t.vy * 0.5 - m.y;
      const d = Math.hypot(tx, ty) || 1;
      const sp = m.speed * (1 + time / ROUND_TIME);
      m.vx += ((tx / d) * sp - m.vx) * 3 * dt;
      m.vy += ((ty / d) * sp - m.vy) * 3 * dt;
      m.step += dt * 10;
      m.dropT -= dt;
      if (m.dropT <= 0) {
        m.dropT = rand(1.5, 3);
        puddles.push({x: m.x, y: m.y, r: rand(26, 40), t: 0, life: 9});
        bubbles(m.x, m.y, 5);
      }
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    collide(m, 14);

    const d = dist(m, t);
    if (d < 36 && m.stun <= 0) {
      const sp = Math.hypot(t.vx, t.vy);
      const nx = (m.x - t.x) / d;
      const ny = (m.y - t.y) / d;
      if (sp > 170) {
        // bowled over
        m.vx = nx * sp * 1.4;
        m.vy = ny * sp * 1.4;
        m.stun = 3;
        score += 15;
        bubbles(m.x, m.y, 30, 1.6);
        floatText(m.x, m.y - 30, 'SPLOOSH! +15', '#9fe7ff');
        beep(200, 0.25, 'sine', 0.12, 3);
        shake = 5;
      } else {
        // he scrubs your trash away
        m.vx = nx * 200;
        m.vy = ny * 200;
        m.stun = 1.5;
        t.vx -= nx * 150;
        t.vy -= ny * 150;
        t.spin = rand(-4, 4);
        bubbles(t.x, t.y, 20);
        if (t.load.length) {
          t.load.pop();
          combo = 0;
          floatText(t.x, t.y - 30, 'SCRUBBED! -1 bag', '#9fe7ff');
        } else floatText(t.x, t.y - 30, 'SO CLEAN!', '#9fe7ff');
        beep(900, 0.3, 'sine', 0.08, 0.4);
      }
    }
  }

  for (let i = puddles.length - 1; i >= 0; i--) {
    puddles[i].t += dt;
    if (puddles[i].t > puddles[i].life) puddles.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-3 * dt);
    p.vy *= Math.exp(-3 * dt);
    if (p.kind === 'bubble') p.vy -= 20 * dt;
    if (p.t > p.life) particles.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    texts[i].t += dt;
    texts[i].y -= 30 * dt;
    if (texts[i].t > 1.5) texts.splice(i, 1);
  }
  shake *= Math.exp(-8 * dt);
};

// --- drawing ---
const drawTrash = (b) => {
  const v = bagValue(b) / (b.golden ? 3 : 1);
  const bob = Math.sin(time * 3 + b.wobble) * 2;
  ctx.save();
  ctx.translate(b.x, b.y + bob);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 14 - bob, 14, 5, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = b.golden
    ? '#e8b923'
    : v > 60
      ? '#2a2a2a'
      : v > 30
        ? '#3d3420'
        : '#4d3a1a';
  ctx.beginPath();
  ctx.arc(0, 2, 13, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.lineTo(0, -16);
  ctx.lineTo(5, -8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(-4, -2, 4, 0, 7);
  ctx.fill();
  // flies get worse as it ages
  const flies = v > 70 ? 0 : v > 40 ? 2 : 4;
  ctx.fillStyle = '#111';
  for (let i = 0; i < flies; i++) {
    const a = time * 6 + i * 2;
    ctx.fillRect(Math.cos(a) * 18 - 1, Math.sin(a * 1.3) * 12 - 10, 3, 3);
  }
  ctx.restore();
  // value tag
  ctx.fillStyle = b.golden
    ? '#ffd84a'
    : v > 60
      ? '#b8f08a'
      : v > 30
        ? '#f0d88a'
        : '#f09a8a';
  ctx.font = 'bold 12px Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.fillText(bagValue(b), b.x, b.y - 22 + bob);
};

const drawTruck = (t) => {
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.a);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-30, -15, 62, 34);
  // wheels
  ctx.fillStyle = '#111';
  for (const [wx, wy] of [
    [-20, -17],
    [-20, 13],
    [16, -17],
    [16, 13],
  ])
    ctx.fillRect(wx, wy, 12, 5);
  // bin
  ctx.fillStyle = '#2f8a3f';
  ctx.fillRect(-32, -15, 44, 30);
  ctx.fillStyle = '#257033';
  for (let i = 0; i < 4; i++) ctx.fillRect(-28 + i * 10, -15, 3, 30);
  // load poking out
  for (let i = 0; i < t.load.length; i++) {
    ctx.fillStyle = t.load[i].golden ? '#e8b923' : '#222';
    ctx.beginPath();
    ctx.arc(-24 + (i % 3) * 13, i < 3 ? -6 : 6, 6, 0, 7);
    ctx.fill();
  }
  // cab
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(13, -14, 18, 28);
  ctx.fillStyle = '#6fb7e8';
  ctx.fillRect(24, -11, 6, 22);
  ctx.fillStyle = '#ffec7a';
  ctx.fillRect(30, -13, 3, 5);
  ctx.fillRect(30, 8, 3, 5);
  // flashing light
  if (Math.sin(time * 12) > 0) {
    ctx.fillStyle = '#ffa020';
    ctx.beginPath();
    ctx.arc(18, 0, 4, 0, 7);
    ctx.fill();
  }
  ctx.restore();
};

const drawSoapMan = (m) => {
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 14, 5, 0, 0, 7);
  ctx.fill();
  if (m.stun > 0) ctx.rotate(Math.sin(time * 20) * 0.4);
  const legs = Math.sin(m.step) * 5;
  ctx.strokeStyle = '#e8f6ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-5, 8);
  ctx.lineTo(-6 + legs, 17);
  ctx.moveTo(5, 8);
  ctx.lineTo(6 - legs, 17);
  ctx.stroke();
  // bar-of-soap body
  ctx.fillStyle = '#ff9ed2';
  ctx.beginPath();
  ctx.roundRect(-13, -14, 26, 24, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-9, -11, 10, 4);
  // face
  ctx.fillStyle = '#222';
  if (m.stun > 0) {
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x  x', 0, -1);
  } else {
    ctx.fillRect(-6, -5, 3, 3);
    ctx.fillRect(3, -5, 3, 3);
    ctx.fillRect(-4, 2, 8, 2);
  }
  // sponge in hand
  ctx.fillStyle = '#ffe14a';
  ctx.fillRect(12, -4 + legs * 0.5, 9, 7);
  // halo of bubbles
  ctx.strokeStyle = 'rgba(200,240,255,0.8)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = time * 2 + i * 2.1;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 20, -18 + Math.sin(a) * 6, 3 + i, 0, 7);
    ctx.stroke();
  }
  ctx.restore();
};

const drawPuddle = (p) => {
  const fade = Math.min(1, p.t * 3, (p.life - p.t) / 1.5);
  ctx.globalAlpha = fade * 0.75;
  ctx.fillStyle = '#bfe9ff';
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = p.r * (0.85 + 0.15 * Math.sin(a * 3 + p.x));
    ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.75);
  }
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(
      p.x + Math.cos(i * 1.7 + p.t) * p.r * 0.5,
      p.y + Math.sin(i * 2.3) * p.r * 0.35,
      3 + (i % 3),
      0,
      7,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const drawBuilding = (b) => {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(b.x + 10, b.y + 10, b.w, b.h);
  ctx.fillStyle = b.c;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let x = b.x + 15; x < b.x + b.w - 20; x += 34)
    for (let y = b.y + 15; y < b.y + b.h - 25; y += 30)
      ctx.fillRect(x, y, 18, 12);
};

const drawTree = (tr) => {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(tr.x + 6, tr.y + 6, tr.r, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#2f6b2f';
  ctx.beginPath();
  ctx.arc(tr.x, tr.y, tr.r, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#3f8a3a';
  ctx.beginPath();
  ctx.arc(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, tr.r * 0.55, 0, 7);
  ctx.fill();
};

const centerText = (s, y, size, color = '#fff') => {
  ctx.font = `bold ${size}px Trebuchet MS`;
  ctx.textAlign = 'center';
  ctx.lineWidth = size / 6;
  ctx.strokeStyle = '#000';
  ctx.strokeText(s, W / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(s, W / 2, y);
};

const draw = () => {
  ctx.setTransform(
    scale * devicePixelRatio,
    0,
    0,
    scale * devicePixelRatio,
    0,
    0,
  );
  if (shake > 0.3) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  ctx.drawImage(bg, 0, 0);
  if (!truck) {
    centerText('TRASH DASH', 330, 90, '#7ee05a');
    centerText('Press SPACE to start', 420, 30);
    return;
  }

  for (const p of puddles) drawPuddle(p);
  if (truck.load.length) {
    // pulse the dump when carrying
    ctx.strokeStyle = `rgba(255,216,74,${0.4 + 0.4 * Math.sin(time * 6)})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(dump.x - 6, dump.y - 6, dump.w + 12, dump.h + 12);
  }
  for (const b of trash) drawTrash(b);
  drawTruck(truck);
  for (const m of soapMen) drawSoapMan(m);
  for (const b of buildings) drawBuilding(b);
  for (const tr of trees) drawTree(tr);

  for (const p of particles) {
    const a = 1 - p.t / p.life;
    if (p.kind === 'bubble') {
      ctx.strokeStyle = `rgba(220,245,255,${a})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.stroke();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      ctx.globalAlpha = 1;
    }
  }
  for (const tx of texts) {
    ctx.globalAlpha = Math.min(1, 2 * (1.5 - tx.t));
    ctx.font = `bold ${tx.size}px Trebuchet MS`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000';
    ctx.strokeText(tx.s, tx.x, tx.y);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.s, tx.x, tx.y);
    ctx.globalAlpha = 1;
  }

  // HUD
  ctx.setTransform(
    scale * devicePixelRatio,
    0,
    0,
    scale * devicePixelRatio,
    0,
    0,
  );
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 300, 10, 290, 92);
  ctx.textAlign = 'left';
  ctx.font = 'bold 26px Trebuchet MS';
  ctx.fillStyle = '#ffd84a';
  ctx.fillText(`SCORE ${score}`, W - 288, 42);
  const left = Math.max(0, ROUND_TIME - time);
  ctx.fillStyle = left < 15 && Math.sin(time * 10) > 0 ? '#ff5a5a' : '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(
    `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`,
    W - 20,
    42,
  );
  ctx.textAlign = 'left';
  ctx.font = '16px Trebuchet MS';
  ctx.fillStyle = '#ccc';
  ctx.fillText(`LOAD`, W - 288, 78);
  for (let i = 0; i < CAPACITY; i++) {
    ctx.fillStyle =
      i < truck.load.length
        ? truck.load[i].golden
          ? '#e8b923'
          : '#7ee05a'
        : '#444';
    ctx.fillRect(W - 240 + i * 26, 64, 22, 18);
  }
  ctx.fillStyle = '#ccc';
  ctx.textAlign = 'right';
  ctx.fillText(combo > 1 ? `streak ${combo}` : `best ${best}`, W - 20, 78);

  if (state === 'title') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    centerText('TRASH DASH', 250, 96, '#7ee05a');
    centerText(
      'Arrows / WASD to drive. Grab bags, haul them to the DUMP.',
      340,
      24,
    );
    centerText(
      'Bags lose value the longer they sit. Gold bags are worth triple.',
      375,
      24,
    );
    centerText(`Fill all ${CAPACITY} slots for a x2 FULL LOAD bonus.`, 410, 24);
    centerText(
      'SOAP MEN scrub your trash away and leave slippery puddles.',
      460,
      24,
      '#9fe7ff',
    );
    centerText(
      'Ram them at full speed to send them flying!',
      495,
      24,
      '#9fe7ff',
    );
    centerText('Press SPACE to start', 590, 34, '#ffd84a');
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, H);
    centerText("TIME'S UP!", 280, 90, '#ff9a5a');
    centerText(`SCORE ${score}`, 380, 56, '#ffd84a');
    centerText(
      score >= best && score > 0 ? 'NEW BEST!' : `best ${best}`,
      440,
      30,
    );
    centerText('Press SPACE to play again', 560, 30);
  }
};

let last = performance.now();
const frame = (now) => {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (state === 'play') update(dt);
  draw();
  requestAnimationFrame(frame);
};

// show the town behind the title screen
start();
state = 'title';
requestAnimationFrame(frame);
