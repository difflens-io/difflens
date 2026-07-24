# Security Policy

## Supported Versions

The `main` branch receives security fixes.

## Reporting a Vulnerability

Please report security issues privately to the project maintainers instead of opening a public issue when the report includes exploit details or sensitive information.

If no dedicated contact is configured yet, create a GitHub security advisory after the repository is published, or contact the maintainer through the repository owner's public profile.

## Privacy-Sensitive Areas

DiffLens is intended to compare user content locally in the browser. Security reviews should pay special attention to:

- any code that sends network requests;
- analytics integrations;
- clipboard and file import handling;
- parser behavior for cURL, HTTP Request, Cookie, and structured data formats.

Analytics must not collect user comparison content, and analytics failures must not block the app.
