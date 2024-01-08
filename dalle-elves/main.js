import {initViewer} from './viewer.js';

const types = [
  'forest',
  'river',
  'mountain',
  'dark',
  'ice',
  'cave',
  'space',
  'volcano',
  'electric',
  'cloud',
  'banana',
  'light',
  'dirt',
  'magic',
  'diamond',
  'blackHole',
  'proud',
  'mystic',
  'ocean',
  'giant',
  'mayonnaise',
  'mushroom',
  'meatloaf',
  'glass',
  'future',
  'cartoon',
  'detailed',
  'sword',
  '1995fordTaurus',
  'microscopic',
  'dewalt',
  'iphone',
  'android',
  'noodle',
  'emptyHead',
  'smart',
];

const img = (type, num) => `
  <a href="#${type}${num}.png">
    <img class="thumbnail" src="${type}${num}.png" alt="${type} elf" title="${type}"/>
  </a>`;

document.body.innerHTML += types
  .map((type) => `<h1>${type} Elf</h1>${img(type, 1)}${img(type, 2)}`)
  .join('');

initViewer();
