---
name: squint Render Lab
description: A dark bench for comparing five information designs of one pi terminal transcript.
colors:
  tool-violet: "#a798d7"
  lab-black: "#14161b"
  panel-graphite: "#1b1e25"
  frame-graphite: "#191c22"
  bar-graphite: "#171a20"
  nested-graphite: "#161a20"
  hover-graphite: "#1f232b"
  hairline: "#2b3038"
  hairline-strong: "#3a414b"
  instrument-white: "#dee0e1"
  readout-grey: "#9da5a9"
  dim-readout: "#7e888e"
  chip-ink: "#181a20"
  gold-border: "#5b4c2f"
  prompt-band: "#213b49"
  pending-band: "#34383a"
  tool-blue: "#4D9ABF"
  tool-coral: "#F09082"
  tool-gold: "#F1BE58"
  tool-teal: "#56B6C2"
  tool-green: "#98C379"
  tool-grey: "#8A95A8"
  added-green: "#68b78d"
  removed-red: "#ea7f81"
  added-band: "#254131"
  error-band: "#5b282a"
typography:
  wordmark:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 7vw, 74px)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline-small:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "0.12em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.62
    letterSpacing: "normal"
  mono-small:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  hairline: "1px"
  chip: "1px"
  row: "2px"
  frame: "3px"
spacing:
  inline: "9px"
  block: "22px"
  frame: "13px"
  section: "64px"
  mast: "44px"
components:
  frame:
    backgroundColor: "{colors.frame-graphite}"
    rounded: "{rounded.frame}"
    padding: "{spacing.frame}"
  frame-bar:
    backgroundColor: "{colors.panel-graphite}"
    textColor: "{colors.dim-readout}"
    typography: "{typography.label}"
    padding: "8px 13px"
  chip-tool:
    textColor: "{colors.chip-ink}"
    rounded: "{rounded.chip}"
    typography: "{typography.mono}"
    padding: "0px 5px"
  ledger-row:
    textColor: "{colors.instrument-white}"
    typography: "{typography.mono}"
    rounded: "{rounded.row}"
    padding: "0px 6px"
  gutter-row:
    textColor: "{colors.instrument-white}"
    typography: "{typography.mono}"
  deck-panel:
    backgroundColor: "{colors.panel-graphite}"
    textColor: "{colors.instrument-white}"
    rounded: "{rounded.row}"
    padding: "7px 11px"
  rail-node:
    backgroundColor: "{colors.frame-graphite}"
    size: "11px"
  diff-band:
    textColor: "{colors.added-green}"
    typography: "{typography.mono}"
    padding: "0px 13px 0px 1ch"
---

# Design System: squint Render Lab

## Overview

**Creative North Star: "The Render Lab"**

A dark bench where one specimen — a single pi transcript — is examined under five different instruments. The page is not the product and never pretends to be: it is chrome, rules, and labels, and every colour with a point of view lives inside a frame, in the mock terminal itself.

The system is built on two registers that never mix. Outside a frame: near-black ground, hairline rules, one violet accent, and a grotesk voice that carries the argument in prose. Inside a frame: pi's real theme tokens, a monospace face, filled tinted bands, and the tool palette. A page element that borrows a tool colour is a bug, not a highlight — the frame is where colour earns its meaning.

Density is the subject, so the system refuses decoration that would tilt the comparison: no gradients, no glass, no shadow, no radius above 3px, no glyph standing in for a line of text. What is left is alignment, contrast, and the honesty of a mock labelled as a mock.

**Key Characteristics:**
- One violet accent owns all page chrome; the tool palette exists only inside frames.
- Hairline borders and 2px radii; depth comes from tonal steps, never shadows.
- Monospace is material, not costume: it appears only where a terminal is being shown.
- Every direction renders the identical 20-case transcript, so differences are design, never content.
- A collapsed row always states its hidden count; a row with nothing to open carries no affordance.

## Colors

A restrained lab palette: five steps of graphite for structure, three greys for readouts, one violet that means "this is the page, not the terminal" — and a full tool palette that is only ever painted inside a frame.

### Primary
- **Tool Violet** (#a798d7 / oklch(71.6% 0.092 294.9)): the single accent. Active index link, the composer prompt, the local focus ring, the "Ships today" tag, the filled density pips, and the skip link. Its rarity is the point: if it appears more than a few times per screen, one of those appearances is wrong.

### Tertiary
- **Read Blue** (#4D9ABF): read, grep, find and ls rows inside a frame.
- **Write Coral** (#F09082): edit and write rows. The loudest tone, deliberately on the rarest and most consequential tool.
- **Shell Gold** (#F1BE58): shell rows.
- **Agent Violet** (#9D7CD8): subagent and question rows — kin to the page accent, which is why it is never used on the page.
- **Web Teal** (#56B6C2): web search and fetch rows, and the Deck direction's own identity.
- **Plan Green** (#98C379): todo and codemode rows.
- **Fallback Grey** (#8A95A8): classified-but-unknown tools and MCP tools.
- **Added Green** (#68b78d) / **Added Band** (#254131): added diff lines and the band behind them.
- **Removed Red** (#ea7f81) / **Error Band** (#5b282a): removed diff lines, error output, and failed rows.

### Neutral
- **Laboratory Black** (#14161b): the page ground.
- **Panel Graphite** (#1b1e25): frame bars and boxed panels — a tonal step, not a shadow.
- **Frame Graphite** (#191c22): the terminal body, and the fill behind a rail node.
- **Bar Graphite** (#171a20): composer and status bar, one step darker than the transcript.
- **Nested Graphite** (#161a20): a nested terminal inside a parent frame.
- **Hover Graphite** (#1f232b): hover and open state for ledger rows.
- **Hairline** (#2b3038): every structural border, rule and spine.
- **Hairline Strong** (#3a414b): the focused frame border and the composer outline.
- **Instrument White** (#dee0e1): primary readout text and row summaries.
- **Readout Grey** (#9da5a9): preview lines, thesis copy, secondary readouts.
- **Dim Readout** (#7e888e): hints, times, counts, frame-bar labels.
- **Gold Border** (#5b4c2f): the 1px border on the theme stamp, the only warm value outside a frame — it marks a stamp that is about the frames' own palette.
- **Chip Ink** (#181a20): the text sitting on a filled chip — never white, so the chip reads as printed rather than lit.
- **Prompt Band** (#213b49): the user's message band.
- **Pending Band** (#34383a): unchanged context lines in a diff.

### Named Rules
**The One Accent Rule.** Page chrome carries violet and nothing else. Read blue, write coral, shell gold, and the diff pair are reserved for the inside of a frame; using one on the page is a leak, not a highlight.

**The Printed Chip Rule.** A filled chip's text is Chip Ink (#181a20), never white. A chip is a printed label at reading size, not a glowing badge.

## Typography

**Display Font:** Schibsted Grotesk (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Schibsted Grotesk (same stack)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo, monospace)

**Character:** A tight, low-contrast grotesk does the arguing, and a neutral coding mono does the showing. The split is the system: anything set in mono is evidence from a terminal, and anything set in the grotesk is the page talking about that evidence.

### Hierarchy
- **Wordmark** (800, clamp(40px,7vw,74px), 0.86, -0.045em): one instance, lowercase, the product name at the top of the masthead. Its mid-word accent letter is the only typographic flourish in the system.
- **Headline** (700, 30px, 1.05, -0.03em): one per candidate section, carrying the two-digit index in dim mono beside it.
- **Headline Small** (700, 24px, 1.05, -0.03em): the same heading at 700px and below.
- **Body** (400, 15px, 1.6): thesis paragraphs, spec values, page footer. Measures 58–74ch.
- **Label** (600, 11px, 0.12em, uppercase): spec keys, coverage heading, stamps. Never longer than a couple of words.
- **Mono** (400, 12.5px, 1.62): every pixel inside a frame — row summaries, previews, diffs, the composer, the status bar.
- **Mono Small** (400, 11.5px, 1.6): hints, times, counts, and diff statistics, so a row's metadata reads as annotation rather than content.

### Named Rules
**The Label Floor Rule.** Uppercase tracked micro-labels are 11px minimum and never run past a couple of words; anything longer is set in sentence case at body size.

**The Costume Rule.** Monospace appears only where a terminal is being shown. Using it for page chrome or a technical-sounding heading is costume.

## Layout

One page, one column of five frames, with a sticky index rail of 214px on the left and a 44px gap between them; below 1000px the index turns into a horizontal strip of links above the column.

Inside a frame the layout is a terminal's, not a document's: 13px of horizontal padding on the transcript, rows of 12.5px mono at 1.62 line-height, and preview lines indented to the width of their own label column (badge) or to a fixed cell (gutter). Frames are capped at 1040px and are never rounded past 3px or given a shadow.

Rhythm: 64px between candidate sections, 30px of top padding inside one, 22px between the spec strip and the frame, 13px inside the frame. Candidate sections breathe; rows inside a frame do not — density is the thing being compared, so the transcript stays tight.

Responsive: at 1000px the index collapses to a wrapping row of links and the rail stops sticking; at 700px type drops to 11px inside frames, the gutter's right meta moves under its target, and the frame loses its (already invisible) shadow. No breakpoint removes a row, a count, or an error.

## Elevation & Depth

No shadows. The system is flat and conveys depth entirely through tonal steps — black ground, then frame graphite, then panel graphite, then bar graphite, then nested graphite — separated by 1px hairlines. A frame with a drop shadow would read as a web card, which is exactly what the page must not do while claiming to show a terminal.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at every state. Depth is a tonal step plus a 1px hairline, never a shadow or a blur.

## Shapes

Form language is rectilinear and thin: 1px hairlines, 1px radius on chips and diff bands, 2px on rows and panels, 3px on a frame — and nothing rounder. Dots are circles (a 7px status mark, an 11px rail node with a 5px core); every other silhouette is a rectangle or a rule. The one recurring geometry that reads as "designed rather than defaulted" is the trace spine: one continuous 1px vertical line with a node per call, truncated at the last row so it ends rather than fades.

## Components

### Terminal Frame
- **Shape:** flat graphite body, 1px hairline border, 3px radius, capped at 1040px.
- **Anatomy:** frame bar (identity left, "mock · dark · 132×44" right), transcript, composer, status bar.
- **Rule:** every frame carries the word "mock" in its bar. A frame that could be mistaken for a screenshot is a lie about evidence.

### Filled Chip
- **Style:** tone background, Chip Ink text, 1px radius, one space of padding either side, bold 12px mono.
- **Role:** the tool category, never the state. Adding a state colour to a chip doubles its meaning and loses the category.

### Transcript Row
- **Shape:** a full-width button header; the preview slice is always visible except in Ledger, where the row is the whole design.
- **States:** collapsed, open (`.more` reveals from 0fr to 1fr over 300ms), error, pending.
- **Focus:** a 2px violet ring with 3px offset; the ring is the page's accent because focus belongs to the page, not the tool.
- **Collapsed content:** hidden lines are clipped with `visibility:hidden`, so they are absent from the accessibility tree rather than merely invisible.

### Ledger Row
- **Columns:** mark (2.4ch), label (7ch), target (fluid), count (7ch, right), time (6ch, right), chevron (1.4ch).
- **States:** hover and open both paint Hover Graphite; the chevron rotates 90° when open.
- **Rule:** it shows nothing but the row until opened — that absence is the design, not a missing state.

### Gutter Row
- **Columns:** label cell (8ch), target (fluid), meta (right).
- **Preview:** hangs off a 1px rule at `calc(8ch + 10px)`, exactly under the target column; the rule is tinted 30% of the row's tone.
- **Rule:** the rule must align to the target column at every breakpoint; a rule that misses it breaks the only thing this direction claims.

### Deck Panel
- **Shape:** 1px hairline panel, 2px radius, header strip with a bottom hairline.
- **Error state:** border `#6d3134`, header band Error Band.
- **Nesting:** a nested call is a panel inside its parent, with a hairline border and no fill, indented 22px, so parent and child never read as the same object.

### Rail Node
- **Shape:** 11px circle with a 1px tone border and a 5px tone core, centred on a 1px continuous spine at 5.5px.
- **States:** filled core = done, hollow core = pending, red border and core = error.
- **Nesting:** children indent 2.2ch with a 1.4ch elbow off the spine.

### Diff Band
- **Shape:** a full-bleed band from the row's indent column to the frame's edge — the only tinted background in the system outside a nested box.
- **Colors:** added on Added Band with Added Green text, removed on Error Band with Removed Red text, context on Pending Band with Readout Grey text.
- **Collapsed state:** context lines are hidden and the row states how many; opening reveals them in place.

## Do's and Don'ts

### Do:
- **Do** keep every colour decision inside a frame tied to a tool category or a diff role.
- **Do** keep a hidden-count hint on every row that has hidden content, and drop it from rows that have none.
- **Do** express depth with the tonal steps already in the ramp — black, panel, frame, bar, nested, hover — before reaching for anything else.
- **Do** label every frame a mock, in its bar and in the page footer.
- **Do** keep the collapsed edit rule the extension's: changed lines only, context on open.

### Don't:
- **Don't** paint page chrome with a tool tone, or a frame with the page accent.
- **Don't** add a gradient, blur, or shadow to a frame that is being compared against a real terminal.
- **Don't** round a frame or chip past 3px, or draw a border-left thicker than 1px on a row.
- **Don't** let a direction omit a case, soften an error, or trim the 400-line read.
- **Don't** let a rule, spine, or column drift out of alignment with the column it serves — alignment is the only ornament this system has.
