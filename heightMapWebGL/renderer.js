const createShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl, vsSource, fsSource) => {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);
  return prog;
};

const getImageData = (img) => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height).data;
};

const getHeightData = (heightImg) => {
  const {width, height} = heightImg;
  const hmData = getImageData(heightImg);
  const hScale = 300;
  const positions = [];
  const texCoords = [];

  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const x = j - width / 2;
      const y = (hmData[(i * width + j) * 4] / 255) * hScale;
      const z = i - height / 2;
      positions.push(x, y, z);
      texCoords.push(j / (width - 1), i / (height - 1));
    }
  }

  let indices = [];
  for (let i = 0; i < height - 1; i++) {
    for (let j = 0; j < width - 1; j++) {
      const a = i * width + j,
        b = a + 1,
        c = (i + 1) * width + j + 1,
        d = c - 1;
      indices.push(a, b, c, a, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    texCoords: new Float32Array(texCoords),
    indices: new Uint32Array(indices),
  };
};

const addColorTexture = (gl, colorImg, program) => {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, colorImg);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
};

const addHeightBuffers = (gl, heightImg, program) => {
  const {positions, texCoords, indices} = getHeightData(heightImg);

  gl.getExtension('OES_element_index_uint');

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const aPosition = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
  gl.enableVertexAttribArray(aTexCoord);
  gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  return indices.length;
};

const vertexShader = `
  attribute vec3 aPosition;
  attribute vec2 aTexCoord;
  uniform mat4 uMVP;
  varying vec2 vTexCoord;
  void main(){
    gl_Position = uMVP * vec4(aPosition, 1.0);
    vTexCoord = aTexCoord;
  }`;

const fragmentShader = ` 
  precision mediump float;
  varying vec2 vTexCoord;
  uniform sampler2D uTexture;
  void main(){
    gl_FragColor = texture2D(uTexture, vTexCoord);
  }`;

export const makeRenderer = (canvas, colorImg, heightImg) => {
  const gl = canvas.getContext('webgl');

  onresize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  onresize();

  const program = createProgram(gl, vertexShader, fragmentShader);
  addColorTexture(gl, colorImg, program);
  const numIndices = addHeightBuffers(gl, heightImg, program);
  const uMVP = gl.getUniformLocation(program, 'uMVP');

  return (mvp) => {
    gl.uniformMatrix4fv(uMVP, false, mvp);
    gl.clearColor(0.53, 0.81, 0.92, 1.0); // blue sky
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.drawElements(gl.TRIANGLES, numIndices, gl.UNSIGNED_INT, 0);
  };
};
