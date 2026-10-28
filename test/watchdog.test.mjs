import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
test('heartbeat stops on cycle failure; configuration stays private; delivery failure is visible',async()=>{
 const pings=[];let reject=false;
 const mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('../src/index.js',import.meta.url)),modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-07-30',bindings:{WATCHDOG_PING_URL:'https://hc-ping.com/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',OWNER_ID:'100000001',ADMIN_SECRET:'test-admin',WEBHOOK_SECRET:'test-hook',TELEGRAM_BOT_TOKEN:'test-token'},durableObjects:{DIRECTORY:{className:'Directory',useSQLite:true},REGISTRY:{className:'Registry',useSQLite:true},TARGETS:{className:'Target',useSQLite:true}},outboundService:async req=>{if(req.url.startsWith('https://api.telegram.org/'))return new Response(JSON.stringify({ok:true,result:{}}));pings.push({url:req.url,body:await req.text()});return new Response(reject?'not found':'OK');}});
 try {
  const ns=await mf.getDurableObjectNamespace('DIRECTORY'),dir=ns.get(ns.idFromName('users'));
  const url='https://hc-ping.com/12345678-1234-1234-1234-123456789abc';
  assert.equal((await dir.systemStatus()).watchdogConfigured,true,'secret binding connects the watchdog');
  await assert.rejects(()=>dir.configureWatchdog('https://attacker.example/'));
  await dir.configureWatchdog(url);await dir.recordCycle({ok:true,failedUsers:0});
  assert.equal(pings.length,1);assert.equal(pings[0].url,url);assert(!pings[0].body.includes('100000001'));
  const before=await dir.systemStatus();assert(before.lastSuccess);assert.equal(before.watchdogDelivery.ok,true);assert(!JSON.stringify(before).includes(url));
  await dir.recordCycle({ok:false,failedUsers:1});assert.equal(pings.length,1);assert.equal((await dir.systemStatus()).lastSuccess,before.lastSuccess);
  reject=true;await dir.recordCycle({ok:true,failedUsers:0});assert.equal((await dir.systemStatus()).watchdogDelivery.ok,false);
  assert.equal((await mf.dispatchFetch('https://payo.test/admin/system')).status,401);
  assert.equal((await mf.dispatchFetch('https://payo.test/admin/watchdog',{method:'POST',body:JSON.stringify({url})})).status,401);
  await mf.dispatchFetch('https://payo.test/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Bot-Api-Secret-Token':'test-hook'},body:JSON.stringify({update_id:1,message:{text:'/watchdog https://hc-ping.com/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',from:{id:123},chat:{id:123,type:'private'}}})});
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(await dir.systemRead('watchdogUrl'),url,'another account cannot replace the private watchdog');
  // Owner-only checks are evaluated before any configuration or system-state access.
  const response=await mf.dispatchFetch('https://payo.test/admin/system',{headers:{Authorization:'Bearer test-admin'}});assert.equal(response.status,200);assert(!(await response.text()).includes(url));
 } finally {await mf.dispose();}
});
