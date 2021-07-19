const start = process.hrtime();
const log = (label) => console.log(label, process.hrtime(start)[1] / 1e6);

setTimeout(() => log('A'), 0);
log('B');
setTimeout(() => log('C'), 100);
setTimeout(() => log('D'), 0);

// takes about 500ms
for (let i = 1e9; i; i--) {}

log('E');
