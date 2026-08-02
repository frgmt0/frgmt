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

## Blog + admin

`/blog` lists posts from the `kona-blog-db` D1 database (newest first, the
latest one set large). `/admin` is the desk: sign in against `admin_users`
(PBKDF2), a 30-day session cookie keeps you signed in per device, and the
editor writes markdown with a live preview. All API traffic is `/api/*` in
`worker/index.ts`; mutations need the session cookie plus the per-session
`x-csrf` header, and logins are rate-limited per IP via `login_attempts`.

For local API work, run both:

```sh
bun run dev       # vite, proxies /api to :8787
bun run dev:api   # wrangler dev on :8787, local D1
```

The local database is seeded with a throwaway admin (`admin` / `testpass`)
and three sample posts. Production data is never touched by local dev.

## Commands

```sh
bun run dev      # development server
bun run check    # TypeScript check
bun run build    # production build
bun run preview  # preview production build
npx wrangler deploy  # ship site + API to frgmt.xyz
```
