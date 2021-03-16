console.log('1. Two sum');

const twoSum = (arr, target) => {
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] + arr[j] === target) return [i, j];
    }
  }
};

console.log(twoSum([2, 7, 11, 15], 9)); // [0, 1]
console.log(twoSum([3, 2, 4], 6)); // [1,2]
console.log(twoSum([3, 3], 6)); // [0, 1]

console.log('2. Add two numbers');

const addTwoArrs = (a, b) => {
  const res = [];
  let carry = 0;
  for (let i = 0; i < a.length || i < b.length; i++) {
    const v = carry + (a[i] || 0) + (b[i] || 0);
    res[i] = v % 10;
    carry = Math.floor(v / 10);
  }
  if (carry) res.push(carry);
  return res;
};

console.log(addTwoArrs([2, 4, 3], [5, 6, 4])); // [7, 0, 8]
console.log(addTwoArrs([0], [0])); // [0]
console.log(addTwoArrs([9, 9, 9, 9, 9, 9, 9], [9, 9, 9, 9])); // [8,9,9,9,0,0,0,1]

console.log('3. Longest Substring Without Repeating Characters');

const longestSubstr = (str) => {
  let best = 0;
  for (let i = 0; i < str.length; i++) {
    for (let j = i + 1; j <= str.length; j++) {
      const s = str.slice(i, j);
      if (new Set(s.split('')).size === s.length && s.length > best) {
        best = s.length;
      }
    }
  }
  return best;
};

console.log(longestSubstr('abcabcbb')); // 3
console.log(longestSubstr('bbbbb')); // 1
console.log(longestSubstr('pwwkew')); // 3
console.log(longestSubstr('')); // 0

// console.log('4. Median of Two Sorted Arrays');

// console.log(median([1,3], [2])) // 2.00000
// console.log(median([1,2], [3,4])) // 2.50000
// console.log(median([0,0], [0,0])) // 0.00000
// console.log(median([], [1])) // 1.00000

console.log('5. Longest Palindromic Substring');

const longestPalindromic = (str) => {
  let best = '';
  for (let i = 0; i < str.length; i++) {
    for (let j = i + 1; j <= str.length; j++) {
      const s = str.slice(i, j);
      if (s.length > best.length && s === s.split('').reverse().join('')) {
        best = s;
      }
    }
  }
  return best;
};

console.log(longestPalindromic('babad')); // "bab"
console.log(longestPalindromic('cbbd')); // "bb"
console.log(longestPalindromic('a')); // "a"
console.log(longestPalindromic('ac')); // "a"

console.log('6. Integer to Roman');

const rom = [
  ['M', 1000],
  ['CM', 900],
  ['D', 500],
  ['CD', 400],
  ['C', 100],
  ['XC', 90],
  ['L', 50],
  ['XL', 40],
  ['X', 10],
  ['IX', 9],
  ['V', 5],
  ['IV', 4],
  ['I', 1],
];

const intToRoman = (num) => {
  for (const [letters, val] of rom) {
    if (val <= num) return letters + intToRoman(num - val);
  }
  return '';
};

console.log(intToRoman(3)); // "III"
console.log(intToRoman(4)); // "IV"
console.log(intToRoman(9)); // "IX"
console.log(intToRoman(58)); // "LVIII"
console.log(intToRoman(1994)); // "MCMXCIV"

console.log('7. Valid Parenthesis');

const pairs = {'(': ')', '[': ']', '{': '}'};

const validParens = (str) => {
  const stack = [];
  for (const t of str) {
    if (pairs[t]) stack.push(t);
    else if (pairs[stack.pop()] !== t) return false;
  }
  return stack.length === 0;
};

console.log(validParens('()')); // true
console.log(validParens('()[]{}')); // true
console.log(validParens('(]')); // false
console.log(validParens('([)]')); // false
console.log(validParens('{[]}')); // true

console.log('8. Group Anagrams');

const groupAnagrams = (arr) => {
  const groups = {};
  for (const s of arr) {
    const key = s.split('').sort().join('');
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return Object.values(groups);
};

console.log(groupAnagrams(['eat', 'tea', 'tan', 'ate', 'nat', 'bat'])); // [["bat"],["nat","tan"],["ate","eat","tea"]]
console.log(groupAnagrams([''])); // [[""]]
console.log(groupAnagrams(['a'])); // [["a"]]

console.log('9. Search Insert Position');

const insertPosition = (arr, target) => {
  const index = arr.findIndex((v) => v >= target);
  return index === -1 ? arr.length : index;
};

console.log(insertPosition([1, 3, 5, 6], 5)); // 2
console.log(insertPosition([1, 3, 5, 6], 2)); // 1
console.log(insertPosition([1, 3, 5, 6], 7)); // 4
console.log(insertPosition([1, 3, 5, 6], 0)); // 0
console.log(insertPosition([1], 0)); // 0

console.log('10. Implement strStr()');

const strstr = (haystack, needle) => haystack.indexOf(needle);

console.log(strstr('hello', 'll')); // 2
console.log(strstr('aaaaa', 'bba')); // -1
console.log(strstr('', '')); // 0

console.log('11. Length of Last Word');

const lenLastWord = (str) => str.split(' ').pop().length;

console.log(lenLastWord('Hello World')); // 5
console.log(lenLastWord(' ')); // 0

console.log('13. Edit Distance');

const editDist = (a, b) => {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  return Math.min(
    editDist(a.slice(1), b) + 1,
    editDist(a, b.slice(1)) + 1,
    editDist(a.slice(1), b.slice(1)) + (a[0] === b[0] ? 0 : 1)
  );
};
console.log(editDist('horse', 'ros')); // 3
console.log(editDist('intention', 'execution')); // 5

console.log('15. Merge Sorted Array');

const mergeSorted = (a, n, b, m) => a.slice(0, n).concat(b.slice(0, m)).sort();

console.log(mergeSorted([1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3)); // [1,2,2,3,5,6]
console.log(mergeSorted([1], 1, [], 0)); // [1]
