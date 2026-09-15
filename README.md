# 3X-UI — Cloudflare Native Edition

A production-oriented Cloudflare Workers + D1 + KV panel for VLESS WebSocket and Trojan WebSocket. It deliberately does **not** pretend to provide Xray-core protocols that Workers cannot execute.

## Architecture

- Cloudflare Worker + Hono API
- D1 for durable state, audit history and traffic buckets
- KV for session state and lightweight health/rate-limit state
- Cloudflare `connect()` for outbound TCP relay
- Vue 3 + TypeScript + Pinia + Router + VueUse + Tailwind + ECharts
- PWA shell and four-language localization (English, Persian/RTL, Russian, Chinese)

## First deployment

1. Create the D1 database and the two KV namespaces:

```bash
npx wrangler d1 create 3x-ui-cf-db
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create CACHE
```

2. Paste the three IDs printed above into `wrangler.toml` (repository root, **not** `worker/wrangler.toml`). The `database_name`/`binding` keys are already filled in; only the commented `database_id` / `id` lines need your values.
3. Set `JWT_SECRET` with `wrangler secret put JWT_SECRET` (do not put it in `[vars]`). If you skip this, the Worker generates one on first boot and stores it in D1.
4. No panel-domain variable is required. The Worker derives the active hostname from each request, so generated links follow the deployed `workers.dev` or custom-domain hostname automatically.
5. Apply all migrations (the binding name is `DB`, not the database name):

```bash
npx wrangler d1 migrations apply DB --remote
```

6. Build the UI. `frontend/dist/` is **not** committed (it is in `.gitignore`), so it must be produced before every deploy — `npm run build` at the repository root does the frontend and Worker installs plus the Vite build in one step:

```bash
npm install
npm run build
```

7. Deploy:

```bash
npm run deploy
```

`deploy` builds, deploys, then applies migrations via `postdeploy`. On a fresh database the tables do not exist until that migration step runs, so a deploy that skips it leaves every endpoint returning a 500.

The initial account is `admin` / `admin`. The API marks that account as requiring a password change. Change it immediately after first login.

## Supported proxy protocols

Only:

- VLESS over WebSocket + TLS
- Trojan over WebSocket + TLS
- subscription output for plain URI/base64, Clash Meta, Sing-box, V2RayN and Nekobox-compatible URI lists

UDP, Xray-core, gRPC, Reality, native TCP listeners and other unsupported transports are intentionally not exposed as if they worked.

## Traffic accounting

Traffic is measured at the Worker relay, accumulated in memory per connection and flushed to D1 every 30 seconds and at connection cleanup. Usage limits are enforced against the durable counter. This is the most practical D1-friendly accounting model for a Worker relay; it is not packet-level accounting.

## Security

The application includes PBKDF2 password hashing, signed HS256 JWTs, server-side session records, session revocation, CSRF tokens for mutations, KV login rate limiting, login/security/audit history, RBAC permission checks, secure response headers, destination filtering for private IPv4/local names, subscription token rotation, and forced initial password change.

A deployment should still use a custom domain, HTTPS, a strong JWT secret, Cloudflare WAF/rate controls where available, and a load test appropriate to the account limits before exposing a proxy service to real users.


## Modern 3X-UI parity layer

The Cloudflare edition follows the information-dense command-deck direction of current 3X-UI while keeping the data plane Cloudflare-native. The current upstream 3X-UI stable release is v3.7.0 and its current rolling build is published separately; this project intentionally does not copy Xray-only functionality that cannot run on Workers.

### Automatic hostname

Generated VLESS, Trojan and subscription URLs derive their hostname from the actual incoming Cloudflare request. No manual panel-domain entry is required. This works for `*.workers.dev` and custom domains.

### Social links

The About page and login surface expose the configured Telegram, GitHub and YouTube destinations in a new tab.


## Operational notes

- `POST /api/traffic/reconcile` now requires `traffic.write`. The `operator` role gains it in migration `0005`; `viewer` stays read-only.
- The `superadmin` role cannot be edited, demoted or deleted while it is the last one. This is deliberate — a single bad request used to be enough to lock everyone out permanently.
- D1 does not enforce `ON DELETE CASCADE`. Deleting a user removes its configs, subscriptions, tags, usage rows and live connections explicitly in the same batch; migration `0005` cleans up rows orphaned by earlier deletes.
- Relaying arbitrary TCP traffic through Workers is outside Cloudflare's acceptable-use terms for the Workers platform. Check your account's terms before running this on anything you care about keeping.
