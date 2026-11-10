export const settingsUI=String.raw`
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export async function settingsPanel(api,id,onSaved){
 const root=el('section');root.className='monitor-settings';root.append(el('h3','Monitor settings'));
 let settings;try{settings=await api('settings',{id});}catch{root.append(el('p','Settings could not be loaded.'));return root;}
 const form=el('form');form.autocomplete='off';
 function field(label,type,value){const wrap=el('label',label),input=el('input');input.type=type;input.value=value??'';wrap.append(input);form.append(wrap);return input;}
 const expected=field('Successful HTTP status','text',settings.expectedStatus);expected.placeholder='200 or 200-299';expected.maxLength=7;
 const recovery=field('Notify me when the service recovers','checkbox','');recovery.checked=settings.recoveryAlerts;
 const paused=field('Pause this monitor','checkbox','');paused.checked=settings.paused;
 const maintenanceLabel=el('label','Maintenance'),maintenance=el('select');for(const [value,label] of [['keep','Keep current setting'],['0','End maintenance'],['30','For 30 minutes'],['60','For 1 hour'],['240','For 4 hours'],['1440','For 24 hours']]){const option=el('option',label);option.value=value;maintenance.append(option);}maintenanceLabel.append(maintenance);form.append(maintenanceLabel,el('p',settings.maintenanceUntil>Date.now()?'Maintenance ends '+new Date(settings.maintenanceUntil).toLocaleString()+'. Checks resume on the next scheduled cycle.':'Checks run every 10 minutes. Paused and maintenance periods are excluded from recorded uptime.'));
 const typeLabel=el('label','Response content check'),type=el('select');for(const [value,label]of [['none','No content check'],['contains','Response contains text'],['json','JSON field equals a value']]){const option=el('option',label);option.value=value;type.append(option);}type.value=settings.assertion?.type||'none';typeLabel.append(type);form.append(typeLabel);
 const path=field('JSON field path','text',settings.assertion?.path||'');path.placeholder='status or health.database';
 const value=field('Expected text or JSON value','text',settings.assertion?typeof settings.assertion.value==='string'?settings.assertion.value:JSON.stringify(settings.assertion.value):'');value.maxLength=200;
 const scalarLabel=el('label','JSON value type'),scalar=el('select');for(const name of ['string','boolean','number']){const option=el('option',name);option.value=name;scalar.append(option);}scalar.value=typeof settings.assertion?.value==='boolean'?'boolean':typeof settings.assertion?.value==='number'?'number':'string';scalarLabel.append(scalar);form.append(scalarLabel);
 const updateFields=()=>{path.parentElement.hidden=type.value!=='json';value.parentElement.hidden=type.value==='none';scalarLabel.hidden=type.value!=='json';};type.onchange=updateFields;updateFields();
 const auth=el('details'),summary=el('summary','API credentials');auth.append(summary,el('p',settings.hasCredentials?'Credentials are stored. Leave fields blank to keep them. Entering new credentials replaces the saved set.':'Optional. HTTPS only. Credentials are encrypted at rest and never shown again.'));
 const tokenLabel=el('label','Bearer token'),token=el('input');token.type='password';token.autocomplete='new-password';token.maxLength=2048;tokenLabel.append(token);
 const headersLabel=el('label','Custom headers (JSON)'),headers=el('textarea');headers.autocomplete='off';headers.spellcheck=false;headers.maxLength=6000;headers.placeholder='{"X-API-Key":"your key"}';headersLabel.append(headers);
 const clearLabel=el('label','Remove stored credentials'),clear=el('input');clear.type='checkbox';clearLabel.append(clear);auth.append(tokenLabel,headersLabel,clearLabel);form.append(auth);
 const error=el('p');error.setAttribute('role','alert');error.className='error';const save=el('button','Save settings');save.type='submit';save.className='primary';form.append(error,save);root.append(form);
 form.onsubmit=async event=>{event.preventDefault();error.textContent='';save.disabled=true;
 try{let assertion=null;if(type.value==='contains')assertion={type:'contains',value:value.value};if(type.value==='json'){let expected=value.value;if(scalar.value==='boolean'){if(!['true','false'].includes(expected))throw new Error('Enter true or false.');expected=expected==='true';}if(scalar.value==='number'){if(!expected.trim()||!Number.isFinite(Number(expected)))throw new Error('Enter a valid number.');expected=Number(expected);}assertion={type:'json',path:path.value,value:expected};}
 const patch={expectedStatus:expected.value.trim(),recoveryAlerts:recovery.checked,paused:paused.checked,assertion};if(maintenance.value!=='keep')patch.maintenanceUntil=maintenance.value==='0'?null:Date.now()+Number(maintenance.value)*60000;
 if(clear.checked)patch.clearCredentials=true;
 if(token.value||headers.value.trim()){if(clear.checked)throw new Error('Choose either replace credentials or remove them.');if(token.value)patch.bearerToken=token.value;if(headers.value.trim()){try{patch.headers=JSON.parse(headers.value);}catch{throw new Error('Custom headers must be a JSON object.');}}}
 await api('updateSettings',{id,settings:patch});token.value='';headers.value='';await onSaved();
 }catch(e){error.textContent=e.message||'Settings could not be saved.';}finally{save.disabled=false;}};
 return root;
}
`;
