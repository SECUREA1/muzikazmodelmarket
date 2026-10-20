import {sportIcon} from './sports-action-bar.js';
let aimDialogCount=0;
const defaults={power:.7,angle:55,mode:'assisted'};
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;

export function mountBasketballAim({stage,onOpen=()=>{}}){
  let saved={};try{saved=JSON.parse(localStorage.getItem('muzikazBasketballAim')||'{}')||{};}catch{}
  const state={power:clamp(saved.power,.1,1,.7),angle:clamp(saved.angle,20,80,55),mode:saved.mode==='manual'?'manual':'assisted'};
  const style=document.createElement('style');
  style.textContent=`
    .basketball-aim[hidden]{display:none!important}
    .basketball-aim{position:absolute;right:14px;bottom:104px;z-index:24;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:44px!important;min-width:44px;min-height:44px;padding:6px!important;border:1px solid #71849788;border-radius:9px;background:#111f2ff2;color:#f5ead9;cursor:pointer;pointer-events:auto;touch-action:manipulation}
    .basketball-aim svg{width:21px;height:21px}.basketball-aim.basketball-aim-docked{position:relative;inset:auto;flex:0 0 44px}
    .basketball-aim[aria-expanded=true]{border-color:#e9ba72;background:#293b4f}
    .basketball-aim-dialog{box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);padding:0;border:1px solid #8b9db3;border-radius:16px;background:#0c1728;color:#f5ead9;font:14px system-ui;box-shadow:0 16px 70px #0008;overflow:hidden;overscroll-behavior:contain}
    .basketball-aim-dialog[open]{display:flex;flex-direction:column}.basketball-aim-dialog::backdrop{background:#000b}
    .basketball-aim-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #526175;flex:none}
    .basketball-aim-dialog h2{margin:0;font-size:20px}.basketball-aim-dialog header p{margin:4px 0 0;color:#bdcddd;font-size:12px}
    .basketball-aim-body{min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:18px 16px;display:grid;gap:18px}
    .basketball-aim-body label{display:grid;gap:8px;font-size:14px}.basketball-aim-body label>span{display:flex;justify-content:space-between;gap:8px}.basketball-aim-dialog [data-power-output],.basketball-aim-dialog [data-angle-output]{font-variant-numeric:tabular-nums;color:#ffd58f}
    .basketball-aim-body input[type=range]{box-sizing:border-box;width:100%;min-width:0;min-height:44px;accent-color:#e9ba72;touch-action:pan-y;margin:0}
    .basketball-aim-body select{box-sizing:border-box;width:100%;min-width:0;border:1px solid #657b98;border-radius:7px;padding:10px;background:#111f34;color:#fff;min-height:44px;font:16px system-ui}
    .basketball-aim-body p{margin:0;font-size:12px;line-height:1.5;color:#c1cfdf}.basketball-aim-dialog [data-flight]{color:#efc783}.basketball-aim-body summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:700}.basketball-aim-body details p{padding:4px 0 10px}
    .basketball-aim-dialog button{box-sizing:border-box;width:auto!important;min-width:44px;min-height:44px;border:1px solid #718497;border-radius:8px;background:#1e314a;color:white;font:700 13px system-ui;padding:8px 12px;cursor:pointer;touch-action:manipulation}
    .basketball-aim-dialog footer{display:flex;justify-content:space-between;gap:10px;flex:none;padding:12px 16px max(12px,env(safe-area-inset-bottom));border-top:1px solid #526175;background:#0c1728}.basketball-aim-dialog [data-done]{background:#c7f36a;color:#10200b;min-width:90px}
    .basketball-aim-dialog :focus-visible,.basketball-aim:focus-visible{outline:3px solid #ffd58f;outline-offset:2px}
    @media(max-height:480px){.basketball-aim-dialog header{padding:8px 12px}.basketball-aim-body{padding:10px 12px;gap:12px}.basketball-aim-dialog footer{padding:8px 12px}}
  `;
  document.head.append(style);
  const root=document.createElement('button');root.type='button';root.className='basketball-aim';root.hidden=true;
  root.setAttribute('aria-label','Basketball throw settings');root.title='Basketball throw settings';root.setAttribute('aria-haspopup','dialog');root.setAttribute('aria-expanded','false');
  root.innerHTML=sportIcon('aim')+'<span data-summary hidden></span>';
  const tools=stage.querySelector('.sports-action-header');if(tools){tools.insertBefore(root,tools.lastElementChild);root.classList.add('basketball-aim-docked');}else stage.append(root);
  const dialog=document.createElement('dialog');dialog.className='basketball-aim-dialog';dialog.id='basketball-throw-settings-'+(++aimDialogCount);root.setAttribute('aria-controls',dialog.id);dialog.setAttribute('aria-label','Basketball throw settings');
  dialog.innerHTML='<header><div><h2>Throw settings</h2><p>Changes save automatically.</p></div><button type="button" data-close aria-label="Close throw settings" autofocus>×</button></header><div class="basketball-aim-body"><label><span>Throw power<output data-power-output></output></span><input type="range" name="basketball-power" aria-label="Basketball throw power" min="10" max="100" step="1"></label><label><span>Launch angle<output data-angle-output></output></span><input type="range" name="basketball-angle" aria-label="Basketball launch angle" min="20" max="80" step="1"></label><label>Aiming mode<select name="basketball-aim-mode" aria-label="Basketball aiming mode"><option value="assisted">Hoop assist</option><option value="manual">Free aim · look to direct</option></select></label><label>Flight preview<select name="basketball-preview" aria-label="Basketball flight preview"><option value="basketball-shoot">Shot at the hoop</option><option value="toss">Pass / free throw</option></select></label><p data-flight aria-live="polite">Catch a ball to see its predicted flight.</p><details><summary>How aiming works</summary><p>Hoop assist requires aiming within 13% of the line to your team’s net. Shots outside this window count as misses. At 70% power, speed is calibrated for your distance and chosen angle. Adjust power to throw shorter or farther. Pass uses free aim.</p></details></div><footer><button type="button" data-calibrate>Reset calibration</button><button type="button" data-done>Done</button></footer>';
  (document.fullscreenElement||document.body).append(dialog);
  const power=dialog.querySelector('[name="basketball-power"]'),angle=dialog.querySelector('[name="basketball-angle"]'),mode=dialog.querySelector('[name="basketball-aim-mode"]');
  const close=()=>{if(dialog.open)dialog.close();};
  root.onclick=()=>{if(root.hidden||dialog.open)return;onOpen();(document.fullscreenElement||document.body).append(dialog);dialog.showModal();root.setAttribute('aria-expanded','true');dialog.querySelector('.basketball-aim-body').scrollTop=0;};
  dialog.querySelector('[data-close]').onclick=close;dialog.querySelector('[data-done]').onclick=close;
  dialog.addEventListener('close',()=>{root.setAttribute('aria-expanded','false');if(!root.hidden)root.focus({preventScroll:true});});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  let backdropPressed=false;
  const outside=event=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};
  dialog.addEventListener('pointerdown',event=>{backdropPressed=event.target===dialog&&outside(event);event.stopPropagation();});
  dialog.addEventListener('click',event=>{if(backdropPressed&&event.target===dialog&&outside(event))close();backdropPressed=false;event.stopPropagation();});
  const refresh=()=>{power.value=Math.round(state.power*100);angle.value=state.angle;mode.value=state.mode;dialog.querySelector('[data-power-output]').textContent=`${Math.round(state.power*100)}%`;dialog.querySelector('[data-angle-output]').textContent=`${state.angle}°`;root.querySelector('[data-summary]').textContent=`${Math.round(state.power*100)}% · ${state.angle}°`;};
  const save=()=>{try{localStorage.setItem('muzikazBasketballAim',JSON.stringify(state));}catch{}refresh();};
  power.addEventListener('input',()=>{state.power=Number(power.value)/100;save();});
  angle.addEventListener('input',()=>{state.angle=Number(angle.value);save();});
  mode.addEventListener('change',()=>{state.mode=mode.value;save();});
  dialog.querySelector('[data-calibrate]').onclick=()=>{Object.assign(state,defaults);save();};
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(![power,angle].includes(event.target)||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))return;
    event.preventDefault();const isPower=event.target===power,min=isPower?10:20,max=isPower?100:80,change=['ArrowRight','ArrowUp','PageUp'].includes(event.key)?1:-1,step=event.key.startsWith('Page')?10:1;
    const current=isPower?Math.round(state.power*100):state.angle,next=event.key==='Home'?min:event.key==='End'?max:Math.max(min,Math.min(max,current+change*step));
    if(isPower)state.power=next/100;else state.angle=next;save();
  });
  refresh();
  return {
    options:()=>({...state}),
    previewAction:()=>dialog.querySelector('[name="basketball-preview"]').value,
    render({enabled,spectator,held,solution}){
      root.hidden=!enabled||spectator;if(root.hidden)close();
      const label=dialog.querySelector('[data-flight]');
      const speed=solution?Math.hypot(solution.velocity.x,solution.velocity.y,solution.velocity.z):0;
      const message=!held?'Catch a ball to see its predicted flight.':solution?.aimAligned===false?'Aim miss: outside 13% hoop alignment. Line up with the net before shooting.':solution?.reachable===false?'This angle cannot reach the hoop on a descending arc. Raise it or move closer.':solution?`${speed.toFixed(1)} m/s · ${solution.mode==='assisted'?'Hoop assist':'Free aim'} · dotted line previews your throw`:'This arc cannot reach the hoop from here. Raise the angle or move closer.';
      if(label.textContent!==message)label.textContent=message;
    }
  };
}
