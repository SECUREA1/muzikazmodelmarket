// A small, non-modal action strip: movement and the scene stay available.
export function mountPingPongUI({stage,toolbar=stage,action,announce=()=>{},focus=()=>{}}){
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../assets/ping-pong.css',import.meta.url).href;document.head.append(link);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='ping-pong-toggle';toggle.textContent='Ping-pong';toggle.title='Open ping-pong controls';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','ping-pong-controls');toolbar.append(toggle);
 const panel=document.createElement('section');panel.id='ping-pong-controls';panel.className='ping-pong-controls';panel.dataset.gameplayBlocking='false';panel.setAttribute('aria-label','Ping-pong controls');panel.hidden=true;
 panel.innerHTML='<header><strong>Ping-pong</strong><button type="button" data-ping-close aria-label="Close ping-pong controls">×</button></header><span data-ping-rally>Rally 0</span><label>Rally partner <select aria-label="Ping-pong partner"><option value="ai">AI practice partner</option></select></label><div class="ping-pong-buttons"><button type="button" data-ping-action="equip">Draw paddle · P</button><button type="button" data-ping-action="serve">Serve · B</button><button type="button" data-ping-action="forehand">Forehand · J</button><button type="button" data-ping-action="backhand">Backhand · K</button><button type="button" data-ping-action="stow">Put away · P</button></div><p data-ping-message role="status"></p><small>P draw / stow · J / K swing · B serve. Click / tap the scene to swing. Face your partner and meet the returning ball.</small>';
 stage.append(panel);let equipped=false,busy=false,lastMessage='',signature='';
 function setOpen(open){panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));}
 const close=()=>{setOpen(false);toggle.focus({preventScroll:true});};
 async function run(operation){if(busy)return false;busy=true;try{await action(operation,{targetId:panel.querySelector('select').value});focus();return true;}catch(error){announce(error.message);return false;}finally{busy=false;}}
 toggle.addEventListener('click',()=>setOpen(panel.hidden));
 panel.querySelector('[data-ping-close]').addEventListener('click',close);
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
 const outside=event=>{if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target))setOpen(false);};
 document.addEventListener('pointerdown',outside);
 panel.addEventListener('click',event=>{const button=event.target.closest('[data-ping-action]');if(button)void run(button.dataset.pingAction);});
 function update(snapshot,selfId){
  const self=snapshot?.players?.[selfId],state=self?.pingPong,wasEquipped=equipped;equipped=state?.equipped===true;
  if(equipped!==wasEquipped)setOpen(equipped);
  for(const button of panel.querySelectorAll('[data-ping-action]'))button.hidden=button.dataset.pingAction==='equip'?equipped:!equipped;
  const opponents=Object.entries(snapshot?.players||{}).filter(([id,p])=>id!==selfId&&p.health>0&&p.pingPong?.equipped&&Math.hypot(p.position.x-(self?.position?.x||0),p.position.z-(self?.position?.z||0))<=14).map(([id,p])=>[id,p.username||'Player']);
  for(const [id,a] of Object.entries(snapshot?.actors||{}))if(a.resident&&a.active!==false&&Math.hypot(a.position.x-(self?.position?.x||0),a.position.z-(self?.position?.z||0))<=12)opponents.push([id,(a.resident.name||a.name||'Resident')+' · AI']);
  const next=JSON.stringify(opponents),select=panel.querySelector('select');if(next!==signature){signature=next;const chosen=select.value;select.replaceChildren(new Option('AI practice partner','ai'),...opponents.map(([id,name])=>new Option(name,id)));if([...select.options].some(o=>o.value===chosen))select.value=chosen;}
  panel.querySelector('[data-ping-rally]').textContent='Rally '+(state?.rally||0)+' · Best '+(state?.bestRally||0);
  const message=state?.message||'Serve to begin. Your partner returns the ball; time your next swing.';if(message!==lastMessage){lastMessage=message;panel.querySelector('[data-ping-message]').textContent=message;}
 }
 return {update,run,equipped:()=>equipped,reset(){setOpen(false);update(null,null);lastMessage='';signature='';},dispose(){document.removeEventListener('pointerdown',outside);toggle.remove();panel.remove();link.remove();}};
}
