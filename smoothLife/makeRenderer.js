export const makeRenderer = (canvas, width, height) => {
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  const imageData = ctx.createImageData(width, height);

  return (curField) => {
    const imageBuf = imageData.data;
    let imagePtr = 0;

    curField.forEach((row) =>
      row.forEach((s) => {
        imageBuf[imagePtr++] =
          imageBuf[imagePtr++] =
          imageBuf[imagePtr++] =
            Math.min(255, Math.floor(256 * s));

        imageBuf[imagePtr++] = 255;
      })
    );

    ctx.putImageData(imageData, 0, 0);
  };
};
