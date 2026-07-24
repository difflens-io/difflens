export const JSON_LEFT = `{
  "service": "billing",
  "version": "1.8.0",
  "updatedAt": "2026-07-21T08:00:00Z",
  "features": {
    "refunds": true,
    "auditLog": false
  },
  "limits": [
    { "id": "free", "requests": 1000 },
    { "id": "pro", "requests": 20000 }
  ]
}`;

export const JSON_RIGHT = `{
  "service": "billing",
  "version": "1.9.0",
  "updatedAt": "2026-07-22T09:30:00Z",
  "features": {
    "refunds": true,
    "auditLog": true,
    "exports": true
  },
  "limits": [
    { "id": "free", "requests": 1000 },
    { "id": "pro", "requests": 50000 }
  ]
}`;

export const CSV_LEFT = `id,name,status,total
1001,Ada,paid,39.90
1002,Linus,pending,18.00
1003,Grace,paid,72.50`;

export const CSV_RIGHT = `id,name,status,total
1001,Ada,paid,39.90
1002,Linus,paid,18.00
1004,Ken,pending,64.00`;

export const COOKIE_LEFT = `Cookie: session=abc123; theme=light; locale=zh-CN; cart=7
Set-Cookie: auth=old-token; Path=/; HttpOnly; SameSite=Lax`;

export const COOKIE_RIGHT = `Cookie: session=xyz789; theme=dark; locale=zh-CN; tracking=enabled
Set-Cookie: auth=new-token; Path=/; Secure; HttpOnly; SameSite=None`;

export const MARKDOWN_LEFT = `# DiffLens

DiffLens compares structured text in the browser.

## Formats

- JSON
- YAML
- Cookie

\`\`\`json
{"enabled": true}
\`\`\`
`;

export const MARKDOWN_RIGHT = `# DiffLens

DiffLens compares structured and document text in the browser.

## Formats

- JSON
- YAML
- TOML
- Markdown

\`\`\`json
{"enabled": false}
\`\`\`
`;

export const TOML_LEFT = `title = "DiffLens"
enabled = true

[server]
host = "localhost"
port = 8080

[[formats]]
name = "json"
enabled = true
`;

export const TOML_RIGHT = `title = "DiffLens"
enabled = true

[server]
host = "0.0.0.0"
port = 9090

[[formats]]
name = "json"
enabled = true

[[formats]]
name = "toml"
enabled = true
`;

export const CURL_LEFT = `curl -X POST 'https://api.example.com/users?id=42' \\
  -H 'Authorization: Bearer old-token' \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: sid=abc; theme=light' \\
  --data-raw '{"name":"Ada","role":"viewer","active":true}'`;

export const CURL_RIGHT = `curl -X POST 'https://api.example.com/users?id=43' \\
  -H 'Authorization: Bearer new-token' \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: sid=xyz; theme=light' \\
  --data-raw '{"name":"Ada","role":"admin","active":true}'`;

export const HTTP_REQUEST_LEFT = `@host = https://api.example.com

### Create user
POST {{host}}/users?id=42 HTTP/1.1
Authorization: Bearer old-token
Content-Type: application/json
Cookie: sid=abc; theme=light

{
  "name": "Ada",
  "role": "viewer",
  "active": true
}`;

export const HTTP_REQUEST_RIGHT = `@host = https://api.example.com

### Create user
POST {{host}}/users?id=43 HTTP/1.1
Authorization: Bearer new-token
Content-Type: application/json
Cookie: sid=xyz; theme=light

{
  "name": "Ada",
  "role": "admin",
  "active": true
}`;
