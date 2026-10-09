<p align="center">
  <img src="apps/web/public/icon.svg" width="72" alt="">
</p>
<h1 align="center">Beancount Studio</h1>
<p align="center"><strong>Self-hosted, plain-text accounting with real reports, a ledger editor, imports, receipts, and an assistant that asks before it writes.</strong></p>

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

Everything runs without any third-party service. Set an Anthropic API key to enable the
assistant, receipt scanning and AI categorisation; set SMTP to enable password-reset email.

## Quick start (Docker)

```bash
git clone <this repo> beancount-studio && cd beancount-studio/deploy
cp .env.example .env            # set BS_SECRET_KEY (openssl rand -hex 32) and DOMAIN
docker compose up -d --build    # Caddy serves https://$DOMAIN with automatic certificates
```

For a local trial without TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
open http://localhost:8080          # set BS_LOCAL_PORT in .env if 8080 is taken
```

Create the first account in the browser; it becomes the administrator. Set
`BS_ALLOW_SIGNUP=false` afterwards if the instance should stay private. Ledgers, uploads and
the database live in the `studio-data` volume (`/data` in the API container); back that up.

## Development

Requirements: Node 22 + pnpm, Python 3.12 + [uv](https://docs.astral.sh/uv/), git.

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

## Architecture

```
apps/web   Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui · TanStack Query · Recharts · Monaco · assistant-ui
apps/api   FastAPI · SQLAlchemy (SQLite by default, PostgreSQL optional) · beancount 3 + beanquery + fava core · git · anthropic SDK
deploy     docker-compose (web + api + Caddy), Caddyfile, env template
docs       conventions and design notes
```

- **Ledgers are git repositories** under `BS_DATA_DIR/ledgers/<id>/repo`. Every write (editor
  save, new entry, import, receipt, assistant edit) is a commit authored by the signed-in user.
- **Reports come from Fava's core** (`fava.core`), the same engine behind Fava's web UI, so
  balances, conversions, intervals, budgets and BQL behave exactly like Beancount/Fava.
- **The web app never talks to Beancount directly.** It calls the API through same-origin
  `/api/*` routes (Next.js rewrites), so the session cookie works without CORS.
- **The assistant runs server-side** with the Anthropic SDK and streams through
  `assistant-stream` to the assistant-ui data-stream runtime. Write tools require an approved
  `request_approval` call for the exact same operations; the backend verifies the approval hash
  before committing.
- See [docs/frontend-conventions.md](docs/frontend-conventions.md) for the UI patterns.

## Configuration

API settings are environment variables prefixed with `BS_` (see `apps/api/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `BS_DATA_DIR` | `./data` | Ledgers, uploads, SQLite database |
| `BS_DATABASE_URL` | SQLite in data dir | e.g. `postgresql+asyncpg://user:pass@host/db` |
| `BS_SECRET_KEY` | change-me | Signs password-reset tokens |
| `BS_PUBLIC_URL` / `BS_CORS_ORIGINS` | `http://localhost:3000` | Public URL (emails) and allowed origins |
| `BS_ALLOW_SIGNUP` | `true` | Allow new accounts after the first one |
| `BS_COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `BS_ANTHROPIC_API_KEY` | — | Enables the assistant, receipts and AI categorisation |
| `BS_AI_MODEL` / `BS_AI_FAST_MODEL` | `claude-opus-5-5` | Chat model / extraction and categorisation model |
| `BS_SMTP_*` | — | Password-reset email |
| `BS_MAX_UPLOAD_BYTES` | 25 MB | Upload limit |

The web app reads `API_URL` (server-side address of the API, default `http://localhost:8000`).

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
