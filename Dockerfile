FROM node:20-bookworm-slim@sha256:6c51af7dc83f4708aaac35991306bca8f478351cfd2bda35750a62d7efcf05bb AS deps
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev
RUN npx playwright install chromium

FROM node:20-bookworm-slim@sha256:6c51af7dc83f4708aaac35991306bca8f478351cfd2bda35750a62d7efcf05bb AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM ubuntu:24.04@sha256:186072bba1b2f436cbb91ef2567abca677337cfc786c86e107d25b7072feef0c AS runtime
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive

# Copy only the Node.js binary (no npm/npx — eliminates bundled npm vulnerabilities)
COPY --from=deps /usr/local/bin/node /usr/local/bin/node

# Create non-root user (remove default ubuntu user/group first if present)
RUN userdel -r ubuntu 2>/dev/null || true \
  && groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --shell /bin/false --create-home node

# Install system packages: fonts, Chromium runtime deps, tini, and upgrade for security patches
# Chromium deps list from: npx playwright install-deps --dry-run chromium
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    debconf-utils \
    fontconfig \
    fonts-freefont-ttf \
    fonts-ipafont-gothic \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fonts-tlwg-loma-otf \
    fonts-unifont \
    fonts-wqy-zenhei \
    libasound2t64 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libatspi2.0-0t64 \
    libcairo2 \
    libcups2t64 \
    libdbus-1-3 \
    libdrm2 \
    libfontconfig1 \
    libfreetype6 \
    libgbm1 \
    libglib2.0-0t64 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    tini \
    xfonts-cyrillic \
    xfonts-scalable \
  && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
  && apt-get install -y --no-install-recommends ttf-mscorefonts-installer \
  && apt-get purge -y --auto-remove debconf-utils wget patch xvfb xserver-common \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /usr/share/doc/* /usr/share/man/* /usr/share/locale/*

# Copy application artifacts
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /ms-playwright /ms-playwright

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3333
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PDF_CHROMIUM_ARGS=""
ENV PDF_DISABLE_SANDBOX=false
ENV PDF_MAX_THUMBNAIL_PAGES=10

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3333/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

USER node
EXPOSE 3333
ENTRYPOINT ["tini", "--"]
CMD ["node", "build/bin/server.js"]
