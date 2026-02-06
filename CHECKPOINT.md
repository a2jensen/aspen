# Implementation Checkpoint

**Date:** 2026-02-04
**Status:** Phase 1-4 complete. Phase 5 cleanup in progress; legacy textbox system removed.

---

## Current Status

Phases 1, 3, and 4 are **complete and working** for single snippets.
Phase 2 (template placeholder updates) has been refactored to use **merged diffs across snippets**. Infinite loop resolved; last-placeholder issue fixed.
Phase 5 cleanup is underway, removing the legacy textbox system in favor of diff-based highlights.

---

## Completed Work

### Phase 1: Diff Engine ✅
- **File:** `src/diffEngine.ts`
- `computeDiffs()` - compares template vs snippet, returns `DiffRegion[]` or `null` for line mismatch
- `stripPlaceholders()` - removes `{{}}` markers from template content
- `parsePlaceholders()` - finds `{{}}` marker positions
- `updateTemplatePlaceholders()` - adds `{{}}` markers based on diffs
- `computeDiffsFromTemplate()` - convenience wrapper

### Phase 3: CodeMirror Decoration Application ✅
- **File:** `src/snippetManager.ts`
- Added `applyDiffHighlights()` - applies background highlights to snippet based on `DiffRegion[]`
- Added `clearSnippetHighlights()` - removes highlights from a snippet
- Added `snippetDecorations: Map<string, DecorationSet>` for tracking
- Uses `requestAnimationFrame()` to avoid "dispatch during update" errors

### Phase 4: Integration ✅
- **File:** `src/HighlightsManager.ts` (new)
- Orchestrates diff computation and highlight application
- Called from `CodeMirrorPlugin.ts` on every snippet edit
- **File:** `src/CodeMirrorPlugin.ts`
- Disabled old textbox system calls (commented out)
- Added `highlightsManager.onSnippetEdit(snippet)` call
- Removed whitespace check that was preventing line-count detection

### Phase 2: Template Placeholder Updates ✅
- Placeholder updates now computed from **merged diffs across all snippets**
- LibraryWidget is notified via `'updateLibrary'` event

### Phase 5: Cleanup (In Progress) ⚠️
- Removed `TextboxesManager` usage and deleted `src/TextboxesManager.ts`
- Removed `textboxes` field from `ITemplate` and `ITextbox` types
- Library template editing now syncs snippets using placeholder-stripped content

### CLI Testing Tool ✅
- **Files:** `src/cli/diffTester.ts`, `src/cli/formatOutput.ts`, `src/cli/types.ts`
- **Test cases:** `test-cases/*.json`
- Run with: `npx tsx src/cli/diffTester.ts test-cases/replacement.json`

---

## Current Issues

### 1. Cleanup Gaps 🔴
**Symptom:** Remaining references to legacy textbox system should be removed or renamed (e.g., `textboxStateField` naming).
**Next action:** Complete Phase 5 cleanup passes and update documentation accordingly.

---

## Working Features (Single Snippet)

1. ✅ Snippet highlights when content diverges from template
2. ✅ Highlights clear when content matches template again
3. ✅ Auto-unsync when line count changes (press Enter)
4. ✅ Template shows `{{}}` markers when snippet diverges
5. ✅ Multiple edits on same line show multiple highlights

## Not Working (Multiple Snippets)

None currently observed after merged-diff and placeholder cleanup.

---

## File Changes Summary

| File | Status | Changes |
|------|--------|---------|
| `src/diffEngine.ts` | ✅ | Core diff logic, placeholder functions |
| `src/HighlightsManager.ts` | ✅ | Orchestrates diff highlights with merged placeholder updates |
| `src/TextboxesManager.ts` | ✅ | Deleted (legacy system removed) |
| `src/snippetManager.ts` | ✅ | `applyDiffHighlights()`, `clearSnippetHighlights()` |
| `src/CodeMirrorPlugin.ts` | ✅ | Disabled old textbox calls, integrated HighlightsManager |
| `src/index.ts` | ✅ | Added HighlightsManager initialization |
| `src/types.ts` | ✅ | Added `DiffRegion`, `PlaceholderPosition` interfaces |
| `src/cli/` | ✅ | CLI testing tool for diff engine |
| `test-cases/` | ✅ | JSON test cases for CLI tool |

---

## Quick Fix to Disable Template Updates

To temporarily disable template placeholder updates and just have snippet-side highlights (which work fine):

In `src/HighlightsManager.ts`, comment out lines 71-85:

```typescript
// 7. Update template content with {{}} placeholders around diff regions
// this.isUpdating = true;
// try {
//   const updatedTemplateContent = updateTemplatePlaceholders(template.content, diffs);
//   if (updatedTemplateContent !== template.content) {
//     this.templatesManager.edit(template.id, updatedTemplateContent);
//     document.dispatchEvent(new CustomEvent('updateLibrary', {
//       detail: { value: updatedTemplateContent }
//     }));
//     console.log(`Updated template ${template.id} with placeholders`);
//   }
// } finally {
//   this.isUpdating = false;
// }
```

This gives working snippet-side highlights without the infinite loop.

---

## Next Steps

1. **Debug infinite loop:**
   - Add logging to trace exact call chain
   - Check LibraryWidget's `handleUpdateLibrary` method
   - Consider per-template or per-update-cycle guards instead of simple boolean

2. **Alternative approaches:**
   - Debounce template updates (e.g., only update after 500ms of no edits)
   - Only update template on explicit user action (not automatic)
   - Use a Set to track processed snippets per update cycle

3. **Phase 5 (after bugs fixed):**
   - Remove old TextboxesManager code entirely
   - Clean up unused imports and methods

---

## Test Commands

```bash
# Build and run JupyterLab
jlpm build && jupyter lab

# Run CLI diff tester
npx tsx src/cli/diffTester.ts test-cases/replacement.json

# Run all test cases
npx tsx src/cli/diffTester.ts test-cases/
```

## Manual Testing (Phase 5)

1. Save selection as template: highlight code → "Save Code Snippet"
2. Expected: selected code becomes a snippet instance with border immediately
3. Toggle template border off/on
4. Expected: borders hide/show instantly without editing

1. Drag template into notebook to create instance
2. Expected: border appears immediately
3. Edit within snippet
4. Expected: diff highlights appear

1. Template: `df = pd.read_csv("data.csv")`
2. Instance: change to `"sales.csv"`
3. Expected: highlight on `"sales.csv"`; template shows `{{data.csv}}`

1. Template: `print("hello")`
2. Instance: `print("hello")  # comment`
3. Expected: comment highlighted; template shows `print("hello"){{}}`
4. Delete comment
5. Expected: highlight removed; placeholder removed

1. Template:
   ```
   x = 1
   y = 1
   ```
2. Create two instances
3. Snippet A: `x = 2`, Snippet B: `y = 3`
4. Expected: template shows placeholders for both `x` and `y`
5. Revert B then A back to original
6. Expected: all placeholders gone

1. Add a new line inside a snippet
2. Expected: auto-unsync triggers (border removed, no highlights)

1. Edit template text in sidebar
2. Expected: all instances update immediately

---

## Key Files to Review

- `src/HighlightsManager.ts` - Main orchestration for diff highlights
- `src/CodeMirrorPlugin.ts` - Integration point, lines 248-255
- `src/LibraryWidget.tsx` - Template edit + sync behavior
- `src/diffEngine.ts` - Core logic, works correctly
