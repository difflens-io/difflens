import { isIgnoredPath } from './normalize';
import { parseJsonlRecords } from './jsonl';
import type { FormatKind } from './types';

export type IgnoredSpan = {
  from: number;
  to: number;
};

type JsonSpan = IgnoredSpan & {
  path: string;
};

type SourceLine = {
  text: string;
  from: number;
  to: number;
};

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

export function ignoredPathSpansForEditor(
  value: string,
  format: FormatKind,
  patterns: string[]
): IgnoredSpan[] {
  if (patterns.map((pattern) => pattern.trim()).filter(Boolean).length === 0) return [];

  if (format === 'json') {
    return collectJsonIgnoredSpans(value, '$', 0, patterns);
  }

  if (format === 'jsonl') {
    return collectJsonlIgnoredSpans(value, patterns);
  }

  if (format === 'http') {
    return collectHttpJsonBodyIgnoredSpans(value, patterns);
  }

  return [];
}

export function maskIgnoredPathRanges(
  value: string,
  format: FormatKind,
  patterns: string[]
): string {
  const spans = ignoredPathSpansForEditor(value, format, patterns);
  return maskIgnoredSpans(value, spans);
}

export function maskIgnoredSpans(value: string, spans: IgnoredSpan[]): string {
  if (spans.length === 0) return value;

  let output = '';
  let cursor = 0;

  for (const span of mergeSpans(spans, value.length)) {
    output += value.slice(cursor, span.from);
    output += value
      .slice(span.from, span.to)
      .replace(/[^\r\n]/g, '');
    cursor = span.to;
  }

  return output + value.slice(cursor);
}

function collectJsonIgnoredSpans(
  source: string,
  basePath: string,
  baseOffset: number,
  patterns: string[]
): IgnoredSpan[] {
  try {
    const scanner = new JsonPathScanner(source, basePath, baseOffset);
    const spans = scanner.scan();
    return spans
      .filter((span) => isIgnoredPath(span.path, patterns))
      .map(({ from, to }) => ({ from, to }));
  } catch {
    return [];
  }
}

function collectJsonlIgnoredSpans(value: string, patterns: string[]): IgnoredSpan[] {
  const spans: IgnoredSpan[] = [];
  const propertyPatterns = simpleJsonlPropertyPatterns(patterns);

  try {
    parseJsonlRecords(value).forEach((record, recordIndex) => {
      const recordSource = value.slice(record.from, record.to);
      spans.push(
        ...(propertyPatterns
          ? collectJsonPropertyIgnoredSpans(recordSource, record.from, propertyPatterns)
          : collectJsonIgnoredSpans(recordSource, `$[${recordIndex}]`, record.from, patterns))
      );
    });
  } catch {
    return [];
  }

  return spans;
}

type SimpleJsonlPropertyPattern = {
  key: string;
  rootOnly: boolean;
};

function simpleJsonlPropertyPatterns(patterns: string[]): SimpleJsonlPropertyPattern[] | null {
  const cleanPatterns = patterns.map((pattern) => pattern.trim()).filter(Boolean);
  const simplePatterns: SimpleJsonlPropertyPattern[] = [];

  for (const pattern of cleanPatterns) {
    if (pattern.includes('*')) return null;

    if (/^[^$.[\]]+$/.test(pattern)) {
      simplePatterns.push({ key: pattern, rootOnly: false });
      continue;
    }

    const rootProperty = /^\$\.([^.[\]]+)$/.exec(pattern);
    if (rootProperty) {
      simplePatterns.push({ key: rootProperty[1], rootOnly: true });
      continue;
    }

    return null;
  }

  return simplePatterns;
}

function collectJsonPropertyIgnoredSpans(
  source: string,
  baseOffset: number,
  patterns: SimpleJsonlPropertyPattern[]
): IgnoredSpan[] {
  try {
    return new JsonPropertySpanScanner(source, baseOffset, patterns).scan();
  } catch {
    return [];
  }
}

function collectHttpJsonBodyIgnoredSpans(value: string, patterns: string[]): IgnoredSpan[] {
  const lines = splitSourceLines(value);
  const variables: Record<string, string> = {};
  const spans: IgnoredSpan[] = [];
  let blockLines: SourceLine[] = [];
  let blockName = '';

  for (const line of lines) {
    const separator = /^\s*###\s*(.*)$/.exec(line.text);
    if (separator) {
      spans.push(...collectHttpBlockJsonBodySpans(value, blockLines, blockName, variables, patterns));
      blockLines = [];
      blockName = separator[1].trim();
      continue;
    }

    blockLines.push(line);
  }

  spans.push(...collectHttpBlockJsonBodySpans(value, blockLines, blockName, variables, patterns));
  return spans;
}

function collectHttpBlockJsonBodySpans(
  source: string,
  lines: SourceLine[],
  name: string,
  variables: Record<string, string>,
  patterns: string[]
): IgnoredSpan[] {
  let index = 0;

  while (index < lines.length) {
    const variable = /^\s*@([\w.-]+)\s*=\s*(.*)$/.exec(lines[index].text);
    if (!variable) break;
    variables[variable[1]] = variable[2].trim();
    index += 1;
  }

  while (index < lines.length && isSkippableHttpLine(lines[index].text)) index += 1;
  if (index >= lines.length) return [];

  const requestLine = parseHttpRequestLine(resolveHttpVariables(lines[index].text.trim(), variables));
  if (!requestLine) return [];
  index += 1;

  while (index < lines.length) {
    if (!lines[index].text.trim()) {
      index += 1;
      break;
    }
    index += 1;
  }

  if (index >= lines.length) return [];

  const bodyStartLine = lines[index];
  const scriptIndex = lines.findIndex(
    (line, lineIndex) => lineIndex >= index && /^\s*[<>]\s*\{%/.test(line.text)
  );
  const bodyEndLine = scriptIndex === -1 ? lines[lines.length - 1] : lines[scriptIndex];
  const bodyFrom = bodyStartLine.from;
  const bodyTo = scriptIndex === -1 ? bodyEndLine.to : bodyEndLine.from;
  const bodySource = source.slice(bodyFrom, bodyTo);
  const leadingWhitespace = bodySource.match(/^\s*/)?.[0].length ?? 0;
  const trimmedBody = bodySource.trim();

  if (!/^[{[]/.test(trimmedBody)) return [];

  const id = name || `${requestLine.method} ${requestLine.url}`;
  const basePath = `$.requests[${escapePathSegment(id)}].body`;
  return collectJsonIgnoredSpans(
    trimmedBody,
    basePath,
    bodyFrom + leadingWhitespace,
    patterns
  );
}

function splitSourceLines(value: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;

  for (let index = 0; index <= value.length; index += 1) {
    if (index < value.length && value[index] !== '\n') continue;

    const to = index > from && value[index - 1] === '\r' ? index - 1 : index;
    lines.push({
      text: value.slice(from, to),
      from,
      to
    });
    from = index + 1;
  }

  return lines.length === 0 ? [{ text: '', from: 0, to: 0 }] : lines;
}

function parseHttpRequestLine(line: string): { method: string; url: string } | null {
  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0].toUpperCase();
  if (HTTP_METHODS.has(first) && parts[1]) {
    return {
      method: first,
      url: parts[1]
    };
  }

  if (/^(https?:\/\/|wss?:\/\/|grpc:\/\/|\{\{|\w+:\d+|\/)/i.test(parts[0])) {
    return {
      method: 'GET',
      url: parts[0]
    };
  }

  return null;
}

function isSkippableHttpLine(line: string): boolean {
  const trimmed = line.trim();
  return !trimmed || trimmed.startsWith('#') || trimmed.startsWith('//');
}

function resolveHttpVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{\s*([\w.-]+)\s*}}/g, (match, name: string) => variables[name] ?? match);
}

function mergeSpans(spans: IgnoredSpan[], length: number): IgnoredSpan[] {
  const sorted = spans
    .map((span) => ({
      from: Math.max(0, Math.min(length, span.from)),
      to: Math.max(0, Math.min(length, span.to))
    }))
    .filter((span) => span.from < span.to)
    .sort((left, right) => left.from - right.from || left.to - right.to);

  const merged: IgnoredSpan[] = [];

  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && span.from <= previous.to) {
      previous.to = Math.max(previous.to, span.to);
      continue;
    }

    merged.push({ ...span });
  }

  return merged;
}

function escapePathSegment(segment: string): string {
  return segment.replace(/\./g, '\\.');
}

class JsonPropertySpanScanner {
  private position = 0;
  private readonly spans: IgnoredSpan[] = [];

  constructor(
    private readonly source: string,
    private readonly baseOffset: number,
    private readonly patterns: SimpleJsonlPropertyPattern[]
  ) {}

  scan(): IgnoredSpan[] {
    this.skipWhitespace();
    this.parseValue(0);
    this.skipWhitespace();

    if (this.position !== this.source.length) {
      throw new Error('Unexpected JSON content');
    }

    return this.spans;
  }

  private parseValue(depth: number): IgnoredSpan {
    this.skipWhitespace();
    const start = this.position;
    const char = this.source[this.position];

    if (char === '{') return this.parseObject(depth, start);
    if (char === '[') return this.parseArray(depth, start);
    if (char === '"') {
      this.skipString();
      return { from: start, to: this.position };
    }
    if (char === '-' || /\d/.test(char)) return this.parseNumber(start);
    if (this.source.startsWith('true', this.position)) return this.parseLiteral(start, 'true');
    if (this.source.startsWith('false', this.position)) return this.parseLiteral(start, 'false');
    if (this.source.startsWith('null', this.position)) return this.parseLiteral(start, 'null');

    throw new Error('Unexpected JSON value');
  }

  private parseObject(depth: number, start: number): IgnoredSpan {
    this.expect('{');
    this.skipWhitespace();

    if (this.consume('}')) return { from: start, to: this.position };

    while (this.position < this.source.length) {
      this.skipWhitespace();
      const propertyStart = this.position;
      const key = this.parseStringValue();

      this.skipWhitespace();
      this.expect(':');
      const value = this.parseValue(depth + 1);
      this.skipWhitespace();

      const commaPosition = this.consume(',') ? this.position : null;
      const rangeFrom = commaPosition === null ? this.previousCommaBefore(propertyStart) ?? propertyStart : propertyStart;
      const rangeTo = commaPosition ?? value.to;

      if (this.shouldIgnoreKey(key, depth)) {
        this.spans.push({
          from: this.baseOffset + rangeFrom,
          to: this.baseOffset + rangeTo
        });
      }

      if (commaPosition !== null) continue;
      this.expect('}');
      return { from: start, to: this.position };
    }

    throw new Error('Unterminated JSON object');
  }

  private parseArray(depth: number, start: number): IgnoredSpan {
    this.expect('[');
    this.skipWhitespace();

    if (this.consume(']')) return { from: start, to: this.position };

    while (this.position < this.source.length) {
      this.skipWhitespace();
      this.parseValue(depth + 1);
      this.skipWhitespace();

      if (this.consume(',')) continue;
      this.expect(']');
      return { from: start, to: this.position };
    }

    throw new Error('Unterminated JSON array');
  }

  private shouldIgnoreKey(key: string, depth: number): boolean {
    return this.patterns.some((pattern) => pattern.key === key && (!pattern.rootOnly || depth === 0));
  }

  private parseStringValue(): string {
    const start = this.position;
    this.expect('"');
    const valueStart = this.position;
    let escaped = false;

    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (char === '"') {
        const value = this.source.slice(valueStart, this.position);
        this.position += 1;
        return escaped ? JSON.parse(this.source.slice(start, this.position)) as string : value;
      }

      if (char === '\\') {
        escaped = true;
        this.position += 2;
        continue;
      }

      this.position += 1;
    }

    throw new Error('Unterminated JSON string');
  }

  private skipString(): void {
    this.expect('"');

    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (char === '"') {
        this.position += 1;
        return;
      }

      if (char === '\\') {
        this.position += 2;
        continue;
      }

      this.position += 1;
    }

    throw new Error('Unterminated JSON string');
  }

  private parseNumber(start: number): IgnoredSpan {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    match.lastIndex = this.position;
    const number = match.exec(this.source);
    if (!number) throw new Error('Invalid JSON number');
    this.position = match.lastIndex;
    return { from: start, to: this.position };
  }

  private parseLiteral(start: number, literal: string): IgnoredSpan {
    this.position += literal.length;
    return { from: start, to: this.position };
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length && isJsonWhitespace(this.source[this.position])) {
      this.position += 1;
    }
  }

  private expect(char: string): void {
    if (!this.consume(char)) throw new Error(`Expected ${char}`);
  }

  private consume(char: string): boolean {
    if (this.source[this.position] !== char) return false;
    this.position += 1;
    return true;
  }

  private previousCommaBefore(position: number): number | null {
    let index = position - 1;
    while (index >= 0 && isJsonWhitespace(this.source[index])) index -= 1;
    return this.source[index] === ',' ? index : null;
  }
}

class JsonPathScanner {
  private position = 0;
  private readonly spans: JsonSpan[] = [];

  constructor(
    private readonly source: string,
    private readonly basePath: string,
    private readonly baseOffset: number
  ) {}

  scan(): JsonSpan[] {
    this.skipWhitespace();
    const root = this.parseValue(this.basePath);
    this.skipWhitespace();

    if (this.position !== this.source.length) {
      throw new Error('Unexpected JSON content');
    }

    this.spans.push({
      path: this.basePath,
      from: this.baseOffset + root.from,
      to: this.baseOffset + root.to
    });

    return this.spans;
  }

  private parseValue(path: string): IgnoredSpan {
    this.skipWhitespace();
    const start = this.position;
    const char = this.source[this.position];

    if (char === '{') return this.parseObject(path, start);
    if (char === '[') return this.parseArray(path, start);
    if (char === '"') {
      this.skipString();
      return { from: start, to: this.position };
    }
    if (char === '-' || /\d/.test(char)) return this.parseNumber(start);
    if (this.source.startsWith('true', this.position)) return this.parseLiteral(start, 'true');
    if (this.source.startsWith('false', this.position)) return this.parseLiteral(start, 'false');
    if (this.source.startsWith('null', this.position)) return this.parseLiteral(start, 'null');

    throw new Error('Unexpected JSON value');
  }

  private parseObject(path: string, start: number): IgnoredSpan {
    this.expect('{');
    this.skipWhitespace();

    if (this.consume('}')) return { from: start, to: this.position };

    while (this.position < this.source.length) {
      this.skipWhitespace();
      const propertyStart = this.position;
      const key = this.parseStringValue();
      const childPath = `${path}.${escapePathSegment(key)}`;

      this.skipWhitespace();
      this.expect(':');
      const value = this.parseValue(childPath);
      this.skipWhitespace();

      const commaPosition = this.consume(',') ? this.position : null;
      const rangeFrom = commaPosition === null ? this.previousCommaBefore(propertyStart) ?? propertyStart : propertyStart;
      const rangeTo = commaPosition ?? value.to;

      this.spans.push({
        path: childPath,
        from: this.baseOffset + rangeFrom,
        to: this.baseOffset + rangeTo
      });

      if (commaPosition !== null) continue;
      this.expect('}');
      return { from: start, to: this.position };
    }

    throw new Error('Unterminated JSON object');
  }

  private parseArray(path: string, start: number): IgnoredSpan {
    this.expect('[');
    this.skipWhitespace();

    if (this.consume(']')) return { from: start, to: this.position };

    let index = 0;
    while (this.position < this.source.length) {
      this.skipWhitespace();
      const elementStart = this.position;
      const elementPath = `${path}[${index}]`;
      const value = this.parseValue(elementPath);
      this.skipWhitespace();

      const commaPosition = this.consume(',') ? this.position : null;
      const rangeFrom = commaPosition === null ? this.previousCommaBefore(elementStart) ?? elementStart : elementStart;
      const rangeTo = commaPosition ?? value.to;

      this.spans.push({
        path: elementPath,
        from: this.baseOffset + rangeFrom,
        to: this.baseOffset + rangeTo
      });

      index += 1;
      if (commaPosition !== null) continue;
      this.expect(']');
      return { from: start, to: this.position };
    }

    throw new Error('Unterminated JSON array');
  }

  private parseStringValue(): string {
    const start = this.position;
    this.expect('"');
    const valueStart = this.position;
    let escaped = false;

    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (char === '"') {
        const value = this.source.slice(valueStart, this.position);
        this.position += 1;
        return escaped ? JSON.parse(this.source.slice(start, this.position)) as string : value;
      }

      if (char === '\\') {
        escaped = true;
        this.position += 2;
        continue;
      }

      this.position += 1;
    }

    throw new Error('Unterminated JSON string');
  }

  private skipString(): void {
    this.expect('"');

    while (this.position < this.source.length) {
      const char = this.source[this.position];
      if (char === '"') {
        this.position += 1;
        return;
      }

      if (char === '\\') {
        this.position += 2;
        continue;
      }

      this.position += 1;
    }

    throw new Error('Unterminated JSON string');
  }

  private parseNumber(start: number): IgnoredSpan {
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    match.lastIndex = this.position;
    const number = match.exec(this.source);
    if (!number) throw new Error('Invalid JSON number');
    this.position = match.lastIndex;
    return { from: start, to: this.position };
  }

  private parseLiteral(start: number, literal: string): IgnoredSpan {
    this.position += literal.length;
    return { from: start, to: this.position };
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length && isJsonWhitespace(this.source[this.position])) {
      this.position += 1;
    }
  }

  private expect(char: string): void {
    if (!this.consume(char)) throw new Error(`Expected ${char}`);
  }

  private consume(char: string): boolean {
    if (this.source[this.position] !== char) return false;
    this.position += 1;
    return true;
  }

  private previousCommaBefore(position: number): number | null {
    let index = position - 1;
    while (index >= 0 && isJsonWhitespace(this.source[index])) index -= 1;
    return this.source[index] === ',' ? index : null;
  }
}

function isJsonWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}
