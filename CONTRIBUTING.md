# Contributing to Beancount Studio

Thanks for helping. This page is the short version; the architecture lives in
[docs/adr](docs/adr) and the UI rules in [DESIGN.md](DESIGN.md) and
[docs/frontend-conventions.md](docs/frontend-conventions.md).

## Set up

Follow [docs/install.md](docs/install.md). For day-to-day work:

```bash
./studio.sh dev                 # API with hot reload, web dev server, PostgreSQL
cd apps/desktop && pnpm dev     # Mac shell pointed at the dev server (optional)
```

## Before you open a pull request

Run the same checks CI runs:

```bash
cd apps/api && uv run ruff check app tests && uv run ruff format --check app tests && uv run pytest -q
cd apps/web && pnpm exec tsc --noEmit && pnpm lint && pnpm build
cd apps/desktop && pnpm test
```

Rules that reviews enforce:

- **No silent failures.** API errors are `AppError` subclasses with a code; the web client
  shows them. Catch blocks log and rethrow or return an error state.
- **Tests come with behaviour.** API changes need a pytest in `apps/api/tests`. Pure logic in
  the desktop shell is unit-tested with `node:test`.
- **Schema changes are migrations.** After editing `apps/api/app/db/models.py`, run
  `uv run alembic revision --autogenerate --rev-id <next> -m "..."` and review the file.
- **Ledger content never enters the database.** Only metadata does.
- **UI uses tokens, not raw colours**, tabular numbers, and handles pending, error and empty
  states. `DESIGN.md` wins over anything else.
- **Keep payload shapes in sync** with `apps/web/src/lib/api/types.ts`.

## Branches, commits, pull requests

- Branch from `main`. One topic per branch.
- Commit messages: an imperative summary line under 72 characters, a body that says why.
- Open the pull request with the template filled in. A decision with lasting consequences gets
  an ADR in `docs/adr` in the same pull request.
- CI must be green. Reviews look at behaviour and tests first, style second.

## Reporting

Bugs and feature requests go through the issue templates. Security issues do not go in public
issues; see [SECURITY.md](SECURITY.md).
