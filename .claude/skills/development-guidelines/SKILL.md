---
name: development-guidelines
description: Team development guidelines for React/Next.js/TanStack projects — git conventions (Conventional Commits, GitFlow), API layer architecture (TanStack Query + axios modular apis), state management (react-hook-form / Zustand / React Query), styling (Tailwind + shadcn/ui), and testing (RTL/Jest + E2E). Use when writing commits, PRs, branch names, structuring the API layer, choosing a state tool, styling components, or writing tests. Source: development-guideline.vercel.app
---

# Development Guidelines

Shared conventions for this codebase. Core principles: **Clarity, Simplicity, Consistency.** Enabling, not restrictive — exceptions allowed with reason.

Load the matching file in `references/` for full detail + code examples.

## Quick reference

### Git — [references/git.md](references/git.md)
- **Conventional Commits**: `<type>[scope]: <description>`. Types: `feat fix chore docs style refactor perf test`.
- Description: imperative mood ("change" not "changed"), lowercase first char, no trailing period.
- **GitFlow branches**: `main` (prod), `develop` (integration), `feature/*`, `bugfix/*`, `hotfix/*` (from main).
- PRs small + focused, pass tests before review.
- Merge: feature/bugfix → develop via **Squash and Merge**; develop → main via merge commit. Rebase often: `git rebase origin/develop`.
- Trunk-based (short-lived branches + feature flags) allowed for rapid projects.

### API layer — [references/api-documentation.md](references/api-documentation.md)
- One file per backend resource in `/apis` (`product.ts`, `user.ts`, `auth/`).
- All data ops go through **custom TanStack Query hooks**, never direct API calls.
- Single `api` object exported from `apis/index.ts` = app entry point.
- Fetch: `api.Resource.action.useQuery()`. Mutate: `api.Resource.action.useMutation()`.
- New module = 5 steps: file → TS interfaces → raw async axios fns → hooks object wrapping TanStack Query → register in `index.ts`.
- Global success/error via `QueryCache`/`MutationCache` + meta.

### State management — [references/state-management.md](references/state-management.md)
Pick by **where data comes from**, not app size:
- **User/form state** → `react-hook-form` (+ Zod). Prefer controlled components.
- **Application/UI state** (theme, modals, steps, auth flag) → `Zustand` (alts: Redux Toolkit, Jotai).
- **Server/async state** → `React Query` (alt: SWR).
- Localize with `useState` when single-component. Derive values, don't store computed. Don't use server-state libs for forms.

### Styling — [references/styling.md](references/styling.md)
- Tailwind classes inline in component files.
- Follow **shadcn/ui** conventions for custom styling.

### Testing — [references/testing.md](references/testing.md)
- **Integration**: component/service interactions via React Testing Library + Jest.
- **E2E**: simulate real user flows.

## Foundational docs
- [references/basics.md](references/basics.md) — core principles (Clarity/Simplicity/Consistency).
- [references/introduction.md](references/introduction.md) — philosophy.
- [references/starter-nextjs.md](references/starter-nextjs.md) — Next.js 14 + shadcn/ui starter template.

> Note: source pages **Welcome** (`/docs`) and **Project Structure** were client-rendered/404 at capture time — content unavailable.
