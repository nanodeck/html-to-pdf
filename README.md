# HTML to PDF API

Fast, hardened HTML-to-PDF rendering service built with Playwright. It exposes a simple HTTP API, OpenAPI docs, and an MCP tool for agent workflows.

## Highlights
- Render HTML to PDF with Playwright Chromium.
- Hardened by default: remote resources blocked unless explicitly enabled.
- Rate limiting built in.
- OpenAPI JSON and Swagger UI included.
- MCP tool endpoint for agent-based workflows.

## Quickstart
```bash
npm install
cp .env.example .env
npm run dev
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

Key settings:

| Variable | Description | Default |
|----------|-------------|---------|
| `REQUEST_BODY_LIMIT` | Request body size limit | `5mb` |
| `APP_NAME` | Service name for observability | `html-to-pdf` |
| `APP_VERSION` | Service version for observability | `0.0.0` |
| `APP_ENV` | Service environment for observability | `NODE_ENV` |
| `PDF_MAX_HTML_SIZE` | Maximum HTML payload size in bytes | `2097152` (2 MB) |
| `PDF_ALLOW_REMOTE` | Allow remote resources | `false` |
| `PDF_CHROMIUM_ARGS` | Additional Chromium launch args (space-separated) | none |
| `PDF_DISABLE_SANDBOX` | Disable Chromium sandboxing (use only if deployment requires it) | `false` |
| `PDF_TIMEOUT_MS` | General Playwright timeout (ms) | `20000` |
| `PDF_NAVIGATION_TIMEOUT_MS` | Navigation timeout (ms) | `10000` |
| `PDF_VIEWPORT_WIDTH` | Browser viewport width (px) | `1280` |
| `PDF_VIEWPORT_HEIGHT` | Browser viewport height (px) | `720` |
| `PDF_WAIT_UNTIL` | Page load event: `load`, `domcontentloaded`, or `networkidle` | `load` |
| `PDF_THUMBNAIL_MAX_WIDTH` | Maximum thumbnail width (px) | `800` |
| `PDF_MAX_THUMBNAIL_PAGES` | Maximum thumbnail pages per request | `10` |
| `PDF_STORAGE_ENABLED` | Persist generated PDFs and thumbnails to disk and return signed download URLs | `false` |
| `PDF_STORAGE_EXPIRY` | Signed download URL expiry duration (e.g. `1h`, `30m`, `7d`) | `1h` |
| `PDF_STORAGE_RETENTION` | How long to keep stored files before cleanup (e.g. `24h`, `7d`) | `24h` |
| `APP_URL` | Application base URL, used for generating fully-qualified signed download URLs | `http://localhost:3333` |
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
| `RATE_LIMIT_REQUESTS` | Max requests per duration window | `60` |
| `RATE_LIMIT_DURATION` | Duration window for rate limiting | `1 minute` |
| `RATE_LIMIT_BLOCK_FOR` | Block duration after limit exceeded | `5 minutes` |
| `LIMITER_STORE` | Rate limiter backend store | `memory` |

## Observability
This service supports OpenTelemetry (traces, metrics, and logs). Configure exporters via standard OTEL env vars.

Common OTLP settings:
- `OTEL_EXPORTER_OTLP_ENDPOINT`: e.g. `http://otel-collector:4317`
- `OTEL_EXPORTER_OTLP_HEADERS`: optional headers (e.g. `Authorization=Bearer token`)
- `OTEL_SERVICE_NAME`: overrides the service name if set (otherwise uses `APP_NAME`)

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

## Security Notes
- Remote fetching is blocked by default (`PDF_ALLOW_REMOTE=false`).
- Chromium sandboxing stays enabled by default; set `PDF_DISABLE_SANDBOX=true` only when your runtime cannot support the sandbox.
- HTML payload size is capped (`PDF_MAX_HTML_SIZE`).
- Thumbnail generation is capped per request (`PDF_MAX_THUMBNAIL_PAGES`) to limit CPU and memory amplification.
- Rate limiting is enabled; for multi-pod deployments, use a shared limiter store.
- The same rate limiting applies to both `/api/pdf` and `/mcp`.

## Contributing
See `CONTRIBUTING.md` for setup, workflow, and pull request guidance.

## Deployment Checklist
- Ensure Docker image tag and K8s manifests point to the correct version.
- Confirm environment variables are set for the target environment.

## License
MIT (see `LICENSE`).
