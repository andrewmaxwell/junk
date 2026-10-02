// Keeps the homepage screenshots (each project's image.png) small. The homepage shows them cropped
// to 16:10 in cards at most about 460px wide, so with 2x screens and the hover zoom, an image never
// needs to cover more than 1000x625. Images that are already small enough are left alone.
import fs from 'fs';
import sharp from 'sharp';

const COVER_WIDTH = 1000;
const COVER_HEIGHT = 625;
const SMALL_ENOUGH = 200 * 1024; // bytes
const WORTH_IT = 0.8; // only replace an image if the new one is at most this fraction of the size

// Returns {before, after} sizes in bytes. after is undefined if the image was left alone. With a
// destination, writes there instead of replacing the original.
export const optimizeImage = async (path, destination = path) => {
  const original = fs.readFileSync(path);
  const before = original.length;
  if (before <= SMALL_ENOUGH) return {before};

  const {width, height} = await sharp(original).metadata();
  // shrink to just cover what the card needs, never enlarging
  const scale = Math.min(
    1,
    Math.max(COVER_WIDTH / width, COVER_HEIGHT / height),
  );
  const resized = () =>
    sharp(original).resize(
      Math.round(width * scale),
      Math.round(height * scale),
    );

  // lossless first, and only reduce to a palette of colors if that's still too big
  let best = await resized()
    .png({compressionLevel: 9, adaptiveFiltering: true})
    .toBuffer();
  if (best.length > SMALL_ENOUGH) {
    const palette = await resized()
      .png({palette: true, quality: 90, dither: 1, compressionLevel: 9})
      .toBuffer();
    if (palette.length < best.length) best = palette;
  }

  if (best.length > before * WORTH_IT) return {before};
  fs.writeFileSync(destination, best);
  return {before, after: best.length};
};
