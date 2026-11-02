// Draws the island with three.js under a physical sky, with the sun set by the time of day and
// clouds from the model's condensation (see clouds.js). The terrain is a mesh three
// times finer than the simulation grid, shaped and colored on the GPU (see shaders.js), with
// rivers cut into it from a texture finer still; the sea and lakes share a water shader.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {CloudPass, makeCloudNoise} from './clouds.js';
import {
  terrainMaterial,
  terrainDepthMaterial,
  waterMaterial,
} from './shaders.js';
import {DEEP_FLOOR} from './terrain.js';
import {makeEruptions} from './eruptions.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{N: number, cellSize: number, lowPower: boolean}} options
 */
export function makeRenderer(canvas, {N, cellSize, lowPower}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  // full retina resolution costs twice the frame time for little visible gain under antialiasing
  const maxPixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(maxPixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AgX rolls highlights off gently and keeps colors natural; ACES pushed greens and the sea
  // toward saturated video-game hues
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Redrawing the terrain into the 4096² shadow map took about 4 ms a frame, so it's only
  // redrawn when the ground, the sun or the shadow's framing changes.
  renderer.shadowMap.autoUpdate = false;
  const shadowsChanged = () => (renderer.shadowMap.needsUpdate = true);

  const size = (N - 1) * cellSize;
  const scene = new THREE.Scene();
  // A near plane well out from the camera keeps enough depth precision to tell the sea surface
  // from sea floor a meter below it 15 km away; at 10 m the shallows flickered.
  // A longer lens from further back, lower down, stacks ridges behind each other and makes the
  // mountains loom, as a film's establishing shot does.
  const camera = new THREE.PerspectiveCamera(32, 1, 100, size * 20);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = size * 0.05;
  controls.maxDistance = size * 2.5;
  controls.zoomToCursor = true;
  const viewDirection = new THREE.Vector3(0.45, 0.3, 0.75).normalize();
  let touched = false;
  const focus = {x: 0, z: 0, radius: size * 0.42};
  let aimed = false;
  // drift slowly around the island until someone takes the camera
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8; // turns per minute
  controls.addEventListener('start', () => {
    touched = true;
    controls.autoRotate = false;
  });

  /** Back the camera off until the island fits the screen's width and height. */
  function frameIsland() {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance =
      (focus.radius * 0.95) / Math.tan(Math.min(vertical, horizontal));
    controls.target.set(focus.x, 0, focus.z);
    camera.position
      .copy(viewDirection)
      .multiplyScalar(Math.min(distance, size * 2.4))
      .add(controls.target);
  }

  // the sky, and the same sky blurred into reflections and ambient light; setHour moves the sun
  const sky = new Sky();
  sky.scale.setScalar(size * 15);
  const u = sky.material.uniforms;
  u.turbidity.value = 3;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.85;
  // Its gamma curve lifts a night sky that should be near black to about 0.1, as bright as
  // dusk, which lit the whole island through the reflections, so it's dimmed at night.
  u.skyScale = {value: 1};
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', 'uniform float skyScale;\nvoid main() {')
    .replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      'gl_FragColor = vec4( retColor * skyScale, 1.0 );',
    );
  scene.add(sky);
  // stars and the moon, far off and moving with the camera
  const nightSky = new THREE.Group();
  const stars = makeStars(size * 12);
  const moon = makeMoon(size * 0.11);
  nightSky.add(stars, moon);
  scene.add(nightSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone()); // shares the sky's material
  // haze that turns distant land blue-grey, the main cue for how big the island is; it's set
  // each frame from how far away the camera is, so a phone held upright, which has to stand
  // well back to fit the island in, doesn't see it through a fog
  scene.fog = new THREE.FogExp2(0xb7c9d8, 0.55 / size);

  const light = new THREE.DirectionalLight(0xffffff, 3.2);
  light.castShadow = true;
  light.shadow.mapSize.setScalar(lowPower ? 2048 : 4096);
  const half = size * 0.55;
  Object.assign(light.shadow.camera, {
    left: -half,
    right: half,
    top: half,
    bottom: -half,
    near: 1,
    far: size * 3,
  });
  light.shadow.bias = -0.0003;
  light.shadow.normalBias = 3;
  scene.add(light, light.target);
  let shadowReach = 0;
  /**
   * Fit the shadow map to what the camera is looking at, so close up a texel covers well under
   * a meter instead of the 3.4 m it does spread over the whole island. Its size goes in steps,
   * since shadow edges shimmer while it changes, and the orbit keeps the target still.
   */
  function fitShadows() {
    const distance = camera.position.distanceTo(controls.target);
    const reach = Math.min(
      size * 0.55,
      1.25 **
        Math.ceil(Math.log(Math.max(800, distance * 1.3)) / Math.log(1.25)),
    );
    if (reach !== shadowReach) {
      shadowReach = reach;
      Object.assign(light.shadow.camera, {
        left: -reach,
        right: reach,
        top: reach,
        bottom: -reach,
      });
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.normalBias = (3 * reach) / half;
      shadowsChanged();
    }
    if (!light.target.position.equals(controls.target)) shadowsChanged();
    light.target.position.copy(controls.target);
    light.position.copy(sun).multiplyScalar(size).add(controls.target);
  }
  const skyLight = new THREE.HemisphereLight(0xa8c8ff, 0x5a4a35, 0.7);
  scene.add(skyLight);

  // what the shaders read: the simulation's fields and normals as textures, one texel per point
  const riverN = (N - 1) * 4 + 1; // matches RIVER_TEXELS in worker.js
  const dataTexture = (n = N, type = THREE.FloatType) => {
    const texture = new THREE.DataTexture(
      type === THREE.FloatType
        ? new Float32Array(n * n * 4)
        : new Uint8Array(n * n * 4),
      n,
      n,
      THREE.RGBAFormat,
      type,
    );
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  };
  // (Not one cloned from the other: a clone shares its image, so the clouds read the lava's
  // heat and puffed up over each step's new flows for a frame.)
  const floatTexture = () => {
    const texture = new THREE.DataTexture(
      new Float32Array(N * N),
      N,
      N,
      THREE.RedFormat,
      THREE.FloatType,
    );
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    return texture;
  };
  const cloudTexture = floatTexture();
  const heatTexture = floatTexture();
  const uniforms = {
    fieldsTex: {value: dataTexture()},
    normalTex: {value: dataTexture()},
    groundTex: {value: dataTexture()},
    riverTex: {value: dataTexture(riverN, THREE.UnsignedByteType)},
    riverN: {value: riverN},
    gridN: {value: N},
    cellSize: {value: cellSize},
    seaLevel: {value: 0},
    temperature: {value: 24},
    time: {value: 0},
    sunDirection: {value: new THREE.Vector3(0, 1, 0)},
    wind: {value: new THREE.Vector2(0, 1)}, // which way it blows
    cloudTex: {value: cloudTexture},
    heatTex: {value: heatTexture},
    noiseTex: {value: makeCloudNoise()},
    cloudsOn: {value: 1},
    deepWater: {value: new THREE.Color()},
    // for the clouds
    sunColor: {value: new THREE.Color()},
    skyLight: {value: new THREE.Color()},
    fogColor: {value: scene.fog.color},
    fogDensity: {value: 0},
    night: {value: 0}, // 0 by day, 1 once the sky is dark
    lavaClock: {value: 0}, // years the model has run since the last frame, for the lava's glow
  };
  const eruptions = makeEruptions(scene, uniforms);

  // three vertices per grid cell each way; the shader adds detail finer than the simulation
  const detail = lowPower ? 2 : 3;
  const terrainGeometry = new THREE.PlaneGeometry(
    size,
    size,
    (N - 1) * detail,
    (N - 1) * detail,
  ).rotateX(-Math.PI / 2);
  const terrain = new THREE.Mesh(
    terrainGeometry,
    terrainMaterial(
      new THREE.MeshStandardMaterial({roughness: 0.95, envMapIntensity: 0.6}),
      uniforms,
    ),
  );
  terrain.customDepthMaterial = terrainDepthMaterial(
    new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking}),
    uniforms,
  );
  terrain.castShadow = terrain.receiveShadow = true;
  terrain.frustumCulled = false; // its heights only exist on the GPU
  scene.add(terrain);

  // Lakes mirror less of the sky than the sea: the reflection only has sky in it, no hills,
  // and inland at a glance that read as ice.
  const makeWater = (surf) =>
    waterMaterial(
      new THREE.MeshStandardMaterial({
        transparent: true,
        roughness: 0.05,
        envMapIntensity: surf ? 1 : 0.4,
        depthWrite: false,
      }),
      uniforms,
      {surf},
    );

  // lakes: flat sheets at each lake's level, at the simulation's resolution
  const lakes = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, N - 1, N - 1).rotateX(-Math.PI / 2),
    makeWater(false),
  );
  lakes.receiveShadow = true;
  lakes.renderOrder = 2;
  lakes.frustumCulled = false;
  scene.add(lakes);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 30, size * 30, 1, 1).rotateX(-Math.PI / 2),
    makeWater(true),
  );
  sea.receiveShadow = true;
  sea.renderOrder = 1;
  scene.add(sea);

  // the deep ocean floor beyond the edge of the grid
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 30, size * 30).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial(),
  );
  floor.material.color = uniforms.deepWater.value; // shared, so it follows the time of day
  floor.position.y = DEEP_FLOOR - 1;
  floor.renderOrder = -1;
  scene.add(floor);

  // Sunlight reddens through more air as the sun drops (Kasten and Young's air mass, with blue
  // scattered about 7 times as much as red), and the sky's light dims with it. At night a full
  // moon, opposite the sun, lights the island instead, cold and dim, and the stars come out.
  const sun = new THREE.Vector3(); // whichever lights the island, the sun or the moon
  const sunColor = new THREE.Color();
  const moonDirection = new THREE.Vector3();
  let skyDirty = true;
  /** @param {number} hour 0 to 24 */
  function setHour(hour) {
    const elevation = 62 * Math.sin((Math.PI * (hour - 6)) / 12); // degrees
    const azimuth = 215 + (hour - 16.5) * 15;
    const moonElevation = -0.8 * elevation;
    const night = 1 - THREE.MathUtils.smoothstep(elevation, -14, -3);
    const byMoon = elevation < -3;
    moonDirection.setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(90 - moonElevation),
      THREE.MathUtils.degToRad(azimuth + 180),
    );
    sun.setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(
        90 - Math.max(byMoon ? moonElevation : elevation, 0.5),
      ),
      THREE.MathUtils.degToRad(byMoon ? azimuth + 180 : azimuth),
    );
    const e = Math.max(byMoon ? moonElevation : elevation, 0);
    const airMass =
      1 /
      (Math.sin(THREE.MathUtils.degToRad(e)) +
        0.50572 * (e + 6.07995) ** -1.6364);
    const thick = airMass - 1;
    sunColor.setRGB(
      Math.exp(-0.05 * thick),
      Math.exp(-0.15 * thick),
      Math.exp(-0.35 * thick),
    );
    if (byMoon) {
      sunColor.multiply(new THREE.Color(0.55, 0.68, 1));
      light.intensity =
        0.12 * night * THREE.MathUtils.smoothstep(moonElevation, 0, 15);
    } else {
      light.intensity = 3.4 * THREE.MathUtils.smoothstep(elevation, -1, 12);
    }
    light.color.copy(sunColor);
    light.position.copy(sun).multiplyScalar(size);
    uniforms.sunDirection.value.copy(sun);
    uniforms.night.value = night;
    const daylight =
      (0.25 + 0.75 * THREE.MathUtils.smoothstep(elevation, 0, 30)) *
      (1 - 0.9 * night);
    skyLight.intensity = 0.7 * daylight;
    // the haze turns the moon's blue at night (a sunset tint here never worked, its smoothstep
    // edges being reversed, and once fixed it washed golden hour out in peach, so it's gone)
    scene.fog.color
      .setRGB(0.48, 0.58, 0.69)
      .lerp(new THREE.Color(0.35, 0.45, 0.7), night)
      .multiplyScalar(daylight);
    uniforms.deepWater.value
      .setRGB(0.002, 0.016, 0.05)
      .multiplyScalar(daylight);
    uniforms.sunColor.value
      .copy(sunColor)
      .multiplyScalar(light.intensity * 0.5);
    uniforms.skyLight.value
      .setRGB(0.32, 0.4, 0.52)
      .lerp(new THREE.Color(0.25, 0.35, 0.65), night)
      .multiplyScalar(daylight);
    // eyes adjust to the dimmer light of evening, and further in the dark, as a long exposure
    // would
    renderer.toneMappingExposure =
      (0.7 / (0.55 + 0.45 * daylight)) * (1 + 1.0 * night);
    u.sunPosition.value.setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(90 - elevation),
      THREE.MathUtils.degToRad(azimuth),
    );
    stars.material.uniforms.brightness.value = night;
    u.skyScale.value = 1 - 0.93 * night;
    moon.position.copy(moonDirection).multiplyScalar(size * 11);
    moon.material.opacity = 1 - THREE.MathUtils.smoothstep(elevation, -6, 2);
    skyDirty = true;
    shadowsChanged();
  }

  // What a camera lens and sensor add: corners a little darker, and a faint grain that changes
  // every frame, which also hides banding in the smooth sky.
  const lensPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: {value: null},
        time: uniforms.time,
        night: uniforms.night,
      },
      vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
      fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform float night;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        // In the dark, eyes see by rods, which see no color and are most sensitive to blue
        // (the Purkinje shift), so dim parts of a night scene go grey-blue while lava and
        // moonlit highlights keep theirs.
        float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        float rods = night * 0.8 * (1.0 - smoothstep(0.15, 0.6, lum))
          * (1.0 - smoothstep(0.08, 0.3, chroma));
        c.rgb = mix(c.rgb, lum * vec3(0.72, 0.88, 1.25), rods);
        vec2 d = vUv - 0.5;
        c.rgb *= 1.0 - 0.3 * smoothstep(0.1, 0.5, dot(d, d));
        float n = fract(sin(dot(gl_FragCoord.xy + fract(time * 7.3) * 917.0, vec2(12.9898, 78.233))) * 43758.5453);
        c.rgb += (n - 0.5) * 0.03;
        gl_FragColor = c;
      }`,
    }),
  );

  // Draw the scene into a floating-point target with depth, add clouds and a glow around the
  // brightest highlights, then tone map for the screen.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new CloudPass(camera, uniforms, {lowPower, light}));
  if (!lowPower)
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.4, 3),
    );
  composer.addPass(new OutputPass());
  composer.addPass(lensPass);

  /** @type {Float32Array} */
  let heights = new Float32Array(N * N);
  let frameArrived = 0;
  let yearsPerSecond = 0;

  /**
   * Show a frame from the worker. Returns the frame's buffers for reuse.
   * @param {any} frame
   * @param {number} seaLevel
   */
  function update(frame, seaLevel, temperature, wind) {
    heights = frame.height.slice();
    frameArrived = performance.now();
    eruptions.add(frame.vents, gridToWorld);
    shadowsChanged();
    if (!aimed) aimAtLand(seaLevel);
    uniforms.fieldsTex.value.image.data.set(frame.fields);
    uniforms.fieldsTex.value.needsUpdate = true;
    uniforms.normalTex.value.image.data.set(frame.normal);
    uniforms.normalTex.value.needsUpdate = true;
    uniforms.groundTex.value.image.data.set(frame.ground);
    uniforms.groundTex.value.needsUpdate = true;
    uniforms.seaLevel.value = seaLevel;
    uniforms.temperature.value = temperature;
    const angle = THREE.MathUtils.degToRad(wind);
    uniforms.wind.value.set(-Math.sin(angle), Math.cos(angle));
    cloudTexture.image.data.set(frame.cloud);
    cloudTexture.needsUpdate = true;
    heatTexture.image.data.set(frame.heat);
    heatTexture.needsUpdate = true;
    const p = lakes.geometry.attributes.position;
    for (let i = 0; i < N * N; i++) p.array[i * 3 + 1] = frame.waterY[i];
    p.needsUpdate = true;
    sea.position.y = seaLevel;

    if (frame.riversFresh) {
      uniforms.riverTex.value.image.data.set(frame.rivers);
      uniforms.riverTex.value.needsUpdate = true;
    }
  }

  /** Center the view on the land, sized to fit it. */
  function aimAtLand(seaLevel) {
    let count = 0;
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < N * N; i++) {
      if (heights[i] <= seaLevel) continue;
      sx += i % N;
      sz += Math.floor(i / N);
      count++;
    }
    aimed = true;
    if (!count) return;
    const cx = sx / count;
    const cz = sz / count;
    let r2 = 0;
    for (let i = 0; i < N * N; i++) {
      if (heights[i] > seaLevel)
        r2 = Math.max(r2, ((i % N) - cx) ** 2 + (Math.floor(i / N) - cz) ** 2);
    }
    Object.assign(focus, {
      x: gridToWorld(cx),
      z: gridToWorld(cz),
      radius: Math.sqrt(r2) * cellSize,
    });
    frameIsland();
  }

  /** Height at fractional grid coordinates, or undefined off the grid. */
  function heightAt(gx, gz) {
    if (gx < 0 || gz < 0 || gx > N - 1 || gz > N - 1) return undefined;
    const x = Math.min(Math.floor(gx), N - 2);
    const z = Math.min(Math.floor(gz), N - 2);
    const fx = gx - x;
    const fz = gz - z;
    const i = z * N + x;
    const a = heights[i] + (heights[i + 1] - heights[i]) * fx;
    const b = heights[i + N] + (heights[i + N + 1] - heights[i + N]) * fx;
    return a + (b - a) * fz;
  }

  const gridToWorld = (g) => (g - (N - 1) / 2) * cellSize;
  const toGrid = (v) => v / cellSize + (N - 1) / 2;
  const raycaster = new THREE.Raycaster();

  /**
   * Where a point on screen hits the ground, in grid coordinates, by marching along the ray.
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x: number, z: number} | null}
   */
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const {origin, direction} = raycaster.ray;
    const stepLength = cellSize * 0.5;
    let wasAbove = false;
    for (let t = 0, prev = 0; t < size * 4; prev = t, t += stepLength) {
      const p = origin.clone().addScaledVector(direction, t);
      const h = heightAt(toGrid(p.x), toGrid(p.z));
      if (h === undefined) {
        if (wasAbove) return null; // left the grid
        continue;
      }
      if (p.y >= h) {
        wasAbove = true;
        continue;
      }
      if (!wasAbove) continue;
      // narrow down between the last point above ground and this one
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        const q = origin.clone().addScaledVector(direction, mid);
        if (q.y >= (heightAt(toGrid(q.x), toGrid(q.z)) ?? -Infinity)) lo = mid;
        else hi = mid;
      }
      const q = origin.clone().addScaledVector(direction, hi);
      return {x: toGrid(q.x), z: toGrid(q.z)};
    }
    return null;
  }

  // Resolution follows the frame rate, checked every second: it drops a step when frames take
  // longer than 25 ms, and climbs a step when they keep up with the screen (under 18 ms), but
  // not back to a resolution that was too slow in the last 15 seconds, or it would go back and
  // forth. (Predicting the next step's time from the pixel count never climbed: on a 60 Hz
  // screen no frame measures under 16.7 ms.)
  let pixelRatio = maxPixelRatio;
  let tooSlow = Infinity; // the lowest pixel ratio that was too slow lately
  let tooSlowAt = 0;
  let frameTimes = 0;
  let frameCount = 0;
  let lastFrame = 0;
  let lastCheck = 0;
  function adaptResolution(now) {
    const dt = now - lastFrame;
    lastFrame = now;
    if (dt > 0 && dt < 200) {
      frameTimes += dt;
      frameCount++;
    }
    if (now - lastCheck < 1000 || frameCount < 10) return;
    const average = frameTimes / frameCount;
    frameTimes = frameCount = 0;
    lastCheck = now;
    const step = 0.15;
    if (now - tooSlowAt > 15000) tooSlow = Infinity;
    if (average > 25 && pixelRatio > 0.75) {
      tooSlow = Math.min(tooSlow, pixelRatio);
      tooSlowAt = now;
      pixelRatio = Math.max(0.75, pixelRatio - step);
    } else if (average < 18 && pixelRatio + step < tooSlow - 0.01) {
      pixelRatio = Math.min(maxPixelRatio, pixelRatio + step);
    }
  }

  /**
   * Zooming toward the cursor moves the point the camera orbits along the view, at its depth,
   * so zooming in on low ground sank it hundreds of meters under the land or the sea and took
   * the camera down after it, where everything was a wall of haze. Keep the point above the sea
   * and the camera a little above the ground.
   */
  function keepAboveGround() {
    const surface = (p) =>
      Math.max(
        uniforms.seaLevel.value,
        heightAt(toGrid(p.x), toGrid(p.z)) ?? -Infinity,
      );
    // the sea, not the ground: lifting it onto the summit reframed the default view, which
    // then took twice as long to draw
    const target = controls.target;
    const below = uniforms.seaLevel.value - target.y;
    if (below > 0) {
      target.y += below;
      camera.position.y += below;
    }
    // clear of the finer relief the GPU adds, which can rise tens of meters above the model
    const floor =
      surface(camera.position) + 60 + 0.05 * camera.position.distanceTo(target);
    if (camera.position.y < floor) camera.position.y = floor;
  }

  const clock = new THREE.Clock();
  // seconds of animation, which (unlike the clock's) stand still while the page is paused, so
  // the clouds and plumes don't jump when it comes back
  let elapsed = 0;
  function render() {
    adaptResolution(performance.now());
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (
      canvas.width !== Math.floor(w * pixelRatio) ||
      canvas.height !== Math.floor(h * pixelRatio)
    ) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      if (camera.aspect !== w / h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (!touched) frameIsland();
      }
    }
    const dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    controls.update(dt);
    keepAboveGround();
    fitShadows();
    // A little haze for the whole scene, in meters, so it clears as you zoom in; most of it
    // is the cloud pass's, which settles low (clouds.js). (It was 0.2 / the camera's distance,
    // the same 4% at the point looked at however close, so zooming never cleared it.)
    scene.fog.density = 0.12 / size;
    uniforms.fogDensity.value = scene.fog.density;
    uniforms.time.value = elapsed;
    nightSky.position.copy(camera.position);
    uniforms.pixelScale.value = renderer.domElement.height / 2;
    eruptions.update(dt, yearsPerSecond > 0, elapsed);
    uniforms.lavaClock.value = Math.min(
      3000,
      ((performance.now() - frameArrived) / 1000) * yearsPerSecond,
    );
    if (skyDirty) {
      scene.environment?.dispose();
      scene.environment = pmrem.fromScene(skyScene).texture;
      skyDirty = false;
    }
    composer.render();
  }

  return {
    update,
    render,
    pick,
    controls,
    setHour,
    setSpeed: (years) => (yearsPerSecond = years),
    setClouds: (on) => (uniforms.cloudsOn.value = on ? 1 : 0),
    reframe: () => {
      aimed = false;
      eruptions.clear();
    },
  };
}

/**
 * A few thousand stars on a sphere, brighter ones rarer, faint and twinkling a little.
 * @param {number} radius
 */
function makeStars(radius) {
  const count = 4000;
  const positions = new Float32Array(count * 3);
  const shine = new Float32Array(count);
  const p = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    do p.randomDirection();
    while (p.y < -0.05);
    p.multiplyScalar(radius).toArray(positions, k * 3);
    shine[k] = Math.random() ** 6;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('shine', new THREE.BufferAttribute(shine, 1));
  const stars = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: {brightness: {value: 0}},
      vertexShader: /* glsl */ `
        attribute float shine;
        varying float vShine;
        void main() {
          vShine = shine;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 1.5 + 1.5 * shine;
        }`,
      fragmentShader: /* glsl */ `
        uniform float brightness;
        varying float vShine;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.25, 0.0, dot(d, d));
          gl_FragColor = vec4(vec3(0.8, 0.85, 1.0) * brightness * (0.05 + 1.2 * vShine) * a, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  stars.frustumCulled = false;
  stars.renderOrder = -2;
  return stars;
}

/**
 * The full moon: a pale disk with a faint halo.
 * @param {number} diameter
 */
function makeMoon(diameter) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.22, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.12)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  // a few darker seas
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(150,150,160,0.35)';
  for (const [x, y, r] of [
    [58, 56, 6],
    [69, 62, 5],
    [62, 71, 4],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(1.6, 1.65, 1.8),
      fog: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  moon.scale.setScalar(diameter * 4);
  moon.renderOrder = -1;
  return moon;
}
