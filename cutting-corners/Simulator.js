const {
  Matter: {Engine, World, Bodies, Body, Composite, Vertices, MouseConstraint}
} = window;

export class Simulator {
  reset() {
    this.engine = window.engine = Engine.create({
      positionIterations: 12,
      velocityIterations: 8,
      constraintIterations: 4
    });
    World.add(
      this.engine.world,
      MouseConstraint.create(this.engine, {element: document.body})
    );
  }
  step() {
    Engine.update(this.engine);
  }
  getBodies() {
    return this.engine.world.bodies;
  }
  setBodyOptions(options) {
    this.getBodies().forEach(b => Body.set(b, options));
  }
  setGravity(v) {
    this.engine.world.gravity.y = v;
  }
  removeBody(body) {
    Composite.remove(this.engine.world, body);
  }
  addShape(vertices, options = {}) {
    const body = Body.create({
      ...options,
      vertices,
      position: Vertices.centre(vertices)
    });
    Composite.add(this.engine.world, body);
    return body;
  }
  addCircle(x, y, rad, options = {}) {
    const body = Bodies.circle(x, y, rad, options);
    Composite.add(this.engine.world, body);
    return body;
  }
  addRectangle(x, y, w, h, options = {}) {
    const body = Bodies.rectangle(x, y, w, h, options);
    Composite.add(this.engine.world, body);
    return body;
  }
  bodyAt(x, y) {
    return this.getBodies().find(b => Vertices.contains(b.vertices, {x, y}));
  }
  setVelocity(body, x, y) {
    Body.setVelocity(body, {x, y});
  }
}
