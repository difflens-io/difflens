---
name: difflens-diff
description: Deterministic local-first structured text comparison using DiffLens. Use when Codex needs to compare, detect, or summarize differences in JSON, JSONL, HTTP Request, cURL, Cookie, YAML, TOML, XML, HTML, CSV, TSV, Markdown, properties, or plain text; when field/path-level diffs, inline value highlights, ignored paths, case/whitespace handling, or stable machine-readable diff output are needed.
---

# DiffLens Diff

Use the bundled script instead of manually simulating structured diffs. It calls the same DiffLens core logic used by the web app, so AI workflows stay aligned with the product behavior.

## Commands

From the DiffLens repository root:

```bash
skills/difflens-diff/scripts/difflens-diff --left-file left.txt --right-file right.txt --format auto --output markdown
```

From inside this skill folder, use:

```bash
scripts/difflens-diff --left '{"id":1}' --right '{"id":2}' --format json --output json
```

If this skill folder is copied outside the repository, set `DIFFLENS_REPO_ROOT` to the DiffLens repository root before running the script.

Use `--output json` for follow-up processing and `--output markdown` for a concise user-facing summary.

## Inputs

- `--left` and `--right`: inline values.
- `--left-file` and `--right-file`: file paths.
- `--format`: `auto`, `json`, `jsonl`, `yaml`, `toml`, `xml`, `html`, `markdown`, `curl`, `http`, `csv`, `tsv`, `cookie`, `properties`, or `text`.
- `--max-items`: cap returned diff items for large inputs.

## Diff Options

- `--ignore-whitespace true|false`
- `--ignore-case true|false`
- `--ignored-path path`: repeatable or comma-separated.
- `--array-key key`: object identity key for arrays.
- `--csv-key key`: row identity key for CSV/TSV.
- `--inline true|false`: include inline changed spans for modified string values.
- `--abbreviate-long-values true|false`: shorten long preview values when needed.
- `--exit-code diff`: return exit code `1` when differences are found.

## Security

The script runs locally and does not upload compared content. Avoid sending sensitive input to external services while preparing, summarizing, or sharing results.
