const encoder=new TextEncoder();
export const defaults={expectedStatus:'200',recoveryAlerts:false,paused:false,maintenanceUntil:null,assertion:null};
export function normalizeSettings(input,old=defaults,now=Date.now()) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid monitor settings.');
  const out={...defaults,...old};
  if(Object.hasOwn(input,'expectedStatus')){
    if(typeof input.expectedStatus!=='string'||!/^([2-5]\d{2})(?:-([2-5]\d{2}))?$/.test(input.expectedStatus))throw new Error('Use one HTTP status or a range, such as 200 or 200-299.');
    const [a,b=a]=input.expectedStatus.split('-').map(Number);if(a>b||b-a>99)throw new Error('Status range must be ordered and no wider than 100 codes.');out.expectedStatus=input.expectedStatus;
  }
  for(const key of ['recoveryAlerts','paused'])if(Object.hasOwn(input,key)){if(typeof input[key]!=='boolean')throw new Error('Invalid toggle.');out[key]=input[key];}
  if(Object.hasOwn(input,'maintenanceUntil')){const value=input.maintenanceUntil;if(value!==null&&(!Number.isSafeInteger(value)||value<=now||value>now+7*86400000))throw new Error('Maintenance must end within the next seven days.');out.maintenanceUntil=value;}
  if(Object.hasOwn(input,'assertion')){
    const a=input.assertion;if(a===null)out.assertion=null;
    else if(a&&a.type==='contains'&&typeof a.value==='string'&&a.value.length>0&&a.value.length<=200)out.assertion={type:'contains',value:a.value};
    else if(a&&a.type==='json'&&typeof a.path==='string'&&/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+){0,9}$/.test(a.path)&&a.path.length<=200&&['string','number','boolean'].includes(typeof a.value)&&String(a.value).length<=200&&!(typeof a.value==='number'&&!Number.isFinite(a.value)))out.assertion={type:'json',path:a.path,value:a.value};
    else throw new Error('Choose a text match or a dot-separated JSON field with a scalar expected value.');
  }
  return out;
}
export function validateCredentials(input){
 const headers={};if(input.bearerToken){if(typeof input.bearerToken!=='string'||input.bearerToken.length>2048||/[\x00-\x1f\x7f]/.test(input.bearerToken))throw new Error('Invalid bearer token.');headers.Authorization='Bearer '+input.bearerToken;}
 if(input.headers!==undefined){if(!input.headers||typeof input.headers!=='object'||Array.isArray(input.headers)||Object.keys(input.headers).length>8)throw new Error('Use at most eight custom headers.');
 for(const [key,value] of Object.entries(input.headers)){if(!/^(x-[a-z0-9-]+|authorization|accept)$/i.test(key)||key.length>64||typeof value!=='string'||value.length>2048||/[\x00-\x1f\x7f]/.test(value))throw new Error('Only Authorization, Accept and X- headers are supported.');if(Object.keys(headers).some(k=>k.toLowerCase()===key.toLowerCase()))throw new Error('Duplicate authentication header.');headers[key]=value;}}
 if(JSON.stringify(headers).length>6000)throw new Error('Headers are too large.');return headers;
}
async function key(secret){if(!secret)throw new Error('Credential storage is unavailable.');const material=await crypto.subtle.importKey('raw',encoder.encode(secret),'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('payo-credentials-v1'),info:encoder.encode('monitor-header-encryption')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function seal(headers,secret,scope){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(scope)},await key(secret),encoder.encode(JSON.stringify(headers)));return {version:1,iv:b64(iv),data:b64(ciphertext)};}
export async function unseal(value,secret,scope){try{const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(value.iv),additionalData:encoder.encode(scope)},await key(secret),bytes(value.data));return JSON.parse(new TextDecoder().decode(plaintext));}catch{throw new Error('Stored credentials could not be opened. Re-enter them in monitor settings.');}}
export function matchesStatus(status,expected='200'){const [a,b=a]=expected.split('-').map(Number);return status>=a&&status<=b;}
export async function bodyMatches(response,assertion){
 const reader=response.body?.getReader();if(!reader)return false;let length=0,chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536)return false;chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const text=new TextDecoder().decode(bytes);
 if(assertion.type==='contains')return text.includes(assertion.value);
 try{let value=JSON.parse(text);for(const part of assertion.path.split('.')){if(value===null||typeof value!=='object'||!Object.hasOwn(value,part))return false;value=value[part];}return value===assertion.value;}catch{return false;}
}
export function monitoringMode(settings,now=Date.now()){return settings.paused?'paused':settings.maintenanceUntil>now?'maintenance':'active';}
