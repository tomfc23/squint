---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface: squint render candidates (index.html)

## Scope and mode

Single page, Operate. The visitor is choosing between five information designs for the same object: how one tool call renders in pi's terminal transcript.

## Audience, job, action

pi's user, mid-decision, with a live session on the other screen. Job: see each direction at full fidelity across every real case, then choose one. Action: expand a row, compare the error and long-output cases, pick a direction.

## Content, proof, constraints

Five directions (ledger, badge, gutter, deck, rail), each carrying the identical ~20-case transcript: thinking block, read (normal / huge / missing-file error / streaming), grep, find, ls, edit diff, write, shell (ok / long tail / non-zero exit), nested subagent, web search, todo, codemode, ask, MCP tool, goal. Proof: real pi theme hex values and the extension's real line formats (`39#BRBH:...` hashline anchors, unified diff, exit codes). Constraint: no direction omits a case; mocks are labeled mocks.

## Chosen direction and memorable moment

Stacked full-width terminal frames with a sticky left index. Memorable moment: clicking a collapsed row opens it the way `⌘E` does in the real extension, and the ledger's 4-line summary of a 400-line read snaps open into the actual output.

## Unresolved decisions

Which direction ships (the whole point of the page). Whether a sixth direction is wanted. Whether the page should later become a live A/B against the running extension.

## Direction contract

THESIS: A render lab, not a gallery — one transcript rendered five ways inside frames that read as real terminals, judgeable by touch. It refuses the equal-thumbnail card grid, because density and scannability over a long session cannot be judged from a thumbnail.

OWN-WORLD: Near-black control-room ground (#14161b) with #1c1f26 panels and hairline #2b3038 borders; a single violet accent (#a798d7) carries all page chrome, while the terminal frames carry pi's full tool palette. Rules, dots and 2px radii only — no gradients, glass, or shadows for decoration. Schibsted Grotesk is the page's voice; JetBrains Mono is every pixel inside a frame.

STORY: The visitor recognizes their own session's vocabulary (hashline read anchors, `+12 −3`, `exit 1`), believes the frames, and leaves with a direction named or a specific gap identified.

FIRST VIEWPORT: Wordmark squint at top-left, the claim "Five ways to render one pi session" beside it, and the exact-20 coverage strip; below that the first candidate frame (Badge, tagged incumbent) already open, its bar and the head of its transcript visible before any scroll, so the frame reads as a terminal in the first screen. Each frame then runs its full 20-case transcript instead of clipping to a fixed terminal height: seeing every case is the point of the page, so the composer and status bar are seen once per frame, lower down, and the sticky index carries navigation. Nothing in the frame is a screenshot.

FORM: code-led. Form pinned by the brief: option 2 of 3 ordered (1 = one long comparison table, 2 = stacked terminal frames with sticky index, 3 = side-by-side columns). Seed key: none — the brief pinned the form, so no roll ran.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
