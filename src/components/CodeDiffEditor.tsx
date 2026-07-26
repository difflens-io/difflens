import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { diffLines } from 'diff';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { foldGutter, foldKeymap, foldService } from '@codemirror/language';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view';
import {
  ignoredPathSpansForEditor,
  maskIgnoredPathRanges,
  type IgnoredSpan
} from '../core/editorIgnore';
import { buildInlineDiff } from '../core/inlineDiff';
import type { DiffOptions, FormatKind, TextDiffRow } from '../core/types';

type EditorSide = 'left' | 'right';
type FoldRange = { from: number; to: number };

interface CodeDiffEditorProps {
  value: string;
  otherValue: string;
  side: EditorSide;
  format: FormatKind;
  otherFormat: FormatKind;
  options: DiffOptions;
  onChange: (value: string) => void;
  onScroll?: (side: EditorSide, metrics: EditorScrollMetrics) => void;
}

const setDiffDecorations = StateEffect.define<DecorationSet>();
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

const diffDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiffDecorations)) next = effect.value;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field)
});

class FoldedUnchangedWidget extends WidgetType {
  constructor(private readonly count: number) {
    super();
  }

  toDOM() {
    const node = document.createElement('div');
    node.className = 'cm-folded-unchanged';
    node.textContent = `${this.count} 行相同内容已折叠`;
    return node;
  }
}

export interface EditorScrollMetrics {
  topRatio: number;
  leftRatio: number;
  scrollTop: number;
  scrollLeft: number;
}

export interface CodeDiffEditorHandle {
  scrollToRatio: (topRatio: number, leftRatio: number) => void;
  scrollToLine: (lineNumber?: number) => void;
}

export const CodeDiffEditor = forwardRef<CodeDiffEditorHandle, CodeDiffEditorProps>(function CodeDiffEditor({
  value,
  otherValue,
  side,
  format,
  otherFormat,
  options,
  onChange,
  onScroll
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  const [markdownExtension, setMarkdownExtension] = useState<Extension | null>(null);

  onChangeRef.current = onChange;
  onScrollRef.current = onScroll;

  useImperativeHandle(ref, () => ({
    scrollToRatio(topRatio: number, leftRatio: number) {
      const scroller = viewRef.current?.scrollDOM;
      if (!scroller) return;

      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollTop = maxTop * topRatio;
      scroller.scrollLeft = maxLeft * leftRatio;
    },
    scrollToLine(lineNumber?: number) {
      const view = viewRef.current;
      if (!view || !lineNumber || lineNumber < 1 || lineNumber > view.state.doc.lines) return;

      const line = view.state.doc.line(lineNumber);
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' })
      });
    }
  }), []);

  useEffect(() => {
    if (format !== 'markdown' || markdownExtension) return;

    let cancelled = false;
    import('@codemirror/lang-markdown').then(({ markdown }) => {
      if (!cancelled) setMarkdownExtension(markdown());
    });

    return () => {
      cancelled = true;
    };
  }, [format, markdownExtension]);

  const extensions = useMemo(
    () => buildEditorExtensions(format, options, markdownExtension, (update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString());
    }),
    [format, markdownExtension, options.enableEditorFolding, options.showEditorLineNumbers]
  );

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions
    });
    const view = new EditorView({
      state,
      parent: hostRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions]);

  useEffect(() => {
    const scroller = viewRef.current?.scrollDOM;
    if (!scroller) return;

    function handleScroll() {
      if (!onScrollRef.current || !scroller) return;

      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      onScrollRef.current(side, {
        topRatio: maxTop > 0 ? scroller.scrollTop / maxTop : 0,
        leftRatio: maxLeft > 0 ? scroller.scrollLeft / maxLeft : 0,
        scrollTop: scroller.scrollTop,
        scrollLeft: scroller.scrollLeft
      });
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, [extensions, side]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === value) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value
      }
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: setDiffDecorations.of(
        buildDiffDecorations({
          state: view.state,
          value,
          otherValue,
          side,
          format,
          otherFormat,
          options
        })
      )
    });
  }, [
    value,
    otherValue,
    side,
    format,
    otherFormat,
    options.showDiffInEditors,
    options.highlightInlineChanges,
    options.ignoreCase,
    options.ignoreWhitespace,
    options.onlyChanges,
    options.enableEditorFolding,
    options.ignoredPaths
  ]);

  return <div ref={hostRef} className="code-diff-editor" />;
});

function buildEditorExtensions(
  format: FormatKind,
  options: DiffOptions,
  markdownExtension: Extension | null,
  onUpdate: (update: ViewUpdate) => void
): Extension[] {
  const extensions: Extension[] = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    EditorView.updateListener.of(onUpdate),
    diffDecorationField,
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    EditorView.theme({
      '&': {
        minHeight: '390px',
        backgroundColor: '#fbfdff',
        fontSize: '13px'
      },
      '.cm-scroller': {
        minHeight: '390px',
        maxHeight: '620px',
        overflow: 'auto',
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
      },
      '.cm-content': {
        padding: '12px 0'
      },
      '.cm-line': {
        padding: '0 12px'
      },
      '.cm-gutters': {
        backgroundColor: '#f3f6fa',
        color: '#7a8799',
        borderRight: '1px solid #dce3ee'
      },
      '&.cm-focused': {
        outline: 'none'
      },
      '.cm-activeLine': {
        backgroundColor: '#eef6ff'
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#e7eef8'
      }
    })
  ];

  if (options.showEditorLineNumbers) extensions.push(lineNumbers());
  if (format === 'json' || format === 'jsonl') extensions.push(json());
  if (format === 'markdown' && markdownExtension) extensions.push(markdownExtension);
  if (options.enableEditorFolding) {
    if (format === 'http') extensions.push(httpRequestFolding());
    if (format === 'jsonl') extensions.push(jsonlFolding());
    extensions.push(foldGutter());
  }

  return extensions;
}

export function jsonlFolding(): Extension {
  return foldService.of((state, lineStart) => {
    const line = state.doc.lineAt(lineStart);
    return foldJsonBodyValue(state, line);
  });
}

export function httpRequestFolding(): Extension {
  return foldService.of((state, lineStart, lineEnd) => {
    const line = state.doc.lineAt(lineStart);
    const text = state.sliceDoc(lineStart, lineEnd).trim();

    if (isHttpRequestSeparator(text)) return foldHttpRequestBlock(state, line.number);
    if (isHttpRequestLine(text)) return foldHttpRequestBlock(state, line.number);
    if (isHttpBodyLine(state, line.number)) return foldJsonBodyValue(state, line);
    return null;
  });
}

function foldHttpRequestBlock(state: EditorState, startLineNumber: number): FoldRange | null {
  const startLine = state.doc.line(startLineNumber);
  const endLineNumber = trimTrailingBlankLines(state, findHttpRequestBlockEnd(state, startLineNumber));

  if (endLineNumber <= startLineNumber) return null;

  const endLine = state.doc.line(endLineNumber);
  return startLine.to < endLine.to ? { from: startLine.to, to: endLine.to } : null;
}

function findHttpRequestBlockEnd(state: EditorState, startLineNumber: number): number {
  for (let lineNumber = startLineNumber + 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (isHttpRequestSeparator(state.doc.line(lineNumber).text.trim())) {
      return lineNumber - 1;
    }
  }

  return state.doc.lines;
}

function trimTrailingBlankLines(state: EditorState, lineNumber: number): number {
  let next = lineNumber;
  while (next > 1 && !state.doc.line(next).text.trim()) next -= 1;
  return next;
}

function isHttpBodyLine(state: EditorState, lineNumber: number): boolean {
  let requestLineNumber = 0;

  for (let current = lineNumber - 1; current >= 1; current -= 1) {
    const text = state.doc.line(current).text.trim();
    if (isHttpRequestSeparator(text)) break;
    if (isHttpRequestLine(text)) {
      requestLineNumber = current;
      break;
    }
  }

  if (!requestLineNumber) return false;

  for (let current = requestLineNumber + 1; current < lineNumber; current += 1) {
    const text = state.doc.line(current).text.trim();
    if (isHttpRequestSeparator(text)) return false;
    if (!text) return true;
  }

  return false;
}

function foldJsonBodyValue(state: EditorState, line: ReturnType<EditorState['doc']['line']>): FoldRange | null {
  const openIndex = firstJsonOpeningBracket(line.text);
  if (openIndex < 0) return null;

  const openPosition = line.from + openIndex;
  const closePosition = findMatchingJsonBracket(state, openPosition, line.text[openIndex]);
  if (closePosition === null) return null;

  const closeLine = state.doc.lineAt(closePosition);
  if (closeLine.number <= line.number) return null;

  const from = openPosition + 1;
  const to = closePosition;
  return from < to ? { from, to } : null;
}

function firstJsonOpeningBracket(text: string): number {
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && quoted) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && (char === '{' || char === '[')) return index;
  }

  return -1;
}

function findMatchingJsonBracket(
  state: EditorState,
  openPosition: number,
  openBracket: string
): number | null {
  const closeBracket = openBracket === '{' ? '}' : ']';
  const fullText = state.doc.toString();
  const stack = [openBracket];
  let quoted = false;
  let escaped = false;

  for (let position = openPosition + 1; position < fullText.length; position += 1) {
    const char = fullText[position];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && quoted) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (quoted) continue;

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = stack[stack.length - 1] === '{' ? '}' : ']';
      if (char !== expected) return null;
      stack.pop();

      if (stack.length === 0) {
        return char === closeBracket ? position : null;
      }
    }
  }

  return null;
}

function isHttpRequestSeparator(text: string): boolean {
  return /^###(?:\s|$)/.test(text);
}

function isHttpRequestLine(text: string): boolean {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;

  if (HTTP_METHODS.has(parts[0].toUpperCase()) && Boolean(parts[1])) return true;
  return /^(https?:\/\/|wss?:\/\/|grpc:\/\/|\{\{|\w+:\d+|\/)/i.test(parts[0]);
}

function buildDiffDecorations({
  state,
  value,
  otherValue,
  side,
  format,
  otherFormat,
  options
}: {
  state: EditorState;
  value: string;
  otherValue: string;
  side: EditorSide;
  format: FormatKind;
  otherFormat: FormatKind;
  options: DiffOptions;
}): DecorationSet {
  if (!options.showDiffInEditors) return Decoration.none;

  const leftValue = side === 'left' ? value : otherValue;
  const rightValue = side === 'left' ? otherValue : value;
  const leftFormat = side === 'left' ? format : otherFormat;
  const rightFormat = side === 'left' ? otherFormat : format;
  const leftLines = splitRawLines(leftValue);
  const rightLines = splitRawLines(rightValue);
  const leftIgnoredSpans = ignoredPathSpansForEditor(leftValue, leftFormat, options.ignoredPaths);
  const rightIgnoredSpans = ignoredPathSpansForEditor(rightValue, rightFormat, options.ignoredPaths);
  const rows = buildEditorDiffRows(leftValue, rightValue, leftFormat, rightFormat, options);
  const decorations = [];
  const displayIgnoredSpans = side === 'left' ? leftIgnoredSpans : rightIgnoredSpans;
  const maskedDisplayLines = splitRawLines(
    maskIgnoredPathRanges(value, format, options.ignoredPaths)
  );

  const foldedRanges = options.onlyChanges && options.enableEditorFolding
    ? foldedEqualRanges(rows, side)
    : [];

  for (const range of foldedRanges) {
    const fromLine = safeLine(state, range.from);
    const toLine = safeLine(state, range.to);
    if (!fromLine || !toLine) continue;

    decorations.push(
      Decoration.replace({
        block: true,
        widget: new FoldedUnchangedWidget(range.count)
      }).range(fromLine.from, toLine.to)
    );
  }

  for (const row of rows) {
    const lineNumber = side === 'left' ? row.leftLine : row.rightLine;
    if (!lineNumber || isLineFolded(lineNumber, foldedRanges)) continue;

    const line = safeLine(state, lineNumber);
    if (!line) continue;
    if (isIgnoredOnlyEditorRow(row, side, lineNumber, maskedDisplayLines, displayIgnoredSpans, line)) {
      continue;
    }

    decorations.push(
      Decoration.line({
        class: `cm-diff-line cm-diff-${row.type}`
      }).range(line.from)
    );

    if (
      row.type === 'modified' &&
      options.highlightInlineChanges &&
      row.leftLine &&
      row.rightLine
    ) {
      const leftText = leftLines[row.leftLine - 1] ?? '';
      const rightText = rightLines[row.rightLine - 1] ?? '';
      const inline = buildInlineDiff(leftText, rightText);
      const parts = side === 'left' ? inline.left : inline.right;
      let offset = 0;

      for (const part of parts) {
        const from = line.from + offset;
        const to = from + part.text.length;
        offset += part.text.length;

        if (!part.changed || from === to) continue;
        decorations.push(
          ...inlineMarkRanges(from, Math.min(to, line.to), displayIgnoredSpans).map((range) =>
            Decoration.mark({
              class: `cm-inline-diff cm-inline-${part.kind ?? 'modified'}`
            }).range(range.from, range.to)
          )
        );
      }
    }
  }

  return Decoration.set(decorations, true);
}

export function buildEditorDiffRows(
  left: string,
  right: string,
  leftFormat: FormatKind,
  rightFormat: FormatKind,
  options: DiffOptions
): TextDiffRow[] {
  const leftIgnoredSpans = ignoredPathSpansForEditor(left, leftFormat, options.ignoredPaths);
  const rightIgnoredSpans = ignoredPathSpansForEditor(right, rightFormat, options.ignoredPaths);
  const maskedLeft = maskIgnoredPathRanges(left, leftFormat, options.ignoredPaths);
  const maskedRight = maskIgnoredPathRanges(right, rightFormat, options.ignoredPaths);
  const compareLeft = normalizeForEditorCompare(maskedLeft, options);
  const compareRight = normalizeForEditorCompare(maskedRight, options);
  const changes = diffLines(compareLeft, compareRight);
  const rows: TextDiffRow[] = [];
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

  return rows;
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

function isIgnoredOnlyEditorRow(
  row: TextDiffRow,
  side: EditorSide,
  lineNumber: number,
  maskedLines: string[],
  ignoredSpans: IgnoredSpan[],
  line: ReturnType<EditorState['doc']['line']>
): boolean {
  const oneSidedIgnored =
    ((side === 'left' && row.type === 'removed') || (side === 'right' && row.type === 'added')) &&
    !normalizeMaskedLine(maskedLines[lineNumber - 1] ?? '');

  return oneSidedIgnored && overlapsIgnoredSpan(line.from, line.to, ignoredSpans);
}

function inlineMarkRanges(from: number, to: number, ignoredSpans: IgnoredSpan[]): IgnoredSpan[] {
  let ranges = [{ from, to }];

  for (const ignored of ignoredSpans) {
    const next: IgnoredSpan[] = [];

    for (const range of ranges) {
      if (ignored.to <= range.from || ignored.from >= range.to) {
        next.push(range);
        continue;
      }

      if (ignored.from > range.from) next.push({ from: range.from, to: ignored.from });
      if (ignored.to < range.to) next.push({ from: ignored.to, to: range.to });
    }

    ranges = next;
    if (ranges.length === 0) break;
  }

  return ranges.filter((range) => range.from < range.to);
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

function foldedEqualRanges(
  rows: TextDiffRow[],
  side: EditorSide
): Array<{ from: number; to: number; count: number }> {
  const ranges: Array<{ from: number; to: number; count: number }> = [];
  let start: number | undefined;
  let end: number | undefined;

  for (const row of rows) {
    const lineNumber = side === 'left' ? row.leftLine : row.rightLine;
    const foldable = row.type === 'equal' && lineNumber !== undefined;

    if (foldable) {
      start ??= lineNumber;
      end = lineNumber;
      continue;
    }

    pushFoldRange();
  }

  pushFoldRange();
  return ranges;

  function pushFoldRange() {
    if (start === undefined || end === undefined) {
      start = undefined;
      end = undefined;
      return;
    }

    ranges.push({
      from: start,
      to: end,
      count: end - start + 1
    });
    start = undefined;
    end = undefined;
  }
}

function isLineFolded(
  lineNumber: number,
  ranges: Array<{ from: number; to: number }>
): boolean {
  return ranges.some((range) => lineNumber >= range.from && lineNumber <= range.to);
}

function safeLine(state: EditorState, lineNumber: number) {
  if (lineNumber < 1 || lineNumber > state.doc.lines) return null;
  return state.doc.line(lineNumber);
}

function splitRawLines(value: string): string[] {
  const lines = value.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length === 0 ? [''] : lines;
}
