# Highlight System Implementation Plan

This document outlines the incremental implementation plan for rewriting the diff/highlight system based on the design in `DIFFS.md`.

---

## Overview

**Goal:** Replace the complex `ITextbox` tracking system with a simpler approach where:
- Template `{{}}` markers are the source of truth for template-side highlights
- Snippet-side highlights are computed dynamically by diffing on each edit
- No incremental position tracking — recompute fresh each time

**Key Simplifications:**
- Remove `ITextbox` array from templates
- Remove `updateTextboxes()` incremental updates
- Remove `ignoreUpdate` / `ignoreDiff` workaround sets
- Remove `sharedId` linking between template and snippet highlights

---

## Phase 1: New Diff Engine

**Goal:** Create a standalone diff function that compares template content against snippet content and returns structured diff regions.

### Step 1.1: Create `DiffRegion` type

**File:** `src/types.ts`

```typescript
export interface DiffRegion {
  line: number;              // 0-indexed line number
  templateFrom: number;      // char offset in template line
  templateTo: number;        // char offset in template line
  templateContent: string;   // content in template (empty string if insertion)
  snippetFrom: number;       // char offset in snippet line
  snippetTo: number;         // char offset in snippet line
  snippetContent: string;    // content in snippet (empty string if deletion)
}
```

**Test:** Type compiles, can create instances manually.

---

### Step 1.2: Create `computeDiffs()` function

**File:** `src/diffEngine.ts` (new file)

```typescript
import { diffWords } from 'diff';
import { DiffRegion } from './types';

/**
 * Compares clean template content against snippet content.
 * Returns null if line counts differ (caller should auto-unsync).
 * Returns array of DiffRegion for all differences found.
 */
export function computeDiffs(
  templateContent: string,
  snippetContent: string
): DiffRegion[] | null {
  // Implementation
}
```

**Logic:**
1. Split both into lines
2. If line counts differ, return `null`
3. For each line pair, run `diffWords(templateLine, snippetLine)`
4. Convert jsdiff output to `DiffRegion` objects
5. Merge adjacent regions on same line
6. Return array

**Test:**
- Create unit test file `src/__tests__/diffEngine.test.ts`
- Test replacement: `"data.csv"` → `"sales.csv"`
- Test insertion: `"hello"` → `"hello world"`
- Test deletion: `"hello world"` → `"hello"`
- Test multiple diffs on same line
- Test adjacent diffs merge
- Test line count mismatch returns null
- Test identical content returns empty array

---

### Step 1.3: Create `stripPlaceholders()` helper

**File:** `src/diffEngine.ts`

```typescript
/**
 * Removes {{}} markers from template content, keeping inner content.
 * "df = pd.read_csv("{{data.csv}}")" → "df = pd.read_csv("data.csv")"
 */
export function stripPlaceholders(content: string): string {
  return content.replace(/\{\{(.*?)\}\}/g, '$1');
}
```

**Test:**
- `"{{data.csv}}"` → `"data.csv"`
- `"hello {{world}} foo"` → `"hello world foo"`
- `"no placeholders"` → `"no placeholders"`
- `"{{}}"` → `""`

---

## Phase 2: Template Content Updates

**Goal:** Functions to update template `{{}}` markers based on diff regions.

### Step 2.1: Create `updateTemplatePlaceholders()` function

**File:** `src/diffEngine.ts`

```typescript
/**
 * Updates template content to add/update/remove {{}} markers based on diffs.
 *
 * Rules:
 * - Replacement: wrap template content in {{}}
 * - Insertion (snippet added text): add {{}} at position (empty)
 * - Deletion (snippet removed text): keep {{content}} in template
 * - No diff at position: remove {{}} if present
 */
export function updateTemplatePlaceholders(
  templateContent: string,
  diffs: DiffRegion[]
): string {
  // Implementation
}
```

**Test:**
- Template `"data.csv"` with replacement diff → `"{{data.csv}}"`
- Template `"hello"` with insertion diff at end → `"hello{{}}"`
- Template with existing `{{}}` but no diff → placeholders removed
- Multiple diffs on same line handled correctly

---

### Step 2.2: Create `parsePlaceholders()` helper

**File:** `src/diffEngine.ts`

```typescript
export interface PlaceholderPosition {
  line: number;
  from: number;        // position of {{ in original content
  to: number;          // position after }} in original content
  innerFrom: number;   // position of inner content start (after {{)
  innerTo: number;     // position of inner content end (before }})
  content: string;     // inner content
}

/**
 * Finds all {{}} markers in template content with their positions.
 */
export function parsePlaceholders(content: string): PlaceholderPosition[] {
  // Implementation
}
```

**Test:**
- Parse `"{{data.csv}}"` returns correct positions
- Parse `"a {{b}} c {{d}}"` returns two entries
- Parse content with no placeholders returns empty array

---

## Phase 3: CodeMirror Decoration Application

**Goal:** Apply highlights to snippet instances in the editor.

### Step 3.1: Simplify `applyHighlights()` in SnippetsManager

**File:** `src/snippetManager.ts`

Rewrite to take `DiffRegion[]` instead of individual textbox params:

```typescript
/**
 * Clears existing decorations and applies new ones based on diff regions.
 */
applyDiffHighlights(
  snippet: ISnippet,
  diffs: DiffRegion[],
  color: string
): void {
  // Implementation
}
```

**Logic:**
1. Get EditorView for snippet's cell
2. Clear all existing decorations for this snippet
3. For each diff region where `snippetContent` is non-empty:
   - Calculate absolute positions (snippet.start_line + region.line)
   - Create `Decoration.mark()` with background color
4. Dispatch single transaction with all decorations

**Test:**
- Manual test: hardcode diff regions, verify decorations appear
- Verify decorations clear when called with empty array

---

### Step 3.2: Create decoration tracking by snippet

**File:** `src/snippetManager.ts`

Replace `textboxMap` with simpler per-snippet tracking:

```typescript
private snippetDecorations: Map<string, DecorationSet>;  // snippetId → decorations
```

**Test:**
- Apply decorations to snippet A
- Apply different decorations to snippet B
- Clear snippet A, verify B unchanged

---

## Phase 4: Integration

**Goal:** Wire up the new diff engine to the CodeMirror plugin.

### Step 4.1: Create `HighlightsManager` (replaces `TextboxesManager`)

**File:** `src/HighlightsManager.ts` (new file)

```typescript
export class HighlightsManager {
  constructor(
    private templatesManager: TemplatesManager,
    private snippetsManager: SnippetsManager
  ) {}

  /**
   * Called on every snippet edit. Recomputes all highlights.
   */
  onSnippetEdit(snippet: ISnippet): void {
    // 1. Get template
    // 2. Strip placeholders from template content
    // 3. Compute diffs
    // 4. If null (line count changed), unsync snippet and return
    // 5. Update template placeholders
    // 6. Apply decorations to this snippet
    // 7. Apply decorations to all other snippets of same template
  }
}
```

**Test:**
- Edit snippet, verify template `{{}}` markers appear
- Edit snippet, verify CodeMirror decorations appear
- Edit snippet back to match, verify highlights disappear
- Add line to snippet, verify auto-unsync

---

### Step 4.2: Update `CodeMirrorPlugin` to use `HighlightsManager`

**File:** `src/CodeMirrorPlugin.ts`

Replace calls to `textboxesManager.diffCheck()` and `textboxesManager.updateTextboxes()` with single call to `highlightsManager.onSnippetEdit()`.

**Test:**
- Full integration test: create template, drag to notebook, edit, see highlights

---

### Step 4.3: Update `index.ts` initialization

**File:** `src/index.ts`

- Create `HighlightsManager` instead of `TextboxesManager`
- Pass to `CodeMirrorPlugin`
- Pass to `LibraryWidget` if needed

**Test:**
- Extension loads without errors
- Basic functionality works

---

### Manual Testing Instructions

**Build and Run:**
```bash
jlpm build && jupyter lab
```

**Test Case 1: Basic Replacement Highlight**
1. Create a template with content: `df = pd.read_csv("data.csv")`
2. Drag the template into a notebook cell to create a snippet instance
3. Edit the snippet: change `"data.csv"` to `"sales.csv"`
4. **Expected:**
   - Console shows: `Applied 1 highlight(s) to snippet...`
   - `"sales.csv"` appears with a colored background highlight

**Test Case 2: Insertion Highlight**
1. Create a template: `print("hello")`
2. Drag to create snippet
3. Edit snippet to: `print("hello")  # comment`
4. **Expected:** `# comment` is highlighted (insertion)

**Test Case 3: Multiple Edits**
1. Create a template: `plt.plot(x, y, color="blue")`
2. Drag to create snippet
3. Edit snippet to: `plt.plot(a, b, color="red")`
4. **Expected:** Three separate highlights on `a`, `b`, and `red`

**Test Case 4: No Highlight When Matching**
1. Create a template and drag to create snippet
2. Make an edit, see highlight appear
3. Undo the edit (Ctrl+Z) or manually revert
4. **Expected:** Highlight disappears, console shows highlights cleared

**Test Case 5: Auto-Unsync on Line Count Change**
1. Create a template: `x = 1`
2. Drag to create snippet
3. Add a new line: `x = 1\ny = 2`
4. **Expected:**
   - Console shows: `Line count mismatch for snippet... - auto-unsyncing`
   - Snippet border decorations disappear (no longer linked)

**Debugging Tips:**
- Check browser console for `Applied X highlight(s)` messages
- Use CLI tool to verify expected DiffRegion output: `npm run diff:test -- test-cases/replacement.json`
- Both old (textbox) and new (diff-based) systems run in parallel until Phase 5 cleanup

---

## Phase 5: Cleanup

**Goal:** Remove old code.

### Step 5.1: Remove `ITextbox` from `ITemplate`

**File:** `src/types.ts`

Remove `textboxes: ITextbox[]` field from `ITemplate` interface.

**Note:** May need migration for existing saved templates. Either:
- Ignore the field if present (backwards compat)
- Or write migration to strip it

---

### Step 5.2: Delete `TextboxesManager.ts`

Or keep as reference and mark deprecated.

---

### Step 5.3: Clean up `SnippetsManager`

Remove:
- `textboxMap`
- Old `applyHighlights()` signature
- `removeTextboxDeco()`
- `removeSnippetTextboxDecos()`
- `validateHighlights()`

---

### Step 5.4: Clean up `TemplatesManager`

Remove:
- `removeTextboxDeco()` (marked as not working anyway)
- Any textbox-related methods

---

### Step 5.5: Update `LibraryWidget`

- Remove `textboxesManager` dependency if no longer needed
- `textboxEdited()` may need updates or removal

---

## Phase 6: Edge Cases & Polish

### Step 6.1: Handle sync operations

When `Synchronization.sync()` pushes template content to snippets:
- Skip diff checking during sync (use `syncFlag`)
- After sync completes, recompute highlights for all affected snippets

---

### Step 6.2: Handle template drops

When template is dragged into notebook:
- If template has `{{}}` markers, apply initial decorations to new snippet
- Snippet content will have the inner values (not the `{{}}`)

---

### Step 6.3: Handle template edits in library

When user edits template in library sidebar:
- Template content (with `{{}}`) is edited directly
- On save, recompute diffs for all snippet instances
- Update their decorations

---

## Testing Checklist

### Unit Tests
- [ ] `computeDiffs()` — all diff types
- [ ] `stripPlaceholders()` — various inputs
- [ ] `updateTemplatePlaceholders()` — add/remove/update markers
- [ ] `parsePlaceholders()` — position parsing

### Integration Tests
- [ ] Create template from selection
- [ ] Drag template to create snippet instance
- [ ] Edit snippet — replacement highlight appears
- [ ] Edit snippet — insertion highlight appears
- [ ] Edit snippet — deletion highlight appears (template side)
- [ ] Edit snippet back to match — highlights disappear
- [ ] Add line to snippet — auto-unsync triggers
- [ ] Multiple snippets of same template — all update
- [ ] Edit template in library — snippets update
- [ ] Sync snippet to template — all instances update
- [ ] Toggle highlight visibility — decorations show/hide

### Manual Tests
- [ ] Performance acceptable with rapid typing
- [ ] No console errors during normal usage
- [ ] Highlights visually correct (color, position)
- [ ] Library displays `{{}}` content correctly

---

## File Summary

| File | Action |
|------|--------|
| `src/types.ts` | Add `DiffRegion`, remove `textboxes` from `ITemplate` |
| `src/diffEngine.ts` | **New** — core diff logic |
| `src/HighlightsManager.ts` | **New** — orchestrates diff → highlight flow |
| `src/snippetManager.ts` | Simplify decoration handling |
| `src/CodeMirrorPlugin.ts` | Use `HighlightsManager` |
| `src/index.ts` | Update initialization |
| `src/TextboxesManager.ts` | **Delete** after migration |
| `src/TemplatesManager.ts` | Remove textbox methods |
| `src/LibraryWidget.tsx` | Minor updates |
| `src/__tests__/diffEngine.test.ts` | **New** — unit tests |

---

## Implementation Order

1. **Phase 1** — Get diff engine working with tests (no integration yet)
2. **Phase 2** — Template placeholder updates with tests
3. **Phase 3** — CodeMirror decoration application
4. **Phase 4** — Wire everything together
5. **Phase 5** — Remove old code
6. **Phase 6** — Edge cases and polish

Each phase should result in a working (if incomplete) system that can be tested independently.

---

## Extensibility Points

The architecture is designed to be modular so that rule changes are easy to implement. The key principle is **separation of diff detection from diff rendering**.

### Architecture Overview

```
Template Content  ──┐
                    ├──► computeDiffs() ──► DiffRegion[] ──┬──► updateTemplatePlaceholders()
Snippet Content   ──┘                                      │
                                                           ├──► applyDiffHighlights()
                                                           │
                                                           └──► (future: other consumers)
```

All highlight logic funnels through `computeDiffs()`, which returns a `DiffRegion[]`. Everything downstream just consumes that array. This means:

- **Diff detection** (Phase 1) can change without touching rendering
- **Diff rendering** (Phase 3) can change without touching detection
- **New consumers** can be added that read the same `DiffRegion[]`

### How to Change Rules

| Rule Change | Where to Modify |
|-------------|-----------------|
| Handle deleted lines (instead of auto-unsync) | Add `type` field to `DiffRegion`, update `computeDiffs()` to detect line deletions, update `applyDiffHighlights()` to render them |
| Don't merge adjacent diffs | Remove merge step in `computeDiffs()` |
| Show zero-width markers for insertions | Update `applyDiffHighlights()` to render a CodeMirror widget at empty ranges |
| Different colors for insert vs delete vs replace | Add `type` field to `DiffRegion`, use in decoration styling |
| Threshold for "too much divergence" | Add check in `computeDiffs()` or `HighlightsManager.onSnippetEdit()` |
| Ignore whitespace-only diffs | Filter results in `computeDiffs()` before returning |
| Line-level diff instead of word-level | Swap `diffWords` for `diffLines` in `computeDiffs()` |
| Custom diff algorithm | Replace jsdiff call in `computeDiffs()` with alternative |

### Example: Adding Line Deletion Support

If you later want to visually indicate when entire lines are deleted (instead of auto-unsync):

**Step 1:** Extend `DiffRegion` type:
```typescript
export interface DiffRegion {
  type: 'inline' | 'line-added' | 'line-deleted';  // new field
  line: number;
  // ... rest unchanged
}
```

**Step 2:** Update `computeDiffs()` to detect and return line-level changes instead of returning `null`.

**Step 3:** Update `applyDiffHighlights()` to handle the new types:
```typescript
for (const region of diffs) {
  if (region.type === 'line-deleted') {
    // render deletion marker (e.g., red strikethrough in template)
  } else if (region.type === 'line-added') {
    // render insertion marker (e.g., green highlight in snippet)
  } else {
    // existing inline highlight logic
  }
}
```

**Step 4:** Update `updateTemplatePlaceholders()` if template display needs to change.

The key is that each component has a single responsibility and communicates via the `DiffRegion[]` data structure.
