# Next.js & Shadcn UI Starter

Source: https://development-guideline.vercel.app/docs/templates/starter-1

Production-ready boilerplate for modern web development. Combines Next.js 14 (App Router, Server Actions) with shadcn/ui components and Tailwind CSS.

## Key Features
- Modern React framework with App Router
- Pre-built accessible UI components (shadcn/ui)
- Utility-first CSS (Tailwind)
- Code quality tools (ESLint & Prettier)
- Dark mode via next-themes
- MDX content management

## Getting Started
1. Clone: `git clone https://github.com/your-repo/nextjs-shadcn-starter.git`
2. Install: `pnpm install`
3. Dev server: `pnpm dev` (localhost:3000)

## Project Organization
- `/content/` — MDX content files
- `/public/` — Static assets
- `/src/app/` — Next.js application
- `/src/components/` — Reusable components
- `/src/lib/` — Utility functions
- `/src/styles/` — Global styling

## Customization
- Modify themes via CSS variables in `globals.css`
- Add components with the shadcn CLI: `npx shadcn-ui@latest add button`
