import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from './diff';
import { targetForDiffItem } from './editorTargets';
import type { DiffItem } from './types';

describe('targetForDiffItem', () => {
  it('locates keyed JSON array paths in formatted JSON input', () => {
    const item = diffItem('$.limits[pro].requests');
    const target = targetForDiffItem({
      value: `{
  "limits": [
    { "id": "free", "requests": 1000 },
    { "id": "pro", "requests": 20000 }
  ]
}`,
      format: 'json',
      item,
      side: 'left',
      options: DEFAULT_OPTIONS
    });

    expect(target?.line).toBe(4);
  });

  it('locates formatted JSONL records by configured array key', () => {
    const item = diffItem('$[checkout].meta.latency');
    const target = targetForDiffItem({
      value: `{
  "id": "login",
  "meta": {
    "latency": 82
  }
}
{
  "id": "checkout",
  "meta": {
    "latency": 240
  }
}`,
      format: 'jsonl',
      item,
      side: 'left',
      options: DEFAULT_OPTIONS
    });

    expect(target?.line).toBe(10);
  });

  it('locates JSON body fields inside HTTP Request blocks', () => {
    const item = diffItem('$.requests[Create user].body.profile.role');
    const target = targetForDiffItem({
      value: `### Create user
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{
  "name": "Ada",
  "profile": {
    "role": "viewer"
  }
}`,
      format: 'http',
      item,
      side: 'left',
      options: DEFAULT_OPTIONS
    });

    expect(target?.line).toBe(8);
  });

  it('falls back to text diff rows for plain text line items', () => {
    const item = diffItem('line:2');
    const target = targetForDiffItem({
      value: 'same\nleft\nsame',
      format: 'text',
      item,
      side: 'left',
      options: DEFAULT_OPTIONS
    });

    expect(target?.line).toBe(2);
  });
});

function diffItem(path: string): DiffItem {
  return {
    id: `modified:${path}`,
    type: 'modified',
    path,
    leftValue: 'left',
    rightValue: 'right',
    summary: 'left -> right'
  };
}
