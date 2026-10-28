export const LEARN_TOPICS = {
  colors: `🎨 Status colors

🟢 Healthy: HTTP 200 only. The URL or API returned the expected response.

🔵 Notice: HTTP 100–199 and 201–299. A response was received, but it was not HTTP 200. No alert.

🟡 Warning: HTTP 300–399, HTTP 400–499 except 408 and 429, and HTTP 530. Invalid redirects or more than 3 redirects are also yellow. The response can indicate a redirect, access restriction, missing page or request problem. HTTP 530 means Cloudflare could not resolve the origin hostname. No alert.

🟠 Service disruption: HTTP 408 (request timeout), HTTP 429 (too many requests), and every HTTP 500–599 response except 530. This includes all 520–529 Cloudflare errors. An alert is sent at the first check that detects this color.

🔴 No response: no HTTP response was received because of an 8-second timeout, DNS lookup failure, TLS/certificate failure, or a network/connection error. Payo retries twice, waiting 10 seconds after each failed attempt. A red alert is sent only if all 3 attempts receive no HTTP response.

⚪ Unknown: no recorded check yet.

Each monitoring cycle starts with an HTTP GET from Cloudflare and follows up to 3 redirects. Only the final response determines the color. The same orange or red color does not repeat alerts. A change from orange to red or red to orange sends a new alert. Recovery and other colors do not send alerts.`,
  reports: `📊 Daily reports

🕛 Every day at 12:00 noon, Tehran time.
📅 Period: previous noon → today's noon.
📈 Uptime = HTTP 200 checks ÷ recorded checks.
Example: 143 successful checks out of 144 = 99.31%.

10-minute checks = 144 per full day. Missing checks are excluded; the first report may be partial.

Retries count as one recorded check per cycle.
Current report previews the ongoing period.`,
  alerts: `🔔 Alerts

Checks run every 10 minutes.
🟠 HTTP service errors alert immediately.
🔴 No HTTP response: retry twice with a 10-second wait after each failure. Alert only after all 3 attempts fail.
Same color: no repeated alerts.
Any HTTP response stops the retries; its code determines the color.
Other colors and green recovery: no alerts.

Your daily summary still arrives at 12:00 noon, Tehran time.`,
};

export const LEARN_MENU = {
  text:'📚 Learn about Payo ⚡️\nChoose a topic:',
  reply_markup:{inline_keyboard:[
    [{text:'🎨 Status colors',callback_data:'learn:colors'}],
    [{text:'📊 Daily reports',callback_data:'learn:reports'}],
    [{text:'🔔 When alerts are sent',callback_data:'learn:alerts'}],
  ]},
};
