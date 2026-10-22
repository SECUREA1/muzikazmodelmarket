// A new load cancels every delayed dismissal belonging to the previous load.
export function createGameLoadingDisplay({root,stage,reducedMotion=false,schedule=()=>{}}){
 const title=root?.querySelector('[data-level-loader-title]'),message=root?.querySelector('[data-level-loader-message]'),fill=root?.querySelector('[data-level-loader-fill]'),percent=root?.querySelector('[data-level-loader-percent]'),scale=root?.querySelector('.house-level-loader__scale');
 let progress=0,timer=null;
 function update(value,text){progress=Math.max(progress,Math.min(100,Math.round(value)));if(message&&text)message.textContent=text;if(fill)fill.style.width=progress+'%';if(percent)percent.textContent=progress+'%';scale?.setAttribute('aria-valuenow',String(progress));}
 function dismiss(delay){clearTimeout(timer);timer=setTimeout(()=>{if(root)root.hidden=true;stage.classList.remove('is-level-transitioning');stage.setAttribute('aria-busy','false');schedule();},delay);}
 return {update,show(level,text){clearTimeout(timer);progress=0;if(title)title.textContent='Preparing level '+level;update(4,text);if(root)root.hidden=false;stage.classList.add('is-level-transitioning');stage.setAttribute('aria-busy','true');schedule();},finish(){update(100,'World ready. Returning to the game…');dismiss(reducedMotion?0:260);},fail(text){if(message)message.textContent=text||'Unable to load this world. Choose another map or retry.';dismiss(900);}};
}
