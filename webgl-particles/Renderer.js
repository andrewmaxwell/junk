import {createProgram} from './utils.js';

export const renderer = async (gl, textureSize) => {
  const prog = createProgram(
    gl,
    `
attribute float id;
uniform sampler2D positionTex;
uniform vec2 texDimensions;
uniform mat4 matrix;

void main() {
  float y = floor(id / texDimensions.x);
  float x = mod(id, texDimensions.x);
  vec2 texcoord = (vec2(x, y) + 0.5) / texDimensions;
  vec4 position =  texture2D(positionTex, texcoord);
  gl_Position = matrix * vec4(position.xy, 0, 1);
  gl_PointSize = 1.0;
}
      `,
    `
precision highp float;
void main(){
  gl_FragColor = vec4(255,255,255,1);
}`,
    'id',
    ['positionTex', 'texDimensions', 'matrix'],
    1,
    [...Array(textureSize ** 2).keys()]
  );

  return (newPos, projection) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, innerWidth, innerHeight);

    prog.use();

    newPos.bindTexture(gl.TEXTURE0);
    gl.uniform1i(prog.positionTex, 0);

    gl.uniform2f(prog.texDimensions, textureSize, textureSize);
    gl.uniformMatrix4fv(prog.matrix, false, projection);
    gl.drawArrays(gl.POINTS, 0, textureSize ** 2);
  };
};
