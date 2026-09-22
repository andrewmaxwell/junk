import {params} from './params.js';

const HEADER_FLOATS = 12;
const SPECIES_FLOATS = 12;

// Mirrors the Params struct in shaders/params.wgsl.
export const createUniforms = (device) => {
  const data = new ArrayBuffer(
    (HEADER_FLOATS + SPECIES_FLOATS * params.species.length) * 4,
  );
  const f = new Float32Array(data);
  const u = new Uint32Array(data);
  const i = new Int32Array(data);
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const write = ({width, height, numAgents, frame}, mouse) => {
    const {world, brush} = params;
    const cellsPerPixel = width / innerWidth;
    u[0] = width;
    u[1] = height;
    u[2] = numAgents;
    u[3] = frame;
    f[4] = world.fadeSpeed;
    f[5] = mouse.x * cellsPerPixel;
    f[6] = mouse.y * cellsPerPixel;
    f[7] = mouse.down ? 1 : 0;
    f[8] = brush.radius * cellsPerPixel;
    f[9] = brush.value;
    f[10] = world.brightness;

    params.species.forEach((sp, s) => {
      const o = HEADER_FLOATS + s * SPECIES_FLOATS;
      f.set(
        sp.color.map((c) => c / 255),
        o,
      );
      f[o + 3] = sp.distance;
      i[o + 4] = Math.round(sp.radius);
      f[o + 5] = sp.angle;
      f[o + 6] = sp.speed;
      f[o + 7] = sp.turnSpeed;
      f[o + 8] = sp.scattering;
      f[o + 9] = sp.strength;
      f[o + 10] = sp.maxStrength;
      f[o + 11] = sp.others;
    });
    device.queue.writeBuffer(buffer, 0, data);
  };

  return {buffer, write};
};
