const defaults={power:.7,angle:55,mode:'assisted'};
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;

export function mountBasketballAim({stage,onOpen=()=>{}}){
  let saved={};try{saved=JSON.parse(localStorage.getItem('muzikazBasketballAim')||'{}')||{};}catch{}
  const state={power:clamp(saved.power,.1,1,.7),angle:clamp(saved.angle,20,80,55),mode:saved.mode==='manual'?'manual':'assisted'};
  const style=document.createElement('style');
  style.textContent=`
    .basketball-aim{box-sizing:border-box;width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;overscroll-behavior:contain;padding:18px;border:1px solid #bba374;border-radius:16px;background:#101e2d;color:#f5ead9;font:13px system-ui;box-shadow:0 12px 45px #0008;pointer-events:auto}
    .basketball-aim::backdrop{background:#000a}.basketball-aim header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.basketball-aim h2{margin:0;font:700 22px system-ui;color:#ffe2b1}.basketball-aim header small{display:block;color:#aec0d3;font-size:11px;margin-top:5px}.basketball-aim-body{display:grid;gap:15px}
    .basketball-aim label{display:grid;gap:6px;font-size:12px}.basketball-aim label>span{display:flex;justify-content:space-between}.basketball-aim [data-power-output],.basketball-aim [data-angle-output]{font-variant-numeric:tabular-nums;color:#ffd58f}
    .basketball-aim input[type=range]{width:100%;min-height:44px;accent-color:#c4f46e;touch-action:pan-x;margin:0}
    .basketball-aim select{width:100%;box-sizing:border-box;border:1px solid #50617a;border-radius:7px;padding:10px;background:#111f34;color:#fff;min-height:44px}
    .basketball-aim p{margin:0;font-size:11px;line-height:1.5;color:#c1cfdf}.basketball-aim [data-flight]{padding:10px;border:1px solid #626d73;border-radius:8px;color:#efc783;background:#0c1624}.basketball-aim details summary{padding:7px 0;cursor:pointer;font-size:12px;color:#c1cfdf}.basketball-aim details p{margin-top:5px}
    .basketball-aim button{width:auto!important;min-height:44px;border:1px solid #d8b27577;border-radius:8px;background:#1e314a;color:white;font:700 12px system-ui;padding:8px 13px;cursor:pointer}.basketball-aim header button{flex:0 0 44px;padding:0;font-size:24px}.basketball-aim footer{display:flex;gap:8px;margin-top:18px}.basketball-aim footer button{flex:1}.basketball-aim footer [data-close-aim]{background:#c4f46e;color:#172b14;border-color:#dcff9f}.basketball-aim :is(button,select,input,summary):focus-visible{outline:3px solid #ffdfac;outline-offset:2px}
    .basketball-aim-toggle{position:absolute;right:12px;bottom:104px;z-index:24;width:auto!important;min-height:44px;padding:8px 12px;border:1px solid #d8b27580;border-radius:10px;background:#0c1728ee;color:#f5ead9;font:700 12px system-ui;cursor:pointer}.basketball-aim-toggle[hidden],.basketball-world .basketball-aim-toggle{display:none!important}
  `;
  document.head.append(style);
  const root=document.createElement('dialog');root.className='basketball-aim';root.setAttribute('aria-labelledby','basketball-aim-title');
  root.innerHTML='<header><div><h2 id="basketball-aim-title">Aim &amp; power</h2><small>Your settings apply to shots, passes and tosses.</small></div><button type="button" data-close-aim aria-label="Close aim and power settings">×</button></header><div class="basketball-aim-body"><label><span>Throw power<span data-power-output></span></span><input type="range" name="basketball-power" aria-label="Basketball throw power" min="10" max="100" step="1"></label><label><span>Launch angle<span data-angle-output></span></span><input type="range" name="basketball-angle" aria-label="Basketball launch angle" min="20" max="80" step="1"></label><label>Aiming mode<select name="basketball-aim-mode" aria-label="Basketball aiming mode"><option value="assisted">Hoop assist</option><option value="manual">Free aim · look to direct</option></select></label><label>Flight preview<select name="basketball-preview" aria-label="Basketball flight preview"><option value="basketball-shoot">Shot at the hoop</option><option value="toss">Pass / free throw</option></select></label><p data-flight>Catch a ball to see its predicted flight.</p><details><summary>How aim and power work</summary><p>Hoop assist requires aiming within 13% of the line to your team’s net. Shots outside this window count as misses. At 70% power, the speed is calibrated for your distance and chosen angle. Adjust power to throw shorter or farther. Pass uses free aim.</p></details></div><footer><button type="button" data-calibrate>Calibrate shot</button><button type="button" data-close-aim>Back to game</button></footer>';
  stage.append(root);
  const launcher=document.createElement('button');launcher.type='button';launcher.className='basketball-aim-toggle';launcher.hidden=true;launcher.setAttribute('aria-label','Basketball aim and power settings');stage.append(launcher);
  let available=false;
  const power=root.querySelector('[name="basketball-power"]'),angle=root.querySelector('[name="basketball-angle"]'),mode=root.querySelector('[name="basketball-aim-mode"]');
  const refresh=()=>{power.value=Math.round(state.power*100);angle.value=state.angle;mode.value=state.mode;root.querySelector('[data-power-output]').textContent=`${Math.round(state.power*100)}%`;root.querySelector('[data-angle-output]').textContent=`${state.angle}°`;launcher.textContent=`Aim & power · ${Math.round(state.power*100)}% · ${state.angle}°`;};
  const save=()=>{try{localStorage.setItem('muzikazBasketballAim',JSON.stringify(state));}catch{}refresh();};
  power.addEventListener('input',()=>{state.power=Number(power.value)/100;save();});
  angle.addEventListener('input',()=>{state.angle=Number(angle.value);save();});
  mode.addEventListener('change',()=>{state.mode=mode.value;save();});
  root.querySelector('[data-calibrate]').onclick=()=>{Object.assign(state,defaults);save();};
  const open=()=>{if(!available||root.open)return;document.exitPointerLock?.();onOpen();root.showModal();};
  launcher.onclick=open;
  for(const button of root.querySelectorAll('[data-close-aim]'))button.onclick=()=>root.close();
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();root.close();return;}
    if(![power,angle].includes(event.target)||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))return;
    event.preventDefault();const isPower=event.target===power,min=isPower?10:20,max=isPower?100:80,change=['ArrowRight','ArrowUp','PageUp'].includes(event.key)?1:-1,step=event.key.startsWith('Page')?10:1;
    const current=isPower?Math.round(state.power*100):state.angle,next=event.key==='Home'?min:event.key==='End'?max:Math.max(min,Math.min(max,current+change*step));
    if(isPower)state.power=next/100;else state.angle=next;save();
  });
  refresh();
  return {
    open,
    close:()=>root.close(),
    options:()=>({...state}),
    previewAction:()=>root.querySelector('[name="basketball-preview"]').value,
    render({enabled,spectator,held,solution}){
      available=Boolean(enabled&&!spectator);
      launcher.hidden=!available||stage.classList.contains('basketball-world');
      if(!available&&root.open)root.close();
      const label=root.querySelector('[data-flight]');
      const speed=solution?Math.hypot(solution.velocity.x,solution.velocity.y,solution.velocity.z):0;
      const message=!held?'Catch a ball to see its predicted flight.':solution?.aimAligned===false?'Aim miss: outside 13% hoop alignment. Line up with the net before shooting.':solution?.reachable===false?'This angle cannot reach the hoop on a descending arc. Raise it or move closer.':solution?`${speed.toFixed(1)} m/s · ${solution.mode==='assisted'?'Hoop assist':'Free aim'} · dotted line previews your throw`:'This arc cannot reach the hoop from here. Raise the angle or move closer.';
      if(label.textContent!==message)label.textContent=message;
    }
  };
}
