# deps: install everything needed to build. python3/make/g++ are a
# compile fallback in case better-sqlite3 has no prebuilt binary for
# this image's platform/arch.
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# builder: compile the app. Plain `next build`, deliberately no
# output: 'standalone' (see README's Stack section for why).
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# runner: does its OWN fresh production-only install right here,
# instead of copying node_modules from another stage. That's what
# installs better-sqlite3 the normal way, with nothing for a file
# tracer to miss. Only the already-built app is copied on top.
FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib

EXPOSE 3000

# Ingestion is idempotent, so running it on every container start is
# safe and is also what makes "add a new corpus file, restart" work
# without a separate manual ingest step.
CMD ["sh", "-c", "node scripts/ingest.js && pnpm start"]
