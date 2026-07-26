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

  it('masks ignored JSONL record fields with root-relative paths', () => {
    const left = [
      '{"id":"a","name":"Ada","updatedAt":"old"}',
      '{"id":"b","name":"Grace","updatedAt":"old"}'
    ].join('\n');
    const right = [
      '{"id":"a","name":"Ada","updatedAt":"new"}',
      '{"id":"b","name":"Grace","updatedAt":"new"}'
    ].join('\n');
    const changed = [
      '{"id":"a","name":"Ada","updatedAt":"new"}',
      '{"id":"b","name":"Linus","updatedAt":"new"}'
    ].join('\n');

    expect(maskIgnoredPathRanges(left, 'jsonl', ['$.updatedAt'])).toBe(
      maskIgnoredPathRanges(right, 'jsonl', ['$.updatedAt'])
    );
    expect(maskIgnoredPathRanges(left, 'jsonl', ['$.updatedAt'])).not.toBe(
      maskIgnoredPathRanges(changed, 'jsonl', ['$.updatedAt'])
    );
  });

  it('masks ignored fields in formatted JSONL blocks', () => {
    const left = `{
  "id": "a",
  "name": "Ada",
  "updatedAt": "old"
}
{
  "id": "b",
  "name": "Grace",
  "updatedAt": "old"
}`;
    const right = `{
  "id": "a",
  "name": "Ada",
  "updatedAt": "new"
}
{
  "id": "b",
  "name": "Grace",
  "updatedAt": "new"
}`;
    const changed = `{
  "id": "a",
  "name": "Ada",
  "updatedAt": "new"
}
{
  "id": "b",
  "name": "Linus",
  "updatedAt": "new"
}`;

    expect(maskIgnoredPathRanges(left, 'jsonl', ['$.updatedAt'])).toBe(
      maskIgnoredPathRanges(right, 'jsonl', ['$.updatedAt'])
    );
    expect(maskIgnoredPathRanges(left, 'jsonl', ['$.updatedAt'])).not.toBe(
      maskIgnoredPathRanges(changed, 'jsonl', ['$.updatedAt'])
    );
  });
});
