# Development setup

Day-to-day work happens in the development Compose stack. This guide covers that stack, native
runs without Docker, the checks CI runs, database migrations and the Mac app. Conventions for
contributions are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## The development stack

```bash
./studio.sh dev
```

`deploy/docker-compose.dev.yml` starts three services:

| Service | What it does |
| --- | --- |
| `api` | The production API image with `apps/api/app` bind-mounted and uvicorn in `--reload` mode; restarts on every Python change |
| `web` | `node:22-alpine` with `apps/web` bind-mounted, running `pnpm install` then `pnpm dev`; node_modules, the pnpm store and `.next` live in named volumes so nothing from the container lands in your checkout |
| `postgres` | `postgres:17-alpine` with a development password |

The script waits until `http://localhost:3000/api/healthz` answers, opens the browser, streams
logs, and stops the stack on Ctrl-C. `./studio.sh dev down` removes the containers;
`./studio.sh dev down -v` also removes the volumes, which forces a fresh `pnpm install` and an
empty database next time.

Ledger repositories and uploads are the host directory `apps/api/data`, shared with a natively
run API. Metadata is in the PostgreSQL container. `deploy/.env` is optional in this mode and is
read for AI provider settings and `POSTGRES_PASSWORD`.

Without the script:

```bash
cd deploy && docker compose -f docker-compose.dev.yml up --build
```

## Native runs

For the fastest edit loop on the API, or to work without Docker, run the servers on the host.
Requirements: Node 22 with pnpm, Python 3.12 with [uv](https://docs.astral.sh/uv/), git.

```bash
# API: http://localhost:8000, interactive docs at /api/docs, SQLite under apps/api/data
cd apps/api
uv sync --all-groups
cp .env.example .env            # optional; defaults work
uv run uvicorn app.main:app --reload

# Web: http://localhost:3000, proxies /api to API_URL (default http://localhost:8000)
cd apps/web
pnpm install
pnpm dev
```

## Checks

These are what CI runs on every push and pull request; `main` requires all three.

```bash
cd apps/api && uv run ruff check app tests && uv run ruff format --check app tests && uv run pytest -q
cd apps/web && pnpm exec tsc --noEmit && pnpm lint && pnpm build
cd apps/desktop && pnpm test
```

API changes need a pytest in `apps/api/tests`. Pure logic in the desktop shell is unit-tested
with `node:test`.

## Database migrations

The schema is managed by Alembic; migrations live in `apps/api/app/db/migrations` and the API
applies them at startup, so a fresh database, a restored backup and an upgrade all take the same
path. After editing `apps/api/app/db/models.py`:

```bash
cd apps/api
uv run alembic revision --autogenerate --rev-id 0002 -m "describe the change"
```

Review the generated file before committing. The test suite checks that the migrated schema
matches the models exactly, that a database created before migrations existed is stamped at
the baseline without losing data, and that upgrades are idempotent.

## Working on the Mac app

The shell in `apps/desktop` loads whatever server you point it at. With the development stack
running:

```bash
cd apps/desktop
pnpm install
pnpm dev        # builds and opens the shell pointed at http://localhost:3000
pnpm start      # first-launch flow: the connect screen asks for a server address
pnpm test       # tsc + node:test
```

`STUDIO_SERVER_URL` overrides the saved server for one run. The shell logs to
`~/Library/Logs/beancount-studio-desktop/main.log`. The bridge type the web client sees is
`packages/desktop-bridge`; the shell consumes it through a `link:` dependency until the
repository becomes a pnpm workspace ([ADR 0002](adr/0002-repository-layout.md)).

## Where things live

- `apps/api/app/ledgers/store.py` — ledger git repositories and the cached Fava engine; all
  Fava access goes through `LedgerStore.run()`.
- `apps/api/app/ledgers/engine.py` — every report and journal function.
- `apps/api/app/routers/*` — HTTP routes; `apps/api/app/core/deps.py` — authentication and
  ledger access roles.
- `apps/api/app/ai/*` — the assistant: agent loop, tools and approval hashing, message
  conversion, providers.
- `apps/api/app/storage.py` — the only place that builds data paths.
- `apps/web/src/lib/api/{client,types,hooks}.ts` — the typed API layer; new endpoints go
  there.
- `apps/web/src/components/ledger/*` — the ledger shell and shared pieces.
- `DESIGN.md` and `docs/frontend-conventions.md` — the visual language and UI patterns.
  `DESIGN.md` wins on conflicts.
