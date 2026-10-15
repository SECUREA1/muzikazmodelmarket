// Native modal dialogs provide focus containment, Escape handling and inert
// background content. The existing panel owns its open/closed state.
export function fullscreenPanel(panel, { onOpen = () => {}, collapsed = false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'game-fullscreen-dialog';
  dialog.setAttribute('aria-label', panel.getAttribute('aria-label') || 'Game menu');
  panel.classList.add('game-fullscreen-content');
  dialog.append(panel);
  document.body.append(dialog);
  const close = document.createElement('button');
  close.type='button';close.className='game-fullscreen-close';close.textContent='Close ×';
  close.setAttribute('aria-label','Close '+dialog.getAttribute('aria-label'));
  dialog.prepend(close);
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
