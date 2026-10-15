// Keep specialist builder, supply and admin controls while sharing public destinations.
(() => {
  const header = document.querySelector('.environment-topbar, .topbar, .masthead');
  if (!header) return;
  const toggle = document.createElement('button');
  toggle.type='button'; toggle.className='page-navigation-toggle';
  toggle.setAttribute('aria-label','Open navigation'); toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-controls','page-navigation');
  toggle.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Menu</span>';
  const nav=document.createElement('nav'); nav.id='page-navigation'; nav.className='page-navigation'; nav.hidden=true; nav.setAttribute('aria-label','Site navigation');
  for (const [href,label] of [['model-explorer.html?environment=public-commons&autoplay=1','Play public world'],['model-explorer.html#custom-item-library','Custom item library'],['model-market.html','Game marketplace'],['builder-market.html','Builder marketplace'],['environment-builder.html','Environment builder'],['members.html#world-atlas','Member maps and deeds'],['buy-mzk.html','Buy MZK'],['members.html','Account and Backpack']]) {
    const link=document.createElement('a'); link.href=href; link.textContent=label; nav.append(link);
  }
  const setOpen=(open,restore=false)=>{nav.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');if(restore)toggle.focus();};
  toggle.addEventListener('click',()=>setOpen(nav.hidden));
  nav.addEventListener('click',event=>{if(event.target.closest('a'))setOpen(false);});
  document.addEventListener('click',event=>{if(!nav.contains(event.target)&&!toggle.contains(event.target))setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!nav.hidden)setOpen(false,true);});
  header.append(toggle); document.body.append(nav);
  const position=()=>nav.style.setProperty('--page-navigation-top',Math.max(0,header.getBoundingClientRect().bottom)+'px');
  if(window.ResizeObserver)new ResizeObserver(position).observe(header);
  window.addEventListener('resize',position,{passive:true});window.addEventListener('scroll',position,{passive:true});position();
})();
