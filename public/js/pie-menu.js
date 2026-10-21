// Reuse the real buttons so ownership checks, tool selection and dialogs keep their handlers.
export function mountPieMenu({container,selector=':scope > button',label='Quick actions',status=null,pageSize=6}){
 const buttons=[...container.querySelectorAll(selector)].filter(button=>!button.hidden);
 if(!buttons.length)return null;
 if(!document.querySelector('[data-pie-menu-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../assets/pie-menu.css',import.meta.url).href;style.dataset.pieMenuStyle='';document.head.append(style);}
 const root=document.createElement('section');root.className='game-pie-menu';root.setAttribute('aria-label',label);
 const wheel=document.createElement('div');wheel.className='game-pie-wheel';wheel.setAttribute('role','group');wheel.setAttribute('aria-label',label);
 const center=document.createElement('div');center.className='game-pie-center';const name=document.createElement('strong');name.textContent=label;const equipped=document.createElement('span');center.append(name,equipped);wheel.append(center);
 const navigation=document.createElement('nav');navigation.className='game-pie-navigation';navigation.setAttribute('aria-label',label+' pages');
 const previous=document.createElement('button'),next=document.createElement('button'),counter=document.createElement('output');
 previous.type=next.type='button';previous.textContent='←';next.textContent='→';previous.setAttribute('aria-label','Previous '+label+' page');next.setAttribute('aria-label','Next '+label+' page');counter.setAttribute('aria-live','polite');navigation.append(previous,counter,next);
 root.append(wheel,navigation);container.prepend(root);buttons.forEach(button=>{button.classList.add('game-pie-choice');wheel.append(button);});
 let page=0;const pages=Math.ceil(buttons.length/pageSize);
 function render(focus=false){
  const start=page*pageSize,count=Math.min(pageSize,buttons.length-start);
  buttons.forEach((button,index)=>{const visible=index>=start&&index<start+count;button.dataset.pieHidden=String(!visible);if(visible){const angle=(index-start)*2*Math.PI/count-Math.PI/2;button.style.setProperty('--pie-x',(50+36*Math.cos(angle))+'%');button.style.setProperty('--pie-y',(50+36*Math.sin(angle))+'%');}});
  counter.textContent=`${page+1} / ${pages}`;navigation.hidden=pages===1;previous.disabled=page===0;next.disabled=page===pages-1;
  if(focus)buttons.slice(start,start+count).find(button=>!button.disabled)?.focus({preventScroll:true});
 }
 previous.onclick=()=>{if(page>0){page--;render();}};next.onclick=()=>{if(page<pages-1){page++;render();}};
 wheel.addEventListener('keydown',event=>{const index=buttons.indexOf(document.activeElement);if(index<0)return;let step=0;if(['ArrowRight','ArrowDown'].includes(event.key))step=1;if(['ArrowLeft','ArrowUp'].includes(event.key))step=-1;if(!step)return;event.preventDefault();let target=index;for(let i=0;i<buttons.length;i++){target=(target+step+buttons.length)%buttons.length;if(!buttons[target].disabled&&!buttons[target].hidden)break;}page=Math.floor(target/pageSize);render();buttons[target].focus({preventScroll:true});});
 const sync=()=>{equipped.textContent=status?.textContent?.trim()||'Choose an action';};sync();const observer=status?new MutationObserver(sync):null;observer?.observe(status,{childList:true,subtree:true,characterData:true});render();
 return {root,buttons,dispose(){observer?.disconnect();buttons.forEach(button=>{button.classList.remove('game-pie-choice');delete button.dataset.pieHidden;container.append(button);});root.remove();}};
}
