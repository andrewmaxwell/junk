export const initControls = (canvas, camera) => {
  const pressing = {};
  let mouse = {};

  const listeners = {
    keydown(e) {
      pressing[e.code] = true;
      // console.log(e);
    },
    keyup(e) {
      pressing[e.code] = false;
    },
    wheel(e) {
      camera.changeZoom(e.deltaY, e.pageX, e.pageY);
    },
    mousewheel(e) {
      e.preventDefault();
    },
    resize() {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
    },
    mousedown() {
      mouse.pressing = true;
    },
    mouseup() {
      mouse.pressing = false;
    },
    mousemove(e) {
      Object.assign(mouse, camera.toWorldCoords(e.pageX, e.pageY));
    },
  };
  for (var e in listeners) {
    window.addEventListener(e, listeners[e]);
  }

  listeners.resize();

  return {pressing, mouse};
};
