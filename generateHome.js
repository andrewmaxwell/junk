import fs from 'fs';
import {optimizeImage} from './optimizeImages.js';

const data = fs
  .readdirSync('.')
  .filter(
    (filePath) =>
      fs.existsSync(`./${filePath}/README.md`) &&
      fs.existsSync(`./${filePath}/index.html`) &&
      fs.existsSync(`./${filePath}/image.png`),
  )
  .map((filePath) => {
    const [title, year, desc = ''] = fs
      .readFileSync(filePath + '/README.md')
      .toString()
      .split('\n')[0]
      .trim()
      .split(' - ');
    return {filePath, title, year: Number(year), desc};
  })
  .sort((a, b) => b.year - a.year || (a.title < b.title ? -1 : 1));

fs.writeFileSync('./home/data.json', JSON.stringify(data, null, 2));

// shrink any screenshots that are bigger than the homepage needs
for (const {filePath} of data) {
  const {before, after} = await optimizeImage(`${filePath}/image.png`);
  if (after) {
    console.log(
      `${filePath}/image.png: ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`,
    );
  }
}
