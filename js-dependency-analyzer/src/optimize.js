import json from '../output.json';
// import fs from 'fs';

const maxLines = 300;
const excessLineCost = 0.1;
const importCost = 1;
const changeCost = 15;
const temperatureMult = 1;
const iterations = 1e5;

// const easing = t => --t * t;
const easing = t => 1 - t;

const origMapping = {};
const funcs = Object.keys(json);
funcs.forEach(key => {
  origMapping[key] = key.split(':')[1];
  json[key].numLines = json[key].code.split('\n').length + 1;
});
const fileNames = Object.values(origMapping);

// mapping: funcName -> fileName
const getCost = mapping => {
  var files = {}; // {fileName: [part, part, part]}
  let numChanges = 0;
  for (var key in mapping) {
    const fileName = mapping[key];
    (files[fileName] = files[fileName] || []).push(json[key]);
    if (fileName !== origMapping[key]) numChanges++;
  }

  var score = numChanges * changeCost;
  for (var fileName in files) {
    var numLines = 0;
    var imports = [];
    var parts = files[fileName];
    for (let i = 0; i < parts.length; i++) {
      numLines += parts[i].numLines;
      for (let j = 0; j < parts[i].dependencies.length; j++) {
        const funcId = parts[i].dependencies[j].id;
        var otherFile = mapping[funcId] || funcId;
        if (otherFile !== fileName && !imports.includes(otherFile)) {
          imports.push(otherFile);
        }
      }
    }
    // console.log(fileName, numLines, imports.join(', '));
    score +=
      Math.max(0, numLines - maxLines) * excessLineCost +
      imports.length * importCost;
  }
  return score;
};

const getNeighbor = mapping => {
  var changeKey = funcs[Math.floor(Math.random() * funcs.length)];
  var value = fileNames[Math.floor(Math.random() * fileNames.length)];

  var newState = {};
  for (var key in mapping) {
    newState[key] = mapping[key];
  }
  newState[changeKey] = value;
  return newState;
};

var origCost = getCost(origMapping);
var currentCost = origCost;
var current = origMapping;
var deltaSum = 0;
for (var i = 0; i < iterations; i++) {
  var next = getNeighbor(current);
  var nextCost = getCost(next);
  var delta = nextCost - currentCost;
  deltaSum += delta;
  var temperature = temperatureMult * easing(i / iterations);
  if (delta <= 0 || Math.random() < Math.exp(-delta / temperature)) {
    current = next;
    currentCost = nextCost;
  }
  if (i % 1000 === 0) {
    console.log(
      Math.round(currentCost),
      deltaSum / 1000,
      Math.exp(-deltaSum / 1000 / temperature)
    );
    deltaSum = 0;
  }
}

for (var key in current) {
  if (current[key] !== origMapping[key]) {
    console.log(key + ' -> ' + current[key]);
  }
}
console.log(`Cost went from ${origCost} to ${currentCost}`);
