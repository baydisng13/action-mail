# syntax=docker/dockerfile:1
# Build context is the REPO ROOT (workspace manifests + packages/types are needed).
# The worker runs from this same image with `node dist/worker.js`.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
RUN --mount=type=cache,id=pnpm-store-ps-api,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store --filter @postscript/api... --filter @postscript/types

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages/types/node_modules ./packages/types/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm --filter @postscript/types build && pnpm --filter @postscript/api build \
 && pnpm --filter @postscript/api deploy --prod --legacy /out

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
