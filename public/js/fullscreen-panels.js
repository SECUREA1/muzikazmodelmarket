// Native modal dialogs provide focus containment, Escape handling and inert
// background content. The existing panel owns its open/closed state.
export function fullscreenPanel(panel, { onOpen = () => {}, collapsed = false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'game-fullscreen-dialog';
  if(panel.id==='rad-tox-tools')dialog.classList.add('tools-pouch-screen');
  dialog.setAttribute('aria-label', panel.getAttribute('aria-label') || 'Game menu');
  panel.classList.add('game-fullscreen-content');
  dialog.append(panel);
  document.body.append(dialog);
  const close = document.createElement('button');
  close.type='button';close.className='game-fullscreen-close';close.textContent='Close ×';
  close.setAttribute('aria-label','Close '+dialog.getAttribute('aria-label'));
  const header=document.createElement('header');header.className='game-menu-header';
  const title=document.createElement('h2');title.textContent=panel.id==='rad-tox-tools'?'Tools':dialog.getAttribute('aria-label');
  header.append(title,close);dialog.prepend(header);
  const isVisible = () => !panel.hidden && (!collapsed || !panel.classList.contains('is-collapsed'));
  const hide = () => { if(collapsed)panel.classList.add('is-collapsed');else panel.hidden=true; };
  const sync = () => {
    if(isVisible() && !dialog.open){
      const host=document.fullscreenElement || document.body;
      if(dialog.parentElement!==host)host.append(dialog);
      onOpen();dialog.showModal();document.documentElement.classList.add('game-menu-open');
    } else if(!isVisible() && dialog.open)dialog.close();
  };
  close.addEventListener('click',hide);
  dialog.addEventListener('cancel',hide);
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('close',()=>{
    hide();
    if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('game-menu-open');
  });
  const observer=new MutationObserver(sync);
  observer.observe(panel,{attributes:true,attributeFilter:['hidden','class']});
  sync();
  return { dialog, sync, close:hide, disconnect:()=>observer.disconnect() };
}

export function organizeToolPicker(dialog) {
  const original=dialog.querySelector('h2'),close=dialog.querySelector('[data-weapons-close],[data-utility-close]');
  const header=document.createElement('header');header.className='game-menu-header';
  const title=document.createElement('h2');title.textContent=original?.textContent||dialog.getAttribute('aria-label');
  original?.classList.add('game-menu-original-title');
  if(close){close.classList.add('game-menu-close');close.textContent='Close ×';header.append(title,close);}else header.append(title);
  dialog.prepend(header);
}
