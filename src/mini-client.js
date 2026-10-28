export const miniClient = String.raw`
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

for(const [id,name] of Object.entries({add:'plus',refresh:'refresh'}))$(id).querySelector('span').replaceChildren(svgIcon(name));
$('detailClose').replaceChildren(svgIcon('close'));$('detailClose').onclick=()=>$('monitorDialog').close();
$('headerTour').replaceChildren(svgIcon('help'));$('introClose').replaceChildren(svgIcon('close'));document.querySelector('#learn .intro-symbol').replaceChildren(svgIcon('help'));
for(const detail of document.querySelectorAll('.guide-card details')){const summary=detail.querySelector('summary'),label=el('span',summary.textContent,'status-title'),arrow=svgIcon('chevron');arrow.classList.add('accordion-arrow');const affordance=el('span',undefined,'accordion-affordance');affordance.append(arrow);summary.replaceChildren(label,affordance);detail.addEventListener('toggle',()=>{if(detail.open)for(const other of document.querySelectorAll('.guide-card details'))if(other!==detail)other.open=false;});}
for(const button of document.querySelectorAll('[data-tab]')){const names={home:'home',reports:'reports',learn:'book'};button.querySelector('.nav-glyph').replaceWith(svgIcon(names[button.dataset.tab]));}
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
async function api(action,extra={}){
 const r=await fetch('/app/api',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'tma '+(tg?.initData||'')},body:JSON.stringify({action,...extra})});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not connect. Try again.');return d;
}
const pct=(up,total)=>total?(100*up/total).toFixed(2)+'%':'No data';
function render(){
 const rows=snapshot.targets;
 const summary=snapshot.summary;
 $('total').textContent=summary.total;$('healthy').textContent=summary.healthy;
 $('gaugeValue').textContent=summary.averageUptime===null?'No data':summary.averageUptime.toFixed(2)+'%';
 $('gaugeFill').setAttribute('stroke-dashoffset',String(100-(summary.averageUptime??0)));$('gaugeFill').toggleAttribute('hidden',summary.averageUptime===null||summary.averageUptime===0);
 $('gaugeScope').textContent=summary.observed?'Current window · '+summary.observed+' measured':'Waiting for the first check';
 $('list').replaceChildren();$('report').replaceChildren();
 if(!rows.length){const box=el('div',undefined,'empty');box.append(el('h3','Your first monitor starts here.'),el('p','Add a website URL or API endpoint.'));const b=el('button','+ Add your first monitor','primary');b.onclick=openAdd;box.append(b);$('list').append(box);$('report').append(el('p','Add a monitor to start collecting uptime.'));}
 const labels={healthy:'Healthy',notice:'Notice',warning:'Warning',error:'Service disruption',unreachable:'No response',unknown:'Not checked'};
 for(const r of rows){
  const u=new URL(r.url),card=el('article',undefined,'monitor-row'),row=el('button',undefined,'row monitor-open'),name=el('div',undefined,'url'),left=el('div',undefined,'monitor-name');
  const icon=el('span',undefined,'domain-icon');icon.setAttribute('aria-hidden','true');const color={healthy:'#31b565',notice:'#3b9cf1',warning:'#dba221',error:'#ee8731',unreachable:'#ec5b5b',unknown:'#8c9aaa'};icon.style.setProperty('--status-color',color[r.category]||color.unknown);icon.append(svgIcon(r.category==='error'?'warning':r.category));
  name.append(el('strong',u.hostname),el('div',u.pathname+u.search,'path'));left.append(icon,name);
  const side=el('div',undefined,'monitor-side');side.append(el('strong',pct(r.stats.up,r.stats.total)),el('small',r.pendingAttempts?'Retrying… '+r.pendingAttempts+'/3':r.httpStatus?'HTTP '+r.httpStatus:labels[r.category]));row.append(left,side);card.append(row);
  row.setAttribute('aria-label',u.hostname+' — '+labels[r.category]+'. View monitor details');
  row.onclick=()=>{const body=$('monitorDetail');$('monitorTitle').textContent=u.hostname;body.replaceChildren(el('p',r.url,'path'),el('p',pct(r.stats.up,r.stats.total),'detail-uptime'),el('p','Observed uptime for this monitor'),el('p',labels[r.category]+' · '+(r.detail||'Waiting for the first check')));const meta=el('div',undefined,'meta');meta.append(el('span',r.checkedAt?'Checked '+new Date(r.checkedAt).toLocaleString():'Not checked yet'),el('span',Number.isFinite(r.ms)?r.ms+' ms':'—'),el('span',r.stats.up+' / '+r.stats.total+' HTTP 200 checks'));body.append(meta);$('detailRemove').onclick=()=>{removing=r.id;$('removeUrl').textContent=r.url;$('monitorDialog').close();$('removeDialog').showModal();};$('monitorDialog').showModal();};$('list').append(card);
  const rep=el('article',undefined,'card report-card');rep.append(el('h3',u.hostname),el('p',u.pathname+u.search,'path'));const rr=el('div',undefined,'row');rr.append(el('strong',pct(r.stats.up,r.stats.total)),el('span',r.stats.up+' / '+r.stats.total+' HTTP 200 checks','path'));rep.append(rr);const bar=el('div',undefined,'bar'),fill=el('i');fill.style.width=(r.stats.total?100*r.stats.up/r.stats.total:0)+'%';bar.append(fill);rep.append(bar,el('p',r.stats.outages+' new incidents · '+r.stats.total+'/144 checks per full day','note'));$('report').append(rep);
 }

}
async function load(){snapshot=await api('dashboard');renderProfile();render();const initialTab=new URL(location.href).searchParams.get('tab');if(['home','monitors','reports','learn'].includes(initialTab))goTab(initialTab);$('notice').classList.add('hidden');$('connected').classList.remove('hidden');$('nav').classList.remove('hidden');if(!snapshot.onboardingComplete&&!introShown)showIntro();}

const introSteps=[['⚡','Meet your quiet lookout','Add a website URL or API endpoint. Payo checks it every 10 minutes.'],['🔔','Only the alerts that matter','Orange HTTP errors alert immediately. No response? Payo retries twice, waiting 10 seconds each time, before a red alert. The same color won’t keep pinging.'],['📊','Uptime for every monitor','See each address’s uptime in Reports. Your daily summary arrives at 12:00 noon, Tehran time.']];
let introStep=0,introShown=false;
function renderProfile(){
 const user=snapshot.user,avatar=$('userAvatar');$('profileName').textContent=user.first_name;avatar.replaceChildren();avatar.textContent=user.first_name.slice(0,1).toUpperCase();
 if(user.photo_url){const img=el('img');img.width=44;img.height=44;img.src=user.photo_url;img.alt='Your Telegram profile photo';img.referrerPolicy='no-referrer';img.onerror=()=>{avatar.replaceChildren();avatar.textContent=user.first_name.slice(0,1).toUpperCase();};avatar.replaceChildren(img);}
}
function renderIntro(){const [icon,title,text]=introSteps[introStep];$('introIcon').replaceChildren(svgIcon(['zap','bell','reports'][introStep]));$('introTitle').textContent=title;$('introText').textContent=text;$('introNext').textContent=introStep===2?'Launch Payo':'Continue';[...$('introDots').children].forEach((n,i)=>{n.classList.toggle('current',i===introStep);n.classList.toggle('complete',i<introStep);});}
function showIntro(){if(!snapshot)return;introStep=0;introShown=true;renderIntro();$('onboarding').showModal();}
function finishIntro(){
 $('onboarding').close();introShown=true;if(snapshot)snapshot.onboardingComplete=true;
 // Closing the tour must never depend on network availability.
 void api('onboard').catch(()=>toast('Tour closed. Your progress could not be saved; it may appear again next time.'));
}
function nextIntro(){if(introStep<2){introStep++;renderIntro();}else finishIntro();}
function prevIntro(){if(introStep>0){introStep--;renderIntro();}}
$('introNext').onclick=nextIntro;
$('introClose').onclick=finishIntro;$('onboarding').addEventListener('cancel',e=>{e.preventDefault();finishIntro();});$('headerTour').onclick=showIntro;
const story=document.querySelector('.story-content');let touchStart;
story.addEventListener('pointerdown',e=>{touchStart={x:e.clientX,y:e.clientY};});
story.addEventListener('pointerup',e=>{if(!touchStart)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){dx<0?nextIntro():prevIntro();return;}if(Math.abs(dy)<15){const rect=story.getBoundingClientRect();e.clientX<rect.left+rect.width*.33?prevIntro():nextIntro();}});
function openAdd(){$('formError').textContent='';$('addDialog').showModal();if(matchMedia('(pointer:fine)').matches)$('url').focus();}
$('add').onclick=openAdd;$('cancel').onclick=()=>$('addDialog').close();$('keep').onclick=()=>$('removeDialog').close();
$('refresh').onclick=async()=>{if(busy)return;busy=true;$('refresh').disabled=true;try{await load();toast('Latest results loaded.');}catch(e){toast(e.message);}finally{busy=false;$('refresh').disabled=false;}};
$('addForm').onsubmit=async e=>{e.preventDefault();$('save').disabled=true;$('save').textContent='Adding…';try{const result=await api('add',{url:$('url').value});await load();$('addDialog').close();$('url').value='';toast(result.message);}catch(e){$('formError').textContent=e.message;$('url').focus();}finally{$('save').disabled=false;$('save').textContent='Add monitor';}};
$('confirmRemove').onclick=async()=>{$('confirmRemove').disabled=true;try{const result=await api('remove',{id:removing});$('removeDialog').close();await load();toast(result.message);}catch(e){toast(e.message);}finally{$('confirmRemove').disabled=false;}};
function goTab(tab){if(tab==='monitors')tab='home';for(const name of ['home','reports','learn'])$(name).classList.toggle('hidden',name!==tab);for(const n of document.querySelectorAll('[data-tab]')){n.classList.toggle('active',n.dataset.tab===tab);n.setAttribute('aria-current',n.dataset.tab===tab?'page':'false');}window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});const url=new URL(location.href);url.searchParams.set('tab',tab);history.replaceState(null,'',url.pathname+url.search+url.hash);}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>goTab(b.dataset.tab);

if(!tg?.initData){$('notice').replaceChildren(el('h3','Let’s launch your dashboard'),el('p','Close this window and tap App beside the message field in the bot. If the button is missing, send /start once to refresh it.'));const link=el('a','Launch @PayoWatchBot');link.href='https://t.me/PayoWatchBot?start=dashboard';link.style.color='var(--accent)';$('notice').append(link);}else load().catch(e=>{$('notice').replaceChildren(el('p',e.message,'error'));const b=el('button','Try again');b.onclick=()=>load().catch(e=>toast(e.message));$('notice').append(b);});
`;
