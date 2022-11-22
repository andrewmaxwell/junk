import {createProgram, getFile} from './utils.js';

export const simRunner = async (gl) => {
  const prog = createProgram(
    gl,
    `attribute vec4 position; void main() { gl_Position = position;}`,
    await getFile('./updatePositionFS.glsl'),
    'position',
    ['positionTex', 'texDimensions', 'canvasDimensions', 'time'],
    2,
    [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]
  );

  return (positionFrames, textureSize) => {
    positionFrames.nextFrame.bindFrame();

    prog.use();

    positionFrames.currentFrame.bindTexture(gl.TEXTURE0);
    gl.uniform1i(prog.positionTex, 0);

    gl.uniform2f(prog.texDimensions, textureSize, textureSize);
    gl.uniform2f(prog.canvasDimensions, innerWidth, innerHeight);
    gl.uniform1f(prog.time, performance.now() / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6); // draw 2 triangles (6 vertices)
  };
};
