// A path tracer as a fragment shader. Each draw adds samples for every pixel
// to a running sum in a float texture; the display shader divides by the
// sample count.

export const vertexShader = /* glsl */ `#version 300 es
in vec2 corner;
void main() {
  gl_Position = vec4(corner, 0., 1.);
}`;

export const traceShader = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

#define MAX_OBJECTS 16
#define PI 3.14159265359

const float EPSILON = 1e-3;

// Shapes
const int SPHERE = 0;
const int PLATE = 1;

// Materials
const int DIFFUSE = 0;
const int MIRROR = 1;
const int GLASS = 2;
const int LIGHT = 3;

// The scene, packed by packObjects in scenes.js
uniform int objectCount;
uniform vec4 centerRadius[MAX_OBJECTS];
uniform vec4 normalShape[MAX_OBJECTS];
uniform vec4 uHalf[MAX_OBJECTS];
uniform vec4 vHalf[MAX_OBJECTS];
uniform vec4 colorMaterial[MAX_OBJECTS];
uniform vec4 surface[MAX_OBJECTS]; // gloss, shininess, oneSided

// Camera position, forward direction, and right and up vectors scaled to the
// image plane at distance 1
uniform vec3 camPos;
uniform vec3 camForward;
uniform vec3 camRight;
uniform vec3 camUp;

/**
 * How diffuse surfaces find light:
 * 0 (mis): both of the below, weighted by which was more likely to find it
 * 1 (light): only rays aimed at lights; random bounces ignore light hits
 * 2 (bsdf): only random bounces (hope to hit a light)
 */
uniform int sampling;

/**
 * Caps how bright one sample of bounced light can be, as a multiple of white.
 * Rare paths like light -> glass -> wall -> camera are correct but very
 * bright and hard to find, so without this they show up as speckles that take
 * ages to average out. Capping them makes those effects (caustics, mostly) a
 * bit dimmer than they should be. Direct light is never capped.
 */
uniform float maxIndirect;

uniform sampler2D previous; // the running sum so far
uniform int frame; // 0 means start a new sum
uniform uint randomSeed; // different every draw, even when frame restarts
uniform int samplesPerFrame;

out vec4 result;

///////////////////////////////
// Random numbers
///////////////////////////////

uint seed;

// PCG hash, from "Hash Functions for GPU Rendering" (Jarzynski & Olano)
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

/** Uniform in [0, 1) */
float rand() {
  seed = pcg(seed);
  return float(seed >> 8) / 16777216.;
}

///////////////////////////////
// Geometry helpers
///////////////////////////////

/** Index of the closest object hit by a ray, or -1. Sets hitDist. */
int intersect(vec3 o, vec3 d, out float hitDist) {
  int hit = -1;
  hitDist = 1e30;
  for (int i = 0; i < objectCount; i++) {
    vec3 p = centerRadius[i].xyz - o;
    float t;
    if (int(normalShape[i].w) == SPHERE) {
      float r = centerRadius[i].w;
      float b = dot(p, d);
      float det = b * b - dot(p, p) + r * r;
      if (det < 0.) continue;
      det = sqrt(det);
      t = b - det;
      if (t <= EPSILON) t = b + det;
    } else {
      // Where the ray crosses the plate's plane, if that's within the plate
      vec3 n = normalShape[i].xyz;
      float facing = dot(d, n);
      if (facing == 0. || (surface[i].z > 0. && facing > 0.)) continue;
      t = dot(p, n) / facing;
      vec3 h = d * t - p;
      if (
        abs(dot(h, uHalf[i].xyz)) > uHalf[i].w ||
        abs(dot(h, vHalf[i].xyz)) > vHalf[i].w
      ) continue;
    }
    if (t > EPSILON && t < hitDist) {
      hitDist = t;
      hit = i;
    }
  }
  return hit;
}

/** The unit vector at angle acos(cosA) from the unit axis w, rotated phi around it. */
vec3 directionAround(vec3 w, float cosA, float phi) {
  // u and v are perpendicular to w and each other
  vec3 u = normalize(abs(w.x) > 0.1 ? vec3(w.z, 0., -w.x) : vec3(0., -w.z, w.y));
  vec3 v = cross(w, u);
  float sinA = sqrt(max(0., 1. - cosA * cosA));
  return (u * cos(phi) + v * sin(phi)) * sinA + w * cosA;
}

/**
 * 1 - cos of the half-angle of the cone of directions from p that hit the
 * light. Written this way because cos is nearly 1 for small lights, and 1 -
 * cos would lose most of its precision in 32-bit floats.
 */
float lightConeOneMinusCos(vec3 p, int light) {
  vec3 l = centerRadius[light].xyz - p;
  float r = centerRadius[light].w;
  float sinMaxSq = min(1., r * r / dot(l, l));
  return sinMaxSq / (1. + sqrt(1. - sinMaxSq));
}

/** MIS weight for a strategy with density a, competing with density b. */
float powerHeuristic(float a, float b) {
  return a * a / (a * a + b * b);
}

/** How much a light hit by a random diffuse bounce from p should count. */
float bounceLightWeight(vec3 p, float bouncePdf, int light) {
  if (sampling == 2) return 1.;
  if (sampling == 1) return 0.; // light sampling already counted it
  float lightPdf = 1. / (2. * PI * lightConeOneMinusCos(p, light));
  return powerHeuristic(bouncePdf, lightPdf);
}

/** Scale factor that caps a bounced-light contribution at maxIndirect. */
float indirectScale(vec3 c) {
  float brightest = max(c.r, max(c.g, c.b));
  return brightest > maxIndirect ? maxIndirect / brightest : 1.;
}

/**
 * For a diffuse (maybe glossy) surface, sets bsdf to how much light arriving
 * from direction l it scatters toward the viewer, and returns the probability
 * density that sampleSurface picks l. r is the viewing direction mirrored
 * about the normal, and cosTheta is the cosine between l and the normal.
 */
float evalSurface(int s, float cosTheta, vec3 r, vec3 l, out vec3 bsdf) {
  float gloss = surface[s].x;
  float shininess = surface[s].y;
  float diffuse = (1. - gloss) / PI;
  float glossy = 0.;
  float glossyPdf = 0.;
  if (gloss > 0.) {
    // Phong lobe: strongest in the mirror direction, falling off as
    // cos(angle from it) ^ shininess
    float lobe = pow(max(0., dot(r, l)), shininess) / (2. * PI);
    glossy = gloss * (shininess + 2.) * lobe;
    glossyPdf = (shininess + 1.) * lobe;
  }
  bsdf = diffuse * colorMaterial[s].rgb + glossy;
  // sampleSurface picks the glossy lobe with probability gloss
  return (1. - gloss) * (cosTheta / PI) + gloss * glossyPdf;
}

/**
 * Picks a random bounce direction off a diffuse (maybe glossy) surface: from
 * the glossy lobe with probability gloss, otherwise favoring directions near
 * the normal.
 */
vec3 sampleSurface(int s, vec3 n, vec3 r) {
  float phi = 2. * PI * rand();
  if (rand() < surface[s].x) {
    return directionAround(r, pow(rand(), 1. / (surface[s].y + 1.)), phi);
  }
  return directionAround(n, sqrt(1. - rand()), phi);
}

///////////////////////////////
// Path tracing
///////////////////////////////

/** Follows one path from the camera, returning the light it carries. */
vec3 trace(vec3 o, vec3 d) {
  // Light gathered so far
  vec3 color = vec3(0.);
  // Throughput: the fraction of light arriving at the current hit that makes
  // it back to the camera, after all the surfaces it has bounced off so far
  vec3 through = vec3(1.);
  // True until the path hits a diffuse surface
  bool seenByCamera = true;
  // Nonzero when a diffuse surface randomly picked this ray's direction: the
  // probability density it picked it with
  float bouncePdf = 0.;

  for (int depth = 0; depth < 100; depth++) {
    float hitDist;
    int s = intersect(o, d, hitDist);
    if (s < 0) break;
    vec3 sColor = colorMaterial[s].rgb;
    int material = int(colorMaterial[s].w);

    if (material == LIGHT) {
      float w = bouncePdf > 0. ? bounceLightWeight(o, bouncePdf, s) : 1.;
      vec3 e = sColor * w;
      // The light is far brighter than the screen can show. Clamping it to
      // white here, before pixel samples are averaged, lets its edges
      // antialias; otherwise a pixel 1% covered by the light shows as white.
      if (seenByCamera) e = min(e, vec3(1.));
      e *= through;
      color += e * (seenByCamera ? 1. : indirectScale(e));
      break; // lights don't reflect anything
    }

    // Russian roulette: after a few bounces, end the path at random, and
    // boost the survivors to make up for the ones that ended
    if (depth >= 5) {
      float p = min(0.95, max(sColor.r, max(sColor.g, sColor.b)) + surface[s].x);
      if (rand() >= p) break;
      through /= p;
    }

    vec3 p = o + d * hitDist;
    vec3 n = int(normalShape[s].w) == SPHERE
      ? (p - centerRadius[s].xyz) / centerRadius[s].w
      : normalShape[s].xyz;
    // Normal facing the side the ray came from
    bool into = dot(n, d) < 0.;
    vec3 nl = into ? n : -n;

    if (material == DIFFUSE) {
      // Viewing direction mirrored about the normal, the center of the
      // glossy lobe
      vec3 r = reflect(d, nl);
      vec3 bsdf;

      // Direct light: aim a ray at each light rather than waiting for a
      // random bounce to stumble into one.
      for (int light = 0; light < objectCount && sampling != 2; light++) {
        if (int(colorMaterial[light].w) != LIGHT) continue;
        vec3 w = normalize(centerRadius[light].xyz - p);

        // The light covers a cone of directions around w. Pick one uniformly.
        float oneMinusCos = lightConeOneMinusCos(p, light);
        vec3 l = directionAround(w, 1. - rand() * oneMinusCos, 2. * PI * rand());

        float cosSurface = dot(l, nl);
        if (cosSurface <= 0.) continue; // light is behind this surface

        // Shadow ray: only counts if nothing is in the way
        float shadowDist;
        if (intersect(p, l, shadowDist) != light) continue;

        // radiance * BSDF * cos(theta) / pdf (1/solidAngle)
        float solidAngle = 2. * PI * oneMinusCos;
        float pdf = evalSurface(s, cosSurface, r, l, bsdf);
        float weight = sampling == 0 ? powerHeuristic(1. / solidAngle, pdf) : 1.;
        vec3 c = through * colorMaterial[light].rgb * bsdf * (weight * cosSurface * solidAngle);
        // Light reaching the first surface the camera sees is direct light
        color += c * (seenByCamera ? 1. : indirectScale(c));
      }

      // Indirect light: bounce in a random direction. If this hits a light,
      // bounceLightWeight keeps it from being double counted with the above.
      vec3 next = sampleSurface(s, nl, r);
      float cosTheta = dot(next, nl);
      if (cosTheta <= 0.) break; // glossy lobe pointed into the surface
      bouncePdf = evalSurface(s, cosTheta, r, next, bsdf);
      through *= bsdf * cosTheta / bouncePdf;
      seenByCamera = false;
      d = next;
    } else {
      through *= sColor;
      bouncePdf = 0.;
      vec3 mirror = reflect(d, n);

      if (material == GLASS) {
        float nnt = into ? 1. / 1.5 : 1.5;
        vec3 t = refract(d, nl, nnt);
        // Otherwise total internal reflection: keep the mirror direction
        if (t != vec3(0.)) {
          // Fresnel: how much reflects vs refracts (Schlick's approximation)
          float c = 1. - (into ? -dot(d, nl) : dot(t, n));
          float reflectance = 0.04 + 0.96 * pow(c, 5.);
          // Pick one at random, with probability P of reflecting, and
          // divide by that probability to stay unbiased
          float P = 0.25 + 0.5 * reflectance;
          if (rand() < P) {
            through *= reflectance / P;
          } else {
            mirror = t;
            through *= (1. - reflectance) / (1. - P);
          }
        }
      }
      d = mirror;
    }
    o = p;
  }
  return color;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  seed = pcg(uint(pixel.x) + pcg(uint(pixel.y) + pcg(randomSeed)));
  vec2 size = vec2(textureSize(previous, 0));

  vec3 sum = vec3(0.);
  for (int i = 0; i < samplesPerFrame; i++) {
    // Jitter within the pixel for antialiasing
    vec2 screen = (gl_FragCoord.xy - 0.5 + vec2(rand(), rand())) / size - 0.5;
    vec3 d = normalize(camForward + camRight * screen.x + camUp * screen.y);
    sum += trace(camPos, d);
  }
  vec4 prev = frame == 0 ? vec4(0.) : texelFetch(previous, pixel, 0);
  // Alpha counts samples
  result = prev + vec4(sum, float(samplesPerFrame));
}`;

export const displayShader = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D sums;
out vec4 result;
void main() {
  vec4 s = texelFetch(sums, ivec2(gl_FragCoord.xy), 0);
  result = vec4(pow(min(s.rgb / max(s.a, 1.), 1.), vec3(1. / 2.2)), 1.);
}`;
