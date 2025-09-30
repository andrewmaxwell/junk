// makeRenderer.js
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/**
 * Create a Three.js renderer that draws terrain + water each frame.
 * - Sea: reflective/transmissive plane at seaLevel.
 * - Inland water: separate grid surface (flat, reflective) colored by depth & sediment.
 * @param {HTMLCanvasElement} canvas
 * @returns {(sim: {
 *   landHeight: Float32Array,
 *   waterDepth: Float32Array,
 *   sediment: Float32Array
 * }, opts: {
 *   cellSize: number,
 *   seaLevel: number,
 *   showWater?: boolean,
 *   waterMinDepth?: number,
 *   waterDepthMax?: number,
 *   sedimentTintScale?: number
 * }) => void}
 */
export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8ff);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envMap;

  const camera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    200000,
  );
  camera.position.set(0, 800, 800);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(500, 1000, 500);
  sun.castShadow = false;
  scene.add(sun);

  /** @type {THREE.Mesh | null} */
  let terrainMesh = null;
  /** @type {THREE.Mesh | null} */
  let seaMesh = null;
  /** @type {THREE.Mesh | null} */
  let inlandWaterMesh = null;

  /** @type {THREE.BufferAttribute | null} */
  let terrainPosAttr = null;
  /** @type {THREE.BufferAttribute | null} */
  let terrainColorAttr = null;

  /** @type {THREE.BufferAttribute | null} */
  let waterPosAttr = null;
  /** @type {THREE.BufferAttribute | null} */
  let waterColorAttr = null;

  let currentN = 0;
  let planeWidth = 0;
  let planeHeight = 0;

  /**
   * Build (or rebuild) terrain & water meshes for grid N.
   * @param {number} N
   * @param {number} cellSize
   */
  function rebuildMeshes(N, cellSize) {
    // dispose old
    if (terrainMesh) {
      scene.remove(terrainMesh);
      terrainMesh.geometry.dispose();
      terrainMesh = null;
    }
    if (seaMesh) {
      scene.remove(seaMesh);
      seaMesh.geometry.dispose();
      seaMesh = null;
    }
    if (inlandWaterMesh) {
      scene.remove(inlandWaterMesh);
      inlandWaterMesh.geometry.dispose();
      inlandWaterMesh = null;
    }

    currentN = N;
    planeWidth = (N - 1) * cellSize;
    planeHeight = (N - 1) * cellSize;

    // --- Terrain (vertex-colored) ---
    const tGeom = new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      N - 1,
      N - 1,
    );
    tGeom.rotateX(-Math.PI / 2);
    const tColors = new Float32Array(N * N * 3);
    terrainColorAttr = new THREE.BufferAttribute(tColors, 3);
    tGeom.setAttribute('color', terrainColorAttr);
    terrainPosAttr = tGeom.getAttribute('position');

    const tMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      envMap,
      envMapIntensity: 0.3,
    });

    terrainMesh = new THREE.Mesh(tGeom, tMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // --- Inland water surface (grid, vertex-colored) ---
    const wGeom = new THREE.PlaneGeometry(
      planeWidth,
      planeHeight,
      N - 1,
      N - 1,
    );
    wGeom.rotateX(-Math.PI / 2);
    const wColors = new Float32Array(N * N * 3);
    waterColorAttr = new THREE.BufferAttribute(wColors, 3);
    wGeom.setAttribute('color', waterColorAttr);
    waterPosAttr = wGeom.getAttribute('position');

    const waterMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      transmission: 0.8, // glass-like refraction
      transparent: true,
      opacity: 0.95,
      ior: 1.333,
      thickness: 10,
      roughness: 0.06,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMap,
      envMapIntensity: 1.0,
      depthWrite: false,
    });

    inlandWaterMesh = new THREE.Mesh(wGeom, waterMat);
    inlandWaterMesh.renderOrder = 1;
    scene.add(inlandWaterMesh);

    // --- Sea plane ---
    const seaGeom = new THREE.PlaneGeometry(planeWidth, planeHeight, 1, 1);
    seaGeom.rotateX(-Math.PI / 2);
    const seaMat = new THREE.MeshPhysicalMaterial({
      color: 0x3aa7ff,
      transmission: 0.8,
      transparent: true,
      opacity: 0.95,
      ior: 1.333,
      thickness: 20,
      roughness: 0.05,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      envMap,
      envMapIntensity: 1.2,
      depthWrite: false,
    });
    seaMesh = new THREE.Mesh(seaGeom, seaMat);
    seaMesh.renderOrder = 0;
    scene.add(seaMesh);

    // Frame camera
    camera.position.set(
      0,
      Math.max(planeWidth, planeHeight) * 0.9,
      Math.max(planeWidth, planeHeight) * 0.9,
    );
    controls.target.set(0, 0, 0);
    controls.update();
  }

  /**
   * Update terrain vertices/colors.
   * @param {Float32Array} landHeight
   * @param {number} seaLevel
   */
  function updateTerrain(landHeight, seaLevel) {
    if (!terrainPosAttr || !terrainColorAttr || !terrainMesh) return;
    const verts = /** @type {Float32Array} */ (terrainPosAttr.array);
    const colors = /** @type {Float32Array} */ (terrainColorAttr.array);
    const N = currentN;

    /**
     * @param {number} i
     * @param {number} r
     * @param {number} g
     * @param {number} b
     */
    function setColor(i, r, g, b) {
      const k = i * 3;
      colors[k] = r;
      colors[k + 1] = g;
      colors[k + 2] = b;
    }

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const vyIndex = i * 3 + 1;
        const h = landHeight[i];
        verts[vyIndex] = h;

        // Simple elevation palette
        const rel = h - seaLevel;
        if (rel < -2) {
          setColor(i, 0.1, 0.2, 0.35);
        } else if (rel < 2) {
          setColor(i, 0.92, 0.86, 0.62);
        } else if (rel < 40) {
          setColor(i, 0.32, 0.55, 0.25);
        } else if (rel < 120) {
          setColor(i, 0.55, 0.55, 0.55);
        } else {
          setColor(i, 1.0, 1.0, 1.0);
        }
      }
    }

    terrainPosAttr.needsUpdate = true;
    terrainColorAttr.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
  }

  /**
   * Update inland water surface (flat, reflective) with color by depth & sediment.
   * @param {Float32Array} landHeight
   * @param {Float32Array} waterDepth
   * @param {Float32Array} sediment
   * @param {number} seaLevel
   * @param {number} waterMinDepth
   * @param {number} waterDepthMax
   * @param {number} sedimentTintScale
   */
  function updateInlandWater(
    landHeight,
    waterDepth,
    sediment,
    seaLevel,
    waterMinDepth,
    waterDepthMax,
    sedimentTintScale,
  ) {
    if (!waterPosAttr || !waterColorAttr || !inlandWaterMesh) return;
    const verts = /** @type {Float32Array} */ (waterPosAttr.array);
    const colors = /** @type {Float32Array} */ (waterColorAttr.array);
    const N = currentN;

    const deepBlue = [0.05, 0.25, 0.6];
    const shallowBlue = [0.55, 0.85, 1.0];
    const tanSed = [0.74, 0.62, 0.4];

    /**
     * @param {number[]} a
     * @param {number[]} b
     * @param {number} t
     * @returns {number[]}
     */
    function mix(a, b, t) {
      return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];
    }

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const vyIndex = i * 3 + 1;
        const d = waterDepth[i];

        if (d > waterMinDepth) {
          const surface = landHeight[i] + d;
          verts[vyIndex] = surface;

          // Depth-based blue
          const tDepth = Math.max(
            0,
            Math.min(1, d / Math.max(1e-3, waterDepthMax)),
          );
          let c = mix(shallowBlue, deepBlue, tDepth);

          // Sediment tint toward tan/brown
          const sed = sediment[i];
          const tSed = Math.max(0, Math.min(1, sed * sedimentTintScale));
          c = mix(c, tanSed, tSed);

          const k = i * 3;
          colors[k] = c[0];
          colors[k + 1] = c[1];
          colors[k + 2] = c[2];
        } else {
          // Hide vertex by sinking below sea plane; keep color same
          verts[vyIndex] = seaLevel - 1000;
          const k = i * 3;
          colors[k] = colors[k] || 0;
          colors[k + 1] = colors[k + 1] || 0;
          colors[k + 2] = colors[k + 2] || 0;
        }
      }
    }

    waterPosAttr.needsUpdate = true;
    waterColorAttr.needsUpdate = true;
    inlandWaterMesh.geometry.computeVertexNormals();
  }

  /**
   * Render call. Rebuilds meshes if sim size changed.
   * @param {{ landHeight: Float32Array, waterDepth: Float32Array, sediment: Float32Array }} sim
   * @param {{ cellSize: number, seaLevel: number, showWater?: boolean, waterMinDepth?: number, waterDepthMax?: number, sedimentTintScale?: number }} opts
   */
  function render(sim, opts) {
    const N = Math.round(Math.sqrt(sim.landHeight.length)) | 0;
    const waterMinDepth = opts.waterMinDepth ?? 0.02;
    const waterDepthMax = opts.waterDepthMax ?? 5.0;
    const sedimentTintScale = opts.sedimentTintScale ?? 0.5;

    if (N !== currentN) rebuildMeshes(N, opts.cellSize);

    if (seaMesh) {
      seaMesh.position.y = opts.seaLevel;
      seaMesh.visible = opts.showWater !== false;
    }

    updateTerrain(sim.landHeight, opts.seaLevel);
    updateInlandWater(
      sim.landHeight,
      sim.waterDepth,
      sim.sediment,
      opts.seaLevel,
      waterMinDepth,
      waterDepthMax,
      sedimentTintScale,
    );

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    controls.update();
    renderer.render(scene, camera);
  }

  function onResize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  return render;
}
