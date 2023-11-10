#version 300 es
precision mediump float;
uniform vec2 resolution;
uniform sampler2D prevFrame;
out vec4 fragColor;

void main() {
  vec2 texCoord = gl_FragCoord.xy / resolution;
  float current = texture(prevFrame, texCoord).r;
  int n = int(texture(prevFrame, texCoord + vec2( 1,  0) / resolution).r > 0.5) +
          int(texture(prevFrame, texCoord + vec2( 1,  1) / resolution).r > 0.5) +
          int(texture(prevFrame, texCoord + vec2( 0,  1) / resolution).r > 0.5) +
          int(texture(prevFrame, texCoord + vec2(-1,  1) / resolution).r > 0.5) +
          int(texture(prevFrame, texCoord + vec2(-1,  0) / resolution).r > 0.5) +
          int(texture(prevFrame, texCoord + vec2(-1, -1) / resolution).r > 0.5) +
          int(texture(prevFrame, texCoord + vec2( 0, -1) / resolution).r > 0.5) +
          int(texture(prevFrame, texCoord + vec2( 1, -1) / resolution).r > 0.5);

  bool alive = n == 3 || (n == 2 && current > 0.5);
  fragColor = vec4(vec3(int(alive)), 1.0);
}