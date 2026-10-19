# ADR 0002: One monorepo with apps, packages and deploy

**Status:** Accepted · 2026-10-19

## Context

Adding a desktop app raised the question of one repository or several. Slack historically kept
its desktop shell in a separate repository from the web client; that suits many teams with
independent release trains. Beancount Studio is built by a small team shipping web, API and
desktop together.

## Decision

Keep a single repository:

```
apps/web                Next.js client
apps/api                FastAPI backend
apps/desktop            Electron shell (ADR 0001)
packages/desktop-bridge Typed contract between the web client and the shell's preload
deploy/                 Compose stacks and Caddy config, driven by ./studio.sh
docs/adr                Architecture decision records
```

Rules that keep it tidy:

- A `packages/*` entry exists only when two apps consume it. Today that is the desktop bridge.
  An API client package is extracted when the shell itself starts calling the API.
- Python stays outside the JavaScript workspace. The web client's TypeScript API types should
  be generated from the API's OpenAPI document rather than maintained by hand.
- Each app releases independently with its own tag prefix (`web-v…`, `desktop-v…`).

**Deferred:** a root `pnpm-workspace.yaml`. Making `apps/web` a workspace member moves its
lockfile to the repository root, which changes the web Dockerfile's build context, the CI cache
path and the dev compose bind mount. Until that migration is done in one change,
`apps/desktop` is a standalone pnpm project and consumes the bridge through a `link:`
dependency.

## Consequences

- Atomic changes across web, API, desktop and the bridge contract; one CI, one issue tracker.
- Clones are larger for someone who only works on the shell. Accepted.
- The workspace migration is a known next step with a clear blast radius.

## Alternatives considered

- **Two repositories** (product + desktop shell). Independent cadences, smaller clones;
  duplicated tooling, cross-repo contract changes and version coordination. Rejected for the
  team size.
