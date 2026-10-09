# Beancount Studio — repository guide

Monorepo: `apps/web` (Next.js 16, pnpm) and `apps/api` (FastAPI, uv). `deploy/` holds the
Docker Compose stack. `docs/frontend-conventions.md` is the UI rulebook.

## Commands

```bash
# API
cd apps/api && uv sync --all-groups
uv run uvicorn app.main:app --reload          # http://localhost:8000, docs /api/docs
uv run ruff check app tests && uv run ruff format app tests && uv run pytest -q

# Web
cd apps/web && pnpm install
pnpm dev                                       # http://localhost:3000 (proxies /api → API_URL)
pnpm exec tsc --noEmit && pnpm lint && pnpm build
```

## Where things live

- `apps/api/app/ledgers/store.py` — ledger git repos + cached Fava engine; all Fava access goes
  through `LedgerStore.run()` (serialised per ledger, off the event loop). Writes take
  `store.write_lock(ledger_id)` and finish with `store.commit()`.
- `apps/api/app/ledgers/engine.py` — every report/journal function (sync, returns JSON-safe dicts).
- `apps/api/app/routers/*` — HTTP routes; `core/deps.py` — auth (cookie or `bsk_` key) and
  ledger access roles (`LedgerReadDep`, `LedgerWriteDep`, `LedgerAdminDep`).
- `apps/api/app/ai/*` — assistant: `agent.py` (provider-neutral streaming loop), `tools.py`
  (tool schemas + executors + approval hashing), `messages.py` (assistant-ui ⇄ Anthropic /
  OpenAI message conversion), `providers/` (`anthropic_provider.py`, `openai_provider.py` for
  Ollama/vLLM/LM Studio/OpenRouter; `get_provider(settings)` picks from `BS_AI_PROVIDER`).
- `apps/web/src/lib/api/{client,types,hooks}.ts` — the typed API layer. Add new endpoints there.
- `apps/web/src/components/ledger/*` — ledger shell, context (`useLedgerContext`), shared pieces.

## Rules

- No silent failures: every API error is an `AppError` subclass with a code; the web shows
  `errorMessage(err)` via toast or `ErrorState`.
- Ledger content is never stored in the database — only metadata (users, ledgers, collaborators,
  keys, chat threads, uploads).
- Keep REST payload shapes in sync with `apps/web/src/lib/api/types.ts`.
- UI: tokens only (no raw colours), tabular numbers, h1 only through `PageHeader`, every state
  (pending/error/empty) handled. See `docs/frontend-conventions.md`.
- Tests: API changes need a pytest in `apps/api/tests`; run the full suite before finishing.
- Secrets live in `.env` files (gitignored). Commit only `.env.example`.
