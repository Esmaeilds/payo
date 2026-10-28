# Build Your Own Payo ⚡️

A practical guide to Telegram alerts for public websites and API endpoints

By Sam Jafari · Updated 28 October 2026

## What you are building

A Telegram bot that checks a personal list of website URLs and public API endpoints every 10 minutes. It sends private alerts for service errors or repeated failures to receive a response, plus a daily uptime report. An optional Telegram Mini App makes the list and reports easier to manage.

Want to try the existing bot first? Open https://t.me/PayoWatchBot, press Start, then use App. To build your own independent version, follow the steps below using your own accounts.

## Why check from outside the server?

If the server running your website goes offline, a monitoring process hosted only on that same server may be unable to alert you. Run the checks on separate infrastructure. In this setup, Cloudflare sends the checks and Telegram delivers the alerts. This checks availability from Cloudflare's network; it does not prove that the site is reachable from every country, ISP or device.

## 1. Prepare your accounts

You need a Telegram account, a Cloudflare account on Workers Free, and a coding assistant with file, testing and deployment tools. If your chat environment cannot run or deploy code, ask it for the project files and manual setup instructions instead. Generating code is not the same as deploying a working service.

Use the free workers.dev address; you do not need to buy a domain. Keep Cloudflare on Free and do not enable paid services. Access to your AI assistant has its own account limits and is separate from hosting costs.

## 2. Create a Telegram bot

Open the official BotFather: https://t.me/BotFather. Send /newbot, choose a display name, then choose an available username ending in bot. The existing @PayoWatchBot username cannot be reused for your new bot.

BotFather gives you a bot token. Treat it as a password: do not paste it into an AI chat, this document, screenshots or a public repository. Store it directly as a Cloudflare Secret when the Worker is ready. Open your new bot and press Start.

## 3. Give your coding assistant the brief

Copy the build prompt near the end of this guide into a fresh conversation. Ask the assistant to verify current platform limits, explain the account steps, then build, test and deploy the service. If you already have the project source, attach it and ask the assistant to adapt it to your accounts.

Keep the first version small: public GET endpoints, a private list per Telegram user, scheduled checks, useful alerts and a daily report. API authentication, custom headers, POST requests and JSON assertions are outside this version.

## 4. Build the Worker and persistent storage

Create a Cloudflare Worker and deploy it to a workers.dev address. The same Worker can receive Telegram messages, serve the Mini App and handle the scheduled monitoring job.

Use SQLite-backed Durable Objects for persistence: a Directory for registered users, a separate Registry for each user's list, and a Target for each monitored entry's state, retry sequence and daily aggregates. Data must survive restarts and redeployments.

Let anyone start the bot. Each user gets a separate list based on their verified Telegram identity. Require only a domain or URL. Start new accounts with an empty list; do not copy another user's URLs or owner ID. Reject private-network addresses, embedded login credentials and unsupported custom ports, including after redirects.

## 5. Add secrets and connect Telegram

In the Worker's Variables and Secrets settings, add TELEGRAM_BOT_TOKEN as a Secret. Ask the assistant to generate WEBHOOK_SECRET and ADMIN_SECRET securely and store them as Secrets too. OWNER_ID should be your own numeric Telegram user ID, used to restrict administrative statistics, not to block ordinary users.

Configure Telegram's webhook to the Worker's /telegram route. Set its secret_token to match WEBHOOK_SECRET and verify incoming webhook requests. Check getWebhookInfo for delivery errors. Send /start and confirm that the bot responds before continuing.

## 6. Schedule checks and persistent retries

Set a monitoring Cron Trigger to */10 * * * *. Cron expressions run in UTC. Send an HTTP GET for each endpoint, with an 8-second timeout per attempt and no more than three redirects.

If no HTTP response arrives, wait 10 seconds after the failed attempt, then try again. Repeat once more if needed: three attempts in total. Persist retries using Durable Object alarms so a restart does not lose them. An HTTP response ends the no-response retry sequence and is classified normally.

Count the whole attempt sequence as one final uptime observation. Manual Check now must respect the same 10-minute interval so it does not create duplicate samples. Removing an endpoint must cancel its pending retries.

## 7. Define statuses and alert rules

Green — Healthy: HTTP 200.

Blue — Notice: HTTP 100–199 or 201–299. A response was received, but it did not meet the strict HTTP 200 condition.

Yellow — Warning: HTTP 300–399; HTTP 400–499 except 408 and 429; HTTP 530; or invalid/excessive redirects.

Orange — Service disruption: HTTP 408, HTTP 429, or HTTP 500–599 except 530. Send an alert immediately when observed.

Red — No response: all three attempts failed to receive an HTTP response. Report a timeout, DNS or TLS cause only when the error supports it; otherwise use a general connection-failure description.

Gray — Unknown: no observation is available yet.

Alert only when entering orange or red, including switching between those two categories. Do not repeat the same category's alert. Blue, yellow, gray and green recovery do not send separate alerts in this version.

Keep alert messages short: Payo, status, URL, response or last error, and detection time in Tehran. Detection time is not the exact time an outage began.

## 8. Add the daily uptime report

Send each user's report at 12:00 noon in Asia/Tehran, covering the previous noon through the current noon. For the current Tehran offset, the UTC cron is 30 8 * * *; verify the conversion if timezone rules change.

Uptime = HTTP 200 observations ÷ total recorded observations × 100. A full day contains 144 scheduled observations per endpoint at 10-minute intervals. For example, 143 successful observations out of 144 equals 99.31%.

Identify partial coverage. Do not count missed checks or time before an endpoint was added as successful. This is sample-based availability, not a continuous measurement of outage duration. Persist report delivery state to avoid duplicate reports.

## 9. Add the Telegram Mini App

Serve the app at /app with Home, Reports and Learn. Home manages URLs and shows their latest status. Reports shows per-endpoint uptime. Learn briefly explains status colors, daily reports and alerts.

Validate Telegram initData on the server using the bot's token. Do not trust a browser-supplied user ID or initDataUnsafe alone. Requests without valid Telegram identity must not reveal private lists.

Use setChatMenuButton to configure the native Telegram menu button with the label App and the HTTPS app URL. Provide an inline web_app button in /start and /app as a fallback. Test both Telegram Web and the installed app.

Follow Telegram themeParams and themeChanged for colors and light/dark appearance. For a Payo-like style, use Roboto, rounded cards and a floating glass navigation bar. If using Telegram Web K icons, retain their source and GPL-3.0 license, and review the licensing obligations before distributing your implementation. Version icon URLs when their content changes to avoid stale cached graphics.

## 10. Add owner-only statistics

Restrict /stats to OWNER_ID. Show total registered users, users with at least one monitor, and Total URLs & APIs — all users. The final number sums every user's list. The same URL in two users' lists counts twice in this architecture.

## 11. Test before sharing

Use two Telegram accounts. Confirm both can start the bot, lists are isolated, one user cannot remove another user's entries, and only the owner can access global statistics.

In a controlled test environment, test HTTP 200, 204, 403, 408, 429, 503 and 530, plus timeouts and connection failures. Verify immediate orange alerts, three attempts before red, no repeated alerts for an unchanged category, and no green recovery message. Do not take down a real site for testing.

Also test report calculations, partial coverage, retry cancellation after deletion, persistent data after redeployment, Mini App authentication, native App launch and caching on installed Telegram clients. Confirm the active deployment and Cron Triggers, not just a successful local build.

## 12. Keep hosting within the free allowance

Free hosting is not unlimited capacity. Cloudflare meters Worker requests, Durable Object requests and execution duration, database reads/writes and stored data separately. All users share the account's allowances, and retries or slow endpoints can increase consumption.

Measure real daily usage before promising a supported number of URLs. Do not treat a planning estimate as a verified capacity limit. Ask the assistant for the final bot URL, Mini App URL, project source without secrets, deployment instructions and test results.

## Copy-and-paste build prompt

Help me build my own public Telegram monitoring bot and Mini App using my own accounts. Use Cloudflare Workers Free, SQLite-backed Durable Objects and a free workers.dev URL. Do not buy a domain or enable paid services. If your environment cannot build or deploy, say so and provide the source and manual instructions.

Anyone may start the bot. Each verified Telegram user gets a private dynamic list of public URLs/API endpoints; a URL or domain is the only required input. Reject internal/private addresses and credential-bearing URLs. Use public HTTP(S) GET only; authenticated APIs, POST and JSON assertions are out of scope.

Check each endpoint every 10 minutes. Use an 8-second timeout and at most three redirects. Only when no HTTP response arrives, retry twice with a 10-second wait after each failed attempt. Persist retries with Durable Object alarms. Record one final observation per sequence and prevent duplicate checks within an interval.

Statuses: green for HTTP 200; blue for 100–199 and 201–299; yellow for 300–399, 400–499 except 408/429, HTTP 530 and invalid/excessive redirects; orange for 408/429 and 500–599 except 530; red only after three no-response attempts; gray before observations. Send private alerts only on entering orange or red or switching between them. Do not repeat unchanged categories or send green recovery alerts. Include the URL, cause and Tehran detection time.

Send each user's daily uptime report at noon Asia/Tehran for the noon-to-noon window. Calculate successful HTTP 200 observations divided by recorded observations; 144 scheduled observations per full day. Identify partial coverage and deduplicate report delivery.

Add an English Mini App at /app with Home, Reports and Learn; a native Telegram App menu button; server-side initData validation; Telegram theme support; and a short onboarding flow. Add /stats for my OWNER_ID only, showing registered users, users with monitors and the sum of every user's URL/API entries. Do not hardcode anyone else's identifiers or URLs.

Never ask me to paste tokens into the conversation. Explain secure direct entry of TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET and ADMIN_SECRET. Verify webhook delivery, cross-user isolation, retries, alert deduplication, report accuracy, Mini App login and data persistence. Check current free-tier limits and actual consumption; do not promise unlimited capacity. Deliver the tested source and working links.

## Official references

Telegram bot tutorial: https://core.telegram.org/bots/tutorial

Telegram Mini Apps: https://core.telegram.org/bots/webapps

Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/

Durable Objects pricing and allowances: https://developers.cloudflare.com/durable-objects/platform/pricing/

Telegram Web K icons: https://github.com/morethanwords/tweb/tree/master/assets/icons

