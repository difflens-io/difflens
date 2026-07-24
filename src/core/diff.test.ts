import { describe, expect, it } from 'vitest';
import { detectFormat } from './detect';
import { compareInputs, DEFAULT_OPTIONS, preview } from './diff';

const PLAIN_TEXT_LEFT =
  '38636134376266626134383134613436386131663064333734303730313165352C323032362D30372D32312031313A30363A31362C31302E38302E37372E36322C71697579616E672E7A6875';
const PLAIN_TEXT_RIGHT =
  '38636134376266626134383134613436386131663064333734303730313165352C323032362D30372D32332031303A34343A33332C31302E37332E39312E3133382C71697579616E672E7A6875';

describe('compareInputs', () => {
  it('compares JSON by path and applies default ignored fields', () => {
    const result = compareInputs(
      '{"id":1,"name":"Ada","updatedAt":"old","flags":{"beta":false}}',
      '{"id":1,"name":"Ada Lovelace","updatedAt":"new","flags":{"beta":true}}',
      'auto',
      DEFAULT_OPTIONS
    );

    expect(result.mode).toBe('structured');
    expect(result.items.map((item) => item.path)).toEqual(['$.name', '$.flags.beta']);
  });

  it('compares keyed arrays by configured object key', () => {
    const result = compareInputs(
      '[{"id":"free","limit":10},{"id":"pro","limit":100}]',
      '[{"id":"pro","limit":200},{"id":"free","limit":10}]',
      'json',
      DEFAULT_OPTIONS
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].path).toBe('$[pro].limit');
  });

  it('compares CSV cells with a primary key column', () => {
    const result = compareInputs(
      'id,name,status\n1,Ada,pending\n2,Linus,paid',
      'id,name,status\n1,Ada,paid\n3,Grace,pending',
      'auto',
      { ...DEFAULT_OPTIONS, csvKey: 'id' }
    );

    expect(result.mode).toBe('table');
    expect(result.stats.modified).toBe(1);
    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(1);
  });

  it('compares Cookie headers by cookie name', () => {
    const result = compareInputs(
      'Cookie: sid=abc; theme=light; locale=zh-CN',
      'Cookie: sid=xyz; theme=light; cart=2',
      'auto',
      DEFAULT_OPTIONS
    );

    expect(result.kind).toBe('cookie');
    expect(result.mode).toBe('structured');
    expect(result.items.map((item) => item.path)).toEqual([
      '$.sid.value',
      '$.locale',
      '$.cart'
    ]);
    expect(result.stats.modified).toBe(1);
    expect(result.stats.removed).toBe(1);
    expect(result.stats.added).toBe(1);
  });

  it('detects Markdown and compares it as document text', () => {
    const result = compareInputs(
      '# Guide\n\n- Install\n- Run\n',
      '# Guide\n\n- Install\n- Deploy\n',
      'auto',
      DEFAULT_OPTIONS
    );

    expect(result.kind).toBe('markdown');
    expect(result.label).toBe('Markdown');
    expect(result.mode).toBe('text');
    expect(result.textRows.some((row) => row.type === 'modified')).toBe(true);
  });

  it('compares TOML by path', () => {
    const result = compareInputs(
      'title = "DiffLens"\n\n[server]\nhost = "localhost"\nport = 8080\n',
      'title = "DiffLens"\n\n[server]\nhost = "0.0.0.0"\nport = 9090\ntls = true\n',
      'auto',
      DEFAULT_OPTIONS
    );

    expect(result.kind).toBe('toml');
    expect(result.mode).toBe('structured');
    expect(result.items.map((item) => item.path)).toEqual([
      '$.server.host',
      '$.server.port',
      '$.server.tls'
    ]);
  });

  it('detects curl commands before Cookie and compares HTTP fields', () => {
    const result = compareInputs(
      `curl -X POST 'https://api.example.com/users?id=42' \\
        -H 'Authorization: Bearer old-token' \\
        -H 'Content-Type: application/json' \\
        -H 'Cookie: sid=abc; theme=light' \\
        --data-raw '{"name":"Ada","role":"viewer"}'`,
      `curl -X POST 'https://api.example.com/users?id=43' \\
        -H 'Authorization: Bearer new-token' \\
        -H 'Content-Type: application/json' \\
        -H 'Cookie: sid=xyz; theme=light' \\
        --data-raw '{"name":"Ada","role":"admin"}'`,
      'auto',
      DEFAULT_OPTIONS
    );

    expect(result.kind).toBe('curl');
    expect(result.mode).toBe('structured');
    expect(result.items.map((item) => item.path)).toEqual([
      '$.url.query.id',
      '$.headers.Authorization',
      '$.cookies.sid',
      '$.body.role'
    ]);
  });

  it('compares JetBrains HTTP Request files by request fields', () => {
    const left = `@host = https://api.example.com

### Create user
POST {{host}}/users?id=42 HTTP/1.1
Authorization: Bearer old-token
Content-Type: application/json
Cookie: sid=abc; theme=light

{"name":"Ada","role":"viewer"}`;

    const right = `@host = https://api.example.com

### Create user
POST {{host}}/users?id=43 HTTP/1.1
Authorization: Bearer new-token
Content-Type: application/json
Cookie: sid=xyz; theme=light

{"name":"Ada","role":"admin"}`;

    const result = compareInputs(left, right, 'auto', DEFAULT_OPTIONS);

    expect(result.kind).toBe('http');
    expect(result.mode).toBe('structured');
    expect(result.items.map((item) => item.path)).toEqual([
      '$.requests[Create user].url.query.id',
      '$.requests[Create user].headers.Authorization',
      '$.requests[Create user].cookies.sid',
      '$.requests[Create user].body.role'
    ]);
  });

  it('compares nested JSON fields inside HTTP Request bodies', () => {
    const left = `### Create user
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{"name":"Ada","profile":{"role":"viewer","active":true}}`;

    const right = `### Create user
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{"name":"Ada","profile":{"role":"admin","active":true}}`;

    const result = compareInputs(left, right, 'http', DEFAULT_OPTIONS);

    expect(result.kind).toBe('http');
    expect(result.mode).toBe('structured');
    expect(result.items.map((item) => item.path)).toEqual([
      '$.requests[Create user].body.profile.role'
    ]);
  });

  it('ignores HTTP Request JSON body paths with body-relative patterns', () => {
    const left = `### Create user
POST https://api.example.com/users?id=42 HTTP/1.1
Content-Type: application/json

{"profile":{"role":"viewer"}}`;

    const right = `### Create user
POST https://api.example.com/users?id=43 HTTP/1.1
Content-Type: application/json

{"profile":{"role":"admin"}}`;

    const rootRelative = compareInputs(left, right, 'http', {
      ...DEFAULT_OPTIONS,
      ignoredPaths: ['$.profile.role']
    });
    const bodyRelative = compareInputs(left, right, 'http', {
      ...DEFAULT_OPTIONS,
      ignoredPaths: ['$.body.profile.role']
    });

    expect(rootRelative.items.map((item) => item.path)).toEqual([
      '$.requests[Create user].url.query.id'
    ]);
    expect(bodyRelative.items.map((item) => item.path)).toEqual([
      '$.requests[Create user].url.query.id'
    ]);
  });

  it('formats JSON bodies inside HTTP Request files', () => {
    const result = detectFormat(
      `@host = https://api.example.com

### Create user
POST {{host}}/users HTTP/1.1
Content-Type: application/json

{"profile":{"role":"viewer"},"name":"Ada"}`,
      'http'
    );

    expect(result.formatted).toBe(`@host = https://api.example.com

### Create user
POST {{host}}/users HTTP/1.1
Content-Type: application/json

{
  "profile": {
    "role": "viewer"
  },
  "name": "Ada"
}`);
  });

  it('compares Set-Cookie attributes', () => {
    const result = compareInputs(
      'Set-Cookie: auth=token; Path=/; HttpOnly; SameSite=Lax',
      'Set-Cookie: auth=token; Path=/; Secure; HttpOnly; SameSite=None',
      'cookie',
      DEFAULT_OPTIONS
    );

    expect(result.kind).toBe('cookie');
    expect(result.items.map((item) => item.path)).toEqual([
      '$.auth.attributes.SameSite',
      '$.auth.attributes.Secure'
    ]);
  });

  it('compares a single long plain text value as one modified row', () => {
    const result = compareInputs(PLAIN_TEXT_LEFT, PLAIN_TEXT_RIGHT, 'auto', DEFAULT_OPTIONS);

    expect(result.mode).toBe('text');
    expect(result.textRows).toHaveLength(1);
    expect(result.textRows[0].type).toBe('modified');
    expect(result.textRows[0].leftText).toBe(PLAIN_TEXT_LEFT);
    expect(result.textRows[0].rightText).toBe(PLAIN_TEXT_RIGHT);
  });

  it('does not abbreviate long values unless requested', () => {
    const value = 'x'.repeat(220);

    expect(preview(value, false)).toBe(value);
    expect(preview(value, true)).toContain('...');
    expect(preview(value, true).length).toBeLessThan(value.length);
  });
});
