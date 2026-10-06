# Code block test sheet

Paste this into pi and read it with each style: `/squint code spine`, then `card`, `panel`,
`listing`, `rule`, `chip`, and `off` to compare against pi's fences.

## 1. TypeScript, long lines, a comment, and backticks inside the code

```ts
export function ensureSeeded(): void {
  if (readSortStore(storePath).seeded) return;
  for (const name of readdirSync(sessionsDir, { recursive: true, encoding: "utf8" })) {
    counts = mergeCounts(counts, countModelChanges(join(sessionsDir, name))); // stale after a model switch
  }
  const label = `model ${name} used ${counts[name] ?? 0} times`;
  this.loadModelsFromSnapshot?.();
  this.filterModels?.(this.searchInput?.getValue() ?? "");
  this.selectedIndex = 0; // the new order starts at the top, not at the old model
}
```

## 2. A diff, which pi colours with its own diff tokens

```diff
--- a/sort.test.mjs
+++ b/sort.test.mjs
@@ -18,3 +18,3 @@
 const before = selectedIndex;
-assert(selected === previousIndex);
+assert(selectedIndex === 0);
 // switching modes lands on the top row
```

## 3. Shell, with output that is mostly not code

```bash
cd ~/.pi/agent/extensions/model-picker-sort
npm run typecheck && node sort.test.mjs
# ✓ 41 tests, 0 failures
```

## 4. No language at all, which is the case most styles have to answer for

```
{
  "direction": "rail",
  "key": "super+e",
  "codeBlock": "spine"
}
```

## 5. Markdown's own characters inside a code block

```md
# heading stays literal
* not a bullet
_inline_ and **bold** and [link](https://pi.dev) stay text
| a | b |
|---|---|
> quote marker
const s = "<not html> & \"quoted\"";
```

## 6. Wide glyphs, which the padded styles must still close at the right column

```ts
const note = "日本語のコメント"; // 幅のテスト
const ok = "✓ done";              // emoji and symbols
```

## 7. An indented code block (four spaces), no fence in sight

    npm test
    node logic.test.ts

## 8. Two blocks with nothing but a line between them, then a block on one line

```json
{ "added": 3, "removed": 1 }
```

```ts
const added = 3;
```

## 9. An empty block, then a one-liner

```ts
```

```python
print("hello")
```

## 10. Inline `code` and **bold** next to a block, so the prose keeps its own styling

The guard is `ensureSeeded()`, and the **counts** were the real bug.
