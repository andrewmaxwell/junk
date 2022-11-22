function loadShader(gl, shaderSource, shaderType) {
  const shader = gl.createShader(shaderType);
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!compiled) {
    const lastError = gl.getShaderInfoLog(shader);
    const lines = shaderSource
      .split('\n')
      .map((l, i) => `${i + 1}: ${l}`)
      .join('\n');
    document.body.innerHTML += `<pre style="position:fixed;top:5px;left:5px">Error compiling shader '${shader}':${lastError}\n${lines}</pre>`;
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createTexture(gl, data, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // mip level
    gl.RGBA, // internal format
    width,
    height,
    0, // border
    gl.RGBA, // format
    gl.FLOAT, // type
    data
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export const createProgram = (
  gl,
  vertexShader,
  fragmentShader,
  attribName,
  uniforms,
  size,
  bufferData
) => {
  const program = gl.createProgram();
  gl.attachShader(program, loadShader(gl, vertexShader, gl.VERTEX_SHADER));
  gl.attachShader(program, loadShader(gl, fragmentShader, gl.FRAGMENT_SHADER));
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!linked) {
    const lastError = gl.getProgramInfoLog(program);
    document.body.innerHTML += `<pre style="position:fixed;top:5px;left:5px">Error in program linking: ${lastError}</pre>`;
    gl.deleteProgram(program);
    return null;
  }

  const attribLocation = gl.getAttribLocation(program, attribName);

  const bindBuffer = makeBufferBinder(gl, bufferData);

  return {
    use: () => {
      bindBuffer();
      gl.enableVertexAttribArray(attribLocation);
      gl.vertexAttribPointer(
        attribLocation,
        size, // size (num components)
        gl.FLOAT, // type of data in buffer
        false, // normalize
        0, // stride (0 = auto)
        0 // offset
      );
      gl.useProgram(program);
    },
    ...Object.fromEntries(
      uniforms.map((u) => [u, gl.getUniformLocation(program, u)])
    ),
  };
};

export const makeGl = (canvas) => {
  const gl = canvas.getContext('webgl');

  const ext1 = gl.getExtension('OES_texture_float');
  if (!ext1) {
    alert('Need OES_texture_float');
  }

  const ext2 = gl.getExtension('WEBGL_color_buffer_float');
  if (!ext2) {
    alert('Need WEBGL_color_buffer_float');
  }

  if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) < 1) {
    alert('Can not use textures in vertex shaders');
  }

  return gl;
};

export function orthographic(
  left,
  right,
  bottom,
  top,
  near,
  far,
  dst = new Float32Array(16)
) {
  dst[0] = 2 / (right - left);
  dst[1] = 0;
  dst[2] = 0;
  dst[3] = 0;
  dst[4] = 0;
  dst[5] = 2 / (top - bottom);
  dst[6] = 0;
  dst[7] = 0;
  dst[8] = 0;
  dst[9] = 0;
  dst[10] = 2 / (near - far);
  dst[11] = 0;
  dst[12] = (left + right) / (left - right);
  dst[13] = (bottom + top) / (bottom - top);
  dst[14] = (near + far) / (near - far);
  dst[15] = 1;
  return dst;
}

export const getFile = async (filename) => (await fetch(filename)).text();

export const makeBufferBinder = (gl, data) => {
  const buff = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buff);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return () => gl.bindBuffer(gl.ARRAY_BUFFER, buff);
};

export const makeFrame = (gl, data, width, height = width) => {
  const frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

  const texture = createTexture(gl, data, width, height);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  );
  return {
    bindTexture: (id) => {
      gl.activeTexture(id);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    },
    bindFrame: () => gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer),
  };
};
