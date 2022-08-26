export class FIFO {
  push(value) {
    this.last = {value, prev: this.last};
    if (!this.first) this.first = this.last;
    if (this.last.prev) this.last.prev.next = this.last;
  }
  pop() {
    const result = this.first;
    this.first = this.first?.next;
    delete this.first?.prev;
    return result;
  }
  isEmpty() {
    return this.first !== undefined;
  }
}
