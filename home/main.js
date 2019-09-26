(async () => {
  document.body.innerHTML = (await (await fetch('./home/data.json')).json())
    .map(
      p =>
        `<div class="container">
          <a href="${p.filePath}/" title="${p.desc}"><img src="${p.filePath}/image.png"/>${p.title}</a> ${p.year}
        </div>`
    )
    .join('');
})();
