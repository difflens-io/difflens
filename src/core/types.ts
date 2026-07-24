export type FormatKind =
  | 'json'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'html'
  | 'markdown'
  | 'curl'
  | 'http'
  | 'csv'
  | 'tsv'
  | 'cookie'
  | 'properties'
  | 'text';

export type FormatMode = 'auto' | FormatKind;

export type DiffType = 'added' | 'removed' | 'modified';

export interface DiffOptions {
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  ignoreKeyOrder: boolean;
  highlightInlineChanges: boolean;
  abbreviateLongValues: boolean;
  showDiffInEditors: boolean;
  showEditorLineNumbers: boolean;
  enableEditorFolding: boolean;
  onlyChanges: boolean;
  ignoredPaths: string[];
  arrayKey: string;
  csvKey: string;
}

export interface ParsedTable {
  delimiter: string;
  hasHeader: boolean;
  headers: string[];
  rows: string[][];
}

export interface DetectionResult {
  kind: FormatKind;
  label: string;
  confidence: number;
  parsed: unknown;
  formatted: string;
  error?: string;
  table?: ParsedTable;
}

export interface DiffItem {
  id: string;
  type: DiffType;
  path: string;
  leftValue?: unknown;
  rightValue?: unknown;
  summary: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  total: number;
}

export interface TextDiffRow {
  id: string;
  type: 'equal' | DiffType;
  leftLine?: number;
  rightLine?: number;
  leftText?: string;
  rightText?: string;
}

export interface CompareResult {
  kind: FormatKind;
  label: string;
  leftDetection: DetectionResult;
  rightDetection: DetectionResult;
  items: DiffItem[];
  stats: DiffStats;
  textRows: TextDiffRow[];
  mode: 'structured' | 'table' | 'text';
  notice?: string;
}
