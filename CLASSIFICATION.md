# HTTP and transport classification

Priority is a Payo ⚡️ operational policy; it is not an HTTP standard. A response is considered fully successful only when the final code is exactly 200. Redirects are followed up to three times before the final response is classified.

| Level | Codes / conditions | Interpretation |
| --- | --- | --- |
| 🟢 Normal | 200 | Expected response |
| 🔵 Low | 100–199; 201–299 | Informational / alternative successful response; HTTP 200 criterion unmet |
| 🟡 Medium | 300–399 after redirect handling | Final result not reached, unsupported redirect or excessive redirects |
| 🟡 Medium | 400–499 except 408 and 429 | Request, access, authentication, resource or policy problem |
| 🟡 Medium | 530 | HTTP received from Cloudflare; origin DNS/connection health needs investigation |
| 🟠 High | 408 | Server reported a request timeout; distinct from no HTTP response |
| 🟠 High | 429 | Rate limiting; monitoring may be blocked |
| 🟠 High | 500–599 except 530 | Server, proxy or Cloudflare-origin error |
| 🔴 Critical | Request timeout before receiving HTTP | No HTTP response within 8 seconds |
| 🔴 Critical | DNS, TLS or network/connect failure | No HTTP response; label depends on observable runtime error |
| ⚪ Unknown | No observation | Target not checked yet |

## Important named responses

401: authentication required. 403: forbidden, possibly access rules or bot protection. 404: target path not found. 405: GET unsupported. 410: resource gone. 451: legal access restriction. 502: bad gateway. 503: service unavailable. 504: upstream timeout. 520: unknown/invalid origin response. 521: Cloudflare cannot connect to origin. 522: Cloudflare-origin connection timeout. 523: unreachable origin. 524: origin response timeout. 525: origin TLS handshake failure. 526: invalid origin certificate. 530: origin hostname resolution issue.

A yellow or orange response does not prove that the website is usable by customers. A red result means this monitor did not receive HTTP; it is not proof of a worldwide outage. Sampling is from Cloudflare, not an independent network inside Iran.

## Alert behavior

No HTTP response (network, DNS, TLS or 8-second timeout): use up to 3 attempts, waiting 10 seconds after each failed attempt before the next. A red observation/alert is finalized only after 3 consecutive no-response attempts. Any HTTP response ends retries, including HTTP 403, 408, 429, 503 and 530; classify it normally. Orange HTTP errors still alert immediately. Persist pending attempts via Durable Object alarms and cancel them on monitor removal. Each cycle records only its final observation, so retry attempts do not inflate uptime counters. Unchanged orange/red remains silent; switching between orange/red alerts; other colors/recovery stay silent.
