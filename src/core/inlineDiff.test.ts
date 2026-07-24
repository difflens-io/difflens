import { describe, expect, it } from 'vitest';
import { buildInlineDiff } from './inlineDiff';

const PLAIN_TEXT_LEFT =
  '38636134376266626134383134613436386131663064333734303730313165352C323032362D30372D32312031313A30363A31362C31302E38302E37372E36322C71697579616E672E7A6875';
const PLAIN_TEXT_RIGHT =
  '38636134376266626134383134613436386131663064333734303730313165352C323032362D30372D32332031303A34343A33332C31302E37332E39312E3133382C71697579616E672E7A6875';

describe('buildInlineDiff', () => {
  it('highlights inserted characters while keeping common text unmarked', () => {
    const result = buildInlineDiff('abcdef', 'abceedef');

    expect(result.left).toEqual([{ text: 'abcdef', changed: false }]);
    expect(result.right).toEqual([
      { text: 'abc', changed: false },
      { text: 'ee', changed: true, kind: 'added' },
      { text: 'def', changed: false }
    ]);
  });

  it('highlights replaced characters on both sides', () => {
    const result = buildInlineDiff('token-old', 'token-new');

    expect(result.left).toContainEqual({ text: 'old', changed: true, kind: 'removed' });
    expect(result.right).toContainEqual({ text: 'new', changed: true, kind: 'added' });
  });

  it('highlights differences inside one long plain text value', () => {
    const result = buildInlineDiff(PLAIN_TEXT_LEFT, PLAIN_TEXT_RIGHT);
    const leftTail = result.left[result.left.length - 1];
    const rightTail = result.right[result.right.length - 1];

    expect(result.left[0].changed).toBe(false);
    expect(result.right[0].text).toBe(result.left[0].text);
    expect(result.left.some((part) => part.changed && part.kind === 'removed')).toBe(true);
    expect(result.right.some((part) => part.changed && part.kind === 'added')).toBe(true);
    expect(leftTail.changed).toBe(false);
    expect(rightTail.changed).toBe(false);
    expect(leftTail.text.endsWith('71697579616E672E7A6875')).toBe(true);
    expect(rightTail.text.endsWith('71697579616E672E7A6875')).toBe(true);
  });
});
