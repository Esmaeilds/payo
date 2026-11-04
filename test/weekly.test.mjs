import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {weeklyPeriodKey,weeklyPeriodBounds,reportText,WEEK} from '../src/core.js';

test('Friday midnight Tehran uses Thursday 20:30 UTC and handles year rollover',async()=>{
  assert.equal(weeklyPeriodKey(Date.parse('2026-11-05T20:29:59Z')),'2026-10-30');
  assert.equal(weeklyPeriodKey(Date.parse('2026-11-05T20:30:00Z')),'2026-11-06');
  assert.equal(weeklyPeriodKey(Date.parse('2026-11-06T20:30:00Z')),'2026-11-06');
  assert.equal(weeklyPeriodKey(Date.parse('2026-12-31T20:30:00Z')),'2027-01-01');
  const bounds=weeklyPeriodBounds('2026-11-06');
  assert.equal(new Date(bounds.start).toISOString(),'2026-11-05T20:30:00.000Z');
  assert.equal(new Date(bounds.end).toISOString(),'2026-11-12T20:30:00.000Z');
  assert.equal(bounds.end-bounds.start,WEEK);
  for(const invalid of ['2026-11-05','2026-02-30','bad'])assert.throws(()=>weeklyPeriodBounds(invalid));
  assert((await readFile(new URL('../cloudflare.config.ts',import.meta.url),'utf8')).includes("schedule:'30 20 * * THU'"));
  const text=reportText('2026-11-06',[{url:'https://example.com/',up:1000,total:1008,outages:2}],{weekly:true});
  assert(text.includes('weekly summary'));assert(text.includes('99.21%'));assert(text.includes('1008/1008'));assert(text.includes('incomplete weekly coverage'));
});

test('weekly report is private, retries delivery, and deduplicates across restart',async()=>{
  const persisted=await mkdtemp(join(tmpdir(),'payo-weekly-'));
  const fixture=new URL(`../.report-fixture-weekly-${process.pid}.js`,import.meta.url);
  await writeFile(fixture,`import worker,{Directory,Registry,Target} from './src/index.js';
    export {Directory,Registry,Target};
    export default {async fetch(req,env,ctx){
      if(new URL(req.url).pathname==='/test/tick'){
        const tasks=[];await worker.scheduled({scheduledTime:Number(new URL(req.url).searchParams.get('at'))},env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);return new Response('OK');
      }
      return worker.fetch(req,env,ctx);
    }};`);
  const messages=[];let failing=false,probes=0,update=0,mf;
  const create=()=>new Miniflare({modules:true,scriptPath:fileURLToPath(fixture),modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-07-30',durableObjectsPersist:persisted,
    bindings:{OWNER_ID:'100000001',APP_URL:'https://payo.example/app',ADMIN_SECRET:'test-admin',WEBHOOK_SECRET:'test-hook',TELEGRAM_BOT_TOKEN:'test-token'},
    durableObjects:{DIRECTORY:{className:'Directory',useSQLite:true},REGISTRY:{className:'Registry',useSQLite:true},TARGETS:{className:'Target',useSQLite:true}},
    outboundService:async req=>{
      if(req.url.startsWith('https://api.telegram.org/')){if(failing)return Response.json({ok:false},{status:503});messages.push(await req.json());return Response.json({ok:true,result:{}});}
      probes++;return new Response('OK');
    }});
  const admin=(path,body)=>mf.dispatchFetch('https://payo.test/admin/'+path,{method:'POST',headers:{Authorization:'Bearer test-admin','Content-Type':'application/json'},body:JSON.stringify(body||{})});
  const webhook=async(id,url)=>{
    await mf.dispatchFetch('https://payo.test/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'test-hook'},body:JSON.stringify({update_id:++update,message:{text:'/add '+url,from:{id},chat:{id,type:'private'}}})});
    // Wait for the per-user persisted webhook work to become visible.
    for(let i=0;i<30&&!messages.some(m=>String(m.chat_id)===String(id)&&m.text?.includes('Added'));i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert(messages.some(m=>String(m.chat_id)===String(id)&&m.text?.includes('Added')));
  };
  try {
    mf=create();await admin('setup');
    await webhook(100000001,'https://owner.example/');await webhook(123,'https://other.example/');
    await admin('check');
    assert(!messages.some(m=>m.text?.includes('weekly summary')),'ongoing week must not send early');
    const key=weeklyPeriodKey(Date.now()),end=weeklyPeriodBounds(key).end;
    const rows=await (await admin('weekly-report',{key,preview:true})).json();
    assert.equal(rows.length,1);assert.equal(rows[0].total,1);assert.equal(rows[0].up,1);
    assert.equal((await mf.dispatchFetch('https://payo.test/admin/weekly-report',{method:'POST',body:'{}'})).status,401);
    failing=true;await mf.dispatchFetch('https://payo.test/test/tick?at='+end);
    assert(!messages.some(m=>m.text?.includes('weekly summary')));
    await mf.dispose();mf=create();failing=false;
    await mf.dispatchFetch('https://payo.test/test/tick?at='+(end+600000));
    const weekly=messages.filter(m=>m.text?.includes('weekly summary'));
    assert.equal(weekly.length,2);
    const owner=weekly.find(m=>String(m.chat_id)==='100000001'),other=weekly.find(m=>String(m.chat_id)==='123');
    assert(owner.text.includes('owner.example')&&!owner.text.includes('other.example'));
    assert(other.text.includes('other.example')&&!other.text.includes('owner.example'));
    assert(owner.text.includes('1/1008')&&owner.text.includes('100.00%'));
    await mf.dispatchFetch('https://payo.test/test/tick?at='+(end+1200000));
    assert.equal(messages.filter(m=>m.text?.includes('weekly summary')).length,2);
    assert.equal(probes,2,'weekly reporting must not issue extra endpoint probes');
  } finally {if(mf)await mf.dispose();await rm(fixture,{force:true});await rm(persisted,{recursive:true,force:true});}
});
