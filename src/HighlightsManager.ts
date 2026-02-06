/**
 * HighlightsManager.ts
 *
 * Orchestrates the diff-based highlight system. This class connects:
 * - diffEngine.ts (computes diffs between template and snippet)
 * - snippetManager.ts (applies decorations to the editor)
 *
 * Called on every snippet edit to recompute and apply highlights.
 */

import { computeDiffs, stripPlaceholders, updateTemplatePlaceholders } from './diffEngine';
import { SnippetsManager } from './snippetManager';
import { TemplatesManager } from './TemplatesManager';
import { DiffRegion, ISnippet } from './types';

export class HighlightsManager {
  private templatesManager: TemplatesManager;
  private snippetsManager: SnippetsManager;
  private isUpdating: boolean = false; // Guard against infinite loops

  constructor(
    templatesManager: TemplatesManager,
    snippetsManager: SnippetsManager
  ) {
    this.templatesManager = templatesManager;
    this.snippetsManager = snippetsManager;
  }

  private mergeDiffsForTemplate(
    cleanTemplateContent: string,
    diffsList: DiffRegion[][]
  ): DiffRegion[] {
    const templateLines = cleanTemplateContent.split('\n');
    const rangesByLine = new Map<number, { from: number; to: number }[]>();
    const insertionsByLine = new Map<number, Set<number>>();

    for (const diffs of diffsList) {
      for (const diff of diffs) {
        const { line, templateFrom, templateTo, templateContent } = diff;

        if (templateFrom === templateTo && templateContent.length === 0) {
          if (!insertionsByLine.has(line)) {
            insertionsByLine.set(line, new Set());
          }
          insertionsByLine.get(line)!.add(templateFrom);
          continue;
        }

        if (!rangesByLine.has(line)) {
          rangesByLine.set(line, []);
        }
        rangesByLine.get(line)!.push({ from: templateFrom, to: templateTo });
      }
    }

    const merged: DiffRegion[] = [];

    for (const [line, ranges] of rangesByLine.entries()) {
      const lineText = templateLines[line] ?? '';
      const sorted = ranges
        .map(r => ({
          from: Math.max(0, Math.min(r.from, lineText.length)),
          to: Math.max(0, Math.min(r.to, lineText.length))
        }))
        .sort((a, b) => a.from - b.from);

      const mergedRanges: { from: number; to: number }[] = [];
      for (const range of sorted) {
        const last = mergedRanges[mergedRanges.length - 1];
        if (!last || range.from > last.to) {
          mergedRanges.push({ ...range });
        } else {
          last.to = Math.max(last.to, range.to);
        }
      }

      for (const range of mergedRanges) {
        if (range.from === range.to) continue;
        merged.push({
          line,
          templateFrom: range.from,
          templateTo: range.to,
          templateContent: lineText.slice(range.from, range.to),
          snippetFrom: range.from,
          snippetTo: range.to,
          snippetContent: ''
        });
      }

      const insertionPoints = insertionsByLine.get(line);
      if (insertionPoints && insertionPoints.size > 0) {
        for (const point of insertionPoints) {
          const isInsideRange = mergedRanges.some(
            range => point >= range.from && point <= range.to
          );
          if (isInsideRange) {
            continue;
          }
          const clampedPoint = Math.max(0, Math.min(point, lineText.length));
          merged.push({
            line,
            templateFrom: clampedPoint,
            templateTo: clampedPoint,
            templateContent: '',
            snippetFrom: clampedPoint,
            snippetTo: clampedPoint,
            snippetContent: ''
          });
        }
      }
    }

    for (const [line, points] of insertionsByLine.entries()) {
      if (rangesByLine.has(line)) continue;
      const lineText = templateLines[line] ?? '';
      for (const point of points) {
        const clampedPoint = Math.max(0, Math.min(point, lineText.length));
        merged.push({
          line,
          templateFrom: clampedPoint,
          templateTo: clampedPoint,
          templateContent: '',
          snippetFrom: clampedPoint,
          snippetTo: clampedPoint,
          snippetContent: ''
        });
      }
    }

    return merged.sort((a, b) =>
      a.line === b.line ? a.templateFrom - b.templateFrom : a.line - b.line
    );
  }

  /**
   * Called on every snippet edit. Recomputes all highlights for the snippet.
   *
   * @param snippet - The snippet that was edited
   */
  onSnippetEdit(snippet: ISnippet): void {
    // Guard against infinite loops
    if (this.isUpdating) {
      return;
    }

    // 1. Get the template
    const template = this.templatesManager.get(snippet.template_id);
    if (!template) {
      console.warn(
        `Template ${snippet.template_id} not found for snippet ${snippet.id}`
      );
      return;
    }

    // 2. Strip placeholders from template content to get clean content
    const cleanTemplateContent = stripPlaceholders(template.content);

    // 3. Compute diffs between clean template and snippet content
    const diffs = computeDiffs(cleanTemplateContent, snippet.content);

    // 4. If null (line count changed), unsync the snippet
    if (diffs === null) {
      console.log(
        `Line count mismatch for snippet ${snippet.id} - auto-unsyncing`
      );
      // Defer to next frame to avoid "dispatch during update" error
      requestAnimationFrame(() => {
        this.snippetsManager.unsync(snippet.id);
      });
      return;
    }

    // 5. If no diffs for this snippet, just clear its highlights
    if (diffs.length === 0) {
      this.snippetsManager.clearSnippetHighlights(snippet.id);
    } else {
      // 6. Apply highlights based on diff regions
      this.snippetsManager.applyDiffHighlights(snippet, diffs, template.color);
    }

    // 7. Update template content with {{}} placeholders based on all snippets
    this.isUpdating = true;
    try {
      const snippets = this.snippetsManager.getSnippets(template.id);
      const allDiffs: DiffRegion[][] = [];

      for (const instance of snippets) {
        const instanceDiffs = computeDiffs(cleanTemplateContent, instance.content);
        if (instanceDiffs === null) {
          requestAnimationFrame(() => {
            this.snippetsManager.unsync(instance.id);
          });
          continue;
        }
        allDiffs.push(instanceDiffs);
      }

      const hasAnyDiffs = allDiffs.some(diffsForSnippet => diffsForSnippet.length > 0);

      const updatedTemplateContent = hasAnyDiffs
        ? updateTemplatePlaceholders(
            cleanTemplateContent,
            this.mergeDiffsForTemplate(cleanTemplateContent, allDiffs)
          )
        : cleanTemplateContent;
      if (updatedTemplateContent !== template.content) {
        this.templatesManager.edit(template.id, updatedTemplateContent);
        // Notify LibraryWidget to refresh
        document.dispatchEvent(new CustomEvent('updateLibrary', {
          detail: { value: updatedTemplateContent }
        }));
        console.log(`Updated template ${template.id} with placeholders`);
      }
    } finally {
      this.isUpdating = false;
    }

    // Debug logging
    console.log(`Applied ${diffs.length} highlight(s) to snippet ${snippet.id}`);
  }

  /**
   * Recomputes highlights for all snippets of a given template.
   * Useful when template content changes.
   *
   * @param templateId - The ID of the template
   */
  refreshTemplateHighlights(templateId: string): void {
    const snippets = this.snippetsManager.getSnippets(templateId);
    for (const snippet of snippets) {
      this.onSnippetEdit(snippet);
    }
  }

  /**
   * Clears all highlights for all snippets of a given template.
   *
   * @param templateId - The ID of the template
   */
  clearTemplateHighlights(templateId: string): void {
    const snippets = this.snippetsManager.getSnippets(templateId);
    for (const snippet of snippets) {
      this.snippetsManager.clearSnippetHighlights(snippet.id);
    }
  }
}
