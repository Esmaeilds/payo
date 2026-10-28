import {test} from 'node:test';
import assert from 'node:assert/strict';
import {themeTokens} from '../src/theme.js';
test('Telegram appearance supplies every semantic color; themes remain independent',()=>{
 const purple={bg_color:'#212121',section_bg_color:'#212121',secondary_bg_color:'#181818',text_color:'#ffffff',hint_color:'#aaaaaa',button_color:'#8774e1',button_text_color:'#ffffff',accent_text_color:'#8774e1',link_color:'#8774e1'};
 const p=themeTokens(purple,true);assert.equal(p['--accent'],'#8774e1');assert.equal(p['--bg'],'#181818');assert.equal(p['--panel'],'#212121');assert.equal(p['--muted'],'#aaaaaa');
 const b=themeTokens({...purple,button_color:'#29a3f7',accent_text_color:'#29a3f7'},true);assert.equal(b['--accent'],'#29a3f7');assert.equal(p['--accent'],'#8774e1');
 assert.equal(themeTokens({},false)['--panel'],'#ffffff');assert.notEqual(themeTokens({},true)['--panel'],'#ffffff');
 assert.equal(themeTokens({button_color:'url(invalid)'},true)['--accent'],themeTokens({},true)['--accent']);
});
