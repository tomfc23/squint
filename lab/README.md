# squint Render Lab

Two static design benches for how the `squint` pi extension draws a transcript, and the record
of the explorations that chose them. Open either `index.html` in a browser. No build step, no
dependencies; fonts are the two self-hosted faces in `fonts/`.

## Tool calls — `tool-calls/index.html`

Five information designs for one tool call, side by side over the same ~20-case transcript.

- `tool-calls/PRODUCT.md` — what this is for and who it serves
- `tool-calls/DESIGN.md` — the design tokens and typography
- `tool-calls/index.html` — the five candidate directions

## Code blocks — `code-blocks/index.html`

Seven ways to draw one fenced code block (pi's own fences, and six replacements), over the
same three-block transcript. The six shipped as squint's code block styles, switched with
`/squint code`; the bench is where the trade-offs were compared.

- `code-blocks/PRODUCT.md`, `code-blocks/DESIGN.md` — what it is for, and the rules it follows
- `code-blocks/index.html` — the candidates, the detail dials, and the trade-off table
- `code-blocks/render.mjs` — regenerates the page from the live pi theme (`node render.mjs`)
- `code-blocks/test-markdown.md` — the sheet the styles are tested against, for pasting into pi

Both benches are superseded by the shipped extension in the repository this directory lives in;
they are kept as the design record, and the code block page still regenerates itself from
whatever pi theme is installed.

- `tool-calls/.impeccable/` — the design state for the tool call bench: its surface brief and the
  review captures. It sits beside the page it describes, so run impeccable from
  `lab/tool-calls/` and the recorded palette resolves.
- `../` — the extension itself: the directions, the code block styles, the shim that puts them
  in pi's renderer, the menu, and their tests.
