# Visual Diff Highlights

## Goals

- Allow users to **make mass edits** to linked snippet instances quickly.
- **Visualize diffs** between linked snippet instances so users can see which parts of their template are parametrizable.

---

## Core Principle

A highlight is a **range marker** that indicates "the content at this position differs between template and instance." We don't classify the edit type (insertion, deletion, replacement) — we just track where divergence exists.

---

## Definitions

- **Template range**: Character positions `[from, to]` in the template
- **Instance range**: Corresponding character positions `[from, to]` in the instance
- **Match**: Template range content === Instance range content
- **Divergence**: Template range content !== Instance range content
- **Highlight pair**: A linked highlight in both the template and instance, connected via `sharedId`

---

## Rules

### Rule 1: Line structure must match

If the instance has a different number of lines than the template, **auto-unsync** the instance. Highlights only operate when line counts are equal.

### Rule 2: Diff runs on every edit

Using jsdiff (word-level), compare template content to instance content in real-time. No debouncing.

### Rule 3: Each diff region creates a highlight pair

For every region where jsdiff detects a difference:
- Create/update a highlight in the **instance** at the divergent range
- Create/update a corresponding highlight in the **template** at the original range
- Link them via a `sharedId`

### Rule 4: Highlights are range-based, not content-based

The highlight marks positions, not specific text. As the user types, the range in the instance adjusts but the range in the template stays fixed.

### Rule 5: Empty ranges show nothing

- If text was inserted in instance (nothing in template at that position): **no visual marker in template**, instance highlight spans the insertion
- If text was deleted from instance: **no visual marker in instance**, template highlight spans what was removed

### Rule 6: Highlights disappear when content matches

If the user edits the instance back to match the template at a given range, that highlight pair is removed. If all highlights are removed, the instance is fully in sync.

### Rule 7: Template shows "region varies" (not all variants)

When multiple instances diverge at the same region with different values, the template highlights that region to indicate "this part varies." It does not display all the different values — just marks the region.

### Rule 8: Adjacent highlights merge

If two diff regions are directly adjacent (no unchanged characters between them), merge them into a single highlight.

---

## Cases

### Case 1: Replacement

Template:
```
df = pd.read_csv("data.csv")
```

Instance (user changes filename):
```
df = pd.read_csv("sales.csv")
```

| Location | Highlight range | Content shown |
|----------|-----------------|---------------|
| Template | positions 18-26 | `data.csv` |
| Instance | positions 18-27 | `sales.csv` |

Both sides highlighted. User sees what the template has vs what this instance has.

---

### Case 2: Insertion (text added in instance)

Template:
```
df = pd.read_csv("data.csv")
```

Instance (user adds comment):
```
df = pd.read_csv("data.csv")  # load
```

| Location | Highlight range | Content shown |
|----------|-----------------|---------------|
| Template | — | *(nothing)* |
| Instance | positions 28-36 | `  # load` |

Instance shows the added text highlighted. Template shows nothing.

---

### Case 3: Deletion (text removed in instance)

Template:
```
result = process(data, verbose=True)
```

Instance (user removes verbose flag):
```
result = process(data)
```

| Location | Highlight range | Content shown |
|----------|-----------------|---------------|
| Template | positions 21-35 | `, verbose=True` |
| Instance | — | *(nothing)* |

Template shows what was removed. Instance shows nothing.

---

### Case 4: Multiple edits on same line

Template:
```
plt.plot(x, y, color="blue")
```

Instance:
```
plt.plot(a, b, color="red")
```

| Location | Highlight range | Content |
|----------|-----------------|---------|
| Template | position 9 | `x` |
| Instance | position 9 | `a` |
| Template | position 12 | `y` |
| Instance | position 12 | `b` |
| Template | positions 22-26 | `blue` |
| Instance | positions 22-25 | `red` |

Three separate highlight pairs, one for each divergent region.

---

### Case 5: Line added or removed → Auto-unsync

Template (2 lines):
```
x = 1
y = 2
```

Instance (3 lines — user added a line):
```
x = 1
z = 0
y = 2
```

**Action**: Auto-unsync. Line count mismatch breaks the correspondence. Instance becomes regular code with no template link.

---

### Case 6: User reverts a change

Instance had `"sales.csv"`, user changes it back to `"data.csv"`.

jsdiff now shows no difference at that range. **Highlight pair is removed.** If all highlights are removed, the instance is fully in sync with the template.

---

### Case 7: Adjacent changes merge

Template:
```
file = "data.csv"
```

Instance:
```
file = "sales_data.csv"
```

jsdiff might detect this as two adjacent changes (`data` → `sales_data`). Since they're adjacent with no unchanged characters between them, **merge into one highlight**:

| Location | Highlight range | Content |
|----------|-----------------|---------|
| Template | positions 8-16 | `data.csv` |
| Instance | positions 8-22 | `sales_data.csv` |

---

### Case 8: Multiple instances with different values

Template:
```
df = pd.read_csv("data.csv")
```

Instance A:
```
df = pd.read_csv("sales.csv")
```

Instance B:
```
df = pd.read_csv("orders.csv")
```

| Location | Highlight shows |
|----------|-----------------|
| Template | `data.csv` highlighted (indicates "this region varies") |
| Instance A | `sales.csv` highlighted |
| Instance B | `orders.csv` highlighted |

The template doesn't try to show all variants — it just marks the region as variable.

---

## Summary Table

| Scenario | Instance | Template | Notes |
|----------|----------|----------|-------|
| Replacement | Highlight new text | Highlight original text | Most common case |
| Insertion | Highlight added text | Nothing | Instance-only |
| Deletion | Nothing | Highlight removed text | Template-only |
| Line count change | — | — | Auto-unsync |
| Revert to match | Remove highlight | Remove highlight | Back in sync |
| Adjacent diffs | Merge | Merge | Single highlight |

---

# TESTING

## CLI Diff Testing Tool

A standalone CLI tool for testing the diff/highlight system in-memory without running Jest. It reads test cases from JSON files and outputs visual representations of where highlights would appear.

---

### Quick Start

```bash
# Run a single test file
npm run diff:test -- test-cases/replacement.json

# Run all test files in a directory
npm run diff:test -- test-cases/

# Show help
npm run diff:test -- --help
```

---

### Test Case Format

#### Single Test Case

```json
{
  "name": "Replacement - filename change",
  "template": "df = pd.read_csv(\"data.csv\")",
  "instances": [
    "df = pd.read_csv(\"sales.csv\")",
    "df = pd.read_csv(\"orders.csv\")"
  ]
}
```

#### Batch Mode (Multiple Test Cases)

```json
{
  "testCases": [
    {
      "name": "Simple replacement",
      "template": "name = \"Alice\"",
      "instances": ["name = \"Bob\"", "name = \"Charlie\""]
    },
    {
      "name": "Function argument change",
      "template": "calculate(100)",
      "instances": ["calculate(200)", "calculate(50)"]
    }
  ]
}
```

#### Multiline Content

Use `\n` for newlines in JSON strings:

```json
{
  "name": "Multiline template",
  "template": "x = 1\ny = 2",
  "instances": ["x = 1\ny = 3"]
}
```

---

### Output Format

The CLI displays:

1. **Highlighted content** - Template (red) and instance (green) with diff regions highlighted
2. **Caret markers** (`^`) - Show exact character positions of differences
3. **Position annotations** - `[from-to] "content"` for each diff region
4. **DiffRegions data** - Structured view of the `DiffRegion[]` array
5. **Status** - Synced (✓), Diverged (△), or Unsynced (✗)

Example output:

```
╭──────────────────────────────────────────────────╮
│         Replacement - filename change            │
╰──────────────────────────────────────────────────╯

  Template: df = pd.read_csv("data.csv")
                              ^^^^
                              [18-22] "data"

  Instance 1: df = pd.read_csv("sales.csv")
                                ^^^^^
                                [18-23] "sales"

  DiffRegions:
  ┌──────────────────────────────────────────────────┐
  │ line: 0                                          │
  │ template: [18, 22] "data"                        │
  │ snippet:  [18, 23] "sales"                       │
  └──────────────────────────────────────────────────┘

  Status: △ 1 diff region found
```

---

### Instance Statuses

| Status | Symbol | Meaning |
|--------|--------|---------|
| Synced | ✓ | Instance matches template exactly (no diffs) |
| Diverged | △ | Instance has differences from template |
| Unsynced | ✗ | Line count mismatch — cannot diff |

---

### Available Test Cases

Pre-built test cases in `test-cases/`:

| File | Description |
|------|-------------|
| `replacement.json` | Text replaced (e.g., filename change) |
| `insertion.json` | Text added in instance |
| `deletion.json` | Text removed from instance |
| `multiple-edits.json` | Multiple changes on same line |
| `line-mismatch.json` | Line count differs (auto-unsync) |
| `identical.json` | No differences (fully synced) |
| `batch-example.json` | Multiple test cases in one file |

---

### Creating New Test Cases

1. Create a new `.json` file in `test-cases/` (or any directory)
2. Define the test case with `name`, `template`, and `instances`
3. Run with `npm run diff:test -- path/to/your-test.json`

Example for testing a deletion:

```json
{
  "name": "Remove optional parameter",
  "template": "fetch(url, { cache: 'no-store' })",
  "instances": [
    "fetch(url, {})",
    "fetch(url)"
  ]
}
```

---

### File Structure

```
src/cli/
├── diffTester.ts       # Main CLI entry point
├── formatOutput.ts     # Terminal output formatting with ANSI colors
└── types.ts            # CLI-specific types (ITestCase, ITestResult, etc.)

test-cases/
├── replacement.json
├── insertion.json
├── deletion.json
├── multiple-edits.json
├── line-mismatch.json
├── identical.json
└── batch-example.json
```

---

### How It Works

1. Loads JSON test file(s)
2. For each test case, runs `computeDiffs(template, instance)` from `diffEngine.ts`
3. Formats results with ANSI colors for terminal display
4. Shows summary of all test results

The CLI reuses the same `computeDiffs` function used in the actual extension, ensuring test results match real behavior.

---

## Data Structures

These are the core data structures used to represent diff regions. The CLI outputs these directly so you can see exactly what data will be used to apply highlights in CodeMirror.

### DiffRegion

The primary structure returned by `computeDiffs()`. Each `DiffRegion` represents one contiguous area of difference between template and instance.

```typescript
interface DiffRegion {
  line: number;           // 0-indexed line number
  templateFrom: number;   // char offset where diff starts in template
  templateTo: number;     // char offset where diff ends in template
  templateContent: string; // text in template at this range (empty if insertion)
  snippetFrom: number;    // char offset where diff starts in instance
  snippetTo: number;      // char offset where diff ends in instance
  snippetContent: string; // text in instance at this range (empty if deletion)
}
```

### Example: Replacement

```
Template: df = pd.read_csv("data.csv")
Instance: df = pd.read_csv("sales.csv")
                           ^^^^  ^^^^^
                           Position 18
```

**DiffRegion output:**
```json
{
  "line": 0,
  "templateFrom": 18,
  "templateTo": 22,
  "templateContent": "data",
  "snippetFrom": 18,
  "snippetTo": 23,
  "snippetContent": "sales"
}
```

**How to apply highlights:**
- Template highlight: characters 18-22 on line 0
- Instance highlight: characters 18-23 on line 0

---

### Example: Insertion (text added in instance)

```
Template: df = pd.read_csv("data.csv")
Instance: df = pd.read_csv("data.csv")  # load
                                       ^
                                       Position 28 (end of template)
```

**DiffRegion output:**
```json
{
  "line": 0,
  "templateFrom": 28,
  "templateTo": 28,
  "templateContent": "",
  "snippetFrom": 30,
  "snippetTo": 36,
  "snippetContent": "# load"
}
```

**How to apply highlights:**
- Template highlight: **none** (from === to, zero-width range)
- Instance highlight: characters 30-36 on line 0

---

### Example: Deletion (text removed from instance)

```
Template: result = process(data, verbose=True)
Instance: result = process(data)
                              ^
                              Position 21
```

**DiffRegion output:**
```json
{
  "line": 0,
  "templateFrom": 21,
  "templateTo": 35,
  "templateContent": ", verbose=True",
  "snippetFrom": 21,
  "snippetTo": 21,
  "snippetContent": ""
}
```

**How to apply highlights:**
- Template highlight: characters 21-35 on line 0
- Instance highlight: **none** (from === to, zero-width range)

---

### Example: Multiple Diffs on Same Line

```
Template: plt.plot(x, y, color="blue")
Instance: plt.plot(a, b, color="red")
```

**DiffRegion[] output:**
```json
[
  {
    "line": 0,
    "templateFrom": 9, "templateTo": 10, "templateContent": "x",
    "snippetFrom": 9, "snippetTo": 10, "snippetContent": "a"
  },
  {
    "line": 0,
    "templateFrom": 12, "templateTo": 13, "templateContent": "y",
    "snippetFrom": 12, "snippetTo": 13, "snippetContent": "b"
  },
  {
    "line": 0,
    "templateFrom": 22, "templateTo": 26, "templateContent": "blue",
    "snippetFrom": 22, "snippetTo": 25, "snippetContent": "red"
  }
]
```

**How to apply highlights:**
- Template: 3 separate highlights at [9-10], [12-13], [22-26]
- Instance: 3 separate highlights at [9-10], [12-13], [22-25]

---

### Return Values from computeDiffs()

| Return Value | Meaning | Action |
|--------------|---------|--------|
| `DiffRegion[]` (non-empty) | Differences found | Apply highlights at specified positions |
| `[]` (empty array) | No differences | Content is identical, no highlights needed |
| `null` | Line count mismatch | Auto-unsync the instance |

---

### PlaceholderPosition

Used internally for parsing `{{}}` markers in templates. Not directly used for highlights but relevant for template editing.

```typescript
interface PlaceholderPosition {
  line: number;    // 0-indexed line number
  from: number;    // char offset of {{ in the line
  to: number;      // char offset after }} in the line
  content: string; // inner content between {{ and }}
}
```

Example for template `df = pd.read_csv("{{data.csv}}")`:

```json
{
  "line": 0,
  "from": 18,
  "to": 32,
  "content": "data.csv"
}
```

---

### Applying Highlights in CodeMirror

The `DiffRegion` data maps directly to CodeMirror decorations:

```typescript
// For each DiffRegion, create decoration ranges:

// Template-side decoration (if templateContent is non-empty)
if (region.templateTo > region.templateFrom) {
  const from = lineStart + region.templateFrom;
  const to = lineStart + region.templateTo;
  // Add Decoration.mark({ class: "cm-template-highlight" }).range(from, to)
}

// Instance-side decoration (if snippetContent is non-empty)
if (region.snippetTo > region.snippetFrom) {
  const from = lineStart + region.snippetFrom;
  const to = lineStart + region.snippetTo;
  // Add Decoration.mark({ class: "cm-instance-highlight" }).range(from, to)
}
```

Key points:
- Use `line` to calculate the absolute position (add line's start offset)
- Skip zero-width ranges (from === to) — no visual highlight needed
- Template uses `templateFrom`/`templateTo`, instance uses `snippetFrom`/`snippetTo`
