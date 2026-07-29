# syntax=docker/dockerfile:1.8

ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.62.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07

FROM ${NODE_IMAGE} AS node-runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM node-runtime AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable pnpm \
  && corepack install --global pnpm@11.17.0

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY infrastructure/database/package.json infrastructure/database/package.json
COPY packages/brand-knowledge/package.json packages/brand-knowledge/package.json
COPY packages/configuration/package.json packages/configuration/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/design-engine/package.json packages/design-engine/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/process-health/package.json packages/process-health/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .

ARG APP_TIMEZONE=America/Argentina/Cordoba
ARG NEXT_PUBLIC_API_BASE_URL

ENV APP_TIMEZONE=$APP_TIMEZONE
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NODE_ENV=production

RUN pnpm build

FROM workspace AS deploy-api
RUN pnpm --filter @aramayo/api deploy --prod --legacy /opt/aramayo/api

FROM workspace AS deploy-web
RUN pnpm --filter @aramayo/web deploy --prod --legacy /opt/aramayo/web

FROM workspace AS deploy-worker
RUN pnpm --filter @aramayo/worker deploy --prod --legacy /opt/aramayo/worker

FROM workspace AS migration

ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

LABEL org.opencontainers.image.created=$BUILD_DATE
LABEL org.opencontainers.image.description="Migraciones de Aramayo Content Platform"
LABEL org.opencontainers.image.revision=$VCS_REF
LABEL org.opencontainers.image.source="https://github.com/MaxiAramayo/ferreteria-generador-meta-ia"

USER node

CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "infrastructure/database/prisma/schema.prisma"]

FROM node-runtime AS api

ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

ENV NODE_ENV=production

LABEL org.opencontainers.image.created=$BUILD_DATE
LABEL org.opencontainers.image.description="API de Aramayo Content Platform"
LABEL org.opencontainers.image.revision=$VCS_REF
LABEL org.opencontainers.image.source="https://github.com/MaxiAramayo/ferreteria-generador-meta-ia"

WORKDIR /app
COPY --from=deploy-api --chown=node:node /opt/aramayo/api/ ./

USER node
EXPOSE 3001

CMD ["node", "--enable-source-maps", "dist/main.js"]

FROM node-runtime AS web

ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

LABEL org.opencontainers.image.created=$BUILD_DATE
LABEL org.opencontainers.image.description="Web de Aramayo Content Platform"
LABEL org.opencontainers.image.revision=$VCS_REF
LABEL org.opencontainers.image.source="https://github.com/MaxiAramayo/ferreteria-generador-meta-ia"

WORKDIR /app
COPY --from=deploy-web --chown=node:node /opt/aramayo/web/ ./

USER node
EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

FROM ${PLAYWRIGHT_IMAGE} AS worker

ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

LABEL org.opencontainers.image.created=$BUILD_DATE
LABEL org.opencontainers.image.description="Worker de Aramayo Content Platform"
LABEL org.opencontainers.image.revision=$VCS_REF
LABEL org.opencontainers.image.source="https://github.com/MaxiAramayo/ferreteria-generador-meta-ia"

WORKDIR /app
COPY --from=deploy-worker --chown=pwuser:pwuser /opt/aramayo/worker/ ./

USER pwuser

CMD ["node", "--enable-source-maps", "dist/main.js"]
