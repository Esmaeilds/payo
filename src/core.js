export const INITIAL_URLS = [];
export const INTERVAL = 600_000;
export const MAX_TARGETS = Infinity;
export const DAY = 86_400_000;
// Report windows run noon-to-noon in Tehran (UTC+03:30).
export function periodKey(ms) { return new Date(ms + 3.5*3600000 - 12*3600000).toISOString().slice(0,10); }
export function periodBounds(key) {
  const start=Date.parse(`${key}T12:00:00+03:30`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(start)) throw new Error('Invalid report period');
  return {start,end:start+DAY};
}
export function uptime(up,total) {return total ? `${(100*up/total).toFixed(2)}%` : 'No data';}
export function reportText(key,rows) {
  const {start,end}=periodBounds(key);
  const label=ms=>new Date(ms).toLocaleString('en-GB',{timeZone:'Asia/Tehran'});
  const total=rows.reduce((n,r)=>n+r.total,0),up=rows.reduce((n,r)=>n+r.up,0);
  return `📊 Payo ⚡️ daily summary\nWebsite URLs & API endpoints\n${label(start)} to ${label(end)} (Tehran)\n\nObserved uptime: ${uptime(up,total)}\n`+
    rows.map(r=>`\n${r.url}\nUptime: ${uptime(r.up,r.total)} | Successful: ${r.up}/${r.total}\nNew incidents: ${r.outages} | Coverage: ${r.total}/144 checks\n🟢 ${r.up} | 🔵 ${r.notice||0} | 🟡 ${r.warning||0} | 🟠 ${r.error||0} | 🔴 ${r.unreachable||0} | ⚪ ${Math.max(0,r.total-r.up-(r.notice||0)-(r.warning||0)-(r.error||0)-(r.unreachable||0))}`).join('\n')+
    '\n\n🟢 HTTP 200 · 🔵 Informational · 🟡 Warning · 🟠 Service error · 🔴 No HTTP response · ⚪ Older unclassified checks\nUptime = HTTP 200 checks / all recorded checks. Missing checks are excluded, never assumed successful. Fewer than 144 checks means incomplete daily coverage. This is sampled availability from Cloudflare, not continuous uptime measurement.';
}
export function normalizeUrl(input) {
  const text = input.trim();
  const u = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.includes('.')) throw new Error('Send a valid HTTP or HTTPS URL without a username, password or custom port.');
  const host = u.hostname.toLowerCase();
  if (/^(localhost|.*\.local|.*\.internal)$/.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) throw new Error('Only public domain names are supported.');
  u.hash = '';
  if (u.href.length > 512) throw new Error('The URL is too long (maximum 512 characters).');
  return u.href;
}
const HTTP_LABELS = {
  200:'OK',201:'Created',202:'Accepted; processing may be incomplete',204:'No Content',206:'Partial Content',
  300:'Multiple Choices',301:'Moved Permanently',302:'Found',303:'See Other',304:'Not Modified',307:'Temporary Redirect',308:'Permanent Redirect',
  400:'Bad Request',401:'Authentication required',402:'Payment Required',403:'Forbidden; access restrictions or bot protection may apply',404:'Not Found',405:'GET is not allowed',406:'Not Acceptable',407:'Proxy Authentication Required',408:'The server reported a request timeout',409:'Conflict',410:'Gone',411:'Length Required',412:'Precondition Failed',413:'Content Too Large',414:'URI Too Long',415:'Unsupported Media Type',416:'Range Not Satisfiable',417:'Expectation Failed',421:'Misdirected Request',422:'Unprocessable Content',423:'Locked',424:'Failed Dependency',425:'Too Early',426:'Upgrade Required',428:'Precondition Required',429:'Too Many Requests; rate limited',431:'Request Header Fields Too Large',451:'Unavailable For Legal Reasons',
  500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout',505:'HTTP Version Not Supported',506:'Variant Also Negotiates',507:'Insufficient Storage',508:'Loop Detected',510:'Not Extended',511:'Network Authentication Required',
  520:'Cloudflare received an unknown or invalid origin response',521:'Cloudflare could not connect to the origin',522:'Cloudflare connection to the origin timed out',523:'Origin is unreachable from Cloudflare',524:'Origin response timed out',525:'TLS handshake failed between Cloudflare and the origin',526:'Invalid origin certificate',527:'Cloudflare upstream connection error',530:'Cloudflare cannot resolve the origin hostname; origin health is not confirmed',
};
const LEVELS = {
  healthy:{icon:'🟢',severity:'Normal',rank:0},
  notice:{icon:'🔵',severity:'Low / informational',rank:1},
  warning:{icon:'🟡',severity:'Medium / investigate',rank:2},
  error:{icon:'🟠',severity:'High / service disruption',rank:3},
  unreachable:{icon:'🔴',severity:'Critical / no HTTP response',rank:4},
  unknown:{icon:'⚪',severity:'Not checked yet',rank:-1},
};
export function classify(httpStatus, reason='network') {
  if(httpStatus) {
    const category=httpStatus===200?'healthy':httpStatus<300?'notice':httpStatus===530?'warning':httpStatus>=500||[408,429].includes(httpStatus)?'error':'warning';
    const label=HTTP_LABELS[httpStatus] || (httpStatus<200?'Informational response without a final result':httpStatus<300?'Successful HTTP response, but expected HTTP 200':httpStatus<400?'Redirect without a final HTTP 200 response':httpStatus<500?'Request error or access restriction':'Server error');
    return {category,...LEVELS[category],httpStatus,receivedHTTP:true,label,detail:`HTTP ${httpStatus} — ${label}`,ok:httpStatus===200};
  }
  if(reason==='redirect')return {category:'warning',...LEVELS.warning,receivedHTTP:true,reason:'redirect',label:'Invalid or excessive redirects',detail:'Invalid or excessive redirects',ok:false};
  const label=reason==='timeout'?'Response timed out':reason==='dns'?'DNS resolution failed':reason==='tls'?'TLS connection failed':'No HTTP response; connection or network error';
  return {category:'unreachable',...LEVELS.unreachable,httpStatus:null,receivedHTTP:false,reason,label,detail:label,ok:false};
}
export function viewState(state) {
  if(state.category && state.category!=='unknown')return classify(state.httpStatus,state.reason||(state.receivedHTTP && !state.httpStatus?'redirect':'network'));
  if(!state.status||state.status==='unknown')return {category:'unknown',...LEVELS.unknown,label:'Not checked yet'};
  const match=state.detail?.match(/HTTP (\d+)/);
  return classify(match?Number(match[1]):state.status==='up'?200:null);
}
export async function probe(url, request = fetch, timeout = 8000) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    let current = url;
    for (let redirect = 0; redirect <= 3; redirect++) {
      const response = await request(current, {method:'GET', redirect:'manual', signal:controller.signal,
        headers:{'User-Agent':'PayoUptime/1.0', 'Cache-Control':'no-cache'}, cf:{cacheTtl:0,cacheEverything:false}});
      await response.body?.cancel();
      const location = response.headers.get('location');
      if ([301,302,303,307,308].includes(response.status) && location) {
        if (redirect === 3) return {...classify(null,'redirect'),ms:Date.now()-start};
        try{current = normalizeUrl(new URL(location,current).href);}catch{return {...classify(null,'redirect'),ms:Date.now()-start};}
        continue;
      }
      return {...classify(response.status), ms:Date.now()-start};
    }
  } catch(error) {
    const text=String(error?.message||'').toLowerCase();
    const reason=controller.signal.aborted?'timeout':/dns|enotfound|resolve|name.*resolution/.test(text)?'dns':/tls|ssl|certificate/.test(text)?'tls':'network';
    return {...classify(null,reason),ms:Date.now()-start};
  }
  finally { clearTimeout(timer); }
}
export function transition(previous, result, now) {
  const observed=result.category?result:classify(Number(result.detail?.match(/HTTP (\d+)/)?.[1])||(result.ok?200:null));
  const old=viewState(previous),up=observed.ok;
  const next={...previous,...observed,ms:result.ms,checkedAt:now,status:up?'up':observed.category==='unreachable'?'down':'warning'};
  let event=null;
  if(!up && (old.category==='unknown'||old.category!==observed.category)) {
    next.downSince=previous.downSince||now;
    event={kind:'down',at:now,detail:observed.detail,category:observed.category,icon:observed.icon,severity:observed.severity,newIncident:old.category==='unknown'||old.category==='healthy',previousCategory:old.category};
  } else if(up && old.category!=='healthy' && old.category!=='unknown') {
    event={kind:'up',at:now,duration:Math.max(0,now-(previous.downSince||now))};
    next.downSince=null;
  }
  return {next,event};
}
export function shouldAlert(event,state) {
  return Boolean(event && ['error','unreachable'].includes(state.category));
}
export function eventText(url,e) {
  const when=new Date(e.at).toLocaleString('en-GB',{timeZone:'Asia/Tehran',hour12:false});
  if(e.kind!=='down')return `🟢 Payo · Recovered\n\nURL: ${url}\nResponse: HTTP 200\nDetected: ${when} · Tehran`;
  const noResponse=e.category==='unreachable';
  return `${noResponse?'🔴 Payo · No response':'🟠 Payo · Service disruption'}\n\nURL: ${url}\n${noResponse?'Cause: No response after 3 attempts\nLast error: '+e.detail:'Response: '+e.detail}\nDetected: ${when} · Tehran`;
}

// Each monitored address contributes equally; unobserved addresses are excluded.
export function dashboardSummary(rows){
 const observed=rows.filter(r=>Number.isFinite(r.stats?.total)&&r.stats.total>0);
 return {total:rows.length,healthy:rows.filter(r=>r.category==='healthy').length,observed:observed.length,averageUptime:observed.length?observed.reduce((sum,r)=>sum+100*r.stats.up/r.stats.total,0)/observed.length:null};
}
