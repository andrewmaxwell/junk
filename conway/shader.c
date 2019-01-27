// The MIT License
// Copyright © 2013 Inigo Quilez
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// A list of useful distance function to simple primitives, and an example on how to
// do some interesting boolean operations, repetition and displacement.
//
// More info here: http://www.iquilezles.org/www/articles/distfunctions/distfunctions.htm

float sphere(vec3 p) {
  // return length(p) - 0.325;
  vec3 d = abs(p) - vec3(0.25);
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float scene( in vec3 pos) {
  float m = pos.y;

  m = min(m, sphere(pos - vec3(-1.50, 4.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 4.75, 0.50)));
m = min(m, sphere(pos - vec3(-0.50, 4.75, -1.00)));
m = min(m, sphere(pos - vec3(-0.50, 4.75, -0.50)));
m = min(m, sphere(pos - vec3(-0.50, 4.75, 1.00)));
m = min(m, sphere(pos - vec3(-0.50, 4.75, 1.50)));
m = min(m, sphere(pos - vec3(-0.50, 4.75, 2.00)));
m = min(m, sphere(pos - vec3(-1.00, 4.25, -1.00)));
m = min(m, sphere(pos - vec3(-1.00, 4.25, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 4.25, 0.00)));
m = min(m, sphere(pos - vec3(-1.00, 4.25, 1.00)));
m = min(m, sphere(pos - vec3(-1.00, 4.25, 1.50)));
m = min(m, sphere(pos - vec3(-0.50, 4.25, 1.00)));
m = min(m, sphere(pos - vec3(-0.50, 4.25, 1.50)));
m = min(m, sphere(pos - vec3(0.00, 4.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 3.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 3.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 3.75, 0.50)));
m = min(m, sphere(pos - vec3(-1.00, 3.75, 1.00)));
m = min(m, sphere(pos - vec3(-1.00, 3.75, 1.50)));
m = min(m, sphere(pos - vec3(-0.50, 3.75, -0.50)));
m = min(m, sphere(pos - vec3(-0.50, 3.75, 0.50)));
m = min(m, sphere(pos - vec3(-0.50, 3.75, 2.00)));
m = min(m, sphere(pos - vec3(0.00, 3.75, 1.00)));
m = min(m, sphere(pos - vec3(0.00, 3.75, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 3.25, 0.00)));
m = min(m, sphere(pos - vec3(-1.50, 3.25, 1.00)));
m = min(m, sphere(pos - vec3(-1.00, 3.25, -1.00)));
m = min(m, sphere(pos - vec3(-1.00, 3.25, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 3.25, 0.50)));
m = min(m, sphere(pos - vec3(-1.00, 3.25, 1.00)));
m = min(m, sphere(pos - vec3(-1.00, 3.25, 1.50)));
m = min(m, sphere(pos - vec3(-0.50, 3.25, 0.50)));
m = min(m, sphere(pos - vec3(-0.50, 3.25, 2.00)));
m = min(m, sphere(pos - vec3(0.00, 3.25, 1.00)));
m = min(m, sphere(pos - vec3(0.00, 3.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 2.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.50, 2.75, 0.00)));
m = min(m, sphere(pos - vec3(-1.50, 2.75, 1.00)));
m = min(m, sphere(pos - vec3(-1.50, 2.75, 1.50)));
m = min(m, sphere(pos - vec3(-1.00, 2.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 2.75, 1.50)));
m = min(m, sphere(pos - vec3(-0.50, 2.75, 0.00)));
m = min(m, sphere(pos - vec3(-0.50, 2.75, 0.50)));
m = min(m, sphere(pos - vec3(-0.50, 2.75, 2.00)));
m = min(m, sphere(pos - vec3(0.00, 2.75, 1.00)));
m = min(m, sphere(pos - vec3(0.00, 2.75, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 2.25, -0.50)));
m = min(m, sphere(pos - vec3(-1.50, 2.25, 0.00)));
m = min(m, sphere(pos - vec3(-1.50, 2.25, 1.00)));
m = min(m, sphere(pos - vec3(-1.50, 2.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.00, 2.25, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 2.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.00, 2.25, 2.00)));
m = min(m, sphere(pos - vec3(-0.50, 2.25, 0.00)));
m = min(m, sphere(pos - vec3(-0.50, 2.25, 0.50)));
m = min(m, sphere(pos - vec3(-0.50, 2.25, 2.00)));
m = min(m, sphere(pos - vec3(0.00, 2.25, 0.50)));
m = min(m, sphere(pos - vec3(0.00, 2.25, 1.00)));
m = min(m, sphere(pos - vec3(0.00, 2.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 1.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.50, 1.75, 0.00)));
m = min(m, sphere(pos - vec3(-1.50, 1.75, 1.00)));
m = min(m, sphere(pos - vec3(-1.50, 1.75, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 1.75, 2.00)));
m = min(m, sphere(pos - vec3(-1.00, 1.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 1.75, 2.00)));
m = min(m, sphere(pos - vec3(-0.50, 1.75, 0.00)));
m = min(m, sphere(pos - vec3(-0.50, 1.75, 0.50)));
m = min(m, sphere(pos - vec3(-0.50, 1.75, 2.00)));
m = min(m, sphere(pos - vec3(0.00, 1.75, 0.00)));
m = min(m, sphere(pos - vec3(0.00, 1.75, 0.50)));
m = min(m, sphere(pos - vec3(0.00, 1.75, 1.00)));
m = min(m, sphere(pos - vec3(0.00, 1.75, 1.50)));
m = min(m, sphere(pos - vec3(0.50, 1.75, 1.00)));
m = min(m, sphere(pos - vec3(-2.00, 1.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 1.25, -0.50)));
m = min(m, sphere(pos - vec3(-1.50, 1.25, 0.00)));
m = min(m, sphere(pos - vec3(-1.50, 1.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 1.25, 2.00)));
m = min(m, sphere(pos - vec3(-1.00, 1.25, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 1.25, 1.00)));
m = min(m, sphere(pos - vec3(-1.00, 1.25, 2.00)));
m = min(m, sphere(pos - vec3(-1.00, 1.25, 2.50)));
m = min(m, sphere(pos - vec3(-0.50, 1.25, -0.50)));
m = min(m, sphere(pos - vec3(-0.50, 1.25, 2.00)));
m = min(m, sphere(pos - vec3(0.00, 1.25, 0.00)));
m = min(m, sphere(pos - vec3(0.00, 1.25, 1.50)));
m = min(m, sphere(pos - vec3(0.50, 1.25, 1.00)));
m = min(m, sphere(pos - vec3(0.50, 1.25, 1.50)));
m = min(m, sphere(pos - vec3(-2.00, 0.75, 1.50)));
m = min(m, sphere(pos - vec3(-2.00, 0.75, 2.00)));
m = min(m, sphere(pos - vec3(-1.50, 0.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.50, 0.75, 0.00)));
m = min(m, sphere(pos - vec3(-1.50, 0.75, 1.00)));
m = min(m, sphere(pos - vec3(-1.50, 0.75, 2.50)));
m = min(m, sphere(pos - vec3(-1.00, 0.75, -1.00)));
m = min(m, sphere(pos - vec3(-1.00, 0.75, -0.50)));
m = min(m, sphere(pos - vec3(-1.00, 0.75, 2.50)));
m = min(m, sphere(pos - vec3(-0.50, 0.75, -0.50)));
m = min(m, sphere(pos - vec3(-0.50, 0.75, 0.00)));
m = min(m, sphere(pos - vec3(-0.50, 0.75, 2.00)));
m = min(m, sphere(pos - vec3(-0.50, 0.75, 2.50)));
m = min(m, sphere(pos - vec3(0.00, 0.75, 1.00)));
m = min(m, sphere(pos - vec3(0.00, 0.75, 1.50)));
m = min(m, sphere(pos - vec3(0.00, 0.75, 2.00)));
m = min(m, sphere(pos - vec3(0.50, 0.75, 1.00)));
m = min(m, sphere(pos - vec3(0.50, 0.75, 1.50)));
m = min(m, sphere(pos - vec3(-2.00, 0.25, 1.50)));
m = min(m, sphere(pos - vec3(-2.00, 0.25, 2.00)));
m = min(m, sphere(pos - vec3(-1.50, 0.25, -1.00)));
m = min(m, sphere(pos - vec3(-1.50, 0.25, -0.50)));
m = min(m, sphere(pos - vec3(-1.50, 0.25, 0.00)));
m = min(m, sphere(pos - vec3(-1.50, 0.25, 1.50)));
m = min(m, sphere(pos - vec3(-1.50, 0.25, 2.50)));
m = min(m, sphere(pos - vec3(-1.00, 0.25, -1.00)));
m = min(m, sphere(pos - vec3(-1.00, 0.25, 0.50)));
m = min(m, sphere(pos - vec3(-1.00, 0.25, 2.50)));
m = min(m, sphere(pos - vec3(-1.00, 0.25, 3.00)));
m = min(m, sphere(pos - vec3(-0.50, 0.25, -1.00)));
m = min(m, sphere(pos - vec3(-0.50, 0.25, -0.50)));
m = min(m, sphere(pos - vec3(-0.50, 0.25, 0.00)));
m = min(m, sphere(pos - vec3(-0.50, 0.25, 2.50)));
m = min(m, sphere(pos - vec3(0.00, 0.25, 0.50)));
m = min(m, sphere(pos - vec3(0.00, 0.25, 1.00)));
m = min(m, sphere(pos - vec3(0.00, 0.25, 2.50)));
m = min(m, sphere(pos - vec3(0.50, 0.25, 1.00)));
m = min(m, sphere(pos - vec3(0.50, 0.25, 2.00)));

  return m;
}

float getRayDist( in vec3 rayOrigin, in vec3 rayDirection) {
  float rayDist = 1.0;
  for (int i = 0; i < 64; i++) {
    float d = scene(rayOrigin + rayDirection * rayDist);
    rayDist += d;
    if (d < 0.0004 * rayDist || rayDist > 20.0) break;
  }
  return rayDist;
}

// http://iquilezles.org/www/articles/rmshadows/rmshadows.htm
float calcSoftshadow( in vec3 rayOrigin, in vec3 rayDirection, in float mint, in float tmax) {
  float rayDist = 1.0;
  float t = mint;
  for (int i = 0; i < 16; i++) {
    float h = scene(rayOrigin + rayDirection * t);
    rayDist = min(rayDist, 8.0 * h / t);
    t += clamp(h, 0.02, 0.10);
    if (rayDist < 0.005 || t > tmax) break;
  }
  return clamp(rayDist, 0.0, 1.0);
}

// http://iquilezles.org/www/articles/normalsSDF/normalsSDF.htm
vec3 calcNormal( in vec3 pos) {
  vec3 n = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 e = 0.5773 * (2.0 * vec3((((i + 3) >> 1) & 1), ((i >> 1) & 1), (i & 1)) - 1.0);
    n += e * scene(pos + 0.0005 * e);
  }
  return normalize(n);
}

float ambientOcclusion( in vec3 pos, in vec3 nor) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float hr = 0.01 + 0.12 * float(i) / 4.0;
    vec3 aopos = nor * hr + pos;
    float dd = scene(aopos);
    occ -= (dd - hr) * sca;
    sca *= 0.95;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

vec3 render( in vec3 rayOrigin, in vec3 rayDirection) {
  vec3 col = vec3(0.7, 0.9, 1.0) + rayDirection.y * 0.8; // sky
  float rayDist = getRayDist(rayOrigin, rayDirection);
  if (rayDist < 20.0) {
    vec3 pos = rayOrigin + rayDist * rayDirection;
    vec3 nor = calcNormal(pos);
    vec3 ref = reflect(rayDirection, nor);

    float occ = ambientOcclusion(pos, nor);
    vec3 lig = normalize(vec3(-0.4, 0.3, -0.6));
    vec3 hal = normalize(lig - rayDirection);
    float ambient = clamp(0.5 + 0.5 * nor.y, 0.0, 1.0);
    float dif = clamp(dot(nor, lig), 0.0, 1.0);
    float bac = clamp(dot(nor, normalize(vec3(-lig.x, 0.0, -lig.z))), 0.0, 1.0) * clamp(1.0 - pos.y, 0.0, 1.0);
    float dom = smoothstep(-0.2, 0.2, ref.y);
    float fre = pow(clamp(1.0 + dot(nor, rayDirection), 0.0, 1.0), 2.0);

    dif *= calcSoftshadow(pos, lig, 0.02, 2.5);
    dom *= calcSoftshadow(pos, ref, 0.02, 2.5);

    vec3 lin = 1.3 * dif * vec3(1, 0.8, 0.55) + occ * (
      0.3 * ambient * vec3(0.40, 0.60, 1) +
      0.4 * dom * vec3(0.40, 0.60, 1) +
      0.5 * bac * vec3(0.25, 0.25, 0.25) +
      0.25 * fre * vec3(1)
    );
    col = lin * vec3(0.5) +
      9.0 * pow(clamp(dot(nor, hal), 0.0, 1.0), 16.0) * dif * (0.04 + 0.96 * pow(clamp(1.0 + dot(hal, rayDirection), 0.0, 1.0), 5.0)) * vec3(1.00, 0.90, 0.70);
    col = mix(col, vec3(0.8, 0.9, 1.0), 1.0 - exp(-0.0002 * rayDist * rayDist * rayDist));
  }

  col = pow(col, vec3(0.4545)); // gamma
  return col;
}

mat3 setCamera( in vec3 position, in vec3 pointingAt) {
  vec3 cw = normalize(pointingAt - position);
  vec3 cu = normalize(cross(cw, vec3(0, 1, 0)));
  vec3 cv = normalize(cross(cu, cw));
  return mat3(cu, cv, cw);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 mouse = iMouse.xy / iResolution.xy * 10.0;
  vec2 pixel = (-iResolution.xy + 2.0 * fragCoord) / iResolution.y;
  float d = 7.0;
  vec3 cameraPos = vec3(
      d * cos(0.1 * iTime + mouse.x),
      mouse.y,
      d * sin(0.1 * iTime + mouse.x)
  );
  mat3 cameraTransform = setCamera(cameraPos, vec3(0, 2, 0));
  vec3 rayDirection = cameraTransform * normalize(vec3(pixel.xy, 2));

  fragColor = vec4(render(cameraPos, rayDirection), 1);
}
