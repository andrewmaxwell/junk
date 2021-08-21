const {
  Matter: {
    Engine,
    World,
    Bodies,
    Body,
    Composite,
    Vertices,
    MouseConstraint,
    Constraint,
    Events,
  },
} = window;

export class Simulator {
  reset({enableMouse = true} = {}) {
    this.engine = window.engine = Engine.create({
      positionIterations: 12,
      velocityIterations: 8,
      constraintIterations: 4,
    });
    if (enableMouse)
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
    for (const b of this.getBodies()) Body.set(b, options);
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
      position: Vertices.centre(vertices),
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
    return this.getBodies().find((b) => Vertices.contains(b.vertices, {x, y}));
  }
  setVelocity(body, x, y) {
    Body.setVelocity(body, {x, y});
  }
  addConstraint(opts) {
    const constraint = Constraint.create(opts);
    Composite.add(this.engine.world, constraint);
    return constraint;
  }
  getCollisionGroup() {
    return Body.nextGroup(true);
  }
  rotate(body, angle) {
    Body.rotate(body, angle);
    return body;
  }
  onStep(func) {
    Events.on(this.engine, 'beforeUpdate', func);
  }
}
