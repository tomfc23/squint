# squint

A quieter, more readable transcript for [pi](https://pi.dev).

squint turns tool calls into compact, expandable rows, gives code blocks a consistent visual style,
and adds image layouts and a read-only subagent viewer. Choose the presentation that suits your
workflow; your preferences are saved between sessions.

```text
● READ    directions.ts                                      42 lines · 0.3s
│ 190#XXMT:export function previewLines(list: string[], limit: number): Preview {
│ ⌘E to expand
```

- **Five tool-call layouts**, from a single-line ledger to a nested trace spine.
- **Six code-block styles**, using pi's syntax highlighting and theme.
- **Four image modes**, including contact strips and an attachment inspector.
- **Live subagent observation**, without interrupting the main session.

## Installation

### Requirements

- [pi](https://pi.dev) installed and available as `pi`.
- **Node.js 22.18 or newer** for the repository's direct TypeScript test commands.
- Git, when installing from this repository.

Tested with **pi 1.2.0**. Code-block and image enhancements patch pi's installed renderer and
currently locate it through `<agent-dir>/install/current-version` and `install/releases/`.
Other installation layouts may not receive these enhancements. Compatibility with older or future
pi versions is not guaranteed; unsupported renderer patterns are left unchanged.

### Install as a pi package

```bash
pi install git:github.com/tomfc23/squint
```

Alternatively, clone the repository into pi's automatically discovered extensions directory:

```bash
git clone https://github.com/tomfc23/squint ~/.pi/agent/extensions/squint
```

**Use one installation method, not both.** For a custom agent directory, replace `~/.pi/agent`
with the directory configured by `PI_CODING_AGENT_DIR`.

Run `/reload` in an existing session, or start pi to load the extension. **Then restart pi once**
so the code-block and image renderer patches take effect. Tool-call layouts work immediately;
the already-running process cannot load changes to its renderer modules.

### Update or remove

For a package installation:

```bash
pi update --extensions
pi remove git:github.com/tomfc23/squint
```

For a manual clone, update it with `git pull --ff-only` from the clone directory. To uninstall,
move that directory outside pi's extensions directory. Restart pi after removal.

Settings in `<agent-dir>/squint.json` and renderer backups are retained. The installed hooks fall
back to pi's rendering when squint is not loaded; removal does not restore the renderer files.

## Quick start

Run `/squint` to open the menu:

```text
  ❯ Tool calls — rail
    Code blocks — spine
    Image rendering — inline
    Observe agents — read-only subagent transcripts
```

Each entry shows its current mode. Choose a family, then a mode; the menu closes so you can see
the result. You can also change modes directly:

| Command | Action |
| --- | --- |
| `/squint tui` | Open the tool-call layout picker |
| `/squint ledger` | Switch to the ledger layout |
| `/squint code` | Open the code-block style picker |
| `/squint code card` | Switch to the card style |
| `/squint images` | Open the image-mode picker |
| `/squint images inspector` | Switch to the image inspector |
| `/squint agents` | Browse subagent transcripts |
| `/squint key ctrl+o` | Change the expand/collapse shortcut |
| `/squint custom` | Ask pi to build a custom tool-call layout |
| `/squint off` | Use pi's own tool-call rendering |
| `/squint code off` | Use pi's own fenced code blocks |

Bare code-style names also work, such as `/squint card`. A bare `off` applies only to tool calls.

### Controls and settings

Click a tool row to expand or collapse it. **⌘E** (`super+e`) toggles the newest row by default;
use `/squint key <binding>` to choose another shortcut, such as `ctrl+o` or `ctrl+shift+x`.
Thinking blocks start collapsed and are labeled `THINK · click to expand`.

squint releases pi's built-in `app.tools.expand` binding for its own shortcut. If you have assigned
that action another binding, add `"app.tools.expand": []` to your `keybindings.json` to avoid a conflict.

Preferences are saved to `<agent-dir>/squint.json`, where `<agent-dir>` is `~/.pi/agent` unless
`PI_CODING_AGENT_DIR` is set. The defaults are:

```json
{ "direction": "rail", "key": "super+e", "codeBlock": "spine", "images": "inline" }
```

## Tool-call layouts

| Layout | Presentation | Best for |
| --- | --- | --- |
| `rail` (default) | A trace spine, with nested calls attached to their parent | Following agents and nested work |
| `ledger` | One aligned line per call; output appears when expanded | Scanning long sessions |
| `badge` | A filled tool label with a short output preview | Reading mixed tool output |
| `gutter` | A fixed label column with indented output | Scanning by tool and path |
| `deck` | A bordered panel for each call | Inspecting individual calls |

Nested tool events from `codemode` and `subagent` appear inside the parent row rather than as
separate top-level entries:

```text
● AGENT   review-team · correctness                         3 tools · 12.4s
│ done
│ ├─● GREP    /previewLines/ · extensions
│ ├─● READ    logic.ts
│ └─● WEB     pi tui box drawing
│ click to expand
```

Collapsed rows state what they hide and show no expand hint when there is nothing to open.
Edits preview changed lines; expanding reveals context. Shell previews show the tail of the output,
while expanded output starts at the top. Output beyond 400 lines retains a count of withheld lines,
even when expanded.

## Code-block styles

Choose a style with `/squint code <style>`. All styles retain pi's theme and syntax highlighting.

| Style | Presentation |
| --- | --- |
| `spine` (default) | A muted language label and a left rule |
| `card` | A bordered card with the language in its top edge |
| `panel` | A full-width background without a border |
| `listing` | Line numbers and a stated line count |
| `rule` | A thin header rule with the language label |
| `chip` | A filled language badge above the code |
| `off` | pi's original fenced rendering |

Card, panel, and listing styles wrap long lines to fit the terminal width. A code block containing
exactly one fenced block is unwrapped once, using the inner language for highlighting.

For user messages only, pasted Markdown documents wrapped in four or more backticks are unwrapped
before parsing when they contain an inner fence. Assistant Markdown is not transformed this way.

## Images

Choose a mode with `/squint images <mode>`.

| Mode | Presentation |
| --- | --- |
| `inline` (default) | Aspect-preserving previews up to 18 rows; later siblings use 6-row thumbnails |
| `strip` | A contact strip of sibling images; narrow terminals stack thumbnails |
| `compact` | Named attachments that expand into previews |
| `inspector` | Named attachments opening a shared, read-only image browser |

The inspector uses Left/Right to select attachments and Escape to close. Wide terminals show a
result list beside the selected image. Click or use the configured expand shortcut to open it.

pi's **show images** setting is respected. Terminals without image support show attachment metadata;
malformed images show a one-line fallback. Non-PNG images use pi's transcoder. With tool-call
rendering set to `off`, pi retains its own image rendering.

## Observing subagents

**Ctrl+Shift+Right/Left** cycles between Main and running subagents. Completed, failed, and aborted
agents are skipped. Use `/squint agents` to browse transcript history, including finished agents.
Main keeps working while you observe; input is never sent to the observed agent.

| Control | Action |
| --- | --- |
| Tab / Shift+Tab | Cycle agents; history in the menu viewer, running agents in the shortcut viewer |
| Escape | Return to Main |
| ↑/↓, PageUp/PageDown, mouse wheel | Scroll the transcript |
| Home / End | Go to the task / follow new output |
| Click a tool row | Expand or collapse that row |
| Configured expand shortcut | Toggle the latest tool row |
| `t` | Toggle thinking |

A pinned header identifies the task, agent, status, and model, and marks the view **READ ONLY**.
The footer tracks the observed agent while subagents are running and hides when none remain.
Repeated invocations of the same agent remain separate views.

Updates arrive as the runner publishes messages and results, not token by token. Finished top-level
transcripts restore from saved tool details after reload or resume. Nested invocations are observable
live, but cannot restore unless their transcript details were persisted; nested metadata alone does
not contain result bodies.

## Renderer patches

pi's extension API does not replace fenced-code rendering or core-appended images, so squint installs
two small hooks in the supported CLI bundle and SDK components:

- `shim.ts` delegates code-block rendering to squint and keeps a `.orig` backup beside each target.
- `image-shim.ts` lets squint own image rendering without duplicate core images and keeps a
  `.squint-images.orig` backup beside each target.

These patches change presentation, not tool results or model-visible content. The code-block hook
falls back to pi's renderer when squint is absent, disabled, or fails. The image hook is opt-in;
until it is loaded, core retains image ownership.

A pi update may replace the patched files. squint checks them on load and reapplies recognized
patches; restart pi when prompted. Setting a mode to `off` does not remove the on-disk hooks.

## Development

Clone the repository and use Node.js **22.18+**. No test framework or additional dependency install is
needed when the supported pi runtime is already installed in the layout described above.

```bash
npm test                       # All seven self-check suites
npm run test:adapter           # Adapter, subagent viewer, and image integration checks
node tests/directions.test.ts  # Layout checks only; no installed pi runtime required
```

The assert-based checks cover layout widths, control-character filtering, honest collapsed previews,
code styles, patch idempotency, reload/resume behavior, row caching, agent navigation, image protocols,
and fallback rendering. Adapter tests resolve modules from the installed pi release, not a separate
copy in this repository.

### Source map

```text
squint/
├── src/       # Runtime TypeScript; extension entry point: src/index.ts
├── tests/     # Assert-based self-checks
├── lab/       # Static design comparisons and bundled fonts
├── package.json
├── README.md
└── LICENSE
```

All runtime files listed below live in `src/`. Tests live in `tests/` and are not packaged.

| File | Responsibility |
| --- | --- |
| `index.ts` | Extension registration, settings, commands, events, row components, and render cache |
| `logic.ts` | Tool classification, argument summaries, text sanitization, and preview slicing |
| `directions.ts` | Pure tool-call row construction and layout |
| `codeblocks.ts` | Code styles and fence handling; uses text helpers from `logic.ts` |
| `menu.ts` | Menu entries, command resolution, and completions |
| `agents.ts` | pi-backed, read-only subagent transcript viewer |
| `image-modes.ts` | Image mode definitions and validation |
| `images.ts` | pi-backed image previews and inspector |
| `shim.ts` | Agent-directory resolution and code-block patch installation |
| `image-shim.ts` | Image ownership patch installation |

Layout logic is separate from pi-backed components. Tool arguments and output are treated as
untrusted: layout text is flattened and control characters are removed before drawing. Rows are
cached across unchanged frames rather than rebuilt on every keystroke.

### Adding a layout

`/squint custom` asks pi to collect your instructions, build a loopback-only HTML preview for approval,
implement the layout, run tests, and remove the temporary preview. Review the generated changes as
you would any other code.

To add one manually:

1. Add its ID to `Direction` and `DIRECTIONS` in `src/directions.ts`. The first entry is the default.
2. Implement `(row: Row, cols: number, open: boolean, opts) => Seg[][]`. The first line is the header;
   the remaining lines are the body.
3. Register it in `layout()` and set a `collapsedLimit` where needed.
4. Run `node tests/directions.test.ts`, then `npm test`. The shared layout checks cover every registered
   direction at multiple widths, both collapsed and expanded.

The static design comparisons live in [`lab/`](lab/), including the
[code-block bench](lab/code-blocks/). They are kept as a design record and are excluded from the
npm package; the package's `files` list includes only the extension, README, and license.

## License

squint is [MIT licensed](LICENSE). The bundled lab fonts are separately licensed under the
SIL Open Font License 1.1: [JetBrains Mono](lab/fonts/jetbrains-mono-OFL.txt) and
[Schibsted Grotesk](lab/fonts/schibsted-grotesk-OFL.txt).
