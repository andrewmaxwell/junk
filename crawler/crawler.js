import fetch from 'node-fetch';
import {URL} from 'url';
import fs from 'fs';

const TIMEOUT = 10_000;
const NUM_PARALLEL = 8;

const toAbsolute = (absoluteParent, relativeUrl) => {
  try {
    return new URL(relativeUrl, absoluteParent).href;
  } catch (e) {
    console.error(`CANNOT CONVERT ${absoluteParent} + ${relativeUrl}`);
    return '';
  }
};

const get = async (url) => {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), TIMEOUT);
    const response = await fetch(url, {
      signal: ctrl.signal,
      rejectUnauthorized: false,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);
    return await response.text();
  } catch (e) {
    console.log(`CANNOT FETCH ${e.message}: ${url}`);
    return '';
  }
};

const getLinksFrom = async (url) => {
  const text = await get(url);
  return (text.match(/href=["'][^"'#]+/gi) || [])
    .map((link) => toAbsolute(url, link.slice(6)))
    .filter((x) => x.startsWith('http'));
};

const getStream = (filename) => {
  fs.writeFileSync(filename, '');
  return fs.createWriteStream(filename, {flags: 'a'});
};

const urlStream = getStream('urls.txt');
const edgeStream = getStream('edges.txt');

let counter = 0;
const urlIndex = {};
const getIndex = (url) => {
  if (urlIndex[url] === undefined) {
    urlIndex[url] = counter++;
    urlStream.write(url + '\n');
  }
  return urlIndex[url];
};

const getGraph = async (startUrl, maxDepth) => {
  const inQ = new Set();
  const q = [{url: startUrl, depth: 0}];

  for (let i = 0; i < q.length; i += NUM_PARALLEL) {
    const promises = q.slice(i, i + NUM_PARALLEL).map(async ({url, depth}) => {
      const links = await getLinksFrom(url);
      console.log(url, depth);
      if (links.length)
        edgeStream.write(`${getIndex(url)}:${links.map(getIndex).join(',')}\n`);
      if (depth === maxDepth) return;
      for (const link of links) {
        if (inQ.has(link)) continue;
        inQ.add(link);
        q.push({url: link, depth: depth + 1});
      }
    });

    const percent = Math.round((100 * i) / q.length);
    console.log(`${i}/${q.length} complete (${percent}%)`);

    await Promise.all(promises);
  }
};

getGraph('https://www.spacejam.com/1996/', 3);
