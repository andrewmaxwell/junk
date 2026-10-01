// Loads and builds the viewer's data off the main thread: fetch, gunzip, decode textures, tessellate
// terrain and bake object placements into ready-to-draw arrays. The page only creates GPU objects.
// Requests: {id, kind: 'overview' | 'textures' | 'detail' | 'sky', url}. Replies: {id, progress} while
// downloading, then {id, result} or {id, error}. Typed arrays in results are transferred, not copied.

const SCALE = 1 / 1000;  // game units are tiny; keep numbers friendly for the GPU
const DETAIL_STEPS = 6;  // terrain tessellation near the camera
// Baked lighting is stored at half strength (128 = full brightness) and doubled when drawn.
// The doubling happens on gamma-encoded colours, which is about 2^2.2 in linear space.
const BAKED_GAIN = 2 ** 2.2;
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => (i /= 255) <= 0.04045 ? i / 12.92 : ((i + 0.055) / 1.055) ** 2.4);

let center = null, textureFlags = {};  // from the overview, needed by everything after it

onmessage = async ({ data: { id, kind, url } }) => {
  try {
    const pack = await load(url, progress => postMessage({ id, progress }));
    const result = kind === 'overview' ? buildOverview(pack) : kind === 'textures' ? decodeTextures(pack)
      // skies are domes the page draws around the camera, so they keep their own origin and units
      : kind === 'sky' ? buildDetail(pack, [0, 0, 0], 1) : buildDetail(pack, center, SCALE);
    const buffers = new Set();
    (function collect(v) {
      if (ArrayBuffer.isView(v)) buffers.add(v.buffer);
      else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    })(result);
    postMessage({ id, result }, [...buffers]);
  } catch (e) {
    postMessage({ id, error: String(e?.stack ?? e) });
  }
};

// ---------- packs: u32 header length, JSON {meta, sections}, 8-aligned binary sections, all gzipped ----------
async function load(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  const parts = [];
  let received = 0, lastReport = 0;
  for (const reader = res.body.getReader(); ;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.length;
    if (total && performance.now() - lastReport > 100) { lastReport = performance.now(); onProgress(received / total); }
  }
  let blob = new Blob(parts);
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b)  // unless a server already undid the gzip
    blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
  const buf = await blob.arrayBuffer();
  const headerLen = new DataView(buf).getUint32(0, true);
  const { meta, sections } = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)));
  const base = 4 + headerLen;
  const section = (name, Type = Uint8Array) => {
    const [off, len, width] = sections[name];
    if (!width) return new Type(buf.slice(base + off, base + off + len));
    // byte planes (all first bytes, then all second bytes, ...) back to whole numbers
    const src = new Uint8Array(buf, base + off, len), out = new Uint8Array(len), n = len / width;
    for (let k = 0; k < width; k++) for (let i = 0; i < n; i++) out[i * width + k] = src[k * n + i];
    return new Type(out.buffer);
  };
  return { meta, section };
}

// ---------- textures: BC1 (DXT1) or 8-bit indices with an RGBA palette -> RGBA ----------
function decodeTexture(bytes, [format, w, h, off, len, palOff = 0, palCount = 0]) {
  const out = new Uint8Array(w * h * 4);
  if (format === 'bc1') {
    const bw = (w + 3) >> 2, pal = new Uint8Array(16);
    for (let by = 0; by < (h + 3) >> 2; by++) for (let bx = 0; bx < bw; bx++) {
      const p = off + (by * bw + bx) * 8;
      const c0 = bytes[p] | bytes[p + 1] << 8, c1 = bytes[p + 2] | bytes[p + 3] << 8;
      rgb565(c0, pal, 0); rgb565(c1, pal, 4);
      for (let i = 0; i < 3; i++) {
        pal[8 + i] = c0 > c1 ? (2 * pal[i] + pal[4 + i]) / 3 : (pal[i] + pal[4 + i]) / 2;
        pal[12 + i] = c0 > c1 ? (pal[i] + 2 * pal[4 + i]) / 3 : 0;
      }
      pal[11] = 255; pal[15] = c0 > c1 ? 255 : 0;
      for (let r = 0; r < 4; r++) {
        const y = by * 4 + r, bits = bytes[p + 4 + r];
        if (y >= h) break;
        for (let c = 0; c < 4; c++) {
          const x = bx * 4 + c;
          if (x < w) out.set(pal.subarray((bits >> 2 * c & 3) * 4, (bits >> 2 * c & 3) * 4 + 4), (y * w + x) * 4);
        }
      }
    }
  } else {  // pal8
    const pal = new Uint8Array(1024);
    for (let i = 0; i < 256; i++) pal.set(i < palCount ? bytes.subarray(palOff + i * 4, palOff + i * 4 + 4) : [255, 0, 255, 255], i * 4);
    const pal32 = new Uint32Array(pal.buffer), out32 = new Uint32Array(out.buffer);
    for (let i = 0; i < w * h; i++) out32[i] = pal32[bytes[off + i]];
  }
  // how is alpha used? opaque, cut-out, or genuinely translucent
  let holes = 0, soft = 0;
  for (let i = 3; i < out.length; i += 4) {
    if (out[i] < 250) holes++;
    if (out[i] > 20 && out[i] < 235) soft++;
  }
  const mode = holes === 0 ? 'opaque' : soft > w * h * 0.25 ? 'blend' : 'cutout';
  return { w, h, rgba: out, mode };
}
function rgb565(c, out, o) {
  const r = c >> 11, g = (c >> 5) & 63, b = c & 31;
  out[o] = r << 3 | r >> 2; out[o + 1] = g << 2 | g >> 4; out[o + 2] = b << 3 | b >> 2; out[o + 3] = 255;
}

function decodeTextures({ meta, section }) {
  const bytes = section('textures');
  return Object.entries(meta.textures).map(([id, info]) => ({ id: +id, flags: textureFlags[id] ?? 0, ...decodeTexture(bytes, info) }));
}

// ---------- geometry helpers ----------
// game Z-up -> viewer Y-up, moved to an origin (in viewer axes) and scaled
const sceneTransform = (origin, scale) => (x, y, z, out, o) => {
  out[o] = (x - origin[0]) * scale; out[o + 1] = (z - origin[1]) * scale; out[o + 2] = (-y - origin[2]) * scale;
};
const indexArray = (n, maxVertex) => maxVertex > 65535 ? new Uint32Array(n) : new Uint16Array(n);

// area-weighted vertex normals, like three.js's computeVertexNormals
function normals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1;
    n[v] /= l; n[v + 1] /= l; n[v + 2] /= l;
  }
  return n;
}

// Bounding-volume hierarchy, so the page can raycast without testing every triangle. Each node
// splits its triangles at the middle of their centres' longest axis, down to 8 per leaf.
// bounds: 6 floats per node (min xyz, max xyz). nodes: 2 uints per node, [first, count] into
// order for a leaf, [right child, 0] for an inner node (its left child is the next node).
function buildBVH(pos, idx) {
  const n = idx.length / 3, order = new Uint32Array(n), cen = new Float32Array(n * 3);
  for (let t = 0; t < n; t++) {
    order[t] = t;
    for (let a = 0; a < 3; a++) cen[t * 3 + a] = (pos[idx[t * 3] * 3 + a] + pos[idx[t * 3 + 1] * 3 + a] + pos[idx[t * 3 + 2] * 3 + a]) / 3;
  }
  const bounds = [], nodes = [];
  (function build(first, count) {
    const node = nodes.length / 2, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const clo = [...lo], chi = [...hi];
    for (let i = first; i < first + count; i++) {
      const t = order[i];
      for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) {
        const v = pos[idx[t * 3 + k] * 3 + a];
        if (v < lo[a]) lo[a] = v;
        if (v > hi[a]) hi[a] = v;
      }
      for (let a = 0; a < 3; a++) { const c = cen[t * 3 + a]; if (c < clo[a]) clo[a] = c; if (c > chi[a]) chi[a] = c; }
    }
    bounds.push(...lo, ...hi);
    nodes.push(first, count);
    const axis = [0, 1, 2].reduce((m, a) => chi[a] - clo[a] > chi[m] - clo[m] ? a : m, 0);
    if (count <= 8 || chi[axis] === clo[axis]) return node;
    // partition around the middle; if everything lands on one side, split the count in half
    const mid = (clo[axis] + chi[axis]) / 2;
    let i = first, j = first + count - 1;
    while (i <= j) {
      if (cen[order[i] * 3 + axis] < mid) i++;
      else { const t = order[i]; order[i] = order[j]; order[j--] = t; }
    }
    const left = i - first > 0 && i - first < count ? i - first : count >> 1;
    build(first, left);
    nodes[node * 2] = build(first + left, count - left);
    nodes[node * 2 + 1] = 0;
    return node;
  })(0, n);
  return { bounds: new Float32Array(bounds), nodes: new Uint32Array(nodes), order };
}

// triangles for a patch grid of (steps+1)^2 points
function gridTriangles(steps) {
  const n = steps + 1, grid = [];
  for (let a = 0; a < steps; a++) for (let b = 0; b < steps; b++) {
    const i = a * n + b, j = i + n;
    grid.push(i, j, j + 1, i, j + 1, i + 1);
  }
  return grid;
}

// ---------- overview: every location at low detail, coloured like the game ----------
function buildOverview({ meta, section }) {
  center = meta.min.map((lo, a) => (lo + meta.max[a]) / 2);
  textureFlags = meta.textureFlags;
  const ovPos = section('pos', Int16Array), ovCol = section('col');
  const per = (meta.steps + 1) ** 2, grid = gridTriangles(meta.steps);
  let vert = 0;
  const locations = meta.locations.map(info => {
    if (!info.patches) return { info };
    const count = info.patches * per;
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) for (let a = 0; a < 3; a++) {
      const t = (ovPos[(vert + v) * 3 + a] + 32768) / 65535;
      pos[v * 3 + a] = (meta.min[a] + t * (meta.max[a] - meta.min[a]) - center[a]) * SCALE;
      col[v * 3 + a] = LINEAR[ovCol[(vert + v) * 3 + a]];
    }
    vert += count;
    const idx = indexArray(info.patches * grid.length, count);
    for (let p = 0; p < info.patches; p++) for (let i = 0; i < grid.length; i++) idx[p * grid.length + i] = grid[i] + p * per;
    return { info, pos, col, idx, normal: normals(pos, idx), bvh: buildBVH(pos, idx) };
  });
  return { locations, center, scale: SCALE, span: Math.max(...meta.max.map((hi, a) => hi - meta.min[a])) * SCALE };
}

// ---------- full detail for one location ----------
function buildDetail(pack, origin, scale) {
  const { meta, section } = pack;
  const toScene = sceneTransform(origin, scale);
  const lightmapBytes = section('lightmaps');
  const { atlases, place } = packLightmaps(meta.lightmaps.map(info => decodeTexture(lightmapBytes, info)));
  const textures = decodeTextures(pack);
  const meshes = [];  // {kind, texId, lightmap, pos, idx, normal, uv, uv1?, col?, ...inspector info}

  // terrain: tessellate the bicubic patches
  const coefs = section('coefs', Float32Array), patchUv = section('patchUv', Float32Array), patchLm = section('patchLm', Float32Array);
  const n = DETAIL_STEPS + 1, per = n * n, grid = gridTriangles(DETAIL_STEPS);
  const basis = [];  // u^i v^j for every grid point
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const s = a / DETAIL_STEPS, t = b / DETAIL_STEPS;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) basis.push(s ** i * t ** j);
  }
  // Patches come sorted by texture, then lightmap. With the lightmaps in atlases, consecutive runs
  // sharing a texture and an atlas draw as one mesh.
  const groups = [];
  let p0 = 0;
  for (const [texId, lmIndex, count] of meta.runs) {
    const atlas = place[lmIndex]?.atlas ?? -1, last = groups.at(-1);
    if (last && last.texId === texId && last.atlas === atlas) { last.runs.push([lmIndex, count]); last.count += count; }
    else groups.push({ texId, atlas, first: p0, count, runs: [[lmIndex, count]] });
    p0 += count;
  }
  for (const { texId, atlas, first, count, runs } of groups) {
    const pos = new Float32Array(count * per * 3), uv = new Float32Array(count * per * 2), uv1 = new Float32Array(count * per * 2);
    const idx = indexArray(count * grid.length, count * per);
    let k = 0;
    for (const [lmIndex, runCount] of runs) {
      const sheet = place[lmIndex];
      for (const end = k + runCount; k < end; k++) {
        const p = first + k, c = coefs.subarray(p * 48, p * 48 + 48);
        const cuv = patchUv.subarray(p * 8, p * 8 + 8), [lu, lv, lw, lh] = patchLm.subarray(p * 4, p * 4 + 4);
        for (let g = 0; g < per; g++) {
          let x = 0, y = 0, z = 0;
          for (let m = 0; m < 16; m++) { const w = basis[g * 16 + m]; x += c[m * 3] * w; y += c[m * 3 + 1] * w; z += c[m * 3 + 2] * w; }
          const v = k * per + g;
          toScene(x, y, z, pos, v * 3);
          // bilinear blend of the corner UVs: S(0,0), S(1,0), S(0,1), S(1,1)
          const s = Math.floor(g / n) / DETAIL_STEPS, tt = (g % n) / DETAIL_STEPS;
          const w0 = (1 - s) * (1 - tt), w1 = s * (1 - tt), w2 = (1 - s) * tt, w3 = s * tt;
          uv[v * 2] = cuv[0] * w0 + cuv[2] * w1 + cuv[4] * w2 + cuv[6] * w3;
          uv[v * 2 + 1] = cuv[1] * w0 + cuv[3] * w1 + cuv[5] * w2 + cuv[7] * w3;
          // the patch's first parameter runs along the lightmap's v axis; then into the atlas
          if (sheet) {
            uv1[v * 2] = sheet.u + (lu + tt * lw) * sheet.su;
            uv1[v * 2 + 1] = sheet.v + (lv + s * lh) * sheet.sv;
          }
        }
        for (let i = 0; i < grid.length; i++) idx[k * grid.length + i] = grid[i] + k * per;
      }
    }
    meshes.push({ kind: textureFlags[texId] & 1 ? 'helpers' : 'terrain', texId, lightmap: atlas, pos, idx, uv, uv1,
                  normal: normals(pos, idx), bvh: buildBVH(pos, idx), firstPatch: first, trisPerPatch: grid.length / 3 });
  }

  // objects: bake every placement into one mesh per (kind, texture)
  const verts = section('verts', Int16Array), uvs = section('uvs', Int16Array), cols = section('cols', Uint16Array);
  const tris = section('tris', Uint16Array), inst = section('inst', Float32Array), pools = section('colorPools');
  const meshStart = [];
  { let v = 0, t = 0;
    for (const [, models] of meta.models) meshStart.push(models.map(([, nv, nt]) => { const r = [v, t]; v += nv; t += nt; return r; })); }
  // model category from the export: 0 object, 1 flat backdrop panel, 2 placeholder (drawn by the
  // game some other way), 3 plain box (probably an invisible blocker)
  const kindOf = (category, texId) => category === 2 || textureFlags[texId] & 1 ? 'helpers'
    : category === 1 ? 'panels' : category === 3 ? 'blocks' : 'objects';
  const buckets = new Map();  // kind:texId -> {nv, nt, ...}
  for (let i = 0; i < meta.instances; i++) {  // pass 1: sizes
    const [category, models] = meta.models[inst[i * 15]];
    for (const [texId, nv, nt] of models) {
      const key = kindOf(category, texId) + ':' + texId;
      const b = buckets.get(key) ?? buckets.set(key, { nv: 0, nt: 0 }).get(key);
      b.nv += nv; b.nt += nt;
    }
  }
  for (const b of buckets.values()) {
    b.pos = new Float32Array(b.nv * 3); b.uv = new Float32Array(b.nv * 2); b.col = new Float32Array(b.nv * 3);
    b.idx = indexArray(b.nt * 3, b.nv); b.v = 0; b.t = 0;
    b.owners = [];  // first triangle, placement index, ... for the inspector
  }
  for (let i = 0; i < meta.instances; i++) {  // pass 2: fill
    const m = inst[i * 15], M = inst.subarray(i * 15 + 1, i * 15 + 13);  // rows of (c0, c1, c2)
    const pool = meta.pools[inst[i * 15 + 13]], colorBase = pool ? pool[0] + inst[i * 15 + 14] * 3 : -1;
    const [category, models] = meta.models[m];
    models.forEach(([texId, nv, nt, lx, ly, lz, sx, sy, sz], k) => {
      const b = buckets.get(kindOf(category, texId) + ':' + texId), [vs, ts] = meshStart[m][k];
      for (let v = 0; v < nv; v++) {
        const q = (vs + v) * 3;
        const x = lx + (verts[q] + 32768) * sx, y = ly + (verts[q + 1] + 32768) * sy, z = lz + (verts[q + 2] + 32768) * sz;
        const o = b.v + v;
        toScene(x * M[0] + y * M[3] + z * M[6] + M[9], x * M[1] + y * M[4] + z * M[7] + M[10],
                x * M[2] + y * M[5] + z * M[8] + M[11], b.pos, o * 3);
        b.uv[o * 2] = uvs[(vs + v) * 2] / 4096; b.uv[o * 2 + 1] = uvs[(vs + v) * 2 + 1] / 4096;
        if (colorBase < 0) { b.col.fill(1, o * 3, o * 3 + 3); continue; }
        const at = colorBase + cols[vs + v] * 3;
        for (let a = 0; a < 3; a++) b.col[o * 3 + a] = LINEAR[pools[at + a]] * BAKED_GAIN;
      }
      if (b.owners.at(-1) !== i) b.owners.push(b.t, i);
      for (let t = 0; t < nt * 3; t++) b.idx[b.t * 3 + t] = tris[ts * 3 + t] + b.v;
      b.v += nv; b.t += nt;
    });
  }
  for (const [key, b] of buckets) {
    const [kind, texId] = key.split(':');
    meshes.push({ kind, texId: +texId, lightmap: -1, pos: b.pos, idx: b.idx, uv: b.uv, col: b.col,
                  normal: normals(b.pos, b.idx), bvh: buildBVH(b.pos, b.idx), owners: Uint32Array.from(b.owners) });
  }
  const instModel = Uint32Array.from({ length: meta.instances }, (_, i) => inst[i * 15]);
  return { lightmaps: atlases, textures, meshes,
           ids: { patchRid: section('patchRid', Uint32Array), instRid: section('instRid', Uint32Array), modelKeys: meta.modelKeys, instModel } };
}

// Lightmap sheets packed into atlases of at most 2048 px (a size every WebGL 2 device supports),
// so terrain that shares a texture can draw as one mesh whatever sheet each patch uses. Each sheet
// gets a 1-texel border copied from its own edge, so filtering never picks up a neighbour.
// -> {atlases: [{w, h, rgba}], place: per sheet {atlas, u, v, su, sv}: atlas uv = (u + lu * su, v + lv * sv)}
function packLightmaps(sheets) {
  if (!sheets.length) return { atlases: [], place: [] };
  const cell = Math.max(...sheets.map(s => Math.max(s.w, s.h))) + 2;
  const perRow = Math.max(1, Math.floor(2048 / cell)), perAtlas = perRow * perRow;
  const atlases = [], place = [];
  for (let start = 0; start < sheets.length; start += perAtlas) {
    const group = sheets.slice(start, start + perAtlas);
    const cols = Math.min(perRow, Math.ceil(Math.sqrt(group.length))), rows = Math.ceil(group.length / cols);
    const W = cols * cell, H = rows * cell, rgba = new Uint8Array(W * H * 4);
    group.forEach(({ w, h, rgba: src }, i) => {
      const ox = (i % cols) * cell + 1, oy = Math.floor(i / cols) * cell + 1;
      for (let y = -1; y <= h; y++) {
        const sy = Math.min(h - 1, Math.max(0, y)), row = ((oy + y) * W + ox) * 4;
        rgba.set(src.subarray(sy * w * 4, (sy + 1) * w * 4), row);
        rgba.set(src.subarray(sy * w * 4, sy * w * 4 + 4), row - 4);
        rgba.set(src.subarray((sy + 1) * w * 4 - 4, (sy + 1) * w * 4), row + w * 4);
      }
      place.push({ atlas: atlases.length, u: ox / W, v: oy / H, su: w / W, sv: h / H });
    });
    atlases.push({ w: W, h: H, rgba, mode: 'opaque' });
  }
  return { atlases, place };
}
