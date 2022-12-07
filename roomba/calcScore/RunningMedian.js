import {PriorityQueue} from '../../misc/PriorityQueue.js';

export class RunningMedian {
  constructor() {
    this.firstHalf = new PriorityQueue((a, b) => b < a); // max heap
    this.secondHalf = new PriorityQueue((a, b) => a < b); // min heap
    this.prevMedian;
  }
  push(n) {
    const {prevMedian, firstHalf, secondHalf} = this;
    if (prevMedian === undefined || n < prevMedian) {
      firstHalf.push(n);
    } else {
      secondHalf.push(n);
    }

    if (firstHalf.size() > secondHalf.size()) {
      secondHalf.push(firstHalf.pop());
    } else if (secondHalf.size() > firstHalf.size()) {
      firstHalf.push(secondHalf.pop());
    }

    const len1 = firstHalf.size();
    const len2 = secondHalf.size();
    return (this.prevMedian =
      len1 === len2
        ? firstHalf.peak() / 2 + secondHalf.peak() / 2
        : len1 > len2
        ? firstHalf.peak()
        : secondHalf.peak());
  }
  get length() {
    return this.firstHalf.size() + this.secondHalf.size();
  }
}
