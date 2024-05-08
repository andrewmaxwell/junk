/* eslint-disable import/no-unresolved */
/* eslint-disable import/no-unresolved */
import * as THREE from 'three';
import {makeRenderer} from './makeRenderer.js';

const numBirds = 10000;
const turnSpeed = 0.1; // radians
const moveSpeed = 0.3;

const {render, addBirdMesh} = makeRenderer();

const birds = [];
for (let i = 0; i < numBirds; i++) {
  const b = (birds[i] = addBirdMesh(i / numBirds));

  b.position.x = Math.random() * 400 - 200;
  b.position.y = Math.random() * 400 - 200;
  b.position.z = Math.random() * 400 - 200;
  b.userData = {
    direction: new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize(),
  };
}

function animate() {
  requestAnimationFrame(animate);

  birds.forEach((bird, i, birds) => {
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
      bird.position.z + bird.userData.direction.z
    );
  });

  render();
}

animate();
