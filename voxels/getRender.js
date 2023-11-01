import {WebGLRenderer} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.157.0/three.module.js';

export const getRender = ({canvas, camera, scene}) => {
  const renderer = new WebGLRenderer({antialias: true, canvas});

  let renderRequested = false;

  const requestRenderIfNotRequested = () => {
    if (renderRequested) return;
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      renderer.render(scene, camera);
    });
  };

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    requestRenderIfNotRequested();
  };

  window.addEventListener('resize', resize);

  resize();

  return requestRenderIfNotRequested;
};
