export const preprocess = (code) => {
  const labels = {};
  const lines = [];
  let lineNumber = 0;
  for (const line of code.split('\n')) {
    const trimmed = line.replace(/\/\/.*/, '').trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      labels[trimmed] = lineNumber + 1;
    } else if (trimmed.startsWith('$')) {
      const [label, value] = trimmed.split(/\s*=\s*/g);
      lines[lineNumber++] = ['PUSH', +value];
      labels[label] = lineNumber;
    } else {
      lines[lineNumber++] = trimmed
        .split(/\s+/g)
        .map((t) => (isNaN(t) ? t : +t));
    }
  }
  return lines.map((line) => line.map((arg) => labels[arg] || arg));
};
