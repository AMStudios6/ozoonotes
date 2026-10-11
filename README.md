# OzooNotes

![OzooNotes logo](public/ozoo-logo.png)

OzooNotes is a browser-based whiteboard with local boards, multiple page sizes, image import, graph creation, PDF/PNG/SVG export, and portable `.ozoonotes` files.

## Use the website

![OzooNotes website preview](public/ozoonotes-landing.png)

Open the GitHub Pages site and create a file. Boards and recent files are saved in this browser on this device. Use **Save OzooNotes file** to download a portable backup that can be opened on another device.

GitHub Pages hosts the static website only. Account sign-in, server sync, comments, teams, and shared cloud boards require a separate API server and are not available in the Pages version.

## Run locally

Use Node.js 24 or newer.

1. Run `npm ci`.
2. Run `npm run dev` and open the Vite URL it prints.

The API server is optional for local editing. If you want to develop the server-backed features, run `npm run server` in another terminal. It stores account and board data in `data/doomnotes.sqlite`.

## Deploy to GitHub Pages

The repository's GitHub Actions workflow builds the static app and publishes it to Pages. It sets the project-site base path and enables local-only mode automatically. In repository **Settings → Pages**, select **GitHub Actions** as the build and deployment source if it is not already selected.

The site URL is `https://AMStudios6.github.io/ozoonotes/`.

## Build

Run `npm run build` to build the website into `dist/`.
