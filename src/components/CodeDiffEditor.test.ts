import { foldable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../core/diff';
import { buildEditorDiffRows, httpRequestFolding } from './CodeDiffEditor';

const HTTP_REQUEST = `### Create user
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{
  "name": "Ada",
  "profile": {
    "role": "admin"
  }
}

### Fetch user
GET https://api.example.com/users/1`;

describe('httpRequestFolding', () => {
  it('folds request blocks and JSON request bodies', () => {
    const state = EditorState.create({
      doc: HTTP_REQUEST,
      extensions: [httpRequestFolding()]
    });

    const separator = state.doc.line(1);
    const requestLine = state.doc.line(2);
    const bodyStart = state.doc.line(5);
    const nestedObject = state.doc.line(7);
    const requestEnd = state.doc.line(10);

    expect(foldable(state, separator.from, separator.to)).toEqual({
      from: separator.to,
      to: requestEnd.to
    });
    expect(foldable(state, requestLine.from, requestLine.to)).toEqual({
      from: requestLine.to,
      to: requestEnd.to
    });
    expect(foldable(state, bodyStart.from, bodyStart.to)).toEqual({
      from: bodyStart.from + 1,
      to: requestEnd.from
    });
    expect(foldable(state, nestedObject.from, nestedObject.to)).toEqual({
      from: nestedObject.to,
      to: state.doc.line(9).from + state.doc.line(9).text.indexOf('}')
    });
  });
});

describe('buildEditorDiffRows', () => {
  it('does not mark ignored JSON field value changes in editor diff rows', () => {
    const rows = buildEditorDiffRows(
      '{"name":"Ada","updatedAt":"old"}',
      '{"name":"Ada","updatedAt":"new"}',
      'json',
      'json',
      { ...DEFAULT_OPTIONS, ignoredPaths: ['updatedAt'] }
    );

    expect(rows.every((row) => row.type === 'equal')).toBe(true);
  });

  it('keeps non-ignored JSON changes visible when another field on the same line is ignored', () => {
    const rows = buildEditorDiffRows(
      '{"name":"Ada","updatedAt":"old"}',
      '{"name":"Grace","updatedAt":"new"}',
      'json',
      'json',
      { ...DEFAULT_OPTIONS, ignoredPaths: ['updatedAt'] }
    );

    expect(rows.some((row) => row.type === 'modified')).toBe(true);
  });

  it('does not mark ignored one-sided JSON field lines in editor diff rows', () => {
    const rows = buildEditorDiffRows(
      `{
  "name": "Ada",
  "updatedAt": "old"
}`,
      `{
  "name": "Ada"
}`,
      'json',
      'json',
      { ...DEFAULT_OPTIONS, ignoredPaths: ['updatedAt'] }
    );

    expect(rows.every((row) => row.type === 'equal')).toBe(true);
  });

  it('does not mark ignored JSONL field changes in editor diff rows', () => {
    const rows = buildEditorDiffRows(
      '{"id":"a","updatedAt":"old"}\n{"id":"b","updatedAt":"old"}',
      '{"id":"a","updatedAt":"new"}\n{"id":"b","updatedAt":"new"}',
      'jsonl',
      'jsonl',
      { ...DEFAULT_OPTIONS, ignoredPaths: ['$.updatedAt'] }
    );

    expect(rows.every((row) => row.type === 'equal')).toBe(true);
  });
});
