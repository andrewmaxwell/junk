#define TAU 6.2831853072

precision highp float;

uniform sampler2D positionTex;
uniform vec2 texDimensions;
uniform vec2 canvasDimensions;

vec2 mathMod(vec2 n, vec2 m) {
  return mod(mod(n, m) + m, m);
}

vec2 attract(vec2 attractor, vec2 particle, float strength) {
  vec2 d = attractor - particle;
  return strength * d / (d.x * d.x + d.y * d.y);
}

const int numAttractors = 5;
float attractorDistance = 300.0;

void main() {
  vec2 texcoord = gl_FragCoord.xy / texDimensions;
  
  vec4 p = texture2D(positionTex, texcoord);
  vec2 velocity = p.xy - p.zw;
  vec2 n = p.xy + velocity * 0.999;

  // for (int x = 0; x < 100; x++) {
  //   for (int y = 0; y < 100; y++) {
  //     vec2 b = texture2D(positionTex, vec2(x, y)).xy;
  //     vec2 d = b - n;
  //     n -= d / max(1.0, d.x * d.x + d.y * d.y) * 0.01;
  //   }
  // }

  for (int i = 0; i < numAttractors; i++) {
    float angle = float(i) / float(numAttractors) * TAU;
    vec2 coords = canvasDimensions / 2.0 + vec2(sin(angle), cos(angle)) * attractorDistance;
    n += attract(coords, n, 10.0);
  }
  


  if (n.x < 0.0) {
    n.x = -n.x;
    p.x = n.x + velocity.x;
  } else if (n.x > canvasDimensions.x) {
    n.x = 2.0 * canvasDimensions.x - n.x;
    p.x = n.x + velocity.x;
  }

  if (n.y < 0.0) {
    n.y = -n.y;
    p.y = n.y + velocity.y;
  } else if (n.y > canvasDimensions.y) {
    n.y = 2.0 * canvasDimensions.y - n.y;
    p.y = n.y + velocity.y;
  }

  gl_FragColor = vec4(n, p.xy);
}