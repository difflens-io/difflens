import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../core/diff';
import { buildCompareOutput, renderCompareMarkdown } from './difflens';

describe('DiffLens CLI output', () => {
  it('serializes structured JSON differences with a stable schema', () => {
    const output = buildCompareOutput({
      left: '{"id":1,"name":"Ada","updatedAt":"old"}',
      right: '{"id":1,"name":"Ada Lovelace","updatedAt":"new"}',
      formatMode: 'auto',
      options: DEFAULT_OPTIONS
    });

    expect(output.schemaVersion).toBe('1.0');
    expect(output.tool).toBe('difflens');
    expect(output.format.kind).toBe('json');
    expect(output.format.mode).toBe('structured');
    expect(output.stats.total).toBe(1);
    expect(output.items).toMatchObject([
      {
        type: 'modified',
        path: '$.name',
        leftPreview: 'Ada',
        rightPreview: 'Ada Lovelace'
      }
    ]);
  });

  it('includes inline value changes for string modifications', () => {
    const output = buildCompareOutput({
      left: 'abcdef',
      right: 'abceedef',
      formatMode: 'text',
      options: DEFAULT_OPTIONS
    });

    expect(output.items[0].inline?.right.some((part) => part.changed && part.text === 'ee')).toBe(true);
  });

  it('applies ignored paths through the shared core options', () => {
    const output = buildCompareOutput({
      left: '{"profile":{"name":"Ada","secret":"old"}}',
      right: '{"profile":{"name":"Ada","secret":"new"}}',
      formatMode: 'json',
      options: {
        ...DEFAULT_OPTIONS,
        ignoredPaths: ['$.profile.secret']
      }
    });

    expect(output.stats.total).toBe(0);
    expect(output.items).toEqual([]);
  });

  it('keeps long value previews untruncated by default', () => {
    const left = `${'a'.repeat(180)}X`;
    const right = `${'a'.repeat(180)}Y`;
    const output = buildCompareOutput({
      left,
      right,
      formatMode: 'text',
      options: DEFAULT_OPTIONS
    });

    expect(output.options.abbreviateLongValues).toBe(false);
    expect(output.items[0].leftPreview).toBe(left);
    expect(output.items[0].rightPreview).toBe(right);
  });

  it('renders a concise markdown summary', () => {
    const output = buildCompareOutput({
      left: 'Cookie: sid=abc; theme=light',
      right: 'Cookie: sid=xyz; theme=light',
      formatMode: 'auto',
      options: DEFAULT_OPTIONS
    });

    expect(renderCompareMarkdown(output)).toContain('- Format: Cookie (cookie)');
    expect(renderCompareMarkdown(output)).toContain('- modified `$.sid.value`');
  });
});
