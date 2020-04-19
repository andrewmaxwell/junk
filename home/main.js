(async () => {
  document.querySelector('.container').innerHTML =
    (await (await fetch('./home/data.json')).json())
      .map(
        (p) =>
          `<a href="${p.filePath}/" class="item">
            <img src="${p.filePath}/image.png"/>
            <strong>${p.title} - ${p.year}</strong>
            <div class="desc">${p.desc}</div>
           </a>`
      )
      .join('') +
    `
    <span class="item break"></span>
    <span class="item break"></span>
    <span class="item break"></span>
    `;
})();
