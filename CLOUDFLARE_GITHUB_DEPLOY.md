# Cloudflare Dashboard + GitHub deployment

This repository is prepared for Cloudflare Workers Builds.

| Setting | Value |
|---|---|
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy && npm run migrate` |
| Production branch | `main` |

## Why the deploy command is not just `wrangler deploy`

`frontend/dist/` is gitignored, so the build step must produce it — `npm run build`
installs the frontend and Worker dependencies and runs the Vite build.

`wrangler deploy` alone is **not enough**. It publishes the Worker and the static
assets, but it never touches D1. On a fresh database no tables exist, so every
API route returns a 500 and the login page cannot authenticate anyone. The
migration step is what creates the schema and seeds the default `admin` account.
Running it on every deploy is safe: Wrangler tracks which migrations have already
been applied and skips them.

If you run deployments from your own machine instead, `npm run deploy` does all
three steps — build, deploy, then migrate via the `postdeploy` hook.

## Bindings

`wrangler.toml` deliberately leaves `database_id` and the KV `id` values out so
the repository stays account-agnostic and Wrangler's resource provisioning can
create and link them on the first deployment.

If a build fails with an error about a missing `database_id` or KV namespace
`id`, provisioning is not available on your account or Wrangler version. Create
the resources once and paste the printed IDs into `wrangler.toml`:

```bash
npx wrangler d1 create 3x-ui-cf-db
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create CACHE
```

## Secrets

```bash
npx wrangler secret put JWT_SECRET
```

Optional. If you skip it the Worker generates a secret on first boot and stores
it in D1. Setting `JWT_SECRET` *after* people have logged in invalidates their
existing tokens, so set it before the first real use or not at all.

## Cron

`wrangler.toml` registers a daily trigger (`17 3 * * *`) that runs the
housekeeping job: it prunes audit/login/security/traffic history past
`retention_days`, removes leaked `connection_state` rows and expired sessions,
and flips lapsed accounts to `expired`. Nothing in this panel deletes anything
without it.

If cron triggers are unavailable on your plan, a superadmin can call
`POST /api/system/housekeeping` to run the same job on demand.

## After the first deploy

Log in as `admin` / `admin`. The account is flagged `must_change_password`, so
the panel forces a password change before anything else works. Changing it
revokes every session on that account, including the one you are using — you
will be sent back to the login page, which is expected.
