/**
 * diffEngine.ts
 *
 * Core diff logic for the highlight system. This module is responsible for:
 * 1. Comparing template content against snippet content
 * 2. Identifying diff regions (replacements, insertions, deletions)
 * 3. Managing {{}} placeholder markers in template content
 *
 * This module contains pure functions with no side effects — it doesn't
 * touch CodeMirror, the DOM, or any external state.
 */

import { diffWords } from 'diff';
import { DiffRegion, PlaceholderPosition } from './types';

/**
 * Removes {{}} markers from template content, keeping the inner content.
 *
 * Example: "df = pd.read_csv("{{data.csv}}")" → "df = pd.read_csv("data.csv")"
 *
 * @param content - Template content with {{}} markers
 * @returns Content with markers removed but inner text preserved
 */
export function stripPlaceholders(content: string): string {
  return content.replace(/\{\{(.*?)\}\}/g, '$1');
}

/**
 * Finds all {{}} placeholder markers in template content.
 *
 * @param content - Template content to parse
 * @returns Array of placeholder positions with their content
 */
export function parsePlaceholders(content: string): PlaceholderPosition[] {
  const results: PlaceholderPosition[] = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const regex = /\{\{(.*?)\}\}/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      results.push({
        line: lineIndex,
        from: match.index,
        to: match.index + match[0].length,
        content: match[1]
      });
    }
  }

  return results;
}

/**
 * Merges adjacent diff regions on the same line into a single region.
 * Two regions are considered adjacent if there are no characters between them.
 *
 * @param regions - Array of diff regions (must be sorted by line, then by position)
 * @returns Array with adjacent regions merged
 */
function mergeAdjacentRegions(regions: DiffRegion[]): DiffRegion[] {
  if (regions.length === 0) return [];

  const merged: DiffRegion[] = [];
  let current = { ...regions[0] };

  for (let i = 1; i < regions.length; i++) {
    const next = regions[i];

    // Check if on same line and adjacent (template positions touch)
    if (
      next.line === current.line &&
      next.templateFrom <= current.templateTo
    ) {
      // Merge: extend current region to include next
      current.templateTo = Math.max(current.templateTo, next.templateTo);
      current.templateContent += next.templateContent;
      current.snippetTo = Math.max(current.snippetTo, next.snippetTo);
      current.snippetContent += next.snippetContent;
    } else {
      // Not adjacent, push current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Compares clean template content against snippet content and returns diff regions.
 *
 * Returns null if line counts differ — the caller should auto-unsync the snippet.
 * Returns an empty array if content is identical (no diffs).
 *
 * @param templateContent - Template content (should already have {{}} stripped)
 * @param snippetContent - Snippet content from the editor
 * @returns Array of DiffRegion, or null if line counts don't match
 */
export function computeDiffs(
  templateContent: string,
  snippetContent: string
): DiffRegion[] | null {
  const templateLines = templateContent.split('\n');
  const snippetLines = snippetContent.split('\n');

  // Rule 1: Line structure must match
  if (templateLines.length !== snippetLines.length) {
    return null;
  }

  const regions: DiffRegion[] = [];

  // Compare line by line
  for (let lineIndex = 0; lineIndex < templateLines.length; lineIndex++) {
    const templateLine = templateLines[lineIndex];
    const snippetLine = snippetLines[lineIndex];

    // Skip identical lines
    if (templateLine === snippetLine) {
      continue;
    }

    // Run word-level diff on this line
    const diffs = diffWords(templateLine, snippetLine);

    let templatePos = 0;
    let snippetPos = 0;

    for (let i = 0; i < diffs.length; i++) {
      const diff = diffs[i];

      if (diff.removed) {
        // Check if next diff is an addition (replacement case)
        const next = diffs[i + 1];
        if (next && next.added) {
          // Replacement: template has X, snippet has Y
          regions.push({
            line: lineIndex,
            templateFrom: templatePos,
            templateTo: templatePos + diff.value.length,
            templateContent: diff.value,
            snippetFrom: snippetPos,
            snippetTo: snippetPos + next.value.length,
            snippetContent: next.value
          });
          templatePos += diff.value.length;
          snippetPos += next.value.length;
          i++; // Skip the next diff since we handled it
        } else {
          // Deletion: template has X, snippet has nothing
          regions.push({
            line: lineIndex,
            templateFrom: templatePos,
            templateTo: templatePos + diff.value.length,
            templateContent: diff.value,
            snippetFrom: snippetPos,
            snippetTo: snippetPos,
            snippetContent: ''
          });
          templatePos += diff.value.length;
        }
      } else if (diff.added) {
        // Insertion: template has nothing, snippet has X
        // Clamp templatePos to not exceed line length (diffWords can report positions past end)
        const clampedTemplatePos = Math.min(templatePos, templateLine.length);
        regions.push({
          line: lineIndex,
          templateFrom: clampedTemplatePos,
          templateTo: clampedTemplatePos,
          templateContent: '',
          snippetFrom: snippetPos,
          snippetTo: snippetPos + diff.value.length,
          snippetContent: diff.value
        });
        snippetPos += diff.value.length;
      } else {
        // Unchanged: advance both pointers
        templatePos += diff.value.length;
        snippetPos += diff.value.length;
      }
    }
  }

  // Merge adjacent regions
  return mergeAdjacentRegions(regions);
}

/**
 * Updates template content to add/update/remove {{}} markers based on diff regions.
 *
 * Rules:
 * - Replacement (template and snippet both have content): wrap template content in {{}}
 * - Insertion (only snippet has content): add empty {{}} at the position
 * - Deletion (only template has content): wrap template content in {{}}
 * - Positions with no diff: remove any existing {{}} markers
 *
 * @param templateContent - Current template content (may already have some {{}} markers)
 * @param diffs - Diff regions computed from comparing template vs snippet
 * @returns Updated template content with {{}} markers
 */
export function updateTemplatePlaceholders(
  templateContent: string,
  diffs: DiffRegion[]
): string {
  // First, strip all existing placeholders to get clean content
  const cleanContent = stripPlaceholders(templateContent);
  const lines = cleanContent.split('\n');

  // Group diffs by line for easier processing
  const diffsByLine = new Map<number, DiffRegion[]>();
  for (const diff of diffs) {
    if (!diffsByLine.has(diff.line)) {
      diffsByLine.set(diff.line, []);
    }
    diffsByLine.get(diff.line)!.push(diff);
  }

  // Process each line that has diffs
  for (const [lineIndex, lineDiffs] of diffsByLine.entries()) {
    if (lineIndex < 0 || lineIndex >= lines.length) continue;

    let line = lines[lineIndex];

    // Sort diffs by position descending so we can insert from right to left
    // (this way earlier insertions don't shift positions of later ones)
    const sortedDiffs = [...lineDiffs].sort((a, b) => b.templateFrom - a.templateFrom);

    for (const diff of sortedDiffs) {
      const { templateFrom, templateTo, templateContent: tContent } = diff;

      // Bounds check - templateFrom can equal line.length for appending at end
      if (templateFrom < 0 || templateFrom > line.length) continue;

      // Clamp templateTo to not exceed line length
      const clampedTo = Math.min(templateTo, line.length);

      if (tContent.length > 0) {
        // Replacement or Deletion: wrap existing template content in {{}}
        const before = line.slice(0, templateFrom);
        const after = line.slice(clampedTo);
        line = before + '{{' + tContent + '}}' + after;
      } else {
        // Insertion: add empty {{}} at the position
        const before = line.slice(0, templateFrom);
        const after = line.slice(templateFrom);
        line = before + '{{}}' + after;
      }
    }

    lines[lineIndex] = line;
  }

  return lines.join('\n');
}

/**
 * Computes diff regions for a snippet against its template, handling placeholder stripping.
 * This is a convenience function that combines stripPlaceholders + computeDiffs.
 *
 * @param templateContentWithPlaceholders - Template content (may have {{}} markers)
 * @param snippetContent - Snippet content from the editor
 * @returns Array of DiffRegion, or null if line counts don't match
 */
export function computeDiffsFromTemplate(
  templateContentWithPlaceholders: string,
  snippetContent: string
): DiffRegion[] | null {
  const cleanTemplate = stripPlaceholders(templateContentWithPlaceholders);
  return computeDiffs(cleanTemplate, snippetContent);
}
