import { describe, expect, it } from 'vitest';
import { maskIgnoredPathRanges } from './editorIgnore';

describe('editor ignored path masking', () => {
  it('masks ignored JSON fields without hiding non-ignored changes on the same line', () => {
    const ignoredLeft = '{"name":"Ada","updatedAt":"old"}';
    const ignoredRight = '{"name":"Ada","updatedAt":"new"}';
    const changedLeft = '{"name":"Ada","updatedAt":"old"}';
    const changedRight = '{"name":"Grace","updatedAt":"new"}';

    expect(maskIgnoredPathRanges(ignoredLeft, 'json', ['updatedAt'])).toBe(
      maskIgnoredPathRanges(ignoredRight, 'json', ['updatedAt'])
    );
    expect(maskIgnoredPathRanges(changedLeft, 'json', ['updatedAt'])).not.toBe(
      maskIgnoredPathRanges(changedRight, 'json', ['updatedAt'])
    );
  });

  it('masks JSON body fields inside HTTP Request files with body-relative paths', () => {
    const left = `### Create user
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{"name":"Ada","profile":{"role":"viewer"}}`;

    const right = `### Create user
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{"name":"Ada","profile":{"role":"admin"}}`;

    expect(maskIgnoredPathRanges(left, 'http', ['$.body.profile.role'])).toBe(
      maskIgnoredPathRanges(right, 'http', ['$.body.profile.role'])
    );
    expect(maskIgnoredPathRanges(left, 'http', ['$.requests[Create user].body.profile.role'])).toBe(
      maskIgnoredPathRanges(right, 'http', ['$.requests[Create user].body.profile.role'])
    );
  });
});
