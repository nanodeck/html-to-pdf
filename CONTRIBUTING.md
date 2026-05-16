# Contributing

Thanks for helping improve HTML to PDF API. This guide covers how to set up the project, run checks, and submit changes.

## Prerequisites

- Node.js 24 (see `.node-version`)
- pnpm 9 (enable via `corepack enable`)

If Playwright browsers are missing, install Chromium:

```bash
pnpm exec playwright install chromium
```

## Setup

```bash
pnpm install
cp .env.example .env
```

## Run the App

```bash
pnpm dev
```

## Run Checks

```bash
pnpm lint
pnpm test
pnpm typecheck
```

## Pull Requests

- Keep changes focused and scoped.
- Update or add tests when behavior changes.
- Update documentation when adding or changing configuration and endpoints.
- Ensure checks are passing before requesting review.

## Security Issues

Please report security issues privately. See `SECURITY.md`.
