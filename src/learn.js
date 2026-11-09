export const LEARN_TOPICS = {
  colors: `🎨 Status colors

🟢 Healthy: the configured status and optional response-content condition passed. Default: HTTP 200.

🔵 Notice: non-selected HTTP 100–199 and 201–299 responses. A response was received, but it was not HTTP 200. No alert.

🟡 Warning: HTTP 300–399, HTTP 400–499 except 408 and 429, and HTTP 530. Invalid redirects or more than 3 redirects are also yellow. The response can indicate a redirect, access restriction, missing page or request problem. HTTP 530 means Cloudflare could not resolve the origin hostname. No alert.

🟠 Service disruption: HTTP 408 (request timeout), HTTP 429 (too many requests), and every HTTP 500–599 response except 530. This includes all 520–529 Cloudflare errors. A failed response-content condition is also orange. An alert is sent at the first check that detects this color.

🔴 No response: no HTTP response was received because of an 8-second timeout, DNS lookup failure, TLS/certificate failure, or a network/connection error. Payo retries twice, waiting 10 seconds after each failed attempt. A red alert is sent only if all 3 attempts receive no HTTP response.

⚪ Unknown: no recorded check yet.

Each monitoring cycle starts with an HTTP GET from Cloudflare and follows up to 3 redirects. Only the final response determines the color. The same orange or red color does not repeat alerts. A change from orange to red or red to orange sends a new alert. Recovery is off by default; enable it per monitor in Settings. Other colors do not send alerts.`,
  reports: `📊 Daily & weekly reports

🕕 Every day at 18:00, Tehran time.
📅 Period: previous 18:00 → today's 18:00.
📈 Uptime = successful configured checks ÷ recorded checks.
Example: 143 successful checks out of 144 = 99.31%.

10-minute checks = 144 per full day. Missing checks are excluded; the first report may be partial.

Retries count as one recorded check per cycle.
Weekly: Friday 00:00 Tehran, covering Friday 00:00 to the following Friday 00:00. Full week: 1,008 checks per address. The first week may be partial; missing checks are excluded.
Pause and Maintenance stop checks without counting those periods as successful. Settings changes apply to future checks; historical results retain their original rules. Current report previews the ongoing daily period.`,
  alerts: `🔔 Alerts

Checks run every 10 minutes.
🟠 HTTP service errors alert immediately.
🔴 No HTTP response: retry twice with a 10-second wait after each failure. Alert only after all 3 attempts fail.
Same color: no repeated alerts.
Any HTTP response stops the retries; its code determines the color.
Other colors: no alerts. Green recovery alerts are optional and off by default.

Your daily summary still arrives at 18:00, Tehran time.`,
};

export const LEARN_MENU = {
  text:'📚 Learn about Payo ⚡️\nChoose a topic:',
  reply_markup:{inline_keyboard:[
    [{text:'🎨 Status colors',callback_data:'learn:colors'}],
    [{text:'📊 Daily & weekly reports',callback_data:'learn:reports'}],
    [{text:'🔔 When alerts are sent',callback_data:'learn:alerts'}],
  ]},
};
