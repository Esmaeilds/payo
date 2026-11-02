// Report missing setting names only. Never print their values in public CI logs.
export function validateDeploymentEnv(env) {
  const errors=[];
  if(!env.CLOUDFLARE_API_TOKEN?.trim())errors.push('CLOUDFLARE_API_TOKEN');
  if(!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID||''))errors.push('CLOUDFLARE_ACCOUNT_ID');
  if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(env.PAYO_WORKER_NAME||''))errors.push('PAYO_WORKER_NAME');
  if(!/^[1-9]\d*$/.test(env.PAYO_OWNER_ID||''))errors.push('PAYO_OWNER_ID');
  try {
    const u=new URL(env.PAYO_APP_URL);
    if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/app'||u.search||u.hash||u.port||u.hostname.includes('YOUR_'))throw new Error();
  } catch {errors.push('PAYO_APP_URL');}
  if(errors.length)throw new Error('Missing or invalid deployment secrets: '+errors.join(', '));
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){
  try{validateDeploymentEnv(process.env);console.log('Production settings validated.');}
  catch(error){console.error(error.message);process.exitCode=1;}
}

