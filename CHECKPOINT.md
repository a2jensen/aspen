# Implementation Checkpoint

**Date:** 2026-02-04
**Status:** Phase 1-4 complete. Placeholder updates now use merged diffs; remaining bug with last placeholder not clearing.

---

## Current Status

Phases 1, 3, and 4 are **complete and working** for single snippets.
Phase 2 (template placeholder updates) has been refactored to use **merged diffs across snippets**. Infinite loop resolved, but a **last-placeholder not clearing** bug remains.

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

### Phase 2: Template Placeholder Updates ⚠️ (Has Bug)
- Placeholder updates now computed from **merged diffs across all snippets**
- LibraryWidget is notified via `'updateLibrary'` event
- **BUG:** When all snippets revert to match, the last placeholder sometimes remains

### CLI Testing Tool ✅
- **Files:** `src/cli/diffTester.ts`, `src/cli/formatOutput.ts`, `src/cli/types.ts`
- **Test cases:** `test-cases/*.json`
- Run with: `npx tsx src/cli/diffTester.ts test-cases/replacement.json`

---

## Current Issues

### 1. Last Placeholder Not Clearing 🔴
**Symptom:** With multiple snippets, after reverting all to match the template, one final placeholder remains in the template.
**Repro:** Template `x = 1\ny = 1`, Snippet A -> `x = 2`, Snippet B -> `y = 3`, then revert B then A. After last revert, one `{{}}` persists.
**Suspected causes:**
1. Merged diff computation leaves a stale region when diffs drop to zero
2. Placeholder updates still using stale template content or positions

---

## Working Features (Single Snippet)

1. ✅ Snippet highlights when content diverges from template
2. ✅ Highlights clear when content matches template again
3. ✅ Auto-unsync when line count changes (press Enter)
4. ✅ Template shows `{{}}` markers when snippet diverges
5. ✅ Multiple edits on same line show multiple highlights

## Not Working (Multiple Snippets)

1. 🔴 Template `{{}}` markers sometimes do not auto-clear when all snippets match (last placeholder persists)

---

## File Changes Summary

| File | Status | Changes |
|------|--------|---------|
| `src/diffEngine.ts` | ✅ | Core diff logic, placeholder functions |
| `src/HighlightsManager.ts` | ⚠️ | Orchestrates highlights, has infinite loop bug |
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

---

## Key Files to Review

- `src/HighlightsManager.ts` - Main orchestration, has the bug
- `src/CodeMirrorPlugin.ts` - Integration point, lines 248-255
- `src/LibraryWidget.tsx` - Check `handleUpdateLibrary` method
- `src/diffEngine.ts` - Core logic, works correctly
