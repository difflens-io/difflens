#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { detectFormat } from '../core/detect';
import { compareInputs, DEFAULT_OPTIONS, preview } from '../core/diff';
import { buildInlineDiff, type InlineDiffResult } from '../core/inlineDiff';
import type { CompareResult, DiffItem, DiffOptions, FormatKind, FormatMode } from '../core/types';

const SCHEMA_VERSION = '1.0';
const DEFAULT_MAX_ITEMS = 200;
export const CLI_DEFAULT_OPTIONS: DiffOptions = {
  ...DEFAULT_OPTIONS,
  ignoredPaths: [],
  showDiffInEditors: false,
  showEditorLineNumbers: false,
  enableEditorFolding: false
};

const FORMAT_VALUES: FormatMode[] = [
  'auto',
  'json',
  'jsonl',
  'yaml',
  'toml',
  'xml',
  'html',
  'markdown',
  'curl',
  'http',
  'csv',
  'tsv',
  'cookie',
  'properties',
  'text'
];

export interface CliCompareOutput {
  schemaVersion: string;
  tool: 'difflens';
  command: 'compare';
  format: {
    kind: FormatKind;
    label: string;
    mode: CompareResult['mode'];
    notice?: string;
    leftDetected: FormatKind;
    rightDetected: FormatKind;
  };
  stats: CompareResult['stats'];
  options: {
    formatMode: FormatMode;
    ignoreWhitespace: boolean;
    ignoreCase: boolean;
    ignoredPaths: string[];
    arrayKey: string;
    csvKey: string;
    abbreviateLongValues: boolean;
    maxItems: number;
  };
  items: CliDiffItem[];
  truncated: boolean;
}

export interface CliDiffItem {
  type: DiffItem['type'];
  path: string;
  summary: string;
  leftPreview: string;
  rightPreview: string;
  inline?: InlineDiffResult;
}

export function buildCompareOutput({
  left,
  right,
  formatMode,
  options,
  maxItems = DEFAULT_MAX_ITEMS
}: {
  left: string;
  right: string;
  formatMode: FormatMode;
  options: DiffOptions;
  maxItems?: number;
}): CliCompareOutput {
  const result = compareInputs(left, right, formatMode, options);
  const items = result.items.slice(0, maxItems).map((item) => serializeItem(item, options));
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: 'difflens',
    command: 'compare',
    format: {
      kind: result.kind,
      label: result.label,
      mode: result.mode,
      notice: result.notice,
      leftDetected: result.leftDetection.kind,
      rightDetected: result.rightDetection.kind
    },
    stats: result.stats,
    options: {
      formatMode,
      ignoreWhitespace: options.ignoreWhitespace,
      ignoreCase: options.ignoreCase,
      ignoredPaths: options.ignoredPaths,
      arrayKey: options.arrayKey,
      csvKey: options.csvKey,
      abbreviateLongValues: options.abbreviateLongValues,
      maxItems
    },
    items,
    truncated: result.items.length > items.length
  };
}

export function renderCompareMarkdown(output: CliCompareOutput): string {
  const lines = [
    '# DiffLens Compare',
    '',
    `- Format: ${output.format.label} (${output.format.kind})`,
    `- Mode: ${output.format.mode}`,
    `- Changes: ${output.stats.total} total, ${output.stats.added} added, ${output.stats.removed} removed, ${output.stats.modified} modified`
  ];
  if (output.format.notice) lines.push(`- Notice: ${output.format.notice}`);
  if (output.truncated) lines.push(`- Output truncated to first ${output.options.maxItems} items`);
  lines.push('', '## Diff Items');

  if (!output.items.length) {
    lines.push('', 'No differences.');
    return `${lines.join('\n')}\n`;
  }

  for (const item of output.items) {
    lines.push('', `- ${item.type} \`${item.path}\`: ${item.leftPreview} -> ${item.rightPreview}`);
  }

  return `${lines.join('\n')}\n`;
}

function main(argv: string[]): number {
  const { command, options } = parseCliArgs(argv);
  try {
    if (command === 'compare') {
      const output = buildCompareOutput({
        left: readInput(options, 'left'),
        right: readInput(options, 'right'),
        formatMode: readFormatMode(options),
        options: readDiffOptions(options),
        maxItems: readIntegerOption(options, 'max-items', DEFAULT_MAX_ITEMS)
      });
      const outputFormat = readChoiceOption(options, 'output', 'json', ['json', 'markdown']);
      writeOutput(outputFormat === 'markdown' ? renderCompareMarkdown(output) : `${JSON.stringify(output, null, 2)}\n`);
      return output.stats.total > 0 && readStringOption(options, 'exit-code', 'always-zero') === 'diff' ? 1 : 0;
    }

    if (command === 'detect') {
      const input = readInput(options, 'input');
      const detection = detectFormat(input, readFormatMode(options));
      writeOutput(`${JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        tool: 'difflens',
        command: 'detect',
        kind: detection.kind,
        label: detection.label,
        confidence: detection.confidence,
        error: detection.error
      }, null, 2)}\n`);
      return detection.error ? 1 : 0;
    }

    if (command === 'format') {
      const input = readInput(options, 'input');
      const detection = detectFormat(input, readFormatMode(options));
      if (detection.error) throw new Error(detection.error);
      const outputFormat = readChoiceOption(options, 'output', 'text', ['text', 'json']);
      writeOutput(outputFormat === 'json'
        ? `${JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            tool: 'difflens',
            command: 'format',
            kind: detection.kind,
            label: detection.label,
            formatted: detection.formatted
          }, null, 2)}\n`
        : `${detection.formatted}\n`);
      return 0;
    }

    writeOutput(helpText());
    return command === 'help' ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

function serializeItem(item: DiffItem, options: DiffOptions): CliDiffItem {
  const leftPreview = preview(item.leftValue, options.abbreviateLongValues);
  const rightPreview = preview(item.rightValue, options.abbreviateLongValues);
  const serialized: CliDiffItem = {
    type: item.type,
    path: item.path,
    summary: summarizeItem(item, leftPreview, rightPreview),
    leftPreview,
    rightPreview
  };

  if (
    options.highlightInlineChanges &&
    item.type === 'modified' &&
    typeof item.leftValue === 'string' &&
    typeof item.rightValue === 'string'
  ) {
    serialized.inline = buildInlineDiff(item.leftValue, item.rightValue);
  }

  return serialized;
}

function readDiffOptions(options: ParsedOptions): DiffOptions {
  const abbreviateLongValues = readBooleanOption(
    options,
    'abbreviate-long-values',
    readBooleanOption(options, 'truncate-long-values', CLI_DEFAULT_OPTIONS.abbreviateLongValues)
  );

  return {
    ...CLI_DEFAULT_OPTIONS,
    ignoreWhitespace: readBooleanOption(options, 'ignore-whitespace', CLI_DEFAULT_OPTIONS.ignoreWhitespace),
    ignoreCase: readBooleanOption(options, 'ignore-case', CLI_DEFAULT_OPTIONS.ignoreCase),
    ignoreKeyOrder: readBooleanOption(options, 'ignore-key-order', CLI_DEFAULT_OPTIONS.ignoreKeyOrder),
    highlightInlineChanges: readBooleanOption(options, 'inline', CLI_DEFAULT_OPTIONS.highlightInlineChanges),
    abbreviateLongValues,
    onlyChanges: readBooleanOption(options, 'only-changes', CLI_DEFAULT_OPTIONS.onlyChanges),
    ignoredPaths: readListOption(options, 'ignored-path', CLI_DEFAULT_OPTIONS.ignoredPaths),
    arrayKey: readStringOption(options, 'array-key', CLI_DEFAULT_OPTIONS.arrayKey),
    csvKey: readStringOption(options, 'csv-key', CLI_DEFAULT_OPTIONS.csvKey),
    showDiffInEditors: false,
    showEditorLineNumbers: false,
    enableEditorFolding: false
  };
}

function readFormatMode(options: ParsedOptions): FormatMode {
  const value = readStringOption(options, 'format', 'auto') as FormatMode;
  if (!FORMAT_VALUES.includes(value)) {
    throw new Error(`Unsupported format "${value}". Use one of: ${FORMAT_VALUES.join(', ')}`);
  }
  return value;
}

function readInput(options: ParsedOptions, side: 'left' | 'right' | 'input'): string {
  const inlineValue = lastOption(options, side);
  const fileValue = lastOption(options, `${side}-file`);
  if (inlineValue !== undefined && fileValue !== undefined) {
    throw new Error(`Use either --${side} or --${side}-file, not both.`);
  }
  if (inlineValue !== undefined) return inlineValue;
  if (fileValue === '-') return fs.readFileSync(0, 'utf8');
  if (fileValue !== undefined) return fs.readFileSync(fileValue, 'utf8');
  throw new Error(`Missing --${side} or --${side}-file.`);
}

type ParsedOptions = Record<string, string[] | undefined>;

function parseCliArgs(argv: string[]): { command: string; options: ParsedOptions } {
  const [command = 'help', ...rest] = argv;
  const options: ParsedOptions = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected positional argument: ${token}`);
    const raw = token.slice(2);
    if (raw.startsWith('no-')) {
      appendOption(options, raw.slice(3), 'false');
      continue;
    }
    const equalIndex = raw.indexOf('=');
    if (equalIndex >= 0) {
      appendOption(options, raw.slice(0, equalIndex), raw.slice(equalIndex + 1));
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      appendOption(options, raw, next);
      index += 1;
    } else {
      appendOption(options, raw, 'true');
    }
  }
  return { command, options };
}

function appendOption(options: ParsedOptions, key: string, value: string): void {
  const normalized = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  options[normalized] = [...(options[normalized] ?? []), value];
}

function readStringOption(options: ParsedOptions, key: string, fallback: string): string {
  return lastOption(options, key) ?? fallback;
}

function readIntegerOption(options: ParsedOptions, key: string, fallback: number): number {
  const value = Number(lastOption(options, key) ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${key} must be a positive integer.`);
  return value;
}

function readBooleanOption(options: ParsedOptions, key: string, fallback: boolean): boolean {
  const value = lastOption(options, key);
  if (value === undefined) return fallback;
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  throw new Error(`--${key} must be true or false.`);
}

function readChoiceOption<T extends string>(
  options: ParsedOptions,
  key: string,
  fallback: T,
  choices: readonly T[]
): T {
  const value = readStringOption(options, key, fallback);
  if (!choices.includes(value as T)) throw new Error(`--${key} must be one of: ${choices.join(', ')}.`);
  return value as T;
}

function readListOption(options: ParsedOptions, key: string, fallback: string[]): string[] {
  const values = options[key];
  if (!values?.length) return fallback;
  return values.flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean);
}

function lastOption(options: ParsedOptions, key: string): string | undefined {
  const values = options[key];
  return values?.[values.length - 1];
}

function writeOutput(value: string): void {
  process.stdout.write(value);
}

function summarizeItem(item: DiffItem, leftPreview: string, rightPreview: string): string {
  if (item.type === 'added') return `Added ${rightPreview}`;
  if (item.type === 'removed') return `Removed ${leftPreview}`;
  return `${leftPreview} -> ${rightPreview}`;
}

function helpText(): string {
  return `DiffLens CLI

Usage:
  npm run difflens -- compare --left-file left.json --right-file right.json [--format auto] [--output json|markdown]
  npm run difflens -- detect --input-file input.txt [--format auto]
  npm run difflens -- format --input-file input.txt [--format auto] [--output text|json]

Input options:
  --left / --right                 Inline compare inputs.
  --left-file / --right-file       File compare inputs.
  --input / --input-file           Single input for detect or format.

Diff options:
  --format                         auto, json, jsonl, yaml, toml, xml, html, markdown, curl, http, csv, tsv, cookie, properties, text.
  --ignore-whitespace true|false   Default true.
  --ignore-case true|false         Default false.
  --ignore-key-order true|false    Default true.
  --ignored-path value             Repeatable or comma-separated. No ignored paths are applied by default.
  --inline true|false              Include inline spans for modified strings.
  --abbreviate-long-values true|false
  --array-key value                Default id.
  --csv-key value                  Primary key column for CSV/TSV.
  --max-items value                Default ${DEFAULT_MAX_ITEMS}.
  --exit-code diff                 Return 1 when compare finds differences.
`;
}

function isMainModule(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  process.exitCode = main(process.argv.slice(2));
}
