import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const script=new URL('../scripts/cloudflare-usage.mjs',import.meta.url).href;
test('provider analytics helper redacts identifiers and fails closed on GraphQL errors',()=>{
 const env={...process.env,CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private-test-analytics-token'};
 const run=data=>spawnSync(process.execPath,['--input-type=module','-e',`globalThis.fetch=async()=>({ok:true,json:async()=>(${JSON.stringify(data)})});await import(${JSON.stringify(script)});`],{env,encoding:'utf8'});
 const ok=run({data:{viewer:{accounts:[{durableObjectsInvocationsAdaptiveGroups:[{dimensions:{date:'2026-01-01'},sum:{requests:123}}],durableObjectsPeriodicGroups:[],durableObjectsStorageGroups:[]}]}}});assert.equal(ok.status,0);assert(ok.stdout.includes('123'));assert(!ok.stdout.includes(env.CLOUDFLARE_ACCOUNT_ID));assert(!ok.stdout.includes(env.CLOUDFLARE_API_TOKEN));
 const bad=run({errors:[{message:env.CLOUDFLARE_API_TOKEN}]});assert.equal(bad.status,1);assert(!bad.stderr.includes(env.CLOUDFLARE_API_TOKEN));assert(!bad.stdout);
});
