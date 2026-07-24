import type { DiffOptions } from './types';

export function normalizeScalar(value: unknown, options: DiffOptions): unknown {
  if (typeof value !== 'string') return value;

  let next = value;
  if (options.ignoreWhitespace) next = next.replace(/\s+/g, ' ').trim();
  if (options.ignoreCase) next = next.toLocaleLowerCase();
  return next;
}

export function normalizeText(value: string, options: DiffOptions): string {
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

export function normalizeValue(value: unknown, options: DiffOptions): unknown {
  if (typeof value === 'string') return normalizeScalar(value, options);
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, options));

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (options.ignoreKeyOrder) entries.sort(([a], [b]) => a.localeCompare(b));

    return Object.fromEntries(
      entries.map(([key, child]) => [key, normalizeValue(child, options)])
    );
  }

  return value;
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return '__undefined__';
  return JSON.stringify(value, (_key, child) => {
    if (typeof child === 'bigint') return child.toString();
    if (!isPlainObject(child)) return child;
    return Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)));
  });
}

export function isIgnoredPath(path: string, patterns: string[]): boolean {
  const cleanPatterns = patterns.map((pattern) => pattern.trim()).filter(Boolean);
  if (cleanPatterns.length === 0) return false;

  const candidatePaths = pathAliasCandidates(path);
  return cleanPatterns.some((pattern) =>
    candidatePaths.some((candidatePath) => pathMatchesPattern(candidatePath, pattern))
  );
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function pathAliasCandidates(path: string): string[] {
  const candidates = [path];
  const bodySuffix = bodyRelativeSuffix(path);

  if (bodySuffix !== null) {
    candidates.push(`$.body${bodySuffix}`);
    candidates.push(`$${bodySuffix}`);
  }

  return [...new Set(candidates)];
}

function bodyRelativeSuffix(path: string): string | null {
  const match = /\.body(?=\.|\[|$)/.exec(path);
  if (!match) return null;
  return path.slice(match.index + '.body'.length);
}

function pathMatchesPattern(path: string, pattern: string): boolean {
  if (pattern === path) return true;
  if (!pattern.includes('*') && !pattern.startsWith('$')) {
    return path === `$.${pattern}` || path.endsWith(`.${pattern}`) || path.endsWith(`[${pattern}]`);
  }

  const regex = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`);
  return regex.test(path);
}
