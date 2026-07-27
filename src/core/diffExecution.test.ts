import { describe, expect, it } from 'vitest';
import { isLatestWorkerResponse } from './diffWorkerProtocol';
import { JSONL_WORKER_MIN_BYTES, looksLikeJsonl, selectDiffExecutionPlan } from './diffExecution';

function largeJsonl(): string {
  const line = JSON.stringify({ id: 'a', value: 'x'.repeat(1024) });
  const lines = new Array(Math.ceil(JSONL_WORKER_MIN_BYTES / line.length) + 2).fill(line);
  return lines.join('\n');
}

describe('selectDiffExecutionPlan', () => {
  it('keeps small JSONL comparisons on the synchronous path', () => {
    expect(selectDiffExecutionPlan({
      left: '{"id":"a"}\n{"id":"b"}',
      right: '{"id":"a"}\n{"id":"b","value":1}',
      formatMode: 'jsonl'
    })).toBe('sync');
  });

  it('routes large forced JSONL comparisons to the worker path', () => {
    const value = largeJsonl();

    expect(selectDiffExecutionPlan({
      left: value,
      right: value,
      formatMode: 'jsonl'
    })).toBe('worker');
  });

  it('routes large auto-detected JSONL comparisons to the worker path', () => {
    const value = largeJsonl();

    expect(looksLikeJsonl(value)).toBe(true);
    expect(selectDiffExecutionPlan({
      left: value,
      right: value,
      formatMode: 'auto'
    })).toBe('worker');
  });

  it('keeps non-JSONL large content on the synchronous path', () => {
    const value = 'plain text\n'.repeat(140_000);

    expect(selectDiffExecutionPlan({
      left: value,
      right: value,
      formatMode: 'text'
    })).toBe('sync');
  });
});

describe('diff worker protocol', () => {
  it('rejects stale worker responses', () => {
    expect(isLatestWorkerResponse(12, 11)).toBe(false);
    expect(isLatestWorkerResponse(12, 12)).toBe(true);
  });
});
