const displays=new WeakMap();
// This is a companion status display. It never captures movement or pointer input.
export function gameActionLoading(stage){
 if(displays.has(stage))return displays.get(stage);
 const style=document.createElement('style');style.textContent='.game-action-loading{position:fixed;top:max(64px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:10020;max-width:calc(100vw - 32px);width:340px;box-sizing:border-box;padding:12px 16px;border:1px solid #9cdbad;border-radius:12px;background:#102b27f5;color:#f3fff3;box-shadow:0 8px 30px #0006;pointer-events:none;font:600 14px system-ui}.game-action-loading[hidden]{display:none}.game-action-loading progress{display:block;width:100%;height:8px;margin-top:9px;accent-color:#a5ed90}.game-action-loading[data-state=error]{border-color:#ff9a91}.game-action-loading small{display:block;margin-top:5px;font-weight:400;color:#d0e0d3}';document.head.append(style);
 const root=document.createElement('section');root.className='game-action-loading';root.hidden=true;root.dataset.gameplayBlocking='false';root.setAttribute('role','status');root.setAttribute('aria-live','polite');
 const label=document.createElement('strong'),detail=document.createElement('small'),progress=document.createElement('progress');progress.setAttribute('aria-label','Action in progress');root.append(label,detail,progress);document.body.append(root);
 let revision=0,dismiss=null,slow=null;
 const api={root,begin(text){const token=++revision;let settled=false;clearTimeout(dismiss);clearTimeout(slow);(document.fullscreenElement||stage.closest('.house-explorer-shell')||document.body).append(root);root.hidden=false;root.dataset.state='loading';root.setAttribute('aria-busy','true');label.textContent=text;detail.textContent='Connecting and preparing your controls…';progress.hidden=false;
  slow=setTimeout(()=>{if(token===revision)detail.textContent='Still connecting. You can keep using your movement controls.';},4000);
  const settle=(message,error=false)=>{if(token!==revision||settled)return;settled=true;clearTimeout(slow);root.dataset.state=error?'error':'ready';root.setAttribute('aria-busy','false');label.textContent=message;detail.textContent=error?'Try again or select another destination.':'Movement controls remain available.';progress.hidden=true;dismiss=setTimeout(()=>{if(token===revision)root.hidden=true;},error?6500:1800);};
  return {update(text){if(token===revision)label.textContent=text;},finish(message='Ready. Controls open.'){settle(message);},fail(message='Unable to complete this action.'){settle(message,true);}};
 },dispose(){revision++;clearTimeout(dismiss);clearTimeout(slow);root.remove();style.remove();displays.delete(stage);}};
 displays.set(stage,api);return api;
}

export async function waitForVehiclePresentation({getRoot,isCurrent=()=>true,timeoutMs=10000,now=()=>performance.now(),frame=()=>new Promise(resolve=>requestAnimationFrame(resolve))}){
 const started=now();
 while(isCurrent()&&!getRoot()&&now()-started<timeoutMs)await frame();
 return isCurrent()&&!!getRoot();
}
