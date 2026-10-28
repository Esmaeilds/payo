// Walt's observed color roles map to the Telegram theme, not a fixed brand palette.
export function themeTokens(params={},dark=false){
 const fallback=dark?{bg:'#0f171f',panel:'#18232e',text:'#ffffff',muted:'#a8bbcc',accent:'#2a9ef1',line:'#2b3947'}:{bg:'#f1f2f6',panel:'#ffffff',text:'#111111',muted:'#707579',accent:'#2481cc',line:'#e3e6e8'};
 const safe=(value,otherwise)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:otherwise;
 const panel=safe(params.section_bg_color,safe(params.bg_color,fallback.panel));
 const accent=safe(params.button_color,fallback.accent);
 return {'--bg':safe(params.secondary_bg_color,fallback.bg),'--panel':panel,'--text':safe(params.text_color,fallback.text),'--muted':safe(params.subtitle_text_color,safe(params.hint_color,fallback.muted)),'--accent':accent,'--accent-text':safe(params.accent_text_color,accent),'--link':safe(params.link_color,accent),'--button-text':safe(params.button_text_color,'#ffffff'),'--line':safe(params.section_separator_color,fallback.line),'--destructive':safe(params.destructive_text_color,'#df4545'),'--nav-material':'rgba('+[panel.slice(1,3),panel.slice(3,5),panel.slice(5,7)].map(v=>parseInt(v,16)).join(',')+',0.84)','--header':safe(params.header_bg_color,safe(params.secondary_bg_color,fallback.bg))};
}
