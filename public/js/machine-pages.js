// Shared screen navigation for live kiosks. Existing controls keep their listeners.
export function mountMachinePages(dialog){
 if(!document.querySelector('link[data-machine-pages-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/public/css/machine-pages.css';link.dataset.machinePagesStyle='';document.head.append(link);}
 const pages=[...dialog.querySelectorAll('[data-machine-page]')];
 const artwork=dialog.querySelector('.device-cabinet-art');
 const heading=dialog.querySelector('h2'),close=dialog.querySelector('[data-device-close]');
 const root=document.createElement('div');root.className='machine-shell';
 const header=document.createElement('header');header.className='machine-header';
 if(artwork)header.append(artwork);if(heading){heading.id='machine-page-title';dialog.setAttribute('aria-labelledby',heading.id);header.append(heading);}if(close){close.textContent='Back to scene';header.append(close);}root.append(header);
 const nav=document.createElement('nav');nav.className='machine-nav';nav.setAttribute('aria-label','Machine navigation');root.append(nav);
 const back=document.createElement('button');back.type='button';back.textContent='Machine menu';nav.append(back);
 const title=document.createElement('span');title.setAttribute('role','status');nav.append(title);
 const menu=document.createElement('section');menu.className='machine-menu';menu.setAttribute('aria-label','Choose a machine function');root.append(menu);
 function show(page){menu.hidden=Boolean(page);for(const p of pages)p.hidden=p!==page;back.hidden=!page;title.textContent=page?.dataset.machinePage||'Choose a function';(page?.querySelector('input,textarea,button')||menu.querySelector('button'))?.focus({preventScroll:true});}
 for(const page of pages){const button=document.createElement('button');button.type='button';button.textContent=page.dataset.machinePage;button.addEventListener('click',()=>show(page));menu.append(button);page.classList.add('machine-page');root.append(page);}
 // The session readout is always available from the menu, never placed below a form.
 const readout=dialog.querySelector('[data-device-status]');if(readout){const page=document.createElement('section');page.dataset.machinePage='Session';page.className='machine-page';page.append(readout);pages.push(page);const button=document.createElement('button');button.type='button';button.textContent='Session';button.addEventListener('click',()=>show(page));menu.append(button);root.append(page);}
 back.addEventListener('click',()=>show(null));
 const textPagers=[];
 for(const pre of root.querySelectorAll('[data-device-queue],[data-device-status]')){
  const output=document.createElement('p');output.className='machine-readout';pre.after(output);pre.hidden=true;
  const controls=document.createElement('div');controls.className='machine-pagination';output.after(controls);
  let index=0;const previous=document.createElement('button'),next=document.createElement('button'),count=document.createElement('output');previous.type=next.type='button';previous.textContent='Previous';next.textContent='Next';controls.append(previous,count,next);
  const update=()=>{const text=pre.textContent;const chunks=text.match(/[\s\S]{1,180}/g)||['No entries yet.'];index=Math.min(index,chunks.length-1);output.textContent=chunks[index];count.textContent=`${index+1} / ${chunks.length}`;previous.disabled=index===0;next.disabled=index===chunks.length-1;};
  previous.addEventListener('click',()=>{index--;update();});next.addEventListener('click',()=>{index++;update();});textPagers.push(update);
 }
 dialog.replaceChildren(root);dialog.classList.add('machine-pages-dialog');const fitted=pages.map(page=>{const body=document.createElement('div');body.className='machine-page-body';while(page.firstChild)body.append(page.firstChild);page.append(body);return fitMachineContent(page,body);});show(null);
 return {update(){textPagers.forEach(update=>update());},dispose(){fitted.forEach(item=>item.dispose());dialog.classList.remove('machine-pages-dialog');dialog.removeAttribute('aria-labelledby');root.remove();}};
}

// Fit the whole game surface, including its controls, into the current screen.
export function fitMachineContent(stage,content){
 let frame=0,alive=true;
 const fit=()=>{frame=0;if(!alive||!stage.clientHeight||!stage.clientWidth)return;content.style.transform='';const height=content.scrollHeight,width=content.scrollWidth,style=getComputedStyle(stage),availableHeight=stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),availableWidth=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);const scale=Math.min(1,(availableHeight-8)/Math.max(1,height),(availableWidth-8)/Math.max(1,width));content.style.transform=`scale(${Math.max(.1,scale)})`;};
 const schedule=()=>{if(!frame&&alive)frame=requestAnimationFrame(fit);};
 const observer=new ResizeObserver(schedule);observer.observe(stage);observer.observe(content);
 const changes=new MutationObserver(schedule);changes.observe(content,{childList:true,subtree:true,characterData:true});schedule();
 return {dispose(){alive=false;cancelAnimationFrame(frame);observer.disconnect();changes.disconnect();content.style.transform='';}};
}
