FROM node:22.21.1 AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM base AS runner
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/.output ./.output
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
