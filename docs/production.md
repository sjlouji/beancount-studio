# Production setup

Beancount Studio runs as Docker Compose stacks. This guide covers running it on your laptop or
on a server, installing the Mac app, configuration, backups and upgrades. The development stack
is in [development.md](development.md).

## The stacks

Everything lives in `deploy/` and is driven by `./studio.sh` at the repository root.

| Mode | Compose files | What runs | Address |
| --- | --- | --- | --- |
| `local` | `docker-compose.prod.yml` + `docker-compose.local.yml` | Production images, PostgreSQL, Caddy serving HTTPS from its own local certificate authority | `https://localhost:8443` |
| `prod` | `docker-compose.prod.yml` | Production images, PostgreSQL, Caddy with a public certificate for `DOMAIN` | `https://<DOMAIN>` |
| `dev` | `docker-compose.dev.yml` | Source bind-mounted with hot reload, PostgreSQL | `http://localhost:3000` |

The script checks that Docker is running, creates `deploy/.env` from the template with generated
`BS_SECRET_KEY` and `POSTGRES_PASSWORD` values, builds and starts the containers, waits for the
health check, and opens the browser. Anything after the mode is passed to `docker compose`:

```bash
./studio.sh local down        # stop and remove containers; volumes stay
./studio.sh prod logs -f      # follow logs
./studio.sh local ps          # status
```

Without the script, the same stacks are plain Compose. `deploy/.env` must exist with the two
secrets set:

```bash
cd deploy && cp .env.example .env   # then set BS_SECRET_KEY and POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml -f docker-compose.local.yml up -d --build   # local
docker compose -f docker-compose.prod.yml up -d --build                               # prod
```

## Prerequisites

| For | You need |
| --- | --- |
| Running a stack | Docker Desktop (macOS, Windows) or Docker Engine with Compose v2 (Linux), `curl`, `openssl` |
| Building the Mac app | Node 22 and pnpm 10 (`corepack enable`) |

```bash
git clone https://github.com/sjlouji/beancount-studio.git beancount-studio
cd beancount-studio
```

## On your laptop

```bash
./studio.sh local
```

The first start also creates Caddy's local certificate authority. Trust it once per machine:

```bash
./studio.sh local trust
```

On macOS this adds the root certificate to the System keychain and asks for your password. On
Linux the script saves the certificate and prints where to copy it. Browsers and the Mac app
then open `https://localhost:8443` without warnings.

Create the first account; it becomes the administrator. Set `BS_ALLOW_SIGNUP=false` in
`deploy/.env` afterwards if the instance should stay private.

If port 8443 is taken, set `BS_LOCAL_PORT` in `deploy/.env` or prefix the command:
`BS_LOCAL_PORT=9443 ./studio.sh local`.

## On a server

On a host whose DNS name points at it, with ports 80 and 443 open:

```bash
./studio.sh prod
```

The first run creates `deploy/.env`. Set `DOMAIN` to the host name and run `./studio.sh prod`
again; Caddy obtains and renews the certificate. The script refuses to start `prod` without a
`DOMAIN`.

To add a local model server, enable the `ollama` profile and point the API at it; the commands
are in [architecture.md](architecture.md#open-source-models).

## Mac app

### Build

```bash
cd apps/desktop
pnpm install
pnpm exec electron-builder --mac dmg --arm64     # this Mac only
pnpm package                                     # dmg and zip for Apple silicon and Intel
```

Results land in `apps/desktop/release/`, for example `Beancount Studio-0.1.0-arm64.dmg`.

### Install and connect

Open the dmg and drag Beancount Studio into Applications. On first launch the app asks for a
server address: `https://localhost:8443` for the laptop stack after the trust step, or
`https://<DOMAIN>` for a server. It checks the address and remembers it, then opens your default
browser to sign in. Sign in there, approve "Sign in to the desktop app", and return to the app;
it picks up the session on its own. There is no login form inside the app.

To change servers, choose Workspace → Switch Server…, or launch once with
`STUDIO_SERVER_URL=https://other.example.com` set.

### Workspaces and links

The Workspace menu lists your workspaces on the connected server; ⌘1 to ⌘9 switch between them,
and the dock icon's menu lists them too. The menu also creates a workspace, opens the current
one's settings and, for owners and admins, its invite links.

`beancount-studio://` links open a page of the connected server in the app:
`beancount-studio://w/<workspace>/<ledger>` for a ledger, `beancount-studio://invite/<token>`
for an invitation (the invitation page in a browser offers this link). If the app is not signed
in yet, it signs in through the browser first and then opens the page. Links never name a
server, so one cannot point the app at another host.

### Signing and sharing

An app built on the Mac that runs it is ad-hoc signed and opens without a Gatekeeper prompt.
To hand the dmg to others you need an Apple Developer ID certificate and notarization;
`apps/desktop/electron-builder.yml` has notarization enabled and uses these when present:
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, plus the certificate in the
keychain or `CSC_LINK` and `CSC_KEY_PASSWORD`. The `desktop-release.yml` workflow builds and
attaches installers to a GitHub Release when a `desktop-v*` tag is pushed.

## Configuration reference

Compose-level settings in `deploy/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOMAIN` | `localhost` | Host name Caddy serves; required for `prod` |
| `BS_LOCAL_PORT` | `8443` | Host port for `local` |
| `POSTGRES_PASSWORD` | generated | Database password; changing it later means resetting the `postgres-data` volume |
| `BS_PUBLIC_URL` | `https://<DOMAIN>` | Public address used in emails and allowed as a browser origin |
| `BS_COOKIE_SECURE` | `true` | Secure flag on the session cookie |

API settings, all prefixed `BS_` and also read by native runs from `apps/api/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BS_DATA_DIR` | `./data` (`/data` in Docker) | Ledgers and uploads; the SQLite database when used |
| `BS_DATABASE_URL` | SQLite in the data directory | The stacks set `postgresql+asyncpg://…@postgres/studio` |
| `BS_SECRET_KEY` | generated | Signs password-reset tokens |
| `BS_ALLOW_SIGNUP` | `true` | Allow accounts after the first one |
| `BS_AI_PROVIDER` | `auto` | `anthropic`, `openai`, `disabled`; `auto` prefers Anthropic when its key is set |
| `BS_ANTHROPIC_API_KEY` | — | Anthropic provider |
| `BS_OPENAI_BASE_URL`, `BS_OPENAI_API_KEY` | — | OpenAI-compatible provider, for example `http://ollama:11434/v1`; the key is optional for local servers |
| `BS_AI_MODEL`, `BS_AI_FAST_MODEL` | `claude-opus-5-5` on Anthropic | Chat model, and the model for extraction and categorisation (defaults to the chat model); required for OpenAI-compatible servers |
| `BS_SMTP_HOST`, `BS_SMTP_PORT`, `BS_SMTP_USER`, `BS_SMTP_PASSWORD`, `BS_SMTP_FROM`, `BS_SMTP_STARTTLS` | — | Password-reset email; leave the host empty to disable |
| `BS_MAX_UPLOAD_BYTES` | 25 MB | Upload limit |
| `BS_BQL_MAX_ROWS` | 5000 | Row cap for BQL results |

The web container reads `API_URL`, the server-side address of the API used by the `/api`
rewrite; the stacks set it to `http://api:8000`.

## Remotes and credentials

Ledgers connected to a git remote push after every commit. The API image includes
`openssh-client` for SSH remotes; GitHub's host keys are pre-seeded in
`<data>/ssh/known_hosts` and other hosts are pinned on first use. Tokens and the per-account SSH
private keys are stored encrypted under `BS_SECRET_KEY`: changing that key makes them
undecryptable, and affected remotes show an error until they are reconnected or the SSH key is
generated again. Importing from a path on the server is limited to administrators and refuses
paths inside the data directory.

## Data, backups and upgrades

Two volumes hold everything: `studio-data` (every workspace's ledgers and the uploads, mounted
at `/data` in the API container) and `postgres-data`. The launcher keeps them together.

```bash
./studio.sh prod backup                 # → backups/beancount-studio-prod-2026-10-30-031500.tar
./studio.sh prod backup /mnt/offsite    # anywhere else
./studio.sh prod restore backups/beancount-studio-prod-2026-10-30-031500.tar
./studio.sh prod update                 # backup, git pull, rebuild, restart
```

Use `local` in place of `prod` for the laptop stack; the volumes have the same names, so a backup
made on a laptop restores on a server and the other way round. The `dev` stack has none of this:
its ledgers are the host directory `apps/api/data` and its database is disposable.

**backup** writes one tar file holding a `manifest.txt` (when, which stack, app version, database
revision), `database.dump` (`pg_dump` in custom format) and `data.tar.gz` (the data volume without
its scratch directory). The stack keeps running; the files are read before the database is dumped,
so a ledger created during the backup is at worst missing from it entirely rather than half
present. For a nightly copy, a cron line will do:

```
0 3 * * * /srv/beancount-studio/studio.sh prod backup /srv/backups >> /var/log/studio-backup.log 2>&1
```

**restore** unpacks an archive, asks you to type `restore` (or takes `--yes`, for scripts), stops
the API, empties the data volume and fills it from the archive, drops and recreates the database
from the dump, then starts the stack again. The API applies any migrations the code has gained
since the backup was made. An archive made by a newer version than the checkout is refused until
you update the code. The stack must have started once on the machine so that its volumes exist.

**update** backs up first (skip with `--no-backup`), pulls the code when the checkout tracks a
remote branch, pulls newer base images, rebuilds the API and web images and restarts the stack;
the API runs new migrations before it accepts traffic. Old images stay on disk until you run
`docker image prune`.

## Troubleshooting

- **Browser warns about the certificate on `https://localhost:8443`.** Run
  `./studio.sh local trust`. The stack must have started once before.
- **`./studio.sh prod` says `set DOMAIN`.** Edit `deploy/.env`, or use `local` for a machine
  without a public name.
- **A port is already in use.** `BS_LOCAL_PORT` changes the local port.
- **The web image build fails fetching the Inter font.** The build downloads the font from
  Google; a transient network failure shows as a module-not-found error. Run the command again.
- **The Mac app says "Could not reach …".** The address must answer on `/api/healthz`. For the
  laptop stack, make sure `./studio.sh local` is running and the certificate is trusted.
- **Logs.** `./studio.sh <mode> logs -f` for the server. The Mac app writes to
  `~/Library/Logs/beancount-studio-desktop/main.log`.
