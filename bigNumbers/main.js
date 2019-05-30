class Big {
  constructor(str = '') {
    this.vals = str
      .split('')
      .map(Number)
      .reverse();
  }
  add(b2) {
    const bigger = this.vals.length > b2.vals.length ? this.vals : b2.vals;
    const smaller = this.vals.length > b2.vals.length ? b2.vals : this.vals;
    const result = new Big();
    for (let i = 0; i < bigger.length; i++) {
      const s = bigger[i] + (smaller[i] || 0);
      result.vals[i] = (result.vals[i] || 0) + (s % 10);
      result.vals[i + 1] = Math.floor(s / 10);
    }
    console.log('result', result);
    return result;
  }
  toString() {
    return this.vals
      .reverse()
      .join('')
      .replace(/^0+/, '');
  }
}

const result = new Big('111111111111111111111111')
  .add(new Big('222222222222222222222222222222'))
  .toString();

console.log(result);
