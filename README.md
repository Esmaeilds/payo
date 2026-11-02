# Payo ⚡️

A Telegram bot and Mini App for monitoring website URLs and public HTTP GET API endpoints.

**[Read the step-by-step build guide](docs/build-your-own.md)** · **[Try Payo](https://t.me/PayoWatchBot)**

## What it does

- Each Telegram user gets a private monitoring list.
- Checks run every 10 minutes from Cloudflare, outside the monitored server.
- No-response failures get two additional attempts, 10 seconds after each failure.
- Orange service errors and confirmed red no-response results trigger private Telegram alerts on category changes. Unchanged incidents do not repeat; recovery notifications are disabled.
- Daily reports arrive at 18:00 Tehran time, with per-address sampled uptime and coverage.
- The Mini App includes Home, Reports and Learn, and follows Telegram theme settings.
- Owner-only `/stats` shows registered users, active users and the total number of URLs & APIs across all lists.

Public APIs here means HTTP GET endpoints. Authenticated APIs, custom headers, request bodies and content assertions are not implemented.

## Build your own

Start with **[the guide](docs/build-your-own.md)**. It includes a prompt you can give your coding assistant, architecture, alert rules, testing and free-tier considerations.

This repository is a sanitized snapshot of the working project. It contains no production credentials, user lists, deployment records or account identifiers. New deployments start with empty lists.

### Local setup

Use Node.js 24.22 or newer, then:

```sh
npm ci
npm test
npm run build
```

Before deployment, replace the three placeholders in `cloudflare.config.ts`: your Cloudflare account ID, your Telegram numeric user ID and the Mini App URL for your own Worker. Worker bindings must use the same Worker name.

Create your own bot with BotFather. Configure `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET` and `ADMIN_SECRET` as Cloudflare secrets, never as source code. `WATCHDOG_PING_URL` is optional and may be left unset; it is not needed for ordinary monitoring. See your installed `cf deploy --help` for secret-file deployment options; temporary secret files must remain outside Git.

Sign in with Cloudflare's `cf` CLI and deploy using `npm run deploy`. This project uses `cloudflare.config.ts`, not a Wrangler configuration. The CLI is beta and pinned in the lockfile.

Register Telegram's webhook at `https://YOUR_WORKER.workers.dev/telegram` using Bot API `setWebhook`, setting `secret_token` to the same value as `WEBHOOK_SECRET`. Configure the native Web App menu to point to your own `/app`. Ask your assistant to perform these steps without printing credentials. Send `/start` to your new bot and test with two separate Telegram accounts.

### Commands

`/start`, `/help`, `/learn`, `/add URL`, `/list`, `/status`, `/check`, `/report`, `/cancel`. Owner only: `/stats`.

### Architecture and accuracy

One Worker handles Telegram webhooks, the Mini App and scheduled events. SQLite Durable Objects store the directory, per-user registries and individual targets. Retry state and report outboxes persist across restarts. Telegram initData is validated on the server before selecting a user's private list.

HTTP 200 counts as healthy. Uptime is successful recorded samples divided by all recorded samples; missing checks are excluded, and incomplete coverage is shown. It is not a continuous measurement or a multi-region SLA. See [status classification](CLASSIFICATION.md).

Cloudflare Free has shared resource limits. This repository does not promise unlimited users, a fixed URL capacity or perpetual zero cost. Check current quotas and usage before scaling; no paid plan is required by the intended architecture.

## License and attribution

This distribution is licensed under **GPL-3.0**, with the full license in [LICENSE](LICENSE). Telegram Web K SVG icons retain their upstream GPL-3.0 license and attribution in [vendor/telegram-web-k](vendor/telegram-web-k/NOTICE.md). Roboto is included under the [SIL Open Font License](licenses/Roboto-OFL.txt). Keep those notices when redistributing.

Payo was built as an experiment in turning a real monitoring problem into a usable product with AI.

## Report schedule transition

Daily reports run at 18:00 Asia/Tehran (14:30 UTC), covering the previous 18:00 through the current 18:00. Existing noon-window counters are preserved in the legacy table, while new observations use a separate `daily_1800` table and report-delivery namespace. This prevents mixing the two window definitions or suppressing the first evening report because a noon report was already queued. The first evening window after upgrading has partial coverage; monitor lists and pending alert retries are retained.

## Automatic deployment

GitHub Actions runs tests and a dry-run build for pull requests and changes to `main`. Only a successful `main` run (or manual run on `main`) can deploy. The production job builds with private settings and publishes the same validated build. Deployment jobs do not overlap. A post-deploy liveness check confirms the Worker advertises the 18:00 Tehran report schedule; this does not prove Telegram delivery or scheduled-job success.

Add these encrypted **repository Actions secrets** before enabling production:

- `CLOUDFLARE_API_TOKEN`: a dedicated Cloudflare deployment token restricted to the intended account and required Worker deployment permissions. Do not use a Global API Key.
- `CLOUDFLARE_ACCOUNT_ID`: the production account ID.
- `PAYO_WORKER_NAME`: the exact existing Worker name. Reuse it to retain the production Durable Object namespaces.
- `PAYO_OWNER_ID`: the owner's numeric Telegram user ID.
- `PAYO_APP_URL`: the existing Worker's HTTPS `/app` URL.

Keep `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `ADMIN_SECRET` and the optional watchdog credential in the existing Cloudflare Worker Secrets. Do not place them in the workflow, repository, deployment artifacts or logs. The repository contains example fallbacks only. CI refuses to deploy if any required private setting is missing.

Use Node.js 24.22.1, `npm ci`, `npm test`, and the pinned `cf` version. To retry a deployment after adding secrets, open Actions → Test and deploy Payo → Run workflow on `main`.
