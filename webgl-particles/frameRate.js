export class FrameRateDisplay {
  constructor() {
    this.total = 0;
    this.frames = 0;
    const div = (this.frameRateDiv = document.createElement('div'));
    div.style.position = 'fixed';
    div.style.top = 0;
    div.style.right = 0;
    document.body.append(div);
  }
  measure(func) {
    const start = performance.now();
    func();
    this.total += performance.now() - start;
    this.frameRateDiv.innerHTML =
      Math.round((100 * this.total) / ++this.frames) / 100 + ' ms';
  }
}
