// An on-demand, non-modal popup. Closing it leaves the paddle and rally active.
export function mountPingPongUI({stage,action,announce=()=>{},focus=()=>{}}){
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/ping-pong.css',import.meta.url).href;document.head.append(link);
 const panel=document.createElement('section');panel.id='ping-pong-controls';panel.className='ping-pong-controls';panel.dataset.gameplayBlocking='false';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label','Ping-pong controls');panel.hidden=true;
 panel.innerHTML='<header><strong>Ping-pong</strong><span data-ping-rally>Rally 0</span><button type="button" data-ping-close aria-label="Hide ping-pong controls" title="Hide controls · Escape">×</button></header><label class="ping-pong-partner"><span>Partner</span><select aria-label="Ping-pong partner"><option value="ai">AI practice partner</option></select></label><div class="ping-pong-buttons"><button type="button" data-ping-action="serve" title="Serve · B">Serve</button><button type="button" data-ping-action="stow" title="Put paddle away · P">Stow</button><button type="button" data-ping-action="forehand" title="Forehand · J">Forehand</button><button type="button" data-ping-action="backhand" title="Backhand · K">Backhand</button></div><p data-ping-message role="status"></p><details data-ping-help><summary>How to play <span data-ping-best>Best 0</span></summary><p>Face your partner. Meet the ball with Forehand or Backhand. Click / tap the scene to swing.</p><p>P draw / stow · B serve · J / K swing. Hide these controls with × or Escape; reopen from Tools → Ping-pong.</p></details>';
 stage.append(panel);let equipped=false,busy=false,opened=false,lastMessage='',signature='',disposed=false;
 function open(){if(disposed||!equipped)return false;opened=true;panel.hidden=false;return true;}
 function close({returnFocus=true}={}){opened=false;panel.hidden=true;panel.querySelector('details').open=false;if(returnFocus)focus();}
 async function run(operation){
  if(busy||disposed)return false;busy=true;
  try{const result=await action(operation,{targetId:panel.querySelector('select').value});if(result===false)return false;if(operation==='equip')open();if(operation==='stow')close({returnFocus:false});focus();return true;}
  catch(error){announce(error.message);return false;}
  finally{busy=false;}
 }
 panel.addEventListener('click',event=>{if(event.target.closest('[data-ping-close]')){close();return;}const button=event.target.closest('[data-ping-action]');if(button)void run(button.dataset.pingAction);});
 const outside=event=>{if(opened&&!panel.contains(event.target)&&!event.target.closest?.('[data-ping-open]'))close({returnFocus:false});};
 const escape=event=>{if(opened&&event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopImmediatePropagation();close();}};
 document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',escape,true);
 function update(snapshot,selfId){
  const self=snapshot?.players?.[selfId],state=self?.pingPong,wasEquipped=equipped;equipped=state?.equipped===true;
  if(!equipped)close({returnFocus:false});else if(!wasEquipped)open();
  const opponents=Object.entries(snapshot?.players||{}).filter(([id,p])=>id!==selfId&&p.health>0&&p.pingPong?.equipped&&Math.hypot(p.position.x-(self?.position?.x||0),p.position.z-(self?.position?.z||0))<=14).map(([id,p])=>[id,p.username||'Player']);
  for(const [id,a] of Object.entries(snapshot?.actors||{}))if(a.resident&&a.active!==false&&Math.hypot(a.position.x-(self?.position?.x||0),a.position.z-(self?.position?.z||0))<=12)opponents.push([id,(a.resident.name||a.name||'Resident')+' · AI']);
  const next=JSON.stringify(opponents),select=panel.querySelector('select');if(next!==signature){signature=next;const chosen=select.value;select.replaceChildren(new Option('AI practice partner','ai'),...opponents.map(([id,name])=>new Option(name,id)));if([...select.options].some(o=>o.value===chosen))select.value=chosen;}
  panel.querySelector('[data-ping-rally]').textContent='Rally '+(state?.rally||0);panel.querySelector('[data-ping-best]').textContent='Best '+(state?.bestRally||0);
  const balls=Array.isArray(snapshot?.pingPong?.balls)?snapshot.pingPong.balls:Object.values(snapshot?.pingPong?.balls||{}),ball=balls.find(ball=>[ball.ownerId,ball.targetId,ball.lastHitId].includes(selfId)),flying=ball?.status==='flying';
  panel.querySelector('[data-ping-action="serve"]').disabled=flying===true;select.disabled=flying===true;
  const near=ball&&self?.position&&Math.hypot(ball.position.x-self.position.x,ball.position.y-self.position.y-1.12,ball.position.z-self.position.z)<=2.1;
  const message=flying?(ball.targetId===selfId?(near?'Swing now · forehand / backhand':'Ball incoming…'):"Partner’s turn"):ball?.status==='missed'?'Missed · serve again':'Choose a partner, then serve.';
  if(message!==lastMessage){lastMessage=message;panel.querySelector('[data-ping-message]').textContent=message;}
 }
 return {update,run,open,close,visible:()=>opened,equipped:()=>equipped,reset(){update(null,null);lastMessage='';signature='';},dispose(){close({returnFocus:false});disposed=true;document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',escape,true);panel.remove();link.remove();}};
}
