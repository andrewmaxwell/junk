import * as THREE from 'three';
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
birdGeometry.computeVertexNormals();

export const makeRenderer = () => {
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight);
  camera.position.x = -75;
  camera.position.y = 100;
  camera.position.z = 50;
  camera.rotation.x = -1.3;
  camera.rotation.y = -0.4;
  camera.rotation.z = -0.94;

  window.camera = camera;

  const renderer = new THREE.WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('skyblue');
  scene.fog = new THREE.FogExp2('skyblue', 0.003);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(0, 1000, 0);
  light.castShadow = true;
  light.shadow.mapSize.width = 1024;
  light.shadow.mapSize.height = 1024;
  light.shadow.camera.left = -400;
  light.shadow.camera.right = 400;
  light.shadow.camera.top = 400;
  light.shadow.camera.bottom = -400;
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 1500;
  scene.add(light);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshPhongMaterial({color: 0xffffff}),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -200;
  plane.receiveShadow = true;
  scene.add(plane);

  return {
    render() {
      renderer.render(scene, camera);
      controls.update();
    },
    addBird(i) {
      const material = new THREE.MeshPhongMaterial({
        color: `hsl(${i * 360}, 100%, 75%)`,
        side: THREE.DoubleSide,
      });
      const bird = new THREE.Mesh(birdGeometry, material);
      bird.castShadow = true;
      bird.receiveShadow = true;

      bird.position.x = Math.random() * 400 - 200;
      bird.position.y = Math.random() * 400 - 200;
      bird.position.z = Math.random() * 400 - 200;
      bird.userData.direction = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();

      scene.add(bird);
      return bird;
    },
  };
};
