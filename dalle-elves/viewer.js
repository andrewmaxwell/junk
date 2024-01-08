export const initViewer = () => {
  document.body.innerHTML += `
    <div id="viewer" style="display: none; background: rgba(0,0,0,0.5); position: fixed; top: 0; left: 0; width: 100%; height: 100%; justify-content: center; align-items: center;">
      <img src="" alt="full size" style="max-width: 100%; max-height: 100%; object-fit: cover; box-shadow: 0 0 32px rgba(0,0,0,0.8);" />
      <h1 style="position: fixed; bottom: 0; right: 20px"></h1>
    </div>`;

  const container = document.querySelector('#viewer');

  const hashChange = () => {
    if (location.hash.length <= 1) {
      container.style.display = 'none';
      return;
    }
    container.querySelector('img').src = location.hash.slice(1);
    container.querySelector('h1').innerText = location.hash
      .slice(1)
      .split('.')[0];
    container.style.display = 'flex';
  };
  window.addEventListener('hashchange', hashChange);

  const advance = (dir) => {
    const hrefs = [...document.querySelectorAll('a')]
      .map((a) => a.href)
      .filter((a) => a.includes('#'));

    const currIndex = hrefs.findIndex((href) => href.endsWith(location.hash));
    const nextIndex = (currIndex + dir + hrefs.length) % hrefs.length;
    location.hash = hrefs[nextIndex].split('#').pop();
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') location.hash = '';
    else if (e.key === 'ArrowLeft') advance(-1);
    else if (e.key === 'ArrowRight') advance(1);
  });

  container.addEventListener('click', (e) => {
    if (e.target === container) location.hash = '';
  });

  hashChange();
};
