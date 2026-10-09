# Beancount Studio — web

Next.js 16 App Router client for the Beancount Studio API. See the repository README for the
overall picture and `docs/frontend-conventions.md` for UI patterns.

```bash
pnpm install
pnpm dev            # http://localhost:3000; /api/* is proxied to API_URL (default http://localhost:8000)
pnpm exec tsc --noEmit && pnpm lint && pnpm build
```

Environment: `API_URL` — server-side address of the API used by the `/api` rewrite.
