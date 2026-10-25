import {shortcutIcon} from './menu-shortcut-icons.js';
import {gameplayOverlayOpen} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';
// Settings remain native modals; map companions share input with the game.
// The existing panel owns its open/closed state in either presentation mode.
export function decorateMenuClose(button,label='Close menu'){
  if(!button)return;button.setAttribute('aria-label',label);button.title=label;button.innerHTML='<span class="game-menu-close-label">Close</span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';
}
export function fullscreenPanel(panel, { onOpen = () => {}, onClose = () => {}, collapsed = false, companion = false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'game-fullscreen-dialog';
  if(panel.id==='rad-tox-tools')dialog.classList.add('tools-pouch-screen');
  if(panel.id==='rad-build-menu')dialog.classList.add('builder-catalog-screen');
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
  header.append(title,close);
  // The builder provides its own compact sticky header and delegated close.
  if(panel.id!=='rad-build-menu')dialog.prepend(header);
  const isVisible = () => !panel.hidden && (!collapsed || !panel.classList.contains('is-collapsed'));
  const isCompanion=()=>typeof companion==='function'?companion()===true:companion===true;
  let wasOpen=false, returnFocus=null,companionMode=false;
  const hide = () => {
    if(collapsed)panel.classList.add('is-collapsed');else panel.hidden=true;
    if(dialog.open)dialog.close();
    if(panel.id)document.querySelectorAll?.('[aria-controls]').forEach(trigger=>{if((trigger.getAttribute('aria-controls')||'').split(/\s+/).includes(panel.id))trigger.setAttribute('aria-expanded','false');});
    if(!gameplayOverlayOpen())document.documentElement.classList.remove('game-menu-open');
    if(wasOpen){wasOpen=false;requestGameInputRelease('panel-close');onClose();if(returnFocus?.isConnected&&!gameplayOverlayOpen())returnFocus.focus({preventScroll:true});}
  };
  const sync = () => {
    const label=panel.getAttribute('aria-label')||'Game menu';dialog.setAttribute('aria-label',label);title.textContent=panel.id==='rad-tox-tools'?'Tools':label;close.setAttribute('aria-label','Close '+label);close.title='Close '+label;
    const nextCompanion=isCompanion(),changingMode=dialog.open&&nextCompanion!==companionMode;
    // A queued native close event must not hide a panel reopened immediately
    // in its other mode (for example Maps -> Backpack -> Maps).
    if(changingMode)dialog.close();
    companionMode=nextCompanion;dialog.dataset.gameplayBlocking=String(!companionMode);dialog.classList.toggle('game-companion-dialog',companionMode);dialog.setAttribute('aria-modal',String(!companionMode));
    if(isVisible() && !dialog.open){
      const host=document.fullscreenElement || document.body;
      if(dialog.parentElement!==host)host.append(dialog);
      if(!wasOpen)returnFocus=document.activeElement;
      document.querySelectorAll('dialog[open]').forEach(other=>{if(other!==dialog&&other.dataset.gameplayBlocking!=='false')other.close();});
      requestGameInputRelease(changingMode?'panel-mode-change':'panel-open');onOpen();if(companionMode)dialog.show();else dialog.showModal();wasOpen=true;
      if(panel.id)document.querySelectorAll?.('[aria-controls]').forEach(trigger=>{if((trigger.getAttribute('aria-controls')||'').split(/\s+/).includes(panel.id))trigger.setAttribute('aria-expanded','true');});
      if(companionMode){if(!gameplayOverlayOpen())document.documentElement.classList.remove('game-menu-open');}else document.documentElement.classList.add('game-menu-open');
    } else if(!isVisible() && dialog.open)hide();
  };
  close.addEventListener('click',hide);
  dialog.addEventListener('cancel',hide);
  dialog.addEventListener('keydown',event=>{
    if(!companionMode){event.stopPropagation();return;}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();return;}
    // Text editing and keyboard navigation already handled by a picker stay
    // local. Fresh game movement from ordinary map buttons remains usable.
    if(event.defaultPrevented||event.key==='Enter'||event.target.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'))event.stopPropagation();
  });
  dialog.addEventListener('close',()=>{
    if(dialog.open)return;
    hide();
    if(!gameplayOverlayOpen())document.documentElement.classList.remove('game-menu-open');
  });
  const observer=new MutationObserver(sync);
  observer.observe(panel,{attributes:true,attributeFilter:['hidden','class']});
  sync();
  return { dialog, sync, open(){panel.hidden=false;if(collapsed)panel.classList.remove('is-collapsed');sync();},close:hide, disconnect:()=>observer.disconnect() };
}

export function organizeToolPicker(dialog) {
  let wasOpen=dialog.open;
  const release=()=>{if(wasOpen===dialog.open)return;wasOpen=dialog.open;requestGameInputRelease(wasOpen?'tool-panel-open':'tool-panel-close');};
  new MutationObserver(release).observe(dialog,{attributes:true,attributeFilter:['open']});
  dialog.addEventListener('close',release);
  const original=dialog.querySelector('h2'),close=dialog.querySelector('[data-weapons-close],[data-utility-close]');
  const header=document.createElement('header');header.className='game-menu-header';
  const title=document.createElement('h2');title.textContent=original?.textContent||dialog.getAttribute('aria-label');
  original?.classList.add('game-menu-original-title');
  if(close){close.classList.add('game-menu-close');decorateMenuClose(close,'Close '+title.textContent);header.append(title,close);}else header.append(title);
  dialog.prepend(header);
}

