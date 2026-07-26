export type JsonlRecord = {
  value: unknown;
  from: number;
  to: number;
  line: number;
};

export class JsonlParseError extends Error {
  constructor(message: string, readonly line?: number) {
    super(message);
    this.name = 'JsonlParseError';
  }
}

type LineParseResult =
  | { ok: true; records: JsonlRecord[] }
  | { ok: false; error: JsonlParseError };

export function parseJsonlRecords(source: string): JsonlRecord[] {
  const lineResult = parseLineDelimitedJson(source);
  if (lineResult.ok) return lineResult.records;

  try {
    return parseConsecutiveJsonValues(source);
  } catch (error) {
    if (error instanceof JsonlParseError) throw error;
    throw lineResult.error;
  }
}

function parseLineDelimitedJson(source: string): LineParseResult {
  const records: JsonlRecord[] = [];
  const lines = splitSourceLines(source);

  for (const line of lines) {
    const leadingWhitespace = line.text.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.text.trim();
    if (!trimmed) continue;

    try {
      records.push({
        value: JSON.parse(trimmed),
        from: line.from + leadingWhitespace,
        to: line.from + leadingWhitespace + trimmed.length,
        line: line.number
      });
    } catch (error) {
      return {
        ok: false,
        error: new JsonlParseError(
          `第 ${line.number} 行不是有效 JSONL: ${error instanceof Error ? error.message : String(error)}`,
          line.number
        )
      };
    }
  }

  return { ok: true, records };
}

function parseConsecutiveJsonValues(source: string): JsonlRecord[] {
  const records: JsonlRecord[] = [];
  let position = skipWhitespace(source, 0);

  while (position < source.length) {
    const line = lineNumberAt(source, position);
    const end = readJsonValueEnd(source, position);

    if (end === null) {
      throw new JsonlParseError(`第 ${line} 行不是有效 JSONL`, line);
    }

    const text = source.slice(position, end);
    try {
      records.push({
        value: JSON.parse(text),
        from: position,
        to: end,
        line
      });
    } catch (error) {
      throw new JsonlParseError(
        `第 ${line} 行不是有效 JSONL: ${error instanceof Error ? error.message : String(error)}`,
        line
      );
    }

    position = skipWhitespace(source, end);
  }

  return records;
}

function readJsonValueEnd(source: string, start: number): number | null {
  const char = source[start];

  if (char === '{' || char === '[') return readJsonContainerEnd(source, start);
  if (char === '"') return readJsonStringEnd(source, start);

  const literal = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
  literal.lastIndex = start;
  const match = literal.exec(source);
  return match ? literal.lastIndex : null;
}

function readJsonContainerEnd(source: string, start: number): number | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let position = start; position < source.length; position += 1) {
    const char = source[position];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    if (char !== '}' && char !== ']') continue;
    if (stack.pop() !== char) return null;
    if (stack.length === 0) return position + 1;
  }

  return null;
}

function readJsonStringEnd(source: string, start: number): number | null {
  let escaped = false;

  for (let position = start + 1; position < source.length; position += 1) {
    const char = source[position];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') return position + 1;
  }

  return null;
}

function skipWhitespace(source: string, start: number): number {
  let position = start;
  while (position < source.length && /\s/.test(source[position])) position += 1;
  return position;
}

function lineNumberAt(source: string, offset: number): number {
  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') line += 1;
  }

  return line;
}

function splitSourceLines(source: string): Array<{ text: string; from: number; number: number }> {
  const lines = [];
  let from = 0;
  let number = 1;

  for (let index = 0; index <= source.length; index += 1) {
    if (index < source.length && source[index] !== '\n') continue;

    const to = index > from && source[index - 1] === '\r' ? index - 1 : index;
    lines.push({
      text: source.slice(from, to),
      from,
      number
    });
    from = index + 1;
    number += 1;
  }

  return lines.length === 0 ? [{ text: '', from: 0, number: 1 }] : lines;
}
