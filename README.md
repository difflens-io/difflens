# DiffLens

DiffLens is an online text diff tool for local comparison of JSON, HTTP Request, cURL, Cookie, tabular data, and plain text. Its product subtitle is: `Structured text diff (local-only comparison, content is not uploaded)`.

[Try DiffLens Online](https://www.difflens.io/) · [JSON Diff](https://www.difflens.io/json-diff/) · [cURL Diff](https://www.difflens.io/curl-diff/) · [Cookie Diff](https://www.difflens.io/cookie-diff/) · [HTTP Request Diff](https://www.difflens.io/http-request-diff/)

[中文版](README.zh-CN.md)

## Website

- Main site: <https://www.difflens.io/>

## Core Features

- Automatically detects the input format and renders the diff with format-aware behavior.
- Allows manually selecting a format when auto-detection is not what you want.
- Compares structured formats by field path and only highlights the items that actually differ.
- Compares text formats by line, with inline highlights for changed value fragments.
- Supports reading from clipboard, importing files, swapping left and right inputs, formatting input, copying summaries, and exporting results.
- Runs comparison in the browser; user comparison content is not uploaded.

## Supported Formats

- JSON
- YAML
- TOML
- XML / HTML
- Markdown
- cURL
- JetBrains / IntelliJ `.http` HTTP Request
- CSV / TSV
- Cookie / Set-Cookie
- Java Properties
- Plain Text

## Format Entry Pages

- [JSON Diff Online](https://www.difflens.io/json-diff/)
- [cURL Diff Online](https://www.difflens.io/curl-diff/)
- [Cookie Diff Online](https://www.difflens.io/cookie-diff/)
- [HTTP Request Diff Online](https://www.difflens.io/http-request-diff/)
- [TOML Diff Online](https://www.difflens.io/toml-diff/)
- [Markdown Diff Online](https://www.difflens.io/markdown-diff/)

## Main Capabilities

- Field-level structured diff: JSON, YAML, TOML, XML, HTML, Cookie, Properties, cURL, and HTTP Request use structured diffing.
- Tabular diff: CSV / TSV support row-based and primary-key-column comparison.
- Array keys: JSON, YAML, TOML, and HTTP Request can match array objects by key fields.
- Ignore rules: ignore case, whitespace, field order, and specified paths.
- Long value display: long values are shown in full by default, with an option to truncate them.
- Inline value highlights: when field values or text lines partially differ, only the changed fragments are highlighted.
- In-editor diff display: the left and right editors can render diffs directly while remaining editable.
- Line numbers and folding: editors support line numbers, content folding, and diff-only viewing.
- HTTP Request enhancements: request block folding, JSON body folding, JSON body field-level diffing, ignored paths, and formatting.
- cURL enhancements: parses method, URL/query, headers, cookies, JSON body, form data, and common options.
- Adjustable layout: the diff item sidebar can collapse or expand, and the two input editors can be resized.
- Synchronized scrolling: both editors can scroll together when enabled.
- Privacy notices: the UI clearly states that comparison runs locally and content is not uploaded.

## Security and Privacy

DiffLens performs comparison in the browser. Text pasted, typed, or imported by the user is not uploaded to a server.

The hosted site can optionally include GA4 and Baidu Analytics for page-visit metrics. Analytics must not collect user comparison content, and analytics loading failures must not block the tool. The open-source build disables analytics by default and only enables it through explicit environment variables.

## Strengths

- Higher signal-to-noise ratio for common structured text compared with plain text diff.
- Supports common API debugging inputs such as cURL, Cookie, and HTTP Request.
- Editors can be used for both editing and diff viewing, which is useful for iterative changes.
- Comparison content stays local in the browser, reducing sensitive text exposure risk.
- Static-site deployment is simple and low cost.

## Limitations

- Ignored-path source mapping in the editors focuses on JSON and HTTP Request JSON bodies. Other formats apply ignored paths in the result view, while editor-side visual filtering may fall back to line-level diffing.
- Markdown and Plain Text use document line diffing instead of semantic structural parsing.
- XML / HTML formatting is limited; current support focuses on parsing and path-based comparison.
- cURL and `.http` parsing cover common syntax. Unusual shell syntax, script fragments, or template variables may fall back to raw string comparison.
- The site is available online, but "local-only comparison" means comparison content is not uploaded. It does not mean page assets or analytics scripts are fully offline.

## Tech Stack

- React 19
- TypeScript
- Vite
- CodeMirror
- Vitest
- diff
- fast-xml-parser
- yaml
- smol-toml
- Papa Parse
- lucide-react

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The Vite dev server listens on `0.0.0.0` by default.

## Environment Variables

All environment variables are optional.

```text
VITE_GA_MEASUREMENT_ID=
VITE_BAIDU_SITE_ID=
VITE_ANALYTICS_HOSTS=
DIFFLENS_DEPLOY_TARGET=
```

- `VITE_GA_MEASUREMENT_ID`: GA4 Measurement ID.
- `VITE_BAIDU_SITE_ID`: Baidu Analytics hm.js ID.
- `VITE_ANALYTICS_HOSTS`: comma-separated host allowlist for analytics.
- `DIFFLENS_DEPLOY_TARGET`: static deployment target directory.

## Testing

```bash
npm run test
```

Current tests cover core logic such as format detection, structured diffing, inline text diffing, HTTP Request folding, and the effect of ignored paths on editor diff display.

## Build

```bash
npm run build
```

Build output is written to `dist/`. The Vite base path is `/project/difflens/`.

## Deployment

```bash
./scripts/deploy-static.sh
```

The deployment script syncs `dist/` to:

```text
${DIFFLENS_DEPLOY_TARGET}
```

You can also run:

```bash
npm run deploy:static
```

That command builds first and then deploys.

For local deployment, put `DIFFLENS_DEPLOY_TARGET` in `.env.deploy.local`. This file is ignored by Git.
