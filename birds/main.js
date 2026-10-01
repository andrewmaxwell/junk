import * as THREE from 'three';
import {makeRenderer} from './makeRenderer.js';

const numBirds = 10000;
const turnSpeed = 0.2;
const moveSpeed = 0.5;

const moveBird = (bird, i, birds) => {
  const targetDirection = new THREE.Vector3()
    .subVectors(birds[(i + 1) % birds.length].position, bird.position)
    .normalize();

  bird.userData.direction = bird.userData.direction
    .lerp(targetDirection, turnSpeed)
    .normalize();

  bird.position.addScaledVector(bird.userData.direction, moveSpeed);

  bird.lookAt(
    bird.position.x + bird.userData.direction.x,
    bird.position.y + bird.userData.direction.y,
    bird.position.z + bird.userData.direction.z,
  );
};

const {render, addBird} = makeRenderer();

const birds = Array.from({length: numBirds}, (_, i) => addBird(i / numBirds));

const loop = () => {
  birds.forEach(moveBird);
  render();
  requestAnimationFrame(loop);
};

loop();
