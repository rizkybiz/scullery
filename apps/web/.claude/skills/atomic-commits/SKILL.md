---
name: atomic-commits
description: How to branch, commit and open PRs in this repo - atomic commits, Conventional Commits messages, staged-only verification. Use whenever committing, creating a branch, or preparing a pull request.
---

# Atomic commits and PRs

Follow this every time you commit, branch or prepare a PR in this repo.

## Branching
- Never commit on `main`. Run `git branch --show-current` first; if on `main`, create a branch.
- Branch names: `<type>/<short-kebab-summary>` (e.g. `feat/recipe-list`, `fix/cooking-mode-wake-lock`).
- One feature or fix per branch. Large features: write the planned commit sequence out for the user before starting.

## What "atomic" means
- **One logical change per commit.** If the message needs "and", split it.
- **Every commit builds and passes tests on its own** (the pre-commit hook typechecks, lints and tests the staged snapshot). Never commit a broken intermediate state to be fixed "in the next commit".
- **Revertable alone** without dragging unrelated changes with it.
- **Tests and docs travel with the code they cover.** Generated API types go in the same commit as the component changes that need them.
- Keep refactors, formatting-only changes and dependency bumps in their own commits, separate from behaviour changes.

## Process
1. `git status` and `git diff` - read what changed. Ask the user about anything unexpected.
2. Stage **explicitly**: `git add <path>...` or `git add -p` for hunks. Never `git add -A` or `git add .`.
3. `git diff --cached --stat` - confirm the staged set is exactly one logical change.
4. Commit with a heredoc so formatting is exact (see below). Let the hooks run.
5. If a hook fails: fix the cause, re-stage, and make a new commit attempt. Never use `--no-verify`. Never amend, rebase or force-push commits that have been pushed.

## Message format (enforced by `.githooks/commit-msg`)
```
type(scope): imperative summary

Why the change was made, not a restatement of the diff. Wrap at ~72.

BREAKING CHANGE: only when applicable
Co-Authored-By: <the attribution line from this session's instructions>
```
- Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- Scopes for this repo: `ui`, `api-client`, `pwa`, `routing`, `docker`, `deps`, `ci`, `docs`.
- Subject: lowercase after the colon, imperative mood, <= 72 chars, no trailing period.

## Never commit
`.env` files, credentials, build output (`dist/`), `node_modules/`, anything the hooks flag as a secret.

## Pushing and PRs
- **Ask the user before every `git push`.** Do not push on your own initiative.
- Never force-push. Never push to `main`.
- PR title follows the commit format; the body follows `.github/pull_request_template.md`.
- Prefer merging in a way that preserves the atomic commits (merge commit or rebase-merge, not squash).
