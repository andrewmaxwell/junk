// A 3D FFT done one axis at a time: one workgroup transforms a whole line of N
// values along one axis, in shared memory (radix 2, so N is a power of two).
export const fftShader = (N) => /* wgsl */ `
struct FftParams { axis: u32, inverse: u32 }
@group(0) @binding(0) var<storage, read_write> data: array<vec2f>;
@group(0) @binding(1) var<uniform> fp: FftParams;

const N = ${N}u;
const LOG_N = ${Math.log2(N)}u;
var<workgroup> buf: array<vec2f, N>;

fn cellIndex(a: u32, b: u32, i: u32) -> u32 {
  if (fp.axis == 0u) { return i + a * N + b * N * N; }
  if (fp.axis == 1u) { return a + i * N + b * N * N; }
  return a + b * N + i * N * N;
}

// One workgroup does a whole line of N values along one axis, in shared memory.
@compute @workgroup_size(${N / 2})
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) t: u32) {
  for (var j = 0u; j < 2u; j++) {
    let i = t + j * N / 2u;
    buf[reverseBits(i) >> (32u - LOG_N)] = data[cellIndex(wg.x, wg.y, i)];
  }
  workgroupBarrier();

  let sign = select(-1.0, 1.0, fp.inverse == 1u);
  for (var h = 1u; h < N; h *= 2u) {
    let k = t % h;
    let i0 = (t / h) * 2u * h + k;
    let angle = sign * 3.14159265358979 * f32(k) / f32(h);
    let w = vec2f(cos(angle), sin(angle));
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
    data[cellIndex(wg.x, wg.y, i)] = buf[i] * scale;
  }
}`;
