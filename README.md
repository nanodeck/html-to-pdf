![CI](https://github.com/nanodeck/html-to-pdf/actions/workflows/ci.yml/badge.svg)
![GitHub Release](https://img.shields.io/github/v/release/nanodeck/html-to-pdf)
![License: MIT](https://img.shields.io/github/license/nanodeck/html-to-pdf)
![Node](https://img.shields.io/badge/node-24-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-Chromium-2EAD33?logo=playwright)
![Docker](https://img.shields.io/badge/ghcr.io-nanodeck%2Fhtml--to--pdf-blue?logo=docker)
![Trivy](https://img.shields.io/badge/Trivy-0%20vulnerabilities-success?logo=aquasecurity)

# HTML to PDF API

Self-hosted API to convert HTML to high-quality PDF documents using headless Chromium. Supports custom page sizes, margins, backgrounds, thumbnails, and file storage. Ships as a lightweight Docker image with an MCP tool for AI agent workflows.

## Features

- **HTML to PDF rendering** — convert any HTML string to a pixel-perfect PDF via Playwright Chromium
- **Thumbnail generation** — automatically generate PNG or JPEG thumbnails of rendered pages
- **File storage & signed URLs** — persist PDFs and thumbnails to local disk, S3, or Google Cloud Storage with time-limited download links
- **Hardened by default** — remote resources blocked unless explicitly enabled (`PDF_ALLOW_REMOTE`)
- **Rate limiting** — built-in configurable rate limiter to protect against abuse
- **OpenAPI documentation** — interactive Scalar UI at `/api`
- **MCP tool** — `html_to_pdf` tool for AI agent and LLM-based workflows
- **Multi-arch Docker image** — linux/amd64 and linux/arm64

## Use Cases

- Generate invoices, receipts, and reports from HTML templates
- Build document generation microservices for SaaS platforms
- Create PDF exports for dashboards, charts, and data visualizations
- Automate PDF generation in CI/CD pipelines
- Integrate PDF rendering into AI agent workflows via MCP

## Quickstart
```bash
docker run --rm -p 3333:3333 \
  -e APP_KEY=$(openssl rand -base64 32) \
  -e NODE_ENV=production \
  ghcr.io/nanodeck/html-to-pdf:latest
```

With all configuration options:

```bash
docker run --rm -p 3333:3333 \
  -e APP_KEY=$(openssl rand -base64 32) \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3333 \
  -e LOG_LEVEL=info \
  -e APP_URL=http://localhost:3333 \
  -e REQUEST_BODY_LIMIT=5mb \
  -e PDF_MAX_HTML_SIZE=2097152 \
  -e PDF_ALLOW_REMOTE=false \
  -e PDF_TIMEOUT_MS=20000 \
  -e PDF_NAVIGATION_TIMEOUT_MS=10000 \
  -e PDF_STORAGE_ENABLED=false \
  -e RATE_LIMIT_REQUESTS=60 \
  -e RATE_LIMIT_DURATION="1 minute" \
  -e RATE_LIMIT_BLOCK_FOR="5 minutes" \
  ghcr.io/nanodeck/html-to-pdf:latest
```

Try it:
```bash
curl -X POST http://localhost:3333/api/pdf \
  -H 'Content-Type: application/json' \
  -d '{"html":"<h1>Hello PDF</h1>"}' | jq -r .data | base64 -d > hello.pdf
```

OpenAPI UI: `http://localhost:3333/api`

## API

### Health
`GET /health`

### Generate PDF
`POST /api/pdf`

Request body:
```json
{
  "html": "<html><body><h1>Hello PDF</h1></body></html>",
  "options": {
    "format": "A4",
    "landscape": false,
    "printBackground": true,
    "scale": 1,
    "margin": { "top": "1cm", "right": "1cm", "bottom": "1cm", "left": "1cm" }
  },
  "thumbnail": {
    "enabled": true,
    "width": 200,
    "format": "png"
  },
  "filename": "report.pdf"
}
```

Example curl:
```bash
curl -X POST http://localhost:3333/api/pdf \
  -H 'Content-Type: application/json' \
  -d '{"html":"<html><body><h1>Hello PDF</h1></body></html>","filename":"report.pdf"}'
```

Responses:
- `200` JSON with `filename`, `data` or `downloadUrl`, and `thumbnails`
- `422` validation error for invalid render options
- `413` payload too large
- `500` render error

Example success response (storage disabled):
```json
{
  "filename": "report.pdf",
  "data": "JVBERi0xLjcK...",
  "thumbnails": [
    { "page": 1, "width": 200, "height": 283, "data": "iVBOR..." }
  ]
}
```

Example success response (storage enabled):
```json
{
  "filename": "report.pdf",
  "downloadUrl": "/downloads/pdfs/abc-123/report.pdf?signature=...",
  "thumbnails": [
    { "page": 1, "width": 200, "height": 283, "downloadUrl": "/downloads/pdfs/abc-123/thumbnails/page-1.png?signature=..." }
  ]
}
```

> When `PDF_STORAGE_ENABLED=true`, `downloadUrl` replaces `data` on both the PDF and each thumbnail.

## MCP Tool
When not in the `test` environment, this app registers an MCP tool named `html_to_pdf` that accepts `html`, optional `options`, optional `thumbnail`, and optional `filename` and returns a PDF resource plus optional thumbnail resources.

## File Storage & Downloads
When `PDF_STORAGE_ENABLED=true`, generated PDFs and thumbnails are persisted via `@adonisjs/drive` and served with signed URLs. The storage backend is configurable via `DRIVE_DISK`:

- **`fs`** (default) — local filesystem, files served under `/downloads/` with signed URLs.
- **`s3`** — any S3-compatible object store (AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, etc.).
- **`gcs`** — Google Cloud Storage.

- Files are stored in `storage/pdfs/<uuid>/` with the sanitized filename.
- Thumbnails are stored in `storage/pdfs/<uuid>/thumbnails/page-N.png` (or `.jpg`).
- Signed URLs expire after `PDF_STORAGE_EXPIRY` (default: `1h`).
- Stored files are automatically eligible for cleanup after `PDF_STORAGE_RETENTION` (default: `24h`).
- `APP_URL` must be set to the public-facing base URL for fully-qualified signed URLs.
- Both the HTTP API and MCP tool return download URLs when storage is enabled.

### Storage Cleanup
Remove expired files with the Ace command:
```bash
node ace storage:cleanup                    # Uses PDF_STORAGE_RETENTION (default: 24h)
node ace storage:cleanup --retention=7d     # Override retention period
node ace storage:cleanup --dry-run          # Preview what would be deleted
```

## Configuration
All config is env-driven (see `.env.example`).

### General

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_KEY` | Encryption key (**required**, generate with `openssl rand -base64 32`) | — |
| `NODE_ENV` | Environment (`development`, `production`, `test`) | `development` |
| `PORT` | HTTP port | `3333` |
| `HOST` | Bind address | `0.0.0.0` |
| `LOG_LEVEL` | Log level | `info` |
| `APP_URL` | Public-facing URL for signed download URLs | `http://localhost:3333` |
| `APP_NAME` | Service name for observability | `html-to-pdf` |
| `APP_VERSION` | Service version for observability | `0.0.0` |
| `APP_ENV` | Service environment for observability | `NODE_ENV` |
| `REQUEST_BODY_LIMIT` | Request body size limit | `5mb` |

### PDF Rendering
| Variable | Description | Default |
|----------|-------------|---------|
| `PDF_MAX_HTML_SIZE` | Maximum HTML payload size in bytes | `2097152` (2 MB) |
| `PDF_ALLOW_REMOTE` | Allow remote resources | `false` |
| `PDF_CHROMIUM_ARGS` | Additional Chromium launch args (space-separated) | none |
| `PDF_CHROMIUM_EXECUTABLE_PATH` | Path to a custom Chromium binary (e.g. system-installed Chromium) | Playwright built-in |
| `PDF_DISABLE_SANDBOX` | Disable Chromium sandboxing (use only if deployment requires it) | `false` |
| `PDF_TIMEOUT_MS` | General Playwright timeout (ms) | `20000` |
| `PDF_NAVIGATION_TIMEOUT_MS` | Navigation timeout (ms) | `10000` |
| `PDF_VIEWPORT_WIDTH` | Browser viewport width (px) | `1280` |
| `PDF_VIEWPORT_HEIGHT` | Browser viewport height (px) | `720` |
| `PDF_WAIT_UNTIL` | Page load event: `load`, `domcontentloaded`, or `networkidle` | `load` |
| `PDF_THUMBNAIL_MAX_WIDTH` | Maximum thumbnail width (px) | `800` |
| `PDF_MAX_THUMBNAIL_PAGES` | Maximum thumbnail pages per request | `10` |

### Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `PDF_STORAGE_ENABLED` | Persist generated PDFs and thumbnails to disk and return signed download URLs | `false` |
| `PDF_STORAGE_EXPIRY` | Signed download URL expiry duration (e.g. `1h`, `30m`, `7d`) | `1h` |
| `PDF_STORAGE_RETENTION` | How long to keep stored files before cleanup (e.g. `24h`, `7d`) | `24h` |
| `DRIVE_DISK` | Storage backend: `fs` (local), `s3` (S3-compatible), or `gcs` (Google Cloud Storage) | `fs` |
| `S3_ACCESS_KEY_ID` | S3 access key ID (required when `DRIVE_DISK=s3`) | none |
| `S3_SECRET_ACCESS_KEY` | S3 secret access key (required when `DRIVE_DISK=s3`) | none |
| `S3_REGION` | S3 region | `us-east-1` |
| `S3_BUCKET` | S3 bucket name (required when `DRIVE_DISK=s3`) | none |
| `S3_ENDPOINT` | Custom S3 endpoint for non-AWS providers (MinIO, R2, Spaces) | none |
| `S3_FORCE_PATH_STYLE` | Use path-style URLs instead of virtual-hosted; needed for MinIO | `false` |
| `GCS_PROJECT_ID` | GCS project ID (required when `DRIVE_DISK=gcs`) | none |
| `GCS_CLIENT_EMAIL` | GCS service account email (required when `DRIVE_DISK=gcs`) | none |
| `GCS_PRIVATE_KEY` | GCS service account private key (required when `DRIVE_DISK=gcs`) | none |
| `GCS_BUCKET` | GCS bucket name (required when `DRIVE_DISK=gcs`) | none |

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `RATE_LIMIT_REQUESTS` | Max requests per duration window | `60` |
| `RATE_LIMIT_DURATION` | Duration window for rate limiting | `1 minute` |
| `RATE_LIMIT_BLOCK_FOR` | Block duration after limit exceeded | `5 minutes` |
| `LIMITER_STORE` | Rate limiter backend store | `memory` |

## Kubernetes
An example manifest is provided in [`k8s/deployment.example.yaml`](k8s/deployment.example.yaml). It includes a Namespace, Secret, ConfigMap, PVC, Deployment, Service, and a CronJob that runs `storage:cleanup` every hour.

Before applying:
1. Replace `<version>` in the image references with a release tag (e.g. `v1.0.0`) or `main` for latest.
2. Set `APP_KEY` in the Secret (generate with `node ace generate:key`).
3. Set `APP_URL` in the ConfigMap to your public-facing URL.

```bash
# Apply all resources
kubectl apply -f k8s/deployment.example.yaml

# Verify the deployment
kubectl -n html-to-pdf get pods
```

## Docker

Pre-built images are available on GitHub Container Registry:

```bash
docker run --rm -p 3333:3333 --env-file .env ghcr.io/nanodeck/html-to-pdf:latest
```

Pin to a specific version:
```bash
docker run --rm -p 3333:3333 --env-file .env ghcr.io/nanodeck/html-to-pdf:v1.0.0
```

Or build locally:
```bash
docker build -t html-to-pdf .
docker run --rm -p 3333:3333 --env-file .env html-to-pdf
```

## Development
```bash
npm run dev
```

Lint, tests, and types:
```bash
npm run lint
npm test
npm run typecheck
```

## Available Fonts

The Docker image includes the following fonts pre-installed:

| Font Family | Styles | Source |
|---|---|---|
| Arial | Regular, Bold, Italic, Bold Italic | Microsoft Core |
| Arial Black | Regular | Microsoft Core |
| Andale Mono | Regular | Microsoft Core |
| Comic Sans MS | Regular, Bold | Microsoft Core |
| Courier New | Regular, Bold, Italic, Bold Italic | Microsoft Core |
| Georgia | Regular, Bold, Italic, Bold Italic | Microsoft Core |
| Impact | Regular | Microsoft Core |
| Times New Roman | Regular, Bold, Italic, Bold Italic | Microsoft Core |
| Trebuchet MS | Regular, Bold, Italic, Bold Italic | Microsoft Core |
| Verdana | Regular, Bold, Italic, Bold Italic | Microsoft Core |
| Webdings | Regular | Microsoft Core |
| Liberation Sans | Regular, Bold, Italic, Bold Italic | Liberation (Arial-compatible) |
| Liberation Serif | Regular, Bold, Italic, Bold Italic | Liberation (Times-compatible) |
| Liberation Mono | Regular, Bold, Italic, Bold Italic | Liberation (Courier-compatible) |
| Open Sans | Regular, Bold, Italic, Bold Italic, Light, SemiBold, ExtraBold + Condensed variants | Alpine `font-opensans` (chromium dep) |

## Security Notes
- Remote fetching is blocked by default (`PDF_ALLOW_REMOTE=false`).
- Chromium sandboxing stays enabled by default; set `PDF_DISABLE_SANDBOX=true` only when your runtime cannot support the sandbox.
- HTML payload size is capped (`PDF_MAX_HTML_SIZE`).
- Thumbnail generation is capped per request (`PDF_MAX_THUMBNAIL_PAGES`) to limit CPU and memory amplification.
- Rate limiting is enabled; for multi-pod deployments, use a shared limiter store.
- The same rate limiting applies to both `/api/pdf` and `/mcp`.

## Contributing
See `CONTRIBUTING.md` for setup, workflow, and pull request guidance.


## License
MIT (see `LICENSE`).
