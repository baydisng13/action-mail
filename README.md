# Postscript

An AI email client that sits on top of the mail you already have (Gmail or any
IMAP/SMTP provider). It reads, threads and organizes your mail, pulls out codes,
links and to-dos, and hands you the action instead of the raw message.

Sold as a SaaS: personal workspaces, team workspaces with members and roles,
Free / Pro / Team plans billed through Polar, and a platform admin console.

## Monorepo

| Path | What |
|------|------|
| `apps/web` | TanStack Start (React 19, Vite 7, Tailwind 4, shadcn/ui). UI only, talks to the api. |
| `apps/api` | NestJS 11 + Drizzle + Postgres 17. All server logic under `/api`. |
| `apps/api/src/worker.ts` | The worker: same image as the api, started with `node dist/worker.js`. BullMQ on Redis: mailbox sync, provider actions, delayed sends (undo), draft sync, AI triage, emails, Polar webhooks, scheduled jobs. |
| `packages/types` | Shared API contract (zod schemas + response types) and the plan/limit table (`src/plans.ts`). |
| `e2e` | Playwright specs run against the docker-compose stack with a GreenMail test server. |

pnpm 10 + Turborepo, Node 22.

## Privacy model

Mail content never lands in Postgres or on disk. The provider stays the source
of truth.

- Bodies and attachments are fetched live when a message is opened. A short
  cache (max 1 hour) lives in Redis, encrypted per workspace (AES-256-GCM,
  key derived from `MAILBOX_ENCRYPTION_KEY` with HKDF). Disconnect and logout
  drop it.
- Stored per message: provider ids, folder/label ids, flags, date, size, an
  attachment flag, and one encrypted envelope (sender, recipients, subject,
  snippet). Message-IDs are kept only as keyed hashes for threading.
- Search uses the provider (Gmail `q=`, IMAP `SEARCH`). No local content index.
- AI gets content only on demand; only its output is stored, encrypted. Prompts
  are never logged. Logs strip email addresses.
- OAuth tokens and IMAP passwords are encrypted at rest and never returned.
- `apps/api/test/int.mail.test.ts` syncs a real test mailbox and scans every
  table and every Redis value to prove no subject, body or attachment is stored
  in plain text.

## Plans

Edit `packages/types/src/plans.ts` to change prices and limits (the api enforces
them, the web shows them). Real charges come from the Polar products you set in
`POLAR_PRODUCT_*`.

## Run it

Node is only needed inside containers.

```bash
cp .env.example .env            # fill the required secrets
docker compose up -d --build    # web, api, worker, postgres, redis (no host ports)
```

Tests:

```bash
docker compose -f docker-compose.test.yml up -d
docker compose -f docker-compose.test.yml run --rm tests      # unit + integration
docker compose -f docker-compose.yml -f docker-compose.e2e.yml --env-file e2e/e2e.env up -d --build
docker compose -f docker-compose.yml -f docker-compose.e2e.yml --env-file e2e/e2e.env run --rm playwright
```

`scripts/verify.sh` runs typecheck, build and the test suites in Docker.

## Deploy

Coolify, build pack `dockercompose`, file `docker-compose.coolify.yml`. Required
env: `POSTGRES_PASSWORD`, `APP_URL`, `API_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `MAILBOX_ENCRYPTION_KEY`. Optional (features show "not
configured" until set): Google OAuth, `AI_API_KEY`, `RESEND_API_KEY`, Polar.
Migrations run when the api starts.

Polar webhook URL: `https://<api host>/api/billing/webhook` (events:
subscription.*, order.paid).
Google OAuth redirect URIs: `https://<api host>/api/auth/google/callback` and
`https://<api host>/api/mailbox/google/callback`.
