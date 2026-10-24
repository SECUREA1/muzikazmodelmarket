const SVG_NS='http://www.w3.org/2000/svg';
function sectorPath(index,count){
 const step=Math.PI*2/count,gap=.018,start=-Math.PI/2+index*step-step/2+gap,end=start+step-gap*2;
 const point=(radius,angle)=>`${50+radius*Math.cos(angle)},${50+radius*Math.sin(angle)}`;
 // Use two arcs even for a one-item page so the full ring remains a valid path.
 const middle=(start+end)/2;
 return `M${point(49,start)} A49 49 0 0 1 ${point(49,middle)} A49 49 0 0 1 ${point(49,end)} L${point(25,end)} A25 25 0 0 0 ${point(25,middle)} A25 25 0 0 0 ${point(25,start)} Z`;
}
function itemDetails(button){
 return {title:button.dataset.pieTitle||button.querySelector('span')?.textContent?.trim()||button.getAttribute('aria-label')||button.textContent.trim(),description:button.dataset.pieDescription||button.querySelector('small')?.textContent?.trim()||button.title||'Select this action to continue.',image:button.dataset.pieImage,meta:button.dataset.pieMeta,actionLabel:button.dataset.pieAction||'Select'};
}
// Keep the real buttons: ownership checks, tool selection and dialog handlers remain authoritative.
// preview may be true or a function returning {title,description,image,meta,actionLabel}.
export function mountPieMenu({container,selector=':scope > button',label='Quick actions',status=null,pageSize=6,preview=false,onPreview=null}){
 let buttons=[...container.querySelectorAll(selector)].filter(button=>!button.hidden);
 if(!buttons.length)return null;
 pageSize=Math.max(1,Math.min(8,Math.floor(Number(pageSize)||6)));
 if(!document.querySelector('[data-pie-menu-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../assets/pie-menu.css',import.meta.url).href;style.dataset.pieMenuStyle='';document.head.append(style);}
 const root=document.createElement('section');root.className='game-pie-menu';root.setAttribute('aria-label',label);
 const picker=document.createElement('div');picker.className='game-pie-picker';
 const wheel=document.createElement('div');wheel.className='game-pie-wheel';wheel.setAttribute('role','group');wheel.setAttribute('aria-label',label);
 const sectors=document.createElementNS(SVG_NS,'svg');sectors.classList.add('game-pie-sectors');sectors.setAttribute('viewBox','0 0 100 100');sectors.setAttribute('aria-hidden','true');sectors.setAttribute('focusable','false');wheel.append(sectors);
 const center=document.createElement('div');center.className='game-pie-center';const name=document.createElement('strong');name.textContent=label;const equipped=document.createElement('span');center.append(name,equipped);wheel.append(center);
 const navigation=document.createElement('nav');navigation.className='game-pie-navigation';navigation.setAttribute('aria-label',label+' pages');
 const previous=document.createElement('button'),next=document.createElement('button'),counter=document.createElement('output');
 previous.type=next.type='button';previous.textContent='←';next.textContent='→';previous.setAttribute('aria-label','Previous '+label+' page');next.setAttribute('aria-label','Next '+label+' page');counter.setAttribute('aria-live','polite');navigation.append(previous,counter,next);
 picker.append(wheel,navigation);root.append(picker);container.prepend(root);
 let page=0,current=null,paths=new Map(),disposed=false;
 const visibleButtons=()=>buttons.filter(button=>!button.hidden);
 let detail,art,title,description,meta,action;
 if(preview){
  root.classList.add('has-preview');detail=document.createElement('aside');detail.className='game-pie-preview';detail.setAttribute('aria-label',label+' preview');
  art=document.createElement('div');art.className='game-pie-preview-art';art.setAttribute('aria-hidden','true');
  const kicker=document.createElement('small');kicker.className='game-pie-preview-kicker';kicker.textContent='SELECTION PREVIEW';title=document.createElement('h4');description=document.createElement('p');meta=document.createElement('p');meta.className='game-pie-preview-meta';action=document.createElement('button');action.type='button';action.className='game-pie-preview-action';action.onclick=()=>{if(current&&!current.disabled&&!current.hidden)current.click();};detail.append(art,kicker,title,description,meta,action);root.append(detail);
 }
 function showPreview(button){
  if(!buttons.includes(button)||button.hidden)return;
  const changed=current!==button;current=button;
  for(const [choice,path]of paths)path.classList.toggle('is-previewed',choice===current);
  if(changed)onPreview?.(button);
  if(!preview)return;
  const details={...itemDetails(button),...(typeof preview==='function'?preview(button):{})};
  title.textContent=details.title;description.textContent=details.description;meta.textContent=details.meta||'';meta.hidden=!details.meta;
  action.textContent=details.actionLabel||'Select';action.disabled=button.disabled;action.setAttribute('aria-label',`${action.textContent} ${details.title}`);
  art.replaceChildren();
  if(details.image){const image=document.createElement('img');image.src=details.image;image.alt='';image.loading='lazy';image.addEventListener('error',()=>{image.remove();art.classList.add('is-empty');},{once:true});art.classList.remove('is-empty');art.append(image);}
  else{const source=button.querySelector('svg,img');if(source){const icon=source.cloneNode(true);icon.removeAttribute('id');icon.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));art.classList.remove('is-empty');art.append(icon);}else{art.classList.add('is-empty');art.textContent=details.title?.slice(0,1)||'◉';}}
 }
 const enter=event=>{const button=event.target.closest?.('button.game-pie-choice');if(button&&wheel.contains(button))showPreview(button);};
 wheel.addEventListener('pointermove',enter);wheel.addEventListener('focusin',enter);wheel.addEventListener('click',enter);
 function render(preferred=null){
  if(disposed)return;
  const available=visibleButtons(),pages=Math.max(1,Math.ceil(available.length/pageSize));page=Math.max(0,Math.min(page,pages-1));
  const start=page*pageSize,choices=available.slice(start,start+pageSize),count=choices.length;
  sectors.replaceChildren();paths=new Map();
  for(const button of buttons){const index=choices.indexOf(button);button.dataset.pieHidden=String(index<0);if(index<0)continue;
   const angle=index*2*Math.PI/count-Math.PI/2;button.style.setProperty('--pie-x',(50+36*Math.cos(angle))+'%');button.style.setProperty('--pie-y',(50+36*Math.sin(angle))+'%');
   const path=document.createElementNS(SVG_NS,'path');path.setAttribute('d',sectorPath(index,count));path.classList.add('game-pie-sector');path.classList.toggle('is-selected',button.getAttribute('aria-pressed')==='true');path.classList.toggle('is-disabled',button.disabled);path.dataset.pieIndex=String(buttons.indexOf(button));path.addEventListener('pointermove',()=>showPreview(button));path.addEventListener('click',()=>{if(!button.disabled&&!button.hidden){showPreview(button);button.click();}});sectors.append(path);paths.set(button,path);
  }
  counter.textContent=`${page+1} / ${pages}`;navigation.hidden=pages===1;previous.disabled=page===0;next.disabled=page===pages-1;
  const target=choices.includes(preferred)?preferred:choices.includes(current)?current:choices.find(button=>button.getAttribute('aria-pressed')==='true')||choices[0];
  if(target)showPreview(target);else if(detail){title.textContent='No actions available';description.textContent='Your available actions will appear here.';art.replaceChildren();meta.hidden=true;action.disabled=true;}
 }
 previous.onclick=()=>{if(page>0){page--;render();}};next.onclick=()=>{if((page+1)*pageSize<visibleButtons().length){page++;render();}};
 const keydown=event=>{const available=visibleButtons(),index=available.indexOf(document.activeElement);if(index<0)return;let step=0;if(['ArrowRight','ArrowDown'].includes(event.key))step=1;if(['ArrowLeft','ArrowUp'].includes(event.key))step=-1;if(!step&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();let target=event.key==='Home'?0:event.key==='End'?available.length-1:index;
  for(let i=0;i<available.length;i++){if(step)target=(target+step+available.length)%available.length;if(!available[target].disabled)break;if(!step)target=event.key==='Home'?Math.min(target+1,available.length-1):Math.max(target-1,0);}
  if(available[target]?.disabled)return;page=Math.floor(target/pageSize);render();available[target].focus({preventScroll:true});};wheel.addEventListener('keydown',keydown);
 const sync=()=>{equipped.textContent=status?.textContent?.trim()||'Choose an action';};sync();
 const statusObserver=status?new MutationObserver(sync):null;statusObserver?.observe(status,{childList:true,subtree:true,characterData:true});
 const buttonObserver=new MutationObserver(render);
 function observe(){buttonObserver.disconnect();for(const button of buttons)buttonObserver.observe(button,{attributes:true,attributeFilter:['hidden','disabled','aria-pressed','title','data-pie-title','data-pie-description','data-pie-image','data-pie-meta','data-pie-action'],childList:true,subtree:true,characterData:true});}
 function attach(){buttons.forEach(button=>{button.classList.add('game-pie-choice');wheel.append(button);});observe();render();}attach();
 return {root,get buttons(){return buttons;},refresh:render,showPreview,reveal(button,{focus=false}={}){const index=visibleButtons().indexOf(button);if(index<0)return false;page=Math.floor(index/pageSize);render(button);if(focus&&!button.disabled)button.focus({preventScroll:true});return true;},setButtons(nextButtons){buttonObserver.disconnect();for(const button of buttons){button.classList.remove('game-pie-choice');delete button.dataset.pieHidden;container.append(button);}buttons=[...nextButtons];page=0;current=null;attach();},dispose(){disposed=true;statusObserver?.disconnect();buttonObserver.disconnect();wheel.removeEventListener('keydown',keydown);for(const event of ['pointermove','focusin','click'])wheel.removeEventListener(event,enter);buttons.forEach(button=>{button.classList.remove('game-pie-choice');delete button.dataset.pieHidden;button.style.removeProperty('--pie-x');button.style.removeProperty('--pie-y');container.append(button);});root.remove();}};
}
