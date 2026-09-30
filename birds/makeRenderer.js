import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const birdGeometry = new THREE.InstancedBufferGeometry();
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

// dusk: the sun has just set toward -z, where the default view looks
const sunDirection = new THREE.Vector3(0.1, 0.1, -1).normalize();
const horizonColor = new THREE.Color(0xf6a562);
const midSkyColor = new THREE.Color(0x8a4f7d);
const zenithColor = new THREE.Color(0x1b1f4b);
// birds shade from dark to lit by how directly they fly toward the sunset, so
// a flock changes color in waves as it turns
const darkBirdColor = new THREE.Color(0x050408);
const litBirdColor = new THREE.Color(0x3a2218);

// Places and animates each bird in the vertex shader, from per-bird position,
// direction, bank and flap phase. Used for both the visible and shadow passes.
const addBirdVertexShader = (shader, flapAngle) => {
  shader.uniforms.flapAngle = flapAngle;
  shader.uniforms.sunDirection = {value: sunDirection};
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      attribute float wingTip;
      attribute float flapPhase;
      attribute vec3 birdPosition;
      attribute vec3 birdDirection;
      attribute float birdBank;
      uniform float flapAngle;
      uniform vec3 sunDirection;
      varying float towardSun;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed.y += wingTip * (sin(flapAngle + flapPhase) * 1.2 - 0.6);

      // the bird's own axes: z along its heading, then rolled by its bank
      vec3 side = cross(vec3(0.0, 1.0, 0.0), birdDirection);
      side = length(side) > 0.0001 ? normalize(side) : vec3(1.0, 0.0, 0.0);
      vec3 up = cross(birdDirection, side);
      vec3 bankedSide = side * cos(birdBank) + up * sin(birdBank);
      vec3 bankedUp = up * cos(birdBank) - side * sin(birdBank);
      transformed =
        birdPosition +
        bankedSide * transformed.x +
        bankedUp * transformed.y +
        birdDirection * transformed.z;

      towardSun = 0.5 + 0.5 * dot(birdDirection, sunDirection);`,
    );
};

const makeSky = () =>
  new THREE.Mesh(
    new THREE.SphereGeometry(1000),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        sunDirection: {value: sunDirection},
        horizonColor: {value: horizonColor},
        midSkyColor: {value: midSkyColor},
        zenithColor: {value: zenithColor},
      },
      vertexShader: `
        varying vec3 direction;
        void main() {
          direction = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 sunDirection;
        uniform vec3 horizonColor;
        uniform vec3 midSkyColor;
        uniform vec3 zenithColor;
        varying vec3 direction;
        void main() {
          vec3 dir = normalize(direction);
          vec3 color = mix(horizonColor, midSkyColor, smoothstep(0.0, 0.3, dir.y));
          color = mix(color, zenithColor, smoothstep(0.2, 0.9, dir.y));
          color += horizonColor * 0.6 * pow(max(dot(dir, sunDirection), 0.0), 6.0);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );

export const makeRenderer = ({numBirds, positions, directions, banks}) => {
  const camera = new THREE.PerspectiveCamera(99, innerWidth / innerHeight);
  camera.position.set(-51, -151, 235);

  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(-8, -57, -21);
  controls.update();

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(horizonColor, 0.003);

  const sky = makeSky();
  sky.renderOrder = -1; // drawn first, behind everything
  scene.add(sky);

  // sky light from above, sunset glow from below the horizon
  scene.add(new THREE.HemisphereLight(midSkyColor, horizonColor, 3));

  const light = new THREE.DirectionalLight(horizonColor, 2);
  light.position.set(0, 1000, 0);
  light.castShadow = true;
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.camera.left = -600;
  light.shadow.camera.right = 600;
  light.shadow.camera.top = 600;
  light.shadow.camera.bottom = -600;
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 1500;
  scene.add(light);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshPhongMaterial({color: 0x6b5a6e}),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -200;
  plane.receiveShadow = true;
  scene.add(plane);

  const birdPositions = new THREE.InstancedBufferAttribute(positions, 3);
  const birdDirections = new THREE.InstancedBufferAttribute(directions, 3);
  const birdBanks = new THREE.InstancedBufferAttribute(banks, 1);
  for (const attribute of [birdPositions, birdDirections, birdBanks]) {
    attribute.setUsage(THREE.DynamicDrawUsage);
  }
  birdGeometry.instanceCount = numBirds;
  birdGeometry.setAttribute('birdPosition', birdPositions);
  birdGeometry.setAttribute('birdDirection', birdDirections);
  birdGeometry.setAttribute('birdBank', birdBanks);
  birdGeometry.setAttribute(
    'flapPhase',
    new THREE.InstancedBufferAttribute(
      Float32Array.from({length: numBirds}, () => Math.random() * Math.PI * 2),
      1,
    ),
  );

  const flapAngle = {value: 0};

  // flat shading takes normals from the rendered triangles, so the wings
  // catch the light as they flap
  const birdMaterial = new THREE.MeshPhongMaterial({
    side: THREE.DoubleSide,
    flatShading: true,
    fog: false, // distant birds stay dark rather than fading into the sky
  });
  birdMaterial.onBeforeCompile = (shader) => {
    addBirdVertexShader(shader, flapAngle);
    shader.uniforms.darkBirdColor = {value: darkBirdColor};
    shader.uniforms.litBirdColor = {value: litBirdColor};
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 darkBirdColor;
        uniform vec3 litBirdColor;
        varying float towardSun;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(darkBirdColor, litBirdColor, towardSun * towardSun);`,
      );
  };

  const birdShadowMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  birdShadowMaterial.onBeforeCompile = (shader) => {
    addBirdVertexShader(shader, flapAngle);
  };

  const birds = new THREE.Mesh(birdGeometry, birdMaterial);
  birds.customDepthMaterial = birdShadowMaterial;
  birds.castShadow = true;
  // the shader moves the birds, so the geometry's own bounds mean nothing
  birds.frustumCulled = false;
  scene.add(birds);

  return {
    render() {
      // the flock updates these arrays in place
      birdPositions.needsUpdate = true;
      birdDirections.needsUpdate = true;
      birdBanks.needsUpdate = true;
      // the sky is a dome around the camera, so it always looks infinitely far
      sky.position.copy(camera.position);
      flapAngle.value = (performance.now() / 1000) * flapsPerSecond * Math.PI * 2;

      renderer.render(scene, camera);
    },
  };
};
