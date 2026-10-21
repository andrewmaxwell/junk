import fs from 'fs';
import sharp from 'sharp';
import {optimizeImage, makeThumb} from './optimizeImages.js';

// README text to search, without markdown syntax, capped so long READMEs don't dominate
const searchText = (markdown) =>
  markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/[#*`>|~]+|-{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

const data = fs
  .readdirSync('.')
  .filter(
    (filePath) =>
      fs.existsSync(`./${filePath}/README.md`) &&
      fs.existsSync(`./${filePath}/index.html`) &&
      fs.existsSync(`./${filePath}/image.png`),
  )
  .map((filePath) => {
    const [firstLine, ...rest] = fs
      .readFileSync(filePath + '/README.md')
      .toString()
      .split('\n');
    const [title, year, desc = ''] = firstLine.trim().split(' - ');
    return {
      filePath,
      title,
      year: Number(year),
      desc,
      preview: fs.existsSync(`home/previews/${filePath}.mp4`),
      text: searchText(rest.join('\n')),
    };
  })
  .sort((a, b) => b.year - a.year || (a.title < b.title ? -1 : 1));

fs.writeFileSync('./home/data.json', JSON.stringify(data, null, 2));

// shrink any screenshots that are bigger than they need to be, and make the homepage thumbnails
fs.mkdirSync('home/thumbs', {recursive: true});
for (const {filePath} of data) {
  const {before, after} = await optimizeImage(`${filePath}/image.png`);
  if (after) {
    console.log(
      `${filePath}/image.png: ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`,
    );
  }
  const thumb = await makeThumb(
    `${filePath}/image.png`,
    `home/thumbs/${filePath}.webp`,
  );
  if (thumb)
    console.log(`home/thumbs/${filePath}.webp: ${Math.round(thumb / 1024)}KB`);
}

// the link preview image: a collage of the newest projects
const TILE_W = 300;
const TILE_H = 210;
const tiles = await Promise.all(
  data.slice(0, 12).map(async ({filePath}, i) => ({
    input: await sharp(`home/thumbs/${filePath}.webp`)
      .resize(TILE_W, TILE_H, {fit: 'cover'})
      .toBuffer(),
    left: (i % 4) * TILE_W,
    top: Math.floor(i / 4) * TILE_H,
  })),
);
const firstYear = Math.min(...data.map((p) => p.year));
const caption = Buffer.from(`<svg width="1200" height="630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.45" stop-color="#0f1115" stop-opacity="0"/>
    <stop offset="0.85" stop-color="#0f1115" stop-opacity="0.92"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="48" y="560" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="64" fill="#f9fafb">Junk made by Andrew</text>
  <text x="50" y="600" font-family="Helvetica Neue, Helvetica, Arial" font-size="28" fill="#d1d5db">${data.length} experiments since ${firstYear}: simulations, games and visualizations</text>
</svg>`);
const og = await sharp({
  create: {width: 1200, height: 630, channels: 3, background: '#0f1115'},
})
  .composite([...tiles, {input: caption, left: 0, top: 0}])
  .jpeg({quality: 82, mozjpeg: true})
  .toBuffer();
if (
  !fs.existsSync('home/og.jpg') ||
  !og.equals(fs.readFileSync('home/og.jpg'))
) {
  fs.writeFileSync('home/og.jpg', og);
}
