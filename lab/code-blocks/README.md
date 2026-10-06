# code block lab

A static decision bench for how **pi's transcript should draw a fenced code block**.
Seven frames, one identical transcript, dark theme, 74 columns: open `index.html`.

- `index.html` — the bench (generated; open it directly, or serve the repository root if the
  browser refuses `file://` fonts: `python3 -m http.server` there, then `/lab/code-blocks/`)
- `render.mjs` — the generator. `node render.mjs` rebuilds `index.html`
- `PRODUCT.md` — what this is for and who it serves
- `DESIGN.md` — tokens, type, and the rules the page follows
- `test-markdown.md` — the sheet the styles were tested against; paste it into pi

Fonts come from `../fonts/` (the same two faces the repo's own bench uses, inlined here
because this page lives one level down). The verification captures are not committed; the
browser round that produced them is described in PRODUCT.md.

## The frames

| | Candidate | Idea | Chrome |
|---|---|---|---|
| 00 | What ships today | pi prints the fence lines themselves as the border | — |
| 01 | Spine | muted language label, one left rule per line (installed) | light |
| 02 | Card | rounded card, label in the top rail, all four edges ruled | heavy |
| 03 | Panel | full-width `toolPendingBg` ground, no glyphs | medium |
| 04 | Listing | dim line-number gutter and a stated line count | medium |
| 05 | Rule | one hairline header carrying the language, plain indented code | lightest |
| 06 | Chip | filled language badge on the first line, in pi's blue token | heavy |

Plus five detail dials (rule weight, label position, indent) for whichever structure
wins, and a trade-off table over borrowed-from / best-at / cost.

## Fidelity

`render.mjs` reads the pi release named by `~/.pi/agent/install/current-version`:
resolved chrome colors come from pi's own `getResolvedThemeColors("dark")`, every code
line from pi's own `highlightCode`, drawn at the transcript's real content width.
Nothing is a hand-picked hex or a picture of a terminal, so a theme change or a pi
update moves the page with it.

## After the choice

The winner ships as a style in **squint** (`~/.pi/agent/extensions/squint`), switched with
`/squint code <style>` and persisted in `squint.json`. `shim.ts` there patches the two copies
of pi's Markdown renderer (the bundle chunk the transcript uses, and `@earendil-works/pi-tui`
for extensions that render Markdown themselves), re-installs itself after every `pi update`,
and `codeblocks.test.ts` checks the transform against the real file. `off` keeps pi's fences.
