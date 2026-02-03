/**
 * CLI-specific types for the diff testing tool.
 */

import { DiffRegion } from '../types';

/**
 * A single test case with a template and its instances.
 */
export interface ITestCase {
  name: string;
  template: string;
  instances: string[];
}

/**
 * Batch mode input format with multiple test cases.
 */
export interface ITestBatch {
  testCases: ITestCase[];
}

/**
 * Result of diffing a single instance against a template.
 */
export interface IInstanceResult {
  instanceIndex: number;
  instanceContent: string;
  diffs: DiffRegion[] | null; // null means line count mismatch (auto-unsync)
  status: 'synced' | 'diverged' | 'unsynced';
}

/**
 * Result of running a complete test case.
 */
export interface ITestResult {
  name: string;
  template: string;
  instanceResults: IInstanceResult[];
}

/**
 * Type guard to check if input is a batch format.
 */
export function isTestBatch(input: unknown): input is ITestBatch {
  return (
    typeof input === 'object' &&
    input !== null &&
    'testCases' in input &&
    Array.isArray((input as ITestBatch).testCases)
  );
}

/**
 * Type guard to check if input is a single test case.
 */
export function isTestCase(input: unknown): input is ITestCase {
  return (
    typeof input === 'object' &&
    input !== null &&
    'name' in input &&
    'template' in input &&
    'instances' in input &&
    typeof (input as ITestCase).name === 'string' &&
    typeof (input as ITestCase).template === 'string' &&
    Array.isArray((input as ITestCase).instances)
  );
}
