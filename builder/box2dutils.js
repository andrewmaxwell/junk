'use strict';
const {Box2D} = window;

export function Sim(opts) {
  var scale = opts.scale || 0.01;
  var sim = this;

  sim.joints = [];
  sim.bodies = [];

  var v = Box2D.Common.Math.b2Vec2,
    b2AABB = Box2D.Collision.b2AABB,
    b2BodyDef = Box2D.Dynamics.b2BodyDef,
    b2Body = Box2D.Dynamics.b2Body,
    b2FixtureDef = Box2D.Dynamics.b2FixtureDef,
    // b2Fixture = Box2D.Dynamics.b2Fixture,
    b2World = Box2D.Dynamics.b2World,
    // b2MassData = Box2D.Collision.Shapes.b2MassData,
    b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape,
    b2CircleShape = Box2D.Collision.Shapes.b2CircleShape,
    b2DebugDraw = Box2D.Dynamics.b2DebugDraw,
    b2MouseJointDef = Box2D.Dynamics.Joints.b2MouseJointDef,
    b2RevoluteJointDef = Box2D.Dynamics.Joints.b2RevoluteJointDef,
    b2PrismaticJointDef = Box2D.Dynamics.Joints.b2PrismaticJointDef;
  // b2EdgeShape = Box2D.Collision.Shapes.b2EdgeShape;

  var world = new b2World(new v(0, opts.gravity || 0), true);

  if (opts.canvas !== false) {
    var C = opts.canvas || document.createElement('canvas');
    C.width = innerWidth;
    C.height = innerHeight;
    var ctx = C.getContext('2d');
    if (!opts.canvas) document.body.appendChild(C);

    var debugDraw = new b2DebugDraw();
    debugDraw.SetSprite(ctx);
    debugDraw.SetDrawScale(1 / scale);
    debugDraw.SetFillAlpha(0.25);
    debugDraw.SetLineThickness(0);
    debugDraw.SetFlags(1);
    world.SetDebugDraw(debugDraw);

    sim.ctx = ctx;

    window.addEventListener('resize', function () {
      C.width = innerWidth;
      C.height = innerHeight;
    });
  }

  function addShape(props) {
    var fixDef = new b2FixtureDef();
    fixDef.density = props.density === undefined ? 1 : props.density;
    fixDef.friction = props.friction === undefined ? 0.5 : props.friction;
    fixDef.restitution =
      props.restitution === undefined ? 0.2 : props.restitution;
    if (props.group !== undefined) fixDef.filter.groupIndex = props.group;
    if (props.noCollide) fixDef.filter.maskBits = 0;

    // RECTANGLE
    if (props.width && props.height) {
      fixDef.shape = new b2PolygonShape();
      fixDef.shape.SetAsOrientedBox(
        (props.width * scale) / 2,
        (props.height * scale) / 2,
        props.pos
          ? new v(props.pos[0] * scale, props.pos[1] * scale)
          : new v(0, 0),
        props.angle || 0
      );
    }

    // CIRCLE
    else if (props.radius) {
      fixDef.shape = new b2CircleShape(props.radius * scale);
    }

    // POLYGON
    else if (props.pts) {
      var points = props.pts.map(function (coord) {
        return new v(coord[0] * scale, coord[1] * scale);
      });
      fixDef.shape = new b2PolygonShape();
      fixDef.shape.SetAsArray(points, points.length);
    }

    return fixDef;
  }

  sim.make = function (props) {
    // MAKE A JOINT
    if (props.a && props.b && !props.pts && !props.radius) {
      // PRISMATIC
      if (props.lower !== undefined) {
        var jointDef = new b2PrismaticJointDef();
        jointDef.Initialize(
          props.a,
          props.b,
          props.b.GetWorldCenter(),
          new v(props.direction[0], props.direction[1])
        );
        jointDef.lowerTranslation = props.lower * scale;
        jointDef.upperTranslation = props.upper * scale;
        jointDef.enableLimit = true;
        jointDef.enableMotor = true;
        return world.CreateJoint(jointDef);
      }

      // REVOLUTE
      jointDef = new b2RevoluteJointDef();
      jointDef.bodyA = props.a;
      jointDef.bodyB = props.b;
      if (props.offsetA)
        jointDef.localAnchorA.Set(
          props.offsetA[0] * scale,
          props.offsetA[1] * scale
        );
      if (props.offsetB)
        jointDef.localAnchorB.Set(
          props.offsetB[0] * scale,
          props.offsetB[1] * scale
        );
      if (props.speed) {
        jointDef.enableMotor = true;
        jointDef.motorSpeed = props.speed;
        if (props.torque) jointDef.maxMotorTorque = props.torque;
      }

      var joint = world.CreateJoint(jointDef);
      sim.joints.push(joint);

      return joint;
    }

    // MAKE A BODY
    var bodyDef = new b2BodyDef();
    bodyDef.type = props.fixed ? b2Body.b2_staticBody : b2Body.b2_dynamicBody;

    // SET POSITION
    if (props.x !== undefined && props.y !== undefined) {
      bodyDef.position.Set(props.x * scale, props.y * scale);
    }
    if (props.angle) {
      bodyDef.angle = props.angle;
    }

    var body = world.CreateBody(bodyDef);

    // MULTIPLE SHAPES
    if (props.shapes) {
      props.shapes.forEach(function (shape) {
        body.CreateFixture(addShape(shape));
      });
    }

    // SINGLE SHAPE
    else body.CreateFixture(addShape(props));

    if (props.xs || props.ys || props.as) {
      sim.setVelocity(body, props.xs || 0, props.ys || 0, props.as || 0);
    }
    // if (props.moveSpeed){
    // 	sim.applyImpulse(body, props.moveSpeed, props.moveAngle || 0)
    // }
    // if (props.spin){
    // 	sim.applyTorque(body, props.spin)
    // }

    var data = props.data || {};
    data.damage = 0;
    data.props = props;
    props._body = body;
    body.SetUserData(data);

    sim.bodies.push(body);

    return body;
  };

  sim.applyImpulse = function (body, magnitude, angle) {
    body.ApplyImpulse(
      new v(
        scale * magnitude * Math.cos(angle),
        scale * magnitude * Math.sin(angle)
      ),
      body.GetWorldCenter()
    );
    return body;
  };
  sim.applyTorque = function (body, torque) {
    body.ApplyTorque(torque);
    return body;
  };
  sim.setPosition = function (body, x, y) {
    body.SetPosition(new v(x * scale, y * scale));
  };
  sim.setVelocity = function (body, xs, ys, as) {
    body.SetLinearVelocity(new v(scale * xs, scale * ys));
    body.SetAngularVelocity(as);
  };

  sim.tick = function () {
    world.Step(opts.timeStep || 1 / 60, 8, 3);
    // world.ClearForces()

    // this.bodies.forEach(function(ob){
    // 	var data = ob.GetUserData()
    // 	if (data.eachFrame){
    // 		data.eachFrame.call(ob, data)
    // 	}
    // })
  };
  sim.debugDraw = function () {
    world.DrawDebugData();

    if (opts.showBodyData || opts.showJointData) {
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (opts.showBodyData) {
        sim.bodies.forEach(function (b) {
          var pos = sim.getInfo(b);
          ctx.fillText(opts.showBodyData(b), pos.cx, pos.cy);
        });
      }

      if (opts.showJointData) {
        sim.joints.forEach(function (j) {
          var pos = sim.getInfo(j);
          ctx.fillText(opts.showJointData(j), pos.x, pos.y);
        });
      }
    }
  };

  sim.bodyAt = function (x, y) {
    var selectedBody;

    var aabb = new b2AABB();
    aabb.lowerBound.Set(x, y);
    aabb.upperBound.Set(x, y);

    world.QueryAABB(function (fixture) {
      if (fixture.GetBody().GetType() != b2Body.b2_staticBody) {
        if (
          fixture
            .GetShape()
            .TestPoint(fixture.GetBody().GetTransform(), new v(x, y))
        ) {
          selectedBody = fixture.GetBody();
          return false;
        }
      }
      return true;
    }, aabb);

    return selectedBody;
  };

  var mouseJoint;
  sim.makeMouseJoint = function (x, y) {
    x *= scale;
    y *= scale;

    var body = sim.bodyAt(x, y);
    if (!body) return false;
    var md = new b2MouseJointDef();
    md.bodyA = world.GetGroundBody();
    md.bodyB = body;
    md.target.Set(x, y);
    md.collideConnected = true;
    md.maxForce = 3000.0 * body.GetMass();
    body.SetAwake(true);
    mouseJoint = world.CreateJoint(md);
  };
  sim.moveMouseJoint = function (x, y) {
    if (mouseJoint) mouseJoint.SetTarget(new v(x * scale, y * scale));
  };
  sim.destroyMouseJoint = function () {
    if (mouseJoint) world.DestroyJoint(mouseJoint);
    mouseJoint = false;
  };

  sim.reset = function () {
    sim.bodies.forEach(function (ob) {
      world.DestroyBody(ob);
    });
    sim.bodies = [];
    sim.joints = [];
  };

  sim.destroy = function (ob) {
    var bodiesIndex = sim.bodies.indexOf(ob);
    if (bodiesIndex >= 0) {
      sim.bodies.splice(bodiesIndex, 1);
      world.DestroyBody(ob);
    } else {
      var jointIndex = sim.joints.indexOf(ob);
      if (jointIndex >= 0) {
        sim.joints.splice(jointIndex, 1);
        world.DestroyJoint(ob);
      }
    }
  };

  sim.getInfo = function (ob) {
    if (ob.GetPosition) {
      const pos = ob.GetPosition(),
        centroid = ob.GetWorldCenter(),
        lin = ob.GetLinearVelocity();
      return {
        x: pos.x / scale,
        y: pos.y / scale,
        cx: centroid.x / scale,
        cy: centroid.y / scale,
        angle: ob.GetAngle(),
        xs: lin.x / scale,
        ys: lin.y / scale,
        as: ob.GetAngularVelocity(),
        mass: ob.GetMass(),
      };
    } else if (ob.GetReactionForce) {
      const pos = ob.GetAnchorA();
      const pos2 = ob.GetAnchorB();
      const forceData = ob.GetReactionForce(opts.timeStep || 1 / 60);
      return {
        x: pos.x / scale,
        y: pos.y / scale,
        x2: pos2.x / scale,
        y2: pos2.y / scale,
        force:
          Math.sqrt(forceData.x * forceData.x + forceData.y * forceData.y) /
          scale,
      };
    }
  };

  sim.onCollision = function (callback) {
    var listener = new Box2D.Dynamics.b2ContactListener();

    listener.PostSolve = function (contact, impulse) {
      callback(
        contact.GetFixtureA().GetBody(),
        contact.GetFixtureB().GetBody(),
        impulse.normalImpulses[0]
      );
    };

    world.SetContactListener(listener);
  };

  sim.world = world;

  sim.setContactFilter = function (filterFunc) {
    var filter = new Box2D.Dynamics.b2ContactFilter();
    filter.ShouldCollide = function (fixtureA, fixtureB) {
      return filterFunc(fixtureA, fixtureB);
    };
    world.SetContactFilter(filter);
  };

  if (opts.damage) {
    var damageListener = new Box2D.Dynamics.b2ContactListener();
    damageListener.PostSolve = function (contact, impulse) {
      contact.GetFixtureA().GetBody().GetUserData().damage +=
        impulse.normalImpulses[0] / scale;
      contact.GetFixtureB().GetBody().GetUserData().damage +=
        impulse.normalImpulses[0] / scale;
    };
    world.SetContactListener(damageListener);
  }

  sim.setGravity = function (x, y) {
    world.SetGravity(new v(x, y));
  };
}

export function animationLoop(func) {
  var looping = false;
  function loop() {
    looping = func();
    if (looping) {
      requestAnimationFrame(loop);
    }
  }
  return function () {
    if (!looping) loop();
  };
}

Array.prototype.contains = function (item) {
  return this.indexOf(item) !== -1;
};
