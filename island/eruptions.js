// What an eruption looks like while it's going on: a fountain of glowing lava at the vent, an
// ash and gas plume drifting downwind, and the orange light they cast on the ground, the plume
// and the clouds. The model erupts every step from vents all over a volcano's summit and rift
// zones, five steps a second, so drawn at each one they'd flicker; instead a few vents at a time
// keep going for some seconds, picked from the flows the model just ran. Each one's plume
// outlasts it, drifting off downwind and thinning out after the vent stops.
import * as THREE from 'three';

export const MAX_VENTS = 3;
const SPARKS = 1200; // per vent
const PLUMES = 6;
const PUFFS = 100; // per plume
const PLUME_LIFE = 20; // s each puff takes to rise, drift off and fade
const LAVA = new THREE.Color(1.0, 0.36, 0.08);

/**
 * @param {THREE.Scene} scene
 * @param {object} uniforms shared with the terrain and clouds; this adds `vents`, each vent's
 *   position and strength (0..1)
 */
export function makeEruptions(scene, uniforms) {
  const vents = Array.from({length: MAX_VENTS}, () => ({
    at: new THREE.Vector3(),
    age: 0,
    life: 0,
    strength: 0,
    size: 1, // 0..1, from the flow's volume
    plume: -1, // which plume it's feeding, if one was free
  }));
  // where each plume's vent is, and when it started and stopped putting out puffs (seconds of
  // uniforms.time). Puffs are drawn only if they left the vent while it was going, so a plume
  // grows up out of the vent and drifts away after, instead of a whole column of them
  // appearing and vanishing at once.
  const plumes = Array.from({length: PLUMES}, () => ({
    at: new THREE.Vector4(),
    times: new THREE.Vector2(-1e9, -1e9),
  }));
  uniforms.plumes = {value: plumes.map((p) => p.at)};
  uniforms.plumeTimes = {value: plumes.map((p) => p.times)};
  let now = 0;
  uniforms.vents = {
    value: vents.map(() => new THREE.Vector4()),
  };
  uniforms.pixelScale = {value: 500};

  const lights = vents.map(() => {
    const light = new THREE.PointLight(LAVA, 0, 0, 2);
    scene.add(light);
    return light;
  });

  // Fountains: sparks thrown up and falling back, white-hot as they leave the vent and cooling
  // to red. Each spark's path is worked out in the shader from its seed and the time.
  const sparkSeeds = new Float32Array(MAX_VENTS * SPARKS * 4);
  for (let k = 0; k < sparkSeeds.length; k++) sparkSeeds[k] = Math.random();
  const sparkVent = new Float32Array(MAX_VENTS * SPARKS);
  for (let k = 0; k < sparkVent.length; k++)
    sparkVent[k] = Math.floor(k / SPARKS);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(sparkVent.length * 3), 3),
  );
  sparkGeometry.setAttribute('seed', new THREE.BufferAttribute(sparkSeeds, 4));
  sparkGeometry.setAttribute('vent', new THREE.BufferAttribute(sparkVent, 1));
  const sparks = new THREE.Points(
    sparkGeometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        uniform vec4 vents[${MAX_VENTS}];
        uniform float time;
        uniform float pixelScale;
        attribute vec4 seed;
        attribute float vent;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 v = vents[int(vent)];
          float strength = v.w;
          // each spark flies for 2-4 s and is thrown again; the faster ones go higher
          float flight = 2.0 + 2.0 * seed.x;
          float t = fract(time / flight + seed.y);
          float height = (60.0 + 220.0 * seed.z * seed.z) * sqrt(strength);
          float angle = 6.2832 * seed.w;
          float out_ = height * (0.08 + 0.25 * seed.x * seed.x);
          vec3 p = v.xyz + vec3(cos(angle) * out_ * t, 4.0 * height * t * (1.0 - t), sin(angle) * out_ * t);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = 7.0 * projectionMatrix[1][1] * pixelScale / -mv.z;
          gl_PointSize = max(size, 1.5);
          // below a pixel and a half, dim instead of shrink, or they glitter
          float cover = min(1.0, size / 1.5);
          float heat = 1.0 - t;
          vColor = mix(vec3(1.0, 0.12, 0.02), vec3(1.0, 0.7, 0.3), heat * heat) * (2.0 + 8.0 * heat * heat);
          vAlpha = strength > 0.01 ? cover * cover * smoothstep(1.0, 0.85, t) : 0.0;
          if (vAlpha == 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = vAlpha * smoothstep(0.25, 0.0, dot(d, d));
          gl_FragColor = vec4(vColor * a, 0.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);

  // The plume: soft puffs that rise from the vent, slowing as they go, spread and drift
  // downwind. Lit by the sky and the sun or moon, and orange from below by the lava.
  const quad = new THREE.PlaneGeometry(1, 1);
  const puffGeometry = new THREE.InstancedBufferGeometry();
  puffGeometry.index = quad.index;
  puffGeometry.setAttribute('position', quad.attributes.position);
  puffGeometry.setAttribute('uv', quad.attributes.uv);
  const puffSeeds = new Float32Array(PLUMES * PUFFS * 4);
  for (let k = 0; k < puffSeeds.length; k++) puffSeeds[k] = Math.random();
  // evenly spaced births, so a short eruption still puts out a steady train of puffs
  for (let k = 0; k < PLUMES * PUFFS; k++)
    puffSeeds[k * 4] = ((k % PUFFS) + 0.5 * puffSeeds[k * 4]) / PUFFS;
  const puffVent = new Float32Array(PLUMES * PUFFS);
  for (let k = 0; k < puffVent.length; k++) puffVent[k] = Math.floor(k / PUFFS);
  puffGeometry.setAttribute(
    'seed',
    new THREE.InstancedBufferAttribute(puffSeeds, 4),
  );
  puffGeometry.setAttribute(
    'vent',
    new THREE.InstancedBufferAttribute(puffVent, 1),
  );
  puffGeometry.instanceCount = PLUMES * PUFFS;
  const plume = new THREE.Mesh(
    puffGeometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        uniform vec4 plumes[${PLUMES}];
        uniform vec2 plumeTimes[${PLUMES}];
        uniform float time;
        uniform vec2 wind;
        attribute vec4 seed;
        attribute float vent;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vHeight;
        varying float vT;
        varying vec4 vSeed;
        varying float vDistance;
        varying vec3 vWorld;
        varying float vRadius;
        void main() {
          vec4 v = plumes[int(vent)];
          vec2 times = plumeTimes[int(vent)];
          float strength = v.w;
          float t = fract(time / ${PLUME_LIFE.toFixed(1)} + seed.x);
          // when this puff left the vent, and whether the vent was erupting then, fading over
          // a second at either end
          float born = time - t * ${PLUME_LIFE.toFixed(1)};
          float emitted = smoothstep(times.x, times.x + 1.0, born) * (1.0 - smoothstep(times.y - 1.0, times.y, born));
          // rising fast out of the vent, then slowing and spreading as it mixes with the air
          float top = (900.0 + 1400.0 * seed.y) * sqrt(strength);
          float rise = (1.0 - exp(-3.0 * t)) / (1.0 - exp(-3.0));
          float radius = (40.0 + 400.0 * t) * (0.7 + 0.6 * seed.y);
          vec2 side = vec2(-wind.y, wind.x) * (seed.z - 0.5) * radius * 1.2;
          vec2 drift = wind * (2500.0 * t * rise) + side + (seed.wy - 0.5) * radius * 0.6;
          vec3 center = v.xyz + vec3(drift.x, top * rise, drift.y);
          vec4 mv = modelViewMatrix * vec4(center, 1.0);
          float angle = 6.2832 * seed.w + time * 0.05 * (seed.z - 0.5);
          mat2 turn = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
          vec2 offset = turn * position.xy * radius * 2.4;
          mv.xy += offset;
          gl_Position = projectionMatrix * mv;
          vWorld = center + transpose(mat3(viewMatrix)) * vec3(offset, 0.0);
          vRadius = radius;
          vUv = uv;
          vT = t;
          vSeed = seed;
          vHeight = top * rise;
          vDistance = -mv.z;
          vAlpha = strength * emitted * smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.4, 1.0, t));
          if (vAlpha < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform highp sampler3D noiseTex;
        uniform vec3 sunColor;
        uniform vec3 skyLight;
        uniform vec3 sunDirection;
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float time;
        uniform sampler2D fieldsTex;
        uniform float gridN;
        uniform float cellSize;
        varying vec2 vUv;
        varying float vAlpha;
        varying float vHeight;
        varying float vT;
        varying vec4 vSeed;
        varying float vDistance;
        varying vec3 vWorld;
        varying float vRadius;
        void main() {
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          // broad, faint lumps: at the noise's own scale every puff had the same cells, and the
          // overlapping puffs showed them as a repeating pattern
          float billows = texture(noiseTex, vec3(vUv * 0.15 + vSeed.xy, vSeed.z + time * 0.005)).r;
          // fade out where the flat puff passes into the ground, or it's cut off in a hard line
          vec2 g = vWorld.xz / cellSize + (gridN - 1.0) * 0.5;
          float ground = texture2D(fieldsTex, (g + 0.5) / gridN).r;
          float above = smoothstep(0.0, 0.5 * vRadius, vWorld.y - ground);
          float soft = smoothstep(1.0, 0.0, r + 0.3 * (0.6 - billows));
          float a = vAlpha * 0.35 * above * soft * soft;
          if (a < 0.002) discard;
          // brighter on the side facing the sun or moon, as a lumpy round puff would be
          vec3 n = normalize(vec3(d, 0.5));
          float lit = 0.4 + 0.6 * max(0.0, dot(n, normalize(vec3(sunDirection.x, sunDirection.y, 0.3))));
          // mostly steam, so pale grey; ash darkens it near the vent
          vec3 ash = mix(vec3(0.35, 0.33, 0.32), vec3(0.62, 0.62, 0.62), smoothstep(0.0, 0.4, vT))
            * (sunColor * lit * 0.6 + skyLight * 0.8);
          // the lava under it lights its underside, fading with height: lost in daylight, the
          // brightest part of the plume at night
          ash += vec3(1.0, 0.36, 0.08) * 0.4 * exp(-vHeight / 350.0) * (0.6 + 0.4 * billows);
          float fog = exp(-fogDensity * fogDensity * vDistance * vDistance);
          vec3 color = mix(fogColor, ash, fog);
          gl_FragColor = vec4(color * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  plume.frustumCulled = false;
  plume.renderOrder = 3;
  scene.add(plume);

  /**
   * Start vents from the flows the model just ran: the biggest first, skipping any too close
   * to one that's going, until MAX_VENTS are.
   * @param {number[]} flows grid x, z, height (m), volume (m³) for each
   * @param {(g: number) => number} gridToWorld
   */
  function add(flows, gridToWorld) {
    if (!flows.length) return;
    let biggest = 0;
    for (let k = 3; k < flows.length; k += 4)
      biggest = Math.max(biggest, flows[k]);
    const order = [];
    for (let k = 0; k < flows.length; k += 4) order.push(k);
    order.sort((a, b) => flows[b + 3] - flows[a + 3]);
    for (const k of order) {
      const at = new THREE.Vector3(
        gridToWorld(flows[k]),
        flows[k + 2],
        gridToWorld(flows[k + 1]),
      );
      const near = vents.find(
        (v) => v.life > v.age && v.at.distanceTo(at) < 800,
      );
      if (near) {
        near.life = Math.max(near.life, near.age + 2); // still erupting there
        continue;
      }
      const free = vents.find((v) => v.age >= v.life && v.strength < 0.01);
      if (!free) break;
      free.at.copy(at);
      free.age = 0;
      free.life = 3 + 4 * Math.random();
      free.size = 0.5 + 0.5 * Math.sqrt(flows[k + 3] / biggest);
      // a plume whose last puffs are gone, if there is one
      free.plume = plumes.findIndex((p) => p.times.y + PLUME_LIFE < now);
      if (free.plume >= 0) {
        const p = plumes[free.plume];
        p.at.set(at.x, at.y, at.z, free.size);
        p.times.set(now, 1e9);
      }
    }
  }

  /**
   * @param {number} dt seconds since the last frame
   * @param {boolean} running whether the model is running (vents stop aging while paused)
   * @param {number} time seconds, for the flicker
   */
  function update(dt, running, time) {
    now = time;
    vents.forEach((v, k) => {
      if (running) v.age += dt;
      if (v.plume >= 0 && v.age >= v.life) {
        plumes[v.plume].times.y = time; // its puffs drift on without it
        v.plume = -1;
      }
      // fade in over half a second and out over two
      const target = v.age < v.life ? v.size : 0;
      v.strength +=
        (target - v.strength) * (1 - Math.exp(-dt * (target ? 4 : 1)));
      uniforms.vents.value[k].set(v.at.x, v.at.y, v.at.z, v.strength);
      const flicker =
        0.85 +
        0.1 * Math.sin(time * 13 + k * 7) +
        0.05 * Math.sin(time * 31 + k);
      lights[k].position.set(v.at.x, v.at.y + 150, v.at.z);
      // (always in the scene: hiding one changes the light count, which recompiles shaders)
      // By day a fountain barely lights the ground around it, and a bright pool of orange with
      // no visible fountain (too small to see from afar) looked like a spotlight.
      lights[k].intensity =
        6e4 * v.strength * flicker * (0.1 + 0.9 * uniforms.night.value);
    });
  }

  /** End every eruption at once, for a new island. */
  function clear() {
    for (const v of vents) {
      v.age = v.life = v.strength = 0;
      v.plume = -1;
    }
    for (const p of plumes) p.times.set(-1e9, -1e9);
  }

  return {add, update, clear};
}
