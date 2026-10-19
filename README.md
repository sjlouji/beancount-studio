<p align="center">
  <img src="apps/web/public/icon.svg" width="72" alt="">
</p>
<h1 align="center">Beancount Studio</h1>
<p align="center"><strong>Self-hosted, plain-text accounting with real reports, a ledger editor, imports, receipts, and an assistant that asks before it writes.</strong></p>
<p align="center">
  <a href="https://github.com/sjlouji/beancount-studio/actions/workflows/ci.yml"><img src="https://github.com/sjlouji/beancount-studio/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

Beancount Studio is a web workspace for [Beancount](https://beancount.github.io/docs/) ledgers,
with a Mac app. Your books stay readable text files in a git repository you own. The app adds the
interface: interactive financial statements, a journal with inline editing, an editor with
bean-check, bank-statement import with de-duplication, receipt capture, collaboration, and an AI
assistant whose edits are shown as diffs and committed only after you approve them.

## Who it is for

- People who keep their books in Beancount and want reports, editing and imports in a browser or
  a Mac app instead of the command line.
- Households and small teams who share ledgers and want every change recorded as a commit by
  the person who made it.
- Anyone who wants to run it themselves: one machine, Docker Compose, no third-party service
  required.

## What you can do

| Area | Features |
| --- | --- |
| Reports | Overview dashboard, income statement, balance sheet, cash-flow statement (direct method, with per-account roles), trial balance, per-account pages, holdings, statistics, budgets. Shared time, account, filter, conversion and interval scope in the URL. CSV and Markdown exports. |
| Journal | Filterable, searchable journal over every directive type; entry context with balances before and after; edit or delete an entry's source lines; permalinks per entry; new-entry dialog for transactions, balances, notes, opens, closes, pads, prices, events, commodities and budgets with auto-balancing and payee autofill. |
| Files and history | Repository browser, Monaco editor with Beancount syntax highlighting, bean-check and auto-format, uploads, renames; every change is a git commit with browsable history and diffs. |
| Import | CSV, OFX, QFX and QIF parsing with column detection and remapping, duplicate detection against the ledger, category suggestions from payee history and from the model when configured, review table, commit to the file you choose. |
| Receipts | Upload a photo or PDF; the model extracts date, payee, total and currency and suggests accounts; the file is stored next to the ledger and linked from the transaction. |
| Assistant | Chat with your ledger: BQL queries, reports, file reads and searches. Edits go through an approval card showing the diff and bean-check result. Threads are kept per ledger. |
| Data pages | Accounts (tree and table, open and close), commodities and price charts, documents with previews, events timeline, errors with jump-to-line, a BQL workbench with sortable results and CSV download. |
| Accounts and sharing | Email and password accounts (the first user is the administrator), public or private ledgers, a public gallery, per-ledger collaborators with read, write or admin roles, stars, personal access tokens with read and write scopes, password reset by email when SMTP is configured. |

## What you get

- **Your data on your disk.** Ledgers are git repositories under a data directory you control.
  Ledger content never enters the database.
- **Production on a laptop.** One command starts PostgreSQL, the API, the web app and Caddy
  with HTTPS. The same images and layout run on a server with a public certificate.
- **A Mac app** that connects to your server and remembers it.
- **An HTTP API** for everything the interface does, with personal access tokens.
- **Your choice of model, or none.** The assistant, receipt scanning and categorisation run
  with an Anthropic key or with an open-source model served by Ollama, vLLM, LM Studio or any
  OpenAI-compatible server. Without either, everything else still works.
- **MIT licensed**, with no hosted dependencies.

## Quick start

```bash
git clone https://github.com/sjlouji/beancount-studio.git beancount-studio && cd beancount-studio
./studio.sh local          # production images on this machine → https://localhost:8443
./studio.sh local trust    # once per machine: trust the local certificate
```

Open the address and create the first account; it becomes the administrator. The full steps,
the Mac app and a real server are in the production guide below.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Production setup](docs/production.md) | The Docker Compose stacks, running on a laptop or a server, installing the Mac app, configuration, backups and upgrades |
| [Development setup](docs/development.md) | The hot-reload stack, native runs, checks, database migrations, working on the Mac app |
| [Architecture and model integration](docs/architecture.md) | How the pieces fit, where data lives, how the assistant and its model providers work, the HTTP API |
| [Decision records](docs/adr) | Why the desktop shell, the repository layout and the workspace model are the way they are |
| [Design system](DESIGN.md) and [frontend conventions](docs/frontend-conventions.md) | The visual language and the patterns the web client follows |

## Support and information

- **Questions and ideas:** [Discussions](https://github.com/sjlouji/beancount-studio/discussions).
- **Bugs and feature requests:** [Issues](https://github.com/sjlouji/beancount-studio/issues),
  with templates for both.
- **Security:** report privately as described in [SECURITY.md](SECURITY.md). Never in a public
  issue.
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md) and the
  [code of conduct](CODE_OF_CONDUCT.md).
- **Status:** pre-1.0. `main` is protected and every change passes CI. Mac app releases are
  tagged `desktop-v*` and built by GitHub Actions.
- **Out of scope today:** bank connections through aggregators, hosted billing, mobile apps,
  git over SSH with public keys, an MCP server, a CLI, and localisation (the interface is
  English only).

## License

[MIT](LICENSE). Beancount and Fava remain under their own licenses (GPL-2.0 and MIT); the API
image includes them as dependencies.
