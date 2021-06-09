const start = Date.now();
setTimeout(() => console.log('A', Date.now() - start), 0);
console.log('B', Date.now() - start);
setTimeout(() => console.log('C', Date.now() - start), 100);
setTimeout(() => console.log('D', Date.now() - start), 0);
let i = 0;
while (i < 1e9) {
  // Assume this takes ~500ms
  let ignore = Math.sqrt(i);
  i++;
}
console.log('E', Date.now() - start);
