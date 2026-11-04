// A liveness check, not proof of successful scheduled checks or alert delivery.
try {
const origin=new URL(process.env.PAYO_APP_URL).origin;
const response=await fetch(origin+'/health',{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Worker health check failed.');
const health=await response.json();
if(health.ok!==true||health.reportTime!=='18:00'||health.reportTimezone!=='Asia/Tehran'||health.reportCron!=='30 14 * * *'||health.weeklyReportCron!=='30 20 * * THU'||health.weeklyReportTime!=='Friday 00:00'||health.weeklyReportTimezone!=='Asia/Tehran')throw new Error('The live Worker did not return the expected report schedule.');
console.log('Worker is reachable; daily and weekly report schedules match.');


} catch {console.error('Live Worker verification failed. Private URL details were suppressed.');process.exitCode=1;}
