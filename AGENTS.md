# AGENTS.md

Guidance for AI coding agents working in `passport-frontend`. Read this before making changes, and keep it accurate when conventions evolve.

## Project overview

Single-page app for **Passport**, an identity platform: sign-up/sign-in, email verification, password reset, WebAuthn passkeys, Turnstile bot protection, SAML/OIDC federation sign-in, OAuth authorize/consent, a user account center (`/account`), and an admin console (`/admin`). It talks to the Go backend in `../passport-backend` over same-origin APIs using cookie sessions plus CSRF tokens.

## Toolchain

- pnpm (pinned via `packageManager`, enable through corepack) and Node >= 22.12 (`.nvmrc`).
- React 19, TypeScript 6 in strict mode (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 8. Path alias `@/` maps to `src/`.
- UI: Mantine 9 (`core`, `form`, `hooks`, `modals`, `notifications`) with the theme in `src/app/theme.ts`, plus Tabler icons. Use Mantine defaults and the existing palette; do not introduce other UI or styling libraries.
- Server state via TanStack Query 5 (defaults in `src/app/queryClient.ts`). Forms via `@mantine/form` with `mantine-form-zod-resolver`; validation schemas in zod.
- Routing: react-router 8 data router. The route table lives in `src/app/router.tsx`, guarded by `GuestOnly`/`RequireAuth` and `AdminGuestOnly`/`RequireAdmin`.

## Commands

| Command                             | What it does                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Dev server at http://localhost:5173 (strict port). Proxies `/v1`, `/admin/v1`, `/oauth2`, `/saml`, `/federation` (except `/federation/complete`), `/.well-known`, `/jwks.json`, `/livez`, `/readyz` to `PASSPORT_API_TARGET` (default `http://localhost:8080`), so the backend must be running. |
| `pnpm lint`                         | ESLint (flat config).                                                                                                                                                                                                                                                                           |
| `pnpm format` / `pnpm format:check` | Prettier (single quotes, print width 100, LF). CI enforces `format:check`.                                                                                                                                                                                                                      |
| `pnpm typecheck`                    | `tsc -b`.                                                                                                                                                                                                                                                                                       |
| `pnpm test`                         | Vitest (jsdom), single run. `pnpm test:watch` for watch mode.                                                                                                                                                                                                                                   |
| `pnpm build`                        | Type-checks, then bundles to `dist/`.                                                                                                                                                                                                                                                           |
| `pnpm e2e`                          | Playwright on chromium with `zh-CN` locale. Builds and serves on :4173; requires the backend (:8080) and Mailpit (:8025) from `../passport-backend`. Not part of the pre-commit gate; run it when touching auth, mail, or federation flows.                                                     |

## Mandatory pre-commit gate

Before **every** commit, run all four checks in this directory and fix every failure:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Never commit with failing, skipped, or not-yet-run checks. Formatting must be clean too (`pnpm format:check`, or run `pnpm format`). If the user edited files while you were working, re-run the whole gate immediately before committing.

## Code style

- **No comments unless strictly necessary.** No narration of what code does, no TODOs, no JSDoc that restates types. Explain only hidden constraints or non-obvious workarounds — and prefer renaming or restructuring so the comment becomes unnecessary. This applies to every file type.
- Follow the existing code: function components and hooks, inline type imports (`@typescript-eslint/consistent-type-imports`), `_` prefix for intentionally unused variables.
- Let Prettier own formatting; do not hand-align or hand-wrap code.
- Reuse existing page patterns, container gutters, and Mantine components instead of inventing one-offs; fix layout regressions you notice rather than only reporting them.
- Scope responsive fixes to the viewport that reported the problem; do not reshape other breakpoints without being asked.
- On submit paths, wait for third-party integrations (Turnstile widget, WebAuthn) to actually be ready instead of failing fast.

## Architecture

| Directory                | Contents                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/`               | Fetch wrapper `http.ts`: `credentials: 'include'`, CSRF token on writes (resets and retries once on 403), typed `ApiError` carrying `code`/`requestId`, ETag access via `apiGetWithMeta`. 401 responses emit an unauthorized event unless suppressed. Sessions are scoped (`account` vs `admin`). Typed endpoint modules in `src/api/endpoints/`, admin ones under `endpoints/admin/`. |
| `src/app/`               | App shell: providers, router, theme, query client.                                                                                                                                                                                                                                                                                                                                     |
| `src/components/`        | Shared layout and cross-feature UI.                                                                                                                                                                                                                                                                                                                                                    |
| `src/features/<domain>/` | Pages and domain logic with colocated tests. Domains: `account`, `admin`, `auth`, `oauth`, `session`, `step-up`.                                                                                                                                                                                                                                                                       |
| `src/hooks/`, `src/lib/` | Reusable hooks and pure helpers; most `src/lib` modules have colocated unit tests.                                                                                                                                                                                                                                                                                                     |
| `src/i18n/`              | i18next setup and locale JSON files.                                                                                                                                                                                                                                                                                                                                                   |
| `src/test/`              | Vitest setup, MSW mock server with an in-memory db, locale pinning, `renderWithProviders`/`renderRoute` helpers.                                                                                                                                                                                                                                                                       |

Put new server interactions in typed endpoint modules, not ad-hoc `fetch` calls inside components. New tests sit next to the code under test.

## Testing

- Unit/integration: Vitest + Testing Library + MSW, colocated as `*.test.ts(x)`. Global setup (`src/test/setup.ts`) resets the mock database, CSRF token, sessionStorage, and Mantine notifications between tests — rely on it instead of writing your own resets. Render through `src/test/render.tsx`.
- E2E: Playwright specs in `e2e/`. Helpers wait for backend readiness and read one-time email tokens from Mailpit.

## i18n

- Every user-facing string is an i18next key. Update **both** `src/i18n/locales/en.json` and `zh-CN.json`; tests enforce key parity across locales and that every literal `t()` key exists in both files. Default language is `zh-CN`. Never hardcode copy in components.
- User-facing and legal copy uses plain language — no technical jargon (no algorithm, header, or crypto names); keep statutory legal terms as-is.

## Environment and runtime config

- `.env` based on `.env.example`: `VITE_API_BASE` (empty in dev for same-origin proxying), `VITE_TURNSTILE_SITE_KEY`, `VITE_FEDERATION_PROVIDERS`, and `PASSPORT_API_TARGET` (dev proxy target only, not a runtime variable).
- Development and non-container builds read `VITE_API_BASE` / `VITE_TURNSTILE_SITE_KEY` from `.env` at build time.
- The production image reads both values at container start: `docker-entrypoint.d/40-runtime-config.sh` writes `/config.js` from the container environment, and `index.html` loads it before the app bundle. Runtime values override build-time values; changing them requires restarting the container, not rebuilding the image.

## Deployment

- Multi-stage `Dockerfile`: pnpm build stage, then `nginxinc/nginx-unprivileged:alpine` serving `dist/` on port 8080 with `nginx.prod.conf` (immutable `/assets/` caching, no-cache `index.html` and `/config.js`, SPA fallback).
- The image ships `docker-entrypoint.d/40-runtime-config.sh`, which renders `/config.js` from `VITE_API_BASE` and `VITE_TURNSTILE_SITE_KEY` at container start; these are runtime environment variables, not Docker build args.
- CI (`.github/workflows/ci.yml`) runs independent lowercase jobs: `lint`, `format`, `typecheck`, `test`, `build` (uploads `dist`), and `image` (builds and pushes a multi-arch `linux/amd64` + `linux/arm64` image to ghcr on push to main). Keep jobs small and separate; do not merge them into combined jobs.

## Commits

- Conventional Commits with a scope, matching the history: `feat(account): …`, `fix(router): …`, `test(e2e): …`, `docs: …`.
- Stage only the files that belong to your change; never commit the user's unrelated work-in-progress.
