const num = Math.floor(Math.random() * 1000);
let tries = 0;

while (true) {
  tries = tries + 1;
  const guess = Number(prompt('Make a guess'));
  if (guess < num) alert('Too low.');
  else if (guess > num) alert('Too high');
  else if (guess === num) break;
}

alert(`You got it in ${tries} guesses!`);
