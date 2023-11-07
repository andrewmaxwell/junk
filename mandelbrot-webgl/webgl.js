export const makeWebgl = ({
  canvas,
  fragmentShader,
  vertexShader = `
    attribute vec2 P;
    void main() {
      gl_Position = vec4(P,0,1);
    }`,
}) => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const gl = canvas.getContext('webgl');
  const program = gl.createProgram();

  const addShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const err = gl.getShaderInfoLog(shader);
    if (err) throw new Error(err);
    gl.attachShader(program, shader);
  };

  addShader(gl.VERTEX_SHADER, vertexShader);
  addShader(gl.FRAGMENT_SHADER, fragmentShader);

  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Int8Array([-3, 1, 1, -3, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.BYTE, 0, 0, 0);

  return {
    draw: (settings) => {
      gl.uniform2f(
        gl.getUniformLocation(program, 'resolution'),
        canvas.width,
        canvas.height
      );
      for (const key in settings) {
        gl.uniform1f(gl.getUniformLocation(program, key), settings[key]);
      }
      gl.drawArrays(6, 0, 3);
    },
  };
};
