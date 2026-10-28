import {createHmac} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {periodKey} from '../src/core.js';

test('Workers runtime: private access, seed, retries, outbox, dynamic list and persisted state',async()=>{
  const saved=await mkdtemp(join(tmpdir(),'poyo-test-'));
  const messages=[];const calls=new Map();const retryTimes=new Map();let failed='';let telegramFails=false;
  function create() {return new Miniflare({
    modules:true,scriptPath:fileURLToPath(new URL('../src/index.js',import.meta.url)),
    modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-07-30',
    bindings:{APP_URL:'https://payo.example/app',OWNER_ID:'100000001',ADMIN_SECRET:'test-admin',WEBHOOK_SECRET:'test-hook',TELEGRAM_BOT_TOKEN:'test-token'},
    durableObjects:{DIRECTORY:{className:'Directory',useSQLite:true},REGISTRY:{className:'Registry',useSQLite:true},TARGETS:{className:'Target',useSQLite:true}},
    durableObjectsPersist:saved,
    outboundService:async req=>{
      if(req.url.startsWith('https://api.telegram.org/')) {
        if(telegramFails)return new Response(JSON.stringify({ok:false}),{status:503});
        messages.push(await req.json());return new Response(JSON.stringify({ok:true,result:{}}));
      }
      calls.set(req.url,(calls.get(req.url)||0)+1);
      if(req.url.includes('retry-')){
        const times=retryTimes.get(req.url)||[];times.push(Date.now());retryTimes.set(req.url,times);
        if(req.url.includes('retry-fail')||req.url.includes('retry-remove')||(req.url.includes('retry-recover')&&times.length===1))return new Promise(resolve=>setTimeout(()=>resolve(new Response('',{status:200})),8500));
      }
      const matched=req.url.match(/case(201|403|530|503)\.example/);
      return new Response('',{status:matched?Number(matched[1]):req.url===failed?503:200});
    },
  });}
  let mf=create();
  const admin=(path,method='GET',body)=>mf.dispatchFetch(`https://poyo.test/admin/${path}`,{method,headers:{Authorization:'Bearer test-admin','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  let update=0;
  async function webhook(text,from=100000001,hook='test-hook') {
    const r=await mf.dispatchFetch('https://poyo.test/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':hook},body:JSON.stringify({update_id:++update,message:{text,from:{id:from},chat:{id:from,type:'private'}}})});
    // An authenticated no-op request waits behind persisted command work when needed.
    await new Promise(resolve=>setTimeout(resolve,150));return r;
  }
  try {
    assert.equal((await mf.dispatchFetch('https://poyo.test/admin/status')).status,401);
    assert.equal((await webhook('/list',100000001,'wrong')).status,401);
    await admin('setup','POST');
    for(let i=0;i<10;i++) await webhook(`/add https://seed${i}.example/`);
    let data=await (await admin('status')).json();assert.equal(data.length,10);
    // RPC is exercised inside workerd via admin endpoints rather than fake storage.
    failed=data[0].url;
    telegramFails=true;await admin('check','POST');
    data=await (await admin('status')).json();assert.equal(data[0].status,'warning');assert.equal(calls.get(failed),1);
    telegramFails=false;await admin('check','POST');
    assert.equal(messages.filter(m=>m.text?.includes('🟠')).length,1,'failed alert is retried from persistent outbox');
    await admin('check','POST');assert.equal(messages.filter(m=>m.text?.includes('🟠')).length,1);
    assert.equal(calls.get(failed),1,'manual checks share the same ten-minute allowance');
    await webhook('/start',123);
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.text?.includes('10 minutes')));
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.reply_markup?.inline_keyboard?.some(row=>row.some(b=>b.web_app?.url.endsWith('/app')))),'start offers an inline Web App button with Telegram identity support');
    assert(messages.some(m=>m.menu_button?.type==='web_app'&&m.menu_button.text==='App'),'native Launch menu opens the authenticated Mini App directly');
    assert(!messages.some(m=>m.reply_markup?.keyboard?.some(row=>row.includes('⚡ Launch Payo'))),'remove extra-step launch entry from the reply keyboard');
    assert(!messages.some(m=>m.reply_markup?.keyboard?.some(row=>row.some(b=>typeof b==='object'&&b.web_app))),'reply keyboard must not launch unauthenticated Web Apps');
    await webhook('/stats',123);
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.text?.includes('only available to the bot owner')));
    await webhook('/stats');
    assert(messages.some(m=>String(m.chat_id)==='100000001'&&m.text?.includes('Total users: 2')&&m.text?.includes('Active users: 1')&&m.text?.includes('Total URLs & APIs — all users: 10')));
    assert(!messages.some(m=>String(m.chat_id)==='123'&&m.text?.includes('Bot stats')));
    await webhook('/app',123);
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.text?.includes('private dashboard')&&m.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app),'app command launches through inline button');
    await webhook('/learn',123);
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.reply_markup?.inline_keyboard?.some(row=>row.some(b=>b.callback_data==='learn:colors'))),'public user can open the separate learning menu');
    for(const topic of ['colors','reports','alerts']) {
      await mf.dispatchFetch('https://poyo.test/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'test-hook'},body:JSON.stringify({update_id:++update,callback_query:{id:`learn-${topic}`,data:`learn:${topic}`,from:{id:123},message:{chat:{id:123,type:'private'}}}})});
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    const lessons=messages.filter(m=>String(m.chat_id)==='123').map(m=>m.text||'');
    assert(lessons.some(t=>t.includes('🟠 Service disruption')));
    assert(lessons.some(t=>t.includes('143 successful checks out of 144 = 99.31%')));
    assert(lessons.some(t=>t.includes('Same color: no repeated alerts.')));
    await webhook('/add https://other-user.example/',123);
    await webhook('/list',123);
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.text?.includes('other-user.example')));
    assert(!messages.filter(m=>String(m.chat_id)==='123').some(m=>m.text?.includes('seed0.example')));
    assert.equal((await (await admin('status')).json()).length,10,'other user cannot change owner list');
    failed='https://other-user.example/';
    await webhook('/check',123);
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.text?.includes('🟠')&&m.text.includes('other-user.example')),'outage alert goes to the target owner');
    assert.equal(messages.filter(m=>String(m.chat_id)==='100000001'&&m.text?.includes('🟠')).length,1,'other user alerts do not leak to owner');
    for(let i=0;i<16;i++)await webhook(`/add https://site${i}.example/`,123);
    await webhook('/list',123);
    assert(messages.some(m=>String(m.chat_id)==='123'&&m.text?.includes('My URLs & APIs (17)')),'no per-user address cap');
    await webhook('/add https://new.example/health');
    data=await (await admin('status')).json();assert.equal(data.length,11);
    assert(data.some(t=>t.url==='https://new.example/health'));
    await webhook('/add https://delete.example/');
    data=await (await admin('status')).json();
    const temporary=data.find(t=>t.url==='https://delete.example/');
    async function callback(prefix){
      await mf.dispatchFetch('https://poyo.test/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'test-hook'},body:JSON.stringify({update_id:++update,callback_query:{id:`callback-${update}`,data:`${prefix}:${temporary.id}`,from:{id:100000001},message:{chat:{id:100000001,type:'private'}}}})});
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    await mf.dispatchFetch('https://poyo.test/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'test-hook'},body:JSON.stringify({update_id:++update,callback_query:{id:'foreign-delete',data:`confirm:${temporary.id}`,from:{id:123},message:{chat:{id:123,type:'private'}}}})});
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal((await (await admin('status')).json()).length,12,'foreign callback cannot delete owner URL');
    await callback('delete');
    assert.equal((await (await admin('status')).json()).length,12,'delete requires confirmation');
    await callback('confirm');
    assert.equal((await (await admin('status')).json()).length,11,'confirmation removes the URL');
    const key=periodKey(Date.now());
    const rows=await (await admin('report','POST',{key,preview:true})).json();
    assert.equal(rows.reduce((n,r)=>n+r.total,0),10);
    assert.equal(rows.reduce((n,r)=>n+r.up,0),9);
    assert.equal(rows.reduce((n,r)=>n+r.outages,0),1);
    assert(!rows.some(r=>r.url.includes('other-user.example')));
    telegramFails=true;await admin('report','POST',{key});
    telegramFails=false;await admin('report','POST',{key});
    await admin('report','POST',{key});
    assert.equal(messages.filter(m=>String(m.chat_id)==='100000001'&&m.text?.includes('daily summary')).length,1,'daily summary retries then deduplicates');
    await mf.dispose();mf=create();
    data=await (await admin('status')).json();assert.equal(data.length,11);assert.equal(data[0].status,'warning');
    await webhook('/status');assert(messages.some(m=>m.text?.includes('Latest status')));
    await admin('report','POST',{key});
    assert.equal(messages.filter(m=>String(m.chat_id)==='100000001'&&m.text?.includes('daily summary')).length,1,'report deduplication survives restart');
    for(const code of [201,403,530,503])await webhook(`/add https://case${code}.example/`,456);
    await webhook('/check',456);
    const alerts=messages.filter(m=>String(m.chat_id)==='456'&&/^[🟠🔴]/u.test(m.text||''));
    assert.equal(alerts.length,1,'only the orange target creates an alert');
    assert(alerts[0].text.includes('case503.example'));
    for(const code of [201,403,530,503])assert.equal(calls.get(`https://case${code}.example/`),1,'one request per check without retry');
    // Real Worker boundary: signed Telegram identities, isolated lists and mutations.
    function auth(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Test'})});const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const key=createHmac('sha256','WebAppData').update('test-token').digest();p.set('hash',createHmac('sha256',key).update(data).digest('hex'));return 'tma '+p;}
    const mini=(id,body)=>mf.dispatchFetch('https://poyo.test/app/api',{method:'POST',headers:{Authorization:auth(id),'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await mf.dispatchFetch('https://poyo.test/app')).status,200);
    assert.equal((await mf.dispatchFetch('https://poyo.test/app/api',{method:'POST',body:'{}'})).status,401);
    let dashboard=await (await mini(123,{action:'dashboard',userId:100000001})).json();
    assert.equal(dashboard.user.id,123);assert.equal(dashboard.summary.total,17);assert.equal(dashboard.targets.length,17);assert(!dashboard.targets.some(t=>t.url.includes('seed0')));
    assert.equal(dashboard.onboardingComplete,false);
    await mini(123,{action:'onboard'});
    assert.equal((await (await mini(123,{action:'dashboard'})).json()).onboardingComplete,true);
    assert.equal((await (await mini(789,{action:'dashboard'})).json()).onboardingComplete,false,'onboarding completion is private to each user');
    const foreign=(await (await admin('status')).json())[0];
    await mini(123,{action:'remove',id:foreign.id});
    assert((await (await admin('status')).json()).some(t=>t.id===foreign.id));
    assert.equal((await mini(789,{action:'add',url:'https://mini.example/health'})).status,200);
    dashboard=await (await mini(789,{action:'dashboard'})).json();assert.equal(dashboard.targets.length,1);assert.equal(dashboard.targets[0].category,'unknown');
    assert.equal((await mini(789,{action:'remove',id:dashboard.targets[0].id})).status,200);
    assert.equal((await (await mini(789,{action:'dashboard'})).json()).targets.length,0);
    for(const name of ['fail','recover','remove'])await mini(987,{action:'add',url:'https://retry-'+name+'.example/'});
    await webhook('/check',987);
    let retries;const initialDeadline=Date.now()+10000;
    do{await new Promise(resolve=>setTimeout(resolve,250));retries=await (await mini(987,{action:'dashboard'})).json();}while(retries.targets.some(t=>!t.pendingAttempts)&&Date.now()<initialDeadline);
    assert(retries.targets.every(t=>t.pendingAttempts===1));
    assert(retries.targets.every(t=>t.stats.total===0),'intermediate attempts are not uptime samples');
    assert(!messages.some(m=>String(m.chat_id)==='987'&&m.text?.startsWith('🔴')),'no early red alert');
    await mini(987,{action:'remove',id:retries.targets.find(t=>t.url.includes('retry-remove')).id});
    await mf.dispose();mf=create();
    const deadline=Date.now()+45000;
    do{await new Promise(resolve=>setTimeout(resolve,1000));retries=await (await mini(987,{action:'dashboard'})).json();}while(retries.targets.some(t=>t.pendingAttempts)&&Date.now()<deadline);
    assert.equal(calls.get('https://retry-fail.example/'),3,'two durable retries survive restart');
    assert.equal(calls.get('https://retry-recover.example/'),2,'HTTP response stops retries');
    assert.equal(calls.get('https://retry-remove.example/'),1,'removal cancels retry alarms');
    assert.equal(messages.filter(m=>String(m.chat_id)==='987'&&m.text?.startsWith('🔴')).length,1);
    assert(retries.targets.every(t=>t.stats.total===1),'one final sample per cycle');
    assert.equal(retries.targets.find(t=>t.url.includes('retry-recover')).stats.up,1);
    const times=retryTimes.get('https://retry-fail.example/');assert(times[1]-times[0]>=17900);assert(times[2]-times[1]>=17900);
    await webhook('/check',987);assert.equal(calls.get('https://retry-fail.example/'),3,'same interval cannot restart retries');


  } finally {await mf.dispose();await rm(saved,{recursive:true,force:true});}
});
