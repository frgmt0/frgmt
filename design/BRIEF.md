# frgmt.xyz

**Route** 03 Vitrine. Museum wall labels: warm paper `#FAFAF7`, ink `#17171B`, one 408px
column parked off-centre, right half of the page reserved. Everything 13px except one line.
Inter at a single weight. No colour anywhere.

**What it is** A personal home base. Who he is, what he is building now, where to find him.
Not the old site's live index of all sixty repos.

**Audience** People who might hire him, or decide he is worth a conversation. That sets the
voice: plain, factual, no persuasion, no jargon that a non-engineer would trip on. It also
means the experience section and the credential lines carry real weight, and the right column
stays calm rather than clever.

**The line** All three tools sit between a person and a model and keep the model in its place.
typer keeps it on your Mac, jingle keeps it away from your secrets, beckett keeps a fleet of
them behind one door.

## Must have

- Name, founder of Kowo (kowo.frgmt.xyz), Claude Ambassador for Students and Educators
- Three projects: typer (Swift, MIT, alpha, typr.frgmt.xyz), beckett (TypeScript, MIT),
  jingle (Rust, Apache 2.0)
- Experience: 2022 to 2023 Student Intern, CNUSD IT Department, under Myles Allen.
  2026 Founder, Kowo, stealth.
- Links: github.com/frgmt0, kcodes.me
- 390 / 768 / 1440, WCAG AA body text, visible focus, reduced motion honoured
- Footer: copyright line only. Personal site, no analytics, so nothing else is required.

## Nice to have

One only, done properly: **the right column asset sequence.** Generated stills and slow clips
of cast-plaster objects, each an abstraction of the barrier that tool enforces. A folded
concertina screen for typer, a slab in front of a receding row for beckett, a block with four
slots cut through it for jingle. One identical light across the set: soft overcast from the
upper left, no hard shadow.

Validated: OpenRouter serves 20 video models on `POST /api/v1/videos`. `bytedance/seedance-2.0`
does 4 to 15s per clip with `first_frame` and `last_frame` control, so long sequences are
storyboarded by chaining clips, and pointing the last clip's closing frame at the opening still
closes the loop. Tooling is `design/tools/orv.py`. The skill's own `gen.py` routes video to Fal
only and cannot do this.

Risk to watch: Vitrine works *because* the right side is empty. The asset has to stay quiet and
near-monochrome or it becomes a different, worse route. Reference for doing it well:
davidwhyte.com in the skill library, a 400px left column against a right void of slow paint.

Two more moves came out of the build, both from the layout rather than added to it:

**The floor plan.** The left gutter exists because Vitrine parks the text off-centre, but on a
page this tall an empty column that never says where you are is only margin. It now holds a
sticky index: Now, Work with the three objects under it, Experience, Elsewhere. Same 13px, dim
until you are standing in that room. Hidden below 900px, where the scroll is short enough that
repeating the section names would be navigation for its own sake.

**The wash.** An ASCII truchet field behind the whole site, blue-gray with the objects' bone at
the peaks, drifting on a slow fbm. Same idea as the grain gradient shader on 21st.dev, written
as characters on a 2D canvas: no dependency, no WebGL, and full control of the palette. Every
value in it is lighter than the hairlines already on the page, so readability is a property of
the colours rather than of an opacity someone can nudge later. Frozen under reduced motion,
paused when the tab is hidden.

## Deliberately out

- **Myles Allen's email.** A real person's work address, published on a public page, gets
  scraped. The role and the supervisor's name carry the reference without it.
- **The live GitHub repo index.** The old site's move. A curated three beats sixty for this
  audience. One link to the archive is enough.
- No em-dashes, no eyebrow labels, no pills, no cards, no quirky footer.

## Open

- **Clips or stills in the right column.** Three light clips are generated: 8s, 1280x720, 24fps,
  2.2 to 3.8MB each, $1.21 a clip. Dark versions would double both. Stills are shipping now at
  7 to 18KB. The clips are good, but nine megabytes of video is a different page from the one
  the route describes.
