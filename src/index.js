import { DurableObject } from 'cloudflare:workers';
import { dashboardSummary, INITIAL_URLS, INTERVAL, MAX_TARGETS, normalizeUrl, probe, transition, eventText, periodKey, periodBounds, reportText, DAY, viewState, shouldAlert } from './core.js';
import {iconLicense} from './icon-license.js';
import {ICONS} from './icons.js';
import {fontData,fontMime} from './font.js';
import {themeTokens} from './theme.js';
import {miniHTML} from './mini.js';
import {miniClient} from './mini-client.js';
import {avatar} from './avatar.js';
import {authenticate} from './mini-auth.js';
import {LEARN_MENU, LEARN_TOPICS} from './learn.js';

const keyboard = {keyboard:[['📊 Status','📋 My URLs & APIs'],['➕ Add URL / API','🗑 Remove'],['🔎 Check now','📈 Current report'],['📚 Learn','❔ Help']],resize_keyboard:true};
const legacyButtons = {'📊 وضعیت': '📊 Status', '📋 فهرست': '📋 My URLs & APIs', '➕ افزودن': '➕ Add URL / API', '🗑 حذف': '🗑 Remove', '🔎 بررسی': '🔎 Check now', '📈 گزارش امروز': '📈 Current report', '❔ راهنما': '❔ Help'};
const registry = env => env.REGISTRY.getByName(String(env.OWNER_ID));
const target = (env,id) => env.TARGETS.getByName(`${env.OWNER_ID}:${id}`);
const directory = env => env.DIRECTORY.getByName('users');
const forUser = (env,id) => ({...env,OWNER_ID:String(id)});
async function batches(items,job,size=5) {const results=[];for(let i=0;i<items.length;i+=size)results.push(...await Promise.allSettled(items.slice(i,i+size).map(job)));return results;}
const stamp = n => n ? new Date(n).toLocaleString('en-GB',{timeZone:'Asia/Tehran'}) : 'Not checked yet';

async function telegram(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(5000)});
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`Telegram ${res.status}`);
  return data.result;
}
async function send(env,text) {
  // Split output into messages below Telegram's text limit.
  const lines = text.split('\n'); let chunk='';
  for (const line of lines) {
    if (chunk.length+line.length+1>3500) {await telegram(env,'sendMessage',{chat_id:env.OWNER_ID,text:chunk,reply_markup:keyboard,link_preview_options:{is_disabled:true}});chunk='';}
    chunk += `${line}\n`;
  }
  if(chunk) await telegram(env,'sendMessage',{chat_id:env.OWNER_ID,text:chunk,reply_markup:keyboard,link_preview_options:{is_disabled:true}});
}
async function equalSecret(a,b) {
  if(!a || !b) return false;
  const encode = new TextEncoder();
  const [x,y] = await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(a)),crypto.subtle.digest('SHA-256',encode.encode(b))]);
  return crypto.subtle.timingSafeEqual(x,y);
}

export class Directory extends DurableObject {
  constructor(ctx,env) {super(ctx,env);this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, joined_at INTEGER NOT NULL)');}
  async enableMenu() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY)');
    if(this.sql.exec("SELECT key FROM settings WHERE key='mini-menu-v5'").toArray().length)return;
    await telegram(this.env,'setChatMenuButton',{menu_button:{type:'web_app',text:'App',web_app:{url:this.env.APP_URL}}});
    this.sql.exec("INSERT OR IGNORE INTO settings VALUES ('mini-menu-v5')");
  }
  systemTable() {this.sql.exec('CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');}
  systemRead(key) {this.systemTable();const value=this.sql.exec('SELECT value FROM system_state WHERE key=?',key).toArray()[0]?.value;return value?JSON.parse(value):null;}
  systemWrite(key,value) {this.systemTable();this.sql.exec('INSERT OR REPLACE INTO system_state VALUES (?,?)',key,JSON.stringify(value));}
  configureWatchdog(url) {
    if(!/^https:\/\/hc-ping\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(url))throw new Error('Use the HTTPS UUID ping URL from Healthchecks.io.');
    this.systemWrite('watchdogUrl',url);
  }
  systemStatus() {const state=this.systemRead('cycle')||{};return {...state,watchdogConfigured:Boolean(this.systemRead('watchdogUrl')||this.env.WATCHDOG_PING_URL),watchdogDelivery:this.systemRead('watchdogDelivery')};}
  async recordCycle(result) {
    const old=this.systemRead('cycle')||{},now=Date.now();
    const state={...result,at:now,lastSuccess:result.ok?now:old.lastSuccess||null};this.systemWrite('cycle',state);
    // Never send customer URLs, IDs, or credentials to the external heartbeat service.
    const url=this.systemRead('watchdogUrl')||this.env.WATCHDOG_PING_URL;
    if(result.ok&&url){
      try {const response=await fetch(url,{method:'POST',body:'Payo scheduled monitor cycle completed.',redirect:'manual',signal:AbortSignal.timeout(5000)});const text=await response.text();if(!response.ok||text.trim()!=='OK')throw new Error('Heartbeat rejected');this.systemWrite('watchdogDelivery',{ok:true,at:now});}
      catch {this.systemWrite('watchdogDelivery',{ok:false,at:now});console.error(JSON.stringify({event:'watchdog_ping_failed'}));}
    }
  }
  register(id) {if(!/^\d+$/.test(String(id))) throw new Error('Invalid user');this.sql.exec('INSERT OR IGNORE INTO users VALUES (?,?)',String(id),Date.now());}
  list() {return this.sql.exec('SELECT id FROM users ORDER BY joined_at').toArray().map(r=>r.id);}
}

export class Registry extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS targets (id TEXT PRIMARY KEY, url TEXT UNIQUE NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS updates (id INTEGER PRIMARY KEY, at INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS replies (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)');
  }
  owner() {return this.sql.exec("SELECT value FROM meta WHERE key='owner'").toArray()[0]?.value || this.env.OWNER_ID;}
  config() {return forUser(this.env,this.owner());}
  initialize(id) {
    const existing=this.sql.exec("SELECT value FROM meta WHERE key='owner'").toArray()[0]?.value;
    if(existing && existing!==String(id))throw new Error('Owner mismatch');
    this.sql.exec("INSERT OR IGNORE INTO meta VALUES ('owner',?)",String(id));
    this.sql.exec("INSERT OR IGNORE INTO meta VALUES ('reports_begin',?)",periodKey(Date.now()));
  }
  list() {return this.sql.exec('SELECT id,url FROM targets ORDER BY rowid').toArray();}
  countTargets() {return this.sql.exec('SELECT COUNT(*) AS count FROM targets').toArray()[0].count;}
  onboarded() {return Boolean(this.sql.exec("SELECT value FROM meta WHERE key='onboarding_v2'").toArray().length);}
  completeOnboarding() {this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('onboarding_v2','1')");}
  async seed() {
    if(this.sql.exec("SELECT value FROM meta WHERE key='seeded'").toArray().length) return;
    if(String(this.owner())===String(this.env.OWNER_ID)) for(const url of INITIAL_URLS) await this.add(url);
    this.sql.exec("INSERT OR IGNORE INTO meta VALUES ('seeded','1')");
  }
  async add(input) {
    const url=normalizeUrl(input);
    if(this.sql.exec('SELECT id FROM targets WHERE url=?',url).toArray().length) return 'This URL or API endpoint is already on your list.';
    const id=crypto.randomUUID();
    // Persist list first; initial configuration is also repaired by scheduled runs.
    this.sql.exec('INSERT INTO targets VALUES (?,?)',id,url);
    await target(this.config(),id).configure(url,this.owner());
    return `✅ Added\n${url}`;
  }
  async remove(id) {
    const rows=this.sql.exec('SELECT url FROM targets WHERE id=?',id).toArray();
    if(!rows.length) return 'This target is no longer on your list.';
    await target(this.config(),id).disable();
    this.sql.exec('DELETE FROM targets WHERE id=?',id);
    return `✅ Removed\n${rows[0].url}`;
  }
  pending(value) {
    if(value===undefined) return this.sql.exec("SELECT value FROM meta WHERE key='pending'").toArray()[0]?.value || '';
    this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('pending',?)",value);
  }
  accept(update) {
    this.sql.exec('DELETE FROM updates WHERE at < ?',Date.now()-86400000);
    const inserted=this.sql.exec('INSERT OR IGNORE INTO updates VALUES (?,?) RETURNING id',update,Date.now()).toArray();
    return inserted.length>0;
  }
  enqueue(text) {this.sql.exec('INSERT INTO replies(text) VALUES (?)',text);}
  async flush() {
    if(this.flushing) return;
    this.flushing=true;
    try {
      for(const row of this.sql.exec('SELECT * FROM replies ORDER BY id LIMIT 10').toArray()) {
        await send(this.config(),row.text);
        this.sql.exec('DELETE FROM replies WHERE id=?',row.id);
      }
    } finally {this.flushing=false;}
  }
  async reportRows(key) {
    const items=this.list();const rows=[];
    const results=await batches(items,async t=>{rows.push({url:t.url,...await target(this.config(),t.id).stats(key)});});
    if(results.some(r=>r.status==='rejected'))throw new Error('Incomplete report data');
    return rows;
  }
  async daily(key) {
    const begin=this.sql.exec("SELECT value FROM meta WHERE key='reports_begin'").toArray()[0]?.value;
    if(!begin||key<begin)return;
    if(this.reporting) return;
    this.reporting=true;
    try {
      if(this.sql.exec("SELECT value FROM meta WHERE key=?",`report:${key}`).toArray().length) {await this.flush();return;}
      const items=this.list();
      if(items.length) {
        const rows=await this.reportRows(key);
        this.ctx.storage.transactionSync(()=>{
          this.enqueue(reportText(key,rows));
          this.sql.exec('INSERT OR IGNORE INTO meta VALUES (?,?)',`report:${key}`,'queued');
        });
      }
      await this.flush();
    } finally {this.reporting=false;}
  }
  async handle(update) {
    if(!this.accept(update.update_id)) return this.flush();
    const cb=update.callback_query;
    if(cb) {
      await telegram(this.config(),'answerCallbackQuery',{callback_query_id:cb.id});
      if(cb.data?.startsWith('learn:')) {
        const topic=cb.data.slice(6);
        if(Object.hasOwn(LEARN_TOPICS,topic))this.enqueue(LEARN_TOPICS[topic]);
        return this.flush();
      }
      if(cb.data?.startsWith('delete:')) {
        const id=cb.data.slice(7);
        if(this.list().some(t=>t.id===id)) await telegram(this.config(),'sendMessage',{chat_id:this.owner(),text:'Remove this URL or API endpoint?',reply_markup:{inline_keyboard:[[{text:'Yes, remove',callback_data:`confirm:${id}`}],[{text:'Cancel',callback_data:'cancel'}]]}});
      } else if(cb.data?.startsWith('confirm:')) this.enqueue(await this.remove(cb.data.slice(8)));
      return this.flush();
    }
    const raw=update.message?.text?.trim() || '';
    const text=legacyButtons[raw]||raw;
    const command=text.split(/\s/)[0].split('@')[0];
    if(command==='/system'||command==='/watchdog') {
      if(String(this.owner())!==String(this.env.OWNER_ID))this.enqueue('This command is only available to the bot owner.');
      else if(command==='/watchdog'&&text.split(/\s+/).length>1){
        try {await directory(this.env).configureWatchdog(text.split(/\s+/)[1]);this.enqueue('Watchdog connection saved. Activate the external check with a 10-minute period and 15-minute grace. Only successful cycles send a heartbeat.');}
        catch {this.enqueue('Use /watchdog followed by the HTTPS UUID ping URL from Healthchecks.io.');}
      } else {
        const state=await directory(this.env).systemStatus();
        this.enqueue('Payo ⚡️ · System health\n\nLast successful cycle: '+stamp(state.lastSuccess)+'\nLast cycle: '+(state.at?(state.ok?'Completed':'Incomplete'):'Not recorded yet')+'\nExternal watchdog: '+(state.watchdogConfigured?'Connected; confirm Telegram alerts in Healthchecks.io':'Not connected')+'\nHeartbeat delivery: '+(state.watchdogDelivery?(state.watchdogDelivery.ok?'Successful':'Failed'):'Not sent yet')+'\n\nQuota usage alerts: not connected to Cloudflare usage metrics.');
      }
    }
    else if(command==='/stats') {
      if(String(this.owner())!==String(this.env.OWNER_ID)) {this.enqueue('This command is only available to the bot owner.');}
      else {
        const users=await directory(this.env).list();
        const counts=await batches(users,id=>this.env.REGISTRY.getByName(String(id)).countTargets());
        if(counts.some(result=>result.status!=='fulfilled'))this.enqueue('Stats are temporarily unavailable. Please try again.');
        else {const values=counts.map(result=>result.value);this.enqueue('Payo ⚡️ · Bot stats\n\nTotal users: '+users.length+'\nActive users: '+values.filter(n=>n>0).length+'\nTotal URLs & APIs — all users: '+values.reduce((sum,n)=>sum+n,0)+'\n\nActive = users with at least one URL or API.\nTotal users = accounts registered with Payo.\nURLs shared by multiple users count once per user list.');}
      }
    }
    else if(command==='/cancel') {this.pending('');this.enqueue('Cancelled.');}
    else if(command==='/app'||(text==='⚡ Launch Payo'||text==='⚡ Open Payo')) {
      this.pending('');
      await telegram(this.config(),'sendMessage',{chat_id:this.owner(),text:'Your URLs & APIs, in one place. Launch your private dashboard:',reply_markup:{inline_keyboard:[[{text:'App',web_app:{url:this.env.APP_URL}}]]}});
    }
    else if(command==='/start'||command==='/help'||text==='❔ Help') {
      this.pending('');
      this.enqueue('Payo ⚡️\nMonitor website URLs and API endpoints.\n\nSend a public domain or URL to get started. Every 10 minutes I send an HTTP GET request. Orange HTTP service errors alert immediately. If no HTTP response arrives, I retry twice, waiting 10 seconds after each failure, and alert red only if all 3 attempts fail. Other colors and recovery are visible in Status and reports, without separate alerts.\n\n/add URL — add a website or API endpoint\n/list — your URLs and APIs\n/status — latest results\n/check — check targets due in the current interval\n/report — current reporting window\n/cancel — cancel\n/learn — colors, reports and alerts\n\nAnyone can use Payo ⚡️. Your list, alerts and reports are private to your Telegram account. Daily summary: 12:00 noon, Tehran time.');
      await telegram(this.config(),'sendMessage',{chat_id:this.owner(),text:'Tap App beside the message field to launch Payo directly. You can also use the button below.',reply_markup:{inline_keyboard:[[{text:'App',web_app:{url:this.env.APP_URL}}]]}});
    } else if(command==='/learn'||text==='📚 Learn') {
      this.pending('');
      await telegram(this.config(),'sendMessage',{chat_id:this.owner(),...LEARN_MENU});
    } else if(command==='/add'||text==='➕ Add URL / API') {
      const input=text.split(/\s+/).slice(1).join(' ');
      if(command==='/add'&&input) {try{this.enqueue(await this.add(input));}catch(e){this.enqueue(e.message);}}
      else {this.pending('add');this.enqueue('Send a website URL or API endpoint, such as example.com or https://example.com/health\nUse /cancel to cancel.');}
    } else if(command==='/list'||text==='📋 My URLs & APIs'||text==='🗑 Remove') {
      this.pending('');const items=this.list();
      this.enqueue(`📋 My URLs & APIs (${items.length})\n${items.map((t,i)=>`${i+1}. ${t.url}`).join('\n')}`);
      if(text==='🗑 Remove'&&items.length) {for(let i=0;i<items.length;i+=30) await telegram(this.config(),'sendMessage',{chat_id:this.owner(),text:'Choose a URL or API endpoint to remove:',reply_markup:{inline_keyboard:items.slice(i,i+30).map(t=>[{text:t.url.slice(0,60),callback_data:`delete:${t.id}`}])}});}
    } else if(command==='/status'||text==='📊 Status') {
      this.pending('');const items=this.list();
      const reports=await Promise.all(items.map(async t=>{const s=await target(this.config(),t.id).status();const v=viewState(s);return `${v.icon} ${t.url}\nPriority: ${v.severity}\n${v.detail||v.label} · ${stamp(s.checkedAt)}${s.pendingCheck?'\nConfirming no response: '+s.pendingCheck.attempts+'/3 attempts completed.':''}`;}));
      this.enqueue(`📊 Latest status\n\n${reports.join('\n\n')}`);
    } else if(command==='/check'||text==='🔎 Check now') {
      this.pending('');this.enqueue('Check requested. Each URL or API endpoint is checked once per 10-minute interval. Open Status for results.');
      this.ctx.waitUntil(runUser(this.config()));
    } else if(command==='/report'||text==='📈 Current report') {
      const key=periodKey(Date.now());const rows=await this.reportRows(key);this.enqueue('Partial report for the current window\n'+reportText(key,rows));
    } else if(this.pending()==='add'||/^(https?:\/\/|[a-zA-Z0-9-]+\.)/.test(text)) {
      try {this.enqueue(await this.add(text));this.pending('');} catch(e){this.enqueue(e.message);}
    } else this.enqueue('Send a website URL or API endpoint, use the buttons, or type /help.');
    await this.flush();
  }
}

export class Target extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS daily (period TEXT PRIMARY KEY,total INTEGER NOT NULL,up INTEGER NOT NULL,outages INTEGER NOT NULL)');
    const columns=new Set(this.sql.exec('PRAGMA table_info(daily)').toArray().map(r=>r.name));
    for(const column of ['notice','warning','error','unreachable'])if(!columns.has(column))this.sql.exec(`ALTER TABLE daily ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)');
  }
  status() {return JSON.parse(this.sql.exec('SELECT data FROM state WHERE id=1').toArray()[0]?.data || '{}');}
  save(data) {this.sql.exec('INSERT OR REPLACE INTO state VALUES (1,?)',JSON.stringify(data));}
  configure(url,ownerId=this.env.OWNER_ID) {const state=this.status();if(state.ownerId && state.ownerId!==String(ownerId))throw new Error('Owner mismatch');if(!state.url)this.save({url,ownerId:String(ownerId),enabled:true,status:'unknown'});else if(!state.ownerId)this.save({...state,ownerId:String(ownerId)});}
  stats(key) {periodBounds(key);return this.sql.exec('SELECT total,up,outages,notice,warning,error,unreachable FROM daily WHERE period=?',key).toArray()[0] || {total:0,up:0,outages:0,notice:0,warning:0,error:0,unreachable:0};}
  async disable() {this.save({...this.status(),enabled:false,pendingCheck:null});this.sql.exec('DELETE FROM outbox');await this.ctx.storage.deleteAlarm();}
  async flush() {
    // Apply the current alert policy to queued notifications from older versions too.
    this.sql.exec("DELETE FROM outbox WHERE substr(text,1,1) NOT IN ('🟠','🔴')");
    for(const row of this.sql.exec('SELECT * FROM outbox ORDER BY id LIMIT 4').toArray()) {
      await send(forUser(this.env,this.status().ownerId||this.env.OWNER_ID),row.text);this.sql.exec('DELETE FROM outbox WHERE id=?',row.id);
    }
  }
  async check() {
    if(this.running)return {skipped:true};
    let previous=this.status();if(!previous.enabled)return {skipped:true};
    if(previous.pendingCheck){
      if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Math.max(Date.now(),previous.pendingCheck.retryAt||0));
      return {pending:true};
    }
    const bucket=Math.floor(Date.now()/INTERVAL);
    if((previous.startedAt?Math.floor(previous.startedAt/INTERVAL):previous.startedBucket)===bucket){await this.flush();return {skipped:true};}
    const now=Date.now();
    this.save({...previous,startedAt:now,startedBucket:bucket,pendingCheck:{id:crypto.randomUUID(),attempts:0,firstAt:now,retryAt:now}});
    return this.attempt();
  }
  async alarm() {
    const state=this.status();
    if(!state.enabled)return;
    if(!state.pendingCheck){await this.flush();return;}
    if(this.running){await this.ctx.storage.setAlarm(Date.now()+10000);return;}
    if(state.pendingCheck.retryAt>Date.now()){await this.ctx.storage.setAlarm(state.pendingCheck.retryAt);return;}
    await this.attempt();
  }
  async attempt() {
    if(this.running)return {skipped:true};
    this.running=true;
    try{
      let previous=this.status();const pending=previous.pendingCheck;
      if(!previous.enabled||!pending)return {skipped:true};
      const result=await probe(previous.url);
      // Removal or another completed cycle must suppress late results.
      previous=this.status();
      if(!previous.enabled||previous.pendingCheck?.id!==pending.id)return {skipped:true};
      const attempts=pending.attempts+1;
      if(result.category==='unreachable'&&attempts<3){
        const retryAt=Date.now()+10000;
        this.save({...previous,pendingCheck:{...pending,attempts,retryAt}});
        await this.ctx.storage.setAlarm(retryAt);
        return {pending:true,attempts};
      }
      const {next,event}=transition({...previous,pendingCheck:null},result,Date.now());
      next.attemptCount=attempts;next.firstAttemptAt=pending.firstAt;
      this.ctx.storage.transactionSync(()=>{
        this.save(next);
        this.sql.exec('INSERT INTO daily (period,total,up,outages,notice,warning,error,unreachable) VALUES (?,1,?,?,?,?,?,?) ON CONFLICT(period) DO UPDATE SET total=total+1,up=up+excluded.up,outages=outages+excluded.outages,notice=notice+excluded.notice,warning=warning+excluded.warning,error=error+excluded.error,unreachable=unreachable+excluded.unreachable',periodKey(next.checkedAt),result.ok?1:0,event?.newIncident?1:0,...['notice','warning','error','unreachable'].map(c=>next.category===c?1:0));
        this.sql.exec('DELETE FROM daily WHERE period < ?',periodKey(Date.now()-35*DAY));
        if(shouldAlert(event,next))this.sql.exec('INSERT INTO outbox(text) VALUES (?)',eventText(next.url,event));
      });
      await this.ctx.storage.deleteAlarm();
      await this.flush();return {status:next.status,detail:next.detail};
    }finally{this.running=false;}
  }

}
async function runUser(env) {
  const reg=registry(env);await reg.initialize(env.OWNER_ID);await reg.seed();
  const items=await reg.list();
  const results=await batches(items,async t=>{const stub=target(env,t.id);await stub.configure(t.url,env.OWNER_ID);return stub.check();});
  const failed=results.filter(r=>r.status==='rejected').length;
  console.log(JSON.stringify({event:'monitor_cycle',targets:items.length,failed}));
  try{await reg.flush();}catch{console.error(JSON.stringify({event:'telegram_retry_pending'}));}
  if(failed) {console.error(JSON.stringify({event:'checks_incomplete',count:failed}));throw new Error('Monitor operations incomplete');}
  const states=await batches(items,t=>target(env,t.id).status());
  if(states.some(r=>r.status==='rejected'||(r.value.pendingCheck?Date.now()-r.value.pendingCheck.firstAt>90000:!r.value.checkedAt||Date.now()-r.value.checkedAt>25*60000)))throw new Error('Stale monitor results');
}
async function runChecks(env,scheduledTime=Date.now()) {
  await directory(env).register(env.OWNER_ID);
  try{await directory(env).enableMenu();}catch{console.error(JSON.stringify({event:'mini_menu_pending'}));}
  const users=await directory(env).list();
  const results=await batches(users,async id=>{
    const config=forUser(env,id);const reg=registry(config);
    await reg.initialize(id);
    // Noon reports are retried by each subsequent monitor cycle, with persistent deduplication.
    const reportKey=periodKey(scheduledTime-DAY);
    try{await reg.daily(reportKey);}catch{console.error(JSON.stringify({event:'daily_report_retry_pending'}));}
    await runUser(config);
  },2);
  await directory(env).recordCycle({ok:results.every(r=>r.status==='fulfilled'),failedUsers:results.filter(r=>r.status==='rejected').length});
}
export default {
  async scheduled(event,env,ctx) {ctx.waitUntil(runChecks(env,event.scheduledTime));},
  async fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(path==='/app'||path==='/app/')return new Response(miniHTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' https:; connect-src 'self'; base-uri 'none'; form-action 'self'"}});
    if(path==='/app/roboto.woff2')return new Response(Uint8Array.from(atob(fontData),c=>c.charCodeAt(0)),{headers:{'Content-Type':fontMime,'Cache-Control':'public,max-age=604800'}});
    if(path==='/app/icons/LICENSE.txt')return new Response(iconLicense,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public,max-age=86400'}});
    if(path.startsWith('/app/icons/')&&path.endsWith('.svg')){const key=path.slice('/app/icons/'.length,-4);if(Object.hasOwn(ICONS,key))return new Response(ICONS[key],{headers:{'Content-Type':'image/svg+xml','Link':'</app/icons/LICENSE.txt>; rel="license"','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});return new Response('Not found',{status:404});}
    if(path==='/app/icons.js')return new Response('export const ICONS = '+JSON.stringify(Object.fromEntries(Object.entries(ICONS).map(([key,svg])=>[key,Array.from(svg).reduce((hash,char)=>Math.imul(hash^char.charCodeAt(0),16777619)>>>0,2166136261).toString(36)]))),{headers:{'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
    if(path==='/app/theme.js')return new Response('export const themeTokens = '+themeTokens.toString(),{headers:{'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
    if(path==='/app/client.js')return new Response(miniClient,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
    if(path==='/app/avatar.jpg')return new Response(Uint8Array.from(atob(avatar),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=86400'}});
    if(path==='/app/api') {
      const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      if(request.method!=='POST')return json({error:'Method not allowed'},405);
      const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
      let user;try{user=await authenticate(request.headers.get('Authorization')?.replace(/^tma /,''),env.TELEGRAM_BOT_TOKEN);}catch(e){return json({error:e.message},401);}
      // Bound input before parsing. Client never supplies the acting user ID.
      const reader=request.body?.getReader();if(!reader)return json({error:'Missing request'},400);
      let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(value);}
      let body;try{const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid request'},400);}
      if(!['dashboard','add','remove','onboard'].includes(body?.action))return json({error:'Unknown action'},400);
      const config=forUser(env,user.id),reg=registry(config);await directory(env).register(user.id);await reg.initialize(user.id);await reg.seed();
      ctx.waitUntil(directory(env).enableMenu().catch(()=>console.error(JSON.stringify({event:'mini_menu_pending'}))));
      try{
        if(body.action==='onboard'){await reg.completeOnboarding();return json({ok:true});}
        if(body.action==='add'){if(typeof body.url!=='string')throw new Error('Enter a URL or API endpoint.');return json({message:await reg.add(body.url)});}
        if(body.action==='remove'){if(typeof body.id!=='string'||body.id.length>50)throw new Error('Invalid monitor.');return json({message:await reg.remove(body.id)});}
        const key=periodKey(Date.now()),items=await reg.list(),targets=[];
        const results=await batches(items,async t=>{const stub=target(config,t.id);const [state,stats]=await Promise.all([stub.status(),stub.stats(key)]);const v=viewState(state);targets.push({id:t.id,url:t.url,category:v.category,icon:v.icon,detail:v.detail||v.label,httpStatus:v.httpStatus||null,checkedAt:state.checkedAt||null,ms:state.ms??null,pendingAttempts:state.pendingCheck?.attempts||0,stats});});
        if(results.some(r=>r.status==='rejected'))return json({error:'Could not load all monitors. Try again.'},503);
        const order=new Map(items.map((t,i)=>[t.id,i]));targets.sort((a,b)=>order.get(a.id)-order.get(b.id));
        return json({user,targets,summary:dashboardSummary(targets),onboardingComplete:await reg.onboarded(),window:periodBounds(key)});
      }catch(e){return json({error:e.message},400);}
    }
    if(path==='/health'&&request.method==='GET') return Response.json({service:'Payo ⚡️',ok:true});
    if(path.startsWith('/admin/')) {
      if(!await equalSecret(request.headers.get('Authorization'),`Bearer ${env.ADMIN_SECRET}`)||!env.ADMIN_SECRET) return new Response('Unauthorized',{status:401});
      if(path==='/admin/system'&&request.method==='GET')return Response.json(await directory(env).systemStatus(),{headers:{'Cache-Control':'no-store'}});
      if(path==='/admin/watchdog'&&request.method==='POST') {try{const body=await request.json();if(typeof body.url!=='string'||body.url.length>120)throw new Error('Invalid ping URL');await directory(env).configureWatchdog(body.url);return Response.json({ok:true});}catch{return Response.json({error:'Use a Healthchecks.io HTTPS UUID ping URL.'},{status:400});}}
      if(path==='/admin/setup'&&request.method==='POST') {await directory(env).register(env.OWNER_ID);await registry(env).initialize(env.OWNER_ID);await registry(env).seed();return Response.json({count:(await registry(env).list()).length});}
      if(path==='/admin/check'&&request.method==='POST') {await runChecks(env);return Response.json({ok:true});}
      if(path==='/admin/remove'&&request.method==='POST') {
        let urls;try {urls=(await request.json()).urls;if(!Array.isArray(urls)||urls.length>MAX_TARGETS||urls.some(u=>typeof u!=='string'))throw new Error();urls=urls.map(normalizeUrl);} catch{return new Response('Bad request',{status:400});}
        const items=await registry(env).list();const removed=[];
        for(const item of items) if(urls.includes(item.url)) {await registry(env).remove(item.id);removed.push(item.url);}
        return Response.json({removed,count:(await registry(env).list()).length});
      }
      if(path==='/admin/report'&&request.method==='POST') {const {key,preview=false}=await request.json();periodBounds(key);if(preview)return Response.json(await registry(env).reportRows(key));await registry(env).daily(key);return Response.json({ok:true});}
      if(path==='/admin/status'&&request.method==='GET') {
        const items=await registry(env).list();
        return Response.json(await Promise.all(items.map(async t=>({...t,...await target(env,t.id).status()}))));
      }
    }
    if(path!=='/telegram'||request.method!=='POST') return new Response('Not found',{status:404});
    if(!await equalSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.WEBHOOK_SECRET)) return new Response('Unauthorized',{status:401});
    if(Number(request.headers.get('Content-Length'))>65536) return new Response('Too large',{status:413});
    let update;
    try {
      const reader=request.body?.getReader();const chunks=[];let size=0;
      if(!reader) return new Response('Bad request',{status:400});
      while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return new Response('Too large',{status:413});}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      update=JSON.parse(new TextDecoder().decode(bytes));
    } catch{return new Response('Bad request',{status:400});}
    const message=update.message || update.callback_query?.message;
    const from=update.message?.from || update.callback_query?.from;
    if(!Number.isSafeInteger(update.update_id)||!Number.isSafeInteger(from?.id)||from.id<=0||String(message?.chat?.id)!==String(from?.id)||message?.chat?.type!=='private') return new Response('OK');
    // Reply quickly; command handling and replies live within the Worker lifetime.
    const config=forUser(env,from.id);
    ctx.waitUntil((async()=>{try{await directory(env).enableMenu();}catch{console.error(JSON.stringify({event:'mini_menu_pending'}));}await directory(env).register(from.id);const reg=registry(config);await reg.initialize(from.id);await reg.seed();await reg.handle(update);})().catch(()=>console.error(JSON.stringify({event:'command_failed'}))));
    return new Response('OK');
  }
};
