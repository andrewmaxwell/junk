# junk

A collection of standalone browser experiments. Each top-level directory is its own project and has nothing to do with the others.

## Projects

- A project is a directory with `index.html`, `main.js`, `README.md`, and `image.png`. The homepage only lists projects that have the README, index.html, and image.png.
- The first line of the README must read `Title - Year - Short description`. `generateHome.js` parses it by splitting on ` - `.
- `home/data.json` is generated from the READMEs by `generateHome.js`. Never edit it by hand. After changing any README, regenerate it with `npm run gen` (`npm run dev` does this too, but also starts the dev server).
- `npm run gen` also shrinks any homepage `image.png` over 200KB (see `optimizeImages.js`, which uses the `sharp` dev dependency), so screenshots can be saved at any size. Commit the shrunken images along with the project.
- Some projects have their own `CLAUDE.md`. Read it before working in that project.

## Running

- Pages are plain ES modules with no build step. Browser dependencies come from CDNs (cdnjs, jsdelivr, unpkg), never from `node_modules`, because `node_modules` isn't deployed.
- `npm run dev` serves the repo root at http://localhost:3000/<project>/ and live-reloads on save.
- `languageModel/` and `straw-art-visualizer/` are the exceptions: they have their own build, which `.github/workflows/pages.yml` runs.

## Style

- Lint and format with `npx eslint --fix <project>/*.js`. Prettier options live in `.prettierrc.json`, which ESLint reads, so `npx prettier --write` gives the same result.

## Git

- Pushing to `master` deploys to GitHub Pages (andrewmaxwell.github.io/junk).
- Commit directly to master. Stage only the project you're working on, because other projects often have unrelated uncommitted changes.
- Commit messages look like `project: what changed`.
