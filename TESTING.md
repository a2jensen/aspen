# Testing Guide

This document describes how to run tests for the Aspen extension.

---

## Quick Reference

```bash
# Run all tests with coverage
jlpm test

# Run all tests without coverage (faster)
jlpm test:unit

# Run tests in watch mode (re-runs on file changes)
jlpm test:watch

# Run tests with verbose output
jlpm test:verbose

# Run tests with debug output (shows Input/Expected/Actual for each test)
npm run test:debug

# Run a specific test file
jlpm test:file src/__tests__/diffEngine.spec.ts

# Run tests matching a pattern
npx jest --testNamePattern="replacement"

# Run tests in a specific describe block
npx jest --testNamePattern="computeDiffs"
```

---

## Test File Naming

Test files must be named with `.spec.ts` or `.spec.tsx` extension and placed in `src/__tests__/` or alongside the source file.

```
src/
├── __tests__/
│   └── diffEngine.spec.ts    ✓ will be found
├── diffEngine.ts
└── diffEngine.test.ts        ✗ will NOT be found (wrong extension)
```

The pattern is configured in `jest.config.js`:
```javascript
testRegex: 'src/.*/.*.spec.ts[x]?$'
```

---

## CLI Options

### Running Specific Tests

```bash
# Run one test file
npx jest src/__tests__/diffEngine.spec.ts

# Run tests matching a name pattern
npx jest --testNamePattern="insertion"
npx jest -t "insertion"

# Run tests in files matching a path pattern
npx jest --testPathPattern="diffEngine"
```

### Output Options

```bash
# Verbose output (shows each test name)
npx jest --verbose

# No coverage report (faster)
npx jest --no-coverage

# Only show failed tests
npx jest --onlyFailures

# Show individual test results
npx jest --reporters=default
```

### Watch Mode

```bash
# Watch all files
npx jest --watch

# Watch only changed files (requires git)
npx jest --watchAll

# Watch with verbose output
npx jest --watch --verbose
```

### Debugging

```bash
# Run with detailed Input/Expected/Actual output for each test
npm run test:debug

# Run debug mode for specific file
npm run test:debug -- src/__tests__/diffEngine.spec.ts

# Filter debug output to just show test data
npm run test:debug -- src/__tests__/diffEngine.spec.ts 2>&1 | grep -E "(Input:|Expected:|Actual:|Result:|Template:|Snippet:)"

# Run with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# Show why tests are slow
npx jest --detectOpenHandles

# Run tests sequentially (useful for debugging)
npx jest --runInBand
```

### Debug Output Format

When running with `npm run test:debug`, tests output:

```
  Input:    "{{data.csv}}"
  Expected: "data.csv"
  Actual:   "data.csv"
  Result:   PASS ✓

  Template: "hello old world"
  Snippet:  "hello new world"
  Result:   [{"line":0,"templateFrom":6,...}]
```

To add debug output to new tests, use the `logTest` helper:

```typescript
const logTest = (input: any, expected: any, actual: any) => {
  if (process.env.VERBOSE_TESTS === 'true') {
    console.log(`  Input:    ${JSON.stringify(input)}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
    console.log(`  Result:   ${JSON.stringify(actual) === JSON.stringify(expected) ? 'PASS ✓' : 'FAIL ✗'}`);
  }
};
```

---

## Writing Tests

### Basic Structure

```typescript
import { myFunction } from '../myModule';

describe('myFunction', () => {
  test('does something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  test('handles edge case', () => {
    expect(myFunction('')).toBeNull();
  });
});
```

### Common Matchers

```typescript
// Equality
expect(value).toBe(exact);           // === comparison
expect(value).toEqual(object);       // deep equality
expect(value).toBeNull();
expect(value).toBeUndefined();

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThanOrEqual(10);

// Strings
expect(string).toMatch(/regex/);
expect(string).toContain('substring');

// Arrays
expect(array).toContain(item);
expect(array).toHaveLength(3);

// Objects
expect(object).toHaveProperty('key');
expect(object).toMatchObject({ partial: 'match' });
```

### Testing Async Code

```typescript
test('async function', async () => {
  const result = await asyncFunction();
  expect(result).toBe('value');
});

test('promise rejection', async () => {
  await expect(asyncFunction()).rejects.toThrow('error');
});
```

---

## Current Test Files

| File | Description |
|------|-------------|
| `src/__tests__/diffEngine.spec.ts` | Unit tests for diff detection and placeholder management |
| `src/__tests__/jupyterlab_apod.spec.ts` | (Legacy) Basic extension test |

---

## Test Coverage

Coverage reports are generated in `coverage/` directory when running `jlpm test`.

To view the HTML report:
```bash
open coverage/lcov-report/index.html
```

Coverage is collected from:
- `src/**/*.{ts,tsx}`
- Excluding `*.d.ts` files
- Excluding `.ipynb_checkpoints`

---

## Troubleshooting

### "No tests found"

1. Check file extension is `.spec.ts` not `.test.ts`
2. Check file is in `src/` directory
3. Run with verbose to see what's being searched:
   ```bash
   npx jest --verbose --listTests
   ```

### Tests timing out

Increase timeout for slow tests:
```typescript
test('slow test', async () => {
  // ...
}, 10000);  // 10 second timeout
```

Or globally in `jest.config.js`:
```javascript
module.exports = {
  testTimeout: 10000
};
```

### Module not found errors

The Jest config transforms ES modules. If you add a new dependency that uses ES modules, add it to the `esModules` list in `jest.config.js`:

```javascript
const esModules = [
  '@codemirror',
  // ... add new module here
].join('|');
```
