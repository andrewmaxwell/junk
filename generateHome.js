const fs = require('fs');
const {resolve} = require('path');

const dirs = fs
  .readdirSync('.')
  .filter(file => fs.existsSync(resolve(__dirname, file + '/index.html')))
  .map(file => `<a href="${file}/">${file.split('-').join(' ')}</a>`)
  .join('<br/>');

fs.writeFileSync(
  'index.html',
  `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>Junk</title>
  </head>
  <body>
    ${dirs}
  </body>
</html>`
);
