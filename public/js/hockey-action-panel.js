import {HOCKEY_TRIGGER_MODES} from './hockey-actions.js';

const icon=paths=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const icons={
 auto:icon('<circle cx="12" cy="12" r="5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>'),
 shoot:icon('<path d="M12 17V3m-5 5 5-5 5 5M5 15v6h14v-6"/>'),
 pass:icon('<path d="M3 12h17m-6-6 6 6-6 6"/>'),
 steal:icon('<path d="m4 20 6-6m-6 0h6v6M13 11l7-7m-6 0h6v6"/>'),
 check:icon('<path d="m5 4 6 8-6 8m14-16-6 8 6 8M3 12h18"/>'),
 collect:icon('<circle cx="12" cy="14" r="4"/><path d="M4 5v6m-3-3 3 3 3-3m13-3v6m-3-3 3 3 3-3"/>')
};
const names={auto:'Auto',shoot:'Shoot',pass:'Pass',steal:'Steal',check:'Check',collect:'Collect'};
const write=(node,value)=>{if(node.textContent!==value)node.textContent=value;};

/** The visible dock uses the same queued trigger as keyboard, touch and XR. */
export function mountHockeyActionPanel({parent,onMode,onTrigger,onLoft,onMatch,onJoin,onNext,onRematch,onFocus}){
 const root=document.createElement('section');
 root.className='hockey-action-panel';root.dataset.hockeyActionPanel='';root.hidden=true;
 root.setAttribute('aria-label','Hockey scoreboard and sports actions');
 root.innerHTML='<div class="hockey-panel-score"><strong data-hockey-score></strong><span data-hockey-clock></span></div><div class="hockey-action-choices" id="hockey-action-choices" role="group" aria-label="Hockey trigger action"></div><div class="hockey-panel-watch" role="status" hidden></div><div class="hockey-panel-footer"><button type="button" data-hockey-primary><span aria-hidden="true">▷</span><span data-hockey-primary-label></span></button><button type="button" data-hockey-join hidden>Take the ice</button><button type="button" data-hockey-next hidden>Championship →</button><button type="button" data-hockey-rematch hidden>New match</button><button type="button" data-hockey-loft aria-pressed="false" aria-label="Loft shots" title="Loft shots on or off"><span aria-hidden="true">⌁</span><small>Loft</small></button><button type="button" data-hockey-match aria-label="Match menu, custom settings and players" title="Match menu and players"><span aria-hidden="true">⚙</span><small>Match</small></button><button type="button" data-hockey-collapse aria-controls="hockey-action-choices" aria-expanded="true" aria-label="Collapse hockey actions" title="Collapse actions">⌃</button></div>';
 const $=selector=>root.querySelector(selector),choices=$('.hockey-action-choices'),primary=$('[data-hockey-primary]'),loft=$('[data-hockey-loft]'),collapse=$('[data-hockey-collapse]');
 let selected='auto',lift=false,enabled=false,blocked=false,joining=false;
 for(const {value,label}of HOCKEY_TRIGGER_MODES){
  const button=document.createElement('button');button.type='button';button.dataset.hockeyMode=value;
  button.setAttribute('aria-pressed',String(value==='auto'));button.setAttribute('aria-label',label);
  button.title=value==='auto'?'Choose the best available action':'Keep '+names[value].toLowerCase()+' selected until you choose another action';
  button.innerHTML=icons[value]+`<small>${names[value]}</small>`;
  button.onclick=()=>{if(!blocked)onMode(value);};choices.append(button);
 }
 primary.onclick=()=>{if(enabled&&!blocked)onTrigger({lift});};
 loft.onclick=()=>{if(!enabled||blocked)return;lift=!lift;loft.setAttribute('aria-pressed',String(lift));onLoft(lift);onFocus();};
 $('[data-hockey-match]').onclick=()=>onMatch();
 $('[data-hockey-join]').onclick=async()=>{if(blocked||joining)return;joining=true;$('[data-hockey-join]').disabled=true;try{await onJoin();}finally{joining=false;}};
 $('[data-hockey-next]').onclick=()=>onNext();$('[data-hockey-rematch]').onclick=()=>onRematch();
 collapse.onclick=()=>{const collapsed=root.dataset.collapsed!=='true';root.dataset.collapsed=String(collapsed);collapse.setAttribute('aria-expanded',String(!collapsed));collapse.setAttribute('aria-label',(collapsed?'Expand':'Collapse')+' hockey actions');collapse.title=(collapsed?'Expand':'Collapse')+' actions';};
 // Space/Enter activate the focused button once rather than also reaching skating controls.
 root.addEventListener('keydown',event=>{if(event.target.closest('button')&&[' ','Enter'].includes(event.key))event.stopPropagation();});
 root.addEventListener('pointerdown',event=>event.stopPropagation());parent.append(root);
 return {root,setMode(mode){selected=mode;for(const button of choices.children)button.setAttribute('aria-pressed',String(button.dataset.hockeyMode===mode));},update({running,spectating,live,xr,blocked:paused,canAct,choice,score,clock,message,canJoin,canNext,canRematch}){
  root.hidden=!running||xr;blocked=paused;enabled=canAct&&!spectating;
  choices.hidden=spectating;primary.hidden=spectating;loft.hidden=spectating;collapse.hidden=spectating;
  for(const button of choices.children)button.disabled=blocked;
  primary.disabled=!enabled||blocked;loft.disabled=!enabled||blocked;
  write($('[data-hockey-score]'),score);write($('[data-hockey-clock]'),clock);
  const label=selected==='auto'?'Auto · '+choice.label:choice.action===selected?'Use '+names[selected]:names[selected]+' · '+choice.label;
  write($('[data-hockey-primary-label]'),label);primary.setAttribute('aria-label','Use '+label);primary.title=label;
  const watch=$('.hockey-panel-watch');watch.hidden=!spectating;
  write(watch,(live?'Watching live':'AI vs AI')+' · '+message);
  for(const [key,visible]of [['join',spectating&&canJoin],['next',canNext],['rematch',canRematch]]){const button=$('[data-hockey-'+key+']');button.hidden=!visible;button.disabled=blocked||key==='join'&&joining;}
  $('[data-hockey-match]').disabled=blocked;
 }};
}
