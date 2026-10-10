# OzooNotes

OzooNotes is a React whiteboard with local boards, multi-page A-series and US paper sizes, image import, PDF/PNG/SVG export, portable `.doomnotes` files, and a self-hostable collaboration API.

## Run locally

Use Node.js 24 or newer. The cloud API uses Node's built-in SQLite module; there are no extra server packages to install.

Open two terminals in this project folder:

1. Start the API server with `npm run server`.
2. Start the website with `npm run dev` and open the Vite URL it prints.

The dev website forwards `/api` requests to the server on port 8787. Create an account from **Sign in**, then use **Save to server** in the board menu. A password must be at least 12 characters. You can also enable Google sign-in with the setup below.

## Google sign-in

1. Create a Web application OAuth client in Google Cloud Console and set the local authorized redirect URI to `http://localhost:5173/api/auth/google/callback`.
2. Copy `.env.example` to `.env` and fill in the client ID and secret. Keep `.env` private; it is ignored by Git.
3. Start the API with `npm run server`, then the site with `npm run dev`. The **Continue with Google** button appears when the server has all three OAuth values.

Set `GOOGLE_REDIRECT_URI` to the exact callback URL you add in Google Cloud Console. For production, use your HTTPS site URL followed by `/api/auth/google/callback`. The OAuth flow only requests basic sign-in (`openid email profile`); cloud boards remain stored on the OzooNotes server. Google accounts create OzooNotes accounts and are identified by Google's stable account ID.

## Cloud and collaboration

The server stores accounts, folders, boards, access roles, teams, public read-only links, and comments in `data/doomnotes.sqlite`. It supports:

- Individual board access as view-only or edit
- Team membership and team-level board permissions
- Revocable public read-only links (also usable as iframe sources)
- Comments with live updates while collaborators have the board open
- Live board refresh after another collaborator saves

Cloud saving and collaboration work only while the server is running. To reach it from other devices, deploy the API and website on a host you control, persist the `data` directory, and put both behind HTTPS on the same site origin. Configure the reverse proxy to send `/api/*` requests to the API server and serve the built frontend from `dist/`. Set `NODE_ENV=production` so session cookies are marked Secure. Do not expose the API over plain public HTTP.

### Railway deployment

Railway is a straightforward fit for this app because the Node server can serve the built website and API together, while a mounted volume keeps its SQLite database between deployments. Create one Node service from this repository and configure:

- Build command: `npm ci && npm run build`
- Start command: `npm run server`
- Volume mount path: `/app/data`
- Variables: `HOST=0.0.0.0`, `NODE_ENV=production`, `DOOMNOTES_DB=/app/data/doomnotes.sqlite`, plus the three Google OAuth variables

Use the service's public HTTPS domain when setting `GOOGLE_REDIRECT_URI`, then add that exact URL ending in `/api/auth/google/callback` to the Google OAuth client's authorized redirect URIs. Railway volumes provide persistent service data across deployments and restarts; keep a separate database backup as well.

The development server listens on `127.0.0.1` by default. Set `HOST=0.0.0.0` only behind a firewall and HTTPS reverse proxy when you intentionally make the API reachable from your network.

Boards can be saved in the browser or downloaded as `.doomnotes` files and reopened later. PDF export includes every page; PNG and SVG export the currently selected page. Undo and redo work with the on-screen history buttons and `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, or `Ctrl/Cmd+Y`.

Passwords are stored as scrypt hashes and browser sessions use HttpOnly cookies. Board data in SQLite is not encrypted at rest, so protect the server disk and database backups.

## Build

Run `npm run build` to build the website into `dist/`.

