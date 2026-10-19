const defaults={power:.7,angle:55,mode:'assisted'};
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;

export function mountBasketballAim({stage}){
  let saved={};try{saved=JSON.parse(localStorage.getItem('muzikazBasketballAim')||'{}')||{};}catch{}
  const state={power:clamp(saved.power,.1,1,.7),angle:clamp(saved.angle,20,80,55),mode:saved.mode==='manual'?'manual':'assisted'};
  const style=document.createElement('style');
  style.textContent=`
    .basketball-aim[hidden]{display:none!important}
    .basketball-aim{position:absolute;right:8px;bottom:8px;z-index:24;width:max-content;max-width:calc(100% - 16px);padding:0;border:1px solid #d8b27580;border-radius:10px;background:#0c1728ee;color:#f5ead9;font:12px system-ui;box-shadow:0 8px 25px #0004}
    .basketball-aim summary{padding:10px 12px;cursor:pointer;min-height:44px;box-sizing:border-box;display:flex;align-items:center;gap:5px;font-weight:700;list-style-position:inside}
    .basketball-aim[open]{width:min(290px,calc(100% - 16px));max-height:calc(100% - 70px);overflow-y:auto;overscroll-behavior:contain}
    .basketball-aim-body{padding:0 14px 13px;display:grid;gap:11px}
    .basketball-aim label{display:grid;gap:5px;font-size:12px}.basketball-aim label span{display:flex;justify-content:space-between}.basketball-aim [data-summary],.basketball-aim [data-power-output],.basketball-aim [data-angle-output]{font-variant-numeric:tabular-nums;color:#ffd58f}
    .basketball-aim input[type=range]{width:100%;min-height:44px;accent-color:#e9ba72;touch-action:pan-x;margin:0}
    .basketball-aim select{width:100%;border:1px solid #50617a;border-radius:5px;padding:8px;background:#111f34;color:#fff;min-height:44px;font-size:16px}
    .basketball-aim p{margin:0;font-size:10px;line-height:1.4;color:#c1cfdf}.basketball-aim [data-flight]{color:#efc783}
    .basketball-aim button{width:auto!important;min-height:44px;border:1px solid #d8b27577;border-radius:5px;background:#1e314a;color:white;font:700 11px system-ui;padding:6px 10px;cursor:pointer}
    @media(max-width:600px){.basketball-aim{bottom:8px;right:8px;font-size:11px}.basketball-aim summary{padding:10px 12px}}
  `;
  document.head.append(style);
  const root=document.createElement('details');root.className='basketball-aim';root.hidden=true;
  root.innerHTML='<summary>Aim &amp; power · <span data-summary></span></summary><div class="basketball-aim-body"><label><span>Throw power<span data-power-output></span></span><input type="range" name="basketball-power" aria-label="Basketball throw power" min="10" max="100" step="1"></label><label><span>Launch angle<span data-angle-output></span></span><input type="range" name="basketball-angle" aria-label="Basketball launch angle" min="20" max="80" step="1"></label><label>Aiming mode<select name="basketball-aim-mode" aria-label="Basketball aiming mode"><option value="assisted">Hoop assist</option><option value="manual">Free aim · look to direct</option></select></label><label>Flight preview<select name="basketball-preview" aria-label="Basketball flight preview"><option value="basketball-shoot">Shot at the hoop</option><option value="toss">Pass / free throw</option></select></label><p>Hoop assist requires aiming within 13% of the line to your team’s net. Shots outside this window count as misses. At 70% power, the speed is calibrated for your distance and chosen angle. Adjust power to throw shorter or farther. Pass uses free aim.</p><p data-flight>Catch a ball to see its predicted flight.</p><button type="button" data-calibrate>Calibrate shot</button></div>';
  stage.append(root);
  const power=root.querySelector('[name="basketball-power"]'),angle=root.querySelector('[name="basketball-angle"]'),mode=root.querySelector('[name="basketball-aim-mode"]');
  const refresh=()=>{power.value=Math.round(state.power*100);angle.value=state.angle;mode.value=state.mode;root.querySelector('[data-power-output]').textContent=`${Math.round(state.power*100)}%`;root.querySelector('[data-angle-output]').textContent=`${state.angle}°`;root.querySelector('[data-summary]').textContent=`${Math.round(state.power*100)}% · ${state.angle}°`;};
  const save=()=>{try{localStorage.setItem('muzikazBasketballAim',JSON.stringify(state));}catch{}refresh();};
  power.addEventListener('input',()=>{state.power=Number(power.value)/100;save();});
  angle.addEventListener('input',()=>{state.angle=Number(angle.value);save();});
  mode.addEventListener('change',()=>{state.mode=mode.value;save();});
  root.querySelector('[data-calibrate]').onclick=()=>{Object.assign(state,defaults);save();};
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(![power,angle].includes(event.target)||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))return;
    event.preventDefault();const isPower=event.target===power,min=isPower?10:20,max=isPower?100:80,change=['ArrowRight','ArrowUp','PageUp'].includes(event.key)?1:-1,step=event.key.startsWith('Page')?10:1;
    const current=isPower?Math.round(state.power*100):state.angle,next=event.key==='Home'?min:event.key==='End'?max:Math.max(min,Math.min(max,current+change*step));
    if(isPower)state.power=next/100;else state.angle=next;save();
  });
  refresh();
  return {
    options:()=>({...state}),
    previewAction:()=>root.querySelector('[name="basketball-preview"]').value,
    render({enabled,spectator,held,solution}){
      root.hidden=!enabled||spectator;if(root.hidden)root.open=false;
      const label=root.querySelector('[data-flight]');
      const speed=solution?Math.hypot(solution.velocity.x,solution.velocity.y,solution.velocity.z):0;
      const message=!held?'Catch a ball to see its predicted flight.':solution?.aimAligned===false?'Aim miss: outside 13% hoop alignment. Line up with the net before shooting.':solution?.reachable===false?'This angle cannot reach the hoop on a descending arc. Raise it or move closer.':solution?`${speed.toFixed(1)} m/s · ${solution.mode==='assisted'?'Hoop assist':'Free aim'} · dotted line previews your throw`:'This arc cannot reach the hoop from here. Raise the angle or move closer.';
      if(label.textContent!==message)label.textContent=message;
    }
  };
}
