#!/usr/bin/env node
/**
 * CLI Diff Testing Tool
 *
 * A standalone tool for testing the diff/highlight system in-memory.
 * Reads test cases from JSON files and outputs visual representations
 * of where highlights would appear.
 *
 * Usage:
 *   npm run diff:test -- <json-file>
 *   npm run diff:test -- <directory>
 */

import * as fs from 'fs';
import * as path from 'path';
import { computeDiffs } from '../diffEngine';
import {
  ITestCase,
  ITestResult,
  IInstanceResult,
  isTestCase,
  isTestBatch
} from './types';
import {
  formatTestResult,
  formatSummary,
  formatError,
  formatUsage
} from './formatOutput';

/**
 * Runs a single test case and returns the result.
 */
function runTestCase(testCase: ITestCase): ITestResult {
  const instanceResults: IInstanceResult[] = [];

  for (let i = 0; i < testCase.instances.length; i++) {
    const instance = testCase.instances[i];
    const diffs = computeDiffs(testCase.template, instance);

    let status: IInstanceResult['status'];
    if (diffs === null) {
      status = 'unsynced';
    } else if (diffs.length === 0) {
      status = 'synced';
    } else {
      status = 'diverged';
    }

    instanceResults.push({
      instanceIndex: i,
      instanceContent: instance,
      diffs,
      status
    });
  }

  return {
    name: testCase.name,
    template: testCase.template,
    instanceResults
  };
}

/**
 * Loads and parses a JSON file, returning test cases.
 */
function loadTestFile(filePath: string): ITestCase[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);

  if (isTestBatch(parsed)) {
    return parsed.testCases;
  } else if (isTestCase(parsed)) {
    return [parsed];
  } else {
    throw new Error(
      `Invalid JSON format in ${filePath}. Expected TestCase or TestBatch.`
    );
  }
}

/**
 * Finds all JSON files in a directory.
 */
function findJsonFiles(dirPath: string): string[] {
  const files = fs.readdirSync(dirPath);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dirPath, f))
    .sort();
}

/**
 * Main entry point.
 */
function main(): void {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(formatUsage());
    process.exit(0);
  }

  // Get the input path (first non-flag argument)
  const inputPath = args.find(arg => !arg.startsWith('--'));

  if (!inputPath) {
    console.log(formatError('No input file or directory specified.'));
    console.log(formatUsage());
    process.exit(1);
  }

  // Resolve the path
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    console.log(formatError(`Path not found: ${resolvedPath}`));
    process.exit(1);
  }

  // Collect test files
  let testFiles: string[];
  const stats = fs.statSync(resolvedPath);

  if (stats.isDirectory()) {
    testFiles = findJsonFiles(resolvedPath);
    if (testFiles.length === 0) {
      console.log(formatError(`No JSON files found in ${resolvedPath}`));
      process.exit(1);
    }
  } else {
    testFiles = [resolvedPath];
  }

  // Run tests
  const allResults: ITestResult[] = [];

  for (const testFile of testFiles) {
    try {
      const testCases = loadTestFile(testFile);

      for (const testCase of testCases) {
        const result = runTestCase(testCase);
        allResults.push(result);
        console.log(formatTestResult(result));
      }
    } catch (err) {
      console.log(
        formatError(`Failed to process ${testFile}: ${(err as Error).message}`)
      );
    }
  }

  // Print summary
  if (allResults.length > 0) {
    console.log(formatSummary(allResults));
  }
}

// Run
main();
