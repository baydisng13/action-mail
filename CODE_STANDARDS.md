# Code standards

Conventions for the Cookflow frontend. Follow these when adding features so the codebase stays consistent.

## Tooling

- **Formatter & linter:** [Biome](https://biomejs.dev/) — run `pnpm check` before opening a PR.
- **Tabs** for indentation (see `biome.json`).
- **Double quotes** for JavaScript/TypeScript strings.

## TypeScript

- Prefer **explicit types** on public APIs (props, hooks, data modules).
- Avoid `any`; use `unknown` and narrow when handling external data.
- Use **Zod** for runtime validation (forms, env, API responses).
- Path alias: `@/` maps to `src/` (see `tsconfig.json`).

## File and folder structure

| Location | Purpose |
|----------|---------|
| `src/routes/` | Route definitions only — thin pages that compose features |
| `src/features/` | Feature modules (UI, hooks, API helpers per domain) |
| `src/components/ui/` | shadcn primitives — do not put business logic here |
| `src/components/` | Shared app components (layout, shared widgets) |
| `src/lib/` | Pure utilities and framework setup (query client, `cn`) |
| `src/integrations/` | Third-party providers (TanStack Query, etc.) |

Add new product areas as feature folders under `src/features/`, not as loose logic in routes.

## Naming

- **Files:** `kebab-case.tsx` for components and routes (`app-shell.tsx`, `todo-list.tsx`).
- **Components:** `PascalCase` (`AppShell`, `TodoList`).
- **Hooks:** `use` prefix, camelCase (`useTodoList`).
- **Types:** `PascalCase` (`Todo`, not `ITodo`).

## React

- Use **function components** and hooks.
- Colocate route components in `src/routes/` or extract to `src/components/` when reused.
- Prefer **TanStack Query** for async server state; avoid fetching in `useEffect` when Query fits.
- Use **TanStack Router** `Link` and `createFileRoute` for navigation — no manual `window.location` for in-app routes.

## Styling

- Use **Tailwind** utility classes; use `cn()` from `@/lib/utils` for conditional classes.
- Use **CSS variables** from `src/styles.css` (`bg-background`, `text-muted-foreground`, etc.) instead of hard-coded hex colors.
- Add shadcn components for complex UI instead of one-off raw HTML controls.

## Environment variables

- Define client vars in `src/env.ts` with the `VITE_` prefix.
- Never commit secrets; use `.env` locally (gitignored) and `.env.example` for documentation.

## Imports

- Order: external packages → `@/` aliases → relative imports.
- Use `@/components/ui/button` not long relative paths like `../../../components/ui/button`.

## Commits and PRs

- Write clear commit messages focused on **why** the change was made.
- Keep PRs small and scoped to one concern.
- Run `pnpm check` and `pnpm build` before requesting review.
