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

# Copy Node.js runtime from official image (node + npm/npx for playwright install-deps)
COPY --from=deps /usr/local/bin/node /usr/local/bin/node
COPY --from=deps /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Create non-root user (remove default ubuntu user/group first if present)
RUN userdel -r ubuntu 2>/dev/null || true \
  && groupadd --gid 1000 node \
  && useradd --uid 1000 --gid node --shell /bin/false --create-home node

# Install system packages: fonts, tini, and upgrade for security patches
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    debconf-utils \
    fontconfig \
    fonts-freefont-ttf \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    tini \
  && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections \
  && apt-get install -y --no-install-recommends ttf-mscorefonts-installer \
  && apt-get purge -y --auto-remove debconf-utils \
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

# Install Chromium runtime dependencies (officially supports Ubuntu 24.04)
RUN npx playwright install-deps chromium \
  && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3333/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

USER node
EXPOSE 3333
ENTRYPOINT ["tini", "--"]
CMD ["node", "build/bin/server.js"]
