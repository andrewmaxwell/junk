export class Env {
  constructor() {
    this.data = [0];
    this.output = '';
  }
  get(index) {
    return this.data[index];
  }
  set(index, value) {
    this.data[index] = value;
  }
  push(value) {
    this.data.push(value);
  }
  pop() {
    this.data.pop();
  }
  inc(index) {
    this.data[index]++;
  }
  print(val) {
    this.output += val;
  }
}
