# syntax=docker/dockerfile:1
# Build context is the REPO ROOT.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
RUN --mount=type=cache,id=pnpm-store-ps-web,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --filter @postscript/web... --filter @postscript/types

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /repo/packages/types/node_modules ./packages/types/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
# VITE_ vars are inlined at build time; declared after install to keep the cache.
ENV NODE_OPTIONS=--max-old-space-size=2560
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @postscript/types build && pnpm --filter @postscript/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/web/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
