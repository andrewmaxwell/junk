// Draws the island with three.js under a physical sky, with the sun set by the time of day and
// clouds from the model's condensation (see clouds.js). The terrain is a mesh three
// times finer than the simulation grid, shaped and colored on the GPU (see shaders.js), with
// rivers cut into it from a texture finer still; the sea and lakes share a water shader.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {CloudPass, makeCloudNoise} from './clouds.js';
import {
  terrainMaterial,
  terrainDepthMaterial,
  waterMaterial,
} from './shaders.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{N: number, cellSize: number, lowPower: boolean}} options
 */
export function makeRenderer(canvas, {N, cellSize, lowPower}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  // full retina resolution costs twice the frame time for little visible gain under antialiasing
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const size = (N - 1) * cellSize;
  const scene = new THREE.Scene();
  // A near plane well out from the camera keeps enough depth precision to tell the sea surface
  // from sea floor a meter below it 15 km away; at 10 m the shallows flickered.
  const camera = new THREE.PerspectiveCamera(45, 1, 100, size * 20);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = size * 0.05;
  controls.maxDistance = size * 2.5;
  controls.zoomToCursor = true;
  const viewDirection = new THREE.Vector3(0.45, 0.42, 0.75).normalize();
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
  scene.add(sky);
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
  scene.add(light);
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
  const cloudTexture = new THREE.DataTexture(
    new Float32Array(N * N),
    N,
    N,
    THREE.RedFormat,
    THREE.FloatType,
  );
  cloudTexture.magFilter = cloudTexture.minFilter = THREE.LinearFilter;
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
    noiseTex: {value: makeCloudNoise()},
    cloudsOn: {value: 1},
    deepWater: {value: new THREE.Color()},
    // for the clouds
    sunColor: {value: new THREE.Color()},
    skyLight: {value: new THREE.Color()},
    fogColor: {value: scene.fog.color},
    fogDensity: {value: 0},
  };

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
  floor.position.y = -1201;
  floor.renderOrder = -1;
  scene.add(floor);

  // a raindrop's path to the sea, and a dot where it starts
  const pathMaterial = new LineMaterial({
    color: 0xffd23f,
    linewidth: 3,
    depthTest: false,
    transparent: true,
    fog: false,
  });
  let path = null;
  const dot = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0], 3),
    ),
    new THREE.PointsMaterial({
      color: 0xffd23f,
      size: 12,
      sizeAttenuation: false,
      depthTest: false,
      fog: false,
    }),
  );
  dot.renderOrder = 3;
  dot.visible = false;
  scene.add(dot);

  /**
   * Draw a line through grid points, just above the ground or water.
   * @param {number[]} cells
   * @param {Float32Array} ys surface height at each cell
   */
  function showPath(cells, ys) {
    if (path) {
      scene.remove(path);
      path.geometry.dispose();
      path = null;
    }
    dot.visible = cells.length > 0;
    if (!cells.length) return;
    const points = cells.flatMap((i) => [
      gridToWorld(i % N),
      ys[i] + 3,
      gridToWorld(Math.floor(i / N)),
    ]);
    dot.position.set(points[0], points[1], points[2]);
    if (cells.length < 2) return;
    const geometry = new LineGeometry();
    geometry.setPositions(points);
    path = new Line2(geometry, pathMaterial);
    path.renderOrder = 3;
    scene.add(path);
  }

  // Sunlight reddens through more air as the sun drops (Kasten and Young's air mass, with blue
  // scattered about 7 times as much as red), and the sky's light dims with it.
  const sun = new THREE.Vector3();
  const sunColor = new THREE.Color();
  let skyDirty = true;
  /** @param {number} hour 6 (sunrise) to 18 (sunset) */
  function setHour(hour) {
    const elevation = 62 * Math.sin((Math.PI * (hour - 6)) / 12); // degrees
    const azimuth = 215 + (hour - 16.5) * 15;
    sun.setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(90 - Math.max(elevation, 0.5)),
      THREE.MathUtils.degToRad(azimuth),
    );
    const e = Math.max(elevation, 0);
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
    const up = THREE.MathUtils.smoothstep(elevation, -1, 12);
    light.color.copy(sunColor);
    light.intensity = 3.4 * up;
    light.position.copy(sun).multiplyScalar(size);
    uniforms.sunDirection.value.copy(sun);
    const daylight = 0.25 + 0.75 * THREE.MathUtils.smoothstep(elevation, 0, 30);
    skyLight.intensity = 0.7 * daylight;
    // the haze picks up the sun's color near sunset
    scene.fog.color
      .setRGB(0.48, 0.58, 0.69)
      .lerp(
        new THREE.Color(0.62, 0.42, 0.33),
        THREE.MathUtils.smoothstep(elevation, 25, 3),
      )
      .multiplyScalar(daylight);
    uniforms.deepWater.value
      .setRGB(0.002, 0.016, 0.05)
      .multiplyScalar(daylight);
    uniforms.sunColor.value
      .copy(sunColor)
      .multiplyScalar(light.intensity * 0.5);
    uniforms.skyLight.value.setRGB(0.32, 0.4, 0.52).multiplyScalar(daylight);
    // eyes adjust to the dimmer light of evening
    renderer.toneMappingExposure = 0.7 / (0.55 + 0.45 * daylight);
    u.sunPosition.value.copy(sun);
    skyDirty = true;
  }

  // Draw the scene into a floating-point target with depth, add clouds and a glow around the
  // brightest highlights, then tone map for the screen.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new CloudPass(camera, uniforms, {lowPower}));
  if (!lowPower)
    composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(256, 256), 0.25, 0.4, 3),
    );
  composer.addPass(new OutputPass());

  /** @type {Float32Array} */
  let heights = new Float32Array(N * N);

  /**
   * Show a frame from the worker. Returns the frame's buffers for reuse.
   * @param {any} frame
   * @param {number} seaLevel
   */
  function update(frame, seaLevel, temperature, wind) {
    heights = frame.height.slice();
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

  const clock = new THREE.Clock();
  function render() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      pathMaterial.resolution.set(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!touched) frameIsland();
    }
    controls.update(Math.min(clock.getDelta(), 0.1));
    // about 12% haze at the point the camera looks at, more beyond
    scene.fog.density = Math.min(
      0.55 / size,
      0.36 / camera.position.distanceTo(controls.target),
    );
    uniforms.fogDensity.value = scene.fog.density;
    uniforms.time.value = clock.elapsedTime;
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
    showPath,
    controls,
    setHour,
    setClouds: (on) => (uniforms.cloudsOn.value = on ? 1 : 0),
    reframe: () => (aimed = false),
  };
}
