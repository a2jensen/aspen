/**
 * Terminal output formatting for the diff testing tool.
 * Uses ANSI escape codes for colors and box drawing characters.
 */

import { DiffRegion } from '../types';
import { ITestResult, IInstanceResult } from './types';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

/**
 * Creates a horizontal line of specified width.
 */
function horizontalLine(width: number, char = '─'): string {
  return char.repeat(width);
}

/**
 * Formats a test case header with box drawing.
 */
export function formatTestHeader(name: string): string {
  const width = Math.max(name.length + 4, 50);
  const padding = width - name.length - 4;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;

  return [
    `${colors.cyan}╭${horizontalLine(width)}╮${colors.reset}`,
    `${colors.cyan}│${colors.reset} ${colors.bold}${' '.repeat(leftPad)}${name}${' '.repeat(rightPad)}${colors.reset} ${colors.cyan}│${colors.reset}`,
    `${colors.cyan}╰${horizontalLine(width)}╯${colors.reset}`
  ].join('\n');
}

/**
 * Creates caret markers under text to indicate highlight positions.
 */
function createCaretMarkers(
  lineLength: number,
  regions: Array<{ from: number; to: number }>
): string {
  const markers = new Array(lineLength).fill(' ');

  for (const region of regions) {
    for (let i = region.from; i < Math.min(region.to, lineLength); i++) {
      markers[i] = '^';
    }
    // Handle zero-width regions (insertions)
    if (region.from === region.to && region.from < lineLength) {
      markers[region.from] = '|';
    }
  }

  return markers.join('');
}

/**
 * Formats a single line with its highlight markers.
 */
function formatLineWithHighlights(
  label: string,
  content: string,
  regions: DiffRegion[],
  side: 'template' | 'snippet',
  lineIndex: number
): string[] {
  const lineRegions = regions.filter(r => r.line === lineIndex);

  if (lineRegions.length === 0) {
    return [`  ${colors.dim}${label}:${colors.reset} ${content}`];
  }

  const highlights =
    side === 'template'
      ? lineRegions.map(r => ({ from: r.templateFrom, to: r.templateTo }))
      : lineRegions.map(r => ({ from: r.snippetFrom, to: r.snippetTo }));

  const carets = createCaretMarkers(content.length + 1, highlights);
  const color = side === 'template' ? colors.red : colors.green;

  // Build highlighted content
  let highlightedContent = '';
  let pos = 0;
  for (const hl of highlights.sort((a, b) => a.from - b.from)) {
    highlightedContent += content.slice(pos, hl.from);
    highlightedContent += `${color}${colors.bold}${content.slice(hl.from, hl.to)}${colors.reset}`;
    pos = hl.to;
  }
  highlightedContent += content.slice(pos);

  const lines = [`  ${colors.dim}${label}:${colors.reset} ${highlightedContent}`];

  // Add caret line if there are highlights
  if (carets.trim()) {
    const labelPadding = ' '.repeat(label.length + 4);
    lines.push(`${labelPadding}${color}${carets}${colors.reset}`);

    // Add position annotations
    for (const region of lineRegions) {
      const from = side === 'template' ? region.templateFrom : region.snippetFrom;
      const to = side === 'template' ? region.templateTo : region.snippetTo;
      const regionContent =
        side === 'template' ? region.templateContent : region.snippetContent;
      const annotation = `[${from}-${to}] "${regionContent}"`;
      lines.push(`${labelPadding}${colors.dim}${annotation}${colors.reset}`);
    }
  }

  return lines;
}

/**
 * Formats the DiffRegion array as a structured box.
 */
function formatDiffRegions(diffs: DiffRegion[]): string[] {
  if (diffs.length === 0) {
    return [
      `  ${colors.dim}DiffRegions: (none - content matches)${colors.reset}`
    ];
  }

  const lines = [`  ${colors.bold}DiffRegions:${colors.reset}`];

  for (const diff of diffs) {
    lines.push(`  ${colors.cyan}┌${'─'.repeat(50)}┐${colors.reset}`);
    lines.push(
      `  ${colors.cyan}│${colors.reset} line: ${diff.line}${' '.repeat(50 - 8 - String(diff.line).length)}${colors.cyan}│${colors.reset}`
    );

    const tRange = `[${diff.templateFrom}, ${diff.templateTo}]`;
    const tContent = `"${diff.templateContent}"`;
    const templateLine = `template: ${tRange} ${tContent}`;
    lines.push(
      `  ${colors.cyan}│${colors.reset} ${colors.red}${templateLine}${colors.reset}${' '.repeat(Math.max(0, 50 - templateLine.length - 1))}${colors.cyan}│${colors.reset}`
    );

    const sRange = `[${diff.snippetFrom}, ${diff.snippetTo}]`;
    const sContent = `"${diff.snippetContent}"`;
    const snippetLine = `snippet:  ${sRange} ${sContent}`;
    lines.push(
      `  ${colors.cyan}│${colors.reset} ${colors.green}${snippetLine}${colors.reset}${' '.repeat(Math.max(0, 50 - snippetLine.length - 1))}${colors.cyan}│${colors.reset}`
    );

    lines.push(`  ${colors.cyan}└${'─'.repeat(50)}┘${colors.reset}`);
  }

  return lines;
}

/**
 * Formats an instance result.
 */
function formatInstanceResult(
  result: IInstanceResult,
  template: string
): string[] {
  const lines: string[] = [];
  const instanceLabel = `Instance ${result.instanceIndex + 1}`;

  lines.push('');

  if (result.status === 'unsynced') {
    lines.push(
      `  ${colors.yellow}${colors.bold}${instanceLabel}: AUTO-UNSYNC${colors.reset}`
    );
    lines.push(
      `  ${colors.yellow}Line count mismatch - cannot diff${colors.reset}`
    );
    lines.push(`  ${colors.dim}Content:${colors.reset} ${result.instanceContent}`);
    return lines;
  }

  const diffs = result.diffs || [];

  // Show template with highlights
  const templateLines = template.split('\n');
  for (let i = 0; i < templateLines.length; i++) {
    const label = i === 0 ? 'Template' : `        `;
    lines.push(...formatLineWithHighlights(label, templateLines[i], diffs, 'template', i));
  }

  lines.push('');

  // Show instance with highlights
  const instanceLines = result.instanceContent.split('\n');
  for (let i = 0; i < instanceLines.length; i++) {
    const label = i === 0 ? instanceLabel : `        `;
    lines.push(...formatLineWithHighlights(label, instanceLines[i], diffs, 'snippet', i));
  }

  lines.push('');
  lines.push(...formatDiffRegions(diffs));

  // Status line
  const statusIcon =
    result.status === 'synced'
      ? `${colors.green}✓${colors.reset}`
      : `${colors.yellow}△${colors.reset}`;
  const statusText =
    result.status === 'synced'
      ? 'No differences (in sync)'
      : `${diffs.length} diff region${diffs.length !== 1 ? 's' : ''} found`;

  lines.push('');
  lines.push(`  ${colors.bold}Status:${colors.reset} ${statusIcon} ${statusText}`);

  return lines;
}

/**
 * Formats a complete test result.
 */
export function formatTestResult(result: ITestResult): string {
  const lines: string[] = [];

  lines.push(formatTestHeader(result.name));
  lines.push('');

  for (const instanceResult of result.instanceResults) {
    lines.push(...formatInstanceResult(instanceResult, result.template));
    lines.push('');
    lines.push(`  ${colors.dim}${'─'.repeat(50)}${colors.reset}`);
  }

  return lines.join('\n');
}

/**
 * Formats a summary of all test results.
 */
export function formatSummary(results: ITestResult[]): string {
  const totalInstances = results.reduce(
    (sum, r) => sum + r.instanceResults.length,
    0
  );
  const synced = results.reduce(
    (sum, r) => sum + r.instanceResults.filter(i => i.status === 'synced').length,
    0
  );
  const diverged = results.reduce(
    (sum, r) => sum + r.instanceResults.filter(i => i.status === 'diverged').length,
    0
  );
  const unsynced = results.reduce(
    (sum, r) => sum + r.instanceResults.filter(i => i.status === 'unsynced').length,
    0
  );

  const lines = [
    '',
    `${colors.bold}═══════════════════════════════════════════════════${colors.reset}`,
    `${colors.bold}                    SUMMARY${colors.reset}`,
    `${colors.bold}═══════════════════════════════════════════════════${colors.reset}`,
    '',
    `  Test cases: ${results.length}`,
    `  Total instances: ${totalInstances}`,
    '',
    `  ${colors.green}✓ Synced:${colors.reset}   ${synced}`,
    `  ${colors.yellow}△ Diverged:${colors.reset} ${diverged}`,
    `  ${colors.red}✗ Unsynced:${colors.reset} ${unsynced}`,
    ''
  ];

  return lines.join('\n');
}

/**
 * Formats an error message.
 */
export function formatError(message: string): string {
  return `${colors.red}${colors.bold}Error:${colors.reset} ${message}`;
}

/**
 * Formats a usage message.
 */
export function formatUsage(): string {
  return `
${colors.bold}Usage:${colors.reset}
  npm run diff:test -- <json-file>
  npm run diff:test -- <directory>

${colors.bold}Options:${colors.reset}
  --verbose    Show additional debug information
  --help       Show this help message

${colors.bold}Examples:${colors.reset}
  npm run diff:test -- test-cases/replacement.json
  npm run diff:test -- test-cases/
`;
}
