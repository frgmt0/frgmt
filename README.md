# frgmt.xyz — the dig

Bun + React + Vite personal site for `frgmt0`. Every public repo, rendered as an
excavation: newest work at the surface, older strata as you scroll down.

The depth is real, not decorative —

- a canvas field of drifting shards with pointer + scroll parallax (they scatter near the cursor)
- a wordmark sliced into clip-path shards that shear apart as the pointer moves
- rows that surface out of the deep as they cross a focal plane while scrolling
- ghost year numerals drifting at a different parallax rate behind each stratum
- a sticky depth gauge that fills as you descend and tracks the current year

All motion is `transform`/`opacity` only, driven by a single rAF loop writing CSS
custom properties. `prefers-reduced-motion` flattens everything to static.

## Run locally

```sh
bun install
bun run dev
```

Open the local Vite URL, usually `http://localhost:5173`.

The page renders from a bundled GitHub snapshot first, then refreshes live from
the GitHub API (`github.com/frgmt0`) in the browser.

## Commands

```sh
bun run dev      # development server (Vite, splash only)
bun run check    # TypeScript check (splash + worker)
bun run build    # production build
bun run preview  # preview production build
bun run deploy   # vite build + wrangler deploy
```

## Blog CMS

A self-hosted CMS lives in the same Worker, backed by the existing
`kona-blog-db` D1 database (the `posts` table the public blog already reads).
The splash site is untouched — only `/admin` and `/api/*` are routed to the
Worker (`run_worker_first`); everything else serves static assets.

- `/blog` — public, server-rendered index + posts (reads `published = 1`).
  Off-black/paper/red to match the splash; a generative ASCII flow field drifts
  in the masthead and stays out of the reading column. Works without JS.
- `/admin` — login + markdown editor (live preview, draft/publish, auto
  slug/excerpt, search, manage existing posts, mobile-friendly). Self-contained,
  no client framework or CDN.
- `/api/*` — JSON API (auth + posts CRUD).

The blog and admin share one markdown subset; the public side renders it
server-side (`worker/markdown.ts`, XSS-safe) for speed and SEO.

### Auth (rolled our own, hardened)

- Passwords: PBKDF2-SHA256, 100k iterations (the Workers WebCrypto ceiling),
  16-byte salt.
- Sessions: 32 random bytes in a `__Host-session` cookie (`HttpOnly`, `Secure`,
  `SameSite=Strict`); only the SHA-256 of the token is stored in D1.
- CSRF token required on every mutating request; constant-time comparisons.
- Per-IP login throttling (8 attempts / 15 min); uniform timing on bad users.
- Strict CSP + security headers on the admin app; `noindex`.

Tables (`admin_users`, `sessions`, `login_attempts`) are added by an additive
`IF NOT EXISTS` migration that never touches `posts`.

### Setup

```sh
bun run cms:migrate         # apply auth tables to remote D1 (one-time)
bun run cms:create-admin    # create/update the admin user (prompts)
bun run deploy              # build + deploy
# then visit https://frgmt.xyz/admin
```

Local development (uses a separate local D1 — seed it first):

```sh
bun run cms:migrate:local
node scripts/create-admin.mjs --local
bun run cms:dev             # wrangler dev on http://localhost:8787
```
