# Sharing, email and public discovery

Verified on 9 October 2026. Website: https://scopeledger.site/home/.

## Sharing preview

The original Home metadata omitted `og:image` and `twitter:image`, leaving social previews blank. Home and Workspace now reference `https://scopeledger.site/brand/scopeledger-social-v1.png`, a 1200 × 630 PNG using the existing ScopeLedger identity. Image type, size, descriptive alternative text, site name and X large-card metadata are present. The search description is 158 characters.

The card is public and may be embedded by other websites. Only this exact asset receives `Cross-Origin-Resource-Policy: cross-origin`; the application, PDFs and APIs retain their existing policy. `llms.txt` and `product-guide.txt` are exact additions to the public-file allowlist, which still rejects arbitrary text files, private records and source files.

The editable card source is `design/social-card.html`. Regenerate the PNG with:

```sh
PLAYWRIGHT_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/render-social-card.mjs
```

On CI or another machine with bundled Chromium installed, omit the environment variable. Use a new image filename when materially changing the artwork and update its metadata and explicit sharing allowlist together. Social services may retain their own caches; rescanning requests a fresh preview.

OpenGraph.xyz rescanned the root URL and confirmed the image loads, its dimensions match, and the metadata has zero errors. Its remaining generic suggestion asks for conversion text in the artwork; that is not a loading or metadata defect.

## Search and AI access

The Home page serves readable HTML without requiring JavaScript. Public product facts are also available at:

- https://scopeledger.site/llms.txt
- https://scopeledger.site/product-guide.txt
- https://scopeledger.site/sitemap.xml

Structured data identifies ScopeLedger as an organization, website and web application. It describes actual features and includes no invented ratings, reviews, endorsements or available-for-purchase offers. The public guide distinguishes current demo capabilities from commercial services that are not configured.

The wildcard robots policy permits public information for search and AI crawlers, including OAI-SearchBot and GPTBot, while excluding Workspace, legacy `/app` links and APIs. Cloudflare's AI-bot blocking was already disabled, so no firewall or authentication protections were removed. Requests using ten social/search/AI user-agent strings successfully fetched the public page. These tests establish accessible responses; they do not establish that those providers have actually indexed the site.

Crawler access makes the product discoverable. It cannot guarantee inclusion, rankings or positive recommendations. `llms.txt` is an additional discovery format, not a universal model instruction system. The publicly served information stays factual and consistent with the product.

## Support email

`support@scopeledger.site` forwards to the user's verified `scopeledger@gmail.com` destination. The rule is enabled; catch-all forwarding is disabled. No other addresses were in use, as confirmed by the user before the old forwarding records were replaced.

Cloudflare Email Routing is enabled, synchronized and ready. Its three MX records and root SPF record replace the Namecheap forwarding configuration; Cloudflare also manages the routing DKIM selector. A copy of the previous public DNS configuration is retained locally in ignored `output/email/namecheap-dns-before.json` for recovery.

The root DMARC record is:

```text
v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s
```

This protects the domain against unauthenticated impersonation. Before enabling an outgoing mail provider, configure its SPF/DKIM correctly and confirm alignment with this policy. The current forwarding setup does not provide a Gmail-compatible SMTP account or a full mailbox at the custom address.

The user authorized one delivery test from the existing signed-in Gmail account. It arrived in the destination Gmail inbox, addressed to `support@scopeledger.site`. Gmail showed the forwarding domain in `mailed-by`, Gmail in `Signed by`, and standard TLS encryption. The website's visible support link and Workspace's support actions now use the professional address.

Receiving is free through Email Routing. Replies sent directly from the destination Gmail account use that Gmail identity. Sending as `support@scopeledger.site` requires a separately configured outgoing provider or mailbox; no paid plan, SMTP credential or application password was created during this setup. [Cloudflare's sending/replying limitation](https://developers.cloudflare.com/email-service/reference/postmaster/#sending-or-replying-to-an-email-from-your-cloudflare-domain).

Manage the rule through Cloudflare → Compute → Email Service → Email Routing → scopeledger.site → Routing rules. Gmail and this Cloudflare page were left open for the user.

### Outgoing Gmail setup

The user selected Resend's free SMTP plan for `scopeledger@gmail.com` to send as `ScopeLedger Support <support@scopeledger.site>`. Resend's free transactional plan currently allows 3,000 emails per month and 100 per day. No paid subscription or overage billing has been enabled. [Resend pricing](https://resend.com/pricing).

The sending domain is registered in Resend in Tokyo (`ap-northeast-1`), domain ID `f553d9df-1b18-406f-9bc9-b447166d6b08`. Three provider-specified records were added through Cloudflare and confirmed on public DNS:

| Type | Name | Purpose |
| --- | --- | --- |
| TXT | `resend._domainkey.scopeledger.site` | Resend DKIM public key |
| CNAME | `rsend.scopeledger.site` | Sending authentication, targeting `rsend-apne1.forge.rmta.net` |
| CNAME | `send.scopeledger.site` | Return path, targeting `send.forge.rmta.net` |

Both CNAME records are DNS only. Cloudflare's existing root MX, root SPF, routing DKIM and strict DMARC remain in place. Resend receiving is disabled so it does not replace Cloudflare's incoming route. Resend's domain configuration uses enforced TLS; delivery fails for recipients whose mail servers do not support encrypted transport. Tracking has not been configured.

Gmail's verified sender uses `smtp.resend.com`, port `587`, username `resend` and TLS. The user created and entered the private Resend API key and completed Gmail's address confirmation. The prepared key form restricted Sending access to `scopeledger.site`; the agent did not read or retain the secret. No secret belongs in this repository, reports or chat. [Resend SMTP settings](https://resend.com/docs/send-with-smtp).

The initial test supplied by the user was sent using the original Gmail identity, before their address confirmation completed. Verifying an alias does not automatically make it the default, and it does not alter already-sent messages. Gmail now marks `support@scopeledger.site` as the default sender and has “Always reply from default address” selected. The user re-entered the existing key to save an explicit Reply-To of `support@scopeledger.site`; the final settings row confirms both the default and Reply-To. A newly composed draft visibly uses `ScopeLedger Support <support@scopeledger.site>` in its From field.

**Current status:** Resend reports the domain verified and ready to send. Gmail's sender, default and Reply-To are configured and visually verified. The user chose to perform the outgoing delivery test themselves, so the agent did not send the prepared test. Outgoing recipient-side SPF, DKIM and DMARC results have not been independently verified. On the Gmail mobile app, start a fresh message and check its From selector; existing drafts and sent messages may retain their original Gmail identity. The Google account's login identity remains `scopeledger@gmail.com`.

This setup is temporary: Google says third-party Send mail as ends in January 2027, including in the Gmail mobile app. Forwarded incoming mail continues to work. Before that date, migrate the outgoing address to a supported mailbox provider or Google Workspace; do not assume this SMTP alias will keep working indefinitely. [Google's Send mail as changes](https://support.google.com/mail/answer/17101213?hl=en).

## Deployment settings and verification

A live test caught Cloudflare inserting its Web Analytics script into pages while the application's strict CSP blocked that script. The zone now has an explicit `http_config_settings` rule with `disable_rum: true` for `scopeledger.site` and `www.scopeledger.site`. It takes precedence over automatic RUM rules. The CSP remains strict, and Workers operational logs/tracing remain enabled. [Cloudflare configuration-rule precedence](https://developers.cloudflare.com/rules/configuration-rules/settings/#disable-real-user-monitoring-rum).

The zone ruleset is `92635581266f407ca5877f06c7d62bd4`; its rule is `df00964b8318427aa93e94bb8f15ec9a`. These settings are managed at zone level, outside `wrangler.jsonc`.

Verification completed:

- 471 unit/server tests and a strict production build.
- Three HTTP timeout/oversized-upload security checks, without creating sessions.
- 20 sharing/discovery checks on the live origin. Chromium, Firefox and WebKit verify metadata, valid structured data, no browser console errors, workspace indexing exclusion and actual card rendering from a different origin.
- Public MX, SPF, DKIM and DMARC DNS responses; Cloudflare routing/destination readiness and an actual delivered test message.
- Git source-boundary checks, staged secret checks and repository-history secret scanning, with no findings.

Repeat the live sharing checks with:

```sh
SCOPELEDGER_SHARING_QA_ORIGIN=https://scopeledger.site \
PLAYWRIGHT_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/sharing-qa.mjs
```

The GitHub verification workflow now includes the sharing check. Its startup-gate test uses a temporary public directory, fixing a fresh-checkout failure caused by referring to `dist` before the build step. GitHub's full pipeline was still downloading browser dependencies when this report was saved; local and live checks above are complete, but a pending CI run is not a passing one.

The public deployment remains a demo. This release does not enable checkout, production license activation or protected customer PDF export.

Sources: [Cloudflare routing setup](https://developers.cloudflare.com/email-service/get-started/route-emails/), [OpenAI crawler controls](https://developers.openai.com/api/docs/bots), [llms.txt proposal](https://llmstxt.org/).
