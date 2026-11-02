// A liveness check, not proof of successful scheduled checks or alert delivery.
const origin=new URL(process.env.PAYO_APP_URL).origin;
const response=await fetch(origin+'/health',{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Worker health check failed.');
const health=await response.json();
if(health.ok!==true||health.reportTime!=='18:00'||health.reportTimezone!=='Asia/Tehran'||health.reportCron!=='30 14 * * *')throw new Error('The live Worker did not return the expected report schedule.');
console.log('Worker is reachable and reports 18:00 Asia/Tehran.');

