# Cloudflare deployment

The public Cloudflare release hosts `/home/` and `/workspace/` on one origin using Workers Static Assets. It runs the current **demo mode**: local browser projects, calculations, document previews, backup and restore, and downloadable public sample PDFs. Individual is $49; Agency is $99.

Purchases, license activation, additional paid project authorizations, and protected customer PDF exports remain unavailable. The Worker cannot be activated by local storage, a cookie, an import, or client flags. `/api/health` reports website availability; `/api/ready` deliberately returns 503 until commercial services exist.

## Build and publish

Use Node 24 or newer and the pinned project-local Wrangler. Authenticate through `npx wrangler login` or an appropriately scoped deployment token kept out of Git. Cloudflare's official agent skills are installed globally; its MCP connection is configured separately in Codex.

```sh
npm ci
npm run build
npm run cloudflare:check
npm run cloudflare:dev
```

Review local Workers runtime behavior at `http://localhost:8787/home/`, then publish with `npm run cloudflare:deploy`. Publishing includes only release assets from `dist` and the bundled public Worker. The public-file allowlist also rejects private files accidentally copied into that directory.

Wrangler authentication, `.wrangler`, `.dev.vars`, `.env`, local databases, customer backups, test artifacts and `node_modules` are excluded from Git. No persistent licensing data is stored in this Worker. Logs omit request bodies, cookies, authorization headers and customer data; invocation logs are disabled.

## Domain

Deploy to the account's `workers.dev` address first. To attach `scopeledger.site`, the domain must be an active Cloudflare zone in the deployment account. Add a custom domain through Cloudflare or an explicit `routes` entry with `custom_domain: true` after checking existing DNS and services. Do not assume the GitHub repository, domain registrar and Cloudflare account already have a shared integration.

## Commercial launch

The existing Node backend remains in `server/`, with encrypted durable SQLite licensing and a sandboxed Chromium PDF renderer. Workers Static Assets do **not** run that backend. Before accepting money, deploy that service with durable storage and connect it safely, or implement and independently verify a Cloudflare-native persistent licensing and rendering service. Configure the real checkout products, seller policies and production signing/encryption secrets before enabling paid access. Avoid running SQLite licensing on an ephemeral container disk.

## Verification

`tests/cloudflare.test.ts` checks canonical URLs, CSP, safe public files, demo authorization, protected routes, origin rejection, health/readiness and failures. Also run the adapter with `wrangler dev` and repeat HTTP and browser smoke checks against the live URL after publishing. A successful dry run alone does not prove deployment or domain readiness.

`playwright.cloudflare.config.ts` runs the existing site journeys against port 8787. Set `SCOPELEDGER_SITE_URL` to the deployed HTTPS origin to repeat them there. Browser tests create isolated contexts and do not alter the owner's local workspace.
