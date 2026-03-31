FROM node:20-bookworm-slim@sha256:6c51af7dc83f4708aaac35991306bca8f478351cfd2bda35750a62d7efcf05bb AS base
WORKDIR /app
ENV NODE_ENV=production

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

FROM base AS runtime
ENV DEBIAN_FRONTEND=noninteractive
RUN sed -i 's/Components: main/Components: main contrib non-free non-free-firmware/' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
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

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /ms-playwright /ms-playwright

ENV HOST=0.0.0.0
ENV PORT=3333
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PDF_CHROMIUM_ARGS=""
ENV PDF_DISABLE_SANDBOX=false
ENV PDF_MAX_THUMBNAIL_PAGES=10

RUN npx playwright install-deps chromium \
  && rm -rf /var/lib/apt/lists/*

USER node
EXPOSE 3333
ENTRYPOINT ["tini", "--"]
CMD ["node", "build/bin/server.js"]
