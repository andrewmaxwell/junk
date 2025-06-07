# Junk

[View the live site here](http://andrewmaxwell.github.io/junk/).

This repository contains a large collection of small experiments. Each project lives in its own directory and typically includes an `index.html`, `main.js`, optional images, and a short `README.md` describing the project.

A script named `generateHome.js` scans all of the project directories and builds `home/data.json` from the first line of each project's README. The home page then reads this file and shows a grid of links to every project.

Run `npm run dev` to install dependencies, regenerate the home data, and launch a development server with hot reloading.

The projects range from visual demos and games to small compilers and physics experiments. Browsing the directories and reading their README files is the best way to get familiar with what's here.