export class Controls {
  constructor() {
    this.pressing = {};
    window.addEventListener('keydown', (e) => {
      this.pressing[e.code] = true;
      // console.log(e);
    });
    window.addEventListener('keyup', (e) => {
      delete this.pressing[e.code];
    });
  }
}
