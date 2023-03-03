import {randomElement} from '../utils.js';
const inputLength = 16;

const encodeInput = (str, vocabIndex) => [...str].map((t) => vocabIndex[t]);

const encodeOutput = (arr, letters, vocabIndex) => {
  const x = 1 / arr.length;
  const result = new Array(letters.length).fill(0);
  for (const t of arr) result[vocabIndex[t]] += x;
  return result;
};

const exp = 3;
const decodeOutput = (arr, letters) => {
  let total = 0;
  for (const x of arr) total += x ** exp;
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i] ** exp;
    if (x >= r) return letters[i];
    r -= x;
  }
  return '?';
};

// import fs from 'fs';
const getData = async () => {
  const response = await fetch('../jibberjabber/bible.txt');
  const text = (await response.text()).toLowerCase().replace(/[^ a-z]/g, '');

  // const text = fs
  //   .readFileSync('./jibberjabber/bible.txt', 'utf-8')
  //   .toLowerCase()
  //   .replace(/[^ a-z]/g, '');
  const letters = [...new Set(text)];
  const inputVocabIndex = Object.fromEntries(
    letters.map((v, i, arr) => [v, (i / arr.length) * 2 - 1])
  );
  const outputVocabIndex = Object.fromEntries(letters.map((v, i) => [v, i]));

  const dict = {};
  for (let i = 0; i < text.length - inputLength - 1; i++) {
    const key = text.slice(i, i + inputLength);
    (dict[key] = dict[key] || []).push(text[i + inputLength]);
  }

  return {
    text,
    letters,
    inputVocabIndex,
    data: Object.entries(dict).map(([key, val]) => ({
      key,
      input: encodeInput(key, inputVocabIndex),
      expected: encodeOutput(val, letters, outputVocabIndex),
    })),
  };
};

const {text, data, letters, inputVocabIndex} = await getData();
export const getTrainingData = () => randomElement(data);

export const layerSizes = [
  inputLength,
  // letters.length,
  letters.length * 2,
  letters.length * 2,
  letters.length,
];

export const doStuff = (net) => {
  let result = text.slice(0, inputLength);
  for (let i = 0; i < 1000; i++) {
    const key = result.slice(-inputLength);
    result += decodeOutput(net.run(encodeInput(key, inputVocabIndex)), letters);
  }
  return result;
};
