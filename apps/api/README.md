# Beancount Studio — API

FastAPI service that stores each ledger as a git repository and serves reports through Fava's
core (`fava.core`) and Beancount. See the repository README for configuration and deployment.

```bash
uv sync --all-groups
uv run uvicorn app.main:app --reload      # http://localhost:8000, OpenAPI docs at /api/docs
uv run ruff check app tests && uv run pytest -q
```

Settings are `BS_*` environment variables (see `.env.example`). Data lives under `BS_DATA_DIR`:
`ledgers/<id>/repo` (git working trees), `uploads/`, and `studio.db` (SQLite) unless
`BS_DATABASE_URL` points at PostgreSQL.
