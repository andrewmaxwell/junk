self.onmessage = ({data: {iterations}}) =>
  postMessage(
    Array.from({length: iterations}, () => {
      const n = Math.random();
      return Math.sqrt(n) * Math.sin(n) * Math.cos(n);
    }).reduce((a, b) => a + b)
  );
