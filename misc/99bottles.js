function formatBottles(count) {
  if (count === 0) return `No more bottles`;
  if (count === 1) return `1 bottle`;
  return `${count} bottles`;
}

for (let i = 99; i >= 1; i--) {
  console.log(`${formatBottles(i)} of beer on the wall,
${formatBottles(i)} of beer!
Take one down, pass it around,
${formatBottles(i - 1)} of beer on the wall!
`);
}
