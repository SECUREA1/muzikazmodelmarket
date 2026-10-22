import {shortcutIcon} from './menu-shortcut-icons.js';
// Native modal dialogs provide focus containment, Escape handling and inert
// background content. The existing panel owns its open/closed state.
export function decorateMenuClose(button,label='Close menu'){
  if(!button)return;button.setAttribute('aria-label',label);button.title=label;button.innerHTML='<span class="game-menu-close-label">Close</span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
}
export function fullscreenPanel(panel, { onOpen = () => {}, onClose = () => {}, collapsed = false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'game-fullscreen-dialog';
  if(panel.id==='rad-tox-tools')dialog.classList.add('tools-pouch-screen');
  dialog.setAttribute('aria-label', panel.getAttribute('aria-label') || 'Game menu');
  panel.classList.add('game-fullscreen-content');
  dialog.append(panel);
  document.body.append(dialog);
  const close = document.createElement('button');
  close.type='button';close.className='game-fullscreen-close';close.textContent='Close ×';
  decorateMenuClose(close,'Close '+dialog.getAttribute('aria-label'));
  const header=document.createElement('header');header.className='game-menu-header';
  const title=document.createElement('h2');title.textContent=panel.id==='rad-tox-tools'?'Tools':dialog.getAttribute('aria-label');
  if(panel.id==='game-explorer-options')title.insertAdjacentHTML('afterbegin',shortcutIcon('settings'));
  header.append(title,close);dialog.prepend(header);
  const isVisible = () => !panel.hidden && (!collapsed || !panel.classList.contains('is-collapsed'));
  let wasOpen=false, returnFocus=null;
  const hide = () => {
    if(collapsed)panel.classList.add('is-collapsed');else panel.hidden=true;
    if(dialog.open)dialog.close();
    if(panel.id)document.querySelectorAll?.('[aria-controls]').forEach(trigger=>{if((trigger.getAttribute('aria-controls')||'').split(/\s+/).includes(panel.id))trigger.setAttribute('aria-expanded','false');});
    if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('game-menu-open');
    if(wasOpen){wasOpen=false;onClose();if(returnFocus?.isConnected&&!document.querySelector('dialog[open]'))returnFocus.focus({preventScroll:true});}
  };
  const sync = () => {
    const label=panel.getAttribute('aria-label')||'Game menu';dialog.setAttribute('aria-label',label);title.textContent=panel.id==='rad-tox-tools'?'Tools':label;close.setAttribute('aria-label','Close '+label);close.title='Close '+label;
    if(isVisible() && !dialog.open){
      const host=document.fullscreenElement || document.body;
      if(dialog.parentElement!==host)host.append(dialog);
      returnFocus=document.activeElement;
      document.querySelectorAll('dialog[open]').forEach(other=>{if(other!==dialog)other.close();});
      onOpen();dialog.showModal();wasOpen=true;
      if(panel.id)document.querySelectorAll?.('[aria-controls]').forEach(trigger=>{if((trigger.getAttribute('aria-controls')||'').split(/\s+/).includes(panel.id))trigger.setAttribute('aria-expanded','true');});document.documentElement.classList.add('game-menu-open');
    } else if(!isVisible() && dialog.open)hide();
  };
  close.addEventListener('click',hide);
  dialog.addEventListener('cancel',hide);
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('close',()=>{
    if(dialog.open)return;
    hide();
    if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('game-menu-open');
  });
  const observer=new MutationObserver(sync);
  observer.observe(panel,{attributes:true,attributeFilter:['hidden','class']});
  sync();
  return { dialog, sync, open(){panel.hidden=false;if(collapsed)panel.classList.remove('is-collapsed');sync();},close:hide, disconnect:()=>observer.disconnect() };
}

export function organizeToolPicker(dialog) {
  const original=dialog.querySelector('h2'),close=dialog.querySelector('[data-weapons-close],[data-utility-close]');
  const header=document.createElement('header');header.className='game-menu-header';
  const title=document.createElement('h2');title.textContent=original?.textContent||dialog.getAttribute('aria-label');
  original?.classList.add('game-menu-original-title');
  if(close){close.classList.add('game-menu-close');decorateMenuClose(close,'Close '+title.textContent);header.append(title,close);}else header.append(title);
  dialog.prepend(header);
}

