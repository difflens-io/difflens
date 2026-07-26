# Changelog

This file summarizes DiffLens requirements and implementation changes. Future iterations should be appended by date.

[中文版](CHANGELOG.zh-CN.md)

## 2026-07-26

### JSONL Formatting

- Changed JSONL formatting to pretty-print each record as a JSON block when using "Format inputs".
- Added JSONL parsing support for formatted consecutive JSON values, so structured diffing still works after formatting.
- Added editor folding for formatted JSONL records and nested JSON objects.
- Kept ignored path masking active for formatted JSONL in in-editor diff display.

### Verification

- Expanded the test suite to 30 passing tests covering formatted JSONL parsing, ignored paths, and folding.

### Workspace Focus

- Replaced the always-visible controls, stats, and open-source bands with a compact summary bar and one-at-a-time drawers.
- Kept format and total diff count visible while moving detailed controls, stats, and GitHub trust content behind focused toggles.
- Updated previous / next diff navigation and diff item selection to scroll the input editors to the corresponding changed lines.
- Enabled in-editor diff display by default.
- Moved previous / next diff navigation into a fixed floating control so it remains available after the page scrolls.
- Added path-based editor targeting for structured diffs, including JSON, JSONL, HTTP Request bodies, cURL, Cookie, Properties, TOML, YAML, and text line diffs.
- Added selected-diff highlighting in the input editors and auto-unfolding of folded editor ranges before jumping to a target.
- Fixed the diff navigator list height so long diff lists scroll inside the sidebar instead of leaving unusable blank space.
- Kept the diff sidebar collapse and expand control at the same top position and moved the floating diff navigation away from the sidebar toggle.

## 2026-07-24

### Project Definition

- Selected the project name `DiffLens`.
- Positioned the project as an online text diff tool inspired by IntelliJ IDEA `Compare with Clipboard`.
- Set the core goal: automatically detect text formats, mark only differing items, and reduce noise in structured text comparison.
- Defined the privacy copy: `Structured text diff (local-only comparison, content is not uploaded)`.

### Format Support

- Initial support included JSON, YAML, XML, HTML, CSV, TSV, Properties, Cookie, and Plain Text.
- Added Cookie / Set-Cookie comparison with cookie value and attribute diffs.
- Added Markdown auto-detection and text diffing.
- Added TOML auto-detection, formatting, and structured diffing.
- Added JSONL / NDJSON auto-detection, formatting, and structured diffing.
- Added cURL support, parsing method, URL/query, headers, cookies, JSON body, form data, and options.
- Added JetBrains / IntelliJ `.http` HTTP Request support.
- Fixed cURL being misdetected as Cookie by raising cURL / HTTP Request auto-detection priority.

### Diff Capabilities

- Added structured format output by path for added, removed, and changed items.
- Added CSV / TSV row comparison using primary-key columns.
- Added array object matching by key fields.
- Added key-based JSONL record matching through the existing array key option.
- Added ignore whitespace, ignore case, ignore field order, and ignored paths.
- Added default ignored paths for `timestamp`, `updatedAt`, and `createdAt`.
- Enhanced ignored path matching so HTTP / cURL JSON bodies support body-relative paths such as `$.body.profile.role` and `$.profile.role`.
- Added inline value highlights so only changed fragments are emphasized when field values partially differ.
- Fixed inline highlighting when comparing a single long plain-text value.
- Changed long values to show fully by default and added a "truncate long values" option.

### Editor Experience

- Replaced the left and right input areas with CodeMirror editors.
- Added direct in-editor diff rendering while keeping the editors editable.
- Added line number support.
- Added JSON and HTTP Request folding.
- Added folding of unchanged content when "diff only" is enabled.
- Applied ignore whitespace and ignore case to in-editor diff display.
- Enhanced ignored paths in editor diff display: ignored JSON, JSONL, and HTTP Request JSON body paths are no longer highlighted.
- Added ignored path masking for JSONL editor diff display.
- Added a collapsible diff item sidebar.
- Added draggable resizing for the left and right editors.
- Added synchronized scrolling so either editor can drive both scroll positions when enabled.

### HTTP Request Enhancements

- Added `.http` parsing for variables, `###` request blocks, request lines, headers, cookies, body, pre-request scripts, and response handler scripts.
- Added request block folding similar to the IDEA HTTP Request editor.
- Added JSON object and array folding inside request bodies.
- Added field-level structured diffing for JSON request bodies.
- Added ignored path filtering for JSON request bodies.
- Added `.http` formatting that pretty-prints parseable JSON bodies while preserving variables, separators, request lines, headers, and non-JSON bodies.

### Option Visibility

- Options are shown or hidden based on the selected or detected format to reduce irrelevant controls.
- Markdown and Plain Text use text diffing to avoid unrelated structured-object controls.
- HTTP Request, JSON, Markdown, and related formats support folding controls where applicable.

### Analytics

- Added GA4 support, later changed to use `VITE_GA_MEASUREMENT_ID` for open-source configuration.
- Added Baidu Analytics support, later changed to use `VITE_BAIDU_SITE_ID` for open-source configuration.
- Investigated GA reporting issues through Network requests, backend receiving status, debug mode, filters, and data latency.
- Ensured analytics loading failures do not block the main application.

### Security and Privacy

- Clarified that comparison content is processed locally in the browser and user comparison text is not uploaded.
- Kept the safety notice concise to avoid overwhelming the UI.
- Documented that analytics scripts are for visit metrics only and must not collect comparison content.

### Verification

- Ran `npm run test` multiple times; the current suite has 23 passing tests.
- Ran `npm run build` multiple times; builds pass with only the existing large chunk warning.
- Ran `npm audit --omit=dev` multiple times with 0 vulnerabilities.
- Used browser-level CDP checks for the diff item drawer, editor resize behavior, and synchronized scrolling.

### Open Source Preparation

- Added `.gitignore` for `node_modules/`, `dist/`, `test-results/`, coverage, logs, and local env files.
- Added MIT `LICENSE`.
- Added `CODE_OF_CONDUCT.md`.
- Added `.env.example` to document configurable analytics and deployment environment variables.
- Added `CONTRIBUTING.md` and `SECURITY.md`.
- Added GitHub Actions CI running `npm ci`, `npm run test`, and `npm run build`.
- Added GitHub issue templates and a pull request template.
- Updated `package.json` with description, license, homepage, repository, bugs, keywords, and Node.js engine metadata.
- Upgraded Vitest to `4.1.10` to remove dev dependency audit vulnerabilities.
- Moved GA4, Baidu Analytics, and analytics hosts to Vite environment variable configuration. Analytics is disabled by default in open-source builds.
- Moved the static deployment target to `DIFFLENS_DEPLOY_TARGET`, with local deployment configured through the ignored `.env.deploy.local` file.

### Growth and Discovery

- Added `robots.txt` and `sitemap.xml` for search engine discovery.
- Added `llms.txt` for AI and agent-oriented product discovery.
- Added static SEO entry pages for JSON diff, cURL diff, Cookie diff, HTTP Request diff, TOML diff, and Markdown diff.
- Added a static JSONL diff SEO entry page.
- Added canonical, Open Graph, Twitter Card, and WebApplication structured metadata to the main page.
- Updated README links to drive GitHub visitors to the live site and format-specific entry pages.
- Added a visible open-source GitHub trust strip with source, license, local-first, and Star links.
