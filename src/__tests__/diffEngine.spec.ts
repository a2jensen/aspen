/**
 * Unit tests for diffEngine.ts
 *
 * Run with: npm run test:file -- src/__tests__/diffEngine.spec.ts
 * Run verbose: npm run test:verbose -- src/__tests__/diffEngine.spec.ts
 * Run debug:   npm run test:debug -- src/__tests__/diffEngine.spec.ts
 */

declare const process: { env: { [key: string]: string | undefined } };

import {
  stripPlaceholders,
  parsePlaceholders,
  computeDiffs,
  updateTemplatePlaceholders,
  computeDiffsFromTemplate
} from '../diffEngine';

// Helper to log test details when VERBOSE_TESTS=true
const logTest = (input: any, expected: any, actual: any) => {
  if (process.env.VERBOSE_TESTS === 'true') {
    console.log(`  Input:    ${JSON.stringify(input)}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);

    // Determine pass/fail
    let passed = false;
    if (typeof expected === 'object' && expected !== null) {
      if ('contains' in expected) {
        passed = typeof actual === 'string' && actual.includes(expected.contains);
      } else if ('minLength' in expected) {
        passed = actual?.length >= expected.minLength;
      } else {
        passed = JSON.stringify(actual) === JSON.stringify(expected);
      }
    } else {
      passed = JSON.stringify(actual) === JSON.stringify(expected);
    }

    console.log(`  Result:   ${passed ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log('');
  }
};

describe('stripPlaceholders', () => {
  test.each([
    ['{{data.csv}}', 'data.csv'],
    ['df = pd.read_csv("{{data.csv}}")', 'df = pd.read_csv("data.csv")'],
    ['hello {{world}} foo {{bar}}', 'hello world foo bar'],
    ['{{}}', ''],
    ['no placeholders here', 'no placeholders here'],
    ['line1 {{a}}\nline2 {{b}}', 'line1 a\nline2 b'],
  ])('stripPlaceholders(%j) → %j', (input, expected) => {
    const actual = stripPlaceholders(input);
    logTest(input, expected, actual);
    expect(actual).toBe(expected);
  });
});

describe('parsePlaceholders', () => {
  test('parses single placeholder: "{{data.csv}}"', () => {
    const input = '{{data.csv}}';
    const expected = [{ line: 0, from: 0, to: 12, content: 'data.csv' }];
    const actual = parsePlaceholders(input);
    logTest(input, expected, actual);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual(expected[0]);
  });

  test('parses placeholder in context: "prefix {{value}} suffix"', () => {
    const input = 'prefix {{value}} suffix';
    const expected = [{ line: 0, from: 7, to: 16, content: 'value' }];
    const actual = parsePlaceholders(input);
    logTest(input, expected, actual);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual(expected[0]);
  });

  test('parses multiple placeholders: "{{a}} and {{b}}"', () => {
    const input = '{{a}} and {{b}}';
    const actual = parsePlaceholders(input);
    logTest(input, ['a', 'b'], actual.map(p => p.content));
    expect(actual).toHaveLength(2);
    expect(actual[0].content).toBe('a');
    expect(actual[1].content).toBe('b');
  });

  test('parses multiline: "line0 {{a}}\\nline1 {{b}}"', () => {
    const input = 'line0 {{a}}\nline1 {{b}}';
    const actual = parsePlaceholders(input);
    logTest(input, [0, 1], actual.map(p => p.line));
    expect(actual).toHaveLength(2);
    expect(actual[0].line).toBe(0);
    expect(actual[1].line).toBe(1);
  });

  test('parses empty placeholder: "{{}}"', () => {
    const input = '{{}}';
    const actual = parsePlaceholders(input);
    logTest(input, '', actual[0]?.content);
    expect(actual).toHaveLength(1);
    expect(actual[0].content).toBe('');
  });

  test('returns empty for no placeholders: "no placeholders"', () => {
    const input = 'no placeholders';
    const actual = parsePlaceholders(input);
    logTest(input, [], actual);
    expect(actual).toHaveLength(0);
  });
});

describe('computeDiffs', () => {
  test.each([
    {
      name: 'identical content returns empty array',
      template: 'hello world',
      snippet: 'hello world',
      expectNull: false,
      expectLength: 0,
    },
    {
      name: 'different line counts returns null',
      template: 'line1\nline2',
      snippet: 'line1',
      expectNull: true,
      expectLength: 0,
    },
    {
      name: 'simple word replacement',
      template: 'hello old world',
      snippet: 'hello new world',
      expectNull: false,
      expectLength: 1,
      checkFirst: { templateContent: 'old', snippetContent: 'new' },
    },
    {
      name: 'deletion',
      template: 'hello world',
      snippet: 'hello',
      expectNull: false,
      expectLength: 1,
      checkFirst: { templateContent: ' world', snippetContent: '' },
    },
    {
      name: 'multiple diffs on same line',
      template: 'a = 1, b = 2',
      snippet: 'x = 1, y = 2',
      expectNull: false,
      expectMinLength: 2,
    },
    {
      name: 'diffs on multiple lines',
      template: 'line1 old\nline2 old',
      snippet: 'line1 new\nline2 new',
      expectNull: false,
      expectLength: 2,
    },
    {
      name: 'adjacent diffs merge',
      template: 'ab',
      snippet: 'xy',
      expectNull: false,
      expectLength: 1,
      checkFirst: { templateContent: 'ab', snippetContent: 'xy' },
    },
  ])('$name', ({ template, snippet, expectNull, expectLength, expectMinLength, checkFirst }) => {
    const actual = computeDiffs(template, snippet);

    if (process.env.VERBOSE_TESTS === 'true') {
      console.log(`  Template: ${JSON.stringify(template)}`);
      console.log(`  Snippet:  ${JSON.stringify(snippet)}`);
      console.log(`  Result:   ${JSON.stringify(actual)}`);
      console.log('');
    }

    if (expectNull) {
      expect(actual).toBeNull();
    } else {
      expect(actual).not.toBeNull();
      if (expectLength !== undefined) {
        expect(actual).toHaveLength(expectLength);
      }
      if (expectMinLength !== undefined) {
        expect(actual!.length).toBeGreaterThanOrEqual(expectMinLength);
      }
      if (checkFirst && actual && actual.length > 0) {
        expect(actual[0]).toMatchObject(checkFirst);
      }
    }
  });

  test('detects insertion at end', () => {
    const template = 'hello';
    const snippet = 'hello world';
    const actual = computeDiffs(template, snippet);

    // Log snippetContent specifically since that's what we're checking contains 'world'
    logTest({ template, snippet }, { contains: 'world' }, actual?.[0]?.snippetContent);

    expect(actual).not.toBeNull();
    expect(actual).toHaveLength(1);
    expect(actual![0].templateContent).toBe('');
    expect(actual![0].snippetContent).toContain('world');
  });

  test('handles quoted strings', () => {
    const template = 'read_csv("data.csv")';
    const snippet = 'read_csv("sales.csv")';
    const actual = computeDiffs(template, snippet);

    logTest({ template, snippet }, { minLength: 1 }, { length: actual?.length });

    expect(actual).not.toBeNull();
    expect(actual!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('updateTemplatePlaceholders', () => {
  test.each([
    {
      name: 'word replacement → wraps in {{}}',
      template: 'hello old world',
      snippet: 'hello new world',
      expected: 'hello {{old}} world',
    },
    {
      name: 'simple replacement → wraps in {{}}',
      template: 'ab',
      snippet: 'xy',
      expected: '{{ab}}',
    },
    {
      name: 'deletion → wraps deleted content in {{}}',
      template: 'hello world',
      snippet: 'hello',
      expectContains: ['{{', 'world'],
    },
    {
      name: 'no diff → strips existing {{}}',
      template: '{{data.csv}}',
      snippet: 'data.csv',
      expected: 'data.csv',
      useCleanForDiff: true,
    },
  ])('$name', ({ template, snippet, expected, expectContains, useCleanForDiff }) => {
    const diffTemplate = useCleanForDiff ? stripPlaceholders(template) : template;
    const diffs = computeDiffs(diffTemplate, snippet)!;
    const actual = updateTemplatePlaceholders(template, diffs);

    if (process.env.VERBOSE_TESTS === 'true') {
      console.log(`  Template: ${JSON.stringify(template)}`);
      console.log(`  Snippet:  ${JSON.stringify(snippet)}`);
      console.log(`  Diffs:    ${JSON.stringify(diffs)}`);
      console.log(`  Expected: ${JSON.stringify(expected || expectContains)}`);
      console.log(`  Actual:   ${JSON.stringify(actual)}`);
      console.log('');
    }

    if (expected) {
      expect(actual).toBe(expected);
    }
    if (expectContains) {
      for (const str of expectContains) {
        expect(actual).toContain(str);
      }
    }
  });

  test('insertion → adds empty {{}} at position', () => {
    const template = 'hello';
    const snippet = 'hello world';
    const diffs = computeDiffs(template, snippet)!;
    const actual = updateTemplatePlaceholders(template, diffs);

    const expected = 'hello{{}}';
    logTest({ template, snippet }, expected, actual);

    expect(actual).toContain('{{}}');
  });

  test('handles multiple diffs on same line', () => {
    const template = 'a = 1';
    const snippet = 'b = 2';
    const diffs = computeDiffs(template, snippet)!;
    const actual = updateTemplatePlaceholders(template, diffs);

    logTest({ template, snippet }, { contains: '{{' }, actual);

    expect(actual).toContain('{{');
  });

  test('handles multiline content', () => {
    const template = 'line1 old\nline2 same';
    const snippet = 'line1 new\nline2 same';
    const diffs = computeDiffs(template, snippet)!;
    const actual = updateTemplatePlaceholders(template, diffs);

    const expected = 'line1 {{old}}\nline2 same';
    logTest({ template, snippet }, expected, actual);

    expect(actual).toContain('{{');
    expect(actual.split('\n')).toHaveLength(2);
  });
});

describe('computeDiffsFromTemplate', () => {
  test.each([
    {
      name: 'strips placeholders before comparing (no diff)',
      template: 'df = pd.read_csv("{{data.csv}}")',
      snippet: 'df = pd.read_csv("data.csv")',
      expectLength: 0,
    },
    {
      name: 'detects diff with placeholder in template',
      template: 'df = pd.read_csv("{{data.csv}}")',
      snippet: 'df = pd.read_csv("sales.csv")',
      expectMinLength: 1,
    },
    {
      name: 'returns null for line count mismatch',
      template: 'line1\nline2',
      snippet: 'line1',
      expectNull: true,
    },
  ])('$name', ({ template, snippet, expectLength, expectMinLength, expectNull }) => {
    const actual = computeDiffsFromTemplate(template, snippet);

    if (process.env.VERBOSE_TESTS === 'true') {
      console.log(`  Template: ${JSON.stringify(template)}`);
      console.log(`  Snippet:  ${JSON.stringify(snippet)}`);
      console.log(`  Result:   ${JSON.stringify(actual)}`);
      console.log('');
    }

    if (expectNull) {
      expect(actual).toBeNull();
    } else {
      expect(actual).not.toBeNull();
      if (expectLength !== undefined) {
        expect(actual).toHaveLength(expectLength);
      }
      if (expectMinLength !== undefined) {
        expect(actual!.length).toBeGreaterThanOrEqual(expectMinLength);
      }
    }
  });
});
