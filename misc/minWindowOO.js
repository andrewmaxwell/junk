class FrequencyCounter {
  constructor(arr) {
    this.counts = {};
    for (const c of arr) this.inc(c);
  }
  get(key) {
    return this.counts[key] || 0;
  }
  inc(key) {
    return (this.counts[key] = this.get(key) + 1);
  }
  dec(key) {
    return (this.counts[key] = this.get(key) - 1);
  }
  size() {
    return Object.keys(this.counts).length;
  }
}

class SlidingWindow {
  constructor(sourceStr) {
    this.sourceStr = sourceStr;
    this.leftIndex = 0;
    this.rightIndex = 0;
    this.counts = new FrequencyCounter('');
  }
  canGrowRight() {
    return this.rightIndex < this.sourceStr.length;
  }
  growRight() {
    const newChar = this.sourceStr[this.rightIndex++];
    return [newChar, this.counts.inc(newChar)];
  }
  shrinkLeft() {
    const discardedChar = this.sourceStr[this.leftIndex++];
    return [discardedChar, this.counts.dec(discardedChar)];
  }
  getWindowString() {
    return this.sourceStr.slice(this.leftIndex, this.rightIndex);
  }
}

class RemainingCounter {
  constructor(neededChars) {
    this.targetCounts = new FrequencyCounter(neededChars);
    this.numRemaining = this.targetCounts.size(); // number of unique chars needed in the window
  }
  decIfHasEnough(char, count) {
    if (count === this.targetCounts.get(char)) {
      this.numRemaining--;
    }
  }
  incIfNeedMore(char, count) {
    if (count < this.targetCounts.get(char)) {
      this.numRemaining++;
    }
  }
  isZero() {
    return this.numRemaining === 0;
  }
}

class ShortestResult {
  constructor() {
    this.value = '';
  }
  saveIfShorter(str) {
    if (!this.value || str.length < this.value.length) {
      this.value = str;
    }
  }
  getValue() {
    return this.value;
  }
}

const minWindow = (sourceStr, neededChars) => {
  const win = new SlidingWindow(sourceStr);
  const counter = new RemainingCounter(neededChars);
  const result = new ShortestResult();

  while (win.canGrowRight()) {
    const [newChar, newCharCount] = win.growRight();
    counter.decIfHasEnough(newChar, newCharCount);

    while (counter.isZero()) {
      result.saveIfShorter(win.getWindowString());

      const [discaredChar, discardedCharCount] = win.shrinkLeft();
      counter.incIfNeedMore(discaredChar, discardedCharCount);
    }
  }

  return result.getValue();
};

import {Test} from './test.js';
Test.assertEquals(minWindow('a', 'a'), 'a');
Test.assertEquals(minWindow('a', 'aa'), ''); // 'a' does not contain 2 a's, return empty string
Test.assertEquals(minWindow('ab', 'a'), 'a');
Test.assertEquals(minWindow('ab', 'b'), 'b');
Test.assertEquals(minWindow('ab', 'b'), 'b');
Test.assertEquals(minWindow('xxaxxbxxcxxxxxacxxxbxxxxxx', 'abc'), 'acxxxb');
Test.assertEquals(
  minWindow(
    'ezsevejszgvxqqggbwkxpwzoyrbaslnxmfdjmmentzllptsspeshatvbkwbcjozwwcfirjxmiixadrsvwmcyfzzpxauhptdlyivrssdadacisxdojhopgogeoalfwoswypnqiqtnqxvkubaeiptpdzvtaizywtuwjhptxkgnhdaceagppbeuabocjpahiudrdskacsqmwqocqurivxcxyqcjfcqqzwheqsfvkxhinvlfrenmcslcinoqsggtcpxtjcowbveosrwjyjvcbigmwueobmjdbgynlojmjpbbjzmhkjjosraomgepsnuvvtkghtttlwwuxjdhsovmfvctdiixxdvtyfzhbuamszipklxezsrgqtavcitzloulvwtwqvklwscgfznguenmzphdxcdlqxwotrkmnxzjrbsxdffxlslkhsohxtupsqdokqaxnzieccdfhjesdpfnktuhoqwgicussurhvalaerfmakgfznslioswerdntxfnuxurzhrfyzrajagkpywypqutjzicxqrtplkqtevtdpuoraagayeppblyavdzluscifsblowqdqeuqectdjkukxumtzogwijenbhapdquuwqmbthgcscmpyaiyorwxaambjntmfnicexfzenbyppoppyngpjdplrtugojmbtqhsvixkjxbylqqmgwbpbtdsozzcinfedpwaxvkhtnhgdxsjtwburephdojodouifqkdowmjjtpmrkwmizjzdygioryrhsznllqbhekqxbeqlcdtbougmcpavptdkuqvfiymmieljkcxnhsovpvjrmjnbcqlwiidsirgqvrcfvbuctlzigicutrxxjlvrvylerrwmkaugbqkxbkhjujdqcdplolejlpndimrtmnzoelnfvupsgukixzwlkaxysmbayuvliubogotdkkxqhhbejxsvxrtpdwsetnrb',
    'ksrsimxsxxjegkkpj'
  ),
  'mnxzjrbsxdffxlslkhsohxtupsqdokqaxnzieccdfhjesdpfnktuhoqwg'
);
