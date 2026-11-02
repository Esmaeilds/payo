import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {periodKey,periodBounds} from '../src/core.js';

test('18:00 Tehran boundary, year rollover and cron agree',async()=>{
  assert.equal(periodKey(Date.parse('2026-12-31T14:29:59Z')),'2026-12-30');
  assert.equal(periodKey(Date.parse('2026-12-31T14:30:00Z')),'2026-12-31');
  assert.equal(periodKey(Date.parse('2027-01-01T14:29:59Z')),'2026-12-31');
  const {start,end}=periodBounds('2026-12-31');
  assert.equal(end-start,86400000);
  assert.equal(new Date(end).toISOString(),'2027-01-01T14:30:00.000Z');
  const config=await readFile(new URL('../cloudflare.config.ts',import.meta.url),'utf8');
  assert(config.includes("schedule:'30 14 * * *'"));
  assert(!config.includes("schedule:'30 8 * * *'"));
});

test('legacy noon counters and delivery markers do not pollute evening reports',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'payo-report-migration-'));
  const fixture=new URL(`../.report-fixture-${process.pid}.js`,import.meta.url);
  const key=periodKey(Date.now()),messages=[];
  await writeFile(fixture,`
    import worker,{Directory,Registry as BaseRegistry,Target as BaseTarget} from './src/index.js';
    export {Directory};
    export class Registry extends BaseRegistry {
      legacy(key){
        this.initialize('100000001');
        this.sql.exec("INSERT OR REPLACE INTO meta VALUES ('reports_begin',?)",key);
        this.sql.exec("INSERT OR REPLACE INTO meta VALUES (?,?)",'report:'+key,'queued');
        this.sql.exec("INSERT INTO targets VALUES (?,?)",'legacy-target','https://example.com/');
      }
    }
    export class Target extends BaseTarget {
      legacy(key){
        this.configure('https://example.com/','100000001');
        this.sql.exec('CREATE TABLE daily (period TEXT PRIMARY KEY,total INTEGER,up INTEGER,outages INTEGER)');
        this.sql.exec('INSERT INTO daily VALUES (?,143,143,0)',key);
      }
      legacyTotal(){return this.sql.exec('SELECT total FROM daily').toArray()[0].total;}
    }
    export default {async fetch(req,env,ctx){
      if(new URL(req.url).pathname==='/test/legacy'){
        await env.REGISTRY.getByName('100000001').legacy(${JSON.stringify(key)});
        await env.TARGETS.getByName('100000001:legacy-target').legacy(${JSON.stringify(key)});
        return new Response('OK');
      }
      if(new URL(req.url).pathname==='/test/retained')return Response.json(await env.TARGETS.getByName('100000001:legacy-target').legacyTotal());
      return worker.fetch(req,env,ctx);
    }};
  `);
  const create=()=>new Miniflare({modules:true,scriptPath:fileURLToPath(fixture),modulesRules:[{type:'ESModule',include:['**/*.js']}],compatibilityDate:'2026-07-30',durableObjectsPersist:folder,
    bindings:{OWNER_ID:'100000001',APP_URL:'https://payo.example/app',ADMIN_SECRET:'test-admin',TELEGRAM_BOT_TOKEN:'test-token',WEBHOOK_SECRET:'test-hook'},
    durableObjects:{DIRECTORY:{className:'Directory',useSQLite:true},REGISTRY:{className:'Registry',useSQLite:true},TARGETS:{className:'Target',useSQLite:true}},
    outboundService:async req=>{if(req.url.startsWith('https://api.telegram.org/')){messages.push(await req.json());return Response.json({ok:true,result:{}});}return new Response('OK');}});
  let mf;
  const admin=(path,body)=>mf.dispatchFetch('https://payo.test/admin/'+path,{method:'POST',headers:{Authorization:'Bearer test-admin','Content-Type':'application/json'},body:JSON.stringify(body||{})});
  try{
    mf=create();
    assert.equal((await mf.dispatchFetch('https://payo.test/test/legacy')).status,200);
    assert.equal((await admin('check')).status,200);
    const rows=await (await admin('report',{key,preview:true})).json();
    assert.equal(rows.length,1);assert.equal(rows[0].total,1);assert.equal(rows[0].up,1);
    assert.equal(await (await mf.dispatchFetch('https://payo.test/test/retained')).json(),143);
    await admin('report',{key});
    assert.equal(messages.filter(m=>m.text?.includes('daily summary')).length,1);
    await mf.dispose();mf=create();
    await admin('report',{key});
    assert.equal(messages.filter(m=>m.text?.includes('daily summary')).length,1);
  } finally {if(mf)await mf.dispose();await rm(fixture,{force:true});await rm(folder,{recursive:true,force:true});}
});
