## What

<!-- One paragraph: what changes and why. Link the issue if there is one. -->

## How to verify

<!-- Steps a reviewer can follow. Screenshots for UI changes. -->

## Checks

- [ ] API: `uv run ruff check app tests && uv run ruff format --check app tests && uv run pytest -q`
- [ ] Web: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
- [ ] Desktop: `pnpm test` (if `apps/desktop` or `packages/` changed)
- [ ] Schema change ships with an Alembic revision
- [ ] Payload shapes in `apps/web/src/lib/api/types.ts` still match the API
- [ ] A lasting decision got an ADR in `docs/adr`
