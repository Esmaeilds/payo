// Telegram's official Mini Apps HMAC protocol. Never trust initDataUnsafe.
const enc = new TextEncoder();
async function hmac(key, data) {
  const imported = await crypto.subtle.importKey('raw', key, {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, enc.encode(data)));
}
export async function authenticate(initData, token, now=Date.now()) {
  if(!initData || initData.length>8192 || !token) throw new Error('Open Payo from Telegram to continue.');
  const params=new URLSearchParams(initData);
  if(new Set(params.keys()).size!==[...params.keys()].length)throw new Error('Invalid Telegram session.');
  const hash=params.get('hash');params.delete('hash');
  if(!/^[a-f0-9]{64}$/.test(hash||''))throw new Error('Invalid Telegram session.');
  const data=[...params.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=await hmac(enc.encode('WebAppData'),token);
  const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(hash.match(/../g),v=>parseInt(v,16));
  if(!await crypto.subtle.verify('HMAC',key,signature,enc.encode(data)))throw new Error('Invalid Telegram session.');
  const age=now/1000-Number(params.get('auth_date'));
  if(!params.get('auth_date')||!Number.isFinite(age)||age < -30 || age>86400)throw new Error('Session expired. Close and reopen Payo.');
  let user;try{user=JSON.parse(params.get('user'));}catch{}
  if(!Number.isSafeInteger(user?.id)||user.id<=0)throw new Error('Invalid Telegram user.');
  let photo_url=null;try{const photo=new URL(user.photo_url);if(photo.protocol==='https:')photo_url=photo.href;}catch{}
  return {id:user.id,first_name:String(user.first_name||'there').slice(0,80),photo_url};
}
