const loadShader = (gl, shaderSource, shaderType) => {
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
};

const createTexture = (gl, data, width, height) => {
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
};

const typeMappings = {
  vec2: 'uniform2f',
  mat4: 'uniformMatrix4fv',
  float: 'uniform1f',
};

export const createProgram = (
  gl,
  vertexShaderStr,
  fragmentShaderStr,
  attribSize,
  bufferData,
  drawType
) => {
  const program = gl.createProgram();
  gl.attachShader(program, loadShader(gl, vertexShaderStr, gl.VERTEX_SHADER));
  gl.attachShader(
    program,
    loadShader(gl, fragmentShaderStr, gl.FRAGMENT_SHADER)
  );
  gl.linkProgram(program);
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!linked) {
    const lastError = gl.getProgramInfoLog(program);
    document.body.innerHTML += `<pre style="position:fixed;top:5px;left:5px">Error in program linking: ${lastError}</pre>`;
    gl.deleteProgram(program);
    return null;
  }

  const combinedCode = vertexShaderStr + '\n' + fragmentShaderStr;
  const uniformUpdaters = {};
  const [, attribName] = combinedCode.match(/attribute \w+ (\w+);/);
  const attribLocation = gl.getAttribLocation(program, attribName);
  for (const [, type, name] of combinedCode.matchAll(/uniform (\w+) (\w+);/g)) {
    const loc = gl.getUniformLocation(program, name);
    if (type === 'sampler2D') {
      uniformUpdaters[name] = (texture, num) => {
        gl.activeTexture(gl['TEXTURE' + num]);
        gl.bindTexture(gl.TEXTURE_2D, texture.texture);
        gl.uniform1i(loc, num);
      };
    } else if (typeMappings[type]) {
      uniformUpdaters[name] = (...args) => gl[typeMappings[type]](loc, ...args);
    } else {
      throw new Error(`wtf is ${type}`);
    }
  }

  const buff = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buff);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bufferData), gl.STATIC_DRAW);

  return {
    run: (params, output = null) => {
      gl.viewport(0, 0, innerWidth, innerHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, output);
      gl.bindBuffer(gl.ARRAY_BUFFER, buff);
      gl.enableVertexAttribArray(attribLocation);
      gl.vertexAttribPointer(
        attribLocation,
        attribSize, // size (num components)
        gl.FLOAT, // type of data in buffer
        false, // normalize
        0, // stride (0 = auto)
        0 // offset
      );
      gl.useProgram(program);

      for (const key in params) {
        if (Array.isArray(params[key])) uniformUpdaters[key](...params[key]);
        else uniformUpdaters[key](params[key]);
      }

      gl.drawArrays(drawType, 0, bufferData.length / attribSize);
    },
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

export const orthographic = (
  left,
  right,
  bottom,
  top,
  near,
  far,
  dst = new Float32Array(16)
) => {
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
};

export const getFile = async (filename) => (await fetch(filename)).text();

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
  return {frameBuffer, texture};
};
