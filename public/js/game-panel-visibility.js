import {requestGameInputRelease} from './game-input-release.js';

const panels=[
 ['shipping-hud','shipping','Shipping'],['fishing-hud','fishing','Fishing'],
 ['road-vehicle-controls','road','Road vehicle'],['harbor-helm-controls','helm','Boat helm'],
 ['airport-flight-controls','flight','Flight'],['construction-controls','construction','Construction'],
 ['owned-placement-controls','placement','Item placement'],['basketball-hud','basketball','Basketball'],
 ['firing-range-hud','range','Firing range'],['hockey-sports-bar','hockey','Hockey'],
 ['funhouse-experience-hud','funhouse-attraction','Attraction'],['funhouse-adventure-hud','funhouse-trail','Adventure trail']
];
const mounted=new WeakMap();let sequence=0;

// Content and runtime-owned hidden flags stay in place. Only local presentation
// changes, so snapshots cannot reopen a hidden dashboard.
export function mountGamePanelVisibility(panel){
 if(mounted.has(panel))return mounted.get(panel);
 const kind=panels.find(([name])=>panel.classList.contains(name));if(!kind)return null;
 const [,key,title]=kind,document=panel.ownerDocument;
 if(!document.querySelector('[data-game-panel-visibility-style]')){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/game-panel-visibility.css',import.meta.url).href;link.dataset.gamePanelVisibilityStyle='';document.head.append(link);
 }
 const storageKey='muzikaz.game-panel.'+key+'.collapsed';let collapsed=false;
 try{collapsed=document.defaultView.localStorage.getItem(storageKey)==='true';}catch{}
 if(!panel.id)panel.id='game-panel-'+key+'-'+ ++sequence;
 const header=document.createElement('div');header.className='game-panel-visibility';
 const label=document.createElement('strong');label.textContent=title;
 const existingHeading=panel.querySelector(':scope > .construction-header');
 const toggle=document.createElement('button');toggle.type='button';toggle.setAttribute('aria-controls',panel.id);
 header.append(label,toggle);panel.prepend(header);panel.classList.add('game-panel');
 const render=()=>{const host=!collapsed&&existingHeading?existingHeading:panel;if(header.parentElement!==host){if(host===panel)panel.prepend(header);else host.append(header);}panel.classList.toggle('game-panel-collapsed',collapsed);toggle.textContent=collapsed?'Show':'Hide';toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',(collapsed?'Show ':'Hide ')+title.toLowerCase()+' panel');};
 const stop=event=>event.stopPropagation();
 for(const type of ['pointerdown','pointerup','pointercancel','dblclick','wheel'])header.addEventListener(type,stop);
 toggle.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();requestGameInputRelease('panel-visibility',document);collapsed=!collapsed;render();toggle.focus({preventScroll:true});try{document.defaultView.localStorage.setItem(storageKey,String(collapsed));}catch{}});
 header.addEventListener('click',stop);render();
 const control={dispose(){header.remove();panel.classList.remove('game-panel','game-panel-collapsed');mounted.delete(panel);}};
 mounted.set(panel,control);return control;
}
