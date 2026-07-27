import type { FormatMode } from './types';

export type DiffExecutionPlan = 'sync' | 'worker';

export const JSONL_WORKER_MIN_BYTES = 1024 * 1024;

export function selectDiffExecutionPlan({
  left,
  right,
  formatMode
}: {
  left: string;
  right: string;
  formatMode: FormatMode;
}): DiffExecutionPlan {
  const totalLength = left.length + right.length;
  if (totalLength < JSONL_WORKER_MIN_BYTES) return 'sync';
  if (formatMode === 'jsonl') return 'worker';
  if (formatMode !== 'auto') return 'sync';
  return looksLikeJsonl(left) && looksLikeJsonl(right) ? 'worker' : 'sync';
}

export function looksLikeJsonl(value: string): boolean {
  let nonEmptyLines = 0;

  for (const line of firstNonEmptyLines(value, 3)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!looksLikeJsonValueLine(trimmed)) return false;
    nonEmptyLines += 1;
  }

  return nonEmptyLines >= 2;
}

function firstNonEmptyLines(value: string, limit: number): string[] {
  const lines: string[] = [];
  let start = 0;

  for (let index = 0; index <= value.length && lines.length < limit; index += 1) {
    if (index < value.length && value[index] !== '\n') continue;

    const line = value.slice(start, index > start && value[index - 1] === '\r' ? index - 1 : index);
    if (line.trim()) lines.push(line);
    start = index + 1;
  }

  return lines;
}

function looksLikeJsonValueLine(value: string): boolean {
  const first = value[0];
  const last = value[value.length - 1];
  return (
    (first === '{' && last === '}') ||
    (first === '[' && last === ']') ||
    first === '"' ||
    first === '-' ||
    /\d/.test(first) ||
    value === 'true' ||
    value === 'false' ||
    value === 'null'
  );
}
