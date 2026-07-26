import { diffLines } from 'diff';
import { detectFormat } from './detect';
import {
  isIgnoredPath,
  isPlainObject,
  normalizeScalar,
  normalizeText,
  stableStringify
} from './normalize';
import type {
  CompareResult,
  DiffItem,
  DiffOptions,
  DiffStats,
  DiffType,
  FormatKind,
  FormatMode,
  ParsedTable,
  TextDiffRow
} from './types';

const STRUCTURED_FORMATS: FormatKind[] = [
  'json',
  'jsonl',
  'yaml',
  'toml',
  'xml',
  'html',
  'cookie',
  'properties',
  'curl',
  'http'
];
const TABLE_FORMATS: FormatKind[] = ['csv', 'tsv'];

export const DEFAULT_OPTIONS: DiffOptions = {
  ignoreWhitespace: true,
  ignoreCase: false,
  ignoreKeyOrder: true,
  highlightInlineChanges: true,
  abbreviateLongValues: false,
  showDiffInEditors: true,
  showEditorLineNumbers: true,
  enableEditorFolding: true,
  onlyChanges: false,
  ignoredPaths: ['timestamp', 'updatedAt', 'createdAt'],
  arrayKey: 'id',
  csvKey: ''
};

export function compareInputs(
  left: string,
  right: string,
  mode: FormatMode,
  options: DiffOptions
): CompareResult {
  const leftDetection = detectFormat(left, mode);
  const rightDetection = detectFormat(right, mode);
  const sameKind = leftDetection.kind === rightDetection.kind;
  const parseError = leftDetection.error || rightDetection.error;

  if (!parseError && sameKind && TABLE_FORMATS.includes(leftDetection.kind)) {
    const items = diffTables(
      leftDetection.table as ParsedTable,
      rightDetection.table as ParsedTable,
      options
    );

    return {
      kind: leftDetection.kind,
      label: leftDetection.label,
      leftDetection,
      rightDetection,
      items,
      stats: statsFor(items),
      textRows: [],
      mode: 'table'
    };
  }

  if (!parseError && sameKind && STRUCTURED_FORMATS.includes(leftDetection.kind)) {
    const items: DiffItem[] = [];
    diffValues(leftDetection.parsed, rightDetection.parsed, '$', options, items);

    return {
      kind: leftDetection.kind,
      label: leftDetection.label,
      leftDetection,
      rightDetection,
      items,
      stats: statsFor(items),
      textRows: [],
      mode: 'structured'
    };
  }

  const textRows = buildTextDiffRows(left, right, options);
  const items = itemsFromTextRows(textRows);
  const textKind = !parseError && sameKind ? leftDetection.kind : 'text';
  const textLabel = !parseError && sameKind ? leftDetection.label : 'Plain Text';
  const notice = parseError
    ? '结构化解析失败，已回退到文本对比。'
    : sameKind
      ? undefined
      : `左右格式识别不一致：${leftDetection.label} / ${rightDetection.label}，已回退到文本对比。`;

  return {
    kind: textKind,
    label: textLabel,
    leftDetection,
    rightDetection,
    items,
    stats: statsFor(items),
    textRows,
    mode: 'text',
    notice
  };
}

function diffValues(
  left: unknown,
  right: unknown,
  path: string,
  options: DiffOptions,
  items: DiffItem[]
): void {
  if (isIgnoredPath(path, options.ignoredPaths)) return;

  if (left === undefined) {
    items.push(createItem('added', path, undefined, right));
    return;
  }

  if (right === undefined) {
    items.push(createItem('removed', path, left, undefined));
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    diffArrays(left, right, path, options, items);
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = union(Object.keys(left), Object.keys(right));
    for (const key of keys) {
      diffValues(left[key], right[key], `${path}.${escapePathSegment(key)}`, options, items);
    }
    return;
  }

  if (valuesEquivalent(left, right, options)) return;

  items.push(createItem('modified', path, left, right));
}

function valuesEquivalent(left: unknown, right: unknown, options: DiffOptions): boolean {
  if (left === right) return true;

  if (typeof left === 'string' || typeof right === 'string') {
    return (
      typeof left === 'string' &&
      typeof right === 'string' &&
      normalizeScalar(left, options) === normalizeScalar(right, options)
    );
  }

  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }

  if (typeof left === 'object' || typeof right === 'object') {
    return stableStringify(left) === stableStringify(right);
  }

  return false;
}

function diffArrays(
  left: unknown[],
  right: unknown[],
  path: string,
  options: DiffOptions,
  items: DiffItem[]
): void {
  const key = options.arrayKey.trim();
  const canUseKey =
    key &&
    left.every((item) => isPlainObject(item) && key in item) &&
    right.every((item) => isPlainObject(item) && key in item);

  if (canUseKey) {
    const leftMap = mapByKey(left, key);
    const rightMap = mapByKey(right, key);
    const keys = union([...leftMap.keys()], [...rightMap.keys()]);

    for (const itemKey of keys) {
      diffValues(
        leftMap.get(itemKey),
        rightMap.get(itemKey),
        `${path}[${escapePathSegment(itemKey)}]`,
        options,
        items
      );
    }
    return;
  }

  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    diffValues(left[index], right[index], `${path}[${index}]`, options, items);
  }
}

function diffTables(left: ParsedTable, right: ParsedTable, options: DiffOptions): DiffItem[] {
  const items: DiffItem[] = [];
  const headers = union(left.headers, right.headers);
  const keyColumn = options.csvKey.trim();
  const leftKeyIndex = left.headers.indexOf(keyColumn);
  const rightKeyIndex = right.headers.indexOf(keyColumn);
  const keyed = keyColumn && leftKeyIndex >= 0 && rightKeyIndex >= 0;

  const leftRows = keyed ? mapRowsByColumn(left.rows, leftKeyIndex) : mapRowsByIndex(left.rows);
  const rightRows = keyed ? mapRowsByColumn(right.rows, rightKeyIndex) : mapRowsByIndex(right.rows);
  const rowKeys = union([...leftRows.keys()], [...rightRows.keys()]);

  for (const rowKey of rowKeys) {
    const rowPath = keyed ? `row[${escapePathSegment(rowKey)}]` : `row[${rowKey}]`;
    const leftRow = leftRows.get(rowKey);
    const rightRow = rightRows.get(rowKey);

    if (!leftRow) {
      items.push(createItem('added', rowPath, undefined, rowObject(rightRow, right.headers)));
      continue;
    }

    if (!rightRow) {
      items.push(createItem('removed', rowPath, rowObject(leftRow, left.headers), undefined));
      continue;
    }

    for (const header of headers) {
      if (header === keyColumn) continue;

      const leftValue = leftRow[left.headers.indexOf(header)] ?? '';
      const rightValue = rightRow[right.headers.indexOf(header)] ?? '';
      const normalizedLeft = normalizeScalar(leftValue, options);
      const normalizedRight = normalizeScalar(rightValue, options);

      if (normalizedLeft !== normalizedRight) {
        items.push(createItem('modified', `${rowPath}.${escapePathSegment(header)}`, leftValue, rightValue));
      }
    }
  }

  return items.filter((item) => !isIgnoredPath(item.path, options.ignoredPaths));
}

export function buildTextDiffRows(left: string, right: string, options: DiffOptions): TextDiffRow[] {
  const leftText = normalizeText(left, options);
  const rightText = normalizeText(right, options);
  const changes = diffLines(leftText, rightText);
  const rows: TextDiffRow[] = [];
  let leftLine = 1;
  let rightLine = 1;

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const next = changes[index + 1];

    if (change.removed && next?.added) {
      const leftLines = splitLines(change.value);
      const rightLines = splitLines(next.value);
      const max = Math.max(leftLines.length, rightLines.length);

      for (let offset = 0; offset < max; offset += 1) {
        const leftTextLine = leftLines[offset];
        const rightTextLine = rightLines[offset];
        rows.push({
          id: `text-${rows.length}`,
          type: leftTextLine === undefined ? 'added' : rightTextLine === undefined ? 'removed' : 'modified',
          leftLine: leftTextLine === undefined ? undefined : leftLine++,
          rightLine: rightTextLine === undefined ? undefined : rightLine++,
          leftText: leftTextLine,
          rightText: rightTextLine
        });
      }
      index += 1;
      continue;
    }

    const lines = splitLines(change.value);
    for (const line of lines) {
      if (change.added) {
        rows.push({
          id: `text-${rows.length}`,
          type: 'added',
          rightLine: rightLine++,
          rightText: line
        });
      } else if (change.removed) {
        rows.push({
          id: `text-${rows.length}`,
          type: 'removed',
          leftLine: leftLine++,
          leftText: line
        });
      } else {
        rows.push({
          id: `text-${rows.length}`,
          type: 'equal',
          leftLine: leftLine++,
          rightLine: rightLine++,
          leftText: line,
          rightText: line
        });
      }
    }
  }

  return options.onlyChanges ? rows.filter((row) => row.type !== 'equal') : rows;
}

function itemsFromTextRows(rows: TextDiffRow[]): DiffItem[] {
  return rows
    .filter((row) => row.type !== 'equal')
    .map((row) =>
      createItem(
        row.type as DiffType,
        `line:${row.leftLine ?? row.rightLine ?? 0}`,
        row.leftText,
        row.rightText
      )
    );
}

function createItem(type: DiffType, path: string, leftValue?: unknown, rightValue?: unknown): DiffItem {
  return {
    id: `${type}:${path}:${stableStringify(leftValue)}:${stableStringify(rightValue)}`,
    type,
    path,
    leftValue,
    rightValue,
    summary: summarize(type, leftValue, rightValue)
  };
}

function summarize(type: DiffType, leftValue?: unknown, rightValue?: unknown): string {
  if (type === 'added') return `新增 ${preview(rightValue)}`;
  if (type === 'removed') return `删除 ${preview(leftValue)}`;
  return `${preview(leftValue)} -> ${preview(rightValue)}`;
}

export function preview(value: unknown, abbreviateLongValues = true): string {
  if (value === undefined) return '∅';
  if (value === null) return 'null';
  if (typeof value === 'string') return abbreviate(value, abbreviateLongValues);

  const serialized = stableStringify(value);
  return abbreviate(serialized, abbreviateLongValues);
}

function abbreviate(value: string, enabled: boolean): string {
  const limit = 140;
  if (!enabled || value.length <= limit) return value;
  return `${value.slice(0, 90)}...${value.slice(-40)}`;
}

function statsFor(items: DiffItem[]): DiffStats {
  const stats: DiffStats = {
    added: 0,
    removed: 0,
    modified: 0,
    total: items.length
  };

  for (const item of items) stats[item.type] += 1;
  return stats;
}

function union<T extends string>(left: T[], right: T[]): T[] {
  return [...new Set([...left, ...right])];
}

function mapByKey(values: unknown[], key: string): Map<string, unknown> {
  const map = new Map<string, unknown>();
  values.forEach((value, index) => {
    const object = value as Record<string, unknown>;
    map.set(String(object[key] ?? index), value);
  });
  return map;
}

function mapRowsByColumn(rows: string[][], columnIndex: number): Map<string, string[]> {
  const map = new Map<string, string[]>();
  rows.forEach((row, index) => map.set(row[columnIndex] || String(index), row));
  return map;
}

function mapRowsByIndex(rows: string[][]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  rows.forEach((row, index) => map.set(String(index + 1), row));
  return map;
}

function rowObject(row: string[] | undefined, headers: string[]): Record<string, string> {
  if (!row) return {};
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
}

function splitLines(value: string): string[] {
  const lines = value.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function escapePathSegment(segment: string): string {
  return segment.replace(/\./g, '\\.');
}
