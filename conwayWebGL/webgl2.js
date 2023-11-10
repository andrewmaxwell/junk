const defaultVertexShader = `#version 300 es
in vec2 P;
void main() {
  gl_Position = vec4(P,0,1);
}`;

export function webgl2({
  canvas,
  fragmentShader,
  vertexShader = defaultVertexShader,
}) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL 2 is not available in your environment.');

  const program = gl.createProgram();

  function addShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const err = gl.getShaderInfoLog(shader);
    if (err) throw new Error(err);
    gl.attachShader(program, shader);
  }

  addShader(gl.VERTEX_SHADER, vertexShader);
  addShader(gl.FRAGMENT_SHADER, fragmentShader);

  gl.linkProgram(program);
  gl.useProgram(program);
  // const err = gl.getProgramInfoLog(program);
  // if (err) throw new Error(err);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Int8Array([-3, 1, 1, -3, 1, 1]),
    gl.STATIC_DRAW
  );

  const posAttribLocation = gl.getAttribLocation(program, 'P');
  gl.enableVertexAttribArray(posAttribLocation);
  gl.vertexAttribPointer(posAttribLocation, 2, gl.BYTE, false, 0, 0);

  gl.uniform2f(
    gl.getUniformLocation(program, 'resolution'),
    canvas.width,
    canvas.height
  );

  function createTexture(width, height) {
    const texture = gl.createTexture();
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = Math.random() > 0.5 ? 255 : 0;
      pixels[i + 3] = 255;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );

    const frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    return {texture, frameBuffer};
  }

  function draw(source, target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.frameBuffer); // draw to target
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture); // using source
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // draw to screen
    gl.activeTexture(gl.TEXTURE1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {createTexture, draw};
}
