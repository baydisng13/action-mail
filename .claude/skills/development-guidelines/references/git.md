# Git Conventions

Source: https://development-guideline.vercel.app/docs/guidelines/git

## Conventional Commits

All commit messages must follow the Conventional Commits specification.

### Structure

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

- **feat**: New functionality
- **fix**: Bug resolution
- **chore**: Build process or tooling changes
- **docs**: Documentation-only updates
- **style**: Code formatting without functional changes
- **refactor**: Code restructuring without bug fixes or features
- **perf**: Performance enhancements
- **test**: Test additions or corrections

### Description Guidelines

- Use imperative mood: "change" rather than "changed"
- Do not capitalize the opening character
- Omit terminal punctuation

Examples cover: new features, bug fixes, documentation changes, refactoring, performance improvements, and breaking changes.

## Git Workflow (GitFlow)

Simplified GitFlow with these branches:

- **main**: Production-ready code
- **develop**: Primary development integration point
- **feature branches**: `feature/description`
- **bugfix branches**: `bugfix/description`
- **hotfix branches**: `hotfix/description` (from main)

## Pull Request Standards

PRs should be small and focused, addressing a single concern, include clear descriptions explaining changes, and pass all tests before review requests.

## Merging Strategy

- Feature/bugfix branches use **Squash and Merge** into develop
- Develop merges into main via merge commits
- Frequent rebasing minimizes conflicts: `git rebase origin/develop`

## Trunk-Based Development Alternative

For rapid iteration projects: a single main branch with short-lived feature branches and feature flags maintains stability.
