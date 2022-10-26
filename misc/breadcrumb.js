const exclusions = new Set([
  'THE',
  'OF',
  'IN',
  'FROM',
  'BY',
  'WITH',
  'AND',
  'OR',
  'FOR',
  'TO',
  'AT',
  'A',
]);

const formatLabel = (str) => {
  const res = str.toUpperCase().replace(/\?.*$/, '').replace(/-/g, ' ');
  return res.length > 30
    ? res
        .split(' ')
        .filter((w) => !exclusions.has(w))
        .map((w) => w[0])
        .join('')
    : res;
};

const generateBC = (url, separator) =>
  url
    .replace(/https?:\/\/|\/?(index)?(\.[a-z]+)?(\?[^#]+)?(#.+)?$/g, '$3')
    .split('/')
    .map((p, i, arr) => {
      if (i === arr.length - 1)
        return `<span class="active">${
          i === 0 ? 'HOME' : formatLabel(p)
        }</span>`;
      if (i === 0) return `<a href="/">HOME</a>`;
      const urlParts = arr.slice(1, i + 1).join('/');
      return `<a href="/${urlParts}/">${formatLabel(p)}</a>`;
    })
    .join(separator);

import {Test} from './test.js';
Test.assertDeepEquals(
  generateBC('mysite.com/pictures/holidays.html', ' : '),
  '<a href="/">HOME</a> : <a href="/pictures/">PICTURES</a> : <span class="active">HOLIDAYS</span>'
);
Test.assertDeepEquals(
  generateBC('www.codewars.com/users/GiacomoSorbi', ' / '),
  '<a href="/">HOME</a> / <a href="/users/">USERS</a> / <span class="active">GIACOMOSORBI</span>'
);
Test.assertDeepEquals(
  generateBC(
    'www.microsoft.com/important/confidential/docs/index.htm#top',
    ' * '
  ),
  '<a href="/">HOME</a> * <a href="/important/">IMPORTANT</a> * <a href="/important/confidential/">CONFIDENTIAL</a> * <span class="active">DOCS</span>'
);
Test.assertDeepEquals(
  generateBC(
    'mysite.com/very-long-url-to-make-a-silly-yet-meaningful-example/example.asp',
    ' > '
  ),
  '<a href="/">HOME</a> > <a href="/very-long-url-to-make-a-silly-yet-meaningful-example/">VLUMSYME</a> > <span class="active">EXAMPLE</span>'
);
Test.assertDeepEquals(
  generateBC(
    'www.very-long-site_name-to-make-a-silly-yet-meaningful-example.com/users/giacomo-sorbi',
    ' + '
  ),
  '<a href="/">HOME</a> + <a href="/users/">USERS</a> + <span class="active">GIACOMO SORBI</span>'
);

Test.assertDeepEquals(
  generateBC('https://www.agcpartners.co.uk/index.html', ' >>> '),
  '<span class="active">HOME</span>'
);

Test.assertDeepEquals(
  generateBC(
    'http://www.pippi.pi/insider-skin-for-with-the-kamehameha/at-pippi-the-paper-bed-bed-from/giacomo-sorbi.htm?previous=normalSearch&output=full',
    ' >>> '
  ),
  '<a href="/">HOME</a> >>> <a href="/insider-skin-for-with-the-kamehameha/">ISK</a> >>> <a href="/insider-skin-for-with-the-kamehameha/at-pippi-the-paper-bed-bed-from/">PPBB</a> >>> <span class="active">GIACOMO SORBI</span>'
);
