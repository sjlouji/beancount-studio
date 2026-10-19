# Security policy

## Supported versions

Beancount Studio is pre-1.0. Fixes land on `main`; run the latest commit or the latest tagged
release.

## Reporting a vulnerability

Do not open a public issue for a security problem. Use GitHub's private vulnerability
reporting: <https://github.com/sjlouji/beancount-studio/security/advisories/new>.

Include what you found, how to reproduce it, and which part is affected (API, web client,
desktop shell, deploy stack). You will get an acknowledgement within seven days and a fix or a
plan within thirty.

## Scope notes

- The API trusts the session cookie or a `bsk_` personal access token; anything reachable
  without either is in scope.
- The desktop shell loads a remote server in Electron. Context isolation, the sandbox,
  navigation allowlisting and the permission handler in `apps/desktop/src/main.ts` are
  security boundaries; bypasses are in scope.
- Secrets belong in gitignored `.env` files. A committed secret is a bug; report it.
