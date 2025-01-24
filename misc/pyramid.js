let total = 0;

for (let i = 1; i < 20; i++) {
  const base = i ** 2;
  total += base;

  console.log(`${i}: ${base} / ${total} = ${base / total}`);
}
