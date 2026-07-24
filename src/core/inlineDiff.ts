import { diffChars } from 'diff';

export interface InlineDiffPart {
  text: string;
  changed: boolean;
  kind?: 'added' | 'removed';
}

export interface InlineDiffResult {
  left: InlineDiffPart[];
  right: InlineDiffPart[];
}

export function buildInlineDiff(left: string, right: string): InlineDiffResult {
  if (left === right) {
    return {
      left: [{ text: left, changed: false }],
      right: [{ text: right, changed: false }]
    };
  }

  const changes = diffChars(left, right, { maxEditLength: 6000 });
  if (!changes) {
    return {
      left: [{ text: left, changed: true, kind: 'removed' }],
      right: [{ text: right, changed: true, kind: 'added' }]
    };
  }

  const result: InlineDiffResult = {
    left: [],
    right: []
  };

  for (const change of changes) {
    if (!change.value) continue;

    if (change.added) {
      appendPart(result.right, {
        text: change.value,
        changed: true,
        kind: 'added'
      });
      continue;
    }

    if (change.removed) {
      appendPart(result.left, {
        text: change.value,
        changed: true,
        kind: 'removed'
      });
      continue;
    }

    appendPart(result.left, {
      text: change.value,
      changed: false
    });
    appendPart(result.right, {
      text: change.value,
      changed: false
    });
  }

  return result;
}

function appendPart(parts: InlineDiffPart[], part: InlineDiffPart): void {
  const previous = parts[parts.length - 1];
  if (previous && previous.changed === part.changed && previous.kind === part.kind) {
    previous.text += part.text;
    return;
  }
  parts.push(part);
}
