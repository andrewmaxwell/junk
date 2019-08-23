const fs = require('fs');
const {resolve} = require('path');
const {pipe, filter, map, join, both, sort} = require('ramda');

const fileExists = filename => filePath =>
  fs.existsSync(resolve(__dirname, filePath + '/' + filename));

const dirs = pipe(
  filter(both(fileExists('README.md'), fileExists('index.html'))),
  map(filePath => {
    const [title, year, desc = ''] = fs
      .readFileSync(filePath + '/README.md')
      .toString()
      .trim()
      .split(' - ');
    return {
      filePath,
      title,
      year: Number(year),
      desc
    };
  }),
  sort((a, b) => b.year - a.year || (a.title < b.title ? -1 : 1)),
  map(
    p =>
      `<div><a href="${p.filePath}/" title="${p.desc}">${p.title}</a> ${p.year}</div>`
  ),
  join('\n')
)(fs.readdirSync('.'));

fs.writeFileSync(
  'index.html',
  `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Junk</title>
    <style>* {font-family: sans-serif} .desc {color: #CCC}</style>
  </head>
  <body>
    ${dirs}
  </body>
</html>`
);
