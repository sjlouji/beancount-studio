# ADR 0003: Workspaces are the tenant, with self-serve onboarding

**Status:** Accepted · 2026-10-19

## Context

Beancount Studio started with ledgers owned by individual users and shared through per-ledger
collaborators. The product direction (ADR 0001) is a Slack-style client, and Slack's unit of
organisation is the workspace: a team with its own members, content and settings, created by
anyone in a few clicks. We want the same: a person signs up, creates a workspace or accepts an
invitation, and is working within minutes, on a server anyone can run locally at production
grade.

## Decision

**Workspace is the tenant.** It owns ledgers, files, members and settings. Everything a person
sees lives under a workspace addressed by path: `/w/<slug>/…`. Subdomains were rejected because
self-hosters rarely have wildcard DNS and certificates.

**One account, many workspaces.** A person has one account per server and a membership per
workspace with a role: owner, admin, member or viewer. Members see every ledger in the
workspace. Per-ledger collaborators are removed rather than kept as a second permission system.
The first account on a server is the instance admin and controls signups and quotas.

**Self-serve onboarding.** Sign up, create a workspace or accept an invite link, create the first
ledger from a template with currency and fiscal year, invite people or skip, land on the
workspace home. Invite links carry a role and an expiry. Email verification is enabled only when
SMTP is configured, so a laptop install never waits on mail.

**Product-managed storage.** All data lives in a tree the product owns, built by one path service
(`app/storage.py`) that every module calls:

```
BS_DATA_DIR/
├── workspaces/<workspace_id>/
│   ├── ledgers/<ledger_id>/repo/   git repository per ledger
│   └── files/                      uploads, receipts, statements, exports
└── tmp/
```

Local disk is the only backend. The path service is the seam for object storage later, and
usage is recorded per workspace on write so quotas are possible on shared servers.

**Existing data is migrated, not dropped.** The first Alembic revision describes the pre-workspace
schema exactly; databases created before migrations are stamped with it. The migration that
introduces workspaces moves each user's ledgers into a workspace named after them and
relocates their directories on disk. This happens after the model lands, as a separate step.

**Production grade on a laptop.** Every Docker mode runs PostgreSQL; SQLite remains for native
runs and tests. The `local` mode serves HTTPS from Caddy's internal certificate authority, with a
one-time `./studio.sh local trust` that adds the root certificate to the system keychain so
browsers and the desktop app connect without warnings.

## Consequences

- Schema changes now go through Alembic; `create_all` is gone from the application.
- URLs change in the web client once workspaces exist; old ledger URLs redirect after the data
  migration.
- Two databases to support in CI and tests: SQLite for speed, PostgreSQL for the deployed shape.
- Users and ledgers from the current single-user model keep working until the workspace
  migration runs.

## Phases

1. Foundation: Alembic with a baseline revision, storage path service, PostgreSQL in Docker,
   local HTTPS. No behaviour change.
2. Workspace model and API: tables, roles, invites, access dependencies, routes with the
   workspace segment, data migration of existing users and ledgers.
3. Web: `/w/[workspace]/…` routes, switcher, onboarding wizard, invite acceptance, workspace
   settings, gallery across workspaces.
4. Local production tooling: backup, restore and update commands in `./studio.sh`.
5. Desktop: workspace switcher and deep links through the bridge.

## Implementation notes (phase 2, 2026-10-30)

- Ledger routes are nested under the workspace: `/api/workspaces/{workspace}/ledgers/{slug}/…`.
  `GET /api/ledgers` still lists every ledger across the caller's workspaces. The web client's
  first URL segment is now the workspace slug; because a migrated workspace takes the person's
  username as its slug, pre-workspace ledger links keep resolving without redirects.
- A workspace role maps onto ledger access as owner → owner, admin → admin, member → write,
  viewer → read. Anyone above a member may change or remove them; owners are peers; the last
  owner cannot leave or be demoted. Deleting an account is refused while the person is the only
  owner of a workspace that still has other members; workspaces where they were alone go with
  the account.
- Per-ledger collaborator grants are **not** carried over by the migration: a workspace member
  sees every ledger in it, so copying a grant for one ledger would widen access to the rest.
  The migration logs each dropped grant; owners re-invite those people with a link.
- An SSH remote pushes with the key of the person who connected it (`ledger_remotes.ssh_user_id`),
  since ledgers no longer have an owner. Migrated remotes keep the former owner's key.
- Temporary uploads stay person-owned under `uploads/`; only ledgers moved under
  `workspaces/<id>/`. The `files/` directory of the layout above is created when something
  workspace-owned other than a ledger exists.
- Invite links are multi-use until they expire (1–90 days) or are revoked; accepting one twice
  changes nothing.

## Implementation notes (phase 3, 2026-10-30)

- Routes: `/w/<workspace>` (home), `/w/<workspace>/settings`, `/w/<workspace>/<ledger>/…`,
  `/new` (onboarding) and `/invite/<token>`. `/` forwards to the workspace opened last in that
  browser, or to `/new`. `/ledgers` and `/ledger/…` redirect permanently.
- Because workspace pages share the segment that ledger slugs use, the API reserves the slugs
  `settings`, `new`, `members`, `invites`, `activity` and `search` for ledgers.
- Signing up no longer creates anything: the wizard creates the workspace, the first ledger (any
  template, with currency and an optional fiscal year end written as Fava's option) and invite
  links, each step after the first skippable. The example ledger lives on as a template choice.
- The gallery page is not reintroduced; it was removed from the web app on 2026-10-20 and the
  API endpoint remains for the stars and public ledgers that still exist.
- The workspace switcher is the sidebar header on every page (Slack's workspace name); inside a
  ledger the ledger switcher sits under it and lists that workspace's ledgers.

## Implementation notes (phase 4, 2026-10-30)

- `./studio.sh <local|prod> backup [DIR]`, `restore ARCHIVE [--yes]` and `update [--no-backup]`
  in the launcher; the `dev` stack is refused because its data lives on the host.
- One tar per backup: `manifest.txt` (date, stack, app version, database revision), a custom-format
  `pg_dump`, and the data volume as `data.tar.gz` without the scratch `tmp/` directory. Files are
  read before the database is dumped so no row can point at missing files; the stack keeps running.
- Restore refuses archives whose database revision is newer than the checkout, asks for the word
  `restore` unless `--yes`, stops only the API while it replaces the volume and recreates the
  database, and lets the API migrate forward on start.
- Update backs up first, pulls only when the checkout tracks a remote branch, then rebuilds and
  restarts. The script body runs inside one function so a pull cannot change it mid-run.
- `COMPOSE_PROJECT_NAME` selects the instance the commands address; the default is the stacks'
  own `beancount-studio`, whose volumes are `beancount-studio_studio-data` and `_postgres-data`.

## Implementation notes (phase 5, 2026-10-30)

- The bridge grows one call, `setWorkspaces({ workspaces, current })`, which the web client makes
  from a root-level component whenever its workspace list or the current slug changes. The shell
  accepts it only from the connected server's pages and checks every field.
- The shell's application menu gains a Workspace menu (one radio item per workspace with ⌘1–⌘9,
  Create a Workspace, Workspace Settings, Invite People for admins, Switch Server) and the dock
  menu lists the workspaces. Items load the page on the server rather than steering the client,
  so an older web client works too.
- Deep links: `beancount-studio://<root>/…` for the roots `w`, `invite`, `new`, `settings`, `u`
  opens that page on the connected server; `signed-in` keeps its sign-in meaning. A link that
  arrives before sign-in, or a `/login?next=…` the server answers with, is kept as the pending
  page and opened once the browser flow finishes. The invitation page in a browser offers the
  app link. The web mirrors the bridge types in `apps/web/src/lib/desktop.ts` because the web
  image is built from `apps/web` alone.
- Switching servers no longer needs the settings file removed; it is a menu item.
