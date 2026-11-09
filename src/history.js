import {INTERVAL,DAY} from './core.js';
export function historyView(raw,hourly,range,now,state={}) {
  const days=range==='24h'?1:range==='7d'?7:30,start=now-days*DAY;
  const slotStart=Math.floor(start/INTERVAL)+1,slotEnd=Math.floor(now/INTERVAL);
  const samples=raw.filter(r=>r.slot>=slotStart&&r.slot<=slotEnd);
  const buckets=hourly.filter(r=>r.hour*3600000>=Math.ceil(start/3600000)*3600000&&r.hour*3600000+3600000<=now);
  const rows=range==='24h'?samples:buckets;
  const total=rows.reduce((n,r)=>n+(r.total??1),0),up=rows.reduce((n,r)=>n+(r.up??(r.category==='healthy'?1:0)),0);
  const responseCount=rows.reduce((n,r)=>n+(r.response_count??(r.ms===null?0:1)),0);
  const responseSum=rows.reduce((n,r)=>n+(r.response_sum??(r.ms||0)),0);
  const points=range==='24h'?Array.from({length:slotEnd-slotStart+1},(_,i)=>{const slot=slotStart+i,r=samples.find(r=>r.slot===slot);return {at:slot*INTERVAL,ms:r?.ms??null,max:r?.ms??null,category:r?.category||'missing',http:r?.http??null,attempts:r?.attempts??0};}):Array.from({length:Math.max(0,Math.floor(now/3600000)-Math.ceil(start/3600000))},(_,i)=>{const hour=Math.ceil(start/3600000)+i,r=buckets.find(r=>r.hour===hour);return {at:hour*3600000,ms:r?.response_count?r.response_sum/r.response_count:null,max:r?.response_count?r.response_max:null,total:r?.total||0};});
  const recentStart=Math.floor(now/INTERVAL)-29;
  const recent=Array.from({length:30},(_,i)=>{const slot=recentStart+i,r=raw.find(r=>r.slot===slot);return {at:slot*INTERVAL,category:r?.category||'missing',http:r?.http??null,ms:r?.ms??null,attempts:r?.attempts??0};});
  // Do not bridge missing observations or claim exact outage start/end times.
  const incidents=[];let incident=null,previousSlot=null;
  for(const r of raw){
    if(previousSlot!==null&&r.slot!==previousSlot+1)incident=null;
    if(['error','unreachable'].includes(r.category)){
      if(!incident||incident.category!==r.category){if(incident)incident.end=r.at;incident={start:r.at,end:null,lastObserved:r.at,category:r.category,http:r.http,reason:r.reason,ongoing:false};incidents.push(incident);}
      else incident.lastObserved=r.at;
    }else if(incident){incident.end=r.at;incident=null;}
    previousSlot=r.slot;
  }
  if(incident&&previousSlot>=slotEnd-1)incident.ongoing=true;
  return {range,start,end:now,summary:{total,up,uptime:total?100*up/total:null,averageMs:responseCount?responseSum/responseCount:null,expected:range==='24h'?slotEnd-slotStart+1:points.length*6},points,recent,incidents:incidents.filter(r=>r.lastObserved>=start).reverse().slice(0,50),latest:{at:state.checkedAt||null,ms:state.receivedHTTP?state.ms:null},resolution:range==='24h'?'10-minute observations':'Complete UTC hours: mean and maximum response time',retention:'Detailed checks: 7 days. Hourly summaries: 30 days. History starts when enabled; missing checks are never assumed healthy.'};
}
