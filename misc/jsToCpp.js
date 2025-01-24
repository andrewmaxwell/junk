import fs from 'fs';

const jsToCpp = (js) =>
  '#include <iostream>\n#include <vector>\n\n' +
  js
    // remove "let", "function", "= []", "/*", "*/" and "main();"
    .replace(
      /\blet\s*|\bfunction\s*|\s*=\s*\[\]|\/\*\s*|\s*\*\/|main\(\);/g,
      ''
    )
    // convert new Array(x).fill(y) to (x, y)
    .replace(/\s*=\s*new\s+Array\(([^)]+)\).fill\(([^)]+)\)/, '($1, $2)')

    // convert console.log(x) to std:cout << x << std::endl
    .replace(/console\.log\(([^)]+)\)/, 'std::cout << $1 << std::endl')

    // simple conversions
    .replaceAll('.push(', '.push_back(')
    .replaceAll(' of ', ' : ');

console.log(jsToCpp(fs.readFileSync('misc/sieve.js', 'utf-8')));
