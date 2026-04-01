FROM node:24-alpine AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev \
  && rm -rf node_modules/@img/sharp-libvips-linux-x64 \
            node_modules/@img/sharp-linux-x64 \
            node_modules/@napi-rs/canvas-linux-x64-gnu \
            node_modules/pdfjs-dist/web \
            node_modules/pdfjs-dist/image_decoders \
            node_modules/pdfjs-dist/types \
            node_modules/playwright-core/lib/vite \
  && find node_modules -name '*.d.ts' -o -name '*.d.mts' -o -name '*.map' | xargs rm -f

FROM node:24-alpine AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS fonts
RUN sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
  && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
  && apt-get update \
  && apt-get install -y --no-install-recommends ttf-mscorefonts-installer \
  && rm -rf /var/lib/apt/lists/*

FROM alpine:3.23 AS runtime
WORKDIR /app

COPY --from=build /usr/local/bin/node /usr/local/bin/node

RUN addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/false -D node \
  && apk upgrade --no-cache \
  && apk add --no-cache \
  libstdc++ \
  chromium \
  font-liberation \
  fontconfig \
  freetype \
  harfbuzz \
  nss \
  tini \
  && rm -rf /usr/lib/libLLVM*.so* /usr/lib/libgallium*.so \
            /usr/lib/python3.12 /usr/lib/libpython3* \
            /usr/lib/girepository-1.0 \
            /usr/lib/chromium/ui_test.pak \
            /usr/lib/chromium/chrome-sandbox \
            /usr/lib/chromium/xdg-mime \
            /usr/lib/chromium/xdg-settings \
            /usr/lib/chromium/MEIPreload

COPY --from=fonts /usr/share/fonts/truetype/msttcorefonts /usr/share/fonts/truetype/msttcorefonts
RUN fc-cache -f

COPY --from=build /app/build/ ./
COPY --from=deps /app/node_modules ./node_modules

RUN mkdir -p /app/storage && chown node:node /app/storage

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333 \
    LOG_LEVEL=info \
    REQUEST_BODY_LIMIT=5mb \
    RATE_LIMIT_REQUESTS=60 \
    RATE_LIMIT_DURATION="1 minute" \
    LIMITER_STORE=memory \
    PDF_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PDF_CHROMIUM_ARGS="" \
    PDF_DISABLE_SANDBOX=false \
    PDF_TIMEOUT_MS=20000 \
    PDF_NAVIGATION_TIMEOUT_MS=10000 \
    PDF_VIEWPORT_WIDTH=1280 \
    PDF_VIEWPORT_HEIGHT=720 \
    PDF_WAIT_UNTIL=load \
    PDF_ALLOW_REMOTE=false \
    PDF_MAX_HTML_SIZE=2097152 \
    PDF_THUMBNAIL_MAX_WIDTH=800 \
    PDF_MAX_THUMBNAIL_PAGES=10 \
    DRIVE_DISK=fs

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3333/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

USER node
EXPOSE 3333
ENTRYPOINT ["tini", "--"]
CMD ["node", "bin/server.js"]
