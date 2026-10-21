# junk

A collection of standalone browser experiments. Each top-level directory is its own project and has nothing to do with the others.

## Projects

- A project is a directory with `index.html`, `main.js`, `README.md`, and `image.png`. The homepage only lists projects that have the README, index.html, and image.png.
- The first line of the README must read `Title - Year - Short description`. `generateHome.js` parses it by splitting on ` - `.
- `home/data.json` is generated from the READMEs by `generateHome.js`. Never edit it by hand. After changing any README, regenerate it with `npm run gen` (`npm run dev` does this too, but also starts the dev server).
- `npm run gen` also shrinks any `image.png` over 200KB and makes the 800x500 WebP thumbnail the homepage shows (`home/thumbs/`, see `optimizeImages.js`, which uses the `sharp` dev dependency), so screenshots can be saved at any size. It also rebuilds the link preview collage `home/og.jpg` from the newest 12 projects. Commit the shrunken images, thumbnails and collage along with the project.
- `npm run previews [project ...]` records a 4-second loop of each project (or just the named ones) into `home/previews/<project>.mp4` for the homepage to play on hover, then reruns `gen`. It drives the installed Google Chrome headlessly with the `playwright` dev dependency (WebGPU works there) and needs `ffmpeg`. Projects that barely move get no preview, and an existing one is deleted, because the screenshot already shows them. Projects that need a click or a longer warm-up to look like themselves get an entry in `setup` at the top of `recordPreviews.js`. Clips are capped at 700 kbit/s, about 350KB each.
- Some projects have their own `CLAUDE.md`. Read it before working in that project.

## Running

- Pages are plain ES modules with no build step. Browser dependencies come from CDNs (cdnjs, jsdelivr, unpkg), never from `node_modules`, because `node_modules` isn't deployed.
- `npm run dev` serves the repo root at http://localhost:3000/<project>/ and live-reloads on save.
- `languageModel/` and `straw-art-visualizer/` are the exceptions: they have their own build, which `.github/workflows/pages.yml` runs.

## Style

- Use lil-gui for settings panels and controls (`import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm'`) rather than hand-built HTML inputs.

- Lint and format with `npx eslint --fix <project>/*.js`. Prettier options live in `.prettierrc.json`, which ESLint reads, so `npx prettier --write` gives the same result.
- Format once, when a change is finished and before committing, not after every edit. Formatting rewraps lines, so edits written against the earlier text stop matching. Claude's edits aren't formatted on save; VS Code's ESLint fix-on-save only runs when Andrew saves a file in the editor, which reformats the whole file. To check for errors mid-task without reformatting, run `npx eslint <files>` without `--fix`.

## Git

- Pushing to `master` deploys to GitHub Pages (andrewmaxwell.github.io/junk).
- Commit directly to master. Stage only the project you're working on, because other projects often have unrelated uncommitted changes.
- Commit messages look like `project: what changed`.
