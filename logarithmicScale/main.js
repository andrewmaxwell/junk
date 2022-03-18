const pageLength = 2000;
const textarea = document.querySelector('textarea');

const doStuff = () => {
  location.hash = encodeURIComponent(textarea.value.trim());
  const data = textarea.value
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((r) => {
      const [name, num] = r.trim().split(/\s*:\s*/);
      return {name, size: parseFloat(num)};
    });
  data.sort((a, b) => a.size - b.size);
  const min = Math.log(data[0].size);
  const max = Math.log(data[data.length - 1].size);

  let result = '';
  for (const {name, size} of data) {
    const y = ((Math.log(size) - min) / (max - min)) * pageLength;
    result += `<div class="item" style="top:${y};left:60px" title="${name}">${name}: ${size.toExponential()}m</div>`;
  }

  for (
    let i = 10 ** Math.floor(Math.log10(data[0].size) + 1);
    i < data[data.length - 1].size * 10;
    i *= 10
  ) {
    const y = ((Math.log(i) - min) / (max - min)) * pageLength;
    result += `<div class="item label" style="top:${y}">${i.toExponential(
      0
    )}m</div>`;
  }

  document.querySelector('#result').innerHTML = result;
};

if (location.hash.length > 1) {
  textarea.value = decodeURIComponent(location.hash.slice(1));
}
textarea.addEventListener('input', doStuff);
doStuff();
