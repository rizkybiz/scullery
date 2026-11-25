## What and why
<!-- What changes, and the reason. Link issues. -->

## How it was tested
<!-- Commands run, tests added, manual checks (include iPad Safari if the web UI changed). -->

## Checklist
- [ ] Commits are atomic and use Conventional Commits
- [ ] No hard-coded API URLs or secrets; config comes from environment variables

Web (`apps/web`):
- [ ] Types regenerated if the API's OpenAPI spec changed
- [ ] Works at iPad widths; no horizontal scroll

API (`services/api`):
- [ ] Schema changes are in a new migration (no edits to applied ones)
- [ ] Docs updated (SCHEMA.md / README) if behaviour or schema changed
