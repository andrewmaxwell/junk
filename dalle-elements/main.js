document.body.innerHTML += Array.from(
  {length: 118},
  (_, i) => `<img src="${i + 1}.jpg" alt="Element ${i + 1}" />`
).join('');
