# Aspen - Design Document

## 1. What is Aspen?

Aspen is a JupyterLab extension for managing code clones in computational notebooks. Rather than discouraging copy-paste (which is natural and often appropriate in data science workflows), Aspen helps users **track, customize, and synchronize** duplicated code.

Users save code snippets as **templates**, reuse them as **snippet instances**, and Aspen keeps everything linked. When instances diverge from their template, Aspen highlights the differences visually, making it clear which parts of reused code have been customized.

---

## 2. Core Concepts

### Templates

A **template** is a saved, reusable code snippet stored in the library sidebar. Templates are created by highlighting code in a notebook cell and saving it via the context menu. Each template has:

- A unique ID, name, and color
- The saved code content
- A list of associated highlights (diff markers / parameters)
- Metadata (creation date, last updated, tags)

Templates are persisted as individual JSON files in the `/snippets/` directory.

### Snippet Instances

A **snippet instance** is a copy of a template that has been inserted into a notebook. Instances are created by:

- Dragging a template from the library sidebar into a notebook cell
- Copy-pasting a template

Each instance is linked back to its parent template via `template_id` and tracks its position in the notebook (cell ID, start/end lines). Instances behave like normal notebook code but retain awareness of their origin.

### Highlights

When a snippet instance diverges from its template (e.g., a user changes a variable name or file path), Aspen detects the differences and marks them visually using colored inline highlights in the editor. These highlights appear in both the template (in the library sidebar) and across all linked instances.

Highlights serve two purposes:

1. **Visual indicators** — they show users exactly where code has diverged across instances, making it easy to spot which parts of reused code are acting as de facto parameters.
2. **Parameterization cues** — if a user later wants to refactor a template into a function, the highlights make it clear which parts should become function parameters.

In the template's stored content, highlighted regions are represented as `{{content}}` placeholders. In the library sidebar, these render as styled input boxes. In the editor, they appear as colored background marks.

> **See [DIFFS.md](./DIFFS.md) for the complete highlight system specification**, including rules, edge cases, and examples.

---

## 3. Key Behaviors

### Creating a Template

1. User highlights code in a notebook cell.
2. User right-clicks and selects "Save Code Snippet" from the context menu.
3. User is prompted to name the template.
4. The template is saved to `/snippets/{name}.json` and appears in the library sidebar.
5. A random color is assigned for visual identification.

### Creating a Snippet Instance

1. User drags a template from the library sidebar into a notebook cell (or copy-pastes it).
2. A snippet instance is created and tracked by `SnippetsManager`.
3. A colored border (using the template's color) appears around the instance in the editor.
4. If the template already has `{{}}` placeholders (from prior diffs), the instance is inserted with those regions ready for customization.

### Diff Detection and Highlighting

Diff detection runs in real-time on every edit using jsdiff (word-level). The system treats highlights as **range markers** — it doesn't classify edits as insertions/deletions/replacements, it just tracks where divergence exists.

**Key rules:**
- Line structure must match — if line count changes, auto-unsync the instance
- Each diff region creates a highlight pair (one in instance, one in template) linked via `sharedId`
- Empty ranges show nothing (no zero-width markers)
- Adjacent diff regions merge into a single highlight
- Template shows "this region varies" without displaying all variant values
- Highlights disappear when content matches again

**Implementation flow:**
1. User edits a snippet instance
2. `CodeMirrorPlugin` detects the document change
3. `TextboxesManager.diffCheck()` runs jsdiff comparing instance content to template content
4. For each diff region, a highlight pair is created/updated
5. Highlights are rendered as CodeMirror `Decoration.mark()` with a semi-transparent background derived from the template's color

> **See [DIFFS.md](./DIFFS.md) for the complete specification** with all rules, cases, and examples.

### Synchronization

There are two directions of synchronization:

**Template → Instances (Push Down)**
When a template is edited in the library sidebar, the changes propagate to all linked snippet instances. This is triggered via the context menu "Push changes to template" action or through the library edit UI. The `Synchronization` manager coordinates updates through `SnippetsManager.editAll()`.

**Instance → Template (Push Up)**
When a user wants a specific instance to become the new canonical version, they can sync it upward. This overwrites the template and all linked instances with the chosen instance's content, removing all highlights as a side effect (since everything is now identical).

**During sync operations**, diff checking is temporarily disabled via a `syncFlag` to prevent false diff detection from the propagated edits.

### Unsyncing an Instance

If an instance has diverged too far from its template and the user no longer wants it linked, they can unsync it via the context menu. This severs the link, removes all highlight decorations, and the code becomes regular notebook code with no template awareness.

### Toggling Highlight Visibility

Users can toggle the visibility of snippet instance borders (the colored outlines around instances in the editor) per-template via the library sidebar. This is controlled by an `activeHighlights` set in `TemplatesManager`.

---

## 4. Architecture

### Component Overview

```
┌──────────────────────────────────────────────────────────┐
│                     index.ts (Entry Point)                │
│  - Plugin registration and activation                     │
│  - Command registration (create, push, unsync)            │
│  - Context menu items                                     │
│  - CodeMirror extension registration                      │
│  - Cell ID attribution                                    │
└────────────┬──────────────────────────────────────────────┘
             │ initializes
             ▼
┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐
│TemplatesManager │  │ SnippetsManager  │  │ TextboxesManager  │
│                 │  │                  │  │                   │
│- CRUD templates │  │- Track instances │  │- Diff detection   │
│- File I/O       │  │- Cell/view map   │  │- Highlight create │
│- Color mgmt     │  │- Decorations     │  │- Position tracking│
│- Highlight toggle│ │- Highlight apply │  │- Placeholder mgmt │
└────────┬────────┘  └────────┬─────────┘  └─────────┬─────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Synchronization                           │
│  - Coordinates template ↔ instance sync                     │
│  - syncFlag to prevent diff loops                           │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────────────────────┐
│  LibraryWidget   │     │       CodeMirrorPlugin           │
│  (React sidebar) │     │                                  │
│                  │     │  - Drop/paste event handling      │
│- Template list   │     │  - Document change detection     │
│- Inline editing  │     │  - Triggers diff checks          │
│- Drag source     │     │  - Decoration management         │
│- Highlight render│     │  - Snippet position updates      │
└──────────────────┘     └──────────────────────────────────┘
```

> **Note on naming:** The codebase currently uses `TextboxesManager`, `ITextbox`, `textboxStateField`, etc. internally. These names predate the decision to use inline highlights instead of fillable text inputs. The canonical term in this document and going forward is **"highlight"**. A future code rename is desirable but not blocking.

### Data Flow

1. **Template creation**: User action → `index.ts` command → `TemplatesManager.create()` → JSON file saved → `LibraryWidget` updated via custom event
2. **Instance creation**: Drag/drop or paste → `CodeMirrorPlugin` handles event → `SnippetsManager.create()` → Decorations applied
3. **Diff detection**: User edits instance → `CodeMirrorPlugin.update()` → `TextboxesManager.diffCheck()` → Highlights created → Applied via `SnippetsManager.applyHighlights()`
4. **Sync (push down)**: Library edit → `LibraryWidget.syncTemplate()` → `Synchronization.sync()` → `SnippetsManager.editAll()` → All instances updated
5. **Sync (push up)**: Context menu action → `Synchronization.sync(pushFromInstance=true)` → Template overwritten → All instances unified

### Storage

- **Templates**: JSON files in `/snippets/` directory, read/written via JupyterLab's `ContentsManager` API
- **Snippet instances**: In-memory only (`SnippetsManager.snippetTracker[]`), not persisted across sessions
- **Highlights**: Stored as part of `ITemplate.textboxes[]` array (legacy name), covering both template-level and instance-level highlights
- **Cell-to-EditorView mapping**: In-memory `Map<string, EditorView>` for accessing editor instances

### Key Dependencies

- `@jupyterlab/application` (v4.3.5) — JupyterLab plugin framework
- `@codemirror/state`, `@codemirror/view` — Editor state and decoration management
- `diff` (v8.0.2) — Word-level diff algorithm
- `@lumino/widgets` — Widget framework for sidebar
- React — Library sidebar UI

---

## 5. Type Definitions

### ITemplate
| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (timestamp-based) |
| `name` | `string` | User-assigned name |
| `content` | `string` | Template code, with `{{}}` placeholders for diffs |
| `dateCreated` | `string` | ISO timestamp |
| `dateUpdated` | `string` | ISO timestamp |
| `tags` | `string[]` | User tags (unused currently) |
| `color` | `string` | Hex color for visual identification |
| `textboxes` | `ITextbox[]` | All highlights for this template (legacy field name) |

### ISnippet
| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique identifier |
| `notebook_id` | `string` | ID of the containing notebook |
| `cell_id` | `string` | ID of the containing cell |
| `content` | `string` | Current instance content |
| `start_line` | `number` | Start line in the cell |
| `end_line` | `number` | End line in the cell |
| `template_id` | `string` | ID of the parent template |

### ITextbox (represents a Highlight)
| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Unique identifier |
| `content` | `string` | The differing text |
| `line` | `number` | Line number within the snippet/template |
| `from` | `number` | Start character offset on the line |
| `to` | `number` | End character offset on the line |
| `templateId` | `string` | Parent template ID |
| `snippetId` | `number \| undefined` | Associated snippet (undefined = template-level) |
| `sharedId` | `number` | Links corresponding highlights across template and instances |

---

## 6. Current Status

### Working

- Template CRUD (create, read, update, delete, rename)
- Library sidebar with template list, inline editing, drag-and-drop
- Snippet instance creation via drag-and-drop and copy-paste
- Snippet instance tracking with colored border decorations
- Synchronization: push template changes down to all instances
- Synchronization: push instance content up to overwrite template
- Unsyncing instances
- Highlight toggling per template
- Context menu integration (save, push, unsync)

### Broken / In Progress

- **Diff detection and visual highlights** — The core `diffCheck` logic and highlight decoration system exist but are unreliable. Known issues:
  - `TemplatesManager.removeTextboxDeco()` is marked as "TODO: NOT WORKING"
  - Highlight position tracking drifts as users edit content
  - Merging adjacent highlights and handling edge cases (empty highlights, multi-line diffs) is fragile
  - The interplay between `diffCheck`, `updateTextboxes`, and CodeMirror's decoration dispatch has race conditions and inconsistent state
- **Template highlight editing in the library** — The `textboxEdited()` flow for handling edits to `{{}}` regions in the sidebar has partial implementation with comments indicating unfinished cases (mass update, default parameters)
- **`visual-diffs/` directory** — Empty, suggesting planned but unstarted work on a dedicated diff visualization component
- **`Button.ts` (Propagate button)** — Exists as a CodeMirror widget but is not integrated into the current UI
- **Snippet persistence** — Snippet instances are tracked in-memory only and are lost on page reload

---

## 7. Terminology Reference

| Term | Aliases (legacy) | Meaning |
|------|-------------------|---------|
| **Template** | Snippet, code snippet | A saved reusable code block in the library |
| **Snippet Instance** | Instance, clone | A copy of a template inserted into a notebook |
| **Highlight** | Textbox, visual diff, diff highlight, delta | A marked region showing where an instance differs from its template |
| **Push down** | Sync from template, propagate | Updating all instances to match the template |
| **Push up** | Sync from instance, universal sync | Overwriting the template with an instance's content |
| **Unsync** | Unlink, sever | Removing the link between an instance and its template |
