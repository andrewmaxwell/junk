import fs from 'fs';

const data = fs
  .readdirSync('.')
  .filter(
    (filePath) =>
      fs.existsSync(`./${filePath}/README.md`) &&
      fs.existsSync(`./${filePath}/index.html`)
  )
  .map((filePath) => {
    const [title, year, desc = ''] = fs
      .readFileSync(filePath + '/README.md')
      .toString()
      .trim()
      .split(' - ');
    return {filePath, title, year: Number(year), desc};
  })
  .sort((a, b) => b.year - a.year || (a.title < b.title ? -1 : 1));

fs.writeFileSync('./home/data.json', JSON.stringify(data, null, 2));
