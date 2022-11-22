import {createProgram, makeBufferBinder, orthographic} from './utils.js';

export class Renderer {
  constructor(gl, textureSize) {
    this.gl = gl;
    this.textureSize = textureSize;
  }
  async init() {
    this.prog = createProgram(
      this.gl,
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
  gl_FragColor=vec4(255,255,255,1);
}`,
      'id',
      ['positionTex', 'texDimensions', 'matrix']
    );

    this.bindIds = makeBufferBinder(this.gl, [
      ...Array(this.textureSize ** 2).keys(),
    ]);
  }
  render(newPos) {
    const {gl, textureSize, bindIds, prog} = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, innerWidth, innerHeight);
    bindIds();
    newPos.bindTexture(gl.TEXTURE0);
    gl.enableVertexAttribArray(prog.id);
    gl.vertexAttribPointer(
      prog.id,
      1, // size (num components)
      gl.FLOAT, // type of data in buffer
      false, // normalize
      0, // stride (0 = auto)
      0 // offset
    );

    gl.useProgram(prog.program);
    gl.uniform2f(prog.texDimensions, textureSize, textureSize);
    gl.uniform1i(prog.positionTex, 0); // tell the shader the position texture is on texture unit 0
    gl.uniformMatrix4fv(
      prog.matrix,
      false,
      orthographic(0, innerWidth, 0, innerHeight, -1, 1)
    );

    gl.drawArrays(gl.POINTS, 0, textureSize ** 2);
  }
}
