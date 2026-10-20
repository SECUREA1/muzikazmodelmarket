const paths={menu:'M4 6h16M4 12h16M4 18h16',info:'M12 11v6m0-10v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',camera:'M3 7h11v10H3zM14 10l7-3v10l-7-3',sound:'M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8',close:'m6 6 12 12M18 6 6 18'};
const svg=name=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
export function mountArcadeDisplayControls({lobby}){
 const get=id=>document.getElementById(id),toolbar=document.createElement('div');toolbar.className='arcade-display-toolbar';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Arcade display controls');document.body.append(toolbar);
 const decorate=(button,icon,label)=>{const refresh=()=>{if(button.querySelector('svg'))return;const text=button.textContent.trim();if(icon==='sound'||!button.getAttribute('aria-label'))button.setAttribute('aria-label',text||label);button.title=button.getAttribute('aria-label');button.innerHTML=svg(icon);};refresh();new MutationObserver(refresh).observe(button,{childList:true});return button;};
 const popups=[];
 const popup=(title,nodes)=>{const dialog=document.createElement('dialog');dialog.className='arcade-display-popup';dialog.setAttribute('aria-label',title);const header=document.createElement('header'),heading=document.createElement('h2'),close=document.createElement('button');heading.textContent=title;close.type='button';close.innerHTML=svg('close');close.setAttribute('aria-label','Close '+title);close.onclick=()=>dialog.close();header.append(heading,close);dialog.append(header,...nodes.filter(Boolean));document.body.append(dialog);dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.addEventListener('cancel',event=>event.stopPropagation());popups.push(dialog);return dialog;};
 const park=popup('Explore the arcade',[document.querySelector('main .intro'),document.querySelector('main aside'),document.querySelector('.selection-heading'),get('attractions'),get('back-maps'),get('builder-link'),get('park-settings-button')]);
 const info=popup('Game controls and information',[get('instructions'),get('trigger-controls'),get('restart'),get('walk-help')]);
 const match=popup('Match lobby',[lobby]);
 const syncLobby=()=>{if(lobby.open&&!match.open){for(const panel of popups)if(panel!==match&&panel.open)panel.close();window.dispatchEvent(new Event('blur'));match.showModal();}else if(!lobby.open&&match.open)match.close();};new MutationObserver(syncLobby).observe(lobby,{attributes:true,attributeFilter:['open']});match.addEventListener('close',()=>{lobby.open=false;});
 const make=(name,label,open)=>{const button=document.createElement('button');button.type='button';button.innerHTML=svg(name);button.setAttribute('aria-label',label);button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.title=label;button.onclick=()=>{const panel=open();if(panel.open){panel.close();return;}for(const other of popups)if(other.open)other.close();if(panel===match)lobby.open=true;else{window.dispatchEvent(new Event('blur'));panel.showModal();}};toolbar.append(button);for(const panel of popups){const observer=new MutationObserver(()=>button.setAttribute('aria-expanded',String(panel.open&&panel===open())));observer.observe(panel,{attributes:true,attributeFilter:['open']});}return button;};
 make('menu','Arcade menu and match lobby',()=>document.body.classList.contains('playing')?match:park);make('info','Game controls and information',()=>info);
 for(const [id,icon,label]of [['camera-toggle','camera','Change camera'],['sound','sound','Toggle sound'],['closegame','close','Return to park']]){const button=get(id);if(button){decorate(button,icon,label);if(id==='closegame'){const exitGame=button.onclick;button.onclick=event=>{if(document.body.classList.contains('riding'))get('exitride').click();else exitGame?.call(button,event);};}toolbar.append(button);}}
 park.addEventListener('click',event=>{if(event.target.closest('#attractions button,#park-settings-button,#explore,#overview'))park.close();});
 const bodyObserver=new MutationObserver(()=>{if(!document.body.classList.contains('playing')){if(match.open)match.close();if(info.open)info.close();}});bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
 const dashboardHeader=document.querySelector('body>header'),dashboardFooter=document.querySelector('body>footer');
 dashboardHeader.classList.add('arcade-dashboard-header');dashboardFooter.classList.add('arcade-dashboard-footer');
 const heading=document.querySelector('#game .game-head'),score=document.querySelector('#game .scorebar');
 const live=document.createElement('div');live.className='arcade-dashboard-score';live.append(heading,score);dashboardHeader.append(live);
 const status=document.createElement('div');status.className='arcade-dashboard-status';
 for(const id of ['nearby','interact','feedback']){const node=get(id);if(node)status.append(node);}
 dashboardFooter.append(status,toolbar);
 const controller=document.querySelector('.muzikaz-controller');
 if(controller){const actions=controller.querySelector('.rad-controller-actions');if(actions)info.append(actions);dashboardFooter.append(controller);}
 const measure=()=>{document.documentElement.style.setProperty('--arcade-header-height',dashboardHeader.offsetHeight+'px');document.documentElement.style.setProperty('--arcade-footer-height',dashboardFooter.offsetHeight+'px');};
 const observer=new ResizeObserver(measure);observer.observe(dashboardHeader);observer.observe(dashboardFooter);
 document.body.classList.add('arcade-clear-display','arcade-dashboard');measure();syncLobby();
}
