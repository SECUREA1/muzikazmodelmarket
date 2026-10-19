import {selectHockeyTriggerAction} from './hockey-actions.js';
import {isGameCameraToggleKey} from './game-camera.js';

const actionKeys={shoot:'shoot',e:'pass',q:'check',f:'poke',h:'hook',j:'slash',k:'hold'};
const playable=(state,player)=>player?.onIce&&!player.ejected&&!(player.penalty>0)&&!(player.misconduct>0)&&!player.queuedReplacement&&(state?.phase==='playing'||state?.phase==='shootout'&&state.shootout?.active);

/** Held skating stays continuous; action taps wait for an eligible simulation/input sample. */
export function createHockeyInputs({now=()=>performance.now(),tapWait=1200}={}){
 const keys=new Set(),pending=new Map();let paused=0,sendingAt=null;
 const clock=()=>{const time=now();return time-paused-(sendingAt===null?0:time-sendingAt);};
 function tap(key,{lift=false}={}){if(key===' '||actionKeys[key])pending.set(key,{until:clock()+tapWait,lift});}
 return {
  keys,tap,
  press(key){if(keys.has(key))return;keys.add(key);tap(key);},
  release(key){keys.delete(key);},
  reset(){keys.clear();pending.clear();},
  sending(value){if(value&&sendingAt===null)sendingAt=now();else if(!value&&sendingAt!==null){paused+=now()-sendingAt;sendingAt=null;}},
  snapshot:()=>({keys:[...keys],pending:[...pending.keys()]}),
  sample(state,player,{mode='auto',aim}={}){
   for(const [key,request]of pending)if(clock()>request.until&&!keys.has(key))pending.delete(key);
   if(!playable(state,player)||player.cooldown>0)return {};
   const hasPuck=state.puck?.owner===player.id,manual={};let lifted=keys.has('shift');
   for(const [key,action]of Object.entries(actionKeys)){
    if(!keys.has(key)&&!pending.has(key))continue;
    if((action==='shoot'||action==='pass')&&!hasPuck||state.phase==='shootout'&&['check','poke','hook','slash','hold'].includes(action))continue;
    manual[action]=true;lifted ||= !!pending.get(key)?.lift;pending.delete(key);
   }
   if(Object.keys(manual).length){pending.delete(' ');return {...manual,lift:lifted};}
   const request=pending.get(' ');if(!request)return {};
   const choice=selectHockeyTriggerAction(state,player,{mode,aim});if(choice.action==='none')return {};
   // Collect consumes this press too, so holding the trigger cannot immediately release the puck.
   pending.delete(' ');return {...choice.input,lift:lifted||request.lift};
  }
 };
}

export function hockeyEditingTarget(element){return !!element&&(element.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName)||!!element.closest?.('[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));}

/** Bind actual key events; toolbar focus must not disable skating after a menu closes. */
export function bindHockeyKeyboard({target,document,canvas,inputs,enabled=()=>true,blocked=()=>false,hidden=()=>document.hidden,onView=()=>{},onCenter=()=>{},onTeamAction=()=>{},onNeutral=()=>{}}){
 const neutral=()=>{inputs.reset();onNeutral();};
 const down=event=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||!enabled()||blocked()||hockeyEditingTarget(document.activeElement)||hockeyEditingTarget(event.target))return;
  const key=String(event.key).toLowerCase(),movement=['shift',' ','arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'];
  if(isGameCameraToggleKey(event)){event.preventDefault();onView();return;}
  if(movement.includes(key)||actionKeys[key]){event.preventDefault();canvas.focus({preventScroll:true});inputs.press(key);}
  else if(key==='c'&&!event.repeat){event.preventDefault();onCenter();}
  else if(['x','l','g','t'].includes(key)&&!event.repeat){event.preventDefault();onTeamAction({x:'switch',l:'line',g:'goalie',t:'timeout'}[key]);}
 };
 const up=event=>inputs.release(String(event.key).toLowerCase());
 const visibility=()=>{if(hidden())neutral();};
 const focus=event=>{if(hockeyEditingTarget(event.target))neutral();};
 target.addEventListener('keydown',down);target.addEventListener('keyup',up);target.addEventListener('blur',neutral);document.addEventListener('visibilitychange',visibility);document.addEventListener('focusin',focus);
 return {reset:neutral,dispose(){target.removeEventListener('keydown',down);target.removeEventListener('keyup',up);target.removeEventListener('blur',neutral);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('focusin',focus);neutral();}};
}
