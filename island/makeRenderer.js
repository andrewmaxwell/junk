// Draws the island with three.js: lit, shadowed terrain, lakes and rivers on their own glossy
// mesh, and a see-through sea under a physical sky.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';

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
  renderer.toneMappingExposure = 0.8;
  renderer.shadowMap.enabled = !lowPower; // shadows cost about a third of the frame
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const size = (N - 1) * cellSize;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 10, size * 20);
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
  controls.addEventListener('start', () => (touched = true));

  /** Back the camera off until the island fits the screen's width and height. */
  function frameIsland() {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance =
      (focus.radius * 0.8) / Math.tan(Math.min(vertical, horizontal));
    controls.target.set(focus.x, 0, focus.z);
    camera.position
      .copy(viewDirection)
      .multiplyScalar(Math.min(distance, size * 2.4))
      .add(controls.target);
  }

  // sky, and the same sky blurred into reflections and ambient light
  const sun = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(58),
    THREE.MathUtils.degToRad(200),
  );
  const sky = new Sky();
  sky.scale.setScalar(size * 15);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sun);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone());
  scene.environment = pmrem.fromScene(skyScene).texture;
  scene.fog = new THREE.Fog(0xa9c3d9, size * 1.2, size * 6);

  const light = new THREE.DirectionalLight(0xfff1dd, 2.2);
  light.position.copy(sun).multiplyScalar(size);
  light.castShadow = true;
  light.shadow.mapSize.setScalar(2048);
  const half = size * 0.55;
  Object.assign(light.shadow.camera, {
    left: -half,
    right: half,
    top: half,
    bottom: -half,
    near: 1,
    far: size * 3,
  });
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = cellSize * 0.02;
  scene.add(light);
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x4a4030, 0.4));

  /** A grid mesh whose heights, normals and colors come from the worker each frame. */
  function makeGrid(colorSize) {
    const geometry = new THREE.PlaneGeometry(size, size, N - 1, N - 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(
        new Uint8Array(N * N * colorSize),
        colorSize,
        true,
      ),
    );
    return geometry;
  }

  const terrain = new THREE.Mesh(
    makeGrid(3),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      envMapIntensity: 0.5,
    }),
  );
  terrain.castShadow = terrain.receiveShadow = true;
  scene.add(terrain);

  const water = new THREE.Mesh(
    makeGrid(4),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      roughness: 0.2,
      envMapIntensity: 0.35, // lakes catch the sky at a glance and read as snow at full strength
      depthWrite: false,
    }),
  );
  water.receiveShadow = true;
  water.renderOrder = 2;
  scene.add(water);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 30, size * 30).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x0a3550,
      transparent: true,
      opacity: 0.72,
      roughness: 0.12,
      depthWrite: false,
    }),
  );
  sea.receiveShadow = true;
  sea.renderOrder = 1;
  scene.add(sea);

  // the deep ocean floor beyond the edge of the grid
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 30, size * 30).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      // the worker's deep-water color as it comes out of its 8-bit linear vertex colors
      color: new THREE.Color().setRGB(
        ...[0.05, 0.12, 0.17].map((v) => Math.floor(v ** 2.2 * 255) / 255),
        THREE.LinearSRGBColorSpace,
      ),
      roughness: 0.95,
      envMapIntensity: 0.5,
    }),
  );
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

  /** @type {Float32Array} */
  let heights = new Float32Array(N * N);

  /**
   * Show a frame from the worker. Returns the frame's buffers for reuse.
   * @param {any} frame
   * @param {number} seaLevel
   */
  function update(frame, seaLevel) {
    heights = frame.height.slice();
    if (!aimed) aimAtLand(seaLevel);
    const setY = (mesh, ys) => {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < N * N; i++) p.array[i * 3 + 1] = ys[i];
      p.needsUpdate = true;
    };
    setY(terrain, frame.height);
    setY(water, frame.waterY);
    terrain.geometry.attributes.normal.array.set(frame.normal);
    terrain.geometry.attributes.normal.needsUpdate = true;
    terrain.geometry.attributes.color.array.set(frame.color);
    terrain.geometry.attributes.color.needsUpdate = true;
    water.geometry.attributes.color.array.set(frame.waterColor);
    water.geometry.attributes.color.needsUpdate = true;
    terrain.geometry.computeBoundingSphere();
    sea.position.y = seaLevel;
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

  function render() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      pathMaterial.resolution.set(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!touched) frameIsland();
    }
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    update,
    render,
    pick,
    showPath,
    controls,
    reframe: () => (aimed = false),
  };
}
