const getImage = (url) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0, image.width, image.height);
      resolve(ctx.getImageData(0, 0, image.width, image.height));
    };
    image.src = url;
  });

export const load = async () => {
  const [{width, height, data}, datah] = await Promise.all(
    ['color.png', 'height.png'].map(getImage),
  );
  const altitudes = new Uint8Array(width * height);
  const colors = new Uint32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    altitudes[i] = datah.data[i * 4];
    const red = data[i * 4];
    const green = data[i * 4 + 1] << 8;
    const blue = data[i * 4 + 2] << 16;
    colors[i] = red | green | blue | 0xff000000;
  }

  return {width, height, altitudes, colors};
};
