# En Voz Alta

Spanish practice app (vocab SRS, listening, speaking, grammar, free-talk) — a small
single-user web app with a real backend, so progress syncs reliably between your
phone and laptop instead of depending on browser-local storage.

- `public/index.html` — the frontend (no framework, no build step). All the practice
  logic (SRS scheduling, listening dictation, speech scoring, grammar drills,
  free-talk) lives here and talks to the backend over a small JSON API.
- `content.json` — all vocab, listening sentences, speaking phrases, grammar drills,
  and conversation topics. This is the single source of truth for app content — edit
  it to add/change material, no need to touch the HTML.
- `server/` — Express backend. Serves the frontend, serves content, and stores your
  progress in Postgres.

## How sync works

Your progress (SRS boxes, session count, streak, accuracy stats) is stored in a
single row in a Postgres database. The frontend reads/writes it via:

- `GET /api/progress`
- `POST /api/progress`

Both require an `X-Passcode` header matching the `PASSCODE` environment variable —
this isn't full user auth (there's only one user), just enough that the API isn't
wide open to the public internet. You enter the passcode once per device in the
app's Settings panel; it's saved to that device's `localStorage`.

`GET /api/content` serves `content.json` and is not passcode-protected (it's just
static app content, nothing private).

A manual export/import "backup code" feature is also still in the app (bottom of
the page) as a fallback if the backend or your connection is ever having issues —
it base64-encodes your progress into a text blob you can copy/paste between devices.

## Running locally

1. Get a free Postgres database — see [Deploying](#deploying) below for options.
2. `cp .env.example .env` and fill in `DATABASE_URL` and a `PASSCODE` of your choosing.
3. `npm install`
4. `npm start`
5. Open `http://localhost:3000`, open Settings, and enter your passcode to connect.

## Deploying

You need two things: somewhere to run the Node app, and a Postgres database. Both
have solid free tiers and take about 10 minutes total.

### 1. Database — Neon (free Postgres)

1. Create a free account at [neon.tech](https://neon.tech).
2. Create a project (any name/region).
3. Copy the connection string it gives you (starts with `postgres://...`,
   includes `?sslmode=require`) — this is your `DATABASE_URL`.

Supabase's free Postgres tier works the same way if you'd rather use that instead.

### 2. Hosting — Render (free web service)

1. Push this repo to GitHub (already done if you're reading this from the deployed
   branch).
2. Create a free account at [render.com](https://render.com) and click
   **New → Web Service**, pointing it at this repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Under **Environment**, add:
   - `DATABASE_URL` — the Neon connection string from step 1.
   - `PASSCODE` — a long random string, e.g. generate one with `openssl rand -hex 24`.
5. Deploy. Render gives you a stable `https://your-app.onrender.com` URL that works
   from both your phone and laptop.

Note: Render's free web services can't attach persistent disks and spin down after
15 minutes of inactivity (a request after that just takes a few extra seconds to
wake back up) — neither matters here since progress lives in Postgres, not on
Render's local disk.

Railway or Fly.io work as drop-in alternatives to Render if you'd prefer either of
those — same idea: set `DATABASE_URL` and `PASSCODE`, run `npm start`.

### 3. Connect your devices

Open the deployed URL on your phone and laptop, open Settings on each, and enter
the same `PASSCODE` you set in step 4. Progress now syncs through Postgres instead
of being tied to one device or browser.

## Non-negotiables carried over from the original build

- Vocab progress is keyed by a stable slug of the Spanish word (not array position),
  so future content edits don't corrupt spaced-repetition progress.
- Fácil/Difícil difficulty toggle and both content tiers (`VOCAB` vs `VOCAB_EASY`,
  etc.) are separate content, not the same words at two difficulties.
- "Improvisa" free-talk has no "correct answer" by design.
