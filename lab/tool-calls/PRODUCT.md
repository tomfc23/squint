# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: a single static `index.html` with inline CSS and JS, self-hosted fonts in `fonts/`, no build step and no runtime dependencies. Reason: the artifact is opened locally to compare designs, not deployed as a product.

## Users

The pi coding-agent user (and future pi contributors) choosing how the `squint` TUI extension should render tool calls. They are mid-decision, not browsing: they open the page next to a running pi session and want to see each direction at full fidelity before committing one to code.

## Product Purpose

Compare candidate information designs for how a tool call appears in pi's terminal transcript — badge, gutter, trace rail, deck, ledger — across the full set of real tool-call cases. Success is one direction chosen with a reason, and the trade recorded.

## Positioning

It renders the transcript's actual vocabulary — hashline-anchored read output, unified diffs with real `+/-` counts, exit codes, tail-hidden shell output, nested subagent calls, streaming placeholders — instead of drawing approximate chips and lorem rows. Every candidate carries the identical transcript, so the comparison is about the design and nothing else.

## Operating Context

Opened by double-click in a local browser, on a dark terminal-adjacent desk setup, next to pi running the `squint` extension. Fair comparison requires the same content in every candidate and interaction faithful to the extension (a row expands to reveal its hidden lines).

## Capabilities and Constraints

- Five directions, each rendering the identical ~20-case transcript.
- Click / keyboard expands a collapsed row; a per-direction "expand all" control exists.
- Mocks are rendered DOM, never screenshots.
- Colors are taken from pi's bundled `dark` theme (`getResolvedThemeColors("dark")`) plus the `squint` badge palette; the terminal vocabulary mirrors `extensions/squint`.
- Constraint: no candidate may omit a case, and no case may be softened (the error rows stay errors, the huge read stays huge).

## Brand Commitments

pi's own palette and terminal idiom; the tone colors used by `squint` (`blue #4D9ABF`, `coral #F09082`, `gold #F1BE58`, `violet #9D7CD8`, `teal #56B6C2`, `green #98C379`, `gray #8A95A8`).

## Evidence on Hand

- Real theme tokens: `getResolvedThemeColors("dark")` (text `#dee0e1`, muted `#9da5a9`, diff added `#68b78d`, removed `#ea7f81`, pending bg `#34383a`, success bg `#254131`, error bg `#5b282a`).
- Real extension source: this repository one level up — `index.ts` (the pi adapter), `logic.ts` (classification), `directions.ts` (the layouts).
- **Absence to respect:** no screenshot of the extension in a live pi session was available, so every frame is a rendered mock and is labeled as one on the page. Assumed (not confirmed): the user runs pi's bundled `dark` theme in a truecolor terminal.

## Product Principles

1. Fidelity over decoration: a candidate that flatters the content lies about the design.
2. Same transcript, every candidate — differences must be design, never content.
3. Density is a decision, not a virtue; show its cost in each direction.
4. The frame stays honest: mocks are labeled mocks.

## Accessibility & Inclusion

Keyboard-operable expansion with `aria-expanded`, body contrast ≥ 4.5:1, visible focus rings themed to the palette, and `prefers-reduced-motion` honored (no caret blink, no reveal animation).
