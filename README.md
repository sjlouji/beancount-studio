<p align="center">
  <img src="apps/web/public/icon.svg" width="72" alt="">
</p>
<h1 align="center">Beancount Studio</h1>
<p align="center"><strong>Self-hosted, plain-text accounting with real reports, a ledger editor, imports, receipts, and an assistant that asks before it writes.</strong></p>
<p align="center">
  <a href="https://github.com/sjlouji/beancount-studio/actions/workflows/ci.yml"><img src="https://github.com/sjlouji/beancount-studio/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

Beancount Studio is a web workspace for [Beancount](https://beancount.github.io/docs/) ledgers.
Your books stay readable text files in a git repository you own; the app adds the interface:
interactive financial statements, a journal with inline editing, a Monaco editor with
bean-check, bank-statement import with de-duplication, receipt capture, collaboration, and an
AI assistant built on [assistant-ui](https://www.assistant-ui.com) whose edits are previewed as
diffs and committed only after you approve them.

It is a from-scratch reimplementation of the web client of [beancount.io](https://github.com/bex-co/beancount-io)
with a different stack and no hosted dependencies: **Next.js 16 + shadcn/ui** in front of a
**Python (FastAPI) API** that runs Beancount and Fava's reporting core in-process.

## What you get

| Area | Features |
| --- | --- |
| Reports | Overview dashboard, income statement, balance sheet, cash-flow statement (direct method, with per-account roles), trial balance, per-account pages, holdings, statistics, budgets. Shared time/account/filter/conversion/interval scope in the URL. CSV and Markdown exports. |
| Journal | Filterable, searchable journal over every directive type; entry context with balances before/after; edit or delete an entry's source lines; permalinks per entry; new-entry dialog for transactions, balances, notes, opens, closes, pads, prices, events, commodities and budgets with auto-balancing and payee autofill. |
| Files & history | Repository browser, Monaco editor with Beancount syntax highlighting, bean-check and auto-format, uploads, renames; every change is a git commit with a browsable history and diffs. |
| Import | CSV/OFX/QFX/QIF parsing with column detection and remapping, duplicate detection against the ledger, category suggestions from payee history (and from the model when configured), review table, commit to the file you choose. |
| Receipts | Upload a photo or PDF; the model extracts date, payee, total, currency and suggests accounts; the file is stored next to the ledger and linked from the transaction. |
| Assistant | Chat with your ledger: BQL queries, reports, file reads and searches. Edits go through an approval card showing the diff and bean-check result. Threads are persisted per ledger. |
| Data pages | Accounts (tree/table, open/close), commodities and price charts, documents with previews, events timeline, errors with jump-to-line, a BQL workbench with sortable results and CSV download. |
| Accounts & sharing | Email/password accounts (first user is admin), public or private ledgers, a public gallery, per-ledger collaborators (read/write/admin), stars, personal access tokens with read/write scopes, password reset by email (optional). |

Everything runs without any third-party service. The assistant, receipt scanning and AI
categorisation work with either an Anthropic API key or an open-source model served by
Ollama, vLLM, LM Studio, llama.cpp or any other OpenAI-compatible server (see
[Open-source models](#open-source-models)); set SMTP to enable password-reset email.

## Quick start

Full installation steps for the server and the Mac app are in [docs/install.md](docs/install.md).

One script drives every Docker stack. It checks that Docker is running, creates `deploy/.env`
with a generated `BS_SECRET_KEY` when needed, builds and starts the containers, waits for the
health check and opens the browser.

```bash
git clone https://github.com/sjlouji/beancount-studio.git beancount-studio && cd beancount-studio
./studio.sh dev      # hot-reload development stack → http://localhost:3000
./studio.sh local    # production images on this machine → https://localhost:8443
./studio.sh prod     # production stack; Caddy serves https://$DOMAIN with automatic certificates
```

| Mode | Compose files in `deploy/` | What runs |
| --- | --- | --- |
| `dev` | `docker-compose.dev.yml` | Source bind-mounted, uvicorn `--reload` and `next dev`, PostgreSQL; ledgers in `apps/api/data` |
| `local` | `docker-compose.prod.yml` + `docker-compose.local.yml` | Production images, PostgreSQL, Caddy over HTTPS from its own local certificate authority (`BS_LOCAL_PORT`, default 8443) |
| `prod` | `docker-compose.prod.yml` | Production images, PostgreSQL, Caddy with public TLS for `DOMAIN` |

Anything after the mode is passed to `docker compose` for that stack: `./studio.sh dev down`,
`./studio.sh prod logs -f`, `./studio.sh local ps`.

`local` is production on your laptop. Run `./studio.sh local trust` once per machine to add
Caddy's local root certificate to the system keychain; browsers and the desktop app then open
`https://localhost:8443` without warnings. For `prod`, set `DOMAIN` in `deploy/.env` first; the
script refuses to start without it.

Create the first account in the browser; it becomes the administrator. Set
`BS_ALLOW_SIGNUP=false` afterwards if the instance should stay private. In `local` and `prod`,
ledgers and uploads live in the `studio-data` volume (`/data` in the API container) and metadata
in PostgreSQL (`postgres-data`); back up both. The API migrates the database schema at startup.

## Development

`./studio.sh dev` is the usual way to work: the API restarts on Python changes and the web app
runs Next's dev server, both inside Docker with the source bind-mounted and PostgreSQL alongside.
`deploy/.env` is optional in this mode and is read for AI provider settings.

Schema changes are Alembic revisions under `apps/api/app/db/migrations`, applied by the API at
startup. After editing the models: `cd apps/api && uv run alembic revision --autogenerate
--rev-id 0002 -m "describe the change"`, then review the generated file.

To run the servers on the host instead you need Node 22 + pnpm, Python 3.12 +
[uv](https://docs.astral.sh/uv/) and git:

```bash
# API (http://localhost:8000, docs at /api/docs)
cd apps/api
uv sync --all-groups
cp .env.example .env            # optional; defaults work for local dev
uv run uvicorn app.main:app --reload

# Web (http://localhost:3000, proxies /api to the API)
cd apps/web
pnpm install
pnpm dev
```

Checks: `cd apps/api && uv run ruff check app tests && uv run pytest` and
`cd apps/web && pnpm exec tsc --noEmit && pnpm lint && pnpm build`.

## Desktop app (macOS)

`apps/desktop` is an Electron shell that loads a Beancount Studio server in a hardened window,
the way Slack's desktop app loads its web client ([ADR 0001](docs/adr/0001-desktop-app-is-an-electron-shell.md)).
On first launch it asks for a server address, checks it and remembers it; you sign in on the
server's own pages.

```bash
./studio.sh dev                       # a server to connect to, http://localhost:3000
cd apps/desktop && pnpm install
pnpm dev                              # opens the shell pointed at the dev server
pnpm start                            # first-launch flow: asks for a server address
pnpm test                             # tsc + node:test
pnpm package                          # signed dmg + zip in apps/desktop/release (needs a Developer ID)
```

Set `STUDIO_SERVER_URL` to override the saved server for one run. The shell exposes
`window.studioDesktop` (typed by `packages/desktop-bridge`) so the web client can tell it runs
inside the app.

## Architecture

```
apps/web   Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · TanStack Query · Recharts · Monaco · assistant-ui
apps/api   FastAPI · SQLAlchemy + Alembic (PostgreSQL in Docker, SQLite natively) · beancount 3 + beanquery + fava core · git · anthropic + openai SDKs
apps/desktop  Electron shell for macOS · loads a server's web UI · typed bridge from packages/desktop-bridge
packages   desktop-bridge (contract between the web client and the shell)
deploy     docker-compose.dev.yml (hot reload) · docker-compose.prod.yml + .local.yml (web + api + Caddy, optional Ollama profile) · Caddyfile · env template
docs       conventions, design notes and ADRs (docs/adr)
```

- **Ledgers are git repositories** under `BS_DATA_DIR/ledgers/<id>/repo`. Every write (editor
  save, new entry, import, receipt, assistant edit) is a commit authored by the signed-in user.
- **Reports come from Fava's core** (`fava.core`), the same engine behind Fava's web UI, so
  balances, conversions, intervals, budgets and BQL behave exactly like Beancount/Fava.
- **The web app never talks to Beancount directly.** It calls the API through same-origin
  `/api/*` routes (Next.js rewrites), so the session cookie works without CORS.
- **The assistant runs server-side** behind a small provider interface
  (`apps/api/app/ai/providers`): one implementation uses the Anthropic SDK, the other any
  OpenAI-compatible chat-completions server with tool calling. Both stream through
  `assistant-stream` to the assistant-ui data-stream runtime. Write tools require an approved
  `request_approval` call for the exact same operations; the backend verifies the approval hash
  before committing, whichever model is driving.
- See [docs/frontend-conventions.md](docs/frontend-conventions.md) for the UI patterns.

## Configuration

API settings are environment variables prefixed with `BS_` (see `apps/api/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `BS_DATA_DIR` | `./data` | Ledgers and uploads (and the SQLite database when used) |
| `BS_DATABASE_URL` | SQLite in data dir | The Docker stacks set `postgresql+asyncpg://…@postgres/studio`; native runs and tests use SQLite |
| `BS_SECRET_KEY` | change-me | Signs password-reset tokens |
| `BS_PUBLIC_URL` / `BS_CORS_ORIGINS` | `http://localhost:3000` | Public URL (emails) and allowed origins |
| `BS_ALLOW_SIGNUP` | `true` | Allow new accounts after the first one |
| `BS_COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `BS_AI_PROVIDER` | `auto` | `anthropic`, `openai` (any OpenAI-compatible server), `disabled`; `auto` prefers Anthropic when its key is set |
| `BS_ANTHROPIC_API_KEY` | — | Anthropic provider |
| `BS_OPENAI_BASE_URL` / `BS_OPENAI_API_KEY` | — | OpenAI-compatible provider, e.g. `http://ollama:11434/v1` (key optional for local servers) |
| `BS_AI_MODEL` / `BS_AI_FAST_MODEL` | `claude-opus-5-5` on Anthropic | Chat model / extraction and categorisation model (fast model defaults to the chat model). Required for OpenAI-compatible servers |
| `BS_SMTP_*` | — | Password-reset email |
| `BS_MAX_UPLOAD_BYTES` | 25 MB | Upload limit |

The web app reads `API_URL` (server-side address of the API, default `http://localhost:8000`).

### Open-source models

The assistant is a tool-use agent, so the model must support function calling; receipts
additionally need vision. Good self-hosted choices today are Qwen3 (`qwen3:14b` and up),
Llama 3.3 70B, Mistral Small 3 and DeepSeek V3 for chat, and Qwen2.5-VL / Gemma 3 for
receipts. Small models can run the loop but are less reliable at building valid ledger edits.

**Bundled Ollama (Docker):**

```bash
./studio.sh prod --profile ollama up -d --build
./studio.sh prod exec ollama ollama pull qwen3:14b
# in deploy/.env:  BS_OPENAI_BASE_URL=http://ollama:11434/v1   BS_AI_MODEL=qwen3:14b
./studio.sh prod up -d api
```

**Any other OpenAI-compatible server** (local vLLM / LM Studio / llama.cpp, or hosted
OpenRouter, Groq, Together, Fireworks): set `BS_OPENAI_BASE_URL` to its `/v1` endpoint,
`BS_OPENAI_API_KEY` if it needs one, and `BS_AI_MODEL` to the model id. Structured output falls
back from `json_schema` to JSON mode automatically on servers that do not support schemas; PDF
receipts are only read by the Anthropic provider (upload an image instead).

## API

Everything the UI does is available over HTTP under `/api` with either the session cookie or a
personal access token (`Authorization: Bearer bsk_…`, created under Settings → API keys).
Interactive docs: `/api/docs`. Examples:

```bash
curl -H "Authorization: Bearer bsk_…" "https://studio.example.com/api/ledgers/ada/personal/query?q=SELECT%20account,%20sum(position)%20GROUP%20BY%20account"
curl -H "Authorization: Bearer bsk_…" "https://studio.example.com/api/ledgers/ada/personal/reports/balance-sheet?time=2026&conversion=USD"
```

## Not included (compared with beancount.io)

Plaid bank connections, Stripe billing, the mobile apps, git-over-SSH / public keys, the MCP
server, the CLI, localisation (the UI is English only), and the Cloudflare sandbox agent. These
depend on hosted services or are outside a self-hosted web app.

## License

MIT. Beancount and Fava remain under their own licenses (GPL-2.0 and MIT respectively); the API
image includes them as dependencies.
