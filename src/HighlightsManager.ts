/**
 * HighlightsManager.ts
 *
 * Orchestrates the diff-based highlight system. This class connects:
 * - diffEngine.ts (computes diffs between template and snippet)
 * - snippetManager.ts (applies decorations to the editor)
 *
 * Called on every snippet edit to recompute and apply highlights.
 */

import { computeDiffs, stripPlaceholders } from './diffEngine';
import { SnippetsManager } from './snippetManager';
import { TemplatesManager } from './TemplatesManager';
import { ISnippet } from './types';

export class HighlightsManager {
  private templatesManager: TemplatesManager;
  private snippetsManager: SnippetsManager;

  constructor(
    templatesManager: TemplatesManager,
    snippetsManager: SnippetsManager
  ) {
    this.templatesManager = templatesManager;
    this.snippetsManager = snippetsManager;
  }

  /**
   * Called on every snippet edit. Recomputes all highlights for the snippet.
   *
   * @param snippet - The snippet that was edited
   */
  onSnippetEdit(snippet: ISnippet): void {
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

    // 5. If no diffs, clear highlights
    if (diffs.length === 0) {
      this.snippetsManager.clearSnippetHighlights(snippet.id);
      return;
    }

    // 6. Apply highlights based on diff regions
    this.snippetsManager.applyDiffHighlights(snippet, diffs, template.color);

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
