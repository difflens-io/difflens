import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from './core/diff';
import { effectiveEditorOptions } from './App';

describe('effectiveEditorOptions', () => {
  it('keeps editor diff features enabled when comparison is not pending', () => {
    const options = {
      ...DEFAULT_OPTIONS,
      showDiffInEditors: true,
      enableEditorFolding: true,
      onlyChanges: true,
      highlightInlineChanges: true
    };

    expect(effectiveEditorOptions(options, false)).toMatchObject({
      showDiffInEditors: true,
      enableEditorFolding: true,
      onlyChanges: true,
      highlightInlineChanges: true
    });
  });

  it('only pauses editor diff features during pending comparison updates', () => {
    const options = {
      ...DEFAULT_OPTIONS,
      showDiffInEditors: true,
      enableEditorFolding: true,
      onlyChanges: true,
      highlightInlineChanges: true
    };

    expect(effectiveEditorOptions(options, true)).toMatchObject({
      showDiffInEditors: false,
      enableEditorFolding: false,
      onlyChanges: false,
      highlightInlineChanges: false
    });
  });
});
