# OzooNotes

![OzooNotes logo](public/ozoo-logo.png)

**A little space for big ideas.** OzooNotes is a calm, browser-based workspace for sketching, planning, and bringing ideas to life. Draw on a board, add images or notes, make graphs, and keep your pages together.

## Give it a try

### [Open OzooNotes](https://AMStudios6.github.io/ozoonotes/)

No installation is needed. Open the site, start a board, and make room for your next idea.

![OzooNotes website preview](public/ozoonotes-landing.png)

### What you can do

- Sketch and organize ideas on boards with multiple page sizes.
- Add images and create graphs.
- Export your work as PDF, PNG, or SVG.
- Save a portable `.ozoonotes` file to keep a backup or move your work to another device.

Boards and recent files are saved in your browser on this device. Download a portable file when you want to back up or transfer a board.

> **Ready to make something? [Start a new board](https://AMStudios6.github.io/ozoonotes/).**

## Run locally

Use Node.js 24 or newer.

1. Run `npm ci`.
2. Run `npm run dev` and open the Vite URL it prints.

The API server is optional for local editing. To develop the server-backed features, run `npm run server` in another terminal. It stores account and board data in `data/doomnotes.sqlite`.

## Deploy to GitHub Pages

The repository's GitHub Actions workflow builds the static app and publishes it to Pages. It sets the project-site base path and enables local-only mode automatically. In repository **Settings → Pages**, select **GitHub Actions** as the build and deployment source if it is not already selected.

The site URL is [https://AMStudios6.github.io/ozoonotes/](https://AMStudios6.github.io/ozoonotes/).

## Build

Run `npm run build` to build the website into `dist/`.
