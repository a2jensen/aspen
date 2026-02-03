# Implementation Checkpoint

**Date:** 2026-02-02
**Branch:** `user-study`

---

## Current Status

Phase 1 and 2 of the diff/highlight system rewrite are **complete**.

### Completed Work

#### Phase 1: Types ✅
- Added `DiffRegion` interface to `src/types.ts`
- Added `PlaceholderPosition` interface to `src/types.ts`

```typescript
export interface DiffRegion {
  line: number;
  templateFrom: number;
  templateTo: number;
  templateContent: string;
  snippetFrom: number;
  snippetTo: number;
  snippetContent: string;
}

export interface PlaceholderPosition {
  line: number;
  from: number;
  to: number;
  content: string;
}
```

#### Phase 2: Core Diff Logic ✅
- Created `src/diffEngine.ts` with pure functions (no side effects)
- Created `src/__tests__/diffEngine.spec.ts` with 31 unit tests

**Functions implemented:**
| Function | Purpose |
|----------|---------|
| `stripPlaceholders(content)` | Removes `{{}}` markers, keeps inner text |
| `parsePlaceholders(content)` | Finds all `{{}}` positions in content |
| `computeDiffs(template, snippet)` | Returns `DiffRegion[]` or `null` if line counts differ |
| `updateTemplatePlaceholders(template, diffs)` | Adds/updates `{{}}` markers based on diffs |
| `computeDiffsFromTemplate(template, snippet)` | Convenience wrapper (strips + computes) |

**Test results:** 31 passing tests

---

## Remaining Phases

### Phase 3: CodeMirror Decoration Application
- Create `highlightDecorations.ts`
- Build CodeMirror `Decoration.mark()` ranges from `DiffRegion[]`
- Handle template-side (from `{{}}` markers) and snippet-side (from diffs)

### Phase 4: Integration (HighlightsManager)
- Create new `HighlightsManager` class
- Wire up to `CodeMirrorPlugin`
- Call diff engine on every edit
- Apply decorations to editor

### Phase 5: Cleanup
- Remove old `TextboxesManager.ts`
- Remove old textbox-related code from `CodeMirrorPlugin.ts`
- Update any imports/references

### Phase 6: Edge Cases & Polish
- Test with real notebooks
- Handle edge cases (empty cells, rapid edits, etc.)
- Performance profiling if needed

---

## Key Design Decisions

1. **Highlights are range markers** - they mark regions, not classify content
2. **Line structure must match** - different line counts → auto-unsync
3. **Diff runs on every edit** - no debouncing, immediate feedback
4. **Empty ranges show nothing** - `from === to` means no visual marker
5. **Adjacent highlights merge** - consecutive diff regions combine
6. **Template shows "region varies"** - not all variant values

---

## Files Modified/Created

| File | Status |
|------|--------|
| `src/types.ts` | Modified (added interfaces) |
| `src/diffEngine.ts` | Created |
| `src/__tests__/diffEngine.spec.ts` | Created |
| `TESTING.md` | Created |
| `IMPLEMENTATION_PLAN.md` | Created |
| `DESIGN.md` | Modified |
| `DIFFS.md` | Modified |
| `package.json` | Modified (added test scripts) |

---

## How to Run Tests

```bash
# Run all diff engine tests
npm run test:unit -- src/__tests__/diffEngine.spec.ts

# Run with verbose debug output (shows Input/Expected/Actual)
npm run test:debug -- src/__tests__/diffEngine.spec.ts

# Run all tests with coverage
npm run test
```

---

## Next Steps

When resuming, start with **Phase 3: CodeMirror Decoration Application**.

Reference documents:
- `IMPLEMENTATION_PLAN.md` - Full 6-phase plan with details
- `DIFFS.md` - Highlight system rules and cases
- `DESIGN.md` - Overall architecture
- `TESTING.md` - Testing guide
