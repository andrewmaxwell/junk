import {fromOneHot, makeArray, toOneHot} from '../utils.js';

const response = await fetch('../jibberjabber/bible.txt');
const text = (await response.text())
  .toLowerCase()
  .replace(/[^ a-z]/g, '')
  .slice(0, 1000);
const letters = Array.from(new Set(text)).sort();
const vocabIndex = Object.fromEntries(
  letters.map((v, i, arr) => [v, (i / arr.length) * 2 - 1])
);

const encodeInput = (str) => [...str].map((t) => vocabIndex[t]);

console.log(letters, letters.length, text);

const inputLength = 10;

export const getTrainingData = (size = 2000) =>
  makeArray(size, () => {
    const index = Math.floor(Math.random() * (text.length - inputLength - 1));
    const strInput = text.slice(index, index + inputLength);
    const strExpected = text[index + inputLength];
    return {
      strInput,
      strExpected,
      input: encodeInput(strInput),
      expected: toOneHot(letters.indexOf(strExpected), letters.length),
    };
  });

export const layerSizes = [inputLength, 10, 20, 10, letters.length];

console.log(getTrainingData());

const decodeOutput = (arr) => letters[fromOneHot(arr)] || '?';

export const doStuff = (net) => {
  let result = text.slice(0, inputLength);
  for (let i = 0; i < 1000; i++) {
    result += decodeOutput(net.run(encodeInput(result.slice(-inputLength))));
  }
  return result;
};
