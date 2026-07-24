# Contributing

Thanks for helping improve DiffLens.

## Development

```bash
npm install
npm run dev
```

## Checks

Before opening a pull request, run:

```bash
npm run test
npm run build
```

## Pull Requests

- Keep changes focused on one behavior or feature.
- Add or update tests when changing parsing, diffing, folding, or editor behavior.
- Avoid committing generated output such as `dist/`, `node_modules/`, `coverage/`, or local environment files.
- Do not add analytics IDs, deployment paths, tokens, or private infrastructure details to committed files.

## Privacy Expectations

DiffLens is designed so user comparison content is processed in the browser and not uploaded. Changes that add network behavior must preserve that expectation and document any new network requests clearly.
