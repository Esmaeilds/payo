// Served as a module; only saved observations are read. No endpoint probes.
export const historyUI=String.raw`
const labels={healthy:'Healthy',notice:'Notice',warning:'Warning',error:'Service disruption',unreachable:'No response',unknown:'Unknown',missing:'No recorded check',paused:'Paused',maintenance:'Maintenance'};
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const time=n=>new Date(n).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const duration=n=>Number.isFinite(n)?Math.round(n)+' ms':'No response data';
export function historyPanel(api,monitors,initialId,lazy=false){
 const root=make('section',undefined,'history-panel'),controls=make('div',undefined,'history-controls'),select=make('select');select.setAttribute('aria-label','Select monitor');
 for(const m of monitors){const o=make('option',new URL(m.url).hostname+new URL(m.url).pathname);o.value=m.id;select.append(o);}select.value=initialId||monitors[0]?.id||'';
 const ranges=make('div',undefined,'history-ranges');ranges.setAttribute('role','group');ranges.setAttribute('aria-label','History range');
 let range='24h',version=0;const content=make('div');
 const buttons=['24h','7d','30d'].map(value=>{const b=make('button',value.toUpperCase());b.onclick=()=>{range=value;void load();};ranges.append(b);return b;});
 controls.append(select,ranges);root.append(controls,content);select.onchange=()=>void load();
 async function load(){const ticket=++version;buttons.forEach((b,i)=>{const active=['24h','7d','30d'][i]===range;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});content.replaceChildren(make('p','Loading saved history…'));if(!select.value)return;
 try{const data=await api('history',{id:select.value,range});if(ticket!==version)return;draw(data);}catch{if(ticket!==version)return;const b=make('button','Try again');b.onclick=()=>void load();content.replaceChildren(make('p','Could not load saved history.'),b);}}
 function draw(data){
 content.replaceChildren();const stats=make('div',undefined,'history-stats');for(const [title,value] of [['Observed uptime',data.summary.uptime===null?'No data':data.summary.uptime.toFixed(2)+'%'],['Average response',duration(data.summary.averageMs)],['Coverage',data.summary.total+' / '+data.summary.expected]]){const s=make('div');s.append(make('small',title),make('strong',value));stats.append(s);}content.append(stats,make('p','Latest HTTP response: '+duration(data.latest.ms)+(data.latest.at?' · '+time(data.latest.at):''),'note')); 
 const heading=make('h3','Response time');content.append(heading,make('p',data.resolution,'note'));
 if(!data.points.some(p=>p.ms!==null)){content.append(make('p','Response history will appear after successful HTTP responses.','history-empty'));}
 else {
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 180');svg.setAttribute('class','response-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','Response time in milliseconds over '+range+'. Gaps mean no response measurement.');
 const points=data.points,max=Math.max(1,...points.flatMap(p=>[p.ms||0,p.max||0])),x=i=>38+i*310/Math.max(1,points.length-1),y=v=>145-v/max*120;
 const add=(name,attrs,text)=>{const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text)e.textContent=text;svg.append(e);return e;};
 for(let i=0;i<3;i++){const value=max*i/2;add('line',{x1:38,y1:y(value),x2:348,y2:y(value),class:'chart-grid'});add('text',{x:34,y:y(value)+3,'text-anchor':'end',class:'chart-label'},String(Math.round(value)));}add('text',{x:4,y:12,class:'chart-label'},'ms');
 for(const key of (range==='24h'?['ms']:['max','ms'])){let d='',pen=false;points.forEach((p,i)=>{if(p[key]===null){pen=false;return;}d+=(pen?' L':' M')+x(i)+' '+y(p[key]);pen=true;});add('path',{d,class:key==='max'?'chart-max':'chart-mean'});}
 points.forEach((p,i)=>{if(p.ms!==null)add('circle',{cx:x(i),cy:y(p.ms),r:1.6,class:'chart-point'});});
 add('text',{x:38,y:172,class:'chart-label'},time(points[0].at));add('text',{x:348,y:172,'text-anchor':'end',class:'chart-label'},time(points.at(-1).at));
 const readout=make('p','Touch or drag on the chart to inspect a saved result.','chart-readout');
 const inspect=e=>{const rect=svg.getBoundingClientRect(),px=(e.clientX-rect.left)/rect.width*360,i=Math.max(0,Math.min(points.length-1,Math.round((px-38)/310*(points.length-1)))),p=points[i];readout.textContent=time(p.at)+' · '+duration(p.ms)+(range==='24h'?' · '+labels[p.category]:' mean · '+duration(p.max)+' maximum');};svg.addEventListener('pointerdown',inspect);svg.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='mouse')inspect(e);});content.append(svg,readout);if(range!=='24h')content.append(make('p','Solid: mean · Dashed: maximum. Only complete UTC hours are included.','note'));
 }
 content.append(make('h3','Recent checks'),make('p','Last 30 scheduled slots · 10 minutes each · '+time(data.recent[0].at)+' – '+time(data.recent.at(-1).at),'note'));
 const strip=make('div',undefined,'heartbeat-strip'),readout=make('p','Tap a bar to inspect its result.','note');
 for(const p of data.recent){const b=make('button',undefined,'heartbeat '+p.category),description=time(p.at)+' · '+labels[p.category]+(p.http?' · HTTP '+p.http:'')+' · '+duration(p.ms)+(p.attempts?' · '+p.attempts+' attempt(s)':'');b.setAttribute('aria-label',description);b.title=description;b.onclick=()=>{readout.textContent=description;};strip.append(b);}content.append(strip,readout);
 content.append(make('h3','Incidents'),make('p','Orange and red observations · Detailed history available for 7 days.','note'));
 if(!data.incidents.length)content.append(make('p','No recorded orange or red incidents in the available detailed history.','history-empty'));
 for(const incident of data.incidents){const row=make('div',undefined,'incident-row');row.append(make('strong',labels[incident.category]+(incident.http?' · HTTP '+incident.http:'')),make('p','First observed in retained history '+time(incident.start)+(incident.end?' · Left this status '+time(incident.end):incident.ongoing?' · Still observed':' · End not observed')),make('small',incident.end?'Observed interval: '+Math.round((incident.end-incident.start)/60000)+' min':'Last observed '+time(incident.lastObserved)));content.append(row);}
 content.append(make('p',data.retention+' Times use your device timezone. Availability is sampled, not continuous.','note'));
 }
 if(monitors.length){if(lazy)root.addEventListener('show-history',()=>void load(),{once:true});else void load();}return root;
}
`;
