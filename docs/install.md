# Installing Beancount Studio

Beancount Studio has two parts:

- **The server** holds your data: ledgers as git repositories, uploads, and a PostgreSQL
  database with accounts and metadata. It runs in Docker, on your laptop or on a host you own.
- **The Mac app** is a desktop shell that connects to a server. You sign in on the server's own
  pages inside the app window, and the app remembers the server.

Everything is driven by one script at the repository root, `./studio.sh`.

## Prerequisites

| For | You need |
| --- | --- |
| Running the server | Docker Desktop (macOS, Windows) or Docker Engine with Compose v2 (Linux), `curl`, `openssl` |
| Building the Mac app | Node 22 and pnpm 10 (`corepack enable` gives you pnpm) |
| Developing | The above plus Python 3.12 and [uv](https://docs.astral.sh/uv/) for native API runs |

Clone the repository first:

```bash
git clone https://github.com/sjlouji/beancount-studio.git beancount-studio
cd beancount-studio
```

## 1. Server on your laptop

This is production on your machine: the same images and topology as a real deployment,
PostgreSQL, and HTTPS from Caddy's own certificate authority.

```bash
./studio.sh local
```

The first run creates `deploy/.env` with a generated `BS_SECRET_KEY` and `POSTGRES_PASSWORD`,
builds the images, starts PostgreSQL, the API, the web app and Caddy, runs the database
migrations and waits for the health check. It then prints the address, `https://localhost:8443`
by default.

Your machine does not trust Caddy's local certificate yet. Trust it once:

```bash
./studio.sh local trust
```

On macOS this adds the root certificate to the System keychain and asks for your password. On
Linux the script saves the certificate and prints where to copy it. After that, browsers and the
Mac app open `https://localhost:8443` without warnings.

Open the address and create the first account. It becomes the administrator. Set
`BS_ALLOW_SIGNUP=false` in `deploy/.env` afterwards if the instance should stay private.

Useful commands:

```bash
./studio.sh local down       # stop and remove the containers; data stays in the volumes
./studio.sh local logs -f    # follow logs
./studio.sh local ps         # status
```

If port 8443 is taken, set `BS_LOCAL_PORT` in `deploy/.env` or prefix the command:
`BS_LOCAL_PORT=9443 ./studio.sh local`.

## 2. Server for real

On a host with a public DNS name pointing at it and ports 80 and 443 open:

```bash
./studio.sh prod
```

The first run creates `deploy/.env`. Edit it and set `DOMAIN` to your host name, then run
`./studio.sh prod` again. Caddy obtains a public certificate automatically and serves
`https://<your domain>`. The script refuses to start `prod` without a `DOMAIN`.

Optional settings in `deploy/.env`:

| Setting | Purpose |
| --- | --- |
| `BS_ANTHROPIC_API_KEY` | Enables the assistant, receipt scanning and categorisation with Anthropic models |
| `BS_OPENAI_BASE_URL`, `BS_AI_MODEL` | Same features with any OpenAI-compatible server, for example a bundled Ollama (`./studio.sh prod --profile ollama up -d --build`) |
| `BS_SMTP_*` | Password-reset email |
| `BS_ALLOW_SIGNUP` | Set to `false` to close registration after the first account |

Data lives in two Docker volumes: `studio-data` (ledgers and uploads) and `postgres-data`.
Back up both. The API applies schema migrations on every start, so upgrading is pulling the new
code and running `./studio.sh prod` again.

## 3. Mac app

### Build the installer

```bash
cd apps/desktop
pnpm install
pnpm exec electron-builder --mac dmg --arm64     # this Mac only, about a minute
```

`pnpm package` instead builds dmg and zip for both Apple silicon and Intel; it takes longer.
The result lands in `apps/desktop/release/`, for example
`Beancount Studio-0.1.0-arm64.dmg`.

### Install

Open the dmg and drag Beancount Studio into Applications:

```bash
open "release/Beancount Studio-0.1.0-arm64.dmg"
```

### First launch

The app shows a connect screen. Enter your server address:

- `https://localhost:8443` for the laptop server from section 1, after `./studio.sh local trust`
- `https://<your domain>` for a real server

The app checks the address, remembers it, and loads the server's sign-in page. To point it at a
different server later, quit the app and remove
`~/Library/Application Support/beancount-studio-desktop/settings.json`, or run it once with
`STUDIO_SERVER_URL=https://other.example.com` set.

### Signing and sharing

An app built on the Mac that runs it is ad-hoc signed and opens without a Gatekeeper prompt. To
give the dmg to other people you need an Apple Developer ID certificate and notarization,
otherwise macOS blocks the app on their machines. `apps/desktop/electron-builder.yml` has
notarization enabled; it runs when these are set in the build environment:

```
APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
```

plus the Developer ID certificate in the keychain (or `CSC_LINK` and `CSC_KEY_PASSWORD`).

## 4. Development mode

```bash
./studio.sh dev
```

Starts PostgreSQL, the API with hot reload and the Next.js dev server in Docker with the
source bind-mounted, then opens `http://localhost:3000`. Ctrl-C stops the stack. The Mac app can
be run against it from source:

```bash
cd apps/desktop && pnpm dev
```

## Troubleshooting

- **Browser warns about the certificate on `https://localhost:8443`.** Run
  `./studio.sh local trust`. The stack must have started once before, because Caddy creates
  its certificate authority on first start.
- **`./studio.sh prod` says `set DOMAIN`.** Edit `deploy/.env`, or use `./studio.sh local` for a
  machine without a public name.
- **A port is already in use.** `BS_LOCAL_PORT` changes the local port. Dev mode uses 3000 and
  8000.
- **The web image build fails fetching the Inter font.** The build downloads the font from
  Google at build time; a transient network failure shows up as a module-not-found error.
  Run the command again.
- **The Mac app shows "Could not reach …".** The address must answer on `/api/healthz`. For the
  local server, make sure `./studio.sh local` is running and the certificate is trusted.
- **Logs.** `./studio.sh <mode> logs -f` for the server. The Mac app writes to
  `~/Library/Logs/beancount-studio-desktop/main.log`.
