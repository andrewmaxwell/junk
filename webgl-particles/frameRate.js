export class FrameRateDisplay {
  constructor() {
    this.prev;
    this.frames = 0;
    const div = (this.frameRateDiv = document.createElement('div'));
    div.style.position = 'fixed';
    div.style.top = 0;
    div.style.right = 0;
    document.body.append(div);
  }
  tick() {
    this.frames++;
    const now = performance.now();
    const fps = Math.round(1000 / (now - this.prev));
    this.frameRateDiv.innerHTML = `${fps} fps`;
    this.prev = now;
  }
}
