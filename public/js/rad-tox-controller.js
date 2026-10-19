/** Close action menus before issuing gameplay input; release pulses on cancellation. */
export function runControllerAction(menu,item,{schedule=setTimeout,cancel=clearTimeout}={}){
 menu.close();
 if(!item.hold){item.tap();return ()=>{};}
 item.hold(true);
 let holding=true;
 const release=()=>{if(!holding)return;holding=false;item.hold(false);};
 const timer=schedule(release,180);
 return ()=>{cancel(timer);release();};
}
/** Bind a selected gameplay action without replacing its existing click handler. */
export function bindGameActionSelection(root,{selector='button',enabled=()=>true,defaultAction,onChange=()=>{}}={}){
 let current=null,lastId,lastLabel,destroyed=false;
 const buttons=()=>Array.from(root.querySelectorAll(selector));
 const idFor=button=>button?.dataset?.gameAction||button?.dataset?.basketballAction||button?.id||button?.textContent?.trim();
 const labelFor=button=>button?.dataset?.gameActionLabel||button?.textContent?.trim().split(' · ')[0]||'Action';
 const visible=button=>{if(!button||button.isConnected===false)return false;for(let node=button;node;node=node.parentElement){if(node.hidden||node.inert)return false;if(node===root)break;}return !button.getClientRects||button.getClientRects().length>0;};
 const state=()=>current?{id:idFor(current),label:labelFor(current),button:current}:null;
 function paint(all){
  for(const button of all){const selected=button===current;if(button.classList.contains('is-selected')!==selected)button.classList.toggle('is-selected',selected);if(button.getAttribute('aria-pressed')!==String(selected))button.setAttribute('aria-pressed',String(selected));}
  const next=state();if(next?.id!==lastId||next?.label!==lastLabel){lastId=next?.id;lastLabel=next?.label;onChange(next);}
  return next;
 }
 function sync(){
  if(destroyed)return null;
  const all=buttons();
  if(!enabled())current=null;
  else if(!all.includes(current)||!visible(current)){const available=all.filter(button=>visible(button)&&!button.disabled);current=available.find(button=>idFor(button)===defaultAction)||available[0]||null;}
  return paint(all);
 }
 function select(buttonOrId){
  if(destroyed||!enabled())return false;
  const all=buttons(),button=typeof buttonOrId==='string'?all.find(node=>idFor(node)===buttonOrId):buttonOrId;
  if(!all.includes(button)||!visible(button)||button.disabled)return false;
  current=button;paint(all);return true;
 }
 const click=event=>{const button=event.target.closest?.(selector);if(button)select(button);};
 root.addEventListener('click',click,true);
 function reset(){current=null;lastId=undefined;lastLabel=undefined;return sync();}
 function destroy(){if(destroyed)return;current=null;paint(buttons());destroyed=true;root.removeEventListener('click',click,true);}
 sync();
 return {select,sync,reset,destroy,get selected(){return state();},trigger(){const selected=sync();if(!selected||selected.button.disabled)return false;selected.button.click();return true;}};
}
/** Keep native and shared left-stick labels aligned with the selected action. */
export function updateGameTriggerHint(root,label='Shoot'){
 if(!root)return;
 const name=String(label||'Action'),labelNode=root.querySelector('[data-thumbstick="left"] .thumbstick-label'),hint=root.querySelector('[data-thumbstick="left"] small'),base=root.querySelector('[data-thumbstick="left"] .thumbstick-base'),group=root.querySelector('[data-thumbstick="left"]');
 if(labelNode)labelNode.textContent=`Move / ${name}`;
 if(hint)hint.textContent=`Drag to move · tap to ${name.toLowerCase()}`;
 base?.setAttribute('aria-label',`Left thumbstick: drag to move, tap to ${name.toLowerCase()}`);
 group?.setAttribute('aria-label',`Left controller: move; tap to ${name.toLowerCase()}`);
}
/** MUZIKAZ's RAD-TOX dual-stick controller, shared by the sports runtimes. */
export function stickAxes(dx,dy,radius,deadzone=8){if(!Number.isFinite(radius)||radius<=0)return {x:0,y:0};const distance=Math.hypot(dx,dy);if(!Number.isFinite(distance)||distance<=deadzone)return {x:0,y:0};const scale=Math.min(1,distance/radius)/distance;return {x:dx*scale,y:dy*scale};}
export function radToxStickMarkup({left='Move / shoot',right='Look / turn',rightTap='view'}={}){return `<div class="thumbstick-control" data-thumbstick="left" role="group" aria-label="Left controller: move; tap to shoot"><span class="thumbstick-label">${left}</span><button class="thumbstick-base" type="button" aria-label="Left thumbstick: drag to move, tap to shoot"><span class="thumbstick-knob"></span></button><small>Drag to move · tap to shoot</small></div><div class="thumbstick-control" data-thumbstick="right" role="group" aria-label="Right controller: look and aim"><span class="thumbstick-label">${right}</span><button class="thumbstick-base" type="button" aria-label="Right thumbstick: drag to look or aim, tap for ${rightTap}"><span class="thumbstick-knob"></span></button><small>Drag to look · tap to ${rightTap}</small></div>`;}
export function loadRadToxControllerStyles(){if(document.querySelector('[data-rad-controller-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/rad-tox-controller.css',import.meta.url).href;link.dataset.radControllerStyle='';document.head.append(link);}
export function mountRadToxController({parent=document.body,enabled=()=>true,visible=enabled,onMove=()=>{},onLook=()=>{},onShoot=()=>{},onView=()=>{},onExit=null,onMatch=null,onSettings=null,onStats=null,screenActions=false,primaryAction={},buttons=[]}={}){
 loadRadToxControllerStyles();const root=document.createElement('section');root.className='muzikaz-controller';root.setAttribute('aria-label','MUZIKAZ trademark RAD-TOX game controller');root.innerHTML='<span class="rad-controller-brand">MUZIKAZ™ · RAD-TOX</span>'+radToxStickMarkup()+'<div class="rad-controller-toolbar" role="toolbar" aria-label="Game menu"></div><dialog class="rad-controller-menu" aria-label="Game actions"><button type="button" data-close-actions>Close actions ×</button><div class="rad-controller-actions"></div></dialog>';parent.append(root);
 const menu=root.querySelector('.rad-controller-menu');const openActions=()=>{resets.forEach(reset=>reset());onMove({x:0,y:0},0);if(!menu.open)menu.showModal();};root.querySelector('[data-close-actions]').onclick=()=>menu.close();menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();menu.close();}});
 const axes={left:{x:0,y:0},right:{x:0,y:0}},resets=[];let previous=performance.now(),wasEnabled=false,actionSelection,destroyed=false,frameId;
 const triggerSelected=()=>{if(!enabled()||document.hidden||document.querySelector('dialog[open]:not([data-gameplay-surface])'))return false;if(screenActions)return actionSelection?.trigger()||false;onShoot();return true;};
 for(const side of ['left','right']){const base=root.querySelector(`[data-thumbstick="${side}"] .thumbstick-base`),knob=base.firstElementChild;let id=null,startX=0,startY=0,moved=false,rect;
 const reset=()=>{id=null;axes[side]={x:0,y:0};knob.style.transform='translate(0,0)';base.classList.remove('is-active');};resets.push(reset);
 const write=e=>{const radius=rect.width*.29,dx=e.clientX-startX,dy=e.clientY-startY;axes[side]=stickAxes(dx,dy,radius);const a=axes[side];knob.style.transform=`translate(${a.x*radius}px,${a.y*radius}px)`;moved ||= Math.hypot(e.clientX-startX,e.clientY-startY)>8;};
 base.onpointerdown=e=>{if(id!==null||!enabled()||e.button>0)return;e.preventDefault();id=e.pointerId;startX=e.clientX;startY=e.clientY;moved=false;rect=base.getBoundingClientRect();base.setPointerCapture(id);base.classList.add('is-active');write(e);};
 base.onpointermove=e=>{if(id!==e.pointerId)return;e.preventDefault();write(e);};
 const release=e=>{if(id!==e.pointerId)return;const tap=!moved&&e.type==='pointerup'&&enabled();reset();onMove(axes.left,0);if(tap)(side==='left'?triggerSelected:onView)();};for(const event of ['pointerup','pointercancel','lostpointercapture'])base.addEventListener(event,release);
 base.onclick=event=>{if(event.detail===0&&enabled())(side==='left'?triggerSelected:onView)();};
 }
 const conditionalButtons=[],actions=root.querySelector('.rad-controller-actions'),screenBar=document.createElement('div');screenBar.className='game-screen-actions';screenBar.setAttribute('role','group');screenBar.setAttribute('aria-label','Gameplay actions');if(screenActions){root.classList.add('has-screen-actions');root.prepend(screenBar);}for(const item of [{id:'shoot',label:'Shoot / play',tap:onShoot,primary:true,...primaryAction},{label:'View · V',tap:onView},...buttons]){const button=document.createElement('button');button.type='button';button.textContent=item.label;button.className='rad-controller-button';const selectable=screenActions&&item.primary&&item.selectable!==false;(screenActions&&item.primary?screenBar:actions).append(button);if(selectable){button.dataset.gameAction=item.id||item.label;button.dataset.gameActionLabel=item.triggerLabel||(item.label==='Shoot / play'?'Shoot':item.label.split(' · ')[0]);}let cancelAction=()=>{};const blocked=()=>typeof item.disabled==='function'?item.disabled():Boolean(item.disabled);button.hidden=item.when?!item.when():false;button.disabled=blocked();conditionalButtons.push({button,when:item.when,blocked,cancel:()=>cancelAction()});resets.push(()=>cancelAction());button.onclick=()=>{if(enabled()&&!button.disabled&&!button.hidden&&(!item.when||item.when())&&!blocked()){if(selectable)actionSelection?.select(button);cancelAction();cancelAction=runControllerAction(menu,item);}};}
 if(screenActions)actionSelection=bindGameActionSelection(screenBar,{selector:'button[data-game-action]',enabled:()=>enabled()&&!screenBar.hidden,onChange:selected=>updateGameTriggerHint(root,selected?.label||'Action')});
 const toolbar=root.querySelector('.rad-controller-toolbar');for(const item of [{icon:'🚪',label:'Leave game',tap:onExit||(()=>buttons.find(b=>b.label.startsWith('Leave'))?.tap())},{icon:'◉',label:'Change view',tap:onView},{icon:'♟',label:'Match and players',tap:onMatch||openActions},{icon:'⚒',label:'Game actions',tap:openActions},{icon:'⚙',label:'Game settings',tap:onSettings||onMatch||openActions},{icon:'🏆',label:'Scores and rules',tap:onStats||openActions}]){const button=document.createElement('button');button.type='button';button.className='rad-toolbar-button';button.textContent=item.icon;button.title=item.label;button.setAttribute('aria-label',item.label);button.onclick=()=>{neutral();item.tap();};toolbar.append(button);}
 const neutral=()=>{resets.forEach(reset=>reset());onMove({x:0,y:0},0);};const visibilityChange=()=>{if(document.hidden)neutral();};window.addEventListener('blur',neutral);document.addEventListener('visibilitychange',visibilityChange);
 function destroy(){if(destroyed)return;destroyed=true;neutral();actionSelection?.destroy();if(typeof cancelAnimationFrame==='function')cancelAnimationFrame(frameId);window.removeEventListener('blur',neutral);document.removeEventListener('visibilitychange',visibilityChange);}
 function frame(now){if(!root.isConnected){destroy();return;}for(const item of conditionalButtons){item.button.hidden=item.when?!item.when():false;item.button.disabled=item.blocked();if(item.button.hidden||item.button.disabled)item.cancel();}const active=enabled()&&!document.hidden&&!document.querySelector('dialog[open]:not([data-gameplay-surface])');root.hidden=!visible();screenBar.hidden=!enabled();actionSelection?.sync();if(!active&&wasEnabled)neutral();const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;wasEnabled=active;if(active){onMove(axes.left,dt);onLook(axes.right,dt);}frameId=requestAnimationFrame(frame);}frameId=requestAnimationFrame(frame);return {root,reset:neutral,destroy,triggerSelected,selectAction:id=>actionSelection?.select(id)||false,get selectedAction(){return actionSelection?.selected||null;}};
}
