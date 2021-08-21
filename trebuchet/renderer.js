const {Render} = window.Matter;

export class Renderer {
  constructor(canvas, engine, width, height) {
    this._r = window._r = Render.create({
      canvas,
      engine,
      options: {width, height},
    });
  }
  render(text) {
    Render.lookAt(
      this._r,
      this._r.engine.world.bodies.filter((b) => b.mass < Infinity),
      {x: 10, y: 10}
    );
    Render.world(this._r);

    const ctx = this._r.context;
    ctx.font = '18px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText(text, 3, 20);
  }
}
