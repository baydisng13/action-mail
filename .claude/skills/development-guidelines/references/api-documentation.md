# API Layer Guide

Source: https://development-guideline.vercel.app/docs/guidelines/api-documentation

## Overview

Modular API layer architecture centered on TanStack Query for server state management.

## Core Architecture Principles

1. **Modular Organization**: Each backend resource (products, users, orders) gets its own dedicated file in the `/apis` directory. Separation maintains clarity and scalability.
2. **Query-Based Interactions**: All data operations flow through custom TanStack Query hooks rather than direct API calls. Centralizes caching and state handling.
3. **Unified Export Pattern**: A single `api` object exported from `apis/index.ts` serves as the application's consistent entry point.

## Directory Structure

```
/apis
├── auth/
├── resourceA.ts
├── resourceB.ts
└── index.ts
```

## Usage Patterns

### Data Fetching

Components access data through `api.ResourceName.actionName.useQuery()`, which handles loading states and caching automatically.

### Data Modification

Updates use `api.ResourceName.actionName.useMutation()`, where the returned `mutate` function accepts required payloads.

## Creating New Modules

Five steps to establish a new API resource:

1. Create a module file named after the resource (e.g., `product.ts`)
2. Define TypeScript interfaces for data structures
3. Write raw async functions performing axios calls
4. Build a hooks object wrapping functions in TanStack Query
5. Import and register the module in `apis/index.ts`

## Advanced Pattern: Global Handlers

Query clients can implement centralized success and error handlers through `QueryCache` and `MutationCache` configuration, enabling consistent notification behavior and cache invalidation across the application through metadata properties.
