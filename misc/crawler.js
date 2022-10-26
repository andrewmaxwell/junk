import fetch from 'node-fetch';
import {URL} from 'url';

const DELAY_MS = 1000;

const wait = () => new Promise((r) => setTimeout(r, DELAY_MS));

const toAbsolute = (absoluteParent, relativeUrl) => {
  try {
    return new URL(relativeUrl, absoluteParent).href;
  } catch (e) {
    console.error(`CANNOT CONVERT ${absoluteParent} + ${relativeUrl}`);
    return relativeUrl;
  }
};

const get = async (url) => {
  try {
    const response = await fetch(url);
    return await response.text();
  } catch (e) {
    console.log(`CANNOT FETCH ${e.message}: ${url}`);
    return '';
  }
};

const main = async (startingUrl) => {
  const q = [startingUrl]; // the queue of urls to be checked
  const seen = new Set(q); // keep track of what URLs we've already collected

  for (const url of q) {
    console.log('Checking', url);
    await wait(DELAY_MS); // add a delay so you aren't DOSing anyone.
    const text = await get(url);
    const links = text.match(/(?<=href=")[^"]+|(?<=href=')[^']+/gi) || [];

    for (const u of links) {
      const abs = toAbsolute(url, u);
      if (seen.has(abs)) continue; // this is much faster than q.includes(abs)
      seen.add(abs);
      q.push(abs);
      console.log(url, '->', u);
    }
    console.log('Found', q.length, 'URLs so far');
  }
};

main('https://en.wikipedia.org/wiki/Main_Page');
