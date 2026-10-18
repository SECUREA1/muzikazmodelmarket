import {portalSector} from './portal-menu-art.js';
export function wheelPage(total,page,size=6){const pages=Math.max(1,Math.ceil(total/size)),current=Math.max(0,Math.min(pages-1,page));return {page:current,pages,start:current*size,end:Math.min(total,(current+1)*size)};}
export function gameplayOverlayOpen(root=document){
 return [...root.querySelectorAll('dialog[open],#crib-chat-panel:not([hidden]),[data-game-overlay]:not([hidden])')].some(node=>!node.hidden&&!node.closest('[hidden]')&&node.getClientRects().length>0);
}
export function loadGameMenuStyles(){if(document.querySelector('#game-menu-controls-styles'))return;const link=document.createElement('link');link.id='game-menu-controls-styles';link.rel='stylesheet';link.href='/public/css/game-menu-controls.css';document.head.append(link);}
export function mountToolsWheel(panel){
 loadGameMenuStyles();const content=panel.querySelector('.rad-tox-tools__content');if(!content)return;
 const buttons=[...content.children].filter(node=>node.matches('button.rad-tool-choice')&&!node.hasAttribute('data-flame-fire'));
 const toolbar=document.createElement('div');toolbar.className='game-menu-view-toggle';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Tools layout');
 const wheel=document.createElement('div');wheel.className='tools-pie';wheel.setAttribute('role','group');wheel.setAttribute('aria-label','Tools pouch radial menu');
 const center=document.createElement('div');center.className='tools-pie-center';center.textContent='TOOLS';wheel.append(center);
 const pages=document.createElement('div');pages.className='tools-pie-pages';let page=0,mode='wheel';
 try{mode=localStorage.getItem('muzikaz.tools.layout')==='tiles'?'tiles':'wheel';}catch{}
 const makeButton=(text,run,parent)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('click',run);parent.append(button);return button;};
 const radial=makeButton('◉ Pie',()=>{mode='wheel';save();render();},toolbar),tiles=makeButton('▦ Tiles',()=>{mode='tiles';save();render();},toolbar);
 const previous=makeButton('← Previous',()=>{page--;render();},pages),count=document.createElement('span');count.setAttribute('role','status');pages.append(count);const next=makeButton('Next →',()=>{page++;render();},pages);
 const marker=document.createElement('span');marker.hidden=true;content.prepend(marker);panel.insertBefore(toolbar,content);panel.insertBefore(wheel,content);panel.insertBefore(pages,content);
 function save(){try{localStorage.setItem('muzikaz.tools.layout',mode);}catch{}}
 function render(){const slice=wheelPage(buttons.length,page);page=slice.page;radial.setAttribute('aria-pressed',String(mode==='wheel'));tiles.setAttribute('aria-pressed',String(mode==='tiles'));panel.dataset.toolsView=mode;wheel.hidden=pages.hidden=mode!=='wheel';
  buttons.forEach((button,index)=>{if(mode==='tiles'){button.hidden=false;button.classList.remove('tools-pie-choice');button.querySelector('.tools-pie-face')?.remove();content.insertBefore(button,marker);return;}
   button.hidden=index<slice.start||index>=slice.end;button.classList.add('tools-pie-choice');const sector=portalSector(index-slice.start);button.style.setProperty('--pie-x',sector.x+'%');button.style.setProperty('--pie-y',sector.y+'%');
   if(!button.querySelector('.tools-pie-face')){const face=document.createElementNS('http://www.w3.org/2000/svg','svg');face.setAttribute('viewBox','0 0 100 100');face.classList.add('tools-pie-face');face.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');face.append(path);button.prepend(face);}button.querySelector('.tools-pie-face path').setAttribute('d',sector.path);wheel.append(button);
  });previous.disabled=page===0;next.disabled=page===slice.pages-1;count.textContent=(page+1)+' / '+slice.pages;
 }
 wheel.addEventListener('keydown',event=>{const visible=buttons.filter(button=>!button.hidden),index=visible.indexOf(document.activeElement),delta={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];if(index<0||!delta)return;event.preventDefault();visible[(index+delta+visible.length)%visible.length].focus();});
 render();
}

export function mountBottomHud(stage,{menu,actions,prompt,status,connection,balance}){
 loadGameMenuStyles();
 const stack=document.createElement('div');stack.className='game-bottom-hud';
 const row=document.createElement('div');row.className='game-bottom-hud__controls';
 if(menu)row.append(menu);if(prompt)row.append(prompt);
 if(actions)stack.append(actions);stack.append(row);
 for(const node of [status,connection,balance])if(node)stack.append(node);
 stage.append(stack);return stack;
}
