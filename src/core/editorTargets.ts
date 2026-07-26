import { parseJsonlRecords } from './jsonl';
import type { DiffItem, DiffOptions, FormatKind, TextDiffRow } from './types';

export type EditorTarget = {
  line: number;
  from?: number;
  to?: number;
};

type JsonTarget = {
  path: string;
  from: number;
  to: number;
};

type JsonNode = {
  value: unknown;
  from: number;
  to: number;
  children?: Array<{ key: string | number; node: JsonNode }>;
};

type TargetInput = {
  value: string;
  format: FormatKind;
  item: DiffItem;
  side: 'left' | 'right';
  options: DiffOptions;
  fallbackRow?: TextDiffRow;
};

export function targetForDiffItem({
  value,
  format,
  item,
  side,
  options,
  fallbackRow
}: TargetInput): EditorTarget | undefined {
  if ((side === 'left' && item.type === 'added') || (side === 'right' && item.type === 'removed')) {
    return fallbackTarget(value, fallbackRow, side);
  }

  const pathTarget =
    targetFromTextPath(value, item.path) ??
    targetFromStructuredPath(value, format, item.path, options) ??
    targetFromSimplePath(value, format, item.path);

  return pathTarget ?? fallbackTarget(value, fallbackRow, side);
}

export function targetFromStructuredPath(
  value: string,
  format: FormatKind,
  path: string,
  options: DiffOptions
): EditorTarget | undefined {
  if (format === 'json') return jsonTarget(value, path, options);
  if (format === 'jsonl') return jsonlTarget(value, path, options);
  if (format === 'http') return httpTarget(value, path, options);
  if (format === 'curl') return curlTarget(value, path);
  return undefined;
}

function jsonTarget(value: string, path: string, options: DiffOptions): EditorTarget | undefined {
  const target = collectJsonTargets(value, '$', 0, options).find((item) => item.path === path);
  return target ? spanToTarget(value, target.from, target.to) : undefined;
}

function jsonlTarget(value: string, path: string, options: DiffOptions): EditorTarget | undefined {
  try {
    const spans: JsonTarget[] = [];

    parseJsonlRecords(value).forEach((record, index) => {
      const basePaths = [`$[${index}]`];
      const keyed = keyedArraySegment(record.value, options.arrayKey);
      if (keyed) basePaths.push(`$[${keyed}]`);

      const recordTargets = collectJsonTargets(value.slice(record.from, record.to), '$', record.from, options);
      for (const basePath of basePaths) {
        spans.push(
          ...recordTargets.map((target) => ({
            ...target,
            path: `${basePath}${target.path.slice(1)}`
          }))
        );
      }
    });

    const target = spans.find((item) => item.path === path);
    return target ? spanToTarget(value, target.from, target.to) : undefined;
  } catch {
    return undefined;
  }
}

function httpTarget(value: string, path: string, options: DiffOptions): EditorTarget | undefined {
  const segments = parsePath(path);
  const requestSegmentIndex = segments.findIndex(
    (segment, index) => segment.type === 'prop' && segment.value === 'requests' && segments[index + 1]?.type === 'index'
  );
  const requestKey = requestSegmentIndex >= 0 ? segments[requestSegmentIndex + 1]?.value : '';
  const pathAfterRequest = requestSegmentIndex >= 0 ? segments.slice(requestSegmentIndex + 2) : segments;
  const blocks = splitHttpBlocksWithOffsets(value);

  for (const block of blocks) {
    const requestLine = findHttpRequestLine(value, block);
    if (!requestLine) continue;

    const id = block.name || `${requestLine.method} ${requestLine.url}`;
    if (requestKey && requestKey !== id) continue;

    const requestBase = `$.requests[${escapePathSegment(id)}]`;
    if (path === requestBase || path.endsWith('.method') || path.endsWith('.url.href')) {
      return spanToTarget(value, requestLine.from, requestLine.to);
    }

    const headerName = segmentAfter(pathAfterRequest, 'headers');
    if (headerName) {
      const header = findLineInRange(value, block.from, block.to, (line) =>
        line.trim().toLowerCase().startsWith(`${headerName.toLowerCase()}:`)
      );
      if (header) return spanToTarget(value, header.from, header.to);
    }

    const cookieName = segmentAfter(pathAfterRequest, 'cookies');
    if (cookieName) {
      const cookie = findLineInRange(value, block.from, block.to, (line) =>
        line.toLowerCase().includes('cookie:') && line.includes(cookieName)
      );
      if (cookie) return spanToTarget(value, cookie.from, cookie.to);
    }

    const bodyIndex = pathAfterRequest.findIndex((segment) => segment.type === 'prop' && segment.value === 'body');
    if (bodyIndex >= 0) {
      const body = findHttpBody(value, block);
      if (!body) continue;

      if (bodyIndex === pathAfterRequest.length - 1) {
        return spanToTarget(value, body.from, body.to);
      }

      const bodyPath = `${requestBase}.body${serializeSegments(pathAfterRequest.slice(bodyIndex + 1))}`;
      const target = collectJsonTargets(value.slice(body.from, body.to), `${requestBase}.body`, body.from, options)
        .find((item) => item.path === bodyPath);
      if (target) return spanToTarget(value, target.from, target.to);
    }
  }

  return undefined;
}

function curlTarget(value: string, path: string): EditorTarget | undefined {
  const segments = parsePath(path);
  const headerName = segmentAfter(segments, 'headers');
  const cookieName = segmentAfter(segments, 'cookies');
  const optionName = segmentAfter(segments, 'options');
  const last = lastSegment(segments);

  if (headerName) {
    return lineContaining(value, headerName) ?? lineContaining(value, '-H');
  }

  if (cookieName) {
    return lineContaining(value, cookieName) ?? lineContaining(value, 'Cookie:');
  }

  if (path.startsWith('$.body')) {
    return lineContaining(value, `"${last}"`) ?? lineContaining(value, '--data') ?? lineContaining(value, '-d');
  }

  if (path.startsWith('$.form')) {
    return lineContaining(value, last) ?? lineContaining(value, '--form') ?? lineContaining(value, '-F');
  }

  if (path.startsWith('$.url')) {
    return lineContaining(value, last) ?? lineContaining(value, 'http');
  }

  if (optionName) {
    return lineContaining(value, optionName);
  }

  return undefined;
}

function targetFromSimplePath(value: string, format: FormatKind, path: string): EditorTarget | undefined {
  const segments = parsePath(path);
  const key = lastSegment(segments);
  if (!key) return undefined;

  if (format === 'cookie') {
    return lineContaining(value, `${key}=`) ?? lineContaining(value, key);
  }

  if (format === 'properties' || format === 'toml' || format === 'yaml') {
    return lineMatchingKey(value, key);
  }

  return undefined;
}

function targetFromTextPath(value: string, path: string): EditorTarget | undefined {
  const match = /^line:(\d+)$/.exec(path);
  if (!match) return undefined;
  return lineTarget(value, Number(match[1]));
}

function fallbackTarget(value: string, row: TextDiffRow | undefined, side: 'left' | 'right'): EditorTarget | undefined {
  const line = side === 'left' ? row?.leftLine : row?.rightLine;
  return lineTarget(value, line);
}

function collectJsonTargets(
  source: string,
  basePath: string,
  baseOffset: number,
  options: DiffOptions
): JsonTarget[] {
  try {
    const root = new JsonSourceScanner(source).scan();
    const targets: JsonTarget[] = [];
    collectJsonNodeTargets(root, basePath, targets, options);
    return targets.map((target) => ({
      ...target,
      from: target.from + baseOffset,
      to: target.to + baseOffset
    }));
  } catch {
    return [];
  }
}

function collectJsonNodeTargets(
  node: JsonNode,
  path: string,
  targets: JsonTarget[],
  options: DiffOptions
): void {
  targets.push({ path, from: node.from, to: node.to });

  for (const child of node.children ?? []) {
    if (typeof child.key === 'string') {
      collectJsonNodeTargets(child.node, `${path}.${escapePathSegment(child.key)}`, targets, options);
      continue;
    }

    const indexPath = `${path}[${child.key}]`;
    collectJsonNodeTargets(child.node, indexPath, targets, options);

    const keyed = keyedArraySegment(child.node.value, options.arrayKey);
    if (keyed) collectJsonNodeTargets(child.node, `${path}[${keyed}]`, targets, options);
  }
}

function keyedArraySegment(value: unknown, arrayKey: string): string {
  if (!arrayKey || !value || typeof value !== 'object' || Array.isArray(value)) return '';
  const keyValue = (value as Record<string, unknown>)[arrayKey];
  if (keyValue === undefined || keyValue === null) return '';
  return escapePathSegment(String(keyValue));
}

class JsonSourceScanner {
  private position = 0;

  constructor(private readonly source: string) {}

  scan(): JsonNode {
    this.skipWhitespace();
    const root = this.parseValue();
    this.skipWhitespace();
    if (this.position !== this.source.length) throw new Error('Unexpected JSON content');
    return root;
  }

  private parseValue(): JsonNode {
    this.skipWhitespace();
    const start = this.position;
    const char = this.source[this.position];

    if (char === '{') return this.parseObject(start);
    if (char === '[') return this.parseArray(start);
    if (char === '"') {
      const value = this.parseString();
      return { value, from: start, to: this.position };
    }
    if (char === '-' || /\d/.test(char)) return this.parseNumber(start);
    if (this.source.startsWith('true', this.position)) return this.parseLiteral(start, 'true', true);
    if (this.source.startsWith('false', this.position)) return this.parseLiteral(start, 'false', false);
    if (this.source.startsWith('null', this.position)) return this.parseLiteral(start, 'null', null);

    throw new Error('Unexpected JSON value');
  }

  private parseObject(start: number): JsonNode {
    const children: Array<{ key: string; node: JsonNode }> = [];
    this.expect('{');
    this.skipWhitespace();

    if (this.consume('}')) return { value: {}, from: start, to: this.position, children };

    while (this.position < this.source.length) {
      this.skipWhitespace();
      const key = this.parseString();
      this.skipWhitespace();
      this.expect(':');
      const child = this.parseValue();
      children.push({ key, node: child });
      this.skipWhitespace();

      if (this.consume(',')) continue;
      this.expect('}');
      return {
        value: Object.fromEntries(children.map((item) => [item.key, item.node.value])),
        from: start,
        to: this.position,
        children
      };
    }

    throw new Error('Unterminated JSON object');
  }

  private parseArray(start: number): JsonNode {
    const children: Array<{ key: number; node: JsonNode }> = [];
    this.expect('[');
    this.skipWhitespace();

    if (this.consume(']')) return { value: [], from: start, to: this.position, children };

    while (this.position < this.source.length) {
      const child = this.parseValue();
      children.push({ key: children.length, node: child });
      this.skipWhitespace();

      if (this.consume(',')) continue;
      this.expect(']');
      return {
        value: children.map((item) => item.node.value),
        from: start,
        to: this.position,
        children
      };
    }

    throw new Error('Unterminated JSON array');
  }

  private parseString(): string {
    const start = this.position;
    this.expect('"');

    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (char === '"') {
        this.position += 1;
        return JSON.parse(this.source.slice(start, this.position)) as string;
      }

      this.position += char === '\\' ? 2 : 1;
    }

    throw new Error('Unterminated JSON string');
  }

  private parseNumber(start: number): JsonNode {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    match.lastIndex = this.position;
    const number = match.exec(this.source);
    if (!number) throw new Error('Invalid JSON number');
    this.position = match.lastIndex;
    return { value: Number(number[0]), from: start, to: this.position };
  }

  private parseLiteral(start: number, literal: string, value: unknown): JsonNode {
    this.position += literal.length;
    return { value, from: start, to: this.position };
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length && /\s/.test(this.source[this.position])) {
      this.position += 1;
    }
  }

  private expect(char: string): void {
    if (this.source[this.position] !== char) throw new Error(`Expected ${char}`);
    this.position += 1;
  }

  private consume(char: string): boolean {
    if (this.source[this.position] !== char) return false;
    this.position += 1;
    return true;
  }
}

function splitHttpBlocksWithOffsets(value: string): Array<{ name: string; from: number; to: number }> {
  const lines = sourceLines(value);
  const blocks: Array<{ name: string; from: number; to: number }> = [];
  let name = '';
  let from = 0;
  let hasContent = false;

  for (const line of lines) {
    const separator = /^\s*###\s*(.*)$/.exec(line.text);
    if (separator) {
      if (hasContent) blocks.push({ name, from, to: line.from });
      name = separator[1].trim();
      from = line.from;
      hasContent = false;
      continue;
    }

    if (line.text.trim()) hasContent = true;
  }

  if (hasContent) blocks.push({ name, from, to: value.length });
  return blocks;
}

function findHttpRequestLine(value: string, block: { from: number; to: number }): {
  method: string;
  url: string;
  from: number;
  to: number;
} | undefined {
  for (const line of sourceLines(value, block.from, block.to)) {
    const trimmed = line.text.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || /^###(?:\s|$)/.test(trimmed)) continue;
    if (/^\s*@[\w.-]+\s*=/.test(line.text)) continue;

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;

    if (HTTP_METHODS.has(parts[0].toUpperCase()) && parts[1]) {
      return { method: parts[0].toUpperCase(), url: parts[1], from: line.from, to: line.to };
    }

    if (/^(https?:\/\/|wss?:\/\/|grpc:\/\/|\{\{|\w+:\d+|\/)/i.test(parts[0])) {
      return { method: 'GET', url: parts[0], from: line.from, to: line.to };
    }
  }

  return undefined;
}

function findHttpBody(value: string, block: { from: number; to: number }): { from: number; to: number } | undefined {
  const lines = sourceLines(value, block.from, block.to);
  const requestLineIndex = lines.findIndex((line) => findHttpRequestLine(value, { from: line.from, to: line.to }));
  if (requestLineIndex < 0) return undefined;

  let index = requestLineIndex + 1;
  while (index < lines.length && lines[index].text.trim()) index += 1;
  while (index < lines.length && !lines[index].text.trim()) index += 1;
  if (index >= lines.length) return undefined;

  const scriptIndex = lines.findIndex(
    (line, lineIndex) => lineIndex >= index && /^\s*[<>]\s*\{%/.test(line.text)
  );
  const from = lines[index].from;
  const to = scriptIndex === -1 ? block.to : lines[scriptIndex].from;
  const body = value.slice(from, to);
  const leading = body.match(/^\s*/)?.[0].length ?? 0;
  const trailing = body.match(/\s*$/)?.[0].length ?? 0;
  return from + leading < to - trailing ? { from: from + leading, to: to - trailing } : undefined;
}

function findLineInRange(
  value: string,
  from: number,
  to: number,
  predicate: (line: string) => boolean
): { from: number; to: number } | undefined {
  return sourceLines(value, from, to).find((line) => predicate(line.text));
}

function lineContaining(value: string, text: string): EditorTarget | undefined {
  if (!text) return undefined;
  const line = sourceLines(value).find((item) => item.text.includes(text));
  return line ? spanToTarget(value, line.from, line.to) : undefined;
}

function lineMatchingKey(value: string, key: string): EditorTarget | undefined {
  const escaped = key.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:[\\w"'.-]+\\.)?["']?${escaped}["']?\\s*[:=]`);
  const line = sourceLines(value).find((item) => pattern.test(item.text));
  return line ? spanToTarget(value, line.from, line.to) : undefined;
}

function lineTarget(value: string, lineNumber: number | undefined): EditorTarget | undefined {
  if (!lineNumber || lineNumber < 1) return undefined;
  const line = sourceLines(value).find((item) => item.number === lineNumber);
  return line ? spanToTarget(value, line.from, line.to) : undefined;
}

function spanToTarget(value: string, from: number, to: number): EditorTarget {
  const line = lineNumberAt(value, from);
  return {
    line,
    from: Math.max(0, Math.min(value.length, from)),
    to: Math.max(0, Math.min(value.length, Math.max(from, to)))
  };
}

function sourceLines(value: string, from = 0, to = value.length): Array<{
  text: string;
  from: number;
  to: number;
  number: number;
}> {
  const lines = [];
  let lineFrom = 0;
  let number = 1;

  for (let index = 0; index <= value.length; index += 1) {
    if (index < value.length && value[index] !== '\n') continue;

    const lineTo = index > lineFrom && value[index - 1] === '\r' ? index - 1 : index;
    if (lineTo >= from && lineFrom <= to) {
      lines.push({
        text: value.slice(lineFrom, lineTo),
        from: lineFrom,
        to: lineTo,
        number
      });
    }
    lineFrom = index + 1;
    number += 1;
  }

  return lines;
}

function lineNumberAt(value: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (value[index] === '\n') line += 1;
  }
  return line;
}

type PathSegment =
  | { type: 'prop'; value: string }
  | { type: 'index'; value: string };

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  let index = path.startsWith('$') ? 1 : 0;

  while (index < path.length) {
    if (path[index] === '.') {
      index += 1;
      const { value, next } = readPathPart(path, index, /[.[\]]/);
      segments.push({ type: 'prop', value });
      index = next;
      continue;
    }

    if (path[index] === '[') {
      index += 1;
      const end = path.indexOf(']', index);
      if (end === -1) break;
      segments.push({ type: 'index', value: unescapePathSegment(path.slice(index, end)) });
      index = end + 1;
      continue;
    }

    index += 1;
  }

  return segments;
}

function readPathPart(path: string, start: number, stop: RegExp): { value: string; next: number } {
  let value = '';
  let index = start;

  while (index < path.length) {
    const char = path[index];
    if (char === '\\' && index + 1 < path.length) {
      value += path[index + 1];
      index += 2;
      continue;
    }

    if (stop.test(char)) break;
    value += char;
    index += 1;
  }

  return { value, next: index };
}

function serializeSegments(segments: PathSegment[]): string {
  return segments
    .map((segment) =>
      segment.type === 'prop' ? `.${escapePathSegment(segment.value)}` : `[${escapePathSegment(segment.value)}]`
    )
    .join('');
}

function segmentAfter(segments: PathSegment[], key: string): string {
  const index = segments.findIndex((segment) => segment.type === 'prop' && segment.value === key);
  const next = index >= 0 ? segments[index + 1] : undefined;
  return next?.value ?? '';
}

function lastSegment(segments: PathSegment[]): string {
  return segments[segments.length - 1]?.value ?? '';
}

function escapePathSegment(segment: string): string {
  return segment.replace(/\./g, '\\.');
}

function unescapePathSegment(segment: string): string {
  return segment.replace(/\\\./g, '.');
}

const HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'TRACE',
  'CONNECT',
  'GRAPHQL',
  'GRPC',
  'WEBSOCKET'
]);
