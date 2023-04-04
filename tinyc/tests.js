export const tests = [
  {input: `{ i=125; j=100; }`, expected: {i: 125, j: 100}},
  {input: 'x=1+2-3+4-5+6;', expected: {x: 5}},
  {input: 'if (0) j=10; else i=10;', expected: {i: 10}},
  {input: 'a=b=c=2<3;', expected: {a: 1, b: 1, c: 1}},
  {
    input: `{
  i=125;
  j=100; 
  while (i-j) {
    if (i<j) {
      j=j-i; 
    } else {
      i=i-j; 
    }
  }
}`,
    expected: {i: 25, j: 25},
  },
  {
    input: `{
  i=1; 
  do i=i+10; while (i<50);
}`,
    expected: {i: 51},
  },
  {
    input: `{
  i=7; 
  if (i<5) x=1; 
  if (i<10) y=2; 
}`,
    expected: {i: 7, y: 2},
  },
  {
    input: `{ 
  i=1000; 
  t=0; 
  while (i) {
    t = t + i; 
    i = i - 1;
  }
}`,
    expected: {i: 0, t: 500500},
  },
];
