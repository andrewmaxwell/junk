import {createProgram, getFile, makeBufferBinder} from './utils.js';

export class Simulator {
  constructor(gl) {
    this.gl = gl;
  }
  async init() {
    this.prog = createProgram(
      this.gl,
      `attribute vec4 position; void main() { gl_Position = position;}`,
      await getFile('./updatePositionFS.glsl'),
      'position',
      ['positionTex', 'texDimensions', 'canvasDimensions']
    );
    this.bindPositionBuffer = makeBufferBinder(
      this.gl,
      [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]
    );
  }
  iterate(pos, textureSize) {
    const {prog, gl} = this;
    pos.nextFrame.bindFrame();
    this.bindPositionBuffer();

    gl.enableVertexAttribArray(prog.position);
    gl.vertexAttribPointer(
      prog.position,
      2, // size (num components)
      gl.FLOAT, // type of data in buffer
      false, // normalize
      0, // stride (0 = auto)
      0 // offset
    );
    gl.useProgram(prog.program);
    pos.currentFrame.bindTexture(gl.TEXTURE0);
    gl.uniform1i(prog.positionTex, 0); // tell the shader the position texture is on texture unit 0
    gl.uniform2f(prog.texDimensions, textureSize, textureSize);
    gl.uniform2f(prog.canvasDimensions, innerWidth, innerHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 6); // draw 2 triangles (6 vertices)
  }
}
