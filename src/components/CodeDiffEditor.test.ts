import { foldable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../core/diff';
import { buildEditorDiffModel, buildEditorDiffRows, httpRequestFolding, jsonlFolding } from './CodeDiffEditor';

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

describe('jsonlFolding', () => {
  it('folds formatted JSONL records and nested objects', () => {
    const jsonl = `{
  "id": "a",
  "meta": {
    "count": 1
  }
}
{
  "id": "b"
}`;
    const state = EditorState.create({
      doc: jsonl,
      extensions: [jsonlFolding()]
    });
    const firstRecord = state.doc.line(1);
    const nestedObject = state.doc.line(3);
    const secondRecord = state.doc.line(7);

    expect(foldable(state, firstRecord.from, firstRecord.to)).toEqual({
      from: firstRecord.from + 1,
      to: state.doc.line(6).from
    });
    expect(foldable(state, nestedObject.from, nestedObject.to)).toEqual({
      from: nestedObject.from + nestedObject.text.indexOf('{') + 1,
      to: state.doc.line(5).from + state.doc.line(5).text.indexOf('}')
    });
    expect(foldable(state, secondRecord.from, secondRecord.to)).toEqual({
      from: secondRecord.from + 1,
      to: state.doc.line(9).from
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

  it('keeps editor diff rows for JSONL content larger than 1MB', () => {
    const largePayload = 'x'.repeat(620_000);
    const left = [
      JSON.stringify({ id: 'a', updatedAt: 'old', payload: largePayload }),
      JSON.stringify({ id: 'b', value: 'left', payload: largePayload })
    ].join('\n');
    const right = [
      JSON.stringify({ id: 'a', updatedAt: 'new', payload: largePayload }),
      JSON.stringify({ id: 'b', value: 'right', payload: largePayload })
    ].join('\n');

    expect(left.length + right.length).toBeGreaterThan(1024 * 1024);

    const model = buildEditorDiffModel(left, right, 'jsonl', 'jsonl', {
      ...DEFAULT_OPTIONS,
      ignoredPaths: ['updatedAt']
    });

    expect(model.rows[0].type).toBe('equal');
    expect(model.rows[1].type).toBe('modified');
  });
});
