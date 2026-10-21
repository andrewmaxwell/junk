# Junk

[View the live site here](http://andrewmaxwell.github.io/junk/).

This repository contains a large collection of small experiments. Each project lives in its own directory and typically includes an `index.html`, `main.js`, optional images, and a short `README.md` describing the project.

A script named `generateHome.js` scans all of the project directories and builds `home/data.json` from each project's README (the first line gives the title, year and description; the rest is searchable). It also makes the WebP thumbnails and the link preview image. The home page reads this file and shows the projects grouped by year, with search (`/` to focus, Enter opens the top result, `?q=` in the URL), a Surprise me button, and short video loops of projects running, which play on hover or, on a phone, as a card scrolls through the middle of the screen. `recordPreviews.js` (`npm run previews`) records those loops.

Run `npm run dev` to install dependencies, regenerate the home data, and launch a development server with hot reloading.

The projects range from visual demos and games to small compilers and physics experiments. Browsing the directories and reading their README files is the best way to get familiar with what's here.