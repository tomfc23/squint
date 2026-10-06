// Build the code-block lab: renders every candidate from pi's REAL theme colors and
// hljs tokenization, converts the styled lines to HTML, and writes index.html.
//
//   node render.mjs        (writes index.html)
//
// Fidelity rules: colors come from the live pi release (resolveTheme/current-version),
// syntax colors from pi's own highlightCode, and nothing here is a hand-picked hex or a
// screenshot. Chrome glyphs are the ones pi and squint already draw.
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent")
const ROOT = join(AGENT_DIR, "install", "releases", readFileSync(join(AGENT_DIR, "install", "current-version"), "utf8").trim(), "node_modules", "@earendil-works")
const PI = join(ROOT, "pi-coding-agent", "dist")

/* ---------------------------------- pi ---------------------------------- */

const { highlightCode, initTheme } = await import(pathToFileURL(join(PI, "index.js")).href)
initTheme("dark")

// Resolved theme colors live in the bundle chunk pi itself runs; find it rather than
// hardcoding a versioned file name.
let colors
for (const file of readdirSync(join(PI, "bundle", "chunks")).sort()) {
  if (!file.endsWith(".js")) continue
  if (!readFileSync(join(PI, "bundle", "chunks", file), "utf8").includes("function getResolvedThemeColors")) continue
  const chunk = await import(pathToFileURL(join(PI, "bundle", "chunks", file)).href)
  if (typeof chunk.getResolvedThemeColors !== "function") continue
  chunk.initTheme?.("dark")
  colors = chunk.getResolvedThemeColors("dark")
  break
}
if (!colors) throw new Error("could not read the resolved pi theme from the bundle")

const C = {
  text: colors.text,
  muted: colors.mdCodeBlockBorder, // pi paints code chrome with the muted token
  dim: colors.dim,
  code: colors.mdCode,
  fallback: colors.mdCodeBlock,
  panel: colors.toolPendingBg,
  blue: colors.mdLink,
  line: colors.borderMuted,
}

/* --------------------------------- style -------------------------------- */

const W = 74

const ANSI = /\x1b\[([0-9;]*)m/g
/** ANSI (24-bit fg + dim) → styled segments. pi emits nothing else. */
function segments(input) {
  const out = []
  let color = null
  let dim = false
  let last = 0
  ANSI.lastIndex = 0
  for (let m = ANSI.exec(input); m; m = ANSI.exec(input)) {
    if (m.index > last) out.push({ text: input.slice(last, m.index), color, dim })
    const parts = m[1].split(";").map(Number)
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (p === 0) { color = null; dim = false }
      else if (p === 2) dim = true
      else if (p === 22) dim = false
      else if (p === 39) color = null
      else if (p === 38 && parts[i + 1] === 2) { color = `rgb(${parts[i + 2]} ${parts[i + 3]} ${parts[i + 4]})`; i += 4 }
    }
    last = ANSI.lastIndex
  }
  if (last < input.length) out.push({ text: input.slice(last), color, dim })
  return out.filter((s) => s.text.length > 0)
}

const seg = (text, color = null, extra = {}) => ({ text, color, dim: false, ...extra })
const width = (line) => line.reduce((n, s) => n + s.text.length, 0)
const fill = (n, color, glyph = " ") => seg(glyph.repeat(Math.max(0, n)), color)
/** One code line, syntax-highlighted exactly as pi does it. */
const code = (text, lang) => segments(highlightCode(text, lang)[0] ?? "")

function esc(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function lineHtml(line) {
  const inner = line
    .map((s) => {
      if (!s.color && !s.dim && !s.bg && !s.bold) return esc(s.text)
      const style = [
        s.color ? `color:${s.color}` : "",
        s.bg ? `background:${s.bg}` : "",
        s.bold ? "font-weight:700" : "",
        s.dim ? "opacity:.62" : "",
      ].filter(Boolean).join(";")
      return `<span style="${style}">${esc(s.text)}</span>`
    })
    .join("")
  return `<div class="ln">${inner || "&nbsp;"}</div>`
}

/* -------------------------------- content ------------------------------- */

const DOC = [
  { kind: "prose", text: "Done — toggling now always lands on the top row." },
  {
    kind: "code",
    lang: "ts",
    lines: [
      "this.loadModelsFromSnapshot?.();",
      'this.filterModels?.(this.searchInput?.getValue() ?? "");',
      "this.selectedIndex = 0; // the new order starts at the top, not at the old model",
    ],
  },
  { kind: "prose", text: "Verified on the real TUI both directions, with `selectedIndex === 0` now asserted in sort.test.mjs." },
  {
    kind: "code",
    lang: "diff",
    lines: [
      "--- a/sort.test.mjs",
      "+++ b/sort.test.mjs",
      "@@ -18,1 +18,1 @@",
      "-assert(selected === previousIndex)",
      "+assert(selectedIndex === 0)",
    ],
  },
  { kind: "prose", text: "It reads one settings file at startup:" },
  { kind: "code", lang: undefined, lines: ["{", '  "direction": "rail",', '  "key": "super+e"', "}"] },
]

/** Prose as pi draws it: body color, inline code in the code token color. */
function proseLines(text) {
  const out = []
  let rest = text
  const pieces = []
  while (rest.length) {
    const open = rest.indexOf("`")
    if (open === -1) { pieces.push(seg(rest, C.text)); break }
    const close = rest.indexOf("`", open + 1)
    if (close === -1) { pieces.push(seg(rest, C.text)); break }
    if (open > 0) pieces.push(seg(rest.slice(0, open), C.text))
    pieces.push(seg(rest.slice(open + 1, close), C.code))
    rest = rest.slice(close + 1)
  }
  // wrap at the frame width so prose behaves like the real transcript
  let line = []
  for (const piece of pieces) {
    for (const word of piece.text.split(/(?<=\s)/)) {
      if (width(line) + word.length > W && line.length) { out.push(line); line = [] }
      line.push({ ...piece, text: word })
    }
  }
  if (line.length) out.push(line)
  return out
}

/* ------------------------------- candidates ----------------------------- */

const candidates = [
  {
    id: "00",
    name: "What ships today",
    stock: true,
    thesis: "pi prints the fence lines themselves as the border, so the block wears its own markdown.",
    borrowed: "stock pi",
    best: "nothing",
    cost: "the backticks are the only delimiter, and they read as noise on every block",
    render: (block) => {
      const out = [seg(`\`\`\`${block.lang ?? ""}`, C.muted)]
      for (const text of block.lines) out.push([seg("  "), ...code(text, block.lang)])
      out.push(seg("```", C.muted))
      return out
    },
  },
  {
    id: "01",
    name: "Spine",
    stock: true,
    thesis: "A muted language label, then one left rule per line. No fences; the code carries the block.",
    borrowed: "Claude Code, Cursor CLI, opencode: the left-rule family",
    best: "long sessions where code should stay quiet",
    cost: "no closing edge; two blocks in a row separate only by the blank line",
    render: (block) => {
      const out = []
      if (block.lang) out.push([seg("  ", null), seg(block.lang, C.muted)])
      for (const text of block.lines) out.push([seg("  "), seg("│ ", C.muted), ...code(text, block.lang)])
      return out
    },
  },
  {
    id: "02",
    name: "Card",
    thesis: "The block is a closed object: rounded corners, label set into the top rail, all four edges ruled.",
    borrowed: "squint's deck direction · Claude Code's box glyph sets",
    best: "one block you are meant to study, and blocks inside prose",
    cost: "two rail lines per block, and it competes with squint's own tool cards",
    render: (block) => {
      const label = block.lang ? ` ${block.lang} ` : ""
      const top = `╭─${label}`
      const inner = W - 2
      const out = [seg(`${top}${"─".repeat(Math.max(0, inner - top.length))}╮`, C.muted)]
      for (const text of block.lines) {
        const body = code(text, block.lang)
        const pad = Math.max(0, inner - 2 - width(body))
        out.push([seg("│ ", C.muted), ...body, fill(pad), seg(" │", C.muted)])
      }
      out.push(seg(`╰${"─".repeat(inner - 2)}╯`, C.muted))
      return out
    },
  },
  {
    id: "03",
    name: "Panel",
    thesis: "A full-width ground behind the code and nothing else. The block is a lit surface, not a frame.",
    borrowed: "Warp · ChatGPT and Claude web · pi's own tool panels (toolPendingBg)",
    best: "the strongest separation with zero glyphs spent on chrome",
    cost: "a panel is heavier than code deserves for one-liners, and it fights the tool panels' meaning",
    render: (block) => {
      const out = []
      if (block.lang) out.push([fill(W - block.lang.length, null), seg(block.lang, C.muted)])
      for (const text of block.lines) {
        const body = code(text, block.lang)
        const pad = Math.max(0, W - width(body))
        out.push([...body, fill(pad)].map((s) => ({ ...s, bg: C.panel })))
      }
      return out
    },
  },
  {
    id: "04",
    name: "Listing",
    thesis: "Line numbers in a dim gutter and a stated count. The block reads as a listing you can cite.",
    borrowed: "GitHub and GitLab code view · bat · less -N",
    best: "quoting back a line ('the guard on line 3'), and diffs",
    cost: "numbering a two-line snippet is ceremony; numbers only ever start at 1",
    render: (block) => {
      const out = []
      const gutter = String(block.lines.length).length + 1
      if (block.lang) out.push([seg(block.lang, C.muted), fill(Math.max(1, W - block.lang.length - 9)), seg(`${block.lines.length} lines`, C.dim)])
      block.lines.forEach((text, i) => {
        out.push([
          seg(String(i + 1).padStart(gutter) + " ", C.dim),
          seg("│ ", C.muted),
          ...code(text, block.lang),
        ])
      })
      return out
    },
  },
  {
    id: "05",
    name: "Rule",
    thesis: "One hairline header with the language in it, then plain indented code. The lightest chrome that still labels.",
    borrowed: "GitHub web's file header · documentation styles",
    best: "prose-heavy answers where code is a short interruption",
    cost: "no closing edge, and a full-width rule can be mistaken for a markdown hr",
    render: (block) => {
      const out = []
      if (block.lang) out.push([seg(`${block.lang} `, C.muted), fill(W - block.lang.length - 1, C.muted, "─")])
      for (const text of block.lines) out.push([seg("  "), ...code(text, block.lang)])
      return out
    },
  },
  {
    id: "06",
    name: "Chip",
    thesis: "The language is a filled badge on the first line, in squint's tool palette. Immediately scannable.",
    borrowed: "squint's badge direction and GitHub's language pill, drawn in pi's blue token",
    best: "scanning a long answer for 'where is the code'",
    cost: "loud on every block, and it says nothing about where the block ends",
    render: (block) => {
      const out = []
      block.lines.forEach((text, i) => {
        const body = code(text, block.lang)
        if (i === 0 && block.lang) {
          out.push([seg(" ", null), seg(` ${block.lang.toUpperCase()} `, "#181a20", { bg: C.blue, bold: true }), seg("  ", null), ...body])
          return
        }
        out.push([seg("  "), ...body])
      })
      return out
    },
  },
]

/* --------------------------------- dials -------------------------------- */

const DIAL_SAMPLE = ["const a = 1; // one line"]
const dials = [
  { caption: "rule weight: thin │ (01)", lines: [[seg("  "), seg("│ ", C.muted), ...code(DIAL_SAMPLE[0], "ts")]] },
  { caption: "rule weight: heavy ▌ (Zed, Warp)", lines: [[seg("  "), seg("▌ ", C.muted), ...code(DIAL_SAMPLE[0], "ts")]] },
  { caption: "label: right-aligned", lines: [[fill(W - 2, null), seg("ts", C.muted)], [seg("  "), seg("│ ", C.muted), ...code(DIAL_SAMPLE[0], "ts")]] },
  { caption: "label: on the first line", lines: [[seg("  "), seg("ts ", C.dim), ...code(DIAL_SAMPLE[0], "ts")]] },
  { caption: "indent: 0 instead of 2", lines: [[seg("│ ", C.muted), ...code(DIAL_SAMPLE[0], "ts")]] },
]

/* ---------------------------------- page -------------------------------- */


function frame(block, label) {
  const asLine = (x) => (Array.isArray(x) ? x : [x])
  const lines = []
  for (const item of DOC) {
    if (item.kind === "prose") lines.push(...proseLines(item.text))
    else lines.push(...block.render(item).map(asLine))
    lines.push([seg(" ")])
  }
  while (lines.length && width(lines[lines.length - 1]) === 1) lines.pop()
  return `<figure class="frame">
  <figcaption class="bar"><span>${label}</span>${block.stock ? '<span class="tag">shipping today</span>' : ''}</figcaption>
  <div class="term" role="img" aria-label="${label} — rendered code block">${lines.map(lineHtml).join("\n    ")}</div>
</figure>`
}

const cards = candidates
  .map(
    (c) => `<section class="card" id="c${c.id}">
  <header class="card-head">
    <p class="num">${c.id}</p>
    <h2>${c.name}</h2>
    <p class="thesis">${c.thesis}</p>
  </header>
  ${frame(c, `${c.id} · ${c.name}`)}
  <dl class="spec">
    <div><dt>borrowed</dt><dd>${c.borrowed}</dd></div>
    <div><dt>best at</dt><dd>${c.best}</dd></div>
    <div><dt>cost</dt><dd>${c.cost}</dd></div>
  </dl>
</section>`,
  )
  .join("\n")

const dialsHtml = dials
  .map(
    (d) => `<figure class="dial">
    <div class="dial-term">${d.lines.map(lineHtml).join("")}</div>
    <figcaption>${d.caption}</figcaption>
  </figure>`,
  )
  .join("\n")

const rows = candidates
  .filter((c) => !c.stock)
  .map((c) => `<tr><th scope="row">${c.id} ${c.name}</th><td>${c.borrowed}</td><td>${c.best}</td><td>${c.cost}</td></tr>`)
  .join("\n")

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>code blocks — seven ways to render one pi code block</title>
<meta name="description" content="Render candidates for code blocks in pi's transcript: the same three blocks drawn seven ways, from pi's real theme.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='2' fill='%23a798d7'/%3E%3Crect x='3' y='6' width='3' height='4' fill='%2314161b'/%3E%3Crect x='7.5' y='6' width='5.5' height='1.4' fill='%2314161b'/%3E%3C/svg%3E">
<style>
@font-face{font-family:"Schibsted Grotesk";font-style:normal;font-weight:400 900;font-display:swap;src:url("../fonts/schibsted-grotesk.woff2") format("woff2");}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:400 700;font-display:swap;src:url("../fonts/jetbrains-mono.woff2") format("woff2");}
</style>
<style>
:root{
  --ground:#14161b; --panel:#1b1e25; --term:#191c22; --hair:#2b3038; --hair-2:#3a414b;
  --text:#dee0e1; --muted:#9da5a9; --dim:#7e888e; --accent:#a798d7; --blue:#4D9ABF; --gold:#F1BE58;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:"Schibsted Grotesk",ui-sans-serif,system-ui,-apple-system,sans-serif;
  --r:2px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--text);font:400 15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
::selection{background:color-mix(in oklab,var(--accent) 34%,var(--ground));color:var(--text)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:var(--r)}
a{color:var(--accent);text-underline-offset:3px}
.skip{position:absolute;left:-9999px;top:0;background:var(--accent);color:var(--ground);font:600 12px/1 var(--sans);padding:10px 14px}
.skip:focus{left:0}
.scroll{scrollbar-color:var(--hair-2) var(--term);scrollbar-width:thin}
.scroll::-webkit-scrollbar{height:10px;width:10px}
.scroll::-webkit-scrollbar-track{background:var(--term)}
.scroll::-webkit-scrollbar-thumb{background:var(--hair-2);border-radius:6px}

/* masthead */
.masthead{max-width:1020px;margin:0 auto;padding:46px 26px 8px}
.mast{display:flex;flex-wrap:wrap;gap:22px 40px;align-items:flex-end;justify-content:space-between}
.wordmark{font-family:var(--sans);font-weight:800;font-size:clamp(38px,6.6vw,68px);line-height:.88;letter-spacing:-0.045em;margin:0;text-transform:lowercase}
.wordmark em{font-style:normal;color:var(--accent)}
.claim{font-family:var(--sans);font-weight:400;font-size:17px;line-height:1.45;color:var(--muted);margin:14px 0 0;max-width:60ch}
.claim b{color:var(--text);font-weight:600}
.stamp{font:600 12px/1.55 var(--sans);letter-spacing:.02em;color:var(--muted);border:1px solid var(--hair-2);border-radius:var(--r);padding:9px 12px;max-width:30ch}
.brief{max-width:1020px;margin:26px auto 0;padding:0 26px}
.brief ol{margin:0;padding:0 0 0 22px;color:var(--muted);font-size:14.5px}
.brief li{margin:5px 0}
.brief b{color:var(--text);font-weight:600}
.how{max-width:1020px;margin:20px auto 0;padding:0 26px;color:var(--muted);font-size:14.5px}
.how code{font:400 13px/1.4 var(--mono);color:var(--accent)}

/* cards */
main{max-width:1020px;margin:0 auto;padding:0 26px 60px}
.card{border-top:1px solid var(--hair);padding:34px 0 6px}
.card:first-of-type{border-top:0}
.tag{font:600 11px/1.6 var(--sans);letter-spacing:.06em;color:var(--text);border:1px solid var(--gold-border);border-radius:var(--r);padding:0 6px}
.card-head{display:grid;grid-template-columns:40px 1fr;grid-template-areas:"num name" "num thesis";gap:2px 14px;margin:0 0 16px}
.num{grid-area:num;margin:0;font:600 12px/1.9 var(--mono);color:var(--dim);letter-spacing:.06em}
.card h2{grid-area:name;margin:0;font-family:var(--sans);font-weight:700;font-size:clamp(20px,3.4vw,26px);line-height:1.1;letter-spacing:-0.03em}
.thesis{grid-area:thesis;margin:6px 0 0;color:var(--muted);max-width:68ch}

/* terminal frame */
.frame{margin:0}
.bar{display:flex;justify-content:space-between;gap:12px;padding:8px 11px;background:var(--panel);border:1px solid var(--hair);border-bottom:0;border-radius:var(--r) var(--r) 0 0;font:600 12px/1.5 var(--sans);letter-spacing:0;color:var(--muted)}
.term{background:var(--term);border:1px solid var(--hair);border-radius:0 0 var(--r) var(--r);padding:12px 14px;font:400 13px/1.55 var(--mono);overflow-x:auto;color:var(--text)}
.ln{white-space:pre}

/* spec */
.spec{margin:16px 0 0;display:grid;gap:6px 18px;grid-template-columns:repeat(3,minmax(0,1fr))}
.spec dt{font:600 11px/1.6 var(--sans);letter-spacing:.08em;color:var(--dim)}
.spec dd{margin:2px 0 0;color:var(--muted);font-size:14px}

/* dials */
.dials{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin:0 0 8px}
.dial{margin:0;border:1px solid var(--hair);border-radius:var(--r);background:var(--term);overflow:hidden}
.dial-term{padding:10px 12px;font:400 12.5px/1.5 var(--mono);overflow-x:auto;white-space:pre}
.dial figcaption{padding:8px 11px;border-top:1px solid var(--hair);font:600 12px/1.5 var(--sans);letter-spacing:.01em;color:var(--muted)}

/* table */
.tablewrap{margin:0;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}
caption{text-align:left;color:var(--muted);padding:0 0 6px;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:11px 14px 11px 0;border-top:1px solid var(--hair)}
thead th{font:600 12px/1.6 var(--sans);letter-spacing:.02em;color:var(--dim);border-top:0;padding-top:0}
tbody th{font-weight:600;color:var(--text);white-space:nowrap;width:9ch}
tbody td{color:var(--muted)}
h2.section{font-family:var(--sans);font-weight:700;font-size:20px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 4px}
.section-intro{color:var(--muted);margin:0 0 18px;max-width:68ch}
section.band{border-top:1px solid var(--hair);margin-top:44px;padding-top:30px}

/* ask */
.ask{margin:44px 0 0;border:1px solid var(--hair-2);border-radius:var(--r);padding:22px 24px;background:var(--panel)}
.ask h2{font-family:var(--sans);font-weight:700;font-size:20px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 8px}
.ask p{margin:6px 0;color:var(--muted)}
.ask b{color:var(--text)}
.ask ul{margin:10px 0 0;padding-left:22px;color:var(--muted)}
.ask li{margin:4px 0}
footer{max-width:1020px;margin:0 auto;padding:22px 26px 60px;color:var(--dim);font-size:13.5px;border-top:1px solid var(--hair)}

@media (max-width:760px){
  .masthead{padding:32px 18px 6px}
  main,footer,.brief,.how{padding-left:18px;padding-right:18px}
  .card-head{grid-template-columns:1fr;grid-template-areas:"num" "name" "thesis"}
  .spec{grid-template-columns:1fr}
  .term{font-size:12px;padding:10px}
  table,tbody,tbody tr,tbody th,tbody td{display:block;width:auto}
  thead{display:none}
  tbody tr{border-top:1px solid var(--hair);padding:12px 0}
  tbody th{border:0;padding:0 0 4px}
  tbody td{border:0;padding:0 0 3px}
  tbody td::before{content:"";display:block;font:600 11px/1.8 var(--sans);letter-spacing:.04em;color:var(--dim)}
  tbody tr td:nth-of-type(1)::before{content:"borrowed"}
  tbody tr td:nth-of-type(2)::before{content:"best at"}
  tbody tr td:nth-of-type(3)::before{content:"cost"}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<a class="skip" href="#c01">Skip to the candidates</a>

<header class="masthead">
  <div class="mast">
    <div>
      <h1 class="wordmark">code <em>blocks</em></h1>
      <p class="claim">Seven ways for pi's transcript to draw one fenced code block. The same three blocks in every candidate: a <b>ts</b> edit, a <b>diff</b>, and a language-less JSON blob. The comparison is the design and nothing else.</p>
    </div>
    <p class="stamp">Rendered from pi's live dark theme and hljs. Not screenshots.</p>
  </div>
</header>

<div class="brief">
  <ol>
    <li>Every frame below is drawn by <b>render.mjs</b>: pi's resolved theme colors for chrome, pi's own <b>highlightCode</b> for the code, the glyphs pi and squint already draw. Nothing is a hand-picked hex or a picture of a terminal.</li>
    <li>The transcript cannot do per-block affordances: no copy button, no collapse, no hover. Any candidate that needs one is out.</li>
    <li>Below about 760px the frames scroll sideways rather than reflow: a real transcript line is 74 columns and a phone is not, so shrinking the type would lie about the fit.</li>
    <li>These are the constraints the real renderer has: a block is <b>lines of styled text</b>, drawn at a known width, with <b>highlightCode(code, lang)</b> available and the language optional.</li>
  </ol>
</div>

<p class="how">Pick by number: reply <code>01</code>...<code>06</code> (or "01 with the heavy bar"). The choice ships as <code>/squint</code> → <b>Code blocks</b> → a style (or <code>/squint card</code> directly). The choice lives in squint, and this page regenerates from the same theme squint reads.</p>

<main>
${cards}

<section class="band">
  <h2 class="section">Details worth dialing after the idea is chosen</h2>
  <p class="section-intro">The direction picks the structure; these are the knobs inside it. Shown at 74 columns, same code, so only the detail changes.</p>
  <div class="dials">
${dialsHtml}
  </div>
</section>

<section class="band">
  <h2 class="section">Trade-offs, side by side</h2>
  <div class="tablewrap scroll">
    <table>
      <caption>Candidates 01–06, ordered by how little chrome they spend. 00 is pi's own rendering, kept as <code>off</code>.</caption>
      <thead><tr><th scope="col">Candidate</th><th scope="col">Borrowed from</th><th scope="col">Best at</th><th scope="col">Cost</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>
</section>

<section class="ask">
  <h2>What I need from you</h2>
  <p><b>One number</b>, plus any dial you want flipped. The winner is a style in <code>squint</code>, picked from its own menu, with <b>off</b> keeping pi's fences. Three worth naming up front, because they change the answer:</p>
  <ul>
    <li><b>01 Spine</b> is the default <code>/squint code spine</code> ships with. It is the quiet default and the one every competitor lands near.</li>
    <li><b>02 Card</b> and <b>03 Panel</b> spend the most chrome. If code blocks in pi should look like squint's tool cards, 02 is the congruent choice; if they should look like pi's own panels, 03 is.</li>
    <li><b>04 Listing</b> is the only one that changes what you can <em>do</em> with a block afterwards: cite it by line number.</li>
  </ul>
</section>
</main>

<footer>
  Same content in every frame. Chrome colors resolve from <code>getResolvedThemeColors("dark")</code> in the active pi release; code colors come from pi's <code>highlightCode</code>, so a theme change or a new pi version moves this page with it. Regenerate with <code>node render.mjs</code>; ship a winner with <code>/squint</code>.
</footer>
</body>
</html>
`

writeFileSync(join(HERE, "index.html"), html)
console.log(`index.html written — ${candidates.length} candidates, ${DOC.length}-part transcript, theme: ${C.muted} on ${C.panel}`)
