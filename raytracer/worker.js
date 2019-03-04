'use strict';

function v3(x, y, z) {
  return {x, y, z};
}
function sum(a, b) {
  return v3(a.x + b.x, a.y + b.y, a.z + b.z);
}
function add(a, b) {
  a.x += b.x;
  a.y += b.y;
  a.z += b.z;
  return a;
}
function scaled(a, f) {
  return v3(a.x * f, a.y * f, a.z * f);
}
function scaleThis(a, f) {
  a.x *= f;
  a.y *= f;
  a.z *= f;
  return a;
}
function dotProduct(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function crossProduct(a, b) {
  return v3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}
function normalize(a) {
  return scaleThis(a, 1 / Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z));
}
function subtract(a, b) {
  return v3(a.x - b.x, a.y - b.y, a.z - b.z);
}
function minus(a, b) {
  a.x -= b.x;
  a.y -= b.y;
  a.z -= b.z;
  return a;
}

function makeRaytracer(params) {
  var {spheres, floor, getSkyColor, lights, camera, maxDepth} = params;
  var uVector, vVector, leftDown;
  setCamera();
  return {setCamera, samplePixel, getPixel, params};

  function setCamera(newCamera) {
    if (newCamera) Object.assign(camera, newCamera);
    var normalToViewport = normalize(subtract(camera.position, camera.target));
    uVector = normalize(crossProduct(up, normalToViewport));
    vVector = crossProduct(uVector, normalToViewport);

    var cs = subtract(camera.position, camera.target);

    leftDown = add(
      add(
        sum(
          camera.position,
          scaled(normalToViewport, -Math.sqrt(dotProduct(cs, cs)))
        ),
        scaled(uVector, -camera.zoom / 2)
      ),
      scaled(vVector, -camera.zoom / 2)
    );
  }

  function getDistanceToSphere(sphere, rayStart, rayDirection) {
    var sub = subtract(rayStart, sphere.position);
    var bb = dotProduct(rayDirection, sub);
    var sq = bb * bb + sphere.radius * sphere.radius - dotProduct(sub, sub);
    return sq > 0 ? -bb - Math.sqrt(sq) : 0;
  }

  function isShadowed(rayStart, rayDirection) {
    for (var i = 0; i < spheres.length; i++) {
      if (getDistanceToSphere(spheres[i], rayStart, rayDirection) > 0) {
        return true;
      }
    }
    return false;
  }

  function sampleRay(rayStart, rayDirection, depth) {
    var distance = Infinity,
      obj,
      i;

    for (i = 0; i < spheres.length; i++) {
      var d = getDistanceToSphere(spheres[i], rayStart, rayDirection);
      if (!isNaN(d) && d < distance && d > 0) {
        distance = d;
        obj = spheres[i];
      }
    }

    if (!obj) {
      var rayStartZ = rayStart.z;
      var rayDirZ = rayDirection.z;
      if (rayStartZ > 0 && rayDirZ < 0) {
        obj = floor;
        distance = -rayStartZ / rayDirZ;
      }
    }

    if (!obj) return getSkyColor(rayDirection);

    var rayEnd = add(scaled(rayDirection, distance), rayStart);
    var normal = obj.getNormal(rayEnd);
    var color = v3(0, 0, 0);

    for (i = 0; i < lights.length; i++) {
      var light = lights[i];
      var lightDirection = normalize(minus(light.getPosition(), rayEnd));

      if (!isShadowed(rayEnd, lightDirection)) {
        var lighting = scaled(
          obj.getColor(rayEnd),
          light.brightness * dotProduct(normal, lightDirection)
        );
        add(
          lighting,
          scaleThis(
            v3(256, 256, 256),
            Math.pow(
              dotProduct(
                normalize(subtract(lightDirection, rayDirection)),
                normal
              ),
              64
            )
          )
        );
        add(color, lighting);
      }
    }

    if (depth > 0 && obj.reflection > 0) {
      add(
        color,
        scaleThis(
          sampleRay(rayEnd, obj.getReflection(rayDirection, normal), depth - 1),
          obj.reflection
        )
      );
    }

    return color;
  }

  function samplePixel(x, y) {
    var rayStart = camera.depthOfField
      ? add(
          sum(
            camera.position,
            scaled(uVector, (Math.random() - 0.5) * camera.depthOfField)
          ),
          scaled(vVector, (Math.random() - 0.5) * camera.depthOfField)
        )
      : camera.position;

    var rayDirection = normalize(
      add(
        add(subtract(leftDown, rayStart), scaled(uVector, x * camera.zoom)),
        scaled(vVector, y * camera.zoom)
      )
    );

    return sampleRay(rayStart, rayDirection, maxDepth);
  }

  function getPixel(x, y, iterations) {
    var result = v3(0, 0, 0);
    for (var i = 0; i < iterations; i++) {
      add(result, samplePixel(x, y));
    }
    return scaleThis(result, 1 / iterations);
  }
}

class Sphere {
  constructor({position, color, radius, reflection}) {
    this.position = position;
    this.color = color;
    this.radius = radius || 1;
    this.reflection = reflection || 0.5;
  }
  getColor() {
    return this.color;
  }
  getNormal(rayEnd) {
    return normalize(subtract(rayEnd, this.position));
  }
  getReflection(rayDirection, normal) {
    return add(
      scaled(normal, -2 * dotProduct(normal, rayDirection)),
      rayDirection
    );
  }
}

// var spheres = [v3(255, 0, 0), v3(255, 255, 0), v3(0, 255, 255), v3(0, 0, 255)].map((color, i) => {
//   var d = 2, a = i / 4 * Math.PI * 2;
//   return {
//     position: v3(d * Math.cos(a), d * Math.sin(a), 5),
//     color,
//     radius: 1,
//     reflection: 0.7,
//     brightness: 0.5
//   };
// });

var spheres = [
  {
    position: v3(10, 2, 2),
    color: v3(128, 0, 128), // purple
    radius: 1.5
  },
  {
    position: v3(-3, 0, 2),
    color: v3(256, 160, 224), // pink
    radius: 1.5
  },
  {
    position: v3(3, 0, 2),
    color: v3(0, 0, 128), // blue
    radius: 1.5
  },
  {
    position: v3(1.5, 0, 4.5),
    color: v3(256, 256, 192), // yellow
    radius: 1.5
  },
  {
    position: v3(-1, 10, 4),
    color: v3(0, 128, 128), // teal
    radius: 4.0
  },
  {
    position: v3(0, 0, 7),
    color: v3(256, 160, 128), // orange
    radius: 1.5
  }
];

// var spheres = [];
// var a = 4, s = 2.25;
// for (var x = 0; x < a; x++) {
//   for (var y = 0; y < a; y++) {
//     for (var z = 0; z < a; z++) {
//       spheres.push({
//         position: scaleThis(v3(x - (a - 1) / 2, y - (a - 1) / 2, z + 1 / s), s),
//         color: scaleThis(v3(x, y, z), 256 / a),
//         radius: 1
//       });
//     }
//   }
// }

var up = v3(0, 0, 1);

var rt = makeRaytracer({
  spheres: spheres.map(s => new Sphere(s)),
  getSkyColor: rayDirection => {
    var s = Math.pow(1 - rayDirection.z, 4);
    return v3(160 * s, 192 * s, 256 * s);
  },
  floor: {
    getColor: (() => {
      const scale = 27;
      const div = 81;
      const gray = v3(128, 128, 128);
      const white = v3(256, 256, 256);
      function mod(a, m) {
        return ((a % m) + m) % m;
      }
      function sierpinski(x, y) {
        // makes a nice square pattern
        x |= 0;
        y |= 0;
        return x + y === 0
          ? white
          : x % 3 === 1 && y % 3 === 1
          ? gray
          : sierpinski(x / 3, y / 3);
      }
      return rayEnd => {
        var x = mod(rayEnd.x * scale, div);
        var y = mod(rayEnd.y * scale, div);
        return sierpinski(x, y);
      };
    })(),
    reflection: 0.5,
    getNormal: () => up,
    getReflection: (rayDirection, normal) => {
      var factor = 1 / 16;
      var reflectionRayDirection = add(
        scaled(normal, -2 * dotProduct(normal, rayDirection)),
        rayDirection
      );
      var uVector = crossProduct(rayDirection, reflectionRayDirection);
      var vVector = crossProduct(uVector, reflectionRayDirection);
      return add(
        reflectionRayDirection,
        add(
          scaleThis(uVector, (Math.random() - 0.5) * factor),
          scaleThis(vVector, (Math.random() - 0.5) * factor)
        )
      );
    }
  },
  lights: [
    {
      getPosition: () => v3(Math.random() * 27, -81, 81),
      // getPosition: () => v3(27/2, -81+27/2, 81),
      brightness: 0.7
    },
    {
      getPosition: () => v3(-50, 50, 50),
      brightness: 0.3
    }
  ],
  camera: {
    position: v3(-7, -10, 8),
    depthOfField: 1,
    target: v3(0, 0, 4),
    zoom: 20
  },
  maxDepth: 4
});

/* global self, ImageData */
self.onmessage = ({data}) => {
  var {size, frame, imageData} = data;
  imageData = imageData || new ImageData(size, size);

  var angle = -2.1815 + (frame * Math.PI * 2) / 100;
  rt.setCamera({
    position: v3(
      20 * Math.cos(angle),
      20 * Math.sin(angle),
      4 + 3.5 * Math.sin(angle / 3)
    )
  });

  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var color = rt.getPixel(x / size, y / size, 1);
      var k = 4 * (y * size + x);
      imageData.data[k + 0] = color.x;
      imageData.data[k + 1] = color.y;
      imageData.data[k + 2] = color.z;
      imageData.data[k + 3] = 255;
    }
  }
  // transfer ownership of pixels.buffer instead of copying
  self.postMessage({frame, imageData}, [imageData.data.buffer]);
};
