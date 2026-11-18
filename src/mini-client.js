export const miniClient = String.raw`
import {settingsPanel} from "/app/settings-ui.js";
import {historyPanel} from "/app/history-ui.js";
import {themeTokens} from "/app/theme.js";
import {ICONS} from "/app/icons.js?v=content-hash-1";
const $=id=>document.getElementById(id), tg=window.Telegram?.WebApp;
let snapshot,removing,busy=false,toastTimer;
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
 const dark=tg?.colorScheme?tg.colorScheme==='dark':systemTheme.matches;
 const root=document.documentElement;root.dataset.theme=dark?'dark':'light';
 const colors=themeTokens(tg?.themeParams||{},dark);
 for(const [k,v] of Object.entries(colors))root.style.setProperty(k,v);
 document.querySelector('meta[name="theme-color"]').content=colors['--bg'];
 try{tg?.setHeaderColor(colors['--header']);tg?.setBackgroundColor(colors['--bg']);if(tg?.isVersionAtLeast?.('7.10'))tg.setBottomBarColor(colors['--bg']);}catch{}
}
try{tg?.ready();tg?.expand();tg?.onEvent('themeChanged',applyTheme);}catch{}
systemTheme.addEventListener('change',applyTheme);applyTheme();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function svgIcon(name){const key=Object.hasOwn(ICONS,name)?name:'help',icon=el('span',undefined,'icon');icon.setAttribute('aria-hidden','true');const image='url("/app/icons/'+key+'.svg?v='+ICONS[key]+'")';icon.style.maskImage=image;icon.style.webkitMaskImage=image;if(key==='refresh')icon.style.transform='rotate(20deg)';return icon;}

$('headerTour').replaceChildren(svgIcon('help'));
$('detailClose').replaceChildren(svgIcon('close'));
$('detailClose').onclick=()=>$('monitorDialog').close();
for(const detail of document.querySelectorAll('.guide-card details')){const summary=detail.querySelector('summary'),label=el('span',summary.textContent,'status-title'),arrow=svgIcon('chevron');arrow.classList.add('accordion-arrow');const affordance=el('span',undefined,'accordion-affordance');affordance.append(arrow);summary.replaceChildren(label,affordance);detail.addEventListener('toggle',()=>{if(detail.open)for(const other of document.querySelectorAll('.guide-card details'))if(other!==detail)other.open=false;});}
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
async function api(action,extra={}){
 const r=await fetch('/app/api',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'tma '+(tg?.initData||'')},body:JSON.stringify({action,...extra})});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not connect. Try again.');return d;
}
const labels={healthy:'Healthy',notice:'Notice',warning:'Warning',error:'Service disruption',unreachable:'No response',unknown:'Not checked'};
const attention=r=>r.monitoringMode!=='paused'&&r.monitoringMode!=='maintenance'&&(r.configurationError||['error','unreachable'].includes(r.category));
let filtered=false;
function status(r){
 if(r.monitoringMode==='paused')return 'Paused';
 if(r.monitoringMode==='maintenance')return 'Maintenance';
 if(r.configurationError)return 'Configuration issue';
 if(r.pendingAttempts)return 'Retrying…';
 return labels[r.category]||'Not checked';
}
function checked(r){return r.checkedAt?'Checked '+new Date(r.checkedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Awaiting first check';}
function showHelp(show){
 $('learn').classList.toggle('hidden',!show);
 $('home').classList.toggle('hidden',show);
 syncBack();
}
function syncBack(){
 const nested=document.querySelector('dialog[open]')||!$('learn').classList.contains('hidden');
 if(nested)tg?.BackButton?.show();else tg?.BackButton?.hide();
}
tg?.BackButton?.onClick(()=>{const dialog=document.querySelector('dialog[open]');if(dialog)dialog.close();else showHelp(false);});
new MutationObserver(syncBack).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
$('headerTour').onclick=()=>showHelp(true);
$('helpBack').onclick=()=>showHelp(false);

function siteIcon(r){
 const url=new URL(r.url),node=el('span',url.hostname.slice(0,1).toUpperCase(),'domain-icon');
 node.setAttribute('aria-hidden','true');
 if(r.favicon){const img=el('img',undefined,'favicon');img.alt='';img.onerror=()=>{node.textContent=url.hostname.slice(0,1).toUpperCase();};img.src=r.favicon;node.replaceChildren(img);}
 return node;
}
function openMonitor(r){
 const dialog=$('monitorDialog'),body=$('monitorDetail'),url=new URL(r.url);
 $('monitorTitle').textContent=url.hostname;
 const menu=el('details',undefined,'monitor-menu'),more=el('summary','•••');
 more.setAttribute('aria-label','Monitor actions');
 const edit=el('button','Edit monitor'),remove=el('button','Remove monitor','remove');
 menu.append(more,edit,remove);
 remove.onclick=()=>{removing=r.id;$('removeUrl').textContent=r.url;dialog.close();$('removeDialog').showModal();};
 edit.onclick=async()=>{menu.open=false;const slot=el('div','Loading settings…');body.replaceChildren(slot);slot.replaceChildren(await settingsPanel(api,r.id,async()=>{dialog.close();await load();toast('Settings saved.');}));};
 body.replaceChildren(el('p',url.pathname+url.search,'path'),el('strong',status(r)),el('p',r.configurationError||r.detail||'', 'note'),el('p',checked(r),'note'),menu,historyPanel(api,[r],r.id));
 dialog.showModal();dialog.scrollTop=0;
}
function render(){
 const rows=snapshot.targets,list=$('list'),count=rows.filter(attention).length;
 if(!count)filtered=false;
 const filter=$('attention');filter.textContent=snapshot.summary.healthy+' healthy · '+count+' need attention';filter.disabled=!count;filter.setAttribute('aria-pressed',String(filtered));
 list.replaceChildren();
 if(!rows.length)list.append(el('p','Add a website or API to start monitoring.'));
 for(const r of filtered?rows.filter(attention):rows){
  const url=new URL(r.url),card=el('article',undefined,'monitor-row'),row=el('button',undefined,'row monitor-open');
  const name=el('div',undefined,'url'),side=el('div',undefined,'monitor-side');
  name.append(el('strong',url.hostname),el('small',url.pathname+url.search,'path'));
  const badge=el('strong',status(r),'result-label');badge.dataset.category=r.configurationError?'error':r.monitoringMode==='active'?r.category:'unknown';
  side.append(badge,el('small',checked(r)));
  row.append(siteIcon(r),name,side,svgIcon('chevron'));row.onclick=()=>openMonitor(r);card.append(row);list.append(card);
 }
 $('usage').hidden=!snapshot.isOwner;
}
$('attention').onclick=()=>{filtered=!filtered;render();};
$('usage').onclick=async()=>{
 const body=$('monitorDetail'),slot=el('div','Loading usage…');body.replaceChildren(slot);$('monitorTitle').textContent='System usage';$('monitorDialog').showModal();
 try{const u=await api('usage');slot.replaceChildren(el('p',u.targets+' monitors · '+u.active+' active users · '+u.users+' registered'));for(const d of u.daily)slot.append(el('p',new Date(d.day*86400000).toISOString().slice(0,10)+' UTC · '+d.checks+' checks · '+d.attempts+' attempts'));slot.append(el('p',u.note));}catch(e){slot.textContent=e.message;}
};
async function load(){
 snapshot=await api('dashboard');renderProfile();render();$('notice').classList.add('hidden');$('connected').classList.remove('hidden');
}
function renderProfile(){
 const user=snapshot.user,avatar=$('userAvatar');$('profileName').textContent=user.first_name;avatar.replaceChildren();avatar.textContent=user.first_name.slice(0,1).toUpperCase();
 if(user.photo_url){const img=el('img');img.width=44;img.height=44;img.src=user.photo_url;img.alt='Your Telegram profile photo';img.referrerPolicy='no-referrer';img.onerror=()=>{avatar.replaceChildren();avatar.textContent=user.first_name.slice(0,1).toUpperCase();};avatar.replaceChildren(img);}
}
function openAdd(){$('formError').textContent='';$('addDialog').showModal();if(matchMedia('(pointer:fine)').matches)$('url').focus();}
$('add').onclick=openAdd;$('cancel').onclick=()=>$('addDialog').close();$('keep').onclick=()=>$('removeDialog').close();
$('refresh').onclick=async()=>{if(busy)return;busy=true;$('refresh').disabled=true;try{await load();toast('Latest results loaded.');}catch(e){toast(e.message);}finally{busy=false;$('refresh').disabled=false;}};
$('addForm').onsubmit=async e=>{e.preventDefault();$('save').disabled=true;$('save').textContent='Adding…';try{const result=await api('add',{url:$('url').value});await load();$('addDialog').close();$('url').value='';toast(result.message);}catch(e){$('formError').textContent=e.message;$('url').focus();}finally{$('save').disabled=false;$('save').textContent='Add monitor';}};
$('confirmRemove').onclick=async()=>{$('confirmRemove').disabled=true;try{const result=await api('remove',{id:removing});$('removeDialog').close();await load();toast(result.message);}catch(e){toast(e.message);}finally{$('confirmRemove').disabled=false;}};
if(!tg?.initData){$('notice').replaceChildren(el('h3','Let’s launch your dashboard'),el('p','Close this window and tap App beside the message field in the bot. If the button is missing, send /start once to refresh it.'));const link=el('a','Launch @PayoWatchBot');link.href='https://t.me/PayoWatchBot?start=dashboard';link.style.color='var(--accent)';$('notice').append(link);}else {$('connected').classList.remove('hidden');if(new URL(location.href).searchParams.get('tab')==='learn')showHelp(true);load().catch(e=>{$('notice').replaceChildren(el('p',e.message,'error'));const b=el('button','Try again');b.onclick=()=>load().catch(e=>toast(e.message));$('notice').append(b);});}
`;
