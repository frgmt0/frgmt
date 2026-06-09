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
bun run dev      # development server
bun run check    # TypeScript check
bun run build    # production build
bun run preview  # preview production build
```
