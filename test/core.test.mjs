import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eventText,dashboardSummary,normalizeUrl,probe,transition,INITIAL_URLS,periodKey,periodBounds,uptime,reportText,INTERVAL,classify,viewState,shouldAlert} from '../src/core.js';

test('new deployments start with an empty list',()=>{
  assert.deepEqual(INITIAL_URLS,[]);
});
test('normalize domain and preserve API path, reject credentials and private addresses',()=>{
  assert.equal(normalizeUrl('Example.com'),'https://example.com/');
  assert.equal(normalizeUrl('https://example.com/health?a=1#x'),'https://example.com/health?a=1');
  for(const url of ['file:///etc/passwd','https://a:b@example.com','http://127.0.0.1','https://x.local','http://2130706433','http://[::1]','https://example.com:8080']) assert.throws(()=>normalizeUrl(url));
});
test('strict HTTP 200 success with bounded redirects and timeout',async()=>{
  assert.equal((await probe('https://example.com',async()=>new Response('',{status:204}))).ok,false);
  assert.equal((await probe('https://example.com',async()=>new Response('',{status:200}))).ok,true);
  let calls=0;
  const ok=await probe('https://example.com',async()=>++calls===1?new Response(null,{status:302,headers:{location:'/login'}}):new Response('',{status:200}));
  assert.equal(ok.ok,true);assert.equal(calls,2);
  calls=0;
  assert.equal((await probe('https://example.com',async()=>{calls++;return new Response(null,{status:302,headers:{location:'/loop'}})})).ok,false);
  assert.equal(calls,4);
  const timeout=await probe('https://example.com',async(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')))),10);
  assert.equal(timeout.detail,'Response timed out');
});
test('one down event, no repeated outage alerts, then recovery duration',()=>{
  const first=transition({}, {ok:false,detail:'HTTP 503',ms:10},1000);
  assert.equal(first.event.kind,'down');
  const second=transition(first.next,{ok:false,detail:'HTTP 503',ms:10},2000);
  assert.equal(second.event,null);
  const third=transition(second.next,{ok:true,detail:'HTTP 200',ms:10},4000);
  assert.equal(third.event.kind,'up');assert.equal(third.event.duration,3000);
  assert.equal(transition(third.next,{ok:true,detail:'HTTP 200',ms:10},5000).event,null);
});

test('noon Tehran reporting window, interval and sample-based uptime',()=>{
  assert.equal(INTERVAL,10*60*1000);
  assert.equal(periodKey(Date.parse('2026-10-25T08:29:59Z')),'2026-10-24');
  assert.equal(periodKey(Date.parse('2026-10-25T08:30:00Z')),'2026-10-25');
  const {start,end}=periodBounds('2026-10-24');
  assert.equal(new Date(start).toISOString(),'2026-10-24T08:30:00.000Z');
  assert.equal(new Date(end).toISOString(),'2026-10-25T08:30:00.000Z');
  assert.equal(uptime(95,96),'98.96%');
  assert.equal(uptime(0,0),'No data');
  const text=reportText('2026-10-24',[{url:'https://a.example',up:1,total:2,outages:1},{url:'https://b.example',up:0,total:0,outages:0}]);
  assert(text.includes('50.00%'));assert(text.includes('No data'));assert(text.includes('144'));
});

test('all HTTP families and transport failures have distinct severity',()=>{
  assert.equal(classify(200).icon,'🟢');
  for(let status=100;status<=599;status++) {
    const result=classify(status);
    assert(result.icon);assert(result.severity);assert(result.label);
    assert.equal(result.receivedHTTP,true);
    assert.notEqual(result.icon,'🔴','HTTP response must never be shown as no HTTP response');
    assert.equal(result.ok,status===200);
  }
  for(const code of [201,202,204,206])assert.equal(classify(code).icon,'🔵');
  for(const code of [301,302,304,401,403,404,405,451,530])assert.equal(classify(code).icon,'🟡');
  for(const code of [408,429,500,502,503,504,520,521,522,523,524,525,526])assert.equal(classify(code).icon,'🟠');
  for(const reason of ['timeout','dns','tls','network'])assert.equal(classify(null,reason).icon,'🔴');
  assert.equal(classify(null,'redirect').icon,'🟡');
  assert.equal(viewState({status:'down',detail:'HTTP 403'}).icon,'🟡','old persisted status migrates without becoming a fake outage');
});
test('severity changes notify, same category does not spam, and recovery is green',()=>{
  let state=transition({}, {...classify(403),ms:1},1000);
  assert.equal(state.event.icon,'🟡');
  assert.equal(transition(state.next,classify(530),2000).event,null);
  state=transition(state.next,classify(503),3000);assert.equal(state.event.icon,'🟠');
  state=transition(state.next,classify(null,'timeout'),4000);assert.equal(state.event.icon,'🔴');
  state=transition(state.next,classify(200),5000);assert.equal(state.event.kind,'up');
});

test('all generated status, alert and report text is English',()=>{
  for(let status=100;status<=599;status++)assert(!/[\u0600-\u06ff]/.test(JSON.stringify(classify(status))));
  assert(!/[\u0600-\u06ff]/.test(reportText('2026-10-24',[{url:'https://api.example/health',total:1,up:1,outages:0}])));
});
test('branding never introduces invalid characters into HTTP headers',async()=>{
  const result=await probe('https://example.com/',async(url,options)=>{
    const request=new Request(url,options);
    assert.match(request.headers.get('User-Agent'),/^[\x20-\x7e]+$/);
    return new Response('',{status:200});
  });
  assert.equal(result.ok,true);
});

test('only orange and red generate alerts, never blue, yellow or green recovery',()=>{
  for(const [response,wanted] of [[classify(200),false],[classify(204),false],[classify(403),false],[classify(530),false],[classify(503),true],[classify(null,'timeout'),true]]) {
    const {next,event}=transition({},response,1000);
    assert.equal(shouldAlert(event,next),wanted);
    assert.equal(shouldAlert(null,next),false,'unchanged category does not repeat');
  }
  const down=transition({},classify(null,'timeout'),1000);
  const recovered=transition(down.next,classify(200),2000);
  assert.equal(shouldAlert(recovered.event,recovered.next),false);
  const changed=transition(down.next,classify(503),2000);
  assert.equal(shouldAlert(changed.event,changed.next),true);
});

test('dashboard gauge averages addresses equally and excludes unobserved monitors',()=>{
 assert.deepEqual(dashboardSummary([]),{total:0,healthy:0,observed:0,averageUptime:null});
 const result=dashboardSummary([{category:'healthy',stats:{up:1,total:1}},{category:'unreachable',stats:{up:0,total:9}},{category:'unknown',stats:{up:0,total:0}}]);
 assert.deepEqual(result,{total:3,healthy:1,observed:2,averageUptime:50});
 assert.equal(dashboardSummary([{category:'unreachable',stats:{up:0,total:2}}]).averageUptime,0);
});

test('alert copy identifies response vs transport failure and Tehran detection time',()=>{
 const e={kind:'down',at:Date.parse('2026-10-27T00:00:00Z'),category:'unreachable',detail:'Response timed out'};
 const red=eventText('https://example.com/',e);
 assert.match(red,/🔴 Payo · No response/);assert.match(red,/No response after 3 attempts/);assert.match(red,/Last error: Response timed out/);assert.match(red,/03:30:00/);assert.match(red,/Tehran/);
 const orange=eventText('https://example.com/',{...e,category:'error',detail:'HTTP 503 — Service Unavailable'});
 assert.match(orange,/🟠 Payo · Service disruption/);assert.match(orange,/Response: HTTP 503/);assert(!orange.includes('3 attempts'));assert(!orange.includes('Priority:'));
});
