import * as THREE from 'three/webgpu';
import {
  Fn,
  attribute,
  color,
  cos,
  cross,
  dot,
  length,
  max,
  mix,
  normalWorldGeometry,
  normalize,
  positionLocal,
  pow,
  select,
  sin,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const birdGeometry = new THREE.BufferGeometry();
birdGeometry.setAttribute(
  'position',
  new THREE.BufferAttribute(
    new Float32Array([
      0,
      0,
      0.5, // head
      2,
      1,
      0, // right wing tip
      0,
      0,
      -0.5, // base of tail

      0,
      0,
      0.5, // head
      0,
      0,
      -0.5, // base of tail
      -2,
      1,
      0, // left wing tip

      0,
      0,
      -0.5, // base of tail
      1,
      0,
      -1, // tail right
      -1,
      0,
      -1, // tail left
    ]),
    3,
  ),
);
// 1 on the wing tips, which are the only vertices that flap
birdGeometry.setAttribute(
  'wingTip',
  new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 0, 1, 0, 0, 0]), 1),
);

const flapsPerSecond = 3;

// low to the ground at the edge of the roost, looking up through the flock
const cameraStart = new THREE.Vector3(-304, -135, 799);
const cameraTarget = new THREE.Vector3(-11, 6, -14);
const cameraFov = 65;
const upAxis = new THREE.Vector3(0, 1, 0);
const driftAngle = 0.4; // radians to either side
const driftSpeed = 0.05; // how fast the sway goes; one full sway is 2π / this seconds

// dusk: the sun has just set toward -z, where the default view looks
const sunDirection = uniform(new THREE.Vector3(0.1, 0.1, -1).normalize());
const horizonColor = 0xf6a562;
const midSkyColor = 0x8a4f7d;
const zenithColor = 0x1b1f4b;
// birds shade from dark to lit by how directly they fly toward the sunset, so
// a flock changes color in waves as it turns
const darkBirdColor = 0x050408;
const litBirdColor = 0x3a2218;

const sky = Fn(() => {
  const direction = normalize(normalWorldGeometry);
  const low = mix(color(horizonColor), color(midSkyColor), smoothstep(0, 0.3, direction.y));
  const gradient = mix(low, color(zenithColor), smoothstep(0.2, 0.9, direction.y));
  const glow = pow(max(dot(direction, sunDirection), 0), 6);

  return gradient.add(color(horizonColor).mul(glow).mul(0.6));
});

// The flock's positions and directions live in GPU buffers that its compute
// shaders update; the bird material reads them straight from there.
export const makeRenderer = async ({numBirds, positions, directions}) => {
  const camera = new THREE.PerspectiveCamera(cameraFov,innerWidth / innerHeight, 1, 20000);

  const renderer = new THREE.WebGPURenderer({antialias: true});
  renderer.setPixelRatio(devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(cameraTarget);

  // Until the viewer takes over, the camera sways slowly from side to side,
  // staying on the side that looks toward the sunset.
  let drifting = true;
  controls.addEventListener('start', () => {
    drifting = false;
  });
  const driftCamera = (seconds) => {
    const angle = Math.sin(seconds * driftSpeed) * driftAngle;
    camera.position
      .copy(cameraStart)
      .sub(cameraTarget)
      .applyAxisAngle(upAxis, angle)
      .add(cameraTarget);
    camera.lookAt(cameraTarget);
  };
  driftCamera(0);

  // for picking a starting view: [ and ] change the field of view, and every
  // camera change is logged
  const logCamera = () => {
    const round = (vector) => vector.toArray().map(Math.round).join(',');
    console.log(`${round(camera.position)} target: ${round(controls.target)} fov: ${camera.fov}`);
  };
  controls.addEventListener('change', logCamera);
  addEventListener('keydown', ({key}) => {
    if (key !== '[' && key !== ']') return;

    drifting = false;
    camera.fov = Math.min(120, Math.max(5, camera.fov + (key === '[' ? -1 : 1)));
    camera.updateProjectionMatrix();
    logCamera();
  });

  const scene = new THREE.Scene();
  scene.backgroundNode = sky();
  scene.fog = new THREE.FogExp2(horizonColor, 0.0005);

  // sky light from above, sunset glow from below the horizon
  scene.add(new THREE.HemisphereLight(midSkyColor, horizonColor, 3));

  const light = new THREE.DirectionalLight(horizonColor, 2);
  light.position.set(0, 1000, 0);
  light.castShadow = true;
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.camera.left = -1000;
  light.shadow.camera.right = 1000;
  light.shadow.camera.top = 1000;
  light.shadow.camera.bottom = -1000;
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 1500;
  scene.add(light);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(20000, 20000),
    new THREE.MeshPhongMaterial({color: 0x6b5a6e}),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -200;
  plane.receiveShadow = true;
  scene.add(plane);

  const flapAngle = uniform(0);
  const bird = positions.toAttribute(); // xyz, flap phase
  const heading = directions.toAttribute(); // xyz, bank

  // with no normals on the geometry, shading uses the rendered triangles, so
  // the wings catch the light as they flap
  const birdMaterial = new THREE.MeshPhongNodeMaterial({
    side: THREE.DoubleSide,
    fog: false, // distant birds stay dark rather than fading into the sky
  });

  // places and animates each bird; also used for the shadow pass
  birdMaterial.positionNode = Fn(() => {
    const flap = sin(flapAngle.add(bird.w)).mul(1.2).sub(0.6);
    const local = positionLocal.add(vec3(0, attribute('wingTip', 'float').mul(flap), 0));

    // the bird's own axes: z along its heading, then rolled by its bank
    const forward = heading.xyz;
    const levelSide = cross(vec3(0, 1, 0), forward);
    const side = select(length(levelSide).greaterThan(0.0001), normalize(levelSide), vec3(1, 0, 0));
    const up = cross(forward, side);
    const bankedSide = side.mul(cos(heading.w)).add(up.mul(sin(heading.w)));
    const bankedUp = up.mul(cos(heading.w)).sub(side.mul(sin(heading.w)));

    return bird.xyz
      .add(bankedSide.mul(local.x))
      .add(bankedUp.mul(local.y))
      .add(forward.mul(local.z));
  })();

  const towardSun = dot(heading.xyz, sunDirection).mul(0.5).add(0.5);
  birdMaterial.colorNode = mix(
    color(darkBirdColor),
    color(litBirdColor),
    towardSun.mul(towardSun),
  );

  const birds = new THREE.Mesh(birdGeometry, birdMaterial);
  birds.count = numBirds;
  birds.castShadow = true;
  // the shader moves the birds, so the geometry's own bounds mean nothing
  birds.frustumCulled = false;
  scene.add(birds);

  return {
    // runs one of the flock's compute shaders
    compute(shader) {
      renderer.compute(shader);
    },
    render() {
      if (drifting) driftCamera(performance.now() / 1000);
      flapAngle.value = (performance.now() / 1000) * flapsPerSecond * Math.PI * 2;
      renderer.render(scene, camera);
    },
  };
};
