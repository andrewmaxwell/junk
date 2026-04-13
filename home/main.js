const response = await fetch('./home/data.json');
const data = await response.json();

const container = document.getElementById('projectContainer');
const searchInput = document.getElementById('searchInput');

function render(projects) {
  container.innerHTML = projects
    .map(
      (p, index) =>
        `<a href="${p.filePath}/" class="item" style="animation-delay: ${index * 0.03}s">
            <div class="image-container">
              <img src="${p.filePath}/image.png" loading="lazy" alt="${p.title}"/>
            </div>
            <div class="item-content">
              <div class="title-row">
                <strong>${p.title}</strong>
                <span class="year-badge">${p.year}</span>
              </div>
              <div class="desc">${p.desc}</div>
            </div>
          </a>`,
    )
    .join('');
}

// Initial render
render(data);

// Search filtering
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = data.filter(
    (p) =>
      p.title.toLowerCase().includes(query) ||
      p.desc.toLowerCase().includes(query) ||
      p.year.toString().includes(query),
  );
  render(filtered);
});
