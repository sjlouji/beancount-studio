# Architecture and model integration

How Beancount Studio is put together, where data lives, and how the assistant talks to models.
Decisions with lasting consequences are recorded in [docs/adr](adr).

## The pieces

```
Browser or Mac app
        │ https
        ▼
      Caddy ──────────── /api/*  ──▶  API (FastAPI, Python)
        │                               │  Beancount + Fava core in-process
        │ everything else               │  git repositories on disk
        ▼                               │  PostgreSQL for accounts and metadata
   Web app (Next.js)  ── /api rewrite ─┘  model provider (optional)
```

| Directory | Role |
| --- | --- |
| `apps/web` | Next.js 16 App Router client: React 19, Tailwind v4, shadcn/ui, TanStack Query, Recharts, Monaco, assistant-ui |
| `apps/api` | FastAPI service: SQLAlchemy and Alembic, beancount 3, beanquery, Fava core, git, Anthropic and OpenAI SDKs |
| `apps/desktop` | Electron shell for macOS that loads a server's web UI ([ADR 0001](adr/0001-desktop-app-is-an-electron-shell.md)) |
| `packages/desktop-bridge` | Typed contract between the web client and the shell's preload script |
| `deploy` | Docker Compose stacks, Caddyfile, environment template |
| `docs` | Guides, conventions, decision records |

The repository layout and why it is a single repository: [ADR 0002](adr/0002-repository-layout.md).

## Where data lives

- **Ledgers are git repositories.** Each ledger is a working tree under the data directory.
  Every write, whether an editor save, a new entry, an import, a receipt or an assistant edit,
  is a commit authored by the signed-in user, so history and diffs come for free.
- **One place builds paths.** `apps/api/app/storage.py` owns the storage tree under
  `BS_DATA_DIR`: `ledgers/<id>/repo/` and `uploads/`. Nothing else joins paths. The layout
  moves to per-workspace directories in the workspace model ([ADR 0003](adr/0003-workspaces-as-tenants.md)).
- **Metadata is in PostgreSQL.** Users, sessions, ledgers, collaborators, stars, API keys, chat
  threads and uploads. Ledger content never enters the database. Native runs and tests use
  SQLite through the same code.
- **Schema changes are Alembic revisions** bundled in `apps/api/app/db/migrations` and applied by
  the API at startup. A database created before migrations existed is detected and stamped
  with the baseline revision, then upgraded.

## Reports and the ledger engine

Reports come from Fava's core, the same engine behind Fava's web interface, so balances,
conversions, intervals, budgets and BQL behave exactly as in Beancount and Fava. All access to
a ledger goes through `LedgerStore.run()` in `apps/api/app/ledgers/store.py`, serialised per
ledger and executed off the event loop, because the Fava ledger object is synchronous. Writes
take the ledger's write lock and finish with a commit. Every report and journal function lives
in `apps/api/app/ledgers/engine.py` and returns JSON-safe dictionaries.

## Web client and API

The web app never talks to Beancount directly. It calls the API through same-origin `/api/*`
routes, which Next.js rewrites to the API container, so the session cookie works without CORS.
Authentication accepts either that cookie or a personal access token, and ledger access is
resolved into read, write or admin roles by dependencies in `apps/api/app/core/deps.py`.

The typed API layer on the client is `apps/web/src/lib/api/{client,types,hooks}.ts`; payload
shapes there mirror the API's responses.

## Desktop shell

The Mac app is an Electron shell that loads a server's web UI, the way Slack's desktop client
loads its web app. Context isolation and the sandbox are on, Node integration is off,
navigation is limited to the connected server's origin and the shell's own connect screen,
other links open in the default browser, `<webview>` is blocked, and only notifications,
clipboard writes and fullscreen are granted to the server origin. The preload exposes
`window.studioDesktop` with the shell version and platform; the web client treats its absence
as "running in a browser".

## Deployment topology

Every mode is a Docker Compose stack in `deploy/`, driven by `./studio.sh`:

| Service | Image | Role |
| --- | --- | --- |
| `caddy` | `caddy:2-alpine` | TLS termination, routes `/api/*` to the API and everything else to the web app |
| `web` | built from `apps/web` | Next.js in production mode |
| `api` | built from `apps/api` | FastAPI with uvicorn; runs migrations at startup |
| `postgres` | `postgres:17-alpine` | Metadata database |
| `ollama` | `ollama/ollama` | Optional, profile `ollama`: a local model server on the internal network |

Volumes: `studio-data` for ledgers and uploads, `postgres-data` for the database, `caddy-data`
and `caddy-config` for certificates. The development stack swaps the web and API images for
bind-mounted source with hot reload. Operating details are in the
[production guide](production.md).

## Model integration

The assistant, receipt extraction and import categorisation run server-side behind a small
provider interface in `apps/api/app/ai/providers`:

- **Anthropic** through the official SDK, selected when `BS_ANTHROPIC_API_KEY` is set.
- **Any OpenAI-compatible chat-completions server** with tool calling: Ollama, vLLM, LM Studio,
  llama.cpp, or hosted services such as OpenRouter, Groq, Together or Fireworks. Selected when
  `BS_OPENAI_BASE_URL` and `BS_AI_MODEL` are set.

`BS_AI_PROVIDER` is `auto` by default and prefers Anthropic when its key is present; set it to
`anthropic`, `openai` or `disabled` to force a choice. Without a provider, every non-model
feature works unchanged.

### How a conversation runs

`apps/api/app/ai/agent.py` is a provider-neutral streaming loop. Messages are converted between
the assistant-ui format and each vendor's format in `messages.py`, and the response streams
through `assistant-stream` to the client's data-stream runtime. Tools in `tools.py` cover BQL
queries, reports, file reads and searches, and ledger edits.

**Writes require approval.** A model cannot change a ledger directly. It calls
`request_approval` with the exact operations it intends; the client shows the diff and the
bean-check result; only when the person approves does the backend execute those same
operations, after verifying the approval hash matches. This holds for every provider.

Two model slots exist: `BS_AI_MODEL` for chat and `BS_AI_FAST_MODEL` for extraction and
categorisation, which defaults to the chat model.

### Open-source models

The assistant is a tool-use agent, so the model must support function calling; receipts
additionally need vision. Good self-hosted choices today are Qwen3 (`qwen3:14b` and up),
Llama 3.3 70B, Mistral Small 3 and DeepSeek V3 for chat, and Qwen2.5-VL or Gemma 3 for
receipts. Small models can run the loop but are less reliable at producing valid ledger edits.

**Bundled Ollama:**

```bash
./studio.sh prod --profile ollama up -d --build
./studio.sh prod exec ollama ollama pull qwen3:14b
# in deploy/.env:  BS_OPENAI_BASE_URL=http://ollama:11434/v1   BS_AI_MODEL=qwen3:14b
./studio.sh prod up -d api
```

**Any other OpenAI-compatible server:** set `BS_OPENAI_BASE_URL` to its `/v1` endpoint,
`BS_OPENAI_API_KEY` if it needs one, and `BS_AI_MODEL` to the model id. Structured output falls
back from `json_schema` to JSON mode on servers that do not support schemas. PDF receipts are
read only by the Anthropic provider; upload an image instead on other servers.

The settings themselves are listed in the
[configuration reference](production.md#configuration-reference).

## HTTP API

Everything the interface does is available under `/api`, with either the session cookie or a
personal access token created under Settings → API keys and sent as
`Authorization: Bearer bsk_…`. Interactive documentation is served at `/api/docs`.

```bash
curl -H "Authorization: Bearer bsk_…" \
  "https://studio.example.com/api/ledgers/ada/personal/query?q=SELECT%20account,%20sum(position)%20GROUP%20BY%20account"
curl -H "Authorization: Bearer bsk_…" \
  "https://studio.example.com/api/ledgers/ada/personal/reports/balance-sheet?time=2026&conversion=USD"
```

Errors are `AppError` subclasses with a stable `code`; the web client shows them through
toasts or an error state, never silently.

## Where this is going

[ADR 0003](adr/0003-workspaces-as-tenants.md) introduces workspaces as the tenant, with
memberships and roles, self-serve onboarding and a per-workspace storage tree. Phase 1 of that
plan is in place: migrations, the storage path service, PostgreSQL in every stack and local
HTTPS.
