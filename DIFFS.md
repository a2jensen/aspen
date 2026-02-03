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
