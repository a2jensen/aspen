# Implementation Checkpoint

**Date:** 2026-02-04
**Status:** Phase 1-4 complete, Phase 2 template updates have infinite loop bug

---

## Current Status

Phases 1, 3, and 4 are **complete and working** for single snippets.
Phase 2 (template placeholder updates) has an **infinite loop bug** with multiple snippets.

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
- `updateTemplatePlaceholders()` is called when snippets diverge
- LibraryWidget is notified via `'updateLibrary'` event
- **BUG:** Infinite loop occurs when multiple snippets exist

### CLI Testing Tool ✅
- **Files:** `src/cli/diffTester.ts`, `src/cli/formatOutput.ts`, `src/cli/types.ts`
- **Test cases:** `test-cases/*.json`
- Run with: `npx tsx src/cli/diffTester.ts test-cases/replacement.json`

---

## Current Issues

### 1. Infinite Loop Bug 🔴
**Symptom:** Console shows thousands of "Applied X highlight(s)" messages when multiple snippets exist
**Location:** Triggered from `HighlightsManager.ts` → template update → something re-triggers edit

**Attempted fix:** Added `isUpdating` guard flag - didn't fully resolve

**Suspected causes:**
1. `updateLibrary` event may trigger something that re-processes snippets
2. Multiple snippets each trigger the logic separately
3. Template content change may cause cascade

**Investigation needed:**
- Trace full call chain when infinite loop occurs
- Check if LibraryWidget's `handleUpdateLibrary` triggers CodeMirror updates
- Consider debouncing or batching template updates

### 2. Competing Snippets (Partially Fixed)
- ✅ Fixed: Snippet B no longer clears template placeholders when it matches
- ❓ Template placeholders now persist even when all snippets match again

---

## Working Features (Single Snippet)

1. ✅ Snippet highlights when content diverges from template
2. ✅ Highlights clear when content matches template again
3. ✅ Auto-unsync when line count changes (press Enter)
4. ✅ Template shows `{{}}` markers when snippet diverges
5. ✅ Multiple edits on same line show multiple highlights

## Not Working (Multiple Snippets)

1. 🔴 Multiple snippets cause infinite loop
2. ⚠️ Template `{{}}` markers don't auto-clear when all snippets match

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
