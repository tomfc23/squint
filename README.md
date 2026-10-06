# squint

Compact transcript rendering for [pi](https://pi.dev): five interchangeable directions for tool
calls, and styles for fenced code blocks.

Every tool call becomes one row — a header plus a short preview, with the full output on click or the
configured shortcut (`⌘E` by default). The *direction* decides how that row is drawn. Five ship, plus
`off` to hand tool calls back to pi and `custom` to describe your own; switch any time with `/squint`,
and the choice is remembered.

```
● READ    extensions/squint/directions.ts                          42 lines · 0.3s     ← rail (default)
│ 190#XXMT:export function previewLines(list: string[], limit: number): Preview {
│ ⌘E to expand
```

## The five directions

| | Direction | The idea | Best at | Cost |
|---|---|---|---|---|
| `rail` | **Rail** *(default)* | a trace spine; nested work hangs off its parent | agent-heavy sessions, causality | a column on every row |
| `ledger` | **Ledger** | one aligned line per call; output only on open | long sessions, finding the call that mattered | you can't judge a read without clicking |
| `badge` | **Badge** | the filled chip, as shipped before | mixed sessions where you read the output | the chip is loud at forty calls |
| `gutter` | **Gutter** | a typographic column of labels instead of a chip | scanning by tool and by path | state has to be said in words |
| `deck` | **Deck** | each call boxed; nesting visible inside | understanding one call at a time | sixty calls is a very tall stack |

Samples, same call in each:

```
▫ READ      extensions/squint/directions.ts                       42 lines    0.3s ▸   ← ledger

 READ  extensions/squint/directions.ts                                                 ← badge
       39#BRBH:const COLLAPSED: Record<Kind, number> = {
       +34 more · click to expand

READ     extensions/squint/directions.ts                           42 lines            ← gutter
         │ 190#XXMT:export function previewLines(

╭─● READ       extensions/squint/directions.ts ──────────────── 42 lines · 0.3s ─╮     ← deck
│ 39#BRBH:const COLLAPSED: Record<Kind, number> = {                              │
│ ⌘E to expand                                                                   │
╰────────────────────────────────────────────────────────────────────────────────╯
```

Nested calls — a `codemode` script or `subagent` running other tools — have no transcript row of
their own in pi. squint collects them from `tool_execution_*` events and draws them inside the row
that made them, which is what rail's spine is for:

```
● AGENT   review-team · correctness                                 3 tools · 12.4s
│ done
│ ├─● GREP    /previewLines/ · extensions
│ │ index.ts:171:  const { shown, hidden } = previewLines(toLines(body), errorLimit);
│ ├─● READ    logic.ts
│ │ 190#XXMT:export function previewLines(list: string[], limit: number): Preview {
│ └─● WEB     pi tui box drawing
│   1  Box Drawing — Wikipedia
│ click to expand
```

## Install

As a pi package, from this repo:

```bash
pi install git:github.com/tomfc23/squint
```

Or drop the directory into pi's extensions folder, where it is discovered automatically:

```bash
git clone https://github.com/tomfc23/squint ~/.pi/agent/extensions/squint
```

Either way, `/reload` in a running session picks it up.

## Use

```
/squint              one menu: choose tool calls or code blocks, then the mode
/squint tui          go straight to the tool call picker (rail, ledger, badge, gutter, deck, off, custom)
/squint ledger       set a tool call direction directly
/squint code         go straight to the code block picker (spine, card, panel, listing, rule, chip, off)
/squint card         set a code block style directly
/squint off          hand tool calls back to pi ("/squint code off" does it for code blocks)
/squint custom       describe a direction; pi builds it with a local preview first
/squint key ctrl+o   set the expand/collapse shortcut (saved, then reloaded)
```

squint draws two things, so `/squint` asks which one first:

```
  ❯ Tool calls — rail
    Code blocks — spine
```

Each entry states what that family draws now. Pick one and its own picker opens, current choice marked.
A bare name still works (`/squint card`), and `off` keeps meaning tool calls, as it always has.

The picker lists every mode with the current one marked and closes after one choice, so the transcript
is visible behind it. The choice is saved to `<agent-dir>/squint.json` — `~/.pi/agent/` by default, or
`$PI_CODING_AGENT_DIR` when set, alongside the shortcut:

```json
{ "direction": "rail", "key": "super+e", "codeBlock": "spine" }
```

With no settings file, the direction is `rail`, the shortcut is `⌘E`, and code blocks are `spine`.

Keys and gestures:

- **click any row** to expand or collapse it
- **`⌘E`** expands the newest row; rebind it with `/squint key <binding>` (e.g. `ctrl+o`,
  `ctrl+shift+x`). The built-in `app.tools.expand` binding is released for this — add
  `"app.tools.expand": []` to `keybindings.json` if you have it bound elsewhere
- thinking blocks are relabelled `THINK · click to expand` and start collapsed

Behaviour worth knowing:

- a collapsed row states what it is hiding (`+34 more`, `… 206 earlier lines`), and a row with
  nothing behind it offers no affordance at all
- a collapsed **edit** shows the changed lines; opening brings in the context lines
- a collapsed **shell** row shows the *tail* of the output, because that is where the answer
  usually is; opening shows it from the top
- output past 400 lines keeps a count of what is still withheld, even when open

## Code blocks

Tool calls are not the only thing in a transcript that has to be drawn. pi's Markdown renderer wraps
every fenced block in the ``` fences it parsed, so code arrives wearing its own markup, and no
extension API can change that: `registerMarkdownTransformer` rewrites markdown *text*, and every
fence is parsed straight back into a code token. squint therefore patches the renderer once and
keeps the patch direction-agnostic — pi asks a global, squint answers:

```
  spine    a muted language label, one left rule per line              (default)
  card     a closed card with the label in its top rail
  panel    a full-width ground, no glyphs spent on chrome
  listing  a line-number gutter and a stated line count
  rule     one hairline header carrying the language
  chip     a filled language badge on the first line
  off      pi's own fences, exactly as they ship
```

Syntax highlighting is untouched: the code comes from the markdown theme's own `highlightCode`, so a
theme change moves the blocks with it. `/squint code` writes the choice to `squint.json` and reloads.

Two things the styles do beyond drawing, both because pasting is how code arrives:

- **A block that is itself one fenced block is unwrapped once**, so a snippet copied out of a chat
  message does not render as a code block whose first and last lines are backticks. The inner
  language becomes the label and the one that gets highlighted.
- **A pasted *document* that was fenced is unwrapped before pi parses it** (`registerMarkdownTransformer`,
  user messages only, and only for a fence of 4+ backticks that really does contain a fence). That is
  what makes a pasted sheet render as its own headings and code blocks instead of as one giant card
  full of fence markers. Assistant markdown is never touched: quoting a fence has to stay possible.
- the boundary-claiming styles (**card**, **panel**, and **listing**'s gutter) wrap long lines
  themselves with pi-tui's `wrapTextWithAnsi`, so a line that does not fit grows the block instead of
  tearing a hole in the right rail

Two things are worth knowing about the patch:

- it lives inside the pi release (`dist/bundle/chunks/*.js` for the transcript, `@earendil-works/pi-tui`
  for extensions that render Markdown themselves), so **a pi update ships the stock renderer again** —
  squint re-installs it on every session start and says so, and the next restart shows the styles
- the **first** install cannot affect the process that installed it, because the module is already
  loaded: `/squint code` says to restart instead of pretending the switch worked. Afterwards it is a
  live toggle like the directions, since the style is read per block

The styles were chosen in a bench of seven rendered candidates: `../code-block-lab/` under the
projects directory, which regenerates every frame from pi's own theme and `highlightCode`.

## Adding a direction

A direction is a pure layout plus one line of registration. `/squint custom` walks pi through this for
you — it collects your instructions, shows a locally served HTML simulation (modeled on the
squint-tui preview page) to confirm, implements the direction, runs the tests, deletes the
simulation, and reports the optimization it made.

1. Add the id to `Direction` and `DIRECTIONS` in `directions.ts`. The first entry is the default.
2. Write its renderer in that file: `(row: Row, cols: number, open: boolean, opts) => Seg[][]`.
   The **first line is the head**; everything after it is the body. `index.ts` slices on that, which
   is how one layout feeds both the call and the result component.
3. Add it to the `switch` in `layout()`, and add a `collapsedLimit` case if it wants its own
   collapsed slice (`ledger` returns `0`: showing nothing is that direction's whole idea).
4. `node directions.test.ts` — the shared checks run every direction at every width in both states,
   so a new one is covered as soon as it is in `DIRECTIONS`.

## Architecture

Three files, and the split is the point:

| File | Holds | Imports |
|---|---|---|
| `logic.ts` | classification, argument summaries, preview slicing | none |
| `directions.ts` | `buildRow` (raw tool call → `Row`), `layout` (`Row` → styled segments), cell arithmetic | `logic.ts` |
| `codeblocks.ts` | the code-block styles: `(style, code, lang, width, theme)` → styled lines | none at runtime |
| `shim.ts` | installing/verifying the patch in pi's renderer | none at runtime |
| `index.ts` | the pi adapter: settings, events, `/squint`, the code-block hook, one component, the per-row cache | all of it + pi |
| `directions.ts` | `buildRow` (raw tool call → `Row`), `layout` (`Row` → styled segments), cell arithmetic | `logic.ts` |
| `index.ts` | the pi adapter: settings, events, `/squint`, one component, the per-row cache | both + pi |

`index.ts` is the only file that knows pi exists, so everything that decides *what is displayed* is
testable with plain node.

Four invariants hold it together:

- **One segment is one physical line.** Tool arguments and output are untrusted: a shell command can
  be a multi-line heredoc. Newlines, tabs and carriage returns are flattened at the `layout`
  boundary, once, because a raw newline inside a line makes the terminal paint over the row below it.
- **`buildRow` is pure.** Everything a row depends on goes in and nothing else — which is also what
  makes the honest-hint behaviour testable from raw tool text.
- **A row is laid out once per change, not once per frame.** The result is cached and keyed by width,
  direction, open state, whether the row owns the expand key, and the theme — so typing and scrolling
  reuse the previous strings untouched. Typing used to cost a full rebuild of every visible row.
- **Depth is a slice, not a mode.** A collapsed row and an open one differ only in what
  `buildRow` put in `preview` vs `hidden`; the renderers never branch on which one is showing.

## Tests

```bash
npm test                    # node logic.test.ts && node directions.test.ts && node codeblocks.test.ts
```

All three are assert-based self-checks with no framework and no install step; they need Node 22.6+ for
TypeScript type stripping. `codeblocks.test.ts` checks each style against a stub theme (every style draws
one line per code line, no style ever draws a fence, the padded ones are exactly the width they claim),
and checks the shim against the renderer it really patches: the patched branch has to stay brace-balanced,
installing twice has to change nothing, and an unrecognised renderer has to be reported rather than
half-patched. `directions.test.ts` runs the layouts *and* the whole path a session
takes — raw tool arguments and output through `buildRow` into lines — checking that every line fits
every width tested, that no control character reaches the frame, that the columns line up between
rows, and that the collapsed/open states each stay truthful about what they are hiding.

## Design record

The benches that chose both vocabularies live in [`lab/`](lab/): five directions for one tool
call, seven frames for one code block, each regenerated from pi's own theme. Not part of the
package (`files` in `package.json` ships the extension alone).

## License

MIT — see [LICENSE](LICENSE).
