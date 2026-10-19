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
