'use strict';

export const makeWebgl = ({canvas, fragmentShader}) => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  var gl = canvas.getContext('webgl');
  var program = gl.createProgram();

  var addShader = (type, source) => {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const err = gl.getShaderInfoLog(shader);
    if (err) throw new Error(err);
    gl.attachShader(program, shader);
  };

  addShader(35633, 'attribute vec2 P;void main(){gl_Position=vec4(P,0,1);}');
  addShader(35632, fragmentShader);

  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(34962, gl.createBuffer());
  gl.bufferData(34962, new Int8Array([-3, 1, 1, -3, 1, 1]), 35044);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, 5120, 0, 0, 0);

  return {
    draw: settings => {
      gl.uniform2f(
        gl.getUniformLocation(program, 'resolution'),
        canvas.width,
        canvas.height
      );
      for (var key in settings) {
        gl.uniform1f(gl.getUniformLocation(program, key), settings[key]);
      }
      gl.drawArrays(6, 0, 3);
    }
  };
};
