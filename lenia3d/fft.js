// A 3D FFT done one axis at a time: each workgroup transforms a few whole
// lines of N values along one axis, in shared memory (radix 2, so N is a power
// of two). Dispatch with runFft's sizes: (N / LINES, N) workgroups.
export const fftLines = (N) => Math.max(1, 512 / N);

export const fftShader = (N) => /* wgsl */ `
struct FftParams { axis: u32, inverse: u32 }
@group(0) @binding(0) var<storage, read_write> data: array<vec2f>;
@group(0) @binding(1) var<uniform> fp: FftParams;

const N = ${N}u;
const LOG_N = ${Math.log2(N)}u;
const LINES = ${fftLines(N)}u;
var<workgroup> buf: array<vec2f, N * LINES>;
// the N/2 roots of unity the butterflies need, worked out once per workgroup
var<workgroup> twiddle: array<vec2f, N / 2u>;

fn cellIndex(a: u32, b: u32, i: u32) -> u32 {
  if (fp.axis == 0u) { return i + a * N + b * N * N; }
  if (fp.axis == 1u) { return a + i * N + b * N * N; }
  return a + b * N + i * N * N;
}

@compute @workgroup_size(${N / 2}, ${fftLines(N)})
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let t = lid.x;
  let line = wg.x * LINES + lid.y;
  let base = lid.y * N;
  for (var j = 0u; j < 2u; j++) {
    let i = t + j * N / 2u;
    buf[base + (reverseBits(i) >> (32u - LOG_N))] = data[cellIndex(line, wg.y, i)];
  }
  let sign = select(-1.0, 1.0, fp.inverse == 1u);
  if (lid.y == 0u) {
    let angle = sign * 6.28318530717959 * f32(t) / f32(N);
    twiddle[t] = vec2f(cos(angle), sin(angle));
  }
  workgroupBarrier();

  for (var h = 1u; h < N; h *= 2u) {
    let k = t % h;
    let i0 = base + (t / h) * 2u * h + k;
    let w = twiddle[k * (N / (2u * h))];
    let u = buf[i0];
    let v = buf[i0 + h];
    let vw = vec2f(v.x * w.x - v.y * w.y, v.x * w.y + v.y * w.x);
    buf[i0] = u + vw;
    buf[i0 + h] = u - vw;
    workgroupBarrier();
  }

  let scale = select(1.0, 1.0 / f32(N), fp.inverse == 1u);
  for (var j = 0u; j < 2u; j++) {
    let i = t + j * N / 2u;
    data[cellIndex(line, wg.y, i)] = buf[base + i] * scale;
  }
}`;
