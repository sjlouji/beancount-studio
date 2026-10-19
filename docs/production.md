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

To change servers, quit the app and remove
`~/Library/Application Support/beancount-studio-desktop/settings.json`, or launch once with
`STUDIO_SERVER_URL=https://other.example.com` set.

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

## Data, backups and upgrades

Two volumes hold everything: `studio-data` (ledgers and uploads, mounted at `/data` in the API
container) and `postgres-data`. Back up both together.

```bash
# database
./studio.sh prod exec -T postgres pg_dump -U studio -d studio > studio-$(date +%F).sql
# ledgers and uploads
docker run --rm -v beancount-studio_studio-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/studio-data-$(date +%F).tgz -C /data .
```

Restore by reversing the two: `psql` the dump into a fresh `postgres` service, and extract the
archive into an empty `studio-data` volume before starting the API. Use `local` in place of
`prod` for the laptop stack; the volume names are the same.

Upgrading is pulling the new code and starting again. Images are rebuilt and the API runs any
new migrations before it accepts traffic:

```bash
git pull
./studio.sh prod
```

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
