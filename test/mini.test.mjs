import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {authenticate} from '../src/mini-auth.js';
const token='test-token';
function signed(user=123,at=Math.floor(Date.now()/1000)){
 const p=new URLSearchParams({auth_date:String(at),user:JSON.stringify({id:user,first_name:'Alice'}),query_id:'example'});
 const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',key).update(data).digest('hex'));return p.toString();
}
test('Mini App rejects forgery, expired sessions, duplicate fields and invalid users',async()=>{
 assert.equal((await authenticate(signed(),token)).id,123);
 await assert.rejects(authenticate(signed().replace('Alice','Bob'),token));
 await assert.rejects(authenticate(signed(123,1),token));
 await assert.rejects(authenticate(signed()+'&auth_date=1',token));
 await assert.rejects(authenticate(signed(-1),token));
 await assert.rejects(authenticate('',token));
});
