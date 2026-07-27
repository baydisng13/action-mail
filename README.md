# Cookflow

Cookflow web app — built with TanStack Start, React 19, and shadcn/ui.

## Stack

- **React 19** + **TanStack Start** (SSR via Nitro)
- **TanStack Router** — file-based routes in `src/routes/`
- **TanStack Query** — server state and mutations
- **Tailwind CSS 4** + **shadcn/ui** — UI in `src/components/ui/`
- **Biome** — lint and format
- **T3 Env** — typed environment variables (`src/env.ts`)

## Getting started

### Prerequisites

- Node.js **22.12+**
- [pnpm](https://pnpm.io/)

### Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `VITE_APP_TITLE` | App name shown in the header (default: Cookflow) |
| `SERVER_URL` | Optional server URL for SSR/API (server-only) |

### Production build

```bash
pnpm build
pnpm start
```

## Project layout

```
src/
├── routes/           # File-based routes (add new files here)
├── components/
│   ├── ui/           # shadcn components
│   └── app-shell.tsx # Shared layout (header + nav)
├── features/         # Feature modules (e.g. todo-list)
├── lib/              # Utilities (cn, query client)
├── integrations/     # TanStack Query provider
├── env.ts            # Typed env schema
└── styles.css        # Global styles + design tokens
```

## Todo list example

Visit `/example` for a todo list wired from `src/features/todo-list/`:

```
src/features/todo-list/
├── api.ts
├── types.ts
├── hooks/use-todo-list.ts
├── components/todo-list.tsx
└── index.ts
```

Routes should stay thin and import from `features/`.

## Adding routes

Create a file under `src/routes/`, for example `src/routes/about.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: () => <p>About Cookflow</p>,
});
```

The dev server regenerates `src/routeTree.gen.ts` automatically.

## Adding UI components

```bash
pnpm dlx shadcn@latest add button
```

See [shadcn/ui](https://ui.shadcn.com/) for available components.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (port 3000) |
| `pnpm build` | Production build |
| `pnpm start` | Run production server |
| `pnpm test` | Run Vitest |
| `pnpm check` | Biome lint + format check |
| `pnpm format` | Format with Biome |

## Code standards

Read **[CODE_STANDARDS.md](./CODE_STANDARDS.md)** for naming, file structure, TypeScript, and PR conventions.

## Learn more

- [TanStack Router](https://tanstack.com/router)
- [TanStack Query](https://tanstack.com/query)
- [TanStack Start](https://tanstack.com/start)
