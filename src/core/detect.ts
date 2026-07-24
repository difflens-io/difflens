import Papa from 'papaparse';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { DetectionResult, FormatKind, FormatMode, ParsedTable } from './types';

const LABELS: Record<FormatKind, string> = {
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  html: 'HTML',
  markdown: 'Markdown',
  curl: 'cURL',
  http: 'HTTP Request',
  csv: 'CSV',
  tsv: 'TSV',
  cookie: 'Cookie',
  properties: 'Properties',
  text: 'Plain Text'
};

const XML_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false
};

type CookieEntry = {
  value: string;
  attributes?: Record<string, string | true>;
};

type ParsedHttpRequest = Record<string, unknown>;

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

const COOKIE_ATTRIBUTE_NAMES: Record<string, string> = {
  domain: 'Domain',
  expires: 'Expires',
  httponly: 'HttpOnly',
  'max-age': 'Max-Age',
  partitioned: 'Partitioned',
  path: 'Path',
  priority: 'Priority',
  samesite: 'SameSite',
  secure: 'Secure'
};

export function getFormatLabel(kind: FormatKind): string {
  return LABELS[kind];
}

export function detectFormat(raw: string, mode: FormatMode = 'auto'): DetectionResult {
  const text = raw.trim();

  if (!text) {
    return textResult(raw, 1);
  }

  if (mode !== 'auto') {
    return parseForced(raw, mode);
  }

  const candidates: DetectionResult[] = [];

  const json = tryJson(raw);
  if (json) candidates.push(json);

  const xml = tryXml(raw);
  if (xml) candidates.push(xml);

  const curl = tryCurl(raw);
  if (curl) candidates.push(curl);

  const http = tryHttpRequest(raw);
  if (http) candidates.push(http);

  const markdown = tryMarkdown(raw);
  if (markdown) candidates.push(markdown);

  const toml = tryToml(raw);
  if (toml) candidates.push(toml);

  const table = tryDelimited(raw);
  if (table) candidates.push(table);

  const cookie = tryCookie(raw);
  if (cookie) candidates.push(cookie);

  const properties = tryProperties(raw);
  if (properties) candidates.push(properties);

  const yaml = tryYaml(raw);
  if (yaml) candidates.push(yaml);

  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? textResult(raw, 0.2);
}

function parseForced(raw: string, kind: FormatKind): DetectionResult {
  try {
    if (kind === 'json') return tryJson(raw, true)!;
    if (kind === 'yaml') return tryYaml(raw, true)!;
    if (kind === 'toml') return tryToml(raw, true)!;
    if (kind === 'xml' || kind === 'html') return tryXml(raw, true, kind)!;
    if (kind === 'markdown') return tryMarkdown(raw, true)!;
    if (kind === 'curl') return tryCurl(raw, true)!;
    if (kind === 'http') return tryHttpRequest(raw, true)!;
    if (kind === 'csv' || kind === 'tsv') return parseDelimited(raw, kind === 'tsv' ? '\t' : ',');
    if (kind === 'cookie') return tryCookie(raw, true)!;
    if (kind === 'properties') return tryProperties(raw, true)!;
    return textResult(raw, 1);
  } catch (error) {
    return {
      kind,
      label: getFormatLabel(kind),
      confidence: 1,
      parsed: raw,
      formatted: raw,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function tryJson(raw: string, forced = false): DetectionResult | never | null {
  const text = raw.trim();
  if (!forced && !/^[{[]/.test(text)) return null;

  try {
    const parsed = JSON.parse(text);
    return {
      kind: 'json',
      label: LABELS.json,
      confidence: forced ? 1 : 0.98,
      parsed,
      formatted: JSON.stringify(parsed, null, 2)
    };
  } catch (error) {
    if (forced) throw error;
    return null;
  }
}

function tryToml(raw: string, forced = false): DetectionResult | never | null {
  const text = raw.trim();
  const hasTable = /^\s*\[\[?[\w"'.-]+(?:\.[\w"'.-]+)*]]?\s*$/m.test(text);
  const hasTypedPair =
    /^\s*[\w"'.-]+(?:\s*\.\s*[\w"'.-]+)*\s*=\s*(?:"""|'''|"|'|[-+]?\d|true\b|false\b|\[|\{|\d{4}-\d{2}-\d{2})/m.test(text);

  if (!forced && !hasTable && !hasTypedPair) return null;

  try {
    const parsed = parseToml(text);
    const topLevelKeys = parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
    if (!forced && topLevelKeys === 0) return null;

    return {
      kind: 'toml',
      label: LABELS.toml,
      confidence: forced ? 1 : hasTable ? 0.9 : 0.88,
      parsed,
      formatted: stringifyToml(parsed).trimEnd()
    };
  } catch (error) {
    if (forced) throw error;
    return null;
  }
}

function tryCurl(raw: string, forced = false): DetectionResult | never | null {
  const tokens = tokenizeShellCommand(raw);
  const command = normalizeCurlCommand(tokens[0]);

  if (!command) {
    if (forced) throw new Error('未找到 curl 命令');
    return null;
  }

  try {
    const parsed = parseCurlTokens(tokens.slice(1));
    if (!parsed.url) {
      if (forced) throw new Error('未找到 curl 请求 URL');
      return null;
    }

    return {
      kind: 'curl',
      label: LABELS.curl,
      confidence: forced ? 1 : 0.98,
      parsed,
      formatted: raw.trimEnd()
    };
  } catch (error) {
    if (forced) throw error;
    return null;
  }
}

function tryHttpRequest(raw: string, forced = false): DetectionResult | never | null {
  try {
    const parsed = parseHttpRequestText(raw);
    const requestCount = Array.isArray(parsed.requests) ? parsed.requests.length : 0;

    if (requestCount === 0) {
      if (forced) throw new Error('未找到 HTTP Request 请求行');
      return null;
    }

    return {
      kind: 'http',
      label: LABELS.http,
      confidence: forced ? 1 : requestCount > 1 || /(^|\n)\s*###/.test(raw) ? 0.97 : 0.95,
      parsed,
      formatted: formatHttpRequestText(raw)
    };
  } catch (error) {
    if (forced) throw error;
    return null;
  }
}

function formatHttpRequestText(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').trimEnd();
  if (!normalized) return '';

  const output: string[] = [];
  let block: string[] = [];

  for (const line of normalized.split('\n')) {
    if (isHttpRequestSeparator(line.trim())) {
      flushBlock();
      output.push(line.trimEnd());
      continue;
    }

    block.push(line);
  }

  flushBlock();
  return output.join('\n').trimEnd();

  function flushBlock() {
    if (block.length === 0) return;
    const formatted = formatHttpRequestBlockText(block);
    if (formatted) output.push(...formatted.split('\n'));
    block = [];
  }
}

function formatHttpRequestBlockText(lines: string[]): string {
  const normalizedLines = lines.map((line) => line.trimEnd());
  const bodyStart = findHttpRequestBodyStart(normalizedLines);
  if (bodyStart === null) return normalizedLines.join('\n');

  const scriptStart = normalizedLines.findIndex(
    (line, index) => index >= bodyStart && /^\s*[<>]\s*\{%/.test(line)
  );
  const bodyEnd = scriptStart === -1 ? normalizedLines.length : scriptStart;
  const bodyText = normalizedLines.slice(bodyStart, bodyEnd).join('\n').trim();
  const formattedBody = formatJsonRequestBody(bodyText);

  if (formattedBody === null) return normalizedLines.join('\n');

  const next = [
    ...normalizedLines.slice(0, bodyStart),
    ...formattedBody.split('\n')
  ];

  if (scriptStart !== -1) {
    if (next[next.length - 1]?.trim()) next.push('');
    next.push(...normalizedLines.slice(scriptStart));
  }

  return trimTrailingEmptyLines(next).join('\n');
}

function findHttpRequestBodyStart(lines: string[]): number | null {
  let index = 0;

  while (index < lines.length && /^\s*@[\w.-]+\s*=/.test(lines[index])) index += 1;
  while (index < lines.length && isSkippableHttpLine(lines[index])) index += 1;

  if (index >= lines.length || !parseHttpRequestLine(lines[index].trim())) return null;
  index += 1;

  while (index < lines.length) {
    if (!lines[index].trim()) return index + 1;
    index += 1;
  }

  return null;
}

function formatJsonRequestBody(rawBody: string): string | null {
  const text = rawBody.trim();
  if (!/^[{[]/.test(text)) return null;

  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

function trimTrailingEmptyLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && !next[next.length - 1].trim()) next.pop();
  return next;
}

function tokenizeShellCommand(raw: string): string[] {
  const input = raw
    .trim()
    .replace(/^\$\s+/, '')
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^\r?\n/g, ' ');
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === '\\' && index + 1 < input.length) {
        index += 1;
        current += input[index];
      } else {
        current += char;
      }
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === '\\' && index + 1 < input.length) {
      index += 1;
      current += input[index];
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function normalizeCurlCommand(command: string | undefined): string {
  if (!command) return '';
  return /(?:^|[/\\])curl(?:\.exe)?$/i.test(command) ? 'curl' : '';
}

function parseCurlTokens(tokens: string[]): ParsedHttpRequest {
  const headers: Record<string, unknown> = {};
  const cookies: Record<string, string> = {};
  const options: Record<string, unknown> = {};
  const bodyParts: string[] = [];
  const form: Record<string, unknown> = {};
  let method = '';
  let url = '';
  let auth = '';

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const option = splitLongOption(token);

    if (option.name === '--request' || token === '-X' || token.startsWith('-X')) {
      const value = readOptionValue(tokens, index, option.value, token, '-X');
      method = value.value.toUpperCase();
      index = value.index;
      continue;
    }

    if (option.name === '--url') {
      const value = readOptionValue(tokens, index, option.value);
      url = value.value;
      index = value.index;
      continue;
    }

    if (option.name === '--header' || token === '-H' || token.startsWith('-H')) {
      const value = readOptionValue(tokens, index, option.value, token, '-H');
      addHeader(headers, cookies, value.value);
      index = value.index;
      continue;
    }

    if (isCurlDataOption(option.name) || token === '-d' || token.startsWith('-d')) {
      const value = readOptionValue(tokens, index, option.value, token, '-d');
      bodyParts.push(value.value);
      index = value.index;
      continue;
    }

    if (option.name === '--form' || option.name === '--form-string' || token === '-F' || token.startsWith('-F')) {
      const value = readOptionValue(tokens, index, option.value, token, '-F');
      addFormField(form, value.value);
      index = value.index;
      continue;
    }

    if (option.name === '--cookie' || token === '-b' || token.startsWith('-b')) {
      const value = readOptionValue(tokens, index, option.value, token, '-b');
      Object.assign(cookies, cookieEntriesToValues(parseCookieHeader(value.value)));
      index = value.index;
      continue;
    }

    if (option.name === '--user' || token === '-u' || token.startsWith('-u')) {
      const value = readOptionValue(tokens, index, option.value, token, '-u');
      auth = value.value;
      index = value.index;
      continue;
    }

    if (option.name === '--user-agent' || token === '-A' || token.startsWith('-A')) {
      const value = readOptionValue(tokens, index, option.value, token, '-A');
      setRecordValue(headers, 'User-Agent', value.value);
      index = value.index;
      continue;
    }

    if (token === '-I' || option.name === '--head') {
      method = 'HEAD';
      options.head = true;
      continue;
    }

    if (token === '-G' || option.name === '--get') {
      options.get = true;
      continue;
    }

    if (token === '-L' || option.name === '--location') {
      options.followRedirects = true;
      continue;
    }

    if (token === '-k' || option.name === '--insecure') {
      options.insecure = true;
      continue;
    }

    if (option.name) {
      addCurlOption(options, option.name.replace(/^--/, ''), option.value ?? true);
      continue;
    }

    if (token.startsWith('-')) {
      addCurlOption(options, token.replace(/^-+/, ''), true);
      continue;
    }

    url = token;
  }

  if (!method) method = bodyParts.length > 0 && !options.get ? 'POST' : 'GET';

  const model: ParsedHttpRequest = {
    method,
    ...(url ? { url: parseUrlParts(url) } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(Object.keys(cookies).length > 0 ? { cookies } : {}),
    ...(bodyParts.length > 0 ? { body: parseRequestBody(bodyParts.join('&'), headers) } : {}),
    ...(Object.keys(form).length > 0 ? { form } : {}),
    ...(auth ? { auth } : {}),
    ...(Object.keys(options).length > 0 ? { options } : {})
  };

  return model;
}

function splitLongOption(token: string): { name: string; value?: string } {
  if (!token.startsWith('--')) return { name: '' };
  const equalIndex = token.indexOf('=');
  if (equalIndex === -1) return { name: token };
  return {
    name: token.slice(0, equalIndex),
    value: token.slice(equalIndex + 1)
  };
}

function readOptionValue(
  tokens: string[],
  index: number,
  inlineValue?: string,
  token?: string,
  shortPrefix?: string
): { value: string; index: number } {
  if (inlineValue !== undefined) return { value: inlineValue, index };

  if (token && shortPrefix && !token.startsWith('--') && token.length > shortPrefix.length) {
    return { value: token.slice(shortPrefix.length), index };
  }

  return {
    value: tokens[index + 1] ?? '',
    index: index + 1
  };
}

function isCurlDataOption(optionName: string): boolean {
  return [
    '--data',
    '--data-raw',
    '--data-binary',
    '--data-ascii',
    '--data-urlencode',
    '--json'
  ].includes(optionName);
}

function addCurlOption(record: Record<string, unknown>, name: string, value: unknown): void {
  setRecordValue(record, name, value);
}

function parseHttpRequestText(raw: string): ParsedHttpRequest {
  const variables: Record<string, string> = {};
  const requests: ParsedHttpRequest[] = [];
  const blocks = splitHttpRequestBlocks(raw);

  for (const block of blocks) {
    const parsed = parseHttpRequestBlock(block.content, block.name, variables);
    if (parsed) requests.push(parsed);
  }

  return {
    ...(Object.keys(variables).length > 0 ? { variables } : {}),
    requests
  };
}

function splitHttpRequestBlocks(raw: string): Array<{ name: string; content: string }> {
  const blocks: Array<{ name: string; content: string }> = [];
  let currentName = '';
  let current: string[] = [];

  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const separator = /^\s*###\s*(.*)$/.exec(line);
    if (separator) {
      if (current.some((item) => item.trim())) {
        blocks.push({ name: currentName, content: current.join('\n') });
      }
      currentName = separator[1].trim();
      current = [];
      continue;
    }

    current.push(line);
  }

  if (current.some((item) => item.trim())) {
    blocks.push({ name: currentName, content: current.join('\n') });
  }

  return blocks;
}

function parseHttpRequestBlock(
  block: string,
  name: string,
  variables: Record<string, string>
): ParsedHttpRequest | null {
  const lines = block.split('\n');
  let index = 0;

  while (index < lines.length) {
    const variable = /^\s*@([\w.-]+)\s*=\s*(.*)$/.exec(lines[index]);
    if (!variable) break;
    variables[variable[1]] = variable[2].trim();
    index += 1;
  }

  while (index < lines.length && isSkippableHttpLine(lines[index])) index += 1;
  if (index >= lines.length) return null;

  const requestLine = parseHttpRequestLine(resolveHttpVariables(lines[index].trim(), variables));
  if (!requestLine) return null;
  index += 1;

  const headers: Record<string, unknown> = {};
  const cookies: Record<string, string> = {};
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      break;
    }
    if (!isSkippableHttpLine(line)) addHeader(headers, cookies, resolveHttpVariables(line, variables));
    index += 1;
  }

  const bodyLines: string[] = [];
  const scripts: Record<string, string> = {};
  let scriptKind: 'preRequest' | 'responseHandler' | '' = '';
  let scriptBuffer: string[] = [];

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*<\s*\{%/.test(line)) {
      flushScript();
      scriptKind = 'preRequest';
      scriptBuffer.push(line);
      continue;
    }
    if (/^\s*>\s*\{%/.test(line)) {
      flushScript();
      scriptKind = 'responseHandler';
      scriptBuffer.push(line);
      continue;
    }
    if (scriptKind) scriptBuffer.push(line);
    else bodyLines.push(line);
  }
  flushScript();

  const body = bodyLines.join('\n').trim();
  const request: ParsedHttpRequest = {
    id: name || `${requestLine.method} ${requestLine.url}`,
    ...(name ? { name } : {}),
    method: requestLine.method,
    url: parseUrlParts(requestLine.url),
    ...(requestLine.httpVersion ? { httpVersion: requestLine.httpVersion } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(Object.keys(cookies).length > 0 ? { cookies } : {}),
    ...(body ? { body: parseRequestBody(resolveHttpVariables(body, variables), headers) } : {}),
    ...(Object.keys(scripts).length > 0 ? { scripts } : {})
  };

  return request;

  function flushScript() {
    if (!scriptKind || scriptBuffer.length === 0) return;
    scripts[scriptKind] = scriptBuffer.join('\n').trim();
    scriptKind = '';
    scriptBuffer = [];
  }
}

function parseHttpRequestLine(line: string): { method: string; url: string; httpVersion?: string } | null {
  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0].toUpperCase();
  if (HTTP_METHODS.has(first) && parts[1]) {
    return {
      method: first,
      url: parts[1],
      ...(parts[2] ? { httpVersion: parts[2] } : {})
    };
  }

  if (/^(https?:\/\/|wss?:\/\/|grpc:\/\/|\{\{|\w+:\d+|\/)/i.test(parts[0])) {
    return {
      method: 'GET',
      url: parts[0],
      ...(parts[1] ? { httpVersion: parts[1] } : {})
    };
  }

  return null;
}

function isSkippableHttpLine(line: string): boolean {
  const trimmed = line.trim();
  return !trimmed || trimmed.startsWith('#') || trimmed.startsWith('//');
}

function isHttpRequestSeparator(line: string): boolean {
  return /^###(?:\s|$)/.test(line);
}

function resolveHttpVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{\s*([\w.-]+)\s*}}/g, (match, name: string) => variables[name] ?? match);
}

function addHeader(
  headers: Record<string, unknown>,
  cookies: Record<string, string>,
  line: string
): void {
  const [rawName, rawValue] = splitFirst(line, ':');
  if (rawValue === undefined) return;

  const name = normalizeHeaderName(rawName);
  const value = rawValue.trim();
  if (!name) return;

  if (name.toLowerCase() === 'cookie') {
    Object.assign(cookies, cookieEntriesToValues(parseCookieHeader(value)));
    return;
  }

  setRecordValue(headers, name, value);
}

function normalizeHeaderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

function cookieEntriesToValues(entries: Record<string, CookieEntry>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).map(([name, cookie]) => [displayCookieName(name), cookie.value])
  );
}

function addFormField(form: Record<string, unknown>, value: string): void {
  const [name, fieldValue = ''] = splitFirst(value, '=');
  if (!name.trim()) return;
  setRecordValue(form, name.trim(), fieldValue.trim());
}

function parseRequestBody(raw: string, headers: Record<string, unknown>): unknown {
  const value = raw.trim();
  const contentType = String(headers['Content-Type'] ?? '').toLowerCase();
  if (!value) return '';

  if (contentType.includes('application/json') || /^[{[]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    /^[^=&\s]+=[\s\S]*&[^=&\s]+=/m.test(value)
  ) {
    return parseQueryLike(value);
  }

  return value;
}

function parseUrlParts(rawUrl: string): Record<string, unknown> {
  try {
    const parsed = new URL(rawUrl);
    return compactRecord({
      protocol: parsed.protocol.replace(/:$/, ''),
      host: parsed.hostname,
      port: parsed.port || undefined,
      path: parsed.pathname || '/',
      query: parseQueryLike(parsed.searchParams.toString())
    });
  } catch {
    return { raw: rawUrl };
  }
}

function parseQueryLike(value: string): Record<string, unknown> {
  const params = new URLSearchParams(value.replace(/^\?/, ''));
  const record: Record<string, unknown> = {};
  for (const [key, paramValue] of params.entries()) {
    setRecordValue(record, key, paramValue);
  }
  return record;
}

function setRecordValue(record: Record<string, unknown>, key: string, value: unknown): void {
  const current = record[key];
  if (current === undefined) {
    record[key] = value;
    return;
  }

  record[key] = Array.isArray(current) ? [...current, value] : [current, value];
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === undefined) return false;
      if (isPlainRecord(value) && Object.keys(value).length === 0) return false;
      return true;
    })
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function tryMarkdown(raw: string, forced = false): DetectionResult | null {
  const text = raw.trim();

  if (!forced && !looksLikeMarkdown(text)) return null;

  return {
    kind: 'markdown',
    label: LABELS.markdown,
    confidence: forced ? 1 : markdownConfidence(text),
    parsed: raw,
    formatted: raw
  };
}

function looksLikeMarkdown(text: string): boolean {
  const markers = markdownMarkerScore(text);
  return markers.strong || markers.score >= 2;
}

function markdownConfidence(text: string): number {
  const markers = markdownMarkerScore(text);
  if (markers.strong) return 0.83;
  return Math.min(0.78, 0.62 + markers.score * 0.06);
}

function markdownMarkerScore(text: string): { score: number; strong: boolean } {
  const hasFrontmatter = /^---\s*\r?\n[\s\S]+?\r?\n---\s*(?:\r?\n|$)/.test(text);
  const hasHeading = /^\s{0,3}#{1,6}\s+\S/m.test(text);
  const hasFencedCode = /^\s{0,3}(```|~~~)/m.test(text);
  const hasTable =
    /^\s*\|?.+\|.+\r?\n\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text);
  const hasBlockquote = /^\s{0,3}>\s+\S/m.test(text);
  const unorderedListCount = text.match(/^\s{0,3}[-*+]\s+\S/gm)?.length ?? 0;
  const orderedListCount = text.match(/^\s{0,3}\d+\.\s+\S/gm)?.length ?? 0;
  const linkCount = text.match(/!?\[[^\]]+]\([^)]+\)/g)?.length ?? 0;
  const inlineCodeCount = text.match(/`[^`\n]+`/g)?.length ?? 0;

  let score = 0;
  if (hasFrontmatter) score += 2;
  if (hasHeading) score += 2;
  if (hasFencedCode) score += 2;
  if (hasTable) score += 2;
  if (hasBlockquote) score += 1;
  if (unorderedListCount >= 2 || orderedListCount >= 2) score += 2;
  else if (unorderedListCount + orderedListCount === 1) score += 1;
  if (linkCount > 0) score += 1;
  if (inlineCodeCount > 0) score += 1;

  return {
    score,
    strong: hasFrontmatter || hasHeading || hasFencedCode || hasTable
  };
}

function tryYaml(raw: string, forced = false): DetectionResult | never | null {
  const text = raw.trim();
  const yamlLike =
    /^[\w"'-]+:\s/m.test(text) ||
    /^\s*-\s+[\w"'-]+:/m.test(text) ||
    /^---\s*$/m.test(text);

  if (!forced && !yamlLike) return null;

  try {
    const parsed = parseYaml(text);
    const structured = parsed !== null && typeof parsed === 'object';
    if (!forced && !structured) return null;

    return {
      kind: 'yaml',
      label: LABELS.yaml,
      confidence: forced ? 1 : 0.72,
      parsed,
      formatted: stringifyYaml(parsed).trimEnd()
    };
  } catch (error) {
    if (forced) throw error;
    return null;
  }
}

function tryXml(
  raw: string,
  forced = false,
  forcedKind?: 'xml' | 'html'
): DetectionResult | never | null {
  const text = raw.trim();
  if (!forced && !/^<[\s\S]+>$/.test(text)) return null;

  try {
    const parser = new XMLParser(XML_OPTIONS);
    const parsed = parser.parse(text);
    const kind: 'xml' | 'html' =
      forcedKind ?? (/<!doctype html|<html[\s>]|<body[\s>]/i.test(text) ? 'html' : 'xml');

    return {
      kind,
      label: LABELS[kind],
      confidence: forced ? 1 : kind === 'html' ? 0.88 : 0.9,
      parsed,
      formatted: raw
    };
  } catch (error) {
    if (forced) throw error;
    return null;
  }
}

function tryDelimited(raw: string): DetectionResult | null {
  const table = parseTable(raw);
  if (!table || table.rows.length < 2 || table.headers.length < 2) return null;

  const widths = table.rows.map((row) => row.length);
  const commonWidth = mostCommon(widths);
  const consistentRows = widths.filter((width) => width === commonWidth).length;
  const consistency = consistentRows / widths.length;

  if (consistency < 0.65) return null;

  const kind: 'csv' | 'tsv' = table.delimiter === '\t' ? 'tsv' : 'csv';
  return {
    kind,
    label: LABELS[kind],
    confidence: table.hasHeader ? 0.82 : 0.68,
    parsed: table,
    formatted: raw,
    table
  };
}

function parseDelimited(raw: string, delimiter: ',' | '\t'): DetectionResult {
  const table = parseTable(raw, delimiter);
  if (!table) {
    throw new Error(`无法按 ${delimiter === '\t' ? 'TSV' : 'CSV'} 解析输入内容`);
  }

  const kind: 'csv' | 'tsv' = delimiter === '\t' ? 'tsv' : 'csv';
  return {
    kind,
    label: LABELS[kind],
    confidence: 1,
    parsed: table,
    formatted: raw,
    table
  };
}

function tryCookie(raw: string, forced = false): DetectionResult | never | null {
  try {
    const parsed = parseCookieText(raw, forced);
    const count = Object.keys(parsed.record).length;

    if (count === 0) {
      if (forced) throw new Error('未找到可解析的 Cookie 项');
      return null;
    }

    if (!forced && !parsed.explicitHeader && !raw.includes(';')) return null;
    if (!forced && !parsed.explicitHeader && count < 2 && !parsed.setCookieLike) return null;

    return {
      kind: 'cookie',
      label: LABELS.cookie,
      confidence: forced ? 1 : parsed.explicitHeader ? 0.96 : parsed.setCookieLike ? 0.9 : 0.84,
      parsed: parsed.record,
      formatted: formatCookieRecord(parsed.record)
    };
  } catch (error) {
    if (forced) throw error;
    return null;
  }
}

function parseCookieText(
  raw: string,
  forced: boolean
): {
  record: Record<string, CookieEntry>;
  explicitHeader: boolean;
  setCookieLike: boolean;
} {
  const record: Record<string, CookieEntry> = {};
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const explicitLines = lines.filter((line) => /^(cookie|set-cookie)\s*:/i.test(line));
  const sourceLines = explicitLines.length > 0 ? explicitLines : lines;
  let explicitHeader = explicitLines.length > 0;
  let setCookieLike = false;

  if (sourceLines.length === 0) {
    if (forced) throw new Error('Cookie 内容为空');
    return { record, explicitHeader, setCookieLike };
  }

  for (const line of sourceLines) {
    const header = /^(cookie|set-cookie)\s*:\s*(.*)$/i.exec(line);
    const kind = header?.[1]?.toLowerCase();
    const value = header ? header[2] : line;

    if (!value.trim()) continue;

    if (kind === 'set-cookie' || (!kind && isSetCookieLike(value))) {
      const entry = parseSetCookieLine(value);
      if (entry) {
        addCookieEntry(record, entry.name, entry.cookie);
        setCookieLike = true;
      }
      continue;
    }

    const cookies = parseCookieHeader(value);
    for (const [name, cookie] of Object.entries(cookies)) {
      addCookieEntry(record, name, cookie);
    }
  }

  return {
    record,
    explicitHeader,
    setCookieLike
  };
}

function parseCookieHeader(value: string): Record<string, CookieEntry> {
  const record: Record<string, CookieEntry> = {};

  for (const part of splitCookieParts(value)) {
    const pair = parseCookiePair(part);
    if (!pair) continue;
    addCookieEntry(record, pair.name, { value: pair.value });
  }

  return record;
}

function parseSetCookieLine(value: string): { name: string; cookie: CookieEntry } | null {
  const parts = splitCookieParts(value);
  const first = parseCookiePair(parts[0] ?? '');
  if (!first) return null;

  const attributes: Record<string, string | true> = {};

  for (const part of parts.slice(1)) {
    const [rawName, rawValue] = splitFirst(part, '=');
    const name = normalizeCookieAttributeName(rawName.trim());
    if (!name) continue;
    attributes[name] = rawValue === undefined ? true : cleanCookieValue(rawValue.trim());
  }

  return {
    name: first.name,
    cookie: {
      value: first.value,
      ...(Object.keys(attributes).length > 0 ? { attributes } : {})
    }
  };
}

function isSetCookieLike(value: string): boolean {
  const parts = splitCookieParts(value);
  if (parts.length <= 1 || !parseCookiePair(parts[0])) return false;

  return parts
    .slice(1)
    .some((part) => isKnownCookieAttribute(splitFirst(part, '=')[0].trim()));
}

function splitCookieParts(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];

    if (char === '"' && previous !== '\\') quoted = !quoted;

    if (char === ';' && !quoted) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseCookiePair(part: string): { name: string; value: string } | null {
  const [rawName, rawValue] = splitFirst(part, '=');
  if (rawValue === undefined) return null;

  const name = rawName.trim();
  if (!isValidCookieName(name)) return null;

  return {
    name,
    value: cleanCookieValue(rawValue.trim())
  };
}

function splitFirst(value: string, delimiter: string): [string, string?] {
  const index = value.indexOf(delimiter);
  if (index === -1) return [value];
  return [value.slice(0, index), value.slice(index + delimiter.length)];
}

function cleanCookieValue(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function isValidCookieName(name: string): boolean {
  return name.length > 0 && !/[\s;=,]/.test(name);
}

function normalizeCookieAttributeName(name: string): string {
  if (!name) return '';
  return COOKIE_ATTRIBUTE_NAMES[name.toLowerCase()] ?? name;
}

function isKnownCookieAttribute(name: string): boolean {
  return Boolean(COOKIE_ATTRIBUTE_NAMES[name.toLowerCase()]);
}

function addCookieEntry(
  record: Record<string, CookieEntry>,
  name: string,
  cookie: CookieEntry
): void {
  const key = uniqueCookieKey(record, name, cookie);
  record[key] = cookie;
}

function uniqueCookieKey(
  record: Record<string, CookieEntry>,
  name: string,
  cookie: CookieEntry
): string {
  if (!(name in record)) return name;

  const domain = cookie.attributes?.Domain;
  const path = cookie.attributes?.Path;
  const scopedKey =
    typeof domain === 'string' || typeof path === 'string'
      ? `${name}@${String(domain ?? '')}${String(path ?? '')}`
      : '';

  if (scopedKey && !(scopedKey in record)) return scopedKey;

  let index = 2;
  let key = `${name}#${index}`;
  while (key in record) {
    index += 1;
    key = `${name}#${index}`;
  }
  return key;
}

function formatCookieRecord(record: Record<string, CookieEntry>): string {
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, cookie]) => {
      const attributes = Object.entries(cookie.attributes ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([attrName, attrValue]) => (attrValue === true ? attrName : `${attrName}=${attrValue}`));

      return [displayCookieName(name), `${displayCookieName(name)}=${cookie.value}`, ...attributes]
        .slice(1)
        .join('; ');
    })
    .join('\n');
}

function displayCookieName(name: string): string {
  return name.replace(/[@#].*$/, '');
}

function parseTable(raw: string, delimiter?: string): ParsedTable | null {
  const result = Papa.parse<string[]>(raw, {
    delimiter,
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', '\t', ';', '|']
  });

  if (result.errors.length > 0 && result.data.length <= 1) return null;

  const rows = result.data
    .filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0))
    .map((row) => row.map((cell) => String(cell ?? '')));

  if (rows.length === 0) return null;

  const width = mostCommon(rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  });

  const hasHeader = inferHeader(normalizedRows);
  const headers = hasHeader
    ? normalizedRows[0].map((header, index) => header.trim() || `C${index + 1}`)
    : Array.from({ length: width }, (_, index) => `C${index + 1}`);

  return {
    delimiter: result.meta.delimiter || delimiter || ',',
    hasHeader,
    headers,
    rows: hasHeader ? normalizedRows.slice(1) : normalizedRows
  };
}

function inferHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;

  const first = rows[0].map((cell) => cell.trim());
  if (first.some((cell) => cell.length === 0)) return false;
  if (new Set(first).size !== first.length) return false;

  const firstNumeric = first.filter(isNumeric).length;
  const bodyNumeric = rows
    .slice(1, Math.min(rows.length, 8))
    .flat()
    .filter((cell) => isNumeric(cell.trim())).length;
  const bodyCells = rows.slice(1, Math.min(rows.length, 8)).flat().length || 1;

  return firstNumeric / first.length <= 0.25 && bodyNumeric / bodyCells >= 0.15;
}

function tryProperties(raw: string, forced = false): DetectionResult | never | null {
  const parsed: Record<string, string> = {};
  let currentSection = '';
  let matches = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[#!;]/.test(trimmed)) continue;

    const section = /^\[([^\]]+)]$/.exec(trimmed);
    if (section) {
      currentSection = section[1].trim();
      continue;
    }

    const pair = /^([^:=\s][^:=]*?)\s*[:=]\s*(.*)$/.exec(line);
    if (!pair) continue;

    const key = currentSection ? `${currentSection}.${pair[1].trim()}` : pair[1].trim();
    parsed[key] = pair[2].trim();
    matches += 1;
  }

  if (matches === 0) {
    if (forced) throw new Error('未找到 key=value 或 key:value 配置项');
    return null;
  }

  if (!forced && matches < 2) return null;

  return {
    kind: 'properties',
    label: LABELS.properties,
    confidence: forced ? 1 : 0.75,
    parsed,
    formatted: raw
  };
}

function textResult(raw: string, confidence: number): DetectionResult {
  return {
    kind: 'text',
    label: LABELS.text,
    confidence,
    parsed: raw,
    formatted: raw
  };
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

function isNumeric(value: string): boolean {
  if (!value) return false;
  return Number.isFinite(Number(value));
}
