# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: one static `index.html` plus `render.mjs`, the Node script that generates it. No dependencies, no framework, no runtime: the script reads the live pi release (`install/current-version`) for resolved theme colors and `highlightCode`, writes the page, and is never needed to view it. Fonts are the repo's self-hosted `.woff2` faces in `../fonts/`, inlined the way the repo's own bench inlines them.

## Users

Thomas, the pi user who hit the problem: in a real pi session the transcript's code blocks read as text with backticks around them, and he wants to choose how they should look instead. He is mid-decision, next to a running pi session, comparing frames rather than reading a document. Secondary: whoever later implements the chosen direction in pi's renderer.

## Product Purpose

Decide how pi's transcript draws a fenced code block. Success is one candidate picked with a reason, and the trade recorded, so the winner can be ported into the renderer patch.

## Positioning

Every frame is drawn from pi's own truth: resolved dark-theme tokens for chrome, pi's `highlightCode` for the code, pi's and squint's own glyphs, at the transcript's real 74 columns, carrying one identical three-block sample. Neighbouring mockups draw an approximation of a terminal; this one draws what the renderer would actually emit, so a frame that looks bad here would look bad in the session.

## Operating Context

Opened in a local browser (a static server if the browser refuses `file://` fonts), dark terminal-adjacent desk setup, next to a live pi session running the patched renderer for candidate 01. After the choice, the direction lands as a style in `~/.pi/agent/extensions/squint` (`/squint code <style>`); this page regenerates from the same theme squint reads.

## Capabilities and Constraints

- 7 frames: 00 what ships today (fences), then candidates 01–06, each rendering the same transcript of three code blocks (`ts` with a long line and a comment, `diff`, and a language-less JSON blob) interleaved with prose and inline code.
- 5 detail dials for the chosen structure: rule weight, label position, indent.
- A trade-off table (borrowed / best at / cost) and a stated ask.
- **Renderer constraints, taken as binding:** a code block is lines of styled text at a known width; `highlightCode(code, lang)` is available; the language is optional; there is no per-block interaction in the transcript, so no candidate may need a copy button, hover, or collapse.
- Mocks are rendered DOM, never screenshots; the whole page regenerates from pi's theme, so a theme change moves it.

## Evidence on Hand

- Real resolved tokens from pi 1.0.4 dark (`getResolvedThemeColors`): chrome muted `#9da5a9`, code fallback green, `mdCode` `#a798d7`, tool panel `#34383a`, link blue `#69add0`, dim `#7e888e`.
- Real `highlightCode` output for `ts`, `diff`, and a language-less block.
- The shipping home for these styles: `~/.pi/agent/extensions/squint` (`codeblocks.ts` styles, `shim.ts` renderer patch, `/squint code` toggle). Candidate 01 is the default there.
- Precedent and world: `../tool-calls/` (the same bench idiom, five directions, real theme tokens, mock-labeled frames), which this repo also holds.
- Competitor evidence, read from the installed binaries rather than remembered: Claude Code's bundle renders a code token as an optional dim language line plus highlighted code with no fence glyphs, and defines rounded, square and double box glyph sets for its cards. No screenshot of a live competitor session was available, so nothing here claims to be a capture of one; the borrowed-from lines name families, not pixels.
- Absence to respect: pi's own light theme and non-truecolor terminals are not rendered here; the page states it is the dark theme.

## Product Principles

1. Fidelity over decoration: a frame that flatters a candidate lies about it.
2. Same transcript in every frame, so the difference is the design and nothing else.
3. The transcript's real limits decide: never invent an affordance pi's renderer cannot draw.
4. The frame stays honest: every strip is labeled, and what is a re-creation says so.

## Accessibility & Inclusion

Verified in the browser, not by eye: body and secondary text ≥ 4.5:1 against their own ground, no functional text under 11px, visible focus rings, a skip link, `prefers-reduced-motion` honored. Frames scroll sideways below 760px by design (74 columns do not fit a phone) and the page says so rather than shrinking type to a fiction.
