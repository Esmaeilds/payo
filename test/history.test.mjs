import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHmac} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {historyView} from '../src/history.js';
import {DAY,INTERVAL} from '../src/core.js';

test('history represents missing checks and timeouts without fabricated latency or uptime',()=>{
 const now=1800000000000,slot=Math.floor(now/INTERVAL);
 const raw=[{slot:slot-3,at:(slot-3)*INTERVAL,category:'healthy',http:200,ms:120,attempts:1},{slot:slot-1,at:(slot-1)*INTERVAL,category:'unreachable',http:null,ms:null,attempts:3}];
 const data=historyView(raw,[],'24h',now,{});
 assert.equal(data.summary.total,2);assert.equal(data.summary.up,1);assert.equal(data.summary.uptime,50);assert.equal(data.summary.averageMs,120);
 assert.equal(data.points.find(p=>p.at===(slot-2)*INTERVAL).category,'missing');
 assert.equal(data.points.find(p=>p.at===(slot-1)*INTERVAL).ms,null);
 assert.equal(data.recent.length,30);assert.equal(data.incidents.length,1);
 const sparse=historyView([raw[1],{...raw[0],slot,at:slot*INTERVAL}],[],'24h',now,{});
 assert.equal(sparse.incidents[0].end,slot*INTERVAL);
 const gap=historyView([{...raw[1],slot:slot-4,at:(slot-4)*INTERVAL},raw[0]],[],'24h',now,{});
 assert.equal(gap.incidents[0].end,(slot-3)*INTERVAL);
 const missed=historyView([{...raw[1],slot:slot-4,at:(slot-4)*INTERVAL},{...raw[0],slot,at:slot*INTERVAL}],[],'24h',now,{});
 assert.equal(missed.incidents[0].end,null);assert.equal(missed.incidents[0].ongoing,false);
});

test('long ranges use complete hourly aggregates and weight response means',()=>{
 const now=1800000000000,hour=Math.floor(now/3600000)-1;
 const data=historyView([],[{hour,total:6,up:5,response_count:5,response_sum:500,response_max:220,attempts:8}],'30d',now,{});
 assert.equal(data.summary.total,6);assert.equal(data.summary.averageMs,100);
 assert.equal(data.points.find(p=>p.at===hour*3600000).max,220);
 assert.equal(data.summary.expected,data.points.length*6);
});

const signed=id=>{const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Test'})});const text=[...params.entries()].sort().map(([k,v])=>k+'='+v).join('\n');const secret=createHmac('sha256','WebAppData').update('test-token').digest();params.set('hash',createHmac('sha256',secret).update(text).digest('hex'));return params.toString();};
test('runtime: saved history is private, prunes, and never triggers probes',async()=>{
 const fixture=new URL(`../.history-fixture-${process.pid}.js`,import.meta.url);
 await writeFile(fixture,`import worker,{Directory,Registry,Target as BaseTarget} from './src/index.js';export {Directory,Registry};
 export class Target extends BaseTarget {seedOld(){const slot=Math.floor((Date.now()-9*86400000)/600000);this.sql.exec("INSERT INTO observations VALUES (?,?,'healthy',200,1,1,NULL)",slot,slot*600000);this.sql.exec('INSERT INTO hourly VALUES (?,1,1,1,1,1,1)',Math.floor((Date.now()-32*86400000)/3600000));}}
 export default {async fetch(req,env,ctx){if(new URL(req.url).pathname==='/test/check'){const items=await env.REGISTRY.getByName('123').list();const t=env.TARGETS.getByName('123:'+items[0].id);await t.seedOld();await t.check();return Response.json(await t.usage());}return worker.fetch(req,env,ctx);}};`);
 let probes=0;const mf=new Miniflare({modules:true,scriptPath:fileURLToPath(fixture),modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-07-30',bindings:{OWNER_ID:'100000001',APP_URL:'https://payo.example/app',ADMIN_SECRET:'test-admin',WEBHOOK_SECRET:'test-hook',TELEGRAM_BOT_TOKEN:'test-token'},durableObjects:{DIRECTORY:{className:'Directory',useSQLite:true},REGISTRY:{className:'Registry',useSQLite:true},TARGETS:{className:'Target',useSQLite:true}},outboundService:async req=>{if(req.url.startsWith('https://api.telegram.org/'))return Response.json({ok:true,result:{}});probes++;return new Response('OK');}});
 const api=(id,body)=>mf.dispatchFetch('https://payo.test/app/api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'tma '+signed(id)},body:JSON.stringify(body)});
 try {
 assert.equal((await api(123,{action:'add',url:'https://example.com/health'})).status,200);
 const list=await (await api(123,{action:'dashboard'})).json(),id=list.targets[0].id;
 const usage=await (await mf.dispatchFetch('https://payo.test/test/check')).json();assert.equal(usage.checks,1);assert.equal(usage.attempts,1);assert.equal(usage.retainedSamples,1);
 for(const range of ['24h','7d','30d']){const r=await api(123,{action:'history',id,range});assert.equal(r.status,200);const d=await r.json();assert(d.points.length<=720);assert.equal(d.recent.filter(p=>p.category==='healthy').length,1);}
 assert.equal((await api(456,{action:'history',id,range:'24h'})).status,404);
 assert.equal((await api(123,{action:'history',id,range:'forever'})).status,400);
 assert.equal((await mf.dispatchFetch('https://payo.test/app/api',{method:'POST',body:JSON.stringify({action:'history',id,range:'24h'})})).status,401);
 assert.equal(probes,1,'reading history must never issue HTTP probes');
 await api(123,{action:'remove',id});assert.equal((await api(123,{action:'history',id,range:'24h'})).status,404);
 }finally{await mf.dispose();await rm(fixture,{force:true});}
});
