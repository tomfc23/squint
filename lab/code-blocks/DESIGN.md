---
name: code block lab
description: A dark bench for choosing how pi's transcript draws one fenced code block.
colors:
  ground: "#14161b"
  panel: "#1b1e25"
  term: "#191c22"
  hairline: "#2b3038"
  hairline-strong: "#3a414b"
  text: "#dee0e1"
  muted: "#9da5a9"
  dim: "#7e888e"
  accent: "#a798d7"
  code-violet: "#a798d7"
  code-green: "#68b78d"
  syntax-blue: "#69add0"
  syntax-yellow: "#cd9a22"
  syntax-orange: "#de8d5a"
  tool-panel: "#34383a"
  chip-blue: "#69add0"
  chip-ink: "#181a20"
  gold-border: "#5b4c2f"
typography:
  wordmark:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(38px, 6.6vw, 68px)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "-0.045em"
  card-title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(20px, 3.4vw, 26px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  section-title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  claim:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    lineHeight: 1.45
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  secondary:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.12em"
  terminal:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    lineHeight: 1.55
  terminal-narrow:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    lineHeight: 1.55
spacing:
  rail: "1020px"
  gutter: "26px"
  card-gap: "34px"
  band-gap: "44px"
radius:
  r: "2px"
---

# code block lab — design record

The bench inherits the world of `../tool-calls/`: a dark terminal-adjacent instrument,
pi's own palette, one artifact page that compares candidates of a transcript rendering
decision. Nothing here is a new identity; it is that world applied to code blocks.

## What carries the design

- **The frame is the specimen.** A candidate is not described, it is drawn: `bar` (panel
  ground, hairline border, label left), then `term` (terminal ground, JetBrains Mono at
  13px, the rendered lines verbatim, no wrapping, horizontal scroll when narrow). A
  candidate the reader cannot compare at a glance is a failed frame.
- **The chrome never competes with the specimen.** Page labels are 11px, tracked, `dim`; the frame bar is
  sentence case at 11.5px in `muted`, so no uppercase band competes with the specimen. The coloured thing on the
  page is always the code itself, in pi's syntax colors, exactly as the transcript would
  paint it.
- **The numbers are the interface.** Candidates are 00–06 and the reader answers with a
  number, so the sequence carries information; the numbered label is the answer key, which
  is the exception the craft floor allows and the detector is left to flag.
- **`shipping today` is stated, not implied.** The two stock candidates wear a gold-bordered
  tag in the frame bar; no frame is dimmed or styled to look worse than it is.
- **One band, one job.** Brief (the three binding constraints) → frames → dials → table →
  ask. Bands are separated by a single hairline, never by a card inside a card.

## Type and color rules

Sizes step 68 → 26 → 20 → 17 → 15 → 14 → 13 (mono) → 12 (mono numerals, stamp, narrow terminal) → 11. Nothing functional is under
11px. Body and secondary text are `muted` (7.2:1 on ground) or `text` (14.6:1); `dim` is
reserved for labels ≥ 11px at 5.0:1 and never for prose. Frame chrome inside the terminal
lines uses pi's own resolved tokens, so the specimen's colors are pi's, not the page's.

## Constraints the page admits

- A transcript code block is lines of styled text at a known width, with
  `highlightCode(code, lang)` and an optional language. No hover, no copy button, no
  collapse exists to design with.
- 74 columns do not fit a phone; frames scroll sideways below 760px and the brief says so.
- The page renders the dark theme only, and says so in the stamp.

## Accessibility

Skip link, one `h1`, frames marked `role="img"` with the candidate name in the label,
visible focus rings in `accent`, `::selection` themed, scrollbars themed, contrast and
minimum type size verified in the browser (see PRODUCT.md), and `prefers-reduced-motion`
honored (the page ships no motion to begin with).
