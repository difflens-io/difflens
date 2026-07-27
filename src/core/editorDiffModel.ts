import { diffLines } from 'diff';
import {
  ignoredPathSpansForEditor,
  maskIgnoredSpans,
  type IgnoredSpan
} from './editorIgnore';
import type { DiffOptions, FormatKind, TextDiffRow } from './types';

export interface EditorDiffSideModel {
  ignoredSpans: IgnoredSpan[];
  rawLines: string[];
  maskedLines: string[];
}

export interface EditorDiffModel {
  rows: TextDiffRow[];
  left: EditorDiffSideModel;
  right: EditorDiffSideModel;
}

export function buildEmptyEditorDiffModel(left: string, right: string): EditorDiffModel {
  return {
    rows: [],
    left: {
      ignoredSpans: [],
      rawLines: splitRawLines(left),
      maskedLines: splitRawLines(left)
    },
    right: {
      ignoredSpans: [],
      rawLines: splitRawLines(right),
      maskedLines: splitRawLines(right)
    }
  };
}

export function buildEditorDiffModel(
  left: string,
  right: string,
  leftFormat: FormatKind,
  rightFormat: FormatKind,
  options: DiffOptions
): EditorDiffModel {
  const leftIgnoredSpans = ignoredPathSpansForEditor(left, leftFormat, options.ignoredPaths);
  const rightIgnoredSpans = ignoredPathSpansForEditor(right, rightFormat, options.ignoredPaths);
  const maskedLeft = maskIgnoredSpans(left, leftIgnoredSpans);
  const maskedRight = maskIgnoredSpans(right, rightIgnoredSpans);
  const compareLeft = normalizeForEditorCompare(maskedLeft, options);
  const compareRight = normalizeForEditorCompare(maskedRight, options);
  const changes = diffLines(compareLeft, compareRight);
  const rows: TextDiffRow[] = [];
  const leftRawLines = splitRawLines(left);
  const rightRawLines = splitRawLines(right);
  const maskedLeftLines = splitRawLines(maskedLeft);
  const maskedRightLines = splitRawLines(maskedRight);
  const leftIgnoredLines = ignoredLineNumbers(left, leftIgnoredSpans);
  const rightIgnoredLines = ignoredLineNumbers(right, rightIgnoredSpans);
  let leftLine = 1;
  let rightLine = 1;

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const next = changes[index + 1];

    if (change.removed && next?.added) {
      const leftCount = splitRawLines(change.value).length;
      const rightCount = splitRawLines(next.value).length;
      const max = Math.max(leftCount, rightCount);

      for (let offset = 0; offset < max; offset += 1) {
        const hasLeft = offset < leftCount;
        const hasRight = offset < rightCount;

        rows.push(normalizeIgnoredOnlyRow({
          id: `editor-text-${rows.length}`,
          type: hasLeft && hasRight ? 'modified' : hasLeft ? 'removed' : 'added',
          leftLine: hasLeft ? leftLine++ : undefined,
          rightLine: hasRight ? rightLine++ : undefined
        }, maskedLeftLines, maskedRightLines, leftIgnoredLines, rightIgnoredLines));
      }

      index += 1;
      continue;
    }

    const count = splitRawLines(change.value).length;
    for (let offset = 0; offset < count; offset += 1) {
      if (change.added) {
        rows.push(normalizeIgnoredOnlyRow({
          id: `editor-text-${rows.length}`,
          type: 'added',
          rightLine: rightLine++
        }, maskedLeftLines, maskedRightLines, leftIgnoredLines, rightIgnoredLines));
      } else if (change.removed) {
        rows.push(normalizeIgnoredOnlyRow({
          id: `editor-text-${rows.length}`,
          type: 'removed',
          leftLine: leftLine++
        }, maskedLeftLines, maskedRightLines, leftIgnoredLines, rightIgnoredLines));
      } else {
        rows.push({
          id: `editor-text-${rows.length}`,
          type: 'equal',
          leftLine: leftLine++,
          rightLine: rightLine++
        });
      }
    }
  }

  return {
    rows,
    left: {
      ignoredSpans: leftIgnoredSpans,
      rawLines: leftRawLines,
      maskedLines: maskedLeftLines
    },
    right: {
      ignoredSpans: rightIgnoredSpans,
      rawLines: rightRawLines,
      maskedLines: maskedRightLines
    }
  };
}

export function buildEditorDiffRows(
  left: string,
  right: string,
  leftFormat: FormatKind,
  rightFormat: FormatKind,
  options: DiffOptions
): TextDiffRow[] {
  return buildEditorDiffModel(left, right, leftFormat, rightFormat, options).rows;
}

function normalizeIgnoredOnlyRow(
  row: TextDiffRow,
  maskedLeftLines: string[],
  maskedRightLines: string[],
  leftIgnoredLines: Set<number>,
  rightIgnoredLines: Set<number>
): TextDiffRow {
  if (
    row.type === 'removed' &&
    row.leftLine &&
    leftIgnoredLines.has(row.leftLine) &&
    !normalizeMaskedLine(maskedLeftLines[row.leftLine - 1] ?? '')
  ) {
    return { ...row, type: 'equal' };
  }

  if (
    row.type === 'added' &&
    row.rightLine &&
    rightIgnoredLines.has(row.rightLine) &&
    !normalizeMaskedLine(maskedRightLines[row.rightLine - 1] ?? '')
  ) {
    return { ...row, type: 'equal' };
  }

  return row;
}

function normalizeMaskedLine(line: string): string {
  return line.replace(/\s+/g, '');
}

function overlapsIgnoredSpan(from: number, to: number, ignoredSpans: IgnoredSpan[]): boolean {
  return ignoredSpans.some((span) => from < span.to && to > span.from);
}

function ignoredLineNumbers(value: string, ignoredSpans: IgnoredSpan[]): Set<number> {
  const lineNumbers = new Set<number>();
  if (ignoredSpans.length === 0) return lineNumbers;

  for (const line of sourceLineRanges(value)) {
    if (overlapsIgnoredSpan(line.from, line.to, ignoredSpans)) lineNumbers.add(line.number);
  }

  return lineNumbers;
}

function sourceLineRanges(value: string): Array<{ number: number; from: number; to: number }> {
  const lines = [];
  let from = 0;
  let number = 1;

  for (let index = 0; index <= value.length; index += 1) {
    if (index < value.length && value[index] !== '\n') continue;

    const to = index > from && value[index - 1] === '\r' ? index - 1 : index;
    lines.push({ number, from, to });
    from = index + 1;
    number += 1;
  }

  return lines.length === 0 ? [{ number: 1, from: 0, to: 0 }] : lines;
}

function normalizeForEditorCompare(value: string, options: DiffOptions): string {
  let next = value;

  if (options.ignoreWhitespace) {
    next = next
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n');
  }

  if (options.ignoreCase) next = next.toLocaleLowerCase();
  return next;
}

function splitRawLines(value: string): string[] {
  const lines = value.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length === 0 ? [''] : lines;
}
